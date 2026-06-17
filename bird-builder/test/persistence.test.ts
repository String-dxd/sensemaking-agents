import { describe, expect, it, vi } from 'vitest'
import { defaultBirdConfig } from '../src/bird/birdConfig'
import { defaultGenome } from '../src/bird/genome'
import { clearSaved, createAutosaver, loadConfig, saveConfig, STORAGE_KEY, type StorageLike } from '../src/editor/persistence'

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
  it('round-trips a valid genome', () => {
    const storage = makeStorage()
    const config = defaultGenome()
    saveConfig(config, storage)
    expect(loadConfig(storage)).toEqual(config)
  })

  it('upgrades a stale v1 autosave in place (does not reset to null)', () => {
    const storage = makeStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(defaultBirdConfig()))
    const loaded = loadConfig(storage)
    expect(loaded?.version).toBe(2)
    expect(loaded?.base.kind).toBe('glb')
  })

  it('returns null on empty / corrupt / invalid', () => {
    const storage = makeStorage()
    expect(loadConfig(storage)).toBeNull()
    storage.setItem(STORAGE_KEY, '{not json}}}')
    expect(loadConfig(storage)).toBeNull()
    const bad = defaultGenome()
    bad.base.palette.back = 'red'
    storage.setItem(STORAGE_KEY, JSON.stringify(bad))
    expect(loadConfig(storage)).toBeNull()
  })

  it('clearSaved removes the stored config', () => {
    const storage = makeStorage()
    saveConfig(defaultGenome(), storage)
    expect(loadConfig(storage)).not.toBeNull()
    clearSaved(storage)
    expect(loadConfig(storage)).toBeNull()
  })

  it('createAutosaver debounces', () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    const save = createAutosaver(400, storage)
    const config = defaultGenome()
    save(config)
    save(config)
    save(config)
    expect(loadConfig(storage)).toBeNull()
    vi.advanceTimersByTime(400)
    expect(loadConfig(storage)).toEqual(config)
    vi.useRealTimers()
  })

  it('is a no-op when storage is null', () => {
    expect(() => saveConfig(defaultGenome(), null)).not.toThrow()
    expect(() => clearSaved(null)).not.toThrow()
    expect(loadConfig(null)).toBeNull()
  })
})
