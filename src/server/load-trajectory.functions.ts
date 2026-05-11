import { createServerFn } from '@tanstack/react-start'
import { loadTrajectoryHandler, loadTrajectoryInputSchema } from './load-trajectory.handler.server'

/**
 * U11 — fetch the most-recent `cartographer_outputs` row for the
 * `/wiki/trajectory` route. Includes a `pending_diff_present` flag so the
 * route can redirect to `/reflect/review` per R30 when F1's review queue
 * is non-empty.
 */
export const loadTrajectory = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadTrajectoryInputSchema.parse(raw))
  .handler(({ data }) => loadTrajectoryHandler(data))
