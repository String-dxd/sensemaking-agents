/**
 * U8 — Forget a single staged-diff entry. The entry never reaches
 * `vips_timeline_entries`; per R20 it does NOT bump `vips_forget_count`
 * (that counter tracks "previously committed, then forgotten" only).
 *
 * Behavior:
 *   - Mark the entry `resolved: 'forgotten'` inside the staging row's
 *     payload_json.
 *   - On last entry resolved (all admitted+downgraded entries are
 *     `confirmed` or `forgotten`), flip the staging row's status to
 *     `'confirmed'` and stamp `reviewed_at`. The status always lands on
 *     `'confirmed'` (not `'forgotten'`) because the diff was reviewed
 *     completely — even if every entry was dropped. The plan's R20 text
 *     and the proposed-diff status enum (`pending | confirmed | forgotten`)
 *     leave `'forgotten'` for a future "ignore the whole diff" flow not
 *     wired in v0.2; keeping the binary `pending → confirmed` flip
 *     matches the simpler interpretation in U8's Approach text.
 *
 * Wrapped in `withStudent` from `~/db/client` so the diff lookup and
 * payload/status updates share one Postgres transaction.
 */
import { z } from 'zod'
import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import {
  getVipsProposedDiff,
  updateVipsProposedDiffPayload,
  updateVipsProposedDiffStatus,
  type VipsProposedDiffRow,
} from '~/db/queries'
import {
  allEntriesResolved,
  locateEntry,
  parseReviewPayload,
} from '~/server/review-payload-shape'

export const forgetDiffInputSchema = z.object({
  diffId: z.number().int().positive(),
  entryId: z.string().min(1),
})

export type ForgetDiffInput = z.output<typeof forgetDiffInputSchema>

export class ForgetDiffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForgetDiffError'
  }
}

export interface ForgetDiffResult {
  diff: VipsProposedDiffRow
}

export async function forgetDiffHandler(data: ForgetDiffInput): Promise<ForgetDiffResult> {
  const parsed = forgetDiffInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => {
    const row = await getVipsProposedDiff(studentId, parsed.diffId, { ctx })
    if (!row) throw new ForgetDiffError(`Staged diff ${parsed.diffId} not found`)
    if (row.status !== 'pending') {
      throw new ForgetDiffError(
        `Staged diff ${parsed.diffId} is not pending (status=${row.status})`,
      )
    }

    const payload = parseReviewPayload(row.payload)
    const located = locateEntry(payload, parsed.entryId)
    if (!located) {
      throw new ForgetDiffError(`Entry ${parsed.entryId} not found in diff ${parsed.diffId}`)
    }
    const { entry } = located
    if (entry.resolved === 'confirmed') {
      throw new ForgetDiffError(`Entry ${parsed.entryId} was already confirmed`)
    }
    if (entry.resolved === 'forgotten') {
      throw new ForgetDiffError(`Entry ${parsed.entryId} is already forgotten`)
    }

    // R20: forget on the review surface does NOT touch
    // `vips_forget_count` — the entry never committed to
    // `vips_timeline_entries`, so it has nothing to subtract from.
    // We deliberately do NOT call `forgetVipsTimelineEntry` here.
    entry.resolved = 'forgotten'
    const updated =
      (await updateVipsProposedDiffPayload(studentId, parsed.diffId, payload, { ctx })) ?? row

    // Last-entry finalization: see file-top docstring. Status flips to
    // 'confirmed' (the "reviewed" marker) regardless of whether all
    // entries were confirmed, all forgotten, or a mix.
    if (allEntriesResolved(payload)) {
      const finalRow = await updateVipsProposedDiffStatus(studentId, parsed.diffId, 'confirmed', {
        ctx,
      })
      return { diff: finalRow ?? updated }
    }
    return { diff: updated }
  })
}
