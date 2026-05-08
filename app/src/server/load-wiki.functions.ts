import { createServerFn } from '@tanstack/react-start'
import {
  loadWikiEntryHandler,
  loadWikiEntryInputSchema,
  loadWikiHandler,
  loadWikiInputSchema,
} from './load-wiki.handler.server'

export const loadWiki = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadWikiInputSchema.parse(raw))
  .handler(({ data }) => loadWikiHandler(data))

export const loadWikiEntry = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadWikiEntryInputSchema.parse(raw))
  .handler(({ data }) => loadWikiEntryHandler(data))
