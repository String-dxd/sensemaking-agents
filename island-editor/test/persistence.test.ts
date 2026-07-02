import { describe, expect, it, vi } from 'vitest'
import { seedFromCurrentIsland } from '../src/terrain/islandSpec'
import type { IslandSpec } from '../src/terrain/islandSpec'
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

  it('loadSpec returns null when version is unsupported', () => {
    const storage = makeStorage()
    const spec = { ...seedFromCurrentIsland(), version: 3 }
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

  it('loadSpec returns null when relief.data length != resolution²', () => {
    const storage = makeStorage()
    const spec = { ...seedFromCurrentIsland(), relief: { resolution: 4, data: [0, 1, 2] } }
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

  it('saveSpec does not overwrite a good spec with an invalid one', () => {
    const storage = makeStorage()
    const good = seedFromCurrentIsland()
    saveSpec(good, storage)
    const bad = { ...seedFromCurrentIsland(), worldSize: Number.NaN } as IslandSpec
    saveSpec(bad, storage)
    expect(loadSpec(storage)).toEqual(good) // last-good retained, invalid write skipped
  })

  it('saveSpec is a no-op when storage is null', () => {
    // Should not throw
    expect(() => saveSpec(seedFromCurrentIsland(), null)).not.toThrow()
  })

  it('clearSaved is a no-op when storage is null', () => {
    expect(() => clearSaved(null)).not.toThrow()
  })

  it('autosave writes a sparse, shorter payload and loads back to identical dense relief', () => {
    const storage = makeStorage()
    const seed = seedFromCurrentIsland(8, 16) // 256-cell relief
    // A realistic mostly-zero island: a handful of sculpted cells.
    const spec: IslandSpec = {
      ...seed,
      relief: {
        resolution: seed.relief.resolution,
        data: seed.relief.data.map((_, i) => (i === 5 ? 0.4 : i === 100 ? -0.6 : 0)),
      },
    }
    saveSpec(spec, storage)

    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(raw as string).toContain('"encoding": "sparse"')
    // Sparse-on-disk must be shorter than the whole dense grid serialized.
    expect((raw as string).length).toBeLessThan(JSON.stringify(spec).length)

    const loaded = loadSpec(storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.relief.data).toEqual(spec.relief.data)
    expect(loaded?.relief.data[5]).toBe(0.4)
    expect(loaded?.relief.data[100]).toBe(-0.6)
  })

  it('loads a legacy v1 dense spec from storage (migration path)', () => {
    const storage = makeStorage()
    const seed = seedFromCurrentIsland(8, 4)
    const legacy = {
      ...seed,
      version: 1,
      relief: { resolution: 4, data: new Array(16).fill(0).map((_, i) => (i === 7 ? 0.5 : 0)) },
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))

    const loaded = loadSpec(storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.version).toBe(2) // normalized on read
    expect(loaded?.relief.resolution).toBe(4)
    expect(loaded?.relief.data).toHaveLength(16)
    expect(loaded?.relief.data[7]).toBe(0.5)
    expect(loaded?.relief.data).toEqual(legacy.relief.data)
  })
})
