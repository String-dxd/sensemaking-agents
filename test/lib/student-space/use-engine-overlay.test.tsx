import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { EngineOverlayProvider, useEngineOverlay } from '~/lib/student-space/use-engine-overlay'

afterEach(() => {
  document.body.classList.remove('has-capture-sheet', 'has-chooser', 'is-onboarding')
})

function Probe() {
  const overlay = useEngineOverlay()
  return (
    <div>
      <button type="button" onClick={() => overlay.setActiveCapture('ask')}>
        open-ask
      </button>
      <button type="button" onClick={() => overlay.setActiveCapture(null)}>
        close-capture
      </button>
      <button type="button" onClick={() => overlay.setActiveChooser(true)}>
        open-chooser
      </button>
      <button type="button" onClick={() => overlay.setIsOnboarding(true)}>
        start-onboarding
      </button>
      <span data-testid="active-capture">{overlay.activeCapture ?? 'none'}</span>
    </div>
  )
}

describe('EngineOverlayProvider / useEngineOverlay', () => {
  it('throws when consumed outside the provider', () => {
    const orig = console.error
    console.error = () => {}
    try {
      expect(() => render(<Probe />)).toThrow(/EngineOverlayProvider/)
    } finally {
      console.error = orig
    }
  })

  it('toggles body.has-capture-sheet when activeCapture changes', async () => {
    render(
      <EngineOverlayProvider>
        <Probe />
      </EngineOverlayProvider>,
    )
    expect(document.body.classList.contains('has-capture-sheet')).toBe(false)

    await userEvent.click(screen.getByText('open-ask'))
    expect(document.body.classList.contains('has-capture-sheet')).toBe(true)
    expect(screen.getByTestId('active-capture').textContent).toBe('ask')

    await userEvent.click(screen.getByText('close-capture'))
    expect(document.body.classList.contains('has-capture-sheet')).toBe(false)
  })

  it('toggles body.has-chooser when activeChooser flips', async () => {
    render(
      <EngineOverlayProvider>
        <Probe />
      </EngineOverlayProvider>,
    )
    await userEvent.click(screen.getByText('open-chooser'))
    expect(document.body.classList.contains('has-chooser')).toBe(true)
  })

  it('toggles body.is-onboarding when isOnboarding flips', async () => {
    render(
      <EngineOverlayProvider>
        <Probe />
      </EngineOverlayProvider>,
    )
    await userEvent.click(screen.getByText('start-onboarding'))
    expect(document.body.classList.contains('is-onboarding')).toBe(true)
  })

  it('removes body classes on unmount', async () => {
    const { unmount } = render(
      <EngineOverlayProvider>
        <Probe />
      </EngineOverlayProvider>,
    )
    await userEvent.click(screen.getByText('open-ask'))
    expect(document.body.classList.contains('has-capture-sheet')).toBe(true)
    act(() => unmount())
    expect(document.body.classList.contains('has-capture-sheet')).toBe(false)
  })
})
