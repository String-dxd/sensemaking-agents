import { z } from 'zod'
import { runMirrorOnTranscript } from '~/agents/mirror'
import { MirrorOutputSchema } from '~/agents/schemas'
import { withStudentLegacy } from '~/server/tenancy.server'

export const runMirrorInputSchema = z.object({
  studentId: z.string().min(1),
  transcript: z.string().min(1),
})

export type RunMirrorInput = z.output<typeof runMirrorInputSchema>

export class MirrorAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MirrorAgentError'
  }
}

/**
 * Run the Mirror agent against a transcript and return the parsed
 * three-part output. Caller (the UI) is responsible for posting the
 * result through persistMirror, which is the only place writes happen.
 */
export async function runMirrorHandler(data: RunMirrorInput) {
  const parsed = runMirrorInputSchema.parse(data)
  return withStudentLegacy(parsed.studentId, async (sid) => {
    try {
      const out = await runMirrorOnTranscript(sid, parsed.transcript)
      return { output: MirrorOutputSchema.parse(out) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new MirrorAgentError(`Mirror agent failed: ${msg}`, err)
    }
  })
}
