import { waitFor } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import AskSheet from '~/engine/student-space/Game/View/AskSheet.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'

let getUserMediaCalls: MediaStreamConstraints[] = []
let lastRecorder: { state: RecordingState } | null = null

beforeEach(() => {
  getUserMediaCalls = []
  lastRecorder = null
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn((constraints: MediaStreamConstraints) => {
        getUserMediaCalls.push(constraints)
        return Promise.resolve({
          getTracks: () => [{ stop: vi.fn() }],
        } as unknown as MediaStream)
      }),
    },
  })

  class MockMediaRecorder {
    state: RecordingState = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((event: BlobEvent) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((event: Event) => void) | null = null

    constructor(_stream: MediaStream, opts?: MediaRecorderOptions) {
      this.mimeType = opts?.mimeType ?? 'audio/webm'
      lastRecorder = this
    }

    start() {
      this.state = 'recording'
    }

    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) } as BlobEvent)
      this.onstop?.()
    }

    static isTypeSupported() {
      return true
    }
  }

  // @ts-expect-error happy-dom does not provide MediaRecorder.
  globalThis.MediaRecorder = MockMediaRecorder
  // Force the Student Space path to prove Web Speech is not required.
  // @ts-expect-error vendor-prefixed browser API is intentionally absent.
  window.SpeechRecognition = undefined
  // @ts-expect-error vendor-prefixed browser API is intentionally absent.
  window.webkitSpeechRecognition = undefined
})

afterEach(() => {
  state.instance = null
  OverlayController.instance = null
  document.body.innerHTML = ''
  document.body.className = ''
  Reflect.deleteProperty(globalThis, 'RTCPeerConnection')
  vi.restoreAllMocks()
})

