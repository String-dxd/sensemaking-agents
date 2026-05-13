/**
 * Pre-fetch + formatting helpers for the Managed Agents path (plan §7.1,
 * Steps 8 + 9). The Managed runtime is intentionally tool-less
 * ("prompt-as-context, not agent-as-runtime") — the server pre-decides what
 * to look up, packs the formatted context into the user message, and lets
 * the agent emit one structured output.
 *
 * Connector (Step 8) and Cartographer (Step 9) share the same inlined-
 * taxonomy + FTS-corpus + VIPS-state shape. Cartographer's pre-fetch is
 * broader: the FTS query expands beyond the new reflection to also cover
 * each VIPS page's `open_question`, deduped, because Cartographer's
 * long-horizon synthesis needs wider recall than Connector's per-reflection
 * diff.
 *
 * Both builders REQUIRE a TenantContext (the caller's outer `withStudent`
 * transaction). The inner queries reuse `ctx.db` so they participate in the
 * same RLS-bound transaction instead of opening a fresh `withStudent`
 * envelope per call — opening N child envelopes from inside an outer one
 * checks out N+1 pool connections, which at `DATABASE_POOL_MAX=5` and ≥5
 * concurrent runs deadlocks every request waiting on the pool.
 */
import { ECG_TAXONOMY, type EcgTaxonomyEntry } from '~/data/ecg-taxonomy'
import {
  VIPS_DIMENSIONS,
  VIPS_TAXONOMY,
  type VipsDimension,
  type VipsTaxonomyEntry,
} from '~/data/vips-taxonomy'
import type { TenantContext } from '~/db/client'
import {
  getMirrorEntry,
  listVipsPages,
  listVipsTimelineEntries,
  type MirrorSearchResult,
  searchMirrors,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'

/** Top-N FTS-matching past mirrors packed into Connector's prompt context. */
export const CONNECTOR_FTS_LIMIT = 5

/**
 * Top-N FTS-matching past mirrors packed into Cartographer's prompt context.
 * Cartographer runs FTS against the new reflection's content AND each VIPS
 * page's `open_question`; the unioned, deduped result is capped at this
 * limit. Larger than Connector's limit because Cartographer's job is
 * long-horizon synthesis, not per-reflection diff (plan §7.1).
 */
export const CARTOGRAPHER_FTS_LIMIT = 12

export interface ConnectorContextPayload {
  mirror: {
    id: number
    transcript: string
    story_reframe: string
    context_type: string
  }
  pastMirrors: MirrorSearchResult[]
  pages: VipsPageRow[]
  timeline: VipsTimelineEntryRow[]
}

/**
 * Pre-fetch every piece of context Connector's Managed Agents invocation
 * needs, then format it as a single user-message string.
 *
 * Caller MUST be inside a `withStudent` envelope and pass `ctx` so the
 * underlying queries are tenant-scoped (RLS) AND reuse the outer
 * transaction's pool checkout (no nested checkouts → no pool starvation).
 *
 * The format is content-equivalent to `formatConnectorPromptContext` in
 * `src/server/auto-connector.handler.server.ts` (the legacy OpenAI path),
 * extended with:
 *
 *   - Top-N FTS-matching past mirrors over `story_reframe` (replaces the
 *     `search_past_mirrors` tool — the agent no longer decides what to look
 *     up; the server pre-fetches the corpus).
 *   - Inlined VIPS + ECG taxonomies (replaces `lookup_vips_taxonomy` and
 *     `lookup_ecg_taxonomy` — the closed vocabularies are small enough to
 *     pack into every prompt and benefit from prompt-cache hits).
 */
export async function buildConnectorContext(
  ctx: TenantContext,
  newReflectionId: number,
): Promise<string> {
  const { studentId } = ctx
  const mirror = await getMirrorEntry(studentId, newReflectionId, { ctx })
  if (!mirror) {
    throw new Error(
      `buildConnectorContext: mirror entry ${newReflectionId} is not visible under student ${studentId}.`,
    )
  }

  const pastMirrorsRaw = await searchMirrors(studentId, mirror.story_reframe, {
    limit: CONNECTOR_FTS_LIMIT + 1,
    ctx,
  })
  const pastMirrors = pastMirrorsRaw
    .filter((row) => row.id !== newReflectionId)
    .slice(0, CONNECTOR_FTS_LIMIT)

  const pages = await listVipsPages(studentId, { ctx })
  const timelineByDim = await Promise.all(
    VIPS_DIMENSIONS.map((dim) =>
      listVipsTimelineEntries(studentId, dim, { includeForgotten: false, ctx }),
    ),
  )
  const timeline: VipsTimelineEntryRow[] = timelineByDim.flat()

  return formatConnectorContext({
    mirror: {
      id: mirror.id,
      transcript: mirror.transcript,
      story_reframe: mirror.story_reframe,
      context_type: mirror.context_type,
    },
    pastMirrors,
    pages,
    timeline,
  })
}

/**
 * Pure formatter — exported so unit tests can pin the layout against a
 * snapshot without touching the DB. The "Inlined taxonomies" prefix is
 * deterministic so prompt caching on the Anthropic side recognizes a
 * stable cache key.
 */
export function formatConnectorContext(input: ConnectorContextPayload): string {
  return [
    formatVipsTaxonomyBlock(),
    formatEcgTaxonomyBlock(),
    formatNewReflectionBlock(input.mirror),
    formatRecentReflectionsBlock(input.pastMirrors),
    formatVipsPagesBlock(input.pages, input.timeline),
    CONNECTOR_TASK_FOOTER,
  ].join('\n\n')
}

// ── Cartographer ─────────────────────────────────────────────────────────

export interface CartographerContextPayload {
  studentId: string
  pages: VipsPageRow[]
  timeline: VipsTimelineEntryRow[]
  pastMirrors: MirrorSearchResult[]
}

/**
 * Pre-fetch every piece of context Cartographer's Managed Agents invocation
 * needs, then format it as a single user-message string.
 *
 * Caller MUST be inside a `withStudent` envelope and pass `ctx` so the
 * underlying queries are tenant-scoped (RLS) AND reuse the outer
 * transaction's pool checkout (no nested checkouts → no pool starvation).
 *
 * The corpus selection compensates for the loss of dynamic agent-side search
 * (`search_past_mirrors` is no longer bound as a tool — plan §7.1). Cartographer
 * runs FTS against each VIPS page's `open_question` text, unions the results,
 * dedups by mirror id, and caps at `CARTOGRAPHER_FTS_LIMIT`. Pages with empty
 * `open_question` are skipped (no useful FTS signal). If every page's
 * open_question is empty, the FTS list is empty and the agent still has the
 * inlined taxonomies + the pages + timeline to work from.
 */
export async function buildCartographerContext(ctx: TenantContext): Promise<string> {
  const { studentId } = ctx
  const pages = await listVipsPages(studentId, { ctx })
  const timelineByDim = await Promise.all(
    VIPS_DIMENSIONS.map((dim) =>
      listVipsTimelineEntries(studentId, dim, { includeForgotten: false, ctx }),
    ),
  )
  const timeline: VipsTimelineEntryRow[] = timelineByDim.flat()

  const queries = pages.map((p) => p.open_question.trim()).filter((q) => q.length > 0)

  const seen = new Map<number, MirrorSearchResult>()
  for (const query of queries) {
    // Pull a bit more than the cap per-query; the union+dedup may overshoot.
    const matches = await searchMirrors(studentId, query, {
      limit: CARTOGRAPHER_FTS_LIMIT,
      ctx,
    })
    for (const row of matches) {
      if (!seen.has(row.id)) seen.set(row.id, row)
    }
  }

  const pastMirrors = Array.from(seen.values())
    .sort((a, b) => a.score - b.score) // searchMirrors returns ascending bm25 (more-negative = better)
    .slice(0, CARTOGRAPHER_FTS_LIMIT)

  return formatCartographerContext({ studentId, pages, timeline, pastMirrors })
}

/**
 * Pure formatter — exported so unit tests can pin the layout against a
 * snapshot without touching the DB. Same cache-friendly inlined-taxonomy
 * prefix as Connector; per-request suffix carries Cartographer's pages +
 * recent-FTS + timeline + task footer.
 */
export function formatCartographerContext(input: CartographerContextPayload): string {
  return [
    formatVipsTaxonomyBlock(),
    formatEcgTaxonomyBlock(),
    `# Trajectory pass for student ${input.studentId}`,
    formatVipsPagesBlock(input.pages, input.timeline),
    formatRecentReflectionsBlock(input.pastMirrors, {
      heading: `# Recent reflections (FTS top ${CARTOGRAPHER_FTS_LIMIT} over past mirrors, queried by VIPS open questions)`,
    }),
    CARTOGRAPHER_TASK_FOOTER,
  ].join('\n\n')
}

// ── Stable inlined blocks (cache-friendly prefix) ────────────────────────

function formatVipsTaxonomyBlock(): string {
  const byDim = new Map<VipsDimension, VipsTaxonomyEntry[]>()
  for (const entry of VIPS_TAXONOMY) {
    const existing = byDim.get(entry.dimension) ?? []
    existing.push(entry)
    byDim.set(entry.dimension, existing)
  }

  const dims = VIPS_DIMENSIONS.map((dim) => {
    const entries = byDim.get(dim) ?? []
    const lines = entries.map((entry) => {
      const indicators = entry.behavioral_indicators.join('; ')
      return `- ${entry.id}: ${entry.label} — ${entry.definition}\n  Indicators: ${indicators}`
    })
    return `## ${dim}\n${lines.join('\n')}`
  }).join('\n\n')

  return `# Inlined VIPS taxonomy (closed canonical claim IDs)\n\n${dims}`
}

function formatEcgTaxonomyBlock(): string {
  const byCategory = new Map<EcgTaxonomyEntry['category'], EcgTaxonomyEntry[]>()
  for (const entry of ECG_TAXONOMY) {
    const existing = byCategory.get(entry.category) ?? []
    existing.push(entry)
    byCategory.set(entry.category, existing)
  }

  const categories: Array<EcgTaxonomyEntry['category']> = ['subject', 'cca', 'pathway', 'cluster']
  const sections = categories
    .map((cat) => {
      const entries = byCategory.get(cat) ?? []
      if (entries.length === 0) return null
      const lines = entries.map((entry) => `- ${entry.id}: ${entry.label} — ${entry.description}`)
      return `## ${cat}\n${lines.join('\n')}`
    })
    .filter((s): s is string => s !== null)
    .join('\n\n')

  return `# Inlined ECG taxonomy (closed SG-context IDs)\n\n${sections}`
}

// ── Per-request blocks (variable suffix) ─────────────────────────────────

function formatNewReflectionBlock(mirror: ConnectorContextPayload['mirror']): string {
  return [
    `# New Mirror reflection #${mirror.id} (context_type=${mirror.context_type})`,
    '',
    'Transcript:',
    mirror.transcript,
    '',
    "Story reframe (Mirror's reflection):",
    mirror.story_reframe,
  ].join('\n')
}

function formatRecentReflectionsBlock(
  pastMirrors: MirrorSearchResult[],
  options: { heading?: string } = {},
): string {
  const heading = options.heading ?? '# Recent reflections (FTS top 5 over past mirrors)'
  if (pastMirrors.length === 0) {
    return `${heading}\n\n(none)`
  }
  const lines = pastMirrors.map((row) => {
    const excerpt =
      row.story_reframe.length > 280 ? `${row.story_reframe.slice(0, 280)}…` : row.story_reframe
    return `- [#${row.id}, score=${row.score.toFixed(3)}, ${row.created_at}]: ${excerpt}`
  })
  return `${heading}\n\n${lines.join('\n')}`
}

function formatVipsPagesBlock(pages: VipsPageRow[], timeline: VipsTimelineEntryRow[]): string {
  const dimBlocks = VIPS_DIMENSIONS.map((dim) => {
    const page = pages.find((p) => p.dimension === dim)
    const entriesForDim = timeline.filter((e) => e.dimension === dim)
    return [
      `## ${dim.toUpperCase()}`,
      page
        ? `Compiled truth: ${page.compiled_truth}\nOpen question: ${page.open_question}`
        : 'Compiled truth: (empty)\nOpen question: (empty)',
      entriesForDim.length === 0
        ? 'Existing timeline entries: (none)'
        : `Existing timeline entries:\n${entriesForDim
            .map(formatTimelineEntryForPrompt)
            .join('\n')}`,
    ].join('\n')
  }).join('\n\n')

  return `# Current VIPS pages\n\n${dimBlocks}`
}

function formatTimelineEntryForPrompt(entry: VipsTimelineEntryRow): string {
  const reflectionId = entry.reflection_id === null ? 'null' : String(entry.reflection_id)
  const reinforcesId = entry.reinforces_id === null ? 'null' : String(entry.reinforces_id)
  return [
    `- entry_id=${entry.id}`,
    `source_reflection_id=${reflectionId}`,
    `canonical_claim_id=${entry.canonical_claim_id}`,
    `strength=${entry.strength}`,
    `parallax=${JSON.stringify(entry.parallax_tag)}`,
    `reinforces_id=${reinforcesId}`,
    `quote="${entry.verbatim_quote}"`,
  ].join(' ')
}

const CONNECTOR_TASK_FOOTER =
  '# Task\n\nProduce a ConnectorDiffSchema-shaped proposal. Cite verbatim quotes from the transcript above only. Do NOT emit `reinforces_id`, `partial_match`, `aspirational`, or `parallax_cap_reason` — those are computed by the verifier post-hoc.'

const CARTOGRAPHER_TASK_FOOTER =
  '# Task\n\nProduce a CartographerOutputSchema-shaped Trajectory page. `trait_combination[].claim_id` MUST appear as a `canonical_claim_id` on one of the current timeline entries above. Include `trait_combination[].timeline_entry_id` whenever the claim refers to a specific current timeline `entry_id`. `ecg_region_tags[]` MUST be cluster-level IDs (`cluster.*`) from the inlined ECG taxonomy. Return 2–5 pathways.'
