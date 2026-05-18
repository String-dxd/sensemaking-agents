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
  it('records audio and submits the blob through the backend reflection bridge', async () => {
    const submitReflection = vi.fn(async (_input: Record<string, unknown>) => ({
      mirrorEntry: {
        id: 77,
        transcript: 'server transcript',
        storyReframe: 'Mirror heard the recording.',
        inferredMeaning: 'Voice went through OpenAI first.',
        contextType: 'school',
        reviewStatus: 'pending',
      },
    }))
    const captures = makeCaptures()
    state.instance = {
      captures,
      backend: { submitReflection },
    }
    OverlayController.instance = new OverlayController()

    const sheet = new AskSheet() as { open: () => void; dispose: () => void }
    sheet.open()

    document.querySelector<HTMLButtonElement>('.ask-sheet__mic')?.click()
    await waitFor(() => expect(getUserMediaCalls).toEqual([{ audio: true }]))
    await waitFor(() => expect(lastRecorder?.state).toBe('recording'))
    expect(getUserMediaCalls[0]).not.toHaveProperty('video')

    document.querySelector<HTMLButtonElement>('.ask-sheet__stop')?.click()
    await waitFor(() =>
      expect(document.querySelector('.ask-sheet__inner')).toHaveAttribute('data-stage', 'review'),
    )

    document.querySelector<HTMLButtonElement>('.ask-sheet__log')?.click()

    await waitFor(() => expect(submitReflection).toHaveBeenCalledTimes(1))
    expect(submitReflection).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: 'local-1',
        audioBase64: expect.any(String),
        mimeType: expect.stringContaining('audio/webm'),
        contextType: 'school',
      }),
    )
    const submitted = submitReflection.mock.calls[0]?.[0]
    expect(submitted).not.toHaveProperty('transcript')
    expect(captures.entries[0]).toMatchObject({
      text: 'server transcript',
      backendMirrorEntryId: 77,
      syncStatus: 'synced',
    })

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
