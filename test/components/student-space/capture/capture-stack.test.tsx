// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AskSheet } from '~/components/student-space/capture/AskSheet'
import { CaptureChooser } from '~/components/student-space/capture/CaptureChooser'
import { CaptureFab } from '~/components/student-space/capture/CaptureFab'
import { MoodSheet } from '~/components/student-space/capture/MoodSheet'
import { EngineContext } from '~/lib/student-space/use-engine'
import { EngineOverlayProvider, useEngineOverlay } from '~/lib/student-space/use-engine-overlay'

type CaptureEntry = Record<string, unknown> & { id: string }

function makeCaptures() {
  const subscribers = new Set<(entry: CaptureEntry) => void>()
  const entries: CaptureEntry[] = []
  return {
    entries,
    add: vi.fn((input: Record<string, unknown>) => {
      const entry = { id: String(input.id || `capture-${entries.length + 1}`), ...input }
      entries.push(entry)
      for (const cb of subscribers) cb(entry)
      return entry
    }),
    patch: vi.fn((id: string, updates: Record<string, unknown>) => {
      const entry = entries.find((item) => item.id === id)
      if (!entry) return null
      Object.assign(entry, updates)
      for (const cb of subscribers) cb(entry)
      return entry
    }),
    subscribe(cb: (entry: CaptureEntry) => void) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }
}

function makeMoodPins() {
  const subscribers = new Set<(pin: { id: string; emotion: string; intensity: number }) => void>()
  const pins: Array<{ id: string; emotion: string; intensity: number; cause?: string }> = []
  return {
    pins,
    add: vi.fn((input: { emotion: string; intensity: number }) => {
      const pin = { id: `pin-${pins.length + 1}`, ...input }
      pins.push(pin)
      for (const cb of subscribers) cb(pin)
      return pin
    }),
    patch: vi.fn((id: string, updates: { cause: string }) => {
      const pin = pins.find((item) => item.id === id)
      if (!pin) return null
      Object.assign(pin, updates)
      return pin
    }),
    subscribe(cb: (pin: { id: string; emotion: string; intensity: number }) => void) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }
}

function renderCapture(game = makeGame()) {
  const ctx = game as unknown as Parameters<typeof EngineContext.Provider>[0]['value']
  function Provider({ children }: { children: ReactNode }) {
    return (
      <EngineContext.Provider value={ctx}>
        <EngineOverlayProvider>{children}</EngineOverlayProvider>
      </EngineContext.Provider>
    )
  }
  render(
    <Provider>
      <CaptureFab />
      <CaptureChooser />
      <AskSheet />
      <MoodSheet />
    </Provider>,
  )
  return game
}

function OpenAskButton({ options = {} }: { options?: Record<string, unknown> }) {
  const overlay = useEngineOverlay()
  return (
    <button type="button" onClick={() => overlay.openCapture('ask', options)}>
      open ask directly
    </button>
  )
}

function renderDirectAsk(game = makeGame(), options: Record<string, unknown> = {}) {
  const ctx = game as unknown as Parameters<typeof EngineContext.Provider>[0]['value']
  render(
    <EngineContext.Provider value={ctx}>
      <EngineOverlayProvider>
        <OpenAskButton options={options} />
        <AskSheet />
      </EngineOverlayProvider>
    </EngineContext.Provider>,
  )
  return game
}

function makeGame(extra: Record<string, unknown> = {}) {
  const captures = makeCaptures()
  const moodPins = makeMoodPins()
  return {
    state: {
      captures,
      moodPins,
      day: { setMood: vi.fn() },
      letters: { letters: [] },
      backend: null,
      ...(extra.state as Record<string, unknown> | undefined),
    },
    view: { overlayController: { noteClosed: vi.fn(), register: vi.fn() } },
  }
}

afterEach(() => {
  document.body.className = ''
  Reflect.deleteProperty(globalThis, 'RTCPeerConnection')
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: undefined,
  })
  vi.restoreAllMocks()
})

describe('React capture stack', () => {
  it('opens the chooser from the FAB and commits a mood pin with a cause', async () => {
    const game = renderCapture()

    await userEvent.click(screen.getByTestId('capture-fab'))
    await userEvent.click(screen.getByRole('button', { name: 'Name a feeling' }))
    await userEvent.click(screen.getByTestId('mood-sheet-emotion-joy'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'How loud?' })).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: /talking/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: "Want to add what's behind it?" }),
      ).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'school' }))

    expect(game.state.moodPins.add).toHaveBeenCalledWith({ emotion: 'joy', intensity: 2 })
    expect(game.state.day.setMood).toHaveBeenCalledWith('joy')
    await waitFor(() =>
      expect(game.state.moodPins.patch).toHaveBeenCalledWith('pin-1', { cause: 'school' }),
    )
  })

  it('logs a typed Ask capture from chooser entry', async () => {
    const game = renderCapture()

    await userEvent.click(screen.getByTestId('capture-fab'))
    await userEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    await userEvent.type(screen.getByPlaceholderText(/Write it here/i), 'Today I felt heard.')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Here's what you said." })).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Log' }))

    expect(game.state.captures.add).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ask', text: 'Today I felt heard.' }),
    )
  })

  it('runs Realtime voice capture through prepared reflection logging', async () => {
    class MockRTCPeerConnection {}
    // @ts-expect-error happy-dom does not provide RTCPeerConnection.
    globalThis.RTCPeerConnection = MockRTCPeerConnection
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })

    const prepared = {
      localCaptureId: 'ask-realtime',
      transcript: 'realtime transcript',
      validation: 'That was heard live.',
      inferredMeaning: 'Voice went through Realtime.',
      storyReframe: 'Kira heard the Realtime session.',
      contextType: 'school',
      transcription: { provider: 'openai_realtime', transcript: 'realtime transcript' },
    }
    const stop = vi.fn(async () => prepared)
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
      return { stop, abort: vi.fn() }
    })
    const logPreparedReflection = vi.fn(async () => ({
      mirrorEntry: {
        id: 88,
        transcript: 'realtime transcript',
        validation: 'That was heard live.',
        storyReframe: 'Kira heard the Realtime session.',
        inferredMeaning: 'Voice went through Realtime.',
        contextType: 'school',
        reviewStatus: 'confirmed',
      },
    }))
    const game = makeGame({
      state: {
        backend: { createRealtimeMirrorCapture, logPreparedReflection },
      },
    })
    renderDirectAsk(game)

    await userEvent.click(screen.getByText('open ask directly'))
    await userEvent.click(screen.getByRole('button', { name: 'Start voice recording' }))

    await waitFor(() => expect(createRealtimeMirrorCapture).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Live with Kira')).toBeInTheDocument()
    expect(screen.getByText('Can you hear me?')).toBeInTheDocument()
    expect(screen.getByText('I can hear you.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Stop session' }))
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByText(/Kira heard the Realtime session/)).toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Log' }))
    await waitFor(() => expect(logPreparedReflection).toHaveBeenCalledTimes(1))
    expect(game.state.captures.entries[0]).toMatchObject({
      text: 'realtime transcript',
      backendMirrorEntryId: 88,
      syncStatus: 'synced',
    })
  })
})
