/**
 * DevPalette — Cmd-K developer palette tests.
 *
 * Mocks `useNavigate` and `useRouterState` from `@tanstack/react-router` so
 * the palette can be rendered standalone, without the full router context.
 *
 * Coverage:
 *  - Cmd-K toggles the dialog open/closed
 *  - typing in the search input filters the visible commands
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: () => '/',
}))

import { DevPalette } from '~/components/DevPalette'

describe('DevPalette', () => {
  it('toggles open with Cmd-K and closed with Cmd-K again', async () => {
    const user = userEvent.setup()
    render(<DevPalette />)
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    // Closing — the dialog unmounts the input.
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument()
  })

  it('filters the command list as the user types', async () => {
    const user = userEvent.setup()
    render(<DevPalette />)
    await user.keyboard('{Meta>}k{/Meta}')
    const input = screen.getByPlaceholderText(/type a command/i)
    expect(screen.getByText(/Switch to UI mode/i)).toBeInTheDocument()
    expect(screen.getByText(/Sign out/i)).toBeInTheDocument()
    await user.type(input, 'sign')
    expect(screen.getByText(/Sign out/i)).toBeInTheDocument()
    expect(screen.queryByText(/Switch to UI mode/i)).not.toBeInTheDocument()
  })

  it('navigates with ArrowDown/ArrowUp and runs the active command on Enter', async () => {
    const user = userEvent.setup()
    navigate.mockClear()
    render(<DevPalette />)
    await user.keyboard('{Meta>}k{/Meta}')
    // First command in the list is "Switch to UI mode" → '/'. ArrowDown
    // moves to "Switch to backend table view" → '/dev/pipeline'.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(navigate).toHaveBeenCalledWith({ to: '/dev/pipeline' })
  })

  it('does not open when the Cmd-K event has defaultPrevented set', async () => {
    render(<DevPalette />)
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument()
    // Mirror Cmd-K but mark the event already handled. A nested input or
    // upstream listener may swallow the shortcut; the palette must not
    // shadow that intent and pop on top of whatever owned the keystroke.
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    event.preventDefault()
    window.dispatchEvent(event)
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument()
  })
})
