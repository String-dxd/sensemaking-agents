// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error vendored JS module is intentionally untyped.
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
// @ts-expect-error vendored JS module is intentionally untyped.
import EdupassLogin from '~/engine/student-space/Game/View/Onboarding/EdupassLogin.js'

interface MockCtx {
  copy: typeof ONBOARDING_COPY
  reducedMotion: boolean
  state: { backend?: unknown }
  profile: { setIdentity: ReturnType<typeof vi.fn> }
  view: undefined
}

function buildCtx(overrides: Partial<MockCtx> = {}): MockCtx {
  return {
    copy: ONBOARDING_COPY,
    reducedMotion: true,
    state: {},
    profile: { setIdentity: vi.fn() },
    view: undefined,
    ...overrides,
  }
}

let originalAssign: typeof window.location.assign
const assignSpy = vi.fn()

beforeEach(() => {
  originalAssign = window.location.assign
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: assignSpy,
  })
  assignSpy.mockClear()
  ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = null
})

afterEach(() => {
  Object.defineProperty(window.location, 'assign', {
    configurable: true,
    writable: true,
    value: originalAssign,
  })
  document.body.innerHTML = ''
  document.body.className = ''
  ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = null
  vi.useRealTimers()
})

async function mountLogin(ctxOverrides: Partial<MockCtx> = {}) {
  const root = document.createElement('div')
  root.className = 'onboarding-root'
  document.body.appendChild(root)
  const ctx = buildCtx(ctxOverrides)
  const surface = new EdupassLogin({ view: ctx.view })
  await surface.mount(root, ctx)
  return { surface, root, ctx }
}

