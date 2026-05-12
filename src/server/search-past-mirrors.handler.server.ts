import { z } from 'zod'
import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'
import { withStudentLegacy } from '~/server/tenancy.server'

export const searchPastMirrorsInputSchema = z.object({
  studentId: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
})

export type SearchPastMirrorsServerInput = z.output<typeof searchPastMirrorsInputSchema>

export async function searchPastMirrorsHandler(data: SearchPastMirrorsServerInput) {
  const parsed = searchPastMirrorsInputSchema.parse(data)
  return withStudentLegacy(parsed.studentId, async (sid) =>
    executeSearchPastMirrors(sid, { query: parsed.query, limit: parsed.limit }),
  )
}
