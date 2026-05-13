import { createServerFn } from '@tanstack/react-start'
import { loadTrajectoryInputSchema } from './function-schemas'

/**
 * U11 — fetch the most-recent `cartographer_outputs` row for the
 * `/wiki/trajectory` route. Includes a `pending_diff_present` flag so the
 * route can redirect to `/reflect/review` per R30 when F1's review queue
 * is non-empty.
 */
export const loadTrajectory = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadTrajectoryInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadTrajectoryHandler } = await import('./load-trajectory.handler.server')
    return loadTrajectoryHandler(data)
  })
