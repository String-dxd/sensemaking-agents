/**
 * U7 — Auto-Connector chain that runs after every successful `persistMirror`.
 *
 * Orchestration (no LLM call in tests; deps stubs the agent):
 *   1. Read the student's existing VIPS pages + non-forgotten timeline
 *      entries via `withStudent`.
 *   2. Format the prompt context (new mirror entry + its context_type +
 *      page snapshots).
 *   3. Call the Connector (real or stubbed via `deps.runConnector`). Race
 *      against a 30s soft budget.
 *   4. Parse against `ConnectorDiffSchema`; malformed JSON → `schema_reject`.
 *   5. Flatten the per-dimension diffs into one verifier-shaped
 *      `timeline_entries` list and hand to the verifier (U6).
 *   6. Persist the diff + verifier annotations to `vips_proposed_diffs`
 *      with `status='pending'`; return the staged row to the caller.
 *
 * Mirror reflection is NEVER blocked by Connector failure (A11) — the
 * `persistMirror` handler already inserted the mirror entry before invoking
 * this chain. On every failure mode the staged-diff row is simply omitted;
 * the mirror entry is intact.
 */
import { run } from '@openai/agents'
import { createConnectorAgent } from '~/agents/connector'
import {
  type ConnectorDiffDraft,
  ConnectorDiffSchema,
  type ConnectorDimension,
} from '~/agents/schemas'
import type {
  ProposedTimelineEntryDraft,
  VerifierExistingTimelineEntry,
  VerifierMirrorEntry,
  VerifierResult,
} from '~/agents/tools/schemas'
import { verifyProposedDiff } from '~/agents/verifier'
import {
  getMirrorEntry,
  insertVipsProposedDiff,
  listVipsPages,
  listVipsProposedDiffs,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsProposedDiffRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

/** 30s soft budget per plan Approach ("Wall-clock budget: 30s soft timeout"). */
export const AUTO_CONNECTOR_TIMEOUT_MS = 30_000

const VIPS_DIMENSIONS: ConnectorDimension[] = ['values', 'interests', 'personality', 'skills']

/**
 * Auto-Connector status values surfaced to the caller (and to the UI via
 * `persistMirror`'s response). Closed enum so U8's review surface can
 * render specific copy per outcome.
 *
 * - `ok`: Connector ran, output parsed, verifier ran, diff staged.
 * - `queued`: R30 — a prior `status='pending'` row exists; new run skipped.
 * - `timeout`: Connector did not return inside `AUTO_CONNECTOR_TIMEOUT_MS`.
 * - `schema_reject`: Connector returned malformed JSON OR raised an
 *   exception. The mirror entry is still persisted (A11).
 * - `missing_mirror`: Defensive — caller passed a mirror_entry_id that is
 *   not visible under `withStudent(studentId)`. Should not happen in
 *   practice because `persistMirror` invokes this with the row it just
 *   inserted.
 */
export type AutoConnectorStatus = 'ok' | 'queued' | 'timeout' | 'schema_reject' | 'missing_mirror'

export interface AutoConnectorResult {
  status: AutoConnectorStatus
  staged_diff: VipsProposedDiffRow | null
  /** Present when status is 'queued' — the prior pending diff id. */
  pending_diff_id?: number
}

export interface AutoConnectorDeps {
  /**
   * Test seam: bypass the SDK and return a pre-baked Connector draft. When
   * omitted, the handler invokes the real `createConnectorAgent` via
   * `@openai/agents`' `run`.
   */
  runConnector?: (input: {
    studentId: string
    mirrorEntry: VerifierMirrorEntry
    pages: VipsPageRow[]
    timeline: VipsTimelineEntryRow[]
  }) => Promise<unknown>
  /**
   * Test seam: bypass `verifyProposedDiff`. Real callers leave this
   * undefined and the deterministic U6 verifier runs.
   */
  verify?: (input: {
    diff: { timeline_entries: ProposedTimelineEntryDraft[] }
    mirrorEntry: VerifierMirrorEntry
    existingTimelineEntries: VerifierExistingTimelineEntry[]
  }) => VerifierResult
}

export async function runAutoConnectorAfterMirror(
  studentId: string,
  mirrorEntryId: number,
  deps: AutoConnectorDeps = {},
): Promise<AutoConnectorResult> {
  return withStudent(studentId, async (sid) => {
    // ── R30 pending-queue rule — check BEFORE invoking the agent. ──
    const existingPending = listVipsProposedDiffs(sid, { status: 'pending' })
    if (existingPending.length > 0) {
      const prior = existingPending[0]
      return {
        status: 'queued' as const,
        staged_diff: null,
        ...(prior ? { pending_diff_id: prior.id } : {}),
      }
    }

    const mirror = getMirrorEntry(sid, mirrorEntryId)
    if (!mirror) return { status: 'missing_mirror', staged_diff: null }

    const mirrorProjection: VerifierMirrorEntry = {
      id: mirror.id,
      transcript: mirror.transcript,
      context_type: mirror.context_type,
    }

    const pages = listVipsPages(sid)
    const timeline = VIPS_DIMENSIONS.flatMap((dim) =>
      listVipsTimelineEntries(sid, dim, { includeForgotten: false }),
    )

    // ── Step 3: invoke Connector with a soft 30s timeout. ──
    let rawDraft: unknown
    try {
      rawDraft = await raceWithTimeout(
        deps.runConnector !== undefined
          ? deps.runConnector({
              studentId: sid,
              mirrorEntry: mirrorProjection,
              pages,
              timeline,
            })
          : runConnectorViaSdk({
              studentId: sid,
              mirrorEntry: mirrorProjection,
              pages,
              timeline,
            }),
        AUTO_CONNECTOR_TIMEOUT_MS,
      )
    } catch (err) {
      if (err instanceof AutoConnectorTimeoutError) {
        return { status: 'timeout', staged_diff: null }
      }
      // Any other thrown error (LLM transport, JSON parse upstream, etc.)
      // is treated as schema_reject — the mirror entry is intact regardless.
      return { status: 'schema_reject', staged_diff: null }
    }

    // ── Step 4: parse against ConnectorDiffSchema. ──
    const parsed = ConnectorDiffSchema.safeParse(rawDraft)
    if (!parsed.success) {
      return { status: 'schema_reject', staged_diff: null }
    }
    const draft: ConnectorDiffDraft = parsed.data

    // ── Step 5: flatten + verify. ──
    const flatEntries: ProposedTimelineEntryDraft[] = flattenDiff(draft)
    const verifierInput = {
      diff: { timeline_entries: flatEntries },
      mirrorEntry: mirrorProjection,
      existingTimelineEntries: timeline.map(toVerifierExisting),
    }
    const verifierResult =
      deps.verify !== undefined ? deps.verify(verifierInput) : verifyProposedDiff(verifierInput)

    // ── Step 6: persist staged diff (status='pending'). ──
    // Payload carries BOTH the agent's full per-dimension diff (compiled-
    // truth + open_question) AND the verifier's admitted/downgraded/dropped
    // partitions, so the U8 review surface has one row to render from.
    const payload = {
      diffs: draft.diffs,
      admitted: verifierResult.admitted,
      downgraded: verifierResult.downgraded,
      dropped: verifierResult.dropped,
    }
    const stagedRow = insertVipsProposedDiff(sid, {
      mirror_entry_id: mirror.id,
      payload,
      verifier_result: verifierResult,
    })

    return { status: 'ok', staged_diff: stagedRow }
  })
}

/**
 * Flatten the per-dimension diff into one `ProposedTimelineEntryDraft[]`
 * the verifier consumes. Each entry's `dimension` is set from the diff key
 * (the agent never emits it as a free-text field — the structural Zod
 * shape pins it).
 */
function flattenDiff(draft: ConnectorDiffDraft): ProposedTimelineEntryDraft[] {
  const out: ProposedTimelineEntryDraft[] = []
  for (const dim of VIPS_DIMENSIONS) {
    const dimDiff = draft.diffs[dim]
    for (const entry of dimDiff.new_timeline_entries) {
      out.push({
        dimension: dim,
        canonical_claim_id: entry.canonical_claim_id,
        verbatim_quote: entry.verbatim_quote,
        reflection_id: entry.reflection_id,
        strength: entry.strength,
        parallax_tag: entry.parallax_tag,
      })
    }
  }
  return out
}

/**
 * Project a stored `VipsTimelineEntryRow` to the verifier's minimal shape.
 * Forgotten rows are already filtered out by `listVipsTimelineEntries`'
 * default (`includeForgotten: false`).
 */
function toVerifierExisting(row: VipsTimelineEntryRow): VerifierExistingTimelineEntry {
  return {
    id: row.id,
    dimension: row.dimension,
    canonical_claim_id: row.canonical_claim_id,
    parallax_tag: row.parallax_tag,
    forgotten_at: row.forgotten_at,
    committed_at: row.committed_at,
  }
}

class AutoConnectorTimeoutError extends Error {
  constructor() {
    super('auto-connector exceeded soft timeout')
    this.name = 'AutoConnectorTimeoutError'
  }
}

function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new AutoConnectorTimeoutError()), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function runConnectorViaSdk(input: {
  studentId: string
  mirrorEntry: VerifierMirrorEntry
  pages: VipsPageRow[]
  timeline: VipsTimelineEntryRow[]
}): Promise<unknown> {
  const agent = createConnectorAgent({ studentId: input.studentId })
  const prompt = formatConnectorPromptContext(input)
  const result = await run(agent, prompt)
  return result.finalOutput
}

/**
 * Format the prompt context the Connector receives alongside its system
 * prompt. Includes the new mirror reflection, its context_type, the four
 * VIPS pages' current state, and the non-forgotten timeline (grouped by
 * dimension). The Connector's prompt body covers the rest.
 *
 * Exported for direct unit testing in case the format needs to be diffed
 * against a snapshot fixture; the auto-connector tests stub `runConnector`
 * so they don't exercise this path.
 */
export function formatConnectorPromptContext(input: {
  mirrorEntry: VerifierMirrorEntry
  pages: VipsPageRow[]
  timeline: VipsTimelineEntryRow[]
}): string {
  const { mirrorEntry, pages, timeline } = input

  const pagesBlock = VIPS_DIMENSIONS.map((dim) => {
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

  return `# New Mirror reflection #${mirrorEntry.id} (context_type=${mirrorEntry.context_type})

Transcript:
${mirrorEntry.transcript}

# Current VIPS pages

${pagesBlock}

Produce a ConnectorDiffSchema-shaped proposal. Cite verbatim quotes from the transcript above only.`
}
