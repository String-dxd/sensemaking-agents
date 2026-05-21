import { runOpenAIRealtimeMirror } from '~/agents/openai-realtime/mirror-runner'
import { type MirrorOutputDraft, MirrorOutputSchema } from '~/agents/schemas'
import {
  runSelfCritiqueReviewBestEffort,
  type SelfCritiqueReviewDeps,
} from '~/agents/self-critique-eval'
import type { SelfCritiqueOutput } from '~/agents/tools/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { withStudentLegacy } from '~/server/tenancy.server'
import { type RunMirrorInput, runMirrorInputSchema } from './function-schemas'

export class MirrorAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MirrorAgentError'
  }
}

export interface RunMirrorHandlerDeps {
  /** Override Mirror invocation. Default: OpenAI Realtime. */
  runMirror?: (input: { studentId: string; transcript: string }) => Promise<MirrorOutputDraft>
  /** Override the OpenAI Realtime provider while preserving the public handler path. */
  openAIRealtimeMirror?: (input: {
    studentId: string
    transcript: string
  }) => Promise<MirrorOutputDraft>
  /** Override or disable the eval/safety review invocation. */
  selfCritique?: SelfCritiqueReviewDeps
}

/**
 * Run the Mirror agent against a transcript and return the parsed
 * three-part output. Caller (the UI) is responsible for posting the
 * result through persistMirror, which is the only place writes happen.
 */
export async function runMirrorHandler(data: RunMirrorInput, deps: RunMirrorHandlerDeps = {}) {
  const parsed = runMirrorInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return runMirrorForStudent(studentId, parsed.transcript, deps)
}

export async function runMirrorForStudent(
  studentId: string,
  transcript: string,
  deps: RunMirrorHandlerDeps = {},
) {
  return withStudentLegacy(studentId, async (sid) => {
    try {
      const out = await runMirrorOnTranscript(sid, transcript, deps)
      const output = MirrorOutputSchema.parse(out)
      const evalReview = await runMirrorEvalReview(output, transcript, deps.selfCritique)
      return { output, eval_review: evalReview }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new MirrorAgentError(`Mirror agent failed: ${msg}`, err)
    }
  })
}

/**
 * Dispatch a Mirror run via OpenAI Realtime. The `deps.runMirror` seam wins
 * for legacy tests and focused handler coverage.
 */
async function runMirrorOnTranscript(
  studentId: string,
  transcript: string,
  deps: RunMirrorHandlerDeps,
): Promise<MirrorOutputDraft> {
  if (deps.runMirror !== undefined) {
    return deps.runMirror({ studentId, transcript })
  }
  const runRealtimeMirror = deps.openAIRealtimeMirror ?? runOpenAIRealtimeMirror
  return runRealtimeMirror({ studentId, transcript })
}

async function runMirrorEvalReview(
  output: MirrorOutputDraft,
  transcript: string,
  deps?: SelfCritiqueReviewDeps,
): Promise<SelfCritiqueOutput | null> {
  return runSelfCritiqueReviewBestEffort(
    {
      agent: 'mirror',
      draft: output,
      focus: ['evidence_grounding', 'safety', 'student_agency', 'specificity'],
      sourceContext: `Transcript:\n${transcript}`,
    },
    deps,
  )
}
