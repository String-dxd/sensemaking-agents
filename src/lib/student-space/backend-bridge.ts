import type { Mood, VipsContextType } from '~/agents/tools/schemas'
import {
  createStudentSpaceBackendSnapshot,
  mapMirrorEntryToReflectionCapture,
  mapTrajectoryResultToStudentSpaceCapture,
  type StudentSpaceBackendSnapshot,
} from '~/lib/student-space/backend-snapshot'
import { loadAuthMenu } from '~/server/auth-menu.functions'
import type { AuthMenuState } from '~/server/auth-menu.handler.server'
import { forgetTimelineEntry } from '~/server/forget-timeline-entry.functions'
import { loadTrajectory } from '~/server/load-trajectory.functions'
import { loadVipsPages } from '~/server/load-vips-pages.functions'
import { loadWiki } from '~/server/load-wiki.functions'
import { persistMirror } from '~/server/persist-mirror.functions'
import type { PersistMirrorResult } from '~/server/persist-mirror.handler.server'
import { prepareStudentSpaceReflection } from '~/server/prepare-student-space-reflection.functions'
import type { PrepareStudentSpaceReflectionResult } from '~/server/prepare-student-space-reflection.handler.server'
import { runCartographer } from '~/server/run-cartographer.functions'
import { runConnector } from '~/server/run-connector.functions'
import type { RunConnectorResult } from '~/server/run-connector.handler.server'
import { submitStudentSpaceReflection } from '~/server/submit-student-space-reflection.functions'
import type { SubmitStudentSpaceReflectionResult } from '~/server/submit-student-space-reflection.handler.server'
import { updateMirrorReview } from '~/server/update-mirror-review.functions'
import {
  createRealtimeMirrorCapture,
  type StudentSpaceRealtimeConversationUpdate,
  type StudentSpaceRealtimeMirrorCapture,
} from './realtime-mirror-client'

export type StudentSpaceSurface =
  | 'profile'
  | 'reflections'
  | 'trajectory'
  | 'values'
  | 'interests'
  | 'personality'
  | 'skills'
  | 'relationships'
  | 'choices'
  | 'growth'
  | 'history'

export interface StudentSpaceReflectionInput {
  localCaptureId: string
  initialTranscript?: string
  transcript?: string
  audioBase64?: string
  mimeType?: string
  mood?: Mood
  contextType?: VipsContextType
  createdAt?: string
  onConversationUpdate?: (update: StudentSpaceRealtimeConversationUpdate) => void
}

export interface StudentSpaceMirrorEntrySummary {
  id: number
  transcript: string
  validation: string
  inferredMeaning: string
  storyReframe: string
  contextType: string
  reviewStatus: 'pending' | 'confirmed' | 'forgotten'
  createdAt: string
}

export interface StudentSpaceReflectionResult {
  localCaptureId: string
  mirrorEntry: StudentSpaceMirrorEntrySummary
}

export interface StudentSpacePreparedReflection {
  localCaptureId: string
  transcript: string
  validation: string
  inferredMeaning: string
  storyReframe: string
  contextType: VipsContextType
  mood?: Mood | null
  evalReview?: unknown
  transcription?: unknown
}

export interface StudentSpaceReviewInput {
  entryId: number
  status: 'confirmed' | 'forgotten'
}

export interface StudentSpaceForgetEvidenceInput {
  timelineEntryId: number
}

export interface StudentSpaceOpenSurfaceInput {
  surface: StudentSpaceSurface
  filter?: 'all' | 'need-review'
  entryId?: number
}

export interface StudentSpaceBackendBridge {
  version: 1
  refreshSnapshot?: () => Promise<StudentSpaceBackendSnapshot>
  /**
   * Fetch the server-resolved auth menu once during host boot. Engines feed
   * this into their `state.auth` slice so onboarding / TopNav / ProfileSheet
   * render the right sign-in / sign-out / demo affordance.
   */
  loadAuthMenu?: () => Promise<AuthMenuState>
  createRealtimeMirrorCapture?: (
    input: StudentSpaceReflectionInput,
  ) => Promise<StudentSpaceRealtimeMirrorCapture>
  prepareReflection?: (
    input: StudentSpaceReflectionInput,
  ) => Promise<StudentSpacePreparedReflection>
  logPreparedReflection?: (
    input: StudentSpacePreparedReflection,
  ) => Promise<StudentSpaceReflectionResult>
  submitReflection?: (input: StudentSpaceReflectionInput) => Promise<StudentSpaceReflectionResult>
  updateReflectionReview?: (
    input: StudentSpaceReviewInput,
  ) => Promise<StudentSpaceMirrorEntrySummary>
  runConnector?: () => Promise<RunConnectorResult>
  forgetEvidence?: (input: StudentSpaceForgetEvidenceInput) => Promise<unknown>
  loadTrajectory?: () => Promise<unknown>
  runTrajectory?: () => Promise<unknown>
  openSurface?: (input: StudentSpaceOpenSurfaceInput) => void
}

