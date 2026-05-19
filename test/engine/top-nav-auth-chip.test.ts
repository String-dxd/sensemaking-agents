// @vitest-environment happy-dom

/**
 * Engine TopNav — Sign-in chip parity for the auth state slice.
 *
 * The chip appears only when `state.auth` is signed-out, hosts a popover
 * with WorkOS + demo shortcuts, and disappears when the auth slice flips
 * to signed-in. The popover does NOT register with OverlayController.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface AuthMenu {
  status: 'signed-out' | 'signed-in'
  label?: string
  detail?: string | null
  kind?: 'workos' | 'demo' | 'dev-bypass'
}

function makeAuthSlice(initial: AuthMenu) {
  const subscribers = new Set<(menu: AuthMenu) => void>()
  let menu: AuthMenu = initial
  return {
    subscribers,
    get menu() {
      return menu
    },
    get isSignedIn() {
      return menu.status === 'signed-in'
    },
    get isSignedOut() {
      return menu.status === 'signed-out'
    },
    setMenu(next: AuthMenu) {
      menu = next
      for (const cb of subscribers) cb(menu)
      return menu
    },
    subscribe(cb: (menu: AuthMenu) => void) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }
}

const state = vi.hoisted(() => ({ instance: null as unknown }))
const overlayInstance = vi.hoisted(() => ({
  isOpen: vi.fn().mockReturnValue(false),
  open: vi.fn(),
  close: vi.fn(),
}))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

vi.mock('~/engine/student-space/Game/View/OverlayController.js', () => ({
  default: { getInstance: () => overlayInstance },
}))

// @ts-expect-error vendored JS module
import TopNav from '~/engine/student-space/Game/View/TopNav.js'

const dispose = vi.fn()
const assignSpy = vi.fn()
let originalAssign: typeof window.location.assign

beforeEach(() => {
  dispose.mockClear()
  assignSpy.mockClear()
  overlayInstance.isOpen.mockClear()
  overlayInstance.open.mockClear()
  overlayInstance.close.mockClear()
  ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = { dispose }
  originalAssign = window.location.assign
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: assignSpy,
  })
})

afterEach(() => {
  ;(state as { instance: unknown }).instance = null
  ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = null
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: originalAssign,
  })
  document.body.innerHTML = ''
})

function mountTopNav(menu: AuthMenu) {
  const auth = makeAuthSlice(menu)
  ;(state as { instance: unknown }).instance = { auth }
  const nav = new TopNav() as { dispose?: () => void }
  return { nav, auth }
}

describe('TopNav Sign-in chip', () => {
  it('renders four chips when signed-in (no Sign-in chip)', () => {
    const { nav } = mountTopNav({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
    const chips = document.querySelectorAll('.top-nav .top-nav__chip')
    expect(chips).toHaveLength(4)
    expect(document.querySelector('[data-action="auth-signin"]')).toBeNull()
    nav.dispose?.()
  })

  it('renders five chips when signed-out (Letters, History, Profile, Path Finder, Sign in)', () => {
    const { nav } = mountTopNav({ status: 'signed-out' })
    const chips = document.querySelectorAll('.top-nav .top-nav__chip')
    expect(chips).toHaveLength(5)
    const signin = document.querySelector('[data-action="auth-signin"]') as HTMLButtonElement
    expect(signin).toBeTruthy()
    expect(signin.getAttribute('aria-haspopup')).toBe('true')
    nav.dispose?.()
  })

  it('clicking the Sign-in chip opens the popover', () => {
    const { nav } = mountTopNav({ status: 'signed-out' })
    const signin = document.querySelector('[data-action="auth-signin"]') as HTMLButtonElement
    const popover = document.querySelector('[data-signin-popover]') as HTMLElement
    expect(popover.hidden).toBe(true)
    signin.click()
    expect(popover.hidden).toBe(false)
    expect(signin.getAttribute('aria-expanded')).toBe('true')
    nav.dispose?.()
  })

  it('Google option drains the engine and navigates to /api/auth/sign-in', () => {
    const { nav } = mountTopNav({ status: 'signed-out' })
    const signin = document.querySelector('[data-action="auth-signin"]') as HTMLButtonElement
    signin.click()
    const google = document.querySelector('[data-signin-google]') as HTMLAnchorElement
    expect(google.getAttribute('href')).toBe('/api/auth/sign-in?returnPathname=/')
    google.click()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(assignSpy).toHaveBeenCalledWith('/api/auth/sign-in?returnPathname=/')
    nav.dispose?.()
  })

  it('Demo option POSTs to /api/auth/sign-in?demo=1 and drains the engine', () => {
    const { nav } = mountTopNav({ status: 'signed-out' })
    const signin = document.querySelector('[data-action="auth-signin"]') as HTMLButtonElement
    signin.click()
    const form = document.querySelector('[data-signin-demo]') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/api/auth/sign-in?demo=1&returnPathname=/')
    expect(form.getAttribute('method')).toBe('post')
    const btn = form.querySelector('button') as HTMLButtonElement
    // Stop the native form POST from navigating in test env, but assert that
    // the click path drains the engine.
    form.addEventListener('submit', (e) => e.preventDefault())
    btn.click()
    expect(dispose).toHaveBeenCalledTimes(1)
    nav.dispose?.()
  })

  it('flipping to signed-in removes the chip', () => {
    const { nav, auth } = mountTopNav({ status: 'signed-out' })
    expect(document.querySelector('[data-action="auth-signin"]')).toBeTruthy()
    auth.setMenu({
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-a',
      kind: 'demo',
    })
    expect(document.querySelector('[data-action="auth-signin"]')).toBeNull()
    expect(document.querySelector('[data-signin-popover]')).toBeNull()
    nav.dispose?.()
  })

  it('flipping back to signed-out re-adds the chip', () => {
    const { nav, auth } = mountTopNav({
      status: 'signed-in',
      label: 'Reza',
      detail: null,
      kind: 'workos',
    })
    expect(document.querySelector('[data-action="auth-signin"]')).toBeNull()
    auth.setMenu({ status: 'signed-out' })
    expect(document.querySelector('[data-action="auth-signin"]')).toBeTruthy()
    nav.dispose?.()
  })

  it('disposes the auth subscription and document listeners on teardown', () => {
    const { nav, auth } = mountTopNav({ status: 'signed-out' })
    expect(auth.subscribers.size).toBeGreaterThan(0)
    nav.dispose?.()
    expect(auth.subscribers.size).toBe(0)
    expect(document.querySelector('.top-nav')).toBeNull()
  })

  it('clicking a primary sheet chip still delegates to OverlayController', () => {
    const { nav } = mountTopNav({ status: 'signed-out' })
    const profile = document.querySelector('[data-sheet="profile"]') as HTMLButtonElement
    profile.click()
    expect(overlayInstance.open).toHaveBeenCalledWith('profile')
    nav.dispose?.()
  })
})
