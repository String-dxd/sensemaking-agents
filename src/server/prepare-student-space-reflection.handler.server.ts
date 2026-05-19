import type { SelfCritiqueOutput } from '~/agents/tools/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { type RunMirrorHandlerDeps, runMirrorForStudent } from '~/server/run-mirror.handler.server'
import {
  type TranscribeMirrorDeps,
  type TranscribeMirrorResult,
  transcribeMirrorAudio,
} from '~/server/transcribe-mirror.handler.server'
import {
  type PrepareStudentSpaceReflectionInput,
  prepareStudentSpaceReflectionInputSchema,
} from './mirror-function-schemas'

export class PrepareStudentSpaceReflectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrepareStudentSpaceReflectionError'
  }
}

export interface PrepareStudentSpaceReflectionResult {
  local_capture_id: string
  transcript: string
  context_type: PrepareStudentSpaceReflectionInput['context_type']
  mood: PrepareStudentSpaceReflectionInput['mood'] | null
  output: {
    validation: string
    inferred_meaning: string
    story_reframe: string
  }
  eval_review: SelfCritiqueOutput | null
  transcription: TranscribeMirrorResult | null
}

export interface PrepareStudentSpaceReflectionDeps {
  requireContext?: typeof requireCounselorContext
  transcribeAudio?: typeof transcribeMirrorAudio
  runMirror?: typeof runMirrorForStudent
  transcriptionDeps?: Omit<TranscribeMirrorDeps, 'authenticate'>
  mirrorDeps?: RunMirrorHandlerDeps
}

export async function prepareStudentSpaceReflectionHandler(
  data: PrepareStudentSpaceReflectionInput,
  deps: PrepareStudentSpaceReflectionDeps = {},
): Promise<PrepareStudentSpaceReflectionResult> {
  const parsed = prepareStudentSpaceReflectionInputSchema.parse(data)
  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  const transcription = parsed.transcript
    ? null
    : await (deps.transcribeAudio ?? transcribeMirrorAudio)(
        {
          audioBase64: parsed.audioBase64 ?? '',
          mimeType: parsed.mimeType ?? '',
        },
        deps.transcriptionDeps,
      )
  const transcript = (parsed.transcript ?? transcription?.transcript ?? '').trim()
  if (!transcript) {
    throw new PrepareStudentSpaceReflectionError('Transcription came back empty.')
  }

  const mirror = await (deps.runMirror ?? runMirrorForStudent)(
    studentId,
    transcript,
    deps.mirrorDeps,
  )

  return {
    local_capture_id: parsed.localCaptureId,
    transcript,
    context_type: parsed.context_type,
    mood: parsed.mood ?? null,
    output: {
      validation: mirror.output.validation,
      inferred_meaning: mirror.output.inferred_meaning,
      story_reframe: mirror.output.story_reframe,
    },
    eval_review: mirror.eval_review,
    transcription,
  }
}
