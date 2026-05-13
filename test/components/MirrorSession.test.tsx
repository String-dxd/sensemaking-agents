/**
 * U5 — voice-mode controller tests. Mocks the three server fns + the
 * audio capture stack so the chain runs entirely in happy-dom. The
 * critical Phase A contract: getUserMedia is called with `{audio:true}`
 * only — never `{video}` — and no `<video>` element appears anywhere.
 * `state.mood` lives in local state and is NOT forwarded to persistMirror
 * (that contract change waits for Phase B).
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transcribeMock = vi.fn()
const runMock = vi.fn()
const persistMock = vi.fn()

vi.mock('~/server/transcribe-mirror.functions', () => ({
  transcribeMirror: (args: unknown) => transcribeMock(args),
}))
vi.mock('~/server/run-mirror.functions', () => ({
  runMirror: (args: unknown) => runMock(args),
}))
vi.mock('~/server/persist-mirror.functions', () => ({
  persistMirror: (args: unknown) => persistMock(args),
}))

import {
  MirrorSessionErrorPanel,
  useMirrorSession,
  VoicePhaseOverlay,
} from '~/components/MirrorSession'
import { VoiceButton } from '~/components/VoiceButton'

interface HarnessSignals {
  onPersisted?: () => void
  expose?: (api: ReturnType<typeof useMirrorSession>) => void
}

function Harness({ onPersisted, expose }: HarnessSignals) {
  const api = useMirrorSession({ studentId: 'demo', onPersisted })
  useEffect(() => {
    expose?.(api)
  })
  return (
    <>
      <VoiceButton
        phase={
          api.phase === 'recording'
            ? 'recording'
            : api.phase === 'transcribing' ||
                api.phase === 'reflecting' ||
                api.phase === 'persisting'
              ? 'working'
              : 'idle'
        }
        amplitude={api.amplitude}
        onPress={api.handleVoicePress}
      />
      <VoicePhaseOverlay
        phase={api.phase}
        remainingSec={api.remainingSec}
        showSoftPrompt={api.showSoftPrompt}
      />
      {api.phase === 'error' && api.errorMessage ? (
        <MirrorSessionErrorPanel
          message={api.errorMessage}
          onReset={api.handleReset}
          onRetryChain={api.canRetryChain ? api.handleRetryChain : undefined}
        />
      ) : null}
    </>
  )
}

// ── Media stack mocks ────────────────────────────────────────────────────

interface FakeRecorder {
  state: 'inactive' | 'recording'
  mimeType: string
  start: ReturnType<typeof vi.fn>
  stop: () => void
  ondataavailable: ((ev: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror: ((ev: unknown) => void) | null
}

let lastRecorder: FakeRecorder | null = null
let getUserMediaCalls: MediaStreamConstraints[] = []
let getUserMediaImpl: () => Promise<MediaStream>

beforeEach(() => {
  lastRecorder = null
  getUserMediaCalls = []
  getUserMediaImpl = () =>
    Promise.resolve({
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream)

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn((constraints: MediaStreamConstraints) => {
        getUserMediaCalls.push(constraints)
        return getUserMediaImpl()
      }),
    },
  })

  class MockMediaRecorder implements Partial<FakeRecorder> {
    state: FakeRecorder['state'] = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: FakeRecorder['ondataavailable'] = null
    onstop: FakeRecorder['onstop'] = null
    onerror: FakeRecorder['onerror'] = null
    start = vi.fn(() => {
      this.state = 'recording'
    })
    stop() {
      this.state = 'inactive'
      // Synthesize a tiny non-empty audio blob so the chain proceeds.
      this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) })
      this.onstop?.()
    }
    constructor(_stream: MediaStream, _opts?: { mimeType?: string }) {
      lastRecorder = this as unknown as FakeRecorder
    }
    static isTypeSupported(_: string) {
      return true
    }
  }

  // @ts-expect-error happy-dom doesn't provide MediaRecorder
  globalThis.MediaRecorder = MockMediaRecorder

  // Minimal AudioContext / analyser fake.
  class MockAnalyser {
    fftSize = 1024
    getFloatTimeDomainData(buf: Float32Array) {
      buf.fill(0)
    }
    connect() {}
  }
  class MockAudioContext {
    createMediaStreamSource() {
      return { connect: () => undefined }
    }
    createAnalyser() {
      return new MockAnalyser()
    }
    close() {
      return Promise.resolve()
    }
  }
  // @ts-expect-error happy-dom doesn't provide AudioContext
  globalThis.AudioContext = MockAudioContext
})

afterEach(() => {
  transcribeMock.mockReset()
  runMock.mockReset()
  persistMock.mockReset()
})

describe('MirrorSession (voice-mode controller)', () => {
  it('does NOT call getUserMedia on mount', () => {
    render(<Harness />)
    expect(getUserMediaCalls).toHaveLength(0)
  })

  it('mounts in idle phase; tapping Voice requests audio-only mic (NEVER video)', async () => {
    const api: { current: ReturnType<typeof useMirrorSession> | null } = { current: null }
    render(<Harness expose={(a) => (api.current = a)} />)
    expect(api.current?.phase).toBe('idle')

    await userEvent.click(screen.getByTestId('voice-button'))
    expect(getUserMediaCalls).toHaveLength(1)
    expect(getUserMediaCalls[0]).toEqual({ audio: true })
    expect(getUserMediaCalls[0]).not.toHaveProperty('video')
  })

  it('no <video> element is ever rendered', async () => {
    render(<Harness />)
    expect(document.querySelector('video')).toBeNull()
    await userEvent.click(screen.getByTestId('voice-button'))
    expect(document.querySelector('video')).toBeNull()
  })

  it('records → stop → transcribe → run mirror → persist → done → onPersisted fires', async () => {
    transcribeMock.mockResolvedValue({ transcript: 'i told my teacher off' })
    runMock.mockResolvedValue({
      output: {
        validation: 'v',
        inferred_meaning: 'm',
        story_reframe: 's',
      },
    })
    persistMock.mockResolvedValue({
      mirror_entry: { id: 42 },
      auto_connector_status: 'ok',
      pending_queued: false,
    })

    const onPersisted = vi.fn()
    const api: { current: ReturnType<typeof useMirrorSession> | null } = { current: null }
    render(<Harness onPersisted={onPersisted} expose={(a) => (api.current = a)} />)

    await userEvent.click(screen.getByTestId('voice-button'))
    // Wait for recording state.
    await vi.waitFor(() => expect(api.current?.phase).toBe('recording'))
    expect(lastRecorder?.state).toBe('recording')
    // Stop.
    await act(async () => {
      api.current?.handleVoicePress()
    })
    await vi.waitFor(() => expect(onPersisted).toHaveBeenCalledTimes(1))

    expect(transcribeMock).toHaveBeenCalledTimes(1)
    expect(runMock).toHaveBeenCalledTimes(1)
    expect(persistMock).toHaveBeenCalledTimes(1)
    expect(onPersisted).toHaveBeenCalledWith({
      entryId: 42,
      autoConnectorStatus: 'ok',
      pendingQueued: false,
    })
    expect(api.current?.phase).toBe('done')
  })

  it('persistMirror call shape does NOT carry a `mood` field (Phase A contract)', async () => {
    transcribeMock.mockResolvedValue({ transcript: 't' })
    runMock.mockResolvedValue({
      output: { validation: 'v', inferred_meaning: 'm', story_reframe: 's' },
    })
    persistMock.mockResolvedValue({
      mirror_entry: { id: 1 },
      auto_connector_status: 'ok',
      pending_queued: false,
    })

    const onPersisted = vi.fn()
    const api: { current: ReturnType<typeof useMirrorSession> | null } = { current: null }
    render(<Harness onPersisted={onPersisted} expose={(a) => (api.current = a)} />)

    // Start recording via user click — same path the world view will use.
    await userEvent.click(screen.getByTestId('voice-button'))
    await vi.waitFor(() => expect(api.current?.phase).toBe('recording'))
    // Tag a mood mid-recording — Phase A: stays local, never reaches the
    // persistMirror call.
    act(() => {
      api.current?.handleMoodTagged('sadness')
    })
    expect(api.current?.mood).toBe('sadness')
    // Stop via user click on the same button (now showing the stop icon).
    await userEvent.click(screen.getByTestId('voice-button'))
    await vi.waitFor(() => expect(onPersisted).toHaveBeenCalledTimes(1))

    const persistArgs = persistMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown> & { mood?: unknown }
    }
    expect(persistArgs.data).not.toHaveProperty('mood')
  })

  it('handleVoicePress is idempotent outside idle/recording', async () => {
    transcribeMock.mockResolvedValue({ transcript: 't' })
    runMock.mockResolvedValue({
      output: { validation: 'v', inferred_meaning: 'm', story_reframe: 's' },
    })
    // Make persistMirror hang so the chain pauses in `persisting`.
    persistMock.mockReturnValue(new Promise(() => undefined))

    const api: { current: ReturnType<typeof useMirrorSession> | null } = { current: null }
    render(<Harness expose={(a) => (api.current = a)} />)
    await userEvent.click(screen.getByTestId('voice-button'))
    await vi.waitFor(() => expect(api.current?.phase).toBe('recording'))
    await act(async () => {
      api.current?.handleVoicePress()
    })
    await vi.waitFor(() =>
      expect(['transcribing', 'reflecting', 'persisting']).toContain(api.current?.phase),
    )
    // Phase moved past recording — voice press should be a no-op now.
    const phaseSnapshot = api.current?.phase
    await act(async () => {
      api.current?.handleVoicePress()
    })
    expect(api.current?.phase).toBe(phaseSnapshot)
  })

  it('mood tagging is ignored when not recording (defensive guard)', () => {
    const api: { current: ReturnType<typeof useMirrorSession> | null } = { current: null }
    render(<Harness expose={(a) => (api.current = a)} />)
    act(() => {
      api.current?.handleMoodTagged('joy')
    })
    expect(api.current?.mood).toBeNull()
  })

  it('renders the error panel on permission failure', async () => {
    getUserMediaImpl = () => {
      const err = new Error('Permission denied')
      err.name = 'NotAllowedError'
      return Promise.reject(err)
    }
    render(<Harness />)
    await userEvent.click(screen.getByTestId('voice-button'))
    await vi.waitFor(() => expect(screen.getByTestId('voice-error-panel')).toBeInTheDocument())
  })

  it('voiceModeActive is true for non-idle/non-error phases', async () => {
    const api: { current: ReturnType<typeof useMirrorSession> | null } = { current: null }
    render(<Harness expose={(a) => (api.current = a)} />)
    expect(api.current?.voiceModeActive).toBe(false)
    await userEvent.click(screen.getByTestId('voice-button'))
    await vi.waitFor(() => expect(api.current?.voiceModeActive).toBe(true))
  })
})
