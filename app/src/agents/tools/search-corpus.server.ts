import type { Database as DatabaseInstance } from 'better-sqlite3'
import {
  SearchPastMirrorsInputSchema,
  type SearchPastMirrorsOutput,
  SearchPastMirrorsOutputSchema,
} from '~/agents/tools/schemas'
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
