import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStudentSpaceBackendBridge } from '~/lib/student-space/backend-bridge'

const runConnectorMock = vi.hoisted(() => vi.fn())
const submitStudentSpaceReflectionMock = vi.hoisted(() => vi.fn())
const prepareStudentSpaceReflectionMock = vi.hoisted(() => vi.fn())
const persistMirrorMock = vi.hoisted(() => vi.fn())
const transcribeMirrorMock = vi.hoisted(() => vi.fn())
const loadVipsPagesMock = vi.hoisted(() => vi.fn())
const loadWikiMock = vi.hoisted(() => vi.fn())
const loadTrajectoryMock = vi.hoisted(() => vi.fn())
const loadAuthMenuMock = vi.hoisted(() => vi.fn())

// Minimal-but-valid default resolutions so `loadBackendSnapshot()` (invoked
// by the demo-connector helper's snapshot refresh) can run its real mapper
// code without throwing on missing shape. Individual tests override via
// `mockResolvedValueOnce` where they need to.
loadVipsPagesMock.mockResolvedValue({
  pages: [],
  timeline_by_dimension: {},
  student_profile: null,
  recent_moods: [],
})
loadWikiMock.mockResolvedValue({ entries: [] })
loadTrajectoryMock.mockResolvedValue({ trajectory: null })
loadAuthMenuMock.mockResolvedValue(null)

vi.mock('~/server/run-connector.functions', () => ({
  runConnector: (args: unknown) => runConnectorMock(args),
}))

vi.mock('~/server/forget-timeline-entry.functions', () => ({
  forgetTimelineEntry: vi.fn(),
}))

vi.mock('~/server/load-trajectory.functions', () => ({
  loadTrajectory: () => loadTrajectoryMock(),
}))

vi.mock('~/server/load-vips-pages.functions', () => ({
  loadVipsPages: () => loadVipsPagesMock(),
}))

vi.mock('~/server/load-wiki.functions', () => ({
  loadWiki: () => loadWikiMock(),
}))

vi.mock('~/server/auth-menu.functions', () => ({
  loadAuthMenu: () => loadAuthMenuMock(),
}))

vi.mock('~/server/run-cartographer.functions', () => ({
  runCartographer: vi.fn(),
}))

vi.mock('~/server/persist-mirror.functions', () => ({
  persistMirror: (args: unknown) => persistMirrorMock(args),
}))

vi.mock('~/server/prepare-student-space-reflection.functions', () => ({
  prepareStudentSpaceReflection: (args: unknown) => prepareStudentSpaceReflectionMock(args),
}))

vi.mock('~/server/submit-student-space-reflection.functions', () => ({
  submitStudentSpaceReflection: (args: unknown) => submitStudentSpaceReflectionMock(args),
}))

vi.mock('~/server/transcribe-mirror.functions', () => ({
  transcribeMirror: (args: unknown) => transcribeMirrorMock(args),
}))

vi.mock('~/server/update-mirror-review.functions', () => ({
  updateMirrorReview: vi.fn(),
}))

afterEach(() => {
  runConnectorMock.mockReset()
  submitStudentSpaceReflectionMock.mockReset()
  prepareStudentSpaceReflectionMock.mockReset()
  persistMirrorMock.mockReset()
  transcribeMirrorMock.mockReset()
  // Clear (not reset) the snapshot-refresh mocks so their module-level
  // default resolved values (set above) survive between tests; only their
  // per-test `mockResolvedValueOnce` overrides and call history are wiped.
  loadVipsPagesMock.mockClear()
  loadWikiMock.mockClear()
  loadTrajectoryMock.mockClear()
  loadAuthMenuMock.mockClear()
  vi.unstubAllEnvs()
})

