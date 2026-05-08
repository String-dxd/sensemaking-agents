import { z } from 'zod'
import { MirrorEditableField } from '~/agents/schemas'
import { type MirrorEntryRow, updateMirrorEntryFields } from '~/db/queries'
import { checkOutputForDiagnosticLanguage } from '~/lib/safety'
import { withStudent } from '~/server/tenancy.server'

export const editMirrorFieldInputSchema = z.object({
  studentId: z.string().min(1),
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
 */
export function editMirrorFieldHandler(data: EditMirrorFieldInput): MirrorEntryRow | null {
  const parsed = editMirrorFieldInputSchema.parse(data)
  const safety = checkOutputForDiagnosticLanguage(parsed.value)
  if (!safety.ok) {
    throw new EditValidationError(
      `Edit rejected — diagnostic language: ${safety.matches.map((m) => m.text).join('; ')}`,
    )
  }
  return withStudent(parsed.studentId, (sid) =>
    updateMirrorEntryFields(sid, parsed.entryId, { [parsed.field]: parsed.value }),
  )
}