describe('EdupassLogin (real auth surface)', () => {
  it('renders the three actions (Edupass, demo, offline)', async () => {
    const { root } = await mountLogin()
    expect(root.querySelector('[data-action="edupass"]')).toBeTruthy()
    expect(root.querySelector('[data-action="demo"]')).toBeTruthy()
    expect(root.querySelector('[data-action="offline"]')).toBeTruthy()
    // The form for the demo path must POST to the demo sign-in route.
    const demoForm = root.querySelector('[data-action="demo"]') as HTMLFormElement
    expect(demoForm.getAttribute('method')).toBe('post')
    expect(demoForm.getAttribute('action')).toBe('/api/auth/sign-in?demo=1&returnPathname=/')
    // The Edupass CTA is a real link to the WorkOS sign-in route — WorkOS
    // routes to its configured social provider (Google in v0.2) under the
    // hood; the "Edupass" wordmark is preserved as the Singapore-school cue.
    const edupass = root.querySelector('[data-action="edupass"]') as HTMLAnchorElement
    expect(edupass.getAttribute('href')).toBe('/api/auth/sign-in?returnPathname=/')
  })

  it('Edupass click disposes the engine and navigates to sign-in', async () => {
    const dispose = vi.fn()
    ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = { dispose }
    const { root } = await mountLogin()

    const edupass = root.querySelector('[data-action="edupass"]') as HTMLAnchorElement
    edupass.click()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(assignSpy).toHaveBeenCalledWith('/api/auth/sign-in?returnPathname=/')
  })

  it('demo form submit disposes the engine and submits via a body-scoped form', async () => {
    const dispose = vi.fn()
    ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = { dispose }
    // Spy on every HTMLFormElement.submit() call so we can verify the
    // navigation actually fires through a fresh body-scoped form (the
    // engine dispose detaches the in-place form before its native POST
    // would run — see ProfileSheet.js submitBodyScopedAuthForm).
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const { root } = await mountLogin()
    const form = root.querySelector('[data-action="demo"]') as HTMLFormElement
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submitEvent)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(submitEvent.defaultPrevented).toBe(true)
    // The body-scoped form is appended and submitted; the original form
    // (about to be detached by dispose) never reaches the native POST.
    expect(submitSpy).toHaveBeenCalledTimes(1)
    const submitted = submitSpy.mock.instances[0] as unknown as HTMLFormElement
    expect(submitted.action.endsWith('/api/auth/sign-in?demo=1&returnPathname=/')).toBe(true)
    expect(submitted.method.toLowerCase()).toBe('post')
    expect(submitted.parentElement).toBe(document.body)
    submitSpy.mockRestore()
  })

  it('offline path timer is cancelled when the surface unmounts mid-connecting', async () => {
    vi.useFakeTimers()
    const ctx = buildCtx({ state: { backend: undefined } })
    const root = document.createElement('div')
    root.className = 'onboarding-root'
    document.body.appendChild(root)
    const surface = new EdupassLogin({ view: undefined })
    const advance = vi.fn()
    surface.setAdvance(advance)
    await surface.mount(root, ctx)

    const offline = root.querySelector('[data-action="offline"]') as HTMLButtonElement
    offline.click()
    // Fire unmount without awaiting (its internal `await wait(EXIT_MS)` is a
    // setTimeout that fake timers must drive). Run all pending timers so
    // both the offline-path 600 ms timer and the unmount's exit-anim timer
    // resolve — the offline timer should be cleared by unmount before it
    // fires, while the exit-anim timer flushes the unmount promise.
    const unmountPromise = surface.unmount()
    await vi.runAllTimersAsync()
    await unmountPromise
    expect(ctx.profile.setIdentity).not.toHaveBeenCalled()
    expect(advance).not.toHaveBeenCalled()
  })

  it('offline click sets a random identity from OFFLINE_DEMO_STUDENTS and advances', async () => {
    vi.useFakeTimers()
    const ctx = buildCtx({ state: { backend: undefined } })
    const root = document.createElement('div')
    root.className = 'onboarding-root'
    document.body.appendChild(root)
    const surface = new EdupassLogin({ view: undefined })
    const advance = vi.fn()
    surface.setAdvance(advance)
    await surface.mount(root, ctx)

    const offline = root.querySelector('[data-action="offline"]') as HTMLButtonElement
    offline.click()

    // Advance the connecting timeout.
    vi.advanceTimersByTime(700)
    expect(ctx.profile.setIdentity).toHaveBeenCalledTimes(1)
    const arg = ctx.profile.setIdentity.mock.calls[0]?.[0] as { name: string; className: string }
    expect(typeof arg.name).toBe('string')
    expect(typeof arg.className).toBe('string')
    expect(advance).toHaveBeenCalledWith('greeting')
  })

  it('offline click in backend-present mode advances without setting identity', async () => {
    vi.useFakeTimers()
    const ctx = buildCtx({ state: { backend: { version: 1 } } })
    const root = document.createElement('div')
    root.className = 'onboarding-root'
    document.body.appendChild(root)
    const surface = new EdupassLogin({ view: undefined })
    const advance = vi.fn()
    surface.setAdvance(advance)
    await surface.mount(root, ctx)

    const offline = root.querySelector('[data-action="offline"]') as HTMLButtonElement
    offline.click()
    vi.advanceTimersByTime(700)
    // Backend snapshot owns identity when bridged — see EdupassLogin
    // contract: do not stomp `Profile.identity` from this surface when
    // a backend is wired.
    expect(ctx.profile.setIdentity).not.toHaveBeenCalled()
    expect(advance).toHaveBeenCalledWith('greeting')
  })

  it('re-entrant clicks are ignored while a connecting flow is in flight', async () => {
    const dispose = vi.fn()
    ;(window as { __studentSpaceGame?: unknown }).__studentSpaceGame = { dispose }
    const { root } = await mountLogin()
    const edupass = root.querySelector('[data-action="edupass"]') as HTMLAnchorElement
    edupass.click()
    edupass.click()
    edupass.click()
    expect(assignSpy).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('detaches listeners on unmount', async () => {
    const { surface, root } = await mountLogin()
    await surface.unmount()
    // Detached: no actions container in the DOM.
    expect(root.querySelector('.onb-login__actions')).toBeNull()
  })
})
