import { z } from 'zod'
import { MirrorSignalSchema } from '~/agents/schemas'
import { type MirrorEntryRow, updateMirrorEntryFields } from '~/db/queries'
import { checkOutputForDiagnosticLanguage, checkPayloadForDiagnosticLanguage } from '~/lib/safety'
import { withStudent } from '~/server/tenancy.server'

export const editMirrorCautionInputSchema = z.object({
  studentId: z.string().min(1),
  entryId: z.number().int().positive(),
  caution: z.string().min(1),
})

export const editMirrorSignalsInputSchema = z.object({
  studentId: z.string().min(1),
  entryId: z.number().int().positive(),
  signals: z.array(MirrorSignalSchema).min(1),
})

export const editMirrorSummaryInputSchema = z.object({
  studentId: z.string().min(1),
  entryId: z.number().int().positive(),
  summary: z.string().min(1),
})

export type EditMirrorCautionInput = z.output<typeof editMirrorCautionInputSchema>
export type EditMirrorSignalsInput = z.output<typeof editMirrorSignalsInputSchema>
export type EditMirrorSummaryInput = z.output<typeof editMirrorSummaryInputSchema>

export class EditValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditValidationError'
  }
}

export function editMirrorCautionHandler(data: EditMirrorCautionInput): MirrorEntryRow | null {
  const parsed = editMirrorCautionInputSchema.parse(data)
  const safety = checkOutputForDiagnosticLanguage(parsed.caution)
  if (!safety.ok) {
    throw new EditValidationError(
      `Edit rejected — diagnostic language: ${safety.matches.map((m) => m.text).join('; ')}`,
    )
  }
  return withStudent(parsed.studentId, (sid) =>
    updateMirrorEntryFields(sid, parsed.entryId, { caution: parsed.caution }),
  )
}

export function editMirrorSignalsHandler(data: EditMirrorSignalsInput): MirrorEntryRow | null {
  const parsed = editMirrorSignalsInputSchema.parse(data)
  const safety = checkPayloadForDiagnosticLanguage(parsed.signals)
  if (!safety.ok) {
    throw new EditValidationError(
      `Edit rejected — diagnostic language: ${safety.matches.map((m) => m.text).join('; ')}`,
    )
  }
  return withStudent(parsed.studentId, (sid) =>
    updateMirrorEntryFields(sid, parsed.entryId, { signals: parsed.signals }),
  )
}

export function editMirrorSummaryHandler(data: EditMirrorSummaryInput): MirrorEntryRow | null {
  const parsed = editMirrorSummaryInputSchema.parse(data)
  const safety = checkOutputForDiagnosticLanguage(parsed.summary)
  if (!safety.ok) {
    throw new EditValidationError(
      `Edit rejected — diagnostic language: ${safety.matches.map((m) => m.text).join('; ')}`,
    )
  }
  return withStudent(parsed.studentId, (sid) =>
    updateMirrorEntryFields(sid, parsed.entryId, { summary: parsed.summary }),
  )
}