describe('Student Space AskSheet audio capture', () => {
  it('uses Realtime voice capture when the backend exposes a Realtime Mirror session', async () => {
    class MockRTCPeerConnection {}
    // @ts-expect-error happy-dom does not provide RTCPeerConnection.
    globalThis.RTCPeerConnection = MockRTCPeerConnection

    const prepared = {
      localCaptureId: 'ask-realtime',
      transcript: 'realtime transcript',
      validation: 'That was heard live.',
      inferredMeaning: 'Voice went straight through Realtime.',
      storyReframe: 'Kira heard the Realtime session.',
      contextType: 'school',
      transcription: { provider: 'openai_realtime', transcript: 'realtime transcript' },
    }
    const stop = vi.fn(async () => prepared)
    const abort = vi.fn()
    const createRealtimeMirrorCapture = vi.fn(async (input: Record<string, unknown>) => {
      const onConversationUpdate = input.onConversationUpdate as
        | ((message: Record<string, unknown>) => void)
        | undefined
      onConversationUpdate?.({
        id: 'student-1',
        role: 'student',
        text: 'Can you hear me?',
        status: 'final',
      })
      onConversationUpdate?.({
        id: 'kira-1',
        role: 'kira',
        text: 'I can hear you.',
        status: 'final',
      })
      return { stop, abort }
    })
    const prepareReflection = vi.fn()
    const logPreparedReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      mirrorEntry: {
        id: 88,
        transcript: 'realtime transcript',
        validation: 'That was heard live.',
        storyReframe: 'Kira heard the Realtime session.',
        inferredMeaning: 'Voice went straight through Realtime.',
        contextType: 'school',
        reviewStatus: 'confirmed',
      },
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { createRealtimeMirrorCapture, prepareReflection, logPreparedReflection },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(createRealtimeMirrorCapture).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute(
        'data-stage',
        'recording',
      ),
    )
    expect(document.querySelector('.ask-sheet__eyebrow--live')?.textContent).toContain(
      'Live with Kira',
    )
    expect(document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.textContent).toContain(
      'Stop session',
    )
    expect(createRealtimeMirrorCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: expect.stringMatching(/^ask-/),
        contextType: 'school',
        onConversationUpdate: expect.any(Function),
      }),
    )
    expect(document.querySelector('.ask-live-chat__bubble--student')?.textContent).toContain(
      'Can you hear me?',
    )
    expect(document.querySelector('.ask-live-chat__bubble--kira')?.textContent).toContain(
      'I can hear you.',
    )
    expect(document.querySelector('.ask-sheet__hint--live')?.textContent).toBe('')
    expect(getUserMediaCalls).toEqual([])
    expect(lastRecorder).toBeNull()

    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    await waitFor(
      () =>
        expect(document.querySelector('.ask-reframe__prose')?.textContent).toContain(
          'Kira heard the Realtime session',
        ),
      { timeout: 2500 },
    )
    expect(prepareReflection).not.toHaveBeenCalled()

    document.querySelector<HTMLButtonElement>('.ask-sheet__log--reframe')?.click()
    await waitFor(() => expect(logPreparedReflection).toHaveBeenCalledTimes(1))
    expect(logPreparedReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: 'realtime transcript',
        transcription: { provider: 'openai_realtime', transcript: 'realtime transcript' },
      }),
    )
    expect(captures.entries[0]).toMatchObject({
      text: 'realtime transcript',
      backendMirrorEntryId: 88,
      syncStatus: 'synced',
    })

    sheet.dispose()
  })

  it('shows Log and Continue session when a Realtime reading fails', async () => {
    class MockRTCPeerConnection {}
    // @ts-expect-error happy-dom does not provide RTCPeerConnection.
    globalThis.RTCPeerConnection = MockRTCPeerConnection

    const stop = vi.fn(async () => {
      throw new Error('Realtime Mirror timed out.')
    })
    const abort = vi.fn()
    const createRealtimeMirrorCapture = vi.fn(async (input: Record<string, unknown>) => {
      const onConversationUpdate = input.onConversationUpdate as
        | ((message: Record<string, unknown>) => void)
        | undefined
      onConversationUpdate?.({
        id: 'student-failed',
        role: 'student',
        text: 'Today we had a birthday celebration.',
        status: 'final',
      })
      return { stop, abort }
    })
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { createRealtimeMirrorCapture, prepareReflection: vi.fn() },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(createRealtimeMirrorCapture).toHaveBeenCalledTimes(1))
    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute('data-stage', 'reframe'),
    )

    const editButton = document.querySelector<HTMLButtonElement>('.ask-sheet__edit')
    const continueButton = document.querySelector<HTMLButtonElement>('.ask-sheet__talk-more')
    const forgetButton = document.querySelector<HTMLButtonElement>('.ask-sheet__forget-draft')
    const logButton = document.querySelector<HTMLButtonElement>('.ask-sheet__log--reframe')
    expect(editButton?.hidden).toBe(false)
    expect(continueButton?.hidden).toBe(false)
    expect(continueButton?.textContent).toContain('Continue session')
    expect(forgetButton?.hidden).toBe(false)
    expect(logButton?.hidden).toBe(false)
    expect(logButton?.disabled).toBe(false)

    logButton?.click()
    expect(captures.entries[0]).toMatchObject({
      text: 'Today we had a birthday celebration.',
      syncStatus: 'local',
    })

    sheet.dispose()
  })

  it('continues a stopped Realtime session from the failed reading actions', async () => {
    class MockRTCPeerConnection {}
    // @ts-expect-error happy-dom does not provide RTCPeerConnection.
    globalThis.RTCPeerConnection = MockRTCPeerConnection

    const stop = vi.fn(async () => {
      throw new Error('Realtime Mirror timed out.')
    })
    const abort = vi.fn()
    const createRealtimeMirrorCapture = vi.fn(async (input: Record<string, unknown>) => {
      const onConversationUpdate = input.onConversationUpdate as
        | ((message: Record<string, unknown>) => void)
        | undefined
      onConversationUpdate?.({
        id: `student-${createRealtimeMirrorCapture.mock.calls.length}`,
        role: 'student',
        text: 'Can you hear me?',
        status: 'final',
      })
      return { stop, abort }
    })
    state.instance = {
      captures: makeCaptures(),
      backend: { createRealtimeMirrorCapture, prepareReflection: vi.fn() },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(createRealtimeMirrorCapture).toHaveBeenCalledTimes(1))
    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute('data-stage', 'reframe'),
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__talk-more')?.click()

    await waitFor(() => expect(createRealtimeMirrorCapture).toHaveBeenCalledTimes(2))
    expect(createRealtimeMirrorCapture.mock.calls[1]?.[0]).toMatchObject({
      initialTranscript: 'Can you hear me?',
      contextType: 'school',
    })
    expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute('data-stage', 'recording')

    sheet.dispose()
  })

  it('uses direct OpenAI transcription before preparing MediaRecorder audio with Mirror', async () => {
    const transcribeReflectionAudio = vi.fn(async () => ({
      transcript: 'OpenAI heard the recording.',
      durationMs: 19,
    }))
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: input.transcript,
      validation: 'That was transcribed first.',
      inferredMeaning: 'The transcript arrived before Mirror.',
      storyReframe: 'Kira read the OpenAI transcript.',
      contextType: 'school',
    }))
    const logPreparedReflection = vi.fn(async (prepared: Record<string, unknown>) => ({
      localCaptureId: prepared.localCaptureId,
      mirrorEntry: {
        id: 79,
        transcript: prepared.transcript,
        validation: 'That was transcribed first.',
        storyReframe: 'Kira read the OpenAI transcript.',
        inferredMeaning: 'The transcript arrived before Mirror.',
        contextType: 'school',
        reviewStatus: 'confirmed',
      },
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { transcribeReflectionAudio, prepareReflection, logPreparedReflection },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(lastRecorder?.state).toBe('recording'))
    expect(document.querySelector('.ask-sheet__hint--live')?.textContent).toContain(
      'OpenAI will transcribe',
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()

    await waitFor(() => expect(transcribeReflectionAudio).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(prepareReflection).toHaveBeenCalledTimes(1))
    expect(prepareReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: expect.stringMatching(/^ask-/),
        transcript: 'OpenAI heard the recording.',
        contextType: 'school',
      }),
    )
    const preparedInput = prepareReflection.mock.calls[0]?.[0]
    expect(preparedInput).not.toHaveProperty('audioBase64')
    expect(document.querySelector('.ask-live-chat__bubble--student')?.textContent).toContain(
      'OpenAI heard the recording.',
    )
    await waitFor(
      () =>
        expect(document.querySelector('.ask-reframe__prose')?.textContent).toContain(
          'Kira read the OpenAI transcript',
        ),
      { timeout: 2500 },
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__log--reframe')?.click()
    await waitFor(() => expect(logPreparedReflection).toHaveBeenCalledTimes(1))
    expect(logPreparedReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: 'OpenAI heard the recording.',
        transcription: { transcript: 'OpenAI heard the recording.', durationMs: 19 },
      }),
    )
    expect(captures.entries[0]).toMatchObject({
      text: 'OpenAI heard the recording.',
      backendMirrorEntryId: 79,
      syncStatus: 'synced',
    })

    sheet.dispose()
  })

  it('records audio, prepares a Mirror result, then logs only after the student chooses Log', async () => {
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: 'server transcript',
      validation: 'That was recorded.',
      inferredMeaning: 'Voice went through OpenAI first.',
      storyReframe: 'Mirror heard the recording.',
      contextType: 'school',
    }))
    const logPreparedReflection = vi.fn(async (prepared: Record<string, unknown>) => ({
      localCaptureId: prepared.localCaptureId,
      mirrorEntry: {
        id: 77,
        transcript: 'server transcript',
        validation: 'That was recorded.',
        storyReframe: 'Mirror heard the recording.',
        inferredMeaning: 'Voice went through OpenAI first.',
        contextType: 'school',
        reviewStatus: 'confirmed',
      },
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(getUserMediaCalls).toEqual([{ audio: true }]))
    await waitFor(() => expect(lastRecorder?.state).toBe('recording'))
    expect(getUserMediaCalls[0]).not.toHaveProperty('video')

    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()
    await waitFor(() => expect(prepareReflection).toHaveBeenCalledTimes(1))
    expect(prepareReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: expect.stringMatching(/^ask-/),
        audioBase64: expect.any(String),
        mimeType: expect.stringContaining('audio/webm'),
        contextType: 'school',
      }),
    )
    const preparedInput = prepareReflection.mock.calls[0]?.[0]
    expect(preparedInput).toBeDefined()
    if (!preparedInput) throw new Error('prepared input missing')
    expect(preparedInput).not.toHaveProperty('transcript')
    expect(captures.entries).toHaveLength(0)
    await waitFor(() =>
      expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute('data-stage', 'reframe'),
    )
    await waitFor(() =>
      expect(document.querySelector('.ask-reframe__prose')?.textContent).toContain(
        'Mirror heard the recording',
      ),
    )
    expect(document.querySelector<HTMLButtonElement>('.ask-sheet__forget-draft')?.hidden).toBe(
      false,
    )
    expect(document.querySelector<HTMLButtonElement>('.ask-sheet__edit')?.hidden).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('.ask-sheet__talk-more')?.hidden).toBe(true)

    const logButton = document.querySelector<HTMLButtonElement>('.ask-sheet__log--reframe')
    logButton?.click()
    logButton?.click()

    await waitFor(() => expect(logPreparedReflection).toHaveBeenCalledTimes(1))
    expect(logPreparedReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: preparedInput.localCaptureId,
        transcript: 'server transcript',
        storyReframe: 'Mirror heard the recording.',
      }),
    )
    expect(captures.entries[0]).toMatchObject({
      id: preparedInput.localCaptureId,
      text: 'server transcript',
      backendMirrorEntryId: 77,
      syncStatus: 'synced',
    })

    sheet.dispose()
  })

  it('marks a prepared Mirror result forgotten without logging or saving a capture', async () => {
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: 'server transcript',
      validation: 'That was recorded.',
      inferredMeaning: 'Voice went through OpenAI first.',
      storyReframe: 'Mirror heard the recording.',
      contextType: 'school',
    }))
    const logPreparedReflection = vi.fn()
    const forgetPreparedReflection = vi.fn(async () => ({
      localCaptureId: 'local-voice',
      mirrorEntry: {
        id: 78,
        transcript: 'server transcript',
        validation: 'That was recorded.',
        inferredMeaning: 'Voice went through OpenAI first.',
        storyReframe: 'Mirror heard the recording.',
        contextType: 'school',
        reviewStatus: 'forgotten',
        createdAt: '2026-05-18T08:00:00.000Z',
      },
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection, forgetPreparedReflection },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(lastRecorder?.state).toBe('recording'))
    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()
    await waitFor(() => expect(prepareReflection).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(document.querySelector('.ask-reframe__prose')?.textContent).toContain(
        'Mirror heard the recording',
      ),
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__forget-draft')?.click()

    await waitFor(() => expect(forgetPreparedReflection).toHaveBeenCalledTimes(1))
    expect(logPreparedReflection).not.toHaveBeenCalled()
    expect(captures.entries).toHaveLength(0)

    sheet.dispose()
  })

  it('does not start Mirror preparation if the student forgets while audio is still encoding', async () => {
    let resolveArrayBuffer: (buffer: ArrayBuffer) => void = () => {}
    const arrayBuffer = new Promise<ArrayBuffer>((resolve) => {
      resolveArrayBuffer = resolve
    })
    const arrayBufferSpy = vi
      .spyOn(Blob.prototype, 'arrayBuffer')
      .mockImplementationOnce(() => arrayBuffer)
    const prepareReflection = vi.fn()
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection: vi.fn() },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(lastRecorder?.state).toBe('recording'))
    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()
    await waitFor(() =>
      expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute('data-stage', 'reframe'),
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__forget-draft')?.click()
    resolveArrayBuffer(new Uint8Array([97, 117, 100, 105, 111]).buffer)
    await Promise.resolve()
    await Promise.resolve()

    expect(prepareReflection).not.toHaveBeenCalled()
    expect(captures.entries).toHaveLength(0)

    arrayBufferSpy.mockRestore()
    sheet.dispose()
  })

  it('prepares typed reflections from the transcript instead of audio', async () => {
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: input.transcript,
      validation: 'That sounds typed.',
      inferredMeaning: 'The typed note still goes through Mirror.',
      storyReframe: 'A typed reflection became a Mirror draft.',
      contextType: 'school',
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection: vi.fn() },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    const input = document.querySelector<HTMLTextAreaElement>('.ask-sheet__input')
    if (!input) throw new Error('Ask input missing')
    input.value = 'I wanted the project to help someone.'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('.ask-sheet__save')?.click()

    await waitFor(() => expect(prepareReflection).toHaveBeenCalledTimes(1))
    expect(prepareReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: expect.stringMatching(/^ask-/),
        transcript: 'I wanted the project to help someone.',
        contextType: 'school',
      }),
    )
    const preparedInput = prepareReflection.mock.calls[0]?.[0]
    expect(preparedInput).not.toHaveProperty('audioBase64')
    expect(captures.entries).toHaveLength(0)

    sheet.dispose()
  })

  it('offers multimodal composer actions and prepares a feeling-only reflection', async () => {
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: input.transcript,
      mood: input.mood,
      validation: 'That feeling can be here.',
      inferredMeaning: 'The student started with a feeling.',
      storyReframe: 'Kira held the chosen feeling.',
      contextType: 'school',
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection: vi.fn() },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    expect(document.querySelector('[data-testid="kira-multimodal-composer"]')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('.ask-sheet__save')?.disabled).toBe(true)

    document.querySelector<HTMLButtonElement>('.ask-sheet__emoji-toggle')?.click()
    document
      .querySelector<HTMLButtonElement>('.ask-sheet__emoji-option[data-emotion="joy"]')
      ?.click()

    const saveButton = document.querySelector<HTMLButtonElement>('.ask-sheet__save')
    expect(saveButton?.disabled).toBe(false)
    saveButton?.click()

    await waitFor(() => expect(prepareReflection).toHaveBeenCalledTimes(1))
    expect(prepareReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: expect.stringMatching(/^ask-/),
        transcript: 'I feel joy.',
        mood: 'joy',
        contextType: 'school',
      }),
    )
    expect(captures.entries).toHaveLength(0)

    sheet.dispose()
  })

  it('closes a prepared reading without logging when the student backs out', async () => {
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: input.transcript,
      validation: 'That sounds typed.',
      inferredMeaning: 'The typed note still goes through Mirror.',
      storyReframe: 'A typed reflection became a Mirror draft.',
      contextType: 'school',
    }))
    const logPreparedReflection = vi.fn()
    const forgetPreparedReflection = vi.fn()
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection, forgetPreparedReflection },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    const input = document.querySelector<HTMLTextAreaElement>('.ask-sheet__input')
    if (!input) throw new Error('Ask input missing')
    input.value = 'I wanted the project to help someone.'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('.ask-sheet__save')?.click()

    await waitFor(() => expect(prepareReflection).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(document.querySelector('.ask-reframe__prose')?.textContent).toContain(
        'A typed reflection became',
      ),
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__close')?.click()

    expect(logPreparedReflection).not.toHaveBeenCalled()
    expect(forgetPreparedReflection).not.toHaveBeenCalled()
    expect(captures.entries).toHaveLength(0)

    sheet.dispose()
  })
})

function makeCaptures() {
  const captures = {
    entries: [] as Array<Record<string, unknown>>,
    add(payload: Record<string, unknown>) {
      const entry = {
        id: 'local-1',
        createdAt: '2026-05-18T08:00:00.000Z',
        entryDate: '2026-05-18',
        ...payload,
      }
      captures.entries.push(entry)
      return entry
    },
    patch(id: string, updates: Record<string, unknown>) {
      const entry = captures.entries.find((candidate) => candidate.id === id)
      if (!entry) return null
      Object.assign(entry, updates)
      return entry
    },
  }
  return captures
}
