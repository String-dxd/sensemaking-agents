/**
 * React SettingsSheet (U4 of the migration) — replaces
 * `src/engine/student-space/Game/View/SettingsSheet.js`. Tests cover:
 *
 *  - the section chrome renders the five admin groups
 *  - the four engine-widget mount slots are present (dynamic-import of the
 *    engine modules is mocked so happy-dom can construct them)
 *  - Restart Onboarding calls state.onboarding.reset, flushes persistence,
 *    and reloads the window with `#onboarding`
 *  - body.has-overlay add/remove lifecycle
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsSheet } from '~/components/student-space/sheets/SettingsSheet'
import { EngineContext } from '~/lib/student-space/use-engine'

const hourCtor = vi.fn()
const trackCtor = vi.fn()
const birdCtor = vi.fn()
const statusCtor = vi.fn()

vi.mock('~/engine/student-space/Game/View/HourHud.js', () => ({
  default: vi.fn((opts: { mount: HTMLElement }) => {
    hourCtor(opts)
    return { dispose: vi.fn() }
  }),
}))
vi.mock('~/engine/student-space/Game/View/TrackPicker.js', () => ({
  default: vi.fn((opts: { mount: HTMLElement }) => {
    trackCtor(opts)
    return { dispose: vi.fn() }
  }),
}))
vi.mock('~/engine/student-space/Game/View/BirdPicker.js', () => ({
  default: vi.fn((opts: { mount: HTMLElement }) => {
    birdCtor(opts)
    return { dispose: vi.fn() }
  }),
}))
vi.mock('~/engine/student-space/Game/View/StatusPreviewHud.js', () => ({
  default: vi.fn((opts: { mount: HTMLElement }) => {
    statusCtor(opts)
    return { dispose: vi.fn() }
  }),
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
    },
  }
}

beforeEach(() => {
  hourCtor.mockClear()
  trackCtor.mockClear()
  birdCtor.mockClear()
  statusCtor.mockClear()
})

afterEach(() => {
  document.body.classList.remove('has-overlay')
})

describe('SettingsSheet (React)', () => {
  it('renders all five admin sections', async () => {
    renderSettings()
    expect(await screen.findByText('World & weather')).toBeInTheDocument()
    expect(screen.getByText('Music')).toBeInTheDocument()
    expect(screen.getByText('Companion')).toBeInTheDocument()
    expect(screen.getByText('Path Finder preview')).toBeInTheDocument()
    expect(screen.getByText('Onboarding')).toBeInTheDocument()
  })

  it('mounts the four engine widgets into their slots', async () => {
    renderSettings()
    await waitFor(() => {
      expect(hourCtor).toHaveBeenCalledTimes(1)
      expect(trackCtor).toHaveBeenCalledTimes(1)
      expect(birdCtor).toHaveBeenCalledTimes(1)
      expect(statusCtor).toHaveBeenCalledTimes(1)
    })
    const hourMount = await screen.findByTestId('settings-mount-hour')
    expect(hourCtor.mock.calls[0]?.[0]?.mount).toBe(hourMount)
  })

  it('Restart Onboarding wipes the slice and reloads with #onboarding', async () => {
    const engine = makeFakeEngine()
    // happy-dom blocks the real reload; stub it explicitly so the test
    // observes the call without navigating the test runner.
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...original, hash: '', reload },
    })

    renderSettings(engine)
    const btn = await screen.findByTestId('settings-restart-onboarding')
    await userEvent.click(btn)

    expect(engine.state.onboarding.reset).toHaveBeenCalled()
    expect(engine.state.persistence.flush).toHaveBeenCalled()
    expect(window.location.hash).toBe('#onboarding')
    expect(reload).toHaveBeenCalled()

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
})
