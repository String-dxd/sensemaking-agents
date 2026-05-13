import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MirrorSession } from '~/components/MirrorSession'

vi.mock('~/server/persist-mirror.functions', () => ({
  persistMirror: vi.fn(),
}))

vi.mock('~/server/run-mirror.functions', () => ({
  runMirror: vi.fn(),
}))

vi.mock('~/server/transcribe-mirror.functions', () => ({
  transcribeMirror: vi.fn(),
}))

let activeRecorder: MockMediaRecorder | null = null

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true)

  mimeType = 'audio/webm'
  state: RecordingState = 'inactive'
  ondataavailable: ((ev: BlobEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onstop: (() => void) | null = null

  constructor() {
    activeRecorder = this
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

function installBrowserAudioMocks() {
  const source = { connect: vi.fn() }
  const analyser = {
    fftSize: 1024,
    getFloatTimeDomainData: vi.fn((buf: Float32Array) => buf.fill(0)),
  }
  const AudioContextMock = vi.fn(() => ({
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    close: vi.fn().mockResolvedValue(undefined),
  }))

  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock })
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: AudioContextMock,
  })
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: MockMediaRecorder })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: MockMediaRecorder,
  })
  Object.defineProperty(window, 'MediaStream', {
    configurable: true,
    value: class {
      constructor(readonly tracks: MediaStreamTrack[]) {}
      getAudioTracks() {
        return this.tracks
      }
      getTracks() {
        return this.tracks
      }
    },
  })
  Object.defineProperty(globalThis, 'MediaStream', {
    configurable: true,
    value: window.MediaStream,
  })
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: vi.fn(() => 1),
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: window.requestAnimationFrame,
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: window.cancelAnimationFrame,
  })
}

function installMic(trackStop: ReturnType<typeof vi.fn>) {
  const track = {
    kind: 'audio',
    label: 'Test microphone',
    stop: trackStop,
  }
  const stream = {
    getTracks: vi.fn(() => [track]),
    getAudioTracks: vi.fn(() => [track]),
  }

  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
}

beforeEach(() => {
  activeRecorder = null
  installBrowserAudioMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MirrorSession recorder lifecycle', () => {
  it('stops the mic if recorder setup fails after permission is granted', async () => {
    const trackStop = vi.fn()
    installMic(trackStop)
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('Audio setup failed')
      }),
    })
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: window.AudioContext,
    })

    render(<MirrorSession />)

    await userEvent.click(screen.getByTestId('start-button'))

    await waitFor(() => expect(trackStop).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Could not acquire microphone: Audio setup failed/),
    ).toBeVisible()
  })

  it('fails closed and stops the mic when MediaRecorder errors while active', async () => {
    const trackStop = vi.fn()
    installMic(trackStop)

    render(<MirrorSession />)

    await userEvent.click(screen.getByTestId('start-button'))
    await screen.findByText(/listening/)

    act(() => {
      activeRecorder?.onerror?.(new ErrorEvent('error', { error: new Error('Recorder exploded') }))
    })

    await waitFor(() => expect(trackStop).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Recorder exploded')).toBeVisible()
  })
})
