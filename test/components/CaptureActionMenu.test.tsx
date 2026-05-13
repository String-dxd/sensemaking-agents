import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CaptureActionMenu } from '~/components/CaptureActionMenu'

describe('CaptureActionMenu', () => {
  it('uses a supplied trigger slot directly for a single capture mode', () => {
    render(
      <CaptureActionMenu
        triggerSlot={<button type="button">Start voice</button>}
        modes={[{ id: 'voice', label: 'Voice reflection', onSelect: vi.fn() }]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Start voice' })).toBeInTheDocument()
    expect(screen.queryByTestId('capture-action-menu')).not.toBeInTheDocument()
  })

  it('opens a menu when multiple modes exist and selects a mode', async () => {
    const onVoice = vi.fn()
    const onMood = vi.fn()
    render(
      <CaptureActionMenu
        modes={[
          { id: 'voice', label: 'Voice reflection', onSelect: onVoice },
          { id: 'mood', label: 'Mood note', onSelect: onMood },
        ]}
      />,
    )

    await userEvent.click(screen.getByTestId('capture-action-trigger'))
    expect(screen.getByTestId('capture-action-trigger')).toHaveAccessibleName('Open capture')
    expect(screen.getByTestId('capture-action-menu')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('capture-mode-mood'))

    expect(onMood).toHaveBeenCalledTimes(1)
    expect(onVoice).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId('capture-action-menu')).toBeNull())
  })

  it('renders Speak and Feeling check-in as capture options', async () => {
    render(
      <CaptureActionMenu
        modes={[
          { id: 'voice', label: 'Speak', onSelect: vi.fn() },
          { id: 'mood', label: 'Feeling check-in', onSelect: vi.fn() },
        ]}
      />,
    )

    await userEvent.click(screen.getByTestId('capture-action-trigger'))
    expect(screen.getByRole('menuitem', { name: /speak/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /feeling check-in/i })).toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(
      <CaptureActionMenu
        modes={[
          { id: 'voice', label: 'Voice reflection', onSelect: vi.fn() },
          { id: 'mood', label: 'Mood note', onSelect: vi.fn() },
        ]}
      />,
    )
    const trigger = screen.getByTestId('capture-action-trigger')
    await userEvent.click(trigger)
    expect(screen.getByTestId('capture-action-menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('capture-action-menu')).toBeNull())
    expect(trigger).toHaveFocus()
  })
})
