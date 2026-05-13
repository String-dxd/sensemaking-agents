import {
  SearchPastMirrorsInputSchema,
  type SearchPastMirrorsOutput,
  SearchPastMirrorsOutputSchema,
} from '~/agents/tools/schemas'
import type { TenantContext } from '~/db/client'
import { searchMirrors } from '~/db/queries'

/**
 * Server-only execution of past-mirror search. Hits the DB via the
 * `searchMirrors` helper, which is itself gated by `withStudent` at the
 * call site. Browser code never imports this; it goes through a TanStack
 * server fn.
 *
 * An optional `opts.ctx` lets a caller share its tenant transaction; when
 * omitted, `searchMirrors` opens its own `withStudent`.
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
