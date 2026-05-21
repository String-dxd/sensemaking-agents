/**
 * clearStudentSpaceLocalState — sign-out helper that wipes only the engine's
 * namespaced `ss:v1:*` keys from `window.localStorage`, leaving other origin
 * state (auth tokens, theme preference, etc.) intact.
 *
 * Coverage:
 *  - SSR safety: no-throws when `window` is undefined
 *  - Prefix filter: only `ss:v1:*` keys are removed
 *  - Empty store: silent no-op
 *
 * happy-dom does not ship a working `localStorage` by default, so each test
 * installs a Map-backed stub mirroring the Web Storage API.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearStudentSpaceLocalState } from '~/lib/clear-student-space-local-state'

interface StorageStub {
  readonly length: number
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
}

function createStorageStub(): StorageStub {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null
    },
    setItem(key: string, value: string) {
      map.set(key, String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
    key(index: number) {
      const keys = Array.from(map.keys())
      return keys[index] ?? null
    },
  }
}

let originalStorageDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorageStub(),
  })
})

afterEach(() => {
  if (originalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  } else {
    // No prior descriptor — drop the stub so the environment matches the
    // pre-test state.
    Reflect.deleteProperty(window, 'localStorage')
  }
})

describe('clearStudentSpaceLocalState', () => {
  it('removes only ss:v1:* keys and leaves other origin state alone', () => {
    window.localStorage.setItem('ss:v1:profile', '"avatar-A"')
    window.localStorage.setItem('ss:v1:moodPins', '[]')
    window.localStorage.setItem('ss:v1:captures', '[]')
    window.localStorage.setItem('auth.session', 'wos-abc')
    window.localStorage.setItem('theme', 'dark')

    clearStudentSpaceLocalState()

    expect(window.localStorage.getItem('ss:v1:profile')).toBeNull()
    expect(window.localStorage.getItem('ss:v1:moodPins')).toBeNull()
    expect(window.localStorage.getItem('ss:v1:captures')).toBeNull()
    // Non-prefixed keys survive — the helper is scoped to engine state only.
    expect(window.localStorage.getItem('auth.session')).toBe('wos-abc')
    expect(window.localStorage.getItem('theme')).toBe('dark')
  })

  it('does not throw when window is undefined (SSR guard)', () => {
    const originalWindow = globalThis.window
    // Deliberate SSR simulation — assert the helper handles a missing
    // `window` without crashing the import boundary.
    delete (globalThis as { window?: unknown }).window
    try {
      expect(() => clearStudentSpaceLocalState()).not.toThrow()
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('is a no-op when there are no matching keys', () => {
    window.localStorage.setItem('auth.session', 'wos-abc')
    expect(() => clearStudentSpaceLocalState()).not.toThrow()
    expect(window.localStorage.getItem('auth.session')).toBe('wos-abc')
  })
})