export function createStudentSpaceBackendBridge(): StudentSpaceBackendBridge {
  return {
    version: 1,
    refreshSnapshot: async () => {
      const [vips, wiki, trajectory] = await Promise.all([
        loadVipsPages({ data: {} }),
        loadWiki({ data: {} }),
        loadTrajectory({ data: {} }),
      ])
      return createStudentSpaceBackendSnapshot({ vips, wiki, trajectory })
    },
    loadAuthMenu: async () => loadAuthMenu({ data: {} }),
    createRealtimeMirrorCapture: async (input) =>
      createRealtimeMirrorCapture({
        localCaptureId: input.localCaptureId,
        contextType: input.contextType,
        mood: input.mood,
        initialTranscript: input.initialTranscript ?? input.transcript,
        onConversationUpdate: input.onConversationUpdate,
      }),
    prepareReflection: async (input) => {
      const result = (await prepareStudentSpaceReflection({
        data: {
          localCaptureId: input.localCaptureId,
          ...(input.transcript ? { transcript: input.transcript } : {}),
          ...(input.audioBase64 ? { audioBase64: input.audioBase64 } : {}),
          ...(input.mimeType ? { mimeType: input.mimeType } : {}),
          ...(input.contextType ? { context_type: input.contextType } : {}),
          ...(input.mood ? { mood: input.mood } : {}),
        },
      })) as PrepareStudentSpaceReflectionResult
      return mapPreparedReflectionResult(result)
    },
    logPreparedReflection: async (input) => {
      const result = (await persistMirror({
        data: {
          entry: {
            transcript: input.transcript,
            validation: input.validation,
            inferred_meaning: input.inferredMeaning,
            story_reframe: input.storyReframe,
          },
          context_type: input.contextType,
          ...(input.mood ? { mood: input.mood } : {}),
          raw_output: {
            validation: input.validation,
            inferred_meaning: input.inferredMeaning,
            story_reframe: input.storyReframe,
            eval_review: input.evalReview ?? null,
            transcription: input.transcription ?? null,
          },
          trace: {
            source: 'student-space',
            local_capture_id: input.localCaptureId,
            eval_review: input.evalReview ?? null,
            prepared: true,
          },
        },
      })) as PersistMirrorResult
      return {
        localCaptureId: input.localCaptureId,
        mirrorEntry: mapMirrorEntryRowToSummary(result.mirror_entry),
      }
    },
    submitReflection: async (input) => {
      const result = (await submitStudentSpaceReflection({
        data: {
          localCaptureId: input.localCaptureId,
          ...(input.transcript ? { transcript: input.transcript } : {}),
          ...(input.audioBase64 ? { audioBase64: input.audioBase64 } : {}),
          ...(input.mimeType ? { mimeType: input.mimeType } : {}),
          ...(input.contextType ? { context_type: input.contextType } : {}),
          ...(input.mood ? { mood: input.mood } : {}),
        },
      })) as SubmitStudentSpaceReflectionResult
      return {
        localCaptureId: result.local_capture_id,
        mirrorEntry: mapMirrorEntryRowToSummary(result.mirror_entry),
      }
    },
    updateReflectionReview: async (input) => {
      const row = await updateMirrorReview({
        data: { entryId: input.entryId, status: input.status },
      })
      const capture = mapMirrorEntryToReflectionCapture(row)
      return {
        id: row.id,
        transcript: row.transcript,
        validation: row.validation,
        inferredMeaning: row.inferred_meaning,
        storyReframe: row.story_reframe,
        contextType: row.context_type,
        reviewStatus: capture.reviewStatus,
        createdAt: row.created_at,
      }
    },
    runConnector: async () => {
      const result = await runConnector({ data: {} })
      if (isHardFailedConnectorResult(result)) {
        throw new Error(`Connector run failed with status ${result.status}`)
      }
      return result
    },
    forgetEvidence: async (input) =>
      forgetTimelineEntry({ data: { entryId: input.timelineEntryId } }),
    loadTrajectory: async () => {
      const result = await loadTrajectory({ data: {} })
      return mapTrajectoryResultToStudentSpaceCapture(result)
    },
    runTrajectory: async () => {
      const result = await runCartographer({ data: {} })
      if (isFailedCartographerResult(result)) {
        throw new Error(`Cartographer run failed with status ${result.status}: ${result.error}`)
      }
      return result
    },
  }
}

function mapPreparedReflectionResult(
  result: PrepareStudentSpaceReflectionResult,
): StudentSpacePreparedReflection {
  return {
    localCaptureId: result.local_capture_id,
    transcript: result.transcript,
    validation: result.output.validation,
    inferredMeaning: result.output.inferred_meaning,
    storyReframe: result.output.story_reframe,
    contextType: result.context_type,
    mood: result.mood,
    evalReview: result.eval_review,
    transcription: result.transcription,
  }
}

function mapMirrorEntryRowToSummary(row: {
  id: number
  transcript: string
  validation: string
  inferred_meaning: string
  story_reframe: string
  context_type: string
  review_status: 'pending' | 'confirmed' | 'forgotten'
  created_at: string
}): StudentSpaceMirrorEntrySummary {
  return {
    id: row.id,
    transcript: row.transcript,
    validation: row.validation,
    inferredMeaning: row.inferred_meaning,
    storyReframe: row.story_reframe,
    contextType: row.context_type,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
  }
}

function isHardFailedConnectorResult(
  result: unknown,
): result is { status: string; failed: number; processed: number } {
  if (!result || typeof result !== 'object') return false
  const maybe = result as { status?: unknown }
  const status = typeof maybe.status === 'string' ? maybe.status : ''
  const hardStatuses = new Set([
    'timeout',
    'schema_reject',
    'transport_error',
    'auth_error',
    'unknown',
    'missing_mirror',
  ])
  return hardStatuses.has(status)
}

function isFailedCartographerResult(
  result: unknown,
): result is { ok: false; status: string; error: string } {
  return Boolean(
    result &&
      typeof result === 'object' &&
      'ok' in result &&
      (result as { ok?: unknown }).ok === false,
  )
}
