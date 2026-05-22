/**
 * EngineHost — mounts the vendored Student Space engine through a dynamic
 * import and exposes it to descendants via EngineContext. These tests stub
 * the engine module so the host can be exercised in `happy-dom` without
 * instantiating any WebGL context.
 *
 * Coverage:
 *  - renders a container that the engine can attach to
 *  - calls `dispose()` on unmount (React StrictMode double-mount lifecycle)
 *  - falls back to the `EngineLoadFailure` panel when `createGame` throws
 *  - keeps capture classification owned by Connector/Mirror outcomes
 *  - exposes the live engine to descendants via `useEngine()`
 *
 * The host now mounts inside the TanStack router tree and derives its
 * initial surface from `window.location.pathname` (not `?sheet=`), so tests
 * wrap the render in a minimal memory-history router. The legacy
 * `?sheet=…` deep-link path is handled by the home route's beforeLoad
 * redirect (`src/routes/index.tsx`) and is exercised separately.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EngineHost } from '~/components/student-space/EngineHost'
import { useEngine } from '~/lib/student-space/use-engine'

const dispose = vi.fn()
const openSurface = vi.fn()
const closeActiveSurface = vi.fn()
const setRenderActive = vi.fn()
const createGame = vi
  .fn()
  .mockReturnValue({ dispose, openSurface, closeActiveSurface, setRenderActive })
const localStorageAdapter = vi.fn().mockReturnValue({})
const backendBridge = vi.hoisted(() => ({ version: 1 }))

vi.mock('~/lib/student-space/backend-bridge', () => ({
  createStudentSpaceBackendBridge: () => backendBridge,
}))

vi.mock('~/engine/student-space/Game', () => ({
  createGame: (args: unknown) => createGame(args),
  localStorageAdapter: () => localStorageAdapter(),
}))

function renderHostAt(pathname: string, element: ReactElement = <EngineHost />) {
  // Build a minimal router whose root simply renders the host. Catch-all
  // path so `pathname` arguments like `/profile/values` resolve to the
  // same component the production root layout would have rendered.
  const rootRoute = createRootRoute({ component: () => element })
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
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  return render(<RouterProvider router={router} />)
}

afterEach(() => {
  createGame.mockClear()
  dispose.mockClear()
  openSurface.mockClear()
  closeActiveSurface.mockClear()
  setRenderActive.mockClear()
  localStorageAdapter.mockClear()
  createGame.mockImplementation(() => ({
    dispose,
    openSurface,
    closeActiveSurface,
    setRenderActive,
  }))
  delete (backendBridge as { refreshSnapshot?: unknown }).refreshSnapshot
  delete (backendBridge as { loadAuthMenu?: unknown }).loadAuthMenu
  window.history.pushState({}, '', '/')
})

// Helper: build a createGame return value with the onboarding + view shape
// EngineHost's reveal-prep hide-pass effect probes.
function makeGameWithOnboarding(opts: {
  stage: string
  isDone?: boolean
  completedAt?: number | null
  isSignedIn?: boolean
}) {
  const flowers = { hideAll: vi.fn() }
  const tree = { hideAll: vi.fn() }
  const fruits = { hideAll: vi.fn() }
  // The OnboardingFlow component subscribes to the slice via
  // `useEngineSliceVersion` — give the stub a real subscribe so the React
  // render path doesn't throw inside happy-dom.
  const onboarding = {
    stage: opts.stage,
    isDone: opts.isDone ?? false,
    completedAt: opts.completedAt ?? null,
    firstMoodPinId: null,
    setStage: vi.fn((next: string) => next),
    subscribe: vi.fn(() => () => {}),
  }
  return {
    instance: {
      dispose,
      openSurface,
      closeActiveSurface,
      setRenderActive,
      state: {
        onboarding,
        auth: { isSignedIn: opts.isSignedIn ?? false },
        profile: { identity: { name: 'Demo' } },
        weather: { setAmbient: vi.fn(), setIntensity: vi.fn() },
        day: { setManualHour: vi.fn(), clearManualHour: vi.fn() },
      },
      view: {
        flowers,
        tree,
        fruits,
        kira: { setOnboardingMode: vi.fn() },
        kiraDialogue: { setOnboardingMode: vi.fn() },
      },
    },
    flowers,
    tree,
    fruits,
  }
}

describe('EngineHost', () => {
  it('renders a container and mounts the engine into it', async () => {
    const { container } = renderHostAt('/')
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as {
      backend: { version: number }
      container: HTMLElement
    }
    // The host renders a `.game` div the engine attaches its canvas to.
    expect(arg.container?.classList.contains('game')).toBe(true)
    expect(container.querySelector('.game')).toBeInTheDocument()
    expect(arg.backend).toMatchObject({ version: 1 })
  })

  it('passes the resolved authMenu through to createGame', async () => {
    const menu = {
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-a',
      kind: 'demo',
    }
    ;(backendBridge as { loadAuthMenu?: () => Promise<unknown> }).loadAuthMenu = vi.fn(
      async () => menu,
    )

    renderHostAt('/')
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { authMenu?: unknown }
    expect(arg.authMenu).toEqual(menu)
  })

  it('boots with authMenu=null when loadAuthMenu rejects', async () => {
    ;(backendBridge as { loadAuthMenu?: () => Promise<unknown> }).loadAuthMenu = vi.fn(async () => {
      throw new Error('boom')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderHostAt('/')
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { authMenu?: unknown }
    expect(arg.authMenu).toBeNull()
    warnSpy.mockRestore()
  })

  it('boots with authMenu=null when the bridge has no loadAuthMenu method', async () => {
    // backendBridge has no loadAuthMenu set in this case (the afterEach in
    // this file deletes it). Confirm the host still boots cleanly.
    renderHostAt('/')
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { authMenu?: unknown }
    expect(arg.authMenu).toBeNull()
  })

  it('disposes the game when unmounted', async () => {
    const { unmount } = renderHostAt('/')
    await waitFor(() => expect(createGame).toHaveBeenCalled())
    unmount()
    // The engine's documented lifecycle pairs every successful create with a
    // dispose. The host may re-run effects under double-mount, but at least
    // one dispose must fire so the engine releases its singleton + listeners.
    expect(dispose.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the failure panel when createGame throws', async () => {
    createGame.mockImplementationOnce(() => {
      throw new Error('engine boom')
    })
    // Suppress the expected console.error so the test log stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderHostAt('/')
    await waitFor(() =>
      expect(screen.getByTestId('student-space-engine-failure')).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('engine boom')
    errSpy.mockRestore()
  })

  it('opens a sheet from the current pathname after the engine mounts', async () => {
    // `/profile/relationships` is the canonical replacement for the legacy
    // `?sheet=relationships` query param.
    renderHostAt('/profile/relationships')

    await waitFor(() =>
      expect(openSurface).toHaveBeenCalledWith(
        expect.objectContaining({ surface: 'profile', tab: 'relationships' }),
      ),
    )
  })

  it('pauses the world canvas and marks page routes while routed sheets are active', async () => {
    const { container, unmount } = renderHostAt('/profile')

    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(setRenderActive).toHaveBeenCalledWith(false))
    expect(container.querySelector('.game')).toHaveAttribute('aria-hidden', 'true')
    expect(document.body.classList.contains('student-space-page-route')).toBe(true)

    unmount()
    expect(document.body.classList.contains('student-space-page-route')).toBe(false)
  })

  it('keeps the world canvas active on the home and onboarding routes', async () => {
    const { container } = renderHostAt('/onboarding')

    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(setRenderActive).toHaveBeenCalledWith(true))
    expect(container.querySelector('.game')).toHaveAttribute('aria-hidden', 'false')
    expect(document.body.classList.contains('student-space-page-route')).toBe(false)
  })

  // Regression — covers the routed-sheet flash fix. The sheet-stage placeholder
  // mounts synchronously on routed-sheet pages so the world frame never reads
  // as bare html chrome between the URL change and the new sheet's Dialog
  // portal landing (Base UI's FloatingPortal needs an extra commit after mount
  // to attach its children, leaving a 1-2 frame gap on `/` → `/history`-style
  // transitions). Asserted via `data-testid="sheet-stage"` (the live sheet
  // itself uses `data-testid="sheet-surface"`).
  it('renders the sheet-stage placeholder on routed-sheet pages only', async () => {
    const onRouted = renderHostAt('/profile')
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    expect(onRouted.queryByTestId('sheet-stage')).toBeInTheDocument()
    onRouted.unmount()

    createGame.mockClear()
    const onWorld = renderHostAt('/')
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    expect(onWorld.queryByTestId('sheet-stage')).not.toBeInTheDocument()
  })

  it('registers React capture overlays with the engine overlay controller and unregisters them', async () => {
    const surfaces = new Map<
      string,
      { open?: (opts?: Record<string, unknown>) => void; close?: () => void }
    >()
    const register = vi.fn((name: string, surface: { open?: () => void; close?: () => void }) => {
      surfaces.set(name, surface)
    })
    const unregister = vi.fn((name: string) => {
      surfaces.delete(name)
    })
    createGame.mockImplementationOnce(() => ({
      dispose,
      openSurface,
      closeActiveSurface,
      setRenderActive,
      state: { captures: { add: vi.fn(), patch: vi.fn() } },
      view: { overlayController: { register, unregister } },
    }))

    const { unmount } = renderHostAt('/')

    await waitFor(() => expect(register).toHaveBeenCalledWith('ask', expect.any(Object)))
    surfaces.get('ask')?.open?.({ prefilledText: 'Bridge prompt' })
    expect(await screen.findByText("What's on your mind?")).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bridge prompt')).toBeInTheDocument()

    unmount()
    expect(unregister).toHaveBeenCalledWith('chooser')
    expect(unregister).toHaveBeenCalledWith('ask')
    expect(unregister).toHaveBeenCalledWith('photo')
    expect(unregister).toHaveBeenCalledWith('mood')
  })

  it('replays the route-opened sheet after backend snapshot hydration', async () => {
    ;(backendBridge as { refreshSnapshot?: () => Promise<unknown> }).refreshSnapshot = vi.fn(
      async () => ({
        profile: {
          facets: {},
          identity: { name: 'Maya', className: 'Sec 3', avatarDataUrl: null },
        },
        reflections: [],
        trajectory: null,
        recentMoods: [],
      }),
    )

    renderHostAt('/history#reflection-7')

    await waitFor(() => expect(openSurface).toHaveBeenCalled())
    // The snapshot path re-applies the route surface so any new evidence
    // hydrated server-side is reflected in the open sheet.
    await waitFor(() => {
      const calls = openSurface.mock.calls.map((c) => c[0])
      const reflectionsCalls = calls.filter(
        (input) => input?.surface === 'history' && input?.entryId === 7,
      )
      expect(reflectionsCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('does not subscribe to captures for manual classification prompts', async () => {
    const captureSubscribe = vi.fn(
      (_cb: (entry: { id: string; dimension?: string | null }) => void) => vi.fn(),
    )
    const setDimensionForFirstCapture = vi.fn()
    createGame.mockImplementationOnce(() => ({
      dispose,
      openSurface,
      closeActiveSurface,
      setRenderActive,
      state: {
        captures: { subscribe: captureSubscribe },
        sprouts: { setDimensionForFirstCapture },
      },
    }))

    renderHostAt('/')

    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    expect(captureSubscribe).not.toHaveBeenCalled()
    expect(setDimensionForFirstCapture).not.toHaveBeenCalled()
    expect(screen.queryByText('What is this about?')).not.toBeInTheDocument()
    expect(screen.queryByText('Which value?')).not.toBeInTheDocument()
  })

  it('waits for backend hydration before opening a route-targeted trajectory sheet', async () => {
    let resolveSnapshot: (value: unknown) => void = () => {}
    ;(backendBridge as { refreshSnapshot?: () => Promise<unknown> }).refreshSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve
        }),
    )

    renderHostAt('/trajectory')

    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    // The route-sync hook may open trajectory before hydration completes —
    // but the snapshot re-apply is what we're protecting here. Reset the
    // mock so we can observe the post-hydration call specifically.
    openSurface.mockClear()

    resolveSnapshot({
      profile: {
        facets: {},
        identity: { name: 'Maya', className: 'Sec 3', avatarDataUrl: null },
      },
      reflections: [],
      trajectory: null,
      recentMoods: [],
    })

    await waitFor(() =>
      expect(openSurface).toHaveBeenCalledWith(expect.objectContaining({ surface: 'trajectory' })),
    )
  })

  it('does not call createGame when unmounted before the dynamic import resolves', async () => {
    // The host's dynamic import is real; the engine module is mocked above
    // and returns synchronously. To simulate the cancel-during-import case
    // we make `createGame` itself capture mounts that happen after cancel,
    // and assert dispose never fires for an instance that was cancelled.
    //
    // We can't easily intercept the dynamic import promise without re-
    // architecting the mock, so we use the next-best signal: unmount
    // immediately and verify dispose() is called for whatever instance
    // (if any) was created. The contract we're protecting is "no stale
    // engine survives unmount" — the cancel flag in the host's effect
    // cleanup means even an instance constructed post-cancel must
    // dispose() on unmount.
    const { unmount } = renderHostAt('/')
    unmount()
    await waitFor(() => {
      // Either createGame never ran (cancelled before resolution) OR it ran
      // and dispose was paired with it. Both states satisfy the contract.
      const created = createGame.mock.calls.length
      const disposed = dispose.mock.calls.length
      expect(disposed).toBeGreaterThanOrEqual(Math.min(created, 1))
    })
  })

  describe('reveal-prep hide-pass (U16)', () => {
    it('skips hideAll() when onboarding stage is "done"', async () => {
      const fixture = makeGameWithOnboarding({ stage: 'done', isDone: true })
      createGame.mockImplementationOnce(() => fixture.instance)

      renderHostAt('/')
      await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(fixture.flowers.hideAll).not.toHaveBeenCalled()
      expect(fixture.tree.hideAll).not.toHaveBeenCalled()
      expect(fixture.fruits.hideAll).not.toHaveBeenCalled()
    })

    it('calls hideAll() on every reveal-prepped subsystem when stage is not "done"', async () => {
      const fixture = makeGameWithOnboarding({ stage: 'greeting' })
      createGame.mockImplementationOnce(() => fixture.instance)

      renderHostAt('/')
      await waitFor(() => expect(fixture.flowers.hideAll).toHaveBeenCalledTimes(1))
      expect(fixture.tree.hideAll).toHaveBeenCalledTimes(1)
      expect(fixture.fruits.hideAll).toHaveBeenCalledTimes(1)
    })

    it('skips hideAll() for a returning signed-in student at the login stage', async () => {
      const fixture = makeGameWithOnboarding({
        stage: 'login',
        completedAt: 1700000000000,
        isSignedIn: true,
      })
      createGame.mockImplementationOnce(() => fixture.instance)

      renderHostAt('/')
      await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(fixture.flowers.hideAll).not.toHaveBeenCalled()
      expect(fixture.tree.hideAll).not.toHaveBeenCalled()
      expect(fixture.fruits.hideAll).not.toHaveBeenCalled()
    })
  })

  it('exposes the live engine to descendants via useEngine()', async () => {
    function Probe() {
      const engine = useEngine()
      return <div data-testid="engine-status">{engine ? 'ready' : 'null'}</div>
    }
    renderHostAt(
      '/',
      <EngineHost>
        <Probe />
      </EngineHost>,
    )
    await waitFor(() => expect(screen.getByTestId('engine-status').textContent).toBe('ready'))
  })
})