/** Waits a couple microtask turns so a fire-and-forget helper's internal
 * promise chain (runConnector → refreshSnapshot → console.info) has a
 * chance to settle before assertions run. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

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
        review_status: 'confirmed',
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
      reviewStatus: 'confirmed',
    })
  })

  it('prepares a recorded reflection without persisting it', async () => {
    prepareStudentSpaceReflectionMock.mockResolvedValueOnce({
      local_capture_id: 'local-voice',
      transcript: 'open ai transcript',
      context_type: 'school',
      mood: null,
      output: {
        validation: 'valid',
        inferred_meaning: 'meaning',
        story_reframe: 'story',
      },
      eval_review: null,
      transcription: { transcript: 'open ai transcript', durationMs: 12 },
    })

    const result = await createStudentSpaceBackendBridge().prepareReflection?.({
      localCaptureId: 'local-voice',
      audioBase64: 'YXVkaW8=',
      mimeType: 'audio/webm',
      contextType: 'school',
    })

    expect(prepareStudentSpaceReflectionMock).toHaveBeenCalledWith({
      data: {
        localCaptureId: 'local-voice',
        audioBase64: 'YXVkaW8=',
        mimeType: 'audio/webm',
        context_type: 'school',
      },
    })
    expect(persistMirrorMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      localCaptureId: 'local-voice',
      transcript: 'open ai transcript',
      validation: 'valid',
      inferredMeaning: 'meaning',
      storyReframe: 'story',
      contextType: 'school',
    })
  })

  it('transcribes recorded audio through the OpenAI transcription server function', async () => {
    transcribeMirrorMock.mockResolvedValueOnce({
      transcript: 'open ai transcript',
      durationMs: 22,
    })

    const result = await createStudentSpaceBackendBridge().transcribeReflectionAudio?.({
      audioBase64: 'YXVkaW8=',
      mimeType: 'audio/webm',
    })

    expect(transcribeMirrorMock).toHaveBeenCalledWith({
      data: {
        audioBase64: 'YXVkaW8=',
        mimeType: 'audio/webm',
      },
    })
    expect(result).toEqual({
      transcript: 'open ai transcript',
      durationMs: 22,
    })
  })

  it('logs a prepared reflection as confirmed through Mirror persistence', async () => {
    persistMirrorMock.mockResolvedValueOnce({
      mirror_entry: {
        id: 42,
        transcript: 'open ai transcript',
        validation: 'valid',
        inferred_meaning: 'meaning',
        story_reframe: 'story',
        context_type: 'school',
        review_status: 'confirmed',
        created_at: '2026-05-18T08:00:00.000Z',
      },
    })

    const result = await createStudentSpaceBackendBridge().logPreparedReflection?.({
      localCaptureId: 'local-voice',
      transcript: 'open ai transcript',
      validation: 'valid',
      inferredMeaning: 'meaning',
      storyReframe: 'story',
      contextType: 'school',
      mood: 'joy',
      evalReview: { verdict: 'pass' },
      transcription: { durationMs: 12 },
    })

    expect(persistMirrorMock).toHaveBeenCalledWith({
      data: {
        entry: {
          transcript: 'open ai transcript',
          validation: 'valid',
          inferred_meaning: 'meaning',
          story_reframe: 'story',
        },
        context_type: 'school',
        review_status: 'confirmed',
        mood: 'joy',
        raw_output: {
          validation: 'valid',
          inferred_meaning: 'meaning',
          story_reframe: 'story',
          eval_review: { verdict: 'pass' },
          transcription: { durationMs: 12 },
        },
        trace: {
          source: 'student-space',
          local_capture_id: 'local-voice',
          eval_review: { verdict: 'pass' },
          prepared: true,
        },
      },
    })
    expect(result).toMatchObject({
      localCaptureId: 'local-voice',
      mirrorEntry: {
        id: 42,
        transcript: 'open ai transcript',
        reviewStatus: 'confirmed',
      },
    })
  })

  it('persists a forgotten prepared reflection when the draft is explicitly forgotten', async () => {
    persistMirrorMock.mockResolvedValueOnce({
      mirror_entry: {
        id: 43,
        transcript: 'discarded transcript',
        validation: 'valid',
        inferred_meaning: 'meaning',
        story_reframe: 'story',
        context_type: 'school',
        review_status: 'forgotten',
        created_at: '2026-05-18T08:00:00.000Z',
      },
    })

    const result = await createStudentSpaceBackendBridge().forgetPreparedReflection?.({
      localCaptureId: 'local-forget',
      transcript: 'discarded transcript',
      validation: 'valid',
      inferredMeaning: 'meaning',
      storyReframe: 'story',
      contextType: 'school',
    })

    expect(persistMirrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          review_status: 'forgotten',
          trace: expect.objectContaining({
            source: 'student-space',
            local_capture_id: 'local-forget',
            prepared: true,
          }),
        }),
      }),
    )
    expect(result?.mirrorEntry).toMatchObject({
      id: 43,
      reviewStatus: 'forgotten',
    })
  })

  describe('demo-flagged capture-time Connector run (plan 041)', () => {
    const confirmedInput = {
      localCaptureId: 'local-demo',
      transcript: 'open ai transcript',
      validation: 'valid',
      inferredMeaning: 'meaning',
      storyReframe: 'story',
      contextType: 'school' as const,
    }

    function mockPersistMirrorOnce(reviewStatus: 'confirmed' | 'forgotten') {
      persistMirrorMock.mockResolvedValueOnce({
        mirror_entry: {
          id: 99,
          transcript: 'open ai transcript',
          validation: 'valid',
          inferred_meaning: 'meaning',
          story_reframe: 'story',
          context_type: 'school',
          review_status: reviewStatus,
          created_at: '2026-07-23T08:00:00.000Z',
        },
      })
    }

    it('does not run the Connector after a confirmed capture with the flag unset (default)', async () => {
      mockPersistMirrorOnce('confirmed')

      const result = await createStudentSpaceBackendBridge().logPreparedReflection?.(confirmedInput)

      await flushMicrotasks()
      expect(result?.mirrorEntry.reviewStatus).toBe('confirmed')
      expect(runConnectorMock).not.toHaveBeenCalled()
    })

    it('runs the Connector then refreshes the snapshot after a confirmed capture with the flag on', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      mockPersistMirrorOnce('confirmed')
      runConnectorMock.mockResolvedValueOnce({
        status: 'ok',
        processed: 1,
        succeeded: 1,
        failed: 0,
        remaining: 0,
        entries: [],
      })

      const persistPromise =
        createStudentSpaceBackendBridge().logPreparedReflection?.(confirmedInput)
      // The persist promise must resolve without waiting on the Connector
      // run: at this point runConnector has not even been invoked yet
      // (it is scheduled fire-and-forget inside a `void (async () => ...)`).
      const result = await persistPromise
      expect(result?.mirrorEntry.reviewStatus).toBe('confirmed')

      await flushMicrotasks()
      expect(runConnectorMock).toHaveBeenCalledWith({ data: { limit: 3 } })
      expect(loadVipsPagesMock).toHaveBeenCalled()
      expect(loadWikiMock).toHaveBeenCalled()
      expect(loadTrajectoryMock).toHaveBeenCalled()
    })

    it('resolves the persist result even when the flagged Connector run rejects', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      mockPersistMirrorOnce('confirmed')
      runConnectorMock.mockRejectedValueOnce(new Error('connector down'))

      const result = await createStudentSpaceBackendBridge().logPreparedReflection?.(confirmedInput)
      expect(result?.mirrorEntry.reviewStatus).toBe('confirmed')

      // Give the swallowed rejection a turn to surface as an unhandled
      // rejection if the helper failed to catch it — vitest fails the test
      // run on an unhandled rejection by default, so reaching here green is
      // itself the assertion.
      await flushMicrotasks()
    })

    it('does not run the Connector when a forgotten reflection is persisted, even with the flag on', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      mockPersistMirrorOnce('forgotten')

      const result =
        await createStudentSpaceBackendBridge().forgetPreparedReflection?.(confirmedInput)

      await flushMicrotasks()
      expect(result?.mirrorEntry.reviewStatus).toBe('forgotten')
      expect(runConnectorMock).not.toHaveBeenCalled()
    })
  })
})
