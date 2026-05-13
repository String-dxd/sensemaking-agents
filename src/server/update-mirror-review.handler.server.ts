import { requireCounselorContext } from '~/auth/identity'
import {
  type MirrorEntryRow,
  updateMirrorEntryReviewStatus,
  updatePendingMirrorEntriesReviewStatus,
} from '~/db/queries'
import {
  type BulkUpdateMirrorReviewInput,
  bulkUpdateMirrorReviewInputSchema,
  type UpdateMirrorReviewInput,
  updateMirrorReviewInputSchema,
} from './function-schemas'

export class UpdateMirrorReviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpdateMirrorReviewError'
  }
}

export async function updateMirrorReviewHandler(
  data: UpdateMirrorReviewInput,
): Promise<MirrorEntryRow> {
  const parsed = updateMirrorReviewInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  const row = await updateMirrorEntryReviewStatus(studentId, parsed.entryId, parsed.status)
  if (!row) throw new UpdateMirrorReviewError(`Mirror entry ${parsed.entryId} not found`)
  return row
}

export async function bulkUpdateMirrorReviewHandler(
  data: BulkUpdateMirrorReviewInput,
): Promise<{ updated: number }> {
  const parsed = bulkUpdateMirrorReviewInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return updatePendingMirrorEntriesReviewStatus(studentId, parsed.status)
}
