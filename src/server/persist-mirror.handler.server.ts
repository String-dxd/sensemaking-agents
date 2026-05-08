import { z } from 'zod'
import { MirrorEntrySchema } from '~/agents/schemas'
import { insertMirrorEntry } from '~/db/queries'
import { checkPayloadForDiagnosticLanguage } from '~/lib/safety'
import { withStudent } from '~/server/tenancy.server'

export const persistMirrorInputSchema = z.object({
  studentId: z.string().min(1),
  entry: MirrorEntrySchema,
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

  // Safety gate: reject diagnostic language at persistence time. Without
  // this, a model regression could quietly write personality labels to
  // the wiki — Core Principle 6 says no.
  const safety = checkPayloadForDiagnosticLanguage({
    summary: parsed.entry.summary,
    signals: parsed.entry.signals,
    caution: parsed.entry.caution,
  })
  if (!safety.ok) throw new DiagnosticLanguageError(safety.matches)

  return withStudent(parsed.studentId, (sid) =>
    insertMirrorEntry(sid, {
      summary: parsed.entry.summary,
      transcript: parsed.entry.transcript,
      signals: parsed.entry.signals,
      caution: parsed.entry.caution,
      tags: parsed.entry.tags,
      trace: parsed.trace,
    }),
  )
}
