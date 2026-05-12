/**
 * U8 — Load the most-recent pending `vips_proposed_diffs` row for a
 * student. Returns `null` when no pending row exists so the route loader
 * can render an empty state instead of redirecting.
 *
 * Single-query handler — `listVipsProposedDiffs` opens its own
 * `withStudent` envelope when no `ctx` is supplied.
 */
import { z } from 'zod'
import { requireCounselorContext } from '~/auth/identity'
import { listVipsProposedDiffs, type VipsProposedDiffRow } from '~/db/queries'

export const loadPendingReviewInputSchema = z.object({})

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

export async function loadPendingReviewHandler(
  data: LoadPendingReviewInput,
): Promise<LoadPendingReviewResult> {
  loadPendingReviewInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  // listVipsProposedDiffs orders by created_at DESC — first row is the
  // most recent pending diff. R30 / AE8: there can be at most one
  // pending diff per student because the auto-Connector handler queues
  // new runs when a prior pending row exists, but we still defensively
  // grab the most-recent in case of historical drift.
  const pending = await listVipsProposedDiffs(studentId, { status: 'pending' })
  return { diff: pending[0] ?? null }
}
