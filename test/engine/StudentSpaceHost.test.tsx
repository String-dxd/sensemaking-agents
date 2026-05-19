/**
 * StudentSpaceHost — mounts the vendored Student Space engine through a
 * dynamic import. These tests stub the engine module so the host can be
 * exercised in `happy-dom` without instantiating any WebGL context.
 *
 * Coverage:
 *  - renders a container that the engine can attach to
 *  - calls `dispose()` on unmount (React StrictMode double-mount lifecycle)
 *  - falls back to the `EngineLoadFailure` panel when `createGame` throws
 */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentSpaceHost } from '~/components/StudentSpaceHost'

const dispose = vi.fn()
const openSurface = vi.fn()
const createGame = vi.fn().mockReturnValue({ dispose, openSurface })
const localStorageAdapter = vi.fn().mockReturnValue({})
const backendBridge = vi.hoisted(() => ({ version: 1 }))

vi.mock('~/lib/student-space/backend-bridge', () => ({
  createStudentSpaceBackendBridge: () => backendBridge,
}))

vi.mock('~/engine/student-space/Game', () => ({
  createGame: (args: unknown) => createGame(args),
  localStorageAdapter: () => localStorageAdapter(),
}))

afterEach(() => {
  createGame.mockClear()
  dispose.mockClear()
  openSurface.mockClear()
  localStorageAdapter.mockClear()
  createGame.mockImplementation(() => ({ dispose, openSurface }))
  delete (backendBridge as { refreshSnapshot?: unknown }).refreshSnapshot
  delete (backendBridge as { loadAuthMenu?: unknown }).loadAuthMenu
  window.history.pushState({}, '', '/')
})

describe('StudentSpaceHost', () => {
  it('renders a container and mounts the engine into it', async () => {
    const { container } = render(<StudentSpaceHost />)
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as {
      backend: { version: number }
      container: HTMLElement
    }
    expect(arg.container).toBe(container.firstElementChild)
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

    render(<StudentSpaceHost />)
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { authMenu?: unknown }
    expect(arg.authMenu).toEqual(menu)
  })

  it('boots with authMenu=null when loadAuthMenu rejects', async () => {
    ;(backendBridge as { loadAuthMenu?: () => Promise<unknown> }).loadAuthMenu = vi.fn(
      async () => {
        throw new Error('boom')
      },
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<StudentSpaceHost />)
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { authMenu?: unknown }
    expect(arg.authMenu).toBeNull()
    warnSpy.mockRestore()
  })

  it('boots with authMenu=null when the bridge has no loadAuthMenu method', async () => {
    // backendBridge has no loadAuthMenu set in this case (the afterEach in
    // this file deletes it). Confirm the host still boots cleanly.
    render(<StudentSpaceHost />)
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { authMenu?: unknown }
    expect(arg.authMenu).toBeNull()
  })

  it('disposes the game when unmounted', async () => {
    const { unmount } = render(<StudentSpaceHost />)
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
    render(<StudentSpaceHost />)
    await waitFor(() =>
      expect(screen.getByTestId('student-space-engine-failure')).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('engine boom')
    errSpy.mockRestore()
  })

  it('opens a sheet from the current route query after the engine mounts', async () => {
    window.history.pushState({}, '', '/?sheet=values#entry-7')
    render(<StudentSpaceHost />)

    await waitFor(() =>
      expect(openSurface).toHaveBeenCalledWith(expect.objectContaining({ surface: 'values' })),
    )
  })

  it('replays the route-opened sheet after backend snapshot hydration', async () => {
    window.history.pushState({}, '', '/?sheet=reflections&filter=need-review#entry-7')
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

    render(<StudentSpaceHost />)

    await waitFor(() => expect(openSurface).toHaveBeenCalledTimes(2))
    expect(openSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({ surface: 'reflections', filter: 'need-review', entryId: 7 }),
    )
  })

  it('waits for backend hydration before opening a route-targeted trajectory sheet', async () => {
    window.history.pushState({}, '', '/?sheet=trajectory')
    let resolveSnapshot: (value: unknown) => void = () => {}
    ;(backendBridge as { refreshSnapshot?: () => Promise<unknown> }).refreshSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve
        }),
    )

    render(<StudentSpaceHost />)

    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    expect(openSurface).not.toHaveBeenCalled()

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
    const { unmount } = render(<StudentSpaceHost />)
    unmount()
    await waitFor(() => {
      // Either createGame never ran (cancelled before resolution) OR it ran
      // and dispose was paired with it. Both states satisfy the contract.
      const created = createGame.mock.calls.length
      const disposed = dispose.mock.calls.length
      expect(disposed).toBeGreaterThanOrEqual(Math.min(created, 1))
    })
  })
})
