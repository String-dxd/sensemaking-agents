/**
 * U8 — Load the most-recent pending `vips_proposed_diffs` row for a
 * student. Returns `null` when no pending row exists so the route loader
 * can render an empty state instead of redirecting.
 *
 * Wrapped in `withStudent` so all reads are tenant-scoped.
 */
import { z } from 'zod'
import { listVipsProposedDiffs, type VipsProposedDiffRow } from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

export const loadPendingReviewInputSchema = z.object({
  studentId: z.string().min(1),
})

export type LoadPendingReviewInput = z.output<typeof loadPendingReviewInputSchema>

export interface LoadPendingReviewResult {
  diff: VipsProposedDiffRow | null
}

export class LoadPendingReviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoadPendingReviewError'
  }
}

export function loadPendingReviewHandler(data: LoadPendingReviewInput): LoadPendingReviewResult {
  const parsed = loadPendingReviewInputSchema.parse(data)
  return withStudent(parsed.studentId, (sid) => {
    // listVipsProposedDiffs orders by created_at DESC — first row is the
    // most recent pending diff. R30 / AE8: there can be at most one
    // pending diff per student because the auto-Connector handler queues
    // new runs when a prior pending row exists, but we still defensively
    // grab the most-recent in case of historical drift.
    const pending = listVipsProposedDiffs(sid, { status: 'pending' })
    return { diff: pending[0] ?? null }
  })
}
