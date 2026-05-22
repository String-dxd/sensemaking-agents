import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentSpaceHud } from '~/components/student-space/hud/StudentSpaceHud'
import { EngineOverlayProvider } from '~/lib/student-space/use-engine-overlay'

function renderHud(engine = makeFakeEngine()) {
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

afterEach(() => {
  document.body.className = ''
})

describe('StudentSpaceHud', () => {
  it('renders React HUD controls and dispatches engine actions', async () => {
    const engine = renderHud()

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(engine.view.camera.zoomBy).toHaveBeenCalledWith(0.85)

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

  it('hides dev-only status and fps controls behind the DevPalette body class', () => {
    document.body.classList.add('is-dev-overlay-hidden')
    renderHud()

    expect(screen.queryByText('performance')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview as/i })).not.toBeInTheDocument()
  })
})
