/**
 * React SettingsSheet (U4 of the migration) — replaces
 * `src/engine/student-space/Game/View/SettingsSheet.js`. Tests cover:
 *
 *  - the section chrome renders the four admin groups
 *  - the three React admin controls render in their settings slots
 *  - Restart Onboarding calls state.onboarding.reset, flushes persistence,
 *    and navigates to `/onboarding`
 *  - body.has-overlay add/remove lifecycle
 *  - the Demo student switcher: renders only for demo/dev-bypass sessions,
 *    marks the active persona, and submits a body-scoped form on click
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsSheet } from '~/components/student-space/sheets/SettingsSheet'
import { EngineContext } from '~/lib/student-space/use-engine'

const loadAuthMenuMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/auth-menu.functions', () => ({
  loadAuthMenu: loadAuthMenuMock,
}))

function renderSettings(engine: object | null = makeFakeEngine()) {
  const rootRoute = createRootRoute({
    component: () => (
      <EngineContext.Provider value={engine as never}>
        <SettingsSheet />
      </EngineContext.Provider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, catchAllRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
  })
  return render(<RouterProvider router={router} />)
}

function makeFakeEngine() {
  return {
    state: {
      onboarding: { reset: vi.fn() },
      persistence: { flush: vi.fn() },
      day: { hour: 12, manualHour: null, setManualHour: vi.fn(), clearManualHour: vi.fn() },
      weather: { rainTarget: 0, start: vi.fn(), stop: vi.fn() },
      identityStatusOverride: {
        current: null,
        setOverride: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
      },
    },
    view: {
      sound: {
        muted: false,
        trackId: 'dreamy-flashback',
        tracks: [{ id: 'dreamy-flashback', name: 'Dreamy Flashback' }],
        cycleTrack: vi.fn(),
        onTrackChange: vi.fn(() => vi.fn()),
        onMuteChange: vi.fn(() => vi.fn()),
      },
      kira: {
        speciesId: 'flame',
        cycleSpecies: vi.fn(),
        onSpeciesChange: vi.fn(() => vi.fn()),
      },
      aurora: { force: false, setForce: vi.fn() },
      rainbow: { force: false, setForce: vi.fn() },
    },
  }
}

afterEach(() => {
  document.body.classList.remove('has-overlay')
  loadAuthMenuMock.mockReset()
})

beforeEach(() => {
  loadAuthMenuMock.mockResolvedValue({ status: 'signed-out' })
})

describe('SettingsSheet (React)', () => {
  it('renders all four admin sections', async () => {
    renderSettings()
    expect(await screen.findByRole('heading', { name: 'World & weather' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Music' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Companion' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
  })

  it('renders the three React admin controls into their slots', async () => {
    renderSettings()
    const hourMount = await screen.findByTestId('settings-mount-hour')
    expect(
      within(hourMount).getByRole('group', { name: 'Environment controls' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cycle through ambient music tracks' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cycle through bird companions' }),
    ).toBeInTheDocument()
  })

  it('Restart Onboarding wipes the slice and navigates to /onboarding', async () => {
    const engine = makeFakeEngine()
    // happy-dom blocks the real navigation; stub it explicitly so the test
    // observes the call without navigating the test runner.
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...original, assign },
    })

    renderSettings(engine)
    const btn = await screen.findByTestId('settings-restart-onboarding')
    await userEvent.click(btn)

    expect(engine.state.onboarding.reset).toHaveBeenCalled()
    expect(engine.state.persistence.flush).toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('/onboarding')

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: original,
    })
  })

  it('adds body.has-overlay while mounted and removes it on unmount', async () => {
    const { unmount } = renderSettings()
    await waitFor(() => expect(document.body.classList.contains('has-overlay')).toBe(true))
    unmount()
    expect(document.body.classList.contains('has-overlay')).toBe(false)
  })

  describe('Demo student switcher', () => {
    it('renders a button per demo persona and marks the active one for a demo session', async () => {
      loadAuthMenuMock.mockResolvedValue({
        status: 'signed-in',
        label: 'Demo account',
        detail: 'demo-a',
        kind: 'demo',
      })
      renderSettings()

      expect(await screen.findByRole('heading', { name: 'Demo student' })).toBeInTheDocument()
      const active = screen.getByTestId('settings-demo-student-demo-a')
      expect(active).toHaveAttribute('aria-current', 'true')
      expect(screen.getByTestId('settings-demo-student-demo-b')).not.toHaveAttribute('aria-current')
      expect(screen.getByTestId('settings-demo-student-demo-c')).toBeInTheDocument()
      expect(screen.getByTestId('settings-demo-student-demo-d')).toBeInTheDocument()
    })

    it('does not render the Demo student group for a workos session', async () => {
      loadAuthMenuMock.mockResolvedValue({
        status: 'signed-in',
        label: 'Reza Ilmi',
        detail: 'reza@example.com',
        kind: 'workos',
      })
      renderSettings()

      await screen.findByRole('heading', { name: 'World & weather' })
      expect(screen.queryByRole('heading', { name: 'Demo student' })).not.toBeInTheDocument()
    })

    it('clicking a non-active persona submits a body-scoped form to the switch endpoint', async () => {
      loadAuthMenuMock.mockResolvedValue({
        status: 'signed-in',
        label: 'Demo account',
        detail: 'demo-a',
        kind: 'demo',
      })
      const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
      renderSettings()

      const demoB = await screen.findByTestId('settings-demo-student-demo-b')
      await userEvent.click(demoB)

      expect(submitSpy).toHaveBeenCalledTimes(1)
      const submitted = submitSpy.mock.instances[0] as unknown as HTMLFormElement
      expect(submitted.method.toLowerCase()).toBe('post')
      expect(submitted.action).toContain('/api/auth/sign-in?')
      expect(submitted.action).toContain('demo=1')
      expect(submitted.action).toContain('student=demo-b')
      expect(submitted.parentElement).toBe(document.body)
    })
  })
})
