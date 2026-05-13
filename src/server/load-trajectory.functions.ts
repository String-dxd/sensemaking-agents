import { createServerFn } from '@tanstack/react-start'
import { loadTrajectoryInputSchema } from './function-schemas'

/**
 * U11 — fetch the most-recent `cartographer_outputs` row for the
 * `/wiki/trajectory` route. The `pending_diff_present` flag remains in the
 * response shape for legacy callers, but Connector no longer blocks
 * Trajectory on user-confirmed diffs.
 */
export const loadTrajectory = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadTrajectoryInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadTrajectoryHandler } = await import('./load-trajectory.handler.server')
    return loadTrajectoryHandler(data)
  })
