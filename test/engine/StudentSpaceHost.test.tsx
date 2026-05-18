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
const createGame = vi.fn().mockReturnValue({ dispose })
const localStorageAdapter = vi.fn().mockReturnValue({})

vi.mock('~/engine/student-space/Game', () => ({
  createGame: (args: unknown) => createGame(args),
  localStorageAdapter: () => localStorageAdapter(),
}))

afterEach(() => {
  createGame.mockClear()
  dispose.mockClear()
  localStorageAdapter.mockClear()
  createGame.mockImplementation(() => ({ dispose }))
})

describe('StudentSpaceHost', () => {
  it('renders a container and mounts the engine into it', async () => {
    const { container } = render(<StudentSpaceHost />)
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    const arg = createGame.mock.calls[0]?.[0] as { container: HTMLElement }
    expect(arg.container).toBe(container.firstElementChild)
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
})
