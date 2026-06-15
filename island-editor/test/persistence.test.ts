import { describe, expect, it, vi } from 'vitest'
import { seedFromCurrentIsland } from '../src/terrain/islandSpec'
import {
  STORAGE_KEY,
  clearSaved,
  createAutosaver,
  loadSpec,
  saveSpec,
} from '../src/editor/persistence'
import type { StorageLike } from '../src/editor/persistence'

function makeStorage(): StorageLike {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v) },
    removeItem: (k) => { store.delete(k) },
  }
}

describe('persistence', () => {
  it('round-trips a valid IslandSpec', () => {
    const storage = makeStorage()
    const spec = seedFromCurrentIsland()
    saveSpec(spec, storage)
    const loaded = loadSpec(storage)
    expect(loaded).toEqual(spec)
  })

  it('loadSpec returns null when storage is empty', () => {
    const storage = makeStorage()
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null on corrupt JSON', () => {
    const storage = makeStorage()
    storage.setItem(STORAGE_KEY, '{not valid json}}}')
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when version is wrong', () => {
    const storage = makeStorage()
    const spec = { ...seedFromCurrentIsland(), version: 2 }
    storage.setItem(STORAGE_KEY, JSON.stringify(spec))
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when worldSize is non-finite', () => {
    const storage = makeStorage()
    const spec = { ...seedFromCurrentIsland(), worldSize: Infinity }
    storage.setItem(STORAGE_KEY, JSON.stringify(spec))
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when coastline entries are missing fields', () => {
    const storage = makeStorage()
    const spec = { ...seedFromCurrentIsland(), coastline: [{ x: 1 }] }
    storage.setItem(STORAGE_KEY, JSON.stringify(spec))
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when heightProfile is missing a field', () => {
    const storage = makeStorage()
    const base = seedFromCurrentIsland()
    const { seaLevel: _dropped, ...partialProfile } = base.heightProfile
    const spec = { ...base, heightProfile: partialProfile }
    storage.setItem(STORAGE_KEY, JSON.stringify(spec))
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when relief.data is not an array', () => {
    const storage = makeStorage()
    const base = seedFromCurrentIsland()
    const spec = { ...base, relief: { resolution: 4, data: 'bad' } }
    storage.setItem(STORAGE_KEY, JSON.stringify(spec))
    expect(loadSpec(storage)).toBeNull()
  })

  it('clearSaved removes the stored spec', () => {
    const storage = makeStorage()
    const spec = seedFromCurrentIsland()
    saveSpec(spec, storage)
    expect(loadSpec(storage)).not.toBeNull()
    clearSaved(storage)
    expect(loadSpec(storage)).toBeNull()
  })

  it('createAutosaver debounces saves', async () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    const saver = createAutosaver(400, storage)
    const spec = seedFromCurrentIsland()

    saver(spec)
    saver(spec)
    saver(spec)

    // Not saved yet — timer still pending
    expect(loadSpec(storage)).toBeNull()

    vi.advanceTimersByTime(400)
    expect(loadSpec(storage)).toEqual(spec)

    vi.useRealTimers()
  })

  it('saveSpec is a no-op when storage is null', () => {
    // Should not throw
    expect(() => saveSpec(seedFromCurrentIsland(), null)).not.toThrow()
  })

  it('clearSaved is a no-op when storage is null', () => {
    expect(() => clearSaved(null)).not.toThrow()
  })
})
