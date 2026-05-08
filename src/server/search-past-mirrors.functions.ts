import { createServerFn } from '@tanstack/react-start'
import {
  searchPastMirrorsHandler,
  searchPastMirrorsInputSchema,
} from './search-past-mirrors.handler.server'

export const searchPastMirrors = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => searchPastMirrorsInputSchema.parse(raw))
  .handler(({ data }) => searchPastMirrorsHandler(data))
