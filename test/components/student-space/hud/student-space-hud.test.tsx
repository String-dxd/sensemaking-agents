import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentSpaceHud } from '~/components/student-space/hud/StudentSpaceHud'
import { EngineOverlayProvider } from '~/lib/student-space/use-engine-overlay'
import { WORLD_CONTROLS_STORAGE_KEY } from '~/lib/student-space/world-controls-visibility'

let originalStorageDescriptor: PropertyDescriptor | undefined

function createStorageStub() {
  const map = new Map<string, string>()
  return {
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null
    },
    setItem(key: string, value: string) {
      map.set(key, String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
  }
}

function renderHud(engine = makeFakeEngine(), { panelOpen = false } = {}) {
  if (panelOpen) window.localStorage.setItem(WORLD_CONTROLS_STORAGE_KEY, '1')
  render(
    <EngineOverlayProvider>
      <StudentSpaceHud game={engine} />
    </EngineOverlayProvider>,
  )
  return engine
}

function makeFakeEngine() {
  return {
    state: {
      day: {
        hour: 12,
        manualHour: null,
        setManualHour: vi.fn(),
        clearManualHour: vi.fn(),
      },
      weather: {
        rainTarget: 0,
        start: vi.fn(),
        stop: vi.fn(),
      },
      performance: { smoothedFrameMs: 16.6, tier: 'high' },
      time: { delta: 1 / 60, elapsed: 1 },
      identityStatusOverride: {
        current: null,
        setOverride: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
      },
    },
    view: {
      camera: {
        zoomBy: vi.fn(),
        resetToDefault: vi.fn(),
      },
      sound: {
        muted: false,
        trackId: 'dreamy-flashback',
        tracks: [{ id: 'dreamy-flashback', name: 'Dreamy Flashback' }],
        toggleMuted: vi.fn(),
        cycleTrack: vi.fn(),
        onMuteChange: vi.fn(() => vi.fn()),
        onTrackChange: vi.fn(() => vi.fn()),
      },
      aurora: { force: false, setForce: vi.fn() },
      rainbow: { force: false, setForce: vi.fn() },
      kira: {
        speciesId: 'flame',
        cycleSpecies: vi.fn(),
        onSpeciesChange: vi.fn(() => vi.fn()),
      },
      kiraDialogue: { say: vi.fn() },
    },
  }
}

beforeEach(() => {
  originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorageStub(),
  })
})

afterEach(() => {
  document.body.className = ''
  if (originalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  } else {
    delete (window as { localStorage?: unknown }).localStorage
  }
})

describe('StudentSpaceHud', () => {
  it('renders React HUD controls and dispatches engine actions', async () => {
    const engine = renderHud(makeFakeEngine(), { panelOpen: true })

    await userEvent.click(screen.getByRole('button', { name: /Reset view/ }))
    expect(engine.view.camera.resetToDefault).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Toggle sound' }))
    expect(engine.view.sound.toggleMuted).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('switch', { name: 'rain' }))
    expect(engine.state.weather.start).toHaveBeenCalledWith(0.65)

    await userEvent.click(
      screen.getByRole('button', { name: 'Cycle through ambient music tracks' }),
    )
    expect(engine.view.sound.cycleTrack).toHaveBeenCalledWith(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cycle through bird companions' }))
    expect(engine.view.kira.cycleSpecies).toHaveBeenCalledWith(1)
  })

  it('does not render the legacy slider toggle button', () => {
    renderHud()
    expect(screen.queryByRole('button', { name: /show world controls/i })).not.toBeInTheDocument()
  })

  it('hides dev-only status and fps controls behind the DevPalette body class', () => {
    document.body.classList.add('is-dev-overlay-hidden')
    renderHud()

    expect(screen.queryByText('performance')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview as/i })).not.toBeInTheDocument()
  })
})
