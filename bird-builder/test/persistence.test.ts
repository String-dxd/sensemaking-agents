import { describe, expect, it, vi } from 'vitest'
import { defaultBirdConfig } from '../src/bird/birdConfig'
import {
  clearSaved,
  createAutosaver,
  loadConfig,
  saveConfig,
  STORAGE_KEY,
  type StorageLike,
} from '../src/editor/persistence'

function makeStorage(): StorageLike {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v)
    },
    removeItem: (k) => {
      store.delete(k)
    },
  }
}

describe('persistence', () => {
  it('round-trips a valid config', () => {
    const storage = makeStorage()
    const config = defaultBirdConfig()
    saveConfig(config, storage)
    expect(loadConfig(storage)).toEqual(config)
  })

  it('returns null on empty / corrupt / wrong-version / invalid-palette', () => {
    const storage = makeStorage()
    expect(loadConfig(storage)).toBeNull()
    storage.setItem(STORAGE_KEY, '{not json}}}')
    expect(loadConfig(storage)).toBeNull()
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultBirdConfig(), version: 2 }))
    expect(loadConfig(storage)).toBeNull()
    const badPalette = defaultBirdConfig()
    badPalette.featherPalette = { body: 'red', accent: '#fff' }
    storage.setItem(STORAGE_KEY, JSON.stringify(badPalette))
    expect(loadConfig(storage)).toBeNull()
  })

  it('clearSaved removes the stored config', () => {
    const storage = makeStorage()
    saveConfig(defaultBirdConfig(), storage)
    expect(loadConfig(storage)).not.toBeNull()
    clearSaved(storage)
    expect(loadConfig(storage)).toBeNull()
  })

  it('createAutosaver debounces', () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    const save = createAutosaver(400, storage)
    const config = defaultBirdConfig()
    save(config)
    save(config)
    save(config)
    expect(loadConfig(storage)).toBeNull()
    vi.advanceTimersByTime(400)
    expect(loadConfig(storage)).toEqual(config)
    vi.useRealTimers()
  })

  it('is a no-op when storage is null', () => {
    expect(() => saveConfig(defaultBirdConfig(), null)).not.toThrow()
    expect(() => clearSaved(null)).not.toThrow()
    expect(loadConfig(null)).toBeNull()
  })
})
