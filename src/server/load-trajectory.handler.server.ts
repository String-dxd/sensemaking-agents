import { z } from 'zod'
import {
  type CartographerOutputRow,
  latestCartographerOutput,
  listVipsProposedDiffs,
} from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

export const loadTrajectoryInputSchema = z.object({
  studentId: z.string().min(1),
})
export type LoadTrajectoryInput = z.output<typeof loadTrajectoryInputSchema>

/**
 * `/wiki/trajectory` loader data.
 *
 * `pending_diff_present` is the R30 carry-forward: when a pending
 * `vips_proposed_diffs` row exists, F2 (the manual Run-sense-making
 * surface) defers to F1's post-mirror review path. The route uses this
 * flag to redirect to `/reflect/review`. U8 owns the dedicated
 * `loadPendingReview` server fn that returns the row contents; here we
 * only check presence so this loader can compose against the queries
 * surface without a U8 import dependency.
 */
export interface LoadTrajectoryResult {
  trajectory: CartographerOutputRow | null
  pending_diff_present: boolean
}

export function loadTrajectoryHandler(data: LoadTrajectoryInput): LoadTrajectoryResult {
  const parsed = loadTrajectoryInputSchema.parse(data)
  return withStudent(parsed.studentId, (sid) => {
    const pending = listVipsProposedDiffs(sid, { status: 'pending' })
    return {
      trajectory: latestCartographerOutput(sid),
      pending_diff_present: pending.length > 0,
    }
  })
}
