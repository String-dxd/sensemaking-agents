import type { Mood, VipsContextType } from '~/agents/tools/schemas'
import {
  createStudentSpaceBackendSnapshot,
  mapMirrorEntryToReflectionCapture,
  mapTrajectoryResultToStudentSpaceCapture,
  type StudentSpaceBackendSnapshot,
} from '~/lib/student-space/backend-snapshot'
import { forgetTimelineEntry } from '~/server/forget-timeline-entry.functions'
import { loadTrajectory } from '~/server/load-trajectory.functions'
import { loadVipsPages } from '~/server/load-vips-pages.functions'
import { loadWiki } from '~/server/load-wiki.functions'
import { runCartographer } from '~/server/run-cartographer.functions'
import { runConnector } from '~/server/run-connector.functions'
import { submitStudentSpaceReflection } from '~/server/submit-student-space-reflection.functions'
import type { SubmitStudentSpaceReflectionResult } from '~/server/submit-student-space-reflection.handler.server'
import { updateMirrorReview } from '~/server/update-mirror-review.functions'

export type StudentSpaceSurface =
  | 'profile'
  | 'reflections'
  | 'trajectory'
  | 'values'
  | 'interests'
  | 'personality'
  | 'skills'

export interface StudentSpaceReflectionInput {
  localCaptureId: string
  transcript?: string
  audioBase64?: string
  mimeType?: string
  mood?: Mood
  contextType?: VipsContextType
  createdAt?: string
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
  submitReflection?: (input: StudentSpaceReflectionInput) => Promise<StudentSpaceReflectionResult>
  updateReflectionReview?: (
    input: StudentSpaceReviewInput,
  ) => Promise<StudentSpaceMirrorEntrySummary>
  runConnector?: () => Promise<unknown>
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
        mirrorEntry: {
          id: result.mirror_entry.id,
          transcript: result.mirror_entry.transcript,
          validation: result.mirror_entry.validation,
          inferredMeaning: result.mirror_entry.inferred_meaning,
          storyReframe: result.mirror_entry.story_reframe,
          contextType: result.mirror_entry.context_type,
          reviewStatus: result.mirror_entry.review_status,
          createdAt: result.mirror_entry.created_at,
        },
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
      if (isFailedConnectorResult(result)) {
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

function isFailedConnectorResult(
  result: unknown,
): result is { status: string; failed: number; processed: number } {
  if (!result || typeof result !== 'object') return false
  const maybe = result as { status?: unknown; failed?: unknown; processed?: unknown }
  const status = typeof maybe.status === 'string' ? maybe.status : ''
  const failed = typeof maybe.failed === 'number' ? maybe.failed : 0
  const processed = typeof maybe.processed === 'number' ? maybe.processed : 0
  const hardStatuses = new Set([
    'timeout',
    'schema_reject',
    'transport_error',
    'auth_error',
    'unknown',
    'missing_mirror',
  ])
  return (
    hardStatuses.has(status) ||
    (status !== 'nothing_to_run' && processed > 0 && failed === processed)
  )
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
