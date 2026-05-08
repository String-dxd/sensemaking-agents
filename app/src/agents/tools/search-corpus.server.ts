import { tool } from '@openai/agents'
import type { Database as DatabaseInstance } from 'better-sqlite3'
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
import { searchMirrors } from '~/db/queries'

/**
 * Server-only execution of the `search_past_mirrors` tool. Hits sqlite via
 * the `searchMirrors` helper, which is itself gated by `withStudent` at the
 * call site. Browser code never imports this; it goes through a
 * TanStack server fn or the SDK Tool registration in U6.
 */
export function executeSearchPastMirrors(
  studentId: string,
  rawInput: unknown,
  opts: { db?: DatabaseInstance } = {},
): SearchPastMirrorsOutput {
  const input = SearchPastMirrorsInputSchema.parse(rawInput)
  const results = searchMirrors(studentId, input.query, {
    limit: input.limit,
    ctx: opts.db ? { db: opts.db } : undefined,
  })
  return SearchPastMirrorsOutputSchema.parse({ results })
}

/**
 * Build an SDK Tool for the sense-makers (Connector + Pathfinder). The
 * student id is bound at agent-construction time, mapping the call site
 * to a single `withStudent` boundary. Mirror does not use this — Mirror
 * uses the realtime tool config from `search-corpus.ts`.
 */
export function searchCorpusToolFor(studentId: string, opts: { db?: DatabaseInstance } = {}) {
  return tool({
    name: SEARCH_PAST_MIRRORS_NAME,
    description: SEARCH_PAST_MIRRORS_DESCRIPTION,
    parameters: SearchPastMirrorsInputSchema,
    execute: async (input: SearchPastMirrorsInput) => {
      const out = executeSearchPastMirrors(studentId, input, opts)
      return JSON.stringify(out)
    },
  })
}
