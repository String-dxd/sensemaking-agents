import { createServerFn } from '@tanstack/react-start'

import { loadPublicProfileInputSchema } from './function-schemas'

/**
 * Public-profile loader server function. Wraps the underlying handler so
 * the `/share/$token` route can call it from its loader without importing
 * any server-only modules into the client bundle.
 */
export const loadPublicProfile = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadPublicProfileInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadPublicProfileHandler } = await import('./load-public-profile.handler.server')
    return loadPublicProfileHandler(data)
  })
