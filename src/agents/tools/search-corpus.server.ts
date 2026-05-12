import { tool } from '@openai/agents'
import {
  type SearchPastMirrorsInput,
  SearchPastMirrorsInputSchema,
  type SearchPastMirrorsOutput,
  SearchPastMirrorsOutputSchema,
} from '~/agents/tools/schemas'
import {
  SEARCH_PAST_MIRRORS_DESCRIPTION,
  SEARCH_PAST_MIRRORS_NAME,
} from '~/agents/tools/search-corpus'
import type { TenantContext } from '~/db/client'
import { searchMirrors } from '~/db/queries'

/**
 * Server-only execution of the `search_past_mirrors` tool. Hits the DB via
 * the `searchMirrors` helper, which is itself gated by `withStudent` at the
 * call site. Browser code never imports this; it goes through a
 * TanStack server fn or the SDK Tool registration.
 *
 * Async after the Drizzle/Postgres port: callers must await the returned
 * promise. An optional `opts.ctx` lets a caller share its tenant
 * transaction; when omitted, `searchMirrors` opens its own `withStudent`.
 */
export async function executeSearchPastMirrors(
  studentId: string,
  rawInput: unknown,
  opts: { ctx?: TenantContext } = {},
): Promise<SearchPastMirrorsOutput> {
  const input = SearchPastMirrorsInputSchema.parse(rawInput)
  const results = await searchMirrors(studentId, input.query, {
    limit: input.limit,
    ...(opts.ctx ? { ctx: opts.ctx } : {}),
  })
  return SearchPastMirrorsOutputSchema.parse({ results })
}

/**
 * Build an SDK Tool for the sense-makers (Connector + Pathfinder). The
 * student id is bound at agent-construction time, mapping the call site
 * to a single `withStudent` boundary. Mirror does not use this — Mirror
 * uses the realtime tool config from `search-corpus.ts`.
 */
export function searchCorpusToolFor(studentId: string, opts: { ctx?: TenantContext } = {}) {
  return tool({
    name: SEARCH_PAST_MIRRORS_NAME,
    description: SEARCH_PAST_MIRRORS_DESCRIPTION,
    parameters: SearchPastMirrorsInputSchema,
    execute: async (input: SearchPastMirrorsInput) => {
      const out = await executeSearchPastMirrors(studentId, input, opts)
      return JSON.stringify(out)
    },
  })
}
