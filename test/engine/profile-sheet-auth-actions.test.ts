// @vitest-environment happy-dom

/**
 * Engine ProfileSheet auth slot — sign-in / sign-out affordance.
 *
 * Mirrors the pattern used by `ProfileSheet.tabs.test.ts`: mock the State
 * singleton to a stub state so the sheet can boot without the full engine
 * + Persistence + Debug graph.
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

function makeProfileStub() {
  return {
    identity: { name: 'Mei', className: 'Sec 3B', avatarDataUrl: null },
    getFacet: () => ({
      paragraph: '',
      openQuestion: '',
      lastRefinedAt: new Date().toISOString(),
      quotes: [],
    }),
    countByClaim: () => ({}),
    forgetQuote: () => null,
  }
}

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

vi.mock('~/engine/student-space/Game/View/ThumbnailRenderer.js', () => ({
  default: class StubThumbnailRenderer {
    getThumbnail() {
      return ''
    }
  },
}))

vi.mock('~/engine/student-space/profile-tab-react-bridge.tsx', () => ({
  mountProfileTabReactPanel: vi.fn(),
  unmountProfileTabReactPanel: vi.fn(),
}))

import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
// @ts-expect-error vendored JS module is intentionally untyped.
import ProfileSheet from '~/engine/student-space/Game/View/ProfileSheet.js'

const dispose = vi.fn()

// happy-dom does not ship a working `localStorage`. Install a Map-backed
// stub mirroring the Web Storage API so the sign-out path's `ss:v1:*`
// wipe (and our subsequent assertions) read coherent values.
interface StorageStub {
  readonly length: number
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  clear(): void
}

function createStorageStub(): StorageStub {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    getItem(key) {
      return map.has(key) ? (map.get(key) ?? null) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null
    },
    clear() {
      map.clear()
    },
  }
}

let originalStorageDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  dispose.mockClear()
  ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = { dispose }
  originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorageStub(),
  })
})

afterEach(() => {
  ;(state as { instance: unknown }).instance = null
  OverlayController.instance = null
  ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = null
  document.body.innerHTML = ''
  document.body.className = ''
  if (originalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  } else {
    delete (window as { localStorage?: unknown }).localStorage
  }
})

function mountSheet(menu: AuthMenu) {
  const auth = makeAuthSlice(menu)
  ;(state as { instance: unknown }).instance = {
    auth,
    profile: makeProfileStub(),
    captures: { findById: () => null },
    moodPins: { pins: [] },
  }
  // ProfileSheet's constructor side-effects: appends `.profile-sheet` to
  // body and renders the identity header. No `.open()` is required for the
  // identity slot to render — `_renderAuthButton()` runs inside the
  // constructor's body.
  const sheet = new ProfileSheet() as { dispose?: () => void }
  return { sheet, auth }
}

describe('ProfileSheet auth slot', () => {
  it('renders a Sign in link with URL-encoded returnPathname when signed-out', () => {
    const { sheet } = mountSheet({ status: 'signed-out' })
    const link = document.querySelector('[data-testid="profile-auth-signin"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe(
      `/?auth=sign-in&returnPathname=${encodeURIComponent('/?sheet=profile')}#sign-in`,
    )
    sheet.dispose?.()
  })

  it('renders Sign out under a More menu when state.auth is signed-in', () => {
    const { sheet } = mountSheet({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
    const more = document.querySelector('[data-testid="profile-auth-more"]') as HTMLButtonElement
    const popover = document.querySelector('[data-testid="profile-auth-popover"]') as HTMLDivElement
    expect(more).toBeTruthy()
    expect(more.getAttribute('aria-label')).toBe('More profile actions')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(popover.hidden).toBe(true)
    const form = document.querySelector(
      '[data-testid="profile-auth-signout-form"]',
    ) as HTMLFormElement
    expect(form).toBeTruthy()
    expect(form.action.endsWith('/api/auth/sign-out')).toBe(true)
    expect(form.method).toBe('post')
    const btn = document.querySelector('[data-testid="profile-auth-signout"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent?.trim()).toBe('Sign out')
    sheet.dispose?.()
  })

  it('toggles and closes the signed-in More menu', () => {
    const { sheet } = mountSheet({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
    const more = document.querySelector('[data-testid="profile-auth-more"]') as HTMLButtonElement
    const popover = document.querySelector('[data-testid="profile-auth-popover"]') as HTMLDivElement

    more.click()
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(popover.hidden).toBe(false)

    const name = document.querySelector('.profile-id__name') as HTMLElement
    name.click()
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(popover.hidden).toBe(true)

    sheet.dispose?.()
  })

  it('signing out drains the engine, wipes ss:v1:*, and POSTs through a body-scoped form', () => {
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const { sheet } = mountSheet({
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-a',
      kind: 'demo',
    })
    window.localStorage.setItem('ss:v1:moodPins', '[]')
    window.localStorage.setItem('ss:v1:captures', '[]')
    window.localStorage.setItem('unrelated', 'keep-me')

    const more = document.querySelector('[data-testid="profile-auth-more"]') as HTMLButtonElement
    more.click()
    const btn = document.querySelector('[data-testid="profile-auth-signout"]') as HTMLButtonElement
    btn.click()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('ss:v1:moodPins')).toBeNull()
    expect(window.localStorage.getItem('ss:v1:captures')).toBeNull()
    expect(window.localStorage.getItem('unrelated')).toBe('keep-me')
    // The body-scoped form is the one that actually POSTs; the in-place
    // form's native submit was preventDefaulted so the browser cannot
    // abort it when engine dispose detaches the .profile-sheet root.
    expect(submitSpy).toHaveBeenCalledTimes(1)
    const submitted = submitSpy.mock.instances[0] as unknown as HTMLFormElement
    expect(submitted.action.endsWith('/api/auth/sign-out')).toBe(true)
    expect(submitted.method.toLowerCase()).toBe('post')
    expect(submitted.parentElement).toBe(document.body)
    submitSpy.mockRestore()
    sheet.dispose?.()
  })

  it('keyboard-Enter submit also routes through the body-scoped form', () => {
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const { sheet } = mountSheet({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
    const form = document.querySelector(
      '[data-testid="profile-auth-signout-form"]',
    ) as HTMLFormElement
    const more = document.querySelector('[data-testid="profile-auth-more"]') as HTMLButtonElement
    more.click()
    // Simulate keyboard-Enter submit (no click first).
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(submitSpy).toHaveBeenCalledTimes(1)
    submitSpy.mockRestore()
    sheet.dispose?.()
  })

  it('re-renders the auth slot when state.auth.setMenu fires', () => {
    const { sheet, auth } = mountSheet({ status: 'signed-out' })
    expect(document.querySelector('[data-testid="profile-auth-signin"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="profile-auth-more"]')).toBeFalsy()

    auth.setMenu({
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-a',
      kind: 'demo',
    })
    expect(document.querySelector('[data-testid="profile-auth-signin"]')).toBeFalsy()
    expect(document.querySelector('[data-testid="profile-auth-more"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="profile-auth-signout"]')).toBeTruthy()

    auth.setMenu({ status: 'signed-out' })
    expect(document.querySelector('[data-testid="profile-auth-signin"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="profile-auth-more"]')).toBeFalsy()
    sheet.dispose?.()
  })

  it('disposes the auth subscription on sheet teardown', () => {
    const { sheet, auth } = mountSheet({ status: 'signed-out' })
    expect(auth.subscribers.size).toBeGreaterThan(0)
    sheet.dispose?.()
    expect(auth.subscribers.size).toBe(0)
  })

  it('signing in via the link drains the engine before navigation', () => {
    const { sheet } = mountSheet({ status: 'signed-out' })
    const link = document.querySelector('[data-testid="profile-auth-signin"]') as HTMLAnchorElement
    link.addEventListener('click', (e) => e.preventDefault())
    link.click()
    expect(dispose).toHaveBeenCalledTimes(1)
    sheet.dispose?.()
  })
})
