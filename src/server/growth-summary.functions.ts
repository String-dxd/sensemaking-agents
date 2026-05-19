import { createServerFn } from '@tanstack/react-start'

import { growthSummaryInputSchema } from './function-schemas'

/**
 * Thin server-function wrapper around `getGrowthSummaryHandler`. The
 * handler imports DB / auth modules that should not land in the client
 * bundle, so we lazy-import it from inside the handler closure.
 */
export const getGrowthSummary = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => growthSummaryInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { getGrowthSummaryHandler } = await import('./growth-summary.handler.server')
    return getGrowthSummaryHandler(data)
  })
