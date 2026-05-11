/**
 * U8 — Confirm a single staged-diff entry. Inserts the entry into
 * `vips_timeline_entries`, upserts the dimension's `vips_pages` row on
 * first confirm in that dimension within this batch, marks the entry
 * `resolved: 'confirmed'` inside the staging row's payload, and (when
 * the batch is fully resolved) flips the staging row's status to
 * `'confirmed'` + stamps `reviewed_at`.
 *
 * All DB writes are wrapped in one `better-sqlite3` transaction so the
 * timeline insert + page upsert + payload mutation + (possibly) status
 * flip succeed or fail atomically.
 *
 * Wrapped in `withStudent` so the diff lookup, timeline insert, and
 * page upsert all share the same tenancy boundary.
 */
import { z } from 'zod'
import { openDb } from '~/db/client'
import {
  getVipsProposedDiff,
  insertVipsTimelineEntry,
  updateVipsProposedDiffPayload,
  updateVipsProposedDiffStatus,
  upsertVipsPage,
  type VipsProposedDiffRow,
} from '~/db/queries'
import {
  allEntriesResolved,
  buildReviewEntryId,
  parseReviewPayload,
  type ReviewableAnnotatedEntry,
  type ReviewPayload,
} from '~/server/review-payload-shape'
import { withStudent } from '~/server/tenancy.server'

export const confirmDiffInputSchema = z.object({
  studentId: z.string().min(1),
  diffId: z.number().int().positive(),
  /** Stable per-entry handle — see `buildReviewEntryId`. */
  entryId: z.string().min(1),
})

export type ConfirmDiffInput = z.output<typeof confirmDiffInputSchema>

export class ConfirmDiffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfirmDiffError'
  }
}

export interface ConfirmDiffResult {
  diff: VipsProposedDiffRow
}

export function confirmDiffHandler(data: ConfirmDiffInput): ConfirmDiffResult {
  const parsed = confirmDiffInputSchema.parse(data)
  return withStudent(parsed.studentId, (sid) => {
    const db = openDb()
    return db.transaction(() => {
      const row = getVipsProposedDiff(sid, parsed.diffId, { ctx: { db } })
      if (!row) throw new ConfirmDiffError(`Staged diff ${parsed.diffId} not found`)
      if (row.status !== 'pending') {
        throw new ConfirmDiffError(
          `Staged diff ${parsed.diffId} is not pending (status=${row.status})`,
        )
      }

      const payload = parseReviewPayload(row.payload)
      const located = locateEntry(payload, parsed.entryId)
      if (!located) {
        throw new ConfirmDiffError(`Entry ${parsed.entryId} not found in diff ${parsed.diffId}`)
      }
      const { entry, list } = located
      if (entry.resolved === 'confirmed') {
        throw new ConfirmDiffError(`Entry ${parsed.entryId} is already confirmed`)
      }
      if (entry.resolved === 'forgotten') {
        throw new ConfirmDiffError(`Entry ${parsed.entryId} was already forgotten`)
      }

      const dimension = entry.dimension
      // First confirm in this dimension within this batch? If yes, upsert
      // the dimension's vips_pages row with the agent's compiled-truth
      // rewrite. We look at the snapshot BEFORE flipping `entry.resolved`
      // because we want to detect the first confirm transition.
      const isFirstConfirmInDimension = !payload[list].some(
        (e) => e.dimension === dimension && e.resolved === 'confirmed',
      )

      // Insert into vips_timeline_entries. Verifier-owned annotations
      // (reinforces_id, etc.) are carried from the staged entry; the
      // canonical_claim_id / verbatim_quote / reflection_id came from
      // the agent's draft and survived the verifier gate (admitted or
      // downgraded).
      insertVipsTimelineEntry(
        sid,
        {
          dimension,
          canonical_claim_id: entry.canonical_claim_id,
          verbatim_quote: entry.verbatim_quote,
          reflection_id: entry.reflection_id,
          strength: entry.strength,
          parallax_tag: entry.parallax_tag,
          reinforces_id: entry.reinforces_id ?? null,
        },
        { ctx: { db } },
      )

      if (isFirstConfirmInDimension) {
        // Design note (Known Residual #2): `compiled_truth_rewrite` is an
        // agent-rewritten holistic summary of the dimension. The Connector
        // prompt is responsible for grounding it in all non-forgotten
        // timeline entries we hand it as context. R2's preservation rule
        // is enforced by the append-only `vips_timeline_entries` table —
        // forgetting one entry just flips a flag; the next Connector pass
        // sees the surviving entries and rewrites compiled_truth from
        // scratch. The compiled_truth string is therefore presentation;
        // the timeline is canon.
        const dimDiff = payload.diffs[dimension as keyof typeof payload.diffs]
        upsertVipsPage(
          sid,
          {
            dimension,
            compiled_truth: dimDiff.compiled_truth_rewrite,
            open_question: dimDiff.open_question,
          },
          { ctx: { db } },
        )
      }

      // Mutate the in-payload resolution flag and persist it.
      entry.resolved = 'confirmed'
      const updated =
        updateVipsProposedDiffPayload(sid, parsed.diffId, payload, { ctx: { db } }) ?? row

      // If this was the last unresolved entry across all dimensions in
      // the diff, flip the staging row's status to 'confirmed' and stamp
      // reviewed_at. We treat any resolution outcome (including
      // forget-only batches) as "confirmed" because the diff was
      // *reviewed* — see forget-diff.handler.server.ts for the parallel
      // rule.
      if (allEntriesResolved(payload)) {
        const finalRow = updateVipsProposedDiffStatus(sid, parsed.diffId, 'confirmed', {
          ctx: { db },
        })
        return { diff: finalRow ?? updated }
      }
      return { diff: updated }
    })()
  })
}

function locateEntry(
  payload: ReviewPayload,
  entryId: string,
): { entry: ReviewableAnnotatedEntry; list: 'admitted' | 'downgraded' } | null {
  for (const list of ['admitted', 'downgraded'] as const) {
    const found = payload[list].find((e) => buildReviewEntryId(e) === entryId)
    if (found) return { entry: found, list }
  }
  return null
}
