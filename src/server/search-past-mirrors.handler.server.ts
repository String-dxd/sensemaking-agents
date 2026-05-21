import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'
import { requireCounselorContext } from '~/auth/identity'
import { withStudentLegacy } from '~/server/tenancy.server'
import { type SearchPastMirrorsServerInput, searchPastMirrorsInputSchema } from './function-schemas'

export async function searchPastMirrorsHandler(data: SearchPastMirrorsServerInput) {
  const parsed = searchPastMirrorsInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudentLegacy(studentId, async (sid) =>
    executeSearchPastMirrors(sid, { query: parsed.query, limit: parsed.limit }),
  )
}
