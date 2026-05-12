import { z } from 'zod'
import { MirrorEditableField } from '~/agents/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { type MirrorEntryRow, updateMirrorEntryFields } from '~/db/queries'
import { checkOutputForDiagnosticLanguage } from '~/lib/safety'

export const editMirrorFieldInputSchema = z.object({
  entryId: z.number().int().positive(),
  field: MirrorEditableField,
  value: z.string().min(1),
})

export type EditMirrorFieldInput = z.output<typeof editMirrorFieldInputSchema>

export class EditValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditValidationError'
  }
}

/**
 * Update one of the three editable Mirror fields (validation, inferred_meaning,
 * story_reframe). The un-edited Mirror agent output stored in
 * `raw_output_json` is left untouched so the ablation harness can still
 * inspect what the model produced before any human edits.
 *
 * Single-query handler — `updateMirrorEntryFields` opens its own
 * `withStudent` envelope.
 */
export async function editMirrorFieldHandler(
  data: EditMirrorFieldInput,
): Promise<MirrorEntryRow | null> {
  const parsed = editMirrorFieldInputSchema.parse(data)
  const safety = checkOutputForDiagnosticLanguage(parsed.value)
  if (!safety.ok) {
    throw new EditValidationError(
      `Edit rejected — diagnostic language: ${safety.matches.map((m) => m.text).join('; ')}`,
    )
  }
  const { studentId } = await requireCounselorContext()
  return updateMirrorEntryFields(studentId, parsed.entryId, {
    [parsed.field]: parsed.value,
  })
}
