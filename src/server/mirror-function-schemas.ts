import { z } from 'zod'
import { MirrorEditableField, MirrorEntrySchema } from '~/agents/schemas'
import { MoodSchema, VipsContextTypeSchema } from '~/agents/tools/schemas'

export const editMirrorFieldInputSchema = z.object({
  entryId: z.number().int().positive(),
  field: MirrorEditableField,
  value: z.string().min(1),
})
export type EditMirrorFieldInput = z.output<typeof editMirrorFieldInputSchema>

export const persistMirrorInputSchema = z.object({
  entry: MirrorEntrySchema,
  context_type: VipsContextTypeSchema,
  mood: MoodSchema.nullable().optional(),
  raw_output: z.unknown(),
  trace: z.unknown().optional(),
})
export type PersistMirrorInput = z.output<typeof persistMirrorInputSchema>

export const submitStudentSpaceReflectionInputSchema = z
  .object({
    localCaptureId: z.string().min(1),
    transcript: z.string().trim().min(1).optional(),
    audioBase64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    context_type: VipsContextTypeSchema.default('school'),
    mood: MoodSchema.nullable().optional(),
  })
  .refine((value) => Boolean(value.transcript || value.audioBase64), {
    message: 'Either transcript or audioBase64 is required.',
    path: ['transcript'],
  })
  .refine((value) => !value.audioBase64 || Boolean(value.mimeType), {
    message: 'mimeType is required when audioBase64 is provided.',
    path: ['mimeType'],
  })

export type SubmitStudentSpaceReflectionInput = z.output<
  typeof submitStudentSpaceReflectionInputSchema
>

export const prepareStudentSpaceReflectionInputSchema = submitStudentSpaceReflectionInputSchema

export type PrepareStudentSpaceReflectionInput = SubmitStudentSpaceReflectionInput
