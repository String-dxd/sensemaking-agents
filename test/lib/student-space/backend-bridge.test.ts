import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStudentSpaceBackendBridge } from '~/lib/student-space/backend-bridge'

const runConnectorMock = vi.hoisted(() => vi.fn())
const submitStudentSpaceReflectionMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/run-connector.functions', () => ({
  runConnector: (args: unknown) => runConnectorMock(args),
}))

vi.mock('~/server/forget-timeline-entry.functions', () => ({
  forgetTimelineEntry: vi.fn(),
}))

vi.mock('~/server/load-trajectory.functions', () => ({
  loadTrajectory: vi.fn(),
}))

vi.mock('~/server/load-vips-pages.functions', () => ({
  loadVipsPages: vi.fn(),
}))

vi.mock('~/server/load-wiki.functions', () => ({
  loadWiki: vi.fn(),
}))

vi.mock('~/server/run-cartographer.functions', () => ({
  runCartographer: vi.fn(),
}))

vi.mock('~/server/submit-student-space-reflection.functions', () => ({
  submitStudentSpaceReflection: (args: unknown) => submitStudentSpaceReflectionMock(args),
}))

vi.mock('~/server/update-mirror-review.functions', () => ({
  updateMirrorReview: vi.fn(),
}))

afterEach(() => {
  runConnectorMock.mockReset()
  submitStudentSpaceReflectionMock.mockReset()
})

describe('createStudentSpaceBackendBridge', () => {
  it('returns partial Connector batches so the shell can show failed counts', async () => {
    const result = {
      status: 'partial',
      processed: 2,
      succeeded: 1,
      failed: 1,
      remaining: 0,
      entries: [],
    }
    runConnectorMock.mockResolvedValueOnce(result)

    await expect(createStudentSpaceBackendBridge().runConnector?.()).resolves.toBe(result)
  })

  it('allows partial Connector batches that only signal remaining work', async () => {
    const result = {
      status: 'partial',
      processed: 5,
      succeeded: 5,
      failed: 0,
      remaining: 2,
      entries: [],
    }
    runConnectorMock.mockResolvedValueOnce(result)

    await expect(createStudentSpaceBackendBridge().runConnector?.()).resolves.toBe(result)
  })

  it('passes recorded audio payloads through the Student Space reflection submit function', async () => {
    submitStudentSpaceReflectionMock.mockResolvedValueOnce({
      local_capture_id: 'local-voice',
      mirror_entry: {
        id: 42,
        transcript: 'open ai transcript',
        validation: 'valid',
        inferred_meaning: 'meaning',
        story_reframe: 'story',
        context_type: 'school',
        review_status: 'pending',
        created_at: '2026-05-18T08:00:00.000Z',
      },
    })

    const result = await createStudentSpaceBackendBridge().submitReflection?.({
      localCaptureId: 'local-voice',
      audioBase64: 'YXVkaW8=',
      mimeType: 'audio/webm',
      contextType: 'school',
    })

    expect(submitStudentSpaceReflectionMock).toHaveBeenCalledWith({
      data: {
        localCaptureId: 'local-voice',
        audioBase64: 'YXVkaW8=',
        mimeType: 'audio/webm',
        context_type: 'school',
      },
    })
    expect(result?.mirrorEntry).toMatchObject({
      transcript: 'open ai transcript',
      reviewStatus: 'pending',
    })
  })
})
