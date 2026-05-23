// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EdupassLogin } from '~/components/student-space/onboarding/EdupassLogin'

function renderLogin(
  props: Partial<Parameters<typeof EdupassLogin>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <EdupassLogin
      reducedMotion
      camera={{ startLandingOrbit: vi.fn(), stopLandingOrbit: vi.fn() }}
      {...props}
    />,
  )
}

let originalAssign: typeof window.location.assign
const assignSpy = vi.fn()

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  originalAssign = window.location.assign
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: assignSpy,
  })
  assignSpy.mockClear()
  window.__studentSpaceGame = null
})

afterEach(() => {
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: originalAssign,
  })
  document.body.innerHTML = ''
  document.body.className = ''
  window.__studentSpaceGame = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('EdupassLogin (React)', () => {
  it('renders Edupass and demo actions with the auth routes', () => {
    renderLogin()

    const edupass = screen.getByRole('link', { name: /sign in with edupass/i })
    const demo = screen.getByRole('button', { name: /use a demo account/i })

    expect(edupass).toHaveAttribute('data-action', 'edupass')
    expect(edupass).toHaveAttribute('href', '/api/auth/sign-in?returnPathname=%2F')
    expect(demo.closest('form')).toHaveAttribute('data-action', 'demo')
    expect(demo.closest('form')).toHaveAttribute(
      'action',
      '/api/auth/sign-in?demo=1&returnPathname=%2F',
    )
  })

  it('passes through a profile returnPathname when opened as the profile sign-in page', () => {
    window.history.replaceState(
      {},
      '',
      `/?auth=sign-in&returnPathname=${encodeURIComponent('/?sheet=profile')}#sign-in`,
    )
    renderLogin()

    expect(screen.getByRole('link', { name: /sign in with edupass/i })).toHaveAttribute(
      'href',
      `/api/auth/sign-in?returnPathname=${encodeURIComponent('/?sheet=profile')}`,
    )
    expect(
      screen.getByRole('button', { name: /use a demo account/i }).closest('form'),
    ).toHaveAttribute(
      'action',
      `/api/auth/sign-in?demo=1&returnPathname=${encodeURIComponent('/?sheet=profile')}`,
    )
  })

  it('Edupass click disposes the engine and navigates to sign-in', async () => {
    const dispose = vi.fn()
    window.__studentSpaceGame = { dispose } as typeof window.__studentSpaceGame
    renderLogin()

    await userEvent.click(screen.getByRole('link', { name: /sign in with edupass/i }))

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(assignSpy).toHaveBeenCalledWith('/api/auth/sign-in?returnPathname=%2F')
  })

  it('demo form submit disposes the engine and submits via a body-scoped form', async () => {
    const dispose = vi.fn()
    window.__studentSpaceGame = { dispose } as typeof window.__studentSpaceGame
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: /use a demo account/i }))

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(submitSpy).toHaveBeenCalledTimes(1)
    const submitted = submitSpy.mock.instances[0] as unknown as HTMLFormElement
    expect(submitted.action.endsWith('/api/auth/sign-in?demo=1&returnPathname=%2F')).toBe(true)
    expect(submitted.method.toLowerCase()).toBe('post')
    expect(submitted.parentElement).toBe(document.body)
  })

  it('re-entrant clicks are ignored while connecting', async () => {
    const dispose = vi.fn()
    window.__studentSpaceGame = { dispose } as typeof window.__studentSpaceGame
    renderLogin()
    const edupass = screen.getByRole('link', { name: /sign in with edupass/i })

    await userEvent.click(edupass)
    await userEvent.click(edupass)

    expect(assignSpy).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('toggles landing body class and camera orbit for the lifecycle', async () => {
    const camera = { startLandingOrbit: vi.fn(), stopLandingOrbit: vi.fn() }
    const { unmount } = renderLogin({ reducedMotion: false, camera })
    await waitFor(() => expect(document.body.classList.contains('is-onb-landing')).toBe(true))
    expect(camera.startLandingOrbit).toHaveBeenCalledWith({
      azimuthDegPerSec: 1,
      distance: 33.9,
      pitchDeg: 35,
    })

    unmount()

    expect(camera.stopLandingOrbit).toHaveBeenCalledTimes(1)
    expect(document.body.classList.contains('is-onb-landing')).toBe(false)
  })
})
