/**
 * Pre-fetch + formatting helpers for the Managed Agents path (plan §7.1,
 * Step 8). The Managed runtime is intentionally tool-less ("prompt-as-context,
 * not agent-as-runtime") — the server pre-decides what to look up, packs the
 * formatted context into the user message, and lets the agent emit one
 * structured diff.
 *
 * Right now this exports `buildConnectorContext`; Cartographer's variant
 * lands in Step 9.
 */
import { ECG_TAXONOMY, type EcgTaxonomyEntry } from '~/data/ecg-taxonomy'
import {
  VIPS_DIMENSIONS,
  VIPS_TAXONOMY,
  type VipsDimension,
  type VipsTaxonomyEntry,
} from '~/data/vips-taxonomy'
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
 * Caller must be inside a `withStudent` envelope so the underlying queries
 * are tenant-scoped (today via the application-level helper, post-Step 2
 * via Postgres RLS).
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
export function buildConnectorContext(studentId: string, newReflectionId: number): string {
  const mirror = getMirrorEntry(studentId, newReflectionId)
  if (!mirror) {
    throw new Error(
      `buildConnectorContext: mirror entry ${newReflectionId} is not visible under student ${studentId}.`,
    )
  }

  const pastMirrors = searchMirrors(studentId, mirror.story_reframe, {
    limit: CONNECTOR_FTS_LIMIT + 1,
  })
    .filter((row) => row.id !== newReflectionId)
    .slice(0, CONNECTOR_FTS_LIMIT)

  const pages = listVipsPages(studentId)
  const timeline = VIPS_DIMENSIONS.flatMap((dim) =>
    listVipsTimelineEntries(studentId, dim, { includeForgotten: false }),
  )

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
    TASK_FOOTER,
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

function formatRecentReflectionsBlock(pastMirrors: MirrorSearchResult[]): string {
  if (pastMirrors.length === 0) {
    return '# Recent reflections (FTS top 5 over past mirrors)\n\n(none)'
  }
  const lines = pastMirrors.map((row) => {
    const excerpt =
      row.story_reframe.length > 280 ? `${row.story_reframe.slice(0, 280)}…` : row.story_reframe
    return `- [#${row.id}, score=${row.score.toFixed(3)}, ${row.created_at}]: ${excerpt}`
  })
  return `# Recent reflections (FTS top 5 over past mirrors)\n\n${lines.join('\n')}`
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
            .map(
              (e) =>
                `- [${e.canonical_claim_id}] (${e.strength}, parallax=${JSON.stringify(e.parallax_tag)}) "${e.verbatim_quote}"`,
            )
            .join('\n')}`,
    ].join('\n')
  }).join('\n\n')

  return `# Current VIPS pages\n\n${dimBlocks}`
}

const TASK_FOOTER =
  '# Task\n\nProduce a ConnectorDiffSchema-shaped proposal. Cite verbatim quotes from the transcript above only. Do NOT emit `reinforces_id`, `partial_match`, `aspirational`, or `parallax_cap_reason` — those are computed by the verifier post-hoc.'
