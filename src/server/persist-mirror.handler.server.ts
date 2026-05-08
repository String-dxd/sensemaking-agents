import { z } from 'zod'
import { MirrorEntrySchema } from '~/agents/schemas'
import { insertMirrorEntry } from '~/db/queries'
import { checkPayloadForDiagnosticLanguage } from '~/lib/safety'
import { withStudent } from '~/server/tenancy.server'

export const persistMirrorInputSchema = z.object({
  studentId: z.string().min(1),
  entry: MirrorEntrySchema,
  /** Raw, un-edited Mirror agent output preserved for the R20 ablation. */
  raw_output: z.unknown(),
  trace: z.unknown().optional(),
})

export type PersistMirrorInput = z.output<typeof persistMirrorInputSchema>

export class DiagnosticLanguageError extends Error {
  constructor(readonly matches: { text: string; pattern: string }[]) {
    super(
      `Mirror output rejected — diagnostic language detected: ${matches.map((m) => m.text).join('; ')}`,
    )
    this.name = 'DiagnosticLanguageError'
  }
}

export function persistMirrorHandler(data: PersistMirrorInput) {
  const parsed = persistMirrorInputSchema.parse(data)

  // Safety gate: reject diagnostic language at persistence time.
  const safety = checkPayloadForDiagnosticLanguage({
    validation: parsed.entry.validation,
    inferred_meaning: parsed.entry.inferred_meaning,
    story_reframe: parsed.entry.story_reframe,
  })
  if (!safety.ok) throw new DiagnosticLanguageError(safety.matches)

  return withStudent(parsed.studentId, (sid) =>
    insertMirrorEntry(sid, {
      transcript: parsed.entry.transcript,
      validation: parsed.entry.validation,
      inferred_meaning: parsed.entry.inferred_meaning,
      story_reframe: parsed.entry.story_reframe,
      raw_output: parsed.raw_output ?? {
        validation: parsed.entry.validation,
        inferred_meaning: parsed.entry.inferred_meaning,
        story_reframe: parsed.entry.story_reframe,
      },
      trace: parsed.trace,
    }),
  )
}
