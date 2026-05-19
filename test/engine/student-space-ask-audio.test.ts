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
  vi.restoreAllMocks()
})

describe('Student Space AskSheet audio capture', () => {
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
        reviewStatus: 'pending',
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

  it('forgets a prepared Mirror result without logging or saving a capture', async () => {
    const prepareReflection = vi.fn(async (input: Record<string, unknown>) => ({
      localCaptureId: input.localCaptureId,
      transcript: 'server transcript',
      validation: 'That was recorded.',
      inferredMeaning: 'Voice went through OpenAI first.',
      storyReframe: 'Mirror heard the recording.',
      contextType: 'school',
    }))
    const logPreparedReflection = vi.fn()
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection },
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
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { prepareReflection, logPreparedReflection },
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
