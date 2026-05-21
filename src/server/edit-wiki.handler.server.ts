import { requireCounselorContext } from '~/auth/identity'
import { type MirrorEntryRow, updateMirrorEntryFields } from '~/db/queries'
import { checkOutputForDiagnosticLanguage } from '~/lib/safety'
import { type EditMirrorFieldInput, editMirrorFieldInputSchema } from './mirror-function-schemas'

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
