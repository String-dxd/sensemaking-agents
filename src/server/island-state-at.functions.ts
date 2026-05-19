import { createServerFn } from '@tanstack/react-start'

import { islandStateAtInputSchema } from './function-schemas'

/**
 * Thin server-function wrapper around `getIslandStateAtHandler`. Lazy-
 * imports the handler so DB / auth modules stay out of the client bundle.
 */
export const getIslandStateAt = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => islandStateAtInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { getIslandStateAtHandler } = await import('./island-state-at.handler.server')
    return getIslandStateAtHandler(data)
  })
