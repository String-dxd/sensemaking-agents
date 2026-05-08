import { createServerFn } from '@tanstack/react-start'
import { runSensemakingHandler, runSensemakingInputSchema } from './run-sensemaking.handler.server'

export const runSensemaking = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => runSensemakingInputSchema.parse(raw))
  .handler(({ data }) => runSensemakingHandler(data))
