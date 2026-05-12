import { z } from 'zod'
import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import {
  type CartographerOutputRow,
  latestCartographerOutput,
  listVipsProposedDiffs,
} from '~/db/queries'

export const loadTrajectoryInputSchema = z.object({})
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

export async function loadTrajectoryHandler(
  data: LoadTrajectoryInput,
): Promise<LoadTrajectoryResult> {
  loadTrajectoryInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => {
    const pending = await listVipsProposedDiffs(studentId, { status: 'pending', ctx })
    const trajectory = await latestCartographerOutput(studentId, { ctx })
    return {
      trajectory,
      pending_diff_present: pending.length > 0,
    }
  })
}
