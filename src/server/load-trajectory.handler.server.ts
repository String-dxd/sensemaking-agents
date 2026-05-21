import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import { type CartographerOutputRow, latestCartographerOutput } from '~/db/queries'
import { type LoadTrajectoryInput, loadTrajectoryInputSchema } from './function-schemas'

/**
 * `/wiki/trajectory` loader data.
 *
 * `pending_diff_present` remains for legacy callers. Connector now verifies
 * and applies links itself, so pending proposed-diff rows no longer block
 * Trajectory.
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
    const trajectory = await latestCartographerOutput(studentId, { ctx })
    return {
      trajectory,
      pending_diff_present: false,
    }
  })
}
