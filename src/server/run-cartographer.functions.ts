import { createServerFn } from '@tanstack/react-start'
import {
  runCartographerHandler,
  runCartographerInputSchema,
} from './run-cartographer.handler.server'

/**
 * U11 — Trajectory-page server fn. Wired to the `/wiki` "Run sense-making"
 * button. Single-agent Cartographer chain that reads the four VIPS pages
 * plus the corpus and produces a `CartographerOutputSchema`-shaped
 * Trajectory page persisted into `cartographer_outputs`.
 *
 * The v0.1 `runSensemaking` server fn (Connector → Cartographer chain)
 * remains as a passthrough through the cutover; the follow-up PR deletes
 * it per the plan's Scope Boundaries.
 */
export const runCartographer = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => runCartographerInputSchema.parse(raw))
  .handler(({ data }) => runCartographerHandler(data))
