import type { SelfCritiqueOutput } from '~/agents/tools/schemas'
import { requireCounselorContext } from '~/auth/identity'
import type { MirrorEntryRow } from '~/db/queries'
import {
  type PersistMirrorDeps,
  persistMirrorForStudent,
} from '~/server/persist-mirror.handler.server'
import { type RunMirrorHandlerDeps, runMirrorForStudent } from '~/server/run-mirror.handler.server'
import {
  type TranscribeMirrorDeps,
  type TranscribeMirrorResult,
  transcribeMirrorAudio,
} from '~/server/transcribe-mirror.handler.server'
import {
  type SubmitStudentSpaceReflectionInput,
  submitStudentSpaceReflectionInputSchema,
} from './mirror-function-schemas'

export interface SubmitStudentSpaceReflectionResult {
  local_capture_id: string
  transcript: string
  mirror_entry: MirrorEntryRow
  output: {
    validation: string
    inferred_meaning: string
    story_reframe: string
  }
  eval_review: SelfCritiqueOutput | null
  transcription: TranscribeMirrorResult | null
}

export interface SubmitStudentSpaceReflectionDeps {
  requireContext?: typeof requireCounselorContext
  transcribeAudio?: typeof transcribeMirrorAudio
  runMirror?: typeof runMirrorForStudent
  persistMirror?: typeof persistMirrorForStudent
  transcriptionDeps?: Omit<TranscribeMirrorDeps, 'authenticate'>
  mirrorDeps?: RunMirrorHandlerDeps
  persistDeps?: Omit<PersistMirrorDeps, 'requireContext'>
}

export async function submitStudentSpaceReflectionHandler(
  data: SubmitStudentSpaceReflectionInput,
  deps: SubmitStudentSpaceReflectionDeps = {},
): Promise<SubmitStudentSpaceReflectionResult> {
  const parsed = submitStudentSpaceReflectionInputSchema.parse(data)
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
  const transcript = parsed.transcript ?? transcription?.transcript ?? ''

  const mirror = await (deps.runMirror ?? runMirrorForStudent)(
    studentId,
    transcript,
    deps.mirrorDeps,
  )
  const persisted = await (deps.persistMirror ?? persistMirrorForStudent)(
    studentId,
    {
      entry: {
        transcript,
        validation: mirror.output.validation,
        inferred_meaning: mirror.output.inferred_meaning,
        story_reframe: mirror.output.story_reframe,
      },
      context_type: parsed.context_type,
      mood: parsed.mood,
      review_status: 'confirmed',
      raw_output: mirror.output,
      trace: {
        source: 'student-space',
        local_capture_id: parsed.localCaptureId,
        eval_review: mirror.eval_review,
      },
    },
    deps.persistDeps,
  )

  return {
    local_capture_id: parsed.localCaptureId,
    transcript,
    mirror_entry: persisted.mirror_entry,
    output: {
      validation: mirror.output.validation,
      inferred_meaning: mirror.output.inferred_meaning,
      story_reframe: mirror.output.story_reframe,
    },
    eval_review: mirror.eval_review,
    transcription,
  }
}
