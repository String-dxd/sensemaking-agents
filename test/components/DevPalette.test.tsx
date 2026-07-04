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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const signOutEngineMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: () => '/',
}))

vi.mock('~/lib/sign-out-engine', () => ({
  signOutEngine: signOutEngineMock,
}))

import { DevPalette } from '~/components/DevPalette'

let originalStorageDescriptor: PropertyDescriptor | undefined
let originalAssign: typeof window.location.assign
const assignSpy = vi.fn()

function createStorageStub() {
  const map = new Map<string, string>()
  return {
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null
    },
    setItem(key: string, value: string) {
      map.set(key, String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
  }
}

beforeEach(() => {
  originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorageStub(),
  })
  originalAssign = window.location.assign
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: assignSpy,
  })
  assignSpy.mockClear()
  signOutEngineMock.mockClear()
})

afterEach(() => {
  document.body.classList.remove('is-dev-overlay-hidden')
  document.body.classList.remove('is-world-controls-visible')
  navigate.mockClear()
  vi.unstubAllEnvs()
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: originalAssign,
  })
  if (originalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  } else {
    delete (window as { localStorage?: unknown }).localStorage
  }
})

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
    // moves to "Test agent pipeline" → '/dev/pipeline'.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(navigate).toHaveBeenCalledWith({ to: '/dev/pipeline' })
  })

  it('toggles the developer overlay from Cmd-K', async () => {
    const user = userEvent.setup()
    render(<DevPalette />)
    await user.keyboard('{Meta>}k{/Meta}')

    await user.click(screen.getByRole('option', { name: /show world controls/i }))
    expect(document.body).toHaveClass('is-world-controls-visible')
    expect(localStorage.getItem('sm:world-controls-visible')).toBe('1')

    await user.keyboard('{Meta>}k{/Meta}')
    await user.click(screen.getByRole('option', { name: /hide world controls/i }))
    expect(document.body).not.toHaveClass('is-world-controls-visible')
    expect(localStorage.getItem('sm:world-controls-visible')).toBeNull()
  })

  it('opens the standalone studios in a new tab from Cmd-K', async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    const originalOpen = window.open
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: openSpy,
    })

    render(<DevPalette />)
    await user.keyboard('{Meta>}k{/Meta}')

    await user.click(screen.getByRole('option', { name: /open island builder/i }))
    expect(openSpy).toHaveBeenLastCalledWith(
      expect.stringContaining(':5180/'),
      '_blank',
      'noopener,noreferrer',
    )

    // The click closed the palette; reopen to reach the bird builder.
    await user.keyboard('{Meta>}k{/Meta}')
    await user.click(screen.getByRole('option', { name: /open bird builder/i }))
    expect(openSpy).toHaveBeenLastCalledWith(
      expect.stringContaining(':5181/'),
      '_blank',
      'noopener,noreferrer',
    )

    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: originalOpen,
    })
  })

  it('keeps mature island preview available in production builds', async () => {
    vi.stubEnv('DEV', false)
    const user = userEvent.setup()
    const matureIslandListener = vi.fn()
    window.addEventListener('ss:mature-island-toggle', matureIslandListener)
    render(<DevPalette />)

    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByRole('option', { name: /show mature island/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /show camera tuner/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /show hatch tuner/i })).not.toBeInTheDocument()
    // The standalone studios are dev-only (localhost dev servers); they must
    // not surface in a production build.
    expect(screen.queryByRole('option', { name: /open island builder/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /open bird builder/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: /show mature island/i }))
    expect(matureIslandListener).toHaveBeenCalledTimes(1)
    expect(matureIslandListener.mock.calls[0]?.[0]).toMatchObject({
      detail: { on: true },
    })

    window.removeEventListener('ss:mature-island-toggle', matureIslandListener)
  })

  it('restarts onboarding from Cmd-K without clearing the full student-space state', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ss:v1:onboarding', '{"stage":"done"}')
    localStorage.setItem('ss:v1:moodPins', '[]')
    render(<DevPalette />)
    await user.keyboard('{Meta>}k{/Meta}')

    await user.click(screen.getByRole('option', { name: /restart onboarding/i }))

    expect(signOutEngineMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('ss:v1:onboarding')).toBeNull()
    expect(localStorage.getItem('ss:v1:moodPins')).toBe('[]')
    expect(assignSpy).toHaveBeenCalledWith('/onboarding')
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
