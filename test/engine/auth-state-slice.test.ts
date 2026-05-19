// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error vendored JS module is intentionally untyped.
import Auth from '~/engine/student-space/Game/State/Auth.js'

afterEach(() => {
  Auth.instance = null
})

describe('Auth state slice', () => {
  it('defaults to signed-out when no initial menu is supplied', () => {
    const auth = new Auth(null)
    expect(auth.menu).toEqual({ status: 'signed-out' })
    expect(auth.isSignedOut).toBe(true)
    expect(auth.isSignedIn).toBe(false)
  })

  it('accepts a signed-in menu and exposes label + detail + kind', () => {
    const auth = new Auth({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
    expect(auth.menu).toMatchObject({
      status: 'signed-in',
      label: 'Reza Ilmi',
      detail: 'reza@example.com',
      kind: 'workos',
    })
    expect(auth.isSignedIn).toBe(true)
    expect(auth.isSignedOut).toBe(false)
  })

  it('coerces malformed signed-in payloads to safe defaults', () => {
    // The unknown-kind path warns so server-side drift surfaces in dev
    // tools; silence the spy here since the coercion behavior is what
    // we are pinning.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const auth = new Auth({
      status: 'signed-in',
      label: 42 as unknown as string,
      detail: undefined as unknown as null,
      kind: 'bogus' as unknown as 'workos',
    })
    expect(auth.menu).toMatchObject({
      status: 'signed-in',
      label: '',
      detail: null,
      kind: 'workos',
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown menu kind'))
    warnSpy.mockRestore()
  })

  it('coerces unknown status to signed-out', () => {
    const auth = new Auth({ status: 'pending' } as unknown as null)
    expect(auth.menu).toEqual({ status: 'signed-out' })
  })

  it('fans setMenu changes to subscribers exactly once per change', () => {
    const auth = new Auth(null)
    const cb = vi.fn()
    auth.subscribe(cb)

    auth.setMenu({
      status: 'signed-in',
      label: 'Demo account',
      detail: 'demo-a',
      kind: 'demo',
    })
    expect(cb).toHaveBeenCalledTimes(1)
    const last = cb.mock.calls[0]?.[0] as { kind?: string }
    expect(last?.kind).toBe('demo')
  })

  it('does not re-notify when setMenu produces the same frozen reference', () => {
    const auth = new Auth({ status: 'signed-out' })
    const cb = vi.fn()
    auth.subscribe(cb)
    // Identity-equality short-circuit: setting back to the cached signed-out
    // singleton must not fan to subscribers.
    auth.setMenu(null)
    auth.setMenu({ status: 'pending' } as unknown as null)
    expect(cb).not.toHaveBeenCalled()
  })

  it('returns an unsubscribe function that removes the listener', () => {
    const auth = new Auth(null)
    const cb = vi.fn()
    const off = auth.subscribe(cb)
    off()
    auth.setMenu({
      status: 'signed-in',
      label: 'x',
      detail: null,
      kind: 'workos',
    })
    expect(cb).not.toHaveBeenCalled()
  })

  it('swallows subscriber errors so one bad listener cannot block others', () => {
    const auth = new Auth(null)
    const good = vi.fn()
    const bad = vi.fn(() => {
      throw new Error('subscriber boom')
    })
    auth.subscribe(bad)
    auth.subscribe(good)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    auth.setMenu({
      status: 'signed-in',
      label: 'x',
      detail: null,
      kind: 'workos',
    })
    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('honors the singleton guard — second constructor returns the same instance', () => {
    const first = new Auth({
      status: 'signed-in',
      label: 'a',
      detail: null,
      kind: 'workos',
    })
    const second = new Auth(null)
    // Singleton returns the existing instance; the new arg is ignored.
    expect(second).toBe(first)
    expect(second.menu).toMatchObject({ status: 'signed-in', label: 'a' })
  })

  it('Auth.instance = null clears the singleton for a fresh boot', () => {
    const first = new Auth({
      status: 'signed-in',
      label: 'a',
      detail: null,
      kind: 'workos',
    })
    Auth.instance = null
    const second = new Auth(null)
    expect(second).not.toBe(first)
    expect(second.menu).toEqual({ status: 'signed-out' })
  })
})
