import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createStudentSpaceBackendBridge,
  DEMO_CONNECTOR_FINISHED_EVENT,
  resetDemoConnectorBurstStateForTests,
} from '~/lib/student-space/backend-bridge'

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
  // The capture-time Connector's burst-coalescing flags are module-local, so
  // a test that leaves a run un-settled would otherwise swallow the next
  // test's run. Reset them explicitly to keep every case independent.
  resetDemoConnectorBurstStateForTests()
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

/** Yields to the macrotask queue, which drains the whole microtask queue
 * first — enough for the demo-connector chain (runConnector → snapshot load →
 * apply → event dispatch → queued rerun) to settle completely. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const OK_RUN = {
  status: 'ok',
  processed: 1,
  succeeded: 1,
  failed: 0,
  remaining: 0,
  entries: [],
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
      runConnectorMock.mockResolvedValueOnce(OK_RUN)
      const applySnapshot = vi.fn()

      const persistPromise = createStudentSpaceBackendBridge({
        applySnapshot,
      }).logPreparedReflection?.(confirmedInput)
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
      // Plan 066: the fresh snapshot reaches the engine through the host's
      // seam, not through a `window` global.
      expect(applySnapshot).toHaveBeenCalledTimes(1)
      expect(applySnapshot.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          profile: expect.any(Object),
          reflections: expect.any(Array),
        }),
      )
    })

    it('skips the snapshot apply when the host supplied no engine seam', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      mockPersistMirrorOnce('confirmed')
      runConnectorMock.mockResolvedValueOnce(OK_RUN)

      // No `applySnapshot` option — the pre-boot / no-engine case must stay
      // silent rather than throw inside the fire-and-forget chain.
      const result = await createStudentSpaceBackendBridge().logPreparedReflection?.(confirmedInput)
      expect(result?.mirrorEntry.reviewStatus).toBe('confirmed')

      await flushAsync()
      expect(runConnectorMock).toHaveBeenCalledTimes(1)
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

  describe('capture-time Connector burst debounce + acknowledgment event (plan 066)', () => {
    function mockSubmitReflectionOnce() {
      submitStudentSpaceReflectionMock.mockResolvedValueOnce({
        local_capture_id: 'local-voice',
        mirror_entry: {
          id: 77,
          transcript: 'open ai transcript',
          validation: 'valid',
          inferred_meaning: 'meaning',
          story_reframe: 'story',
          context_type: 'school',
          review_status: 'confirmed',
          created_at: '2026-07-25T08:00:00.000Z',
        },
      })
    }

    const voiceInput = {
      localCaptureId: 'local-voice',
      transcript: 'open ai transcript',
      contextType: 'school' as const,
    }

    it('does not start a second Connector run while one is already in flight', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      const inFlight = deferred<typeof OK_RUN>()
      runConnectorMock.mockReturnValueOnce(inFlight.promise)
      mockSubmitReflectionOnce()
      mockSubmitReflectionOnce()
      const bridge = createStudentSpaceBackendBridge()

      await bridge.submitReflection?.(voiceInput)
      await bridge.submitReflection?.(voiceInput)
      await flushAsync()

      // Second capture coalesced into a queued rerun instead of a parallel run.
      expect(runConnectorMock).toHaveBeenCalledTimes(1)

      inFlight.resolve(OK_RUN)
      await flushAsync()
    })

    it('fires exactly one queued rerun after the in-flight run settles', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      const first = deferred<typeof OK_RUN>()
      const second = deferred<typeof OK_RUN>()
      runConnectorMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      mockSubmitReflectionOnce()
      mockSubmitReflectionOnce()
      const bridge = createStudentSpaceBackendBridge()

      await bridge.submitReflection?.(voiceInput)
      await bridge.submitReflection?.(voiceInput)
      await flushAsync()
      expect(runConnectorMock).toHaveBeenCalledTimes(1)

      first.resolve(OK_RUN)
      await flushAsync()
      // Exactly one follow-up run — the newest capture is picked up by the
      // rerun's own candidate scan.
      expect(runConnectorMock).toHaveBeenCalledTimes(2)

      second.resolve(OK_RUN)
      await flushAsync()
      // The queue is empty now, so settling the rerun must not chain further.
      expect(runConnectorMock).toHaveBeenCalledTimes(2)
    })

    it('caps a burst of three captures at one in-flight run plus one rerun', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      const first = deferred<typeof OK_RUN>()
      const second = deferred<typeof OK_RUN>()
      runConnectorMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      mockSubmitReflectionOnce()
      mockSubmitReflectionOnce()
      mockSubmitReflectionOnce()
      const bridge = createStudentSpaceBackendBridge()

      await bridge.submitReflection?.(voiceInput)
      await bridge.submitReflection?.(voiceInput)
      await bridge.submitReflection?.(voiceInput)
      await flushAsync()
      expect(runConnectorMock).toHaveBeenCalledTimes(1)

      first.resolve(OK_RUN)
      await flushAsync()
      expect(runConnectorMock).toHaveBeenCalledTimes(2)

      second.resolve(OK_RUN)
      await flushAsync()
      expect(runConnectorMock).toHaveBeenCalledTimes(2)
    })

    it('dispatches ss:demo-connector-finished with the succeeded count after a processed run', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      runConnectorMock.mockResolvedValueOnce({
        status: 'ok',
        processed: 2,
        succeeded: 2,
        failed: 0,
        remaining: 0,
        entries: [],
      })
      mockSubmitReflectionOnce()
      const details: Array<{ succeeded?: number }> = []
      const listener = (event: Event) => {
        details.push((event as CustomEvent<{ succeeded?: number }>).detail)
      }
      window.addEventListener(DEMO_CONNECTOR_FINISHED_EVENT, listener)

      try {
        await createStudentSpaceBackendBridge().submitReflection?.(voiceInput)
        await flushAsync()
        expect(details).toEqual([{ succeeded: 2 }])
      } finally {
        window.removeEventListener(DEMO_CONNECTOR_FINISHED_EVENT, listener)
      }
    })

    it('dispatches nothing when the run processed no entries', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      runConnectorMock.mockResolvedValueOnce({
        status: 'nothing_to_run',
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
        entries: [],
      })
      mockSubmitReflectionOnce()
      const listener = vi.fn()
      window.addEventListener(DEMO_CONNECTOR_FINISHED_EVENT, listener)

      try {
        await createStudentSpaceBackendBridge().submitReflection?.(voiceInput)
        await flushAsync()
        expect(runConnectorMock).toHaveBeenCalledTimes(1)
        expect(listener).not.toHaveBeenCalled()
      } finally {
        window.removeEventListener(DEMO_CONNECTOR_FINISHED_EVENT, listener)
      }
    })

    it('dispatches nothing when the run fails — silence is the failure UX', async () => {
      vi.stubEnv('VITE_DEMO_CONNECTOR_AT_CAPTURE', '1')
      runConnectorMock.mockRejectedValueOnce(new Error('connector down'))
      mockSubmitReflectionOnce()
      const listener = vi.fn()
      const applySnapshot = vi.fn()
      window.addEventListener(DEMO_CONNECTOR_FINISHED_EVENT, listener)

      try {
        const result = await createStudentSpaceBackendBridge({
          applySnapshot,
        }).submitReflection?.(voiceInput)
        expect(result?.mirrorEntry.reviewStatus).toBe('confirmed')
        await flushAsync()
        expect(listener).not.toHaveBeenCalled()
        expect(applySnapshot).not.toHaveBeenCalled()
      } finally {
        window.removeEventListener(DEMO_CONNECTOR_FINISHED_EVENT, listener)
      }
    })
  })
})
