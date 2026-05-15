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
