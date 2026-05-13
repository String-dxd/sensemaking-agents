import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import {
  getVipsProposedDiff,
  updateMirrorEntryContextType,
  updateVipsProposedDiffPayload,
  type VipsProposedDiffRow,
} from '~/db/queries'
import { parseReviewPayload } from '~/server/review-payload-shape'
import { type UpdateReviewContextInput, updateReviewContextInputSchema } from './function-schemas'

export class UpdateReviewContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpdateReviewContextError'
  }
}

export interface UpdateReviewContextResult {
  diff: VipsProposedDiffRow
  context_type: UpdateReviewContextInput['context_type']
}

export async function updateReviewContextHandler(
  data: UpdateReviewContextInput,
): Promise<UpdateReviewContextResult> {
  const parsed = updateReviewContextInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()

  return withStudent(studentId, async (ctx) => {
    const row = await getVipsProposedDiff(studentId, parsed.diffId, { ctx })
    if (!row) throw new UpdateReviewContextError(`Staged diff ${parsed.diffId} not found`)
    if (row.status !== 'pending') {
      throw new UpdateReviewContextError(
        `Staged diff ${parsed.diffId} is not pending (status=${row.status})`,
      )
    }

    const payload = parseReviewPayload(row.payload)
    for (const entry of [...payload.admitted, ...payload.downgraded]) {
      if (entry.reflection_id === row.mirror_entry_id && entry.resolved === 'pending') {
        entry.parallax_tag = [parsed.context_type]
      }
    }

    await updateMirrorEntryContextType(studentId, row.mirror_entry_id, parsed.context_type, {
      ctx,
    })
    const updated = await updateVipsProposedDiffPayload(studentId, parsed.diffId, payload, { ctx })
    return { diff: updated ?? row, context_type: parsed.context_type }
  })
}
