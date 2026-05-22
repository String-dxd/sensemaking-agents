/**
 * StudentSpaceHost (post-U2 refactor) — world-route React composition.
 * Engine boot moved to EngineHost; this component reads the live engine
 * through useEngine() and currently mounts IslandProgressionOverlay only.
 * Future phases add capture sheets, HUDs, in-world labels, and onboarding.
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudentSpaceHost } from '~/components/StudentSpaceHost'
import { EngineContext } from '~/lib/student-space/use-engine'
import { EngineOverlayProvider } from '~/lib/student-space/use-engine-overlay'

// IslandProgressionOverlay reads from the engine state; stub it out so we
// can focus the test on the host's render-or-null gating.
vi.mock('~/components/IslandProgressionOverlay', () => ({
  IslandProgressionOverlay: () => <div data-testid="island-overlay" />,
}))

describe('StudentSpaceHost', () => {
  it('renders nothing while the engine is still booting (useEngine() === null)', () => {
    const { container } = render(
      <EngineContext.Provider value={null}>
        <EngineOverlayProvider>
          <StudentSpaceHost />
        </EngineOverlayProvider>
      </EngineContext.Provider>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('mounts the world-route composition once the engine is ready', () => {
    const fakeGame = { dispose: vi.fn() }
    const { getByTestId } = render(
      <EngineContext.Provider value={fakeGame as never}>
        <EngineOverlayProvider>
          <StudentSpaceHost />
        </EngineOverlayProvider>
      </EngineContext.Provider>,
    )
    expect(getByTestId('island-overlay')).toBeInTheDocument()
  })
})
