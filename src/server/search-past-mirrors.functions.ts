import { createServerFn } from '@tanstack/react-start'
import { searchPastMirrorsInputSchema } from './function-schemas'

export const searchPastMirrors = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => searchPastMirrorsInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { searchPastMirrorsHandler } = await import('./search-past-mirrors.handler.server')
    return searchPastMirrorsHandler(data)
  })
