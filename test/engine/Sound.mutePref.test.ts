import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — engine source is JavaScript without companion declarations.
import Sound from '~/engine/student-space/Game/View/Sound.js'

/**
 * The world autoplays streamed ambient music, so a first-time visitor must
 * start silent. `_savePref` always writes an explicit '1'/'0', which is what
 * lets "never chosen" (an absent key) mean muted without overriding a user
 * who deliberately turned sound on ('0').
 *
 * `Sound`'s constructor reaches for the `State` singleton and a WebAudio
 * context, so rather than mock half of WebAudio we invoke the preference
 * reader against a bare receiver — it only touches `localStorage`.
 */

const KEY = 'ss.sound.muted'

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

const loadMutePref = (): boolean => Sound.prototype._loadMutePref.call({})

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
    delete (window as { localStorage?: unknown }).localStorage
  }
})

describe('Sound._loadMutePref', () => {
  it('defaults to muted when the preference was never chosen', () => {
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(loadMutePref()).toBe(true)
  })

  it('stays unmuted when the user deliberately opted in', () => {
    window.localStorage.setItem(KEY, '0')
    expect(loadMutePref()).toBe(false)
  })

  it('stays muted when the user muted explicitly', () => {
    window.localStorage.setItem(KEY, '1')
    expect(loadMutePref()).toBe(true)
  })
})
