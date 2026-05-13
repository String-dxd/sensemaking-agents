import { createServerFn } from '@tanstack/react-start'
import { loadWikiEntryInputSchema, loadWikiInputSchema } from './function-schemas'

export const loadWiki = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadWikiInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadWikiHandler } = await import('./load-wiki.handler.server')
    return loadWikiHandler(data)
  })

export const loadWikiEntry = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadWikiEntryInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadWikiEntryHandler } = await import('./load-wiki.handler.server')
    return loadWikiEntryHandler(data)
  })
