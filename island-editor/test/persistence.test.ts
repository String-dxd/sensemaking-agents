import { describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  clearSaved,
  createAutosaver,
  loadSpec,
  saveSpec,
} from '../src/editor/persistence'
import type { StorageLike } from '../src/editor/persistence'
import { seedIsland } from '../src/terrain/seed'
import { GRID_COLS, GRID_ROWS, type IslandSpec } from '../src/terrain/terrainGrid'

function makeStorage(): StorageLike {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v) },
    removeItem: (k) => { store.delete(k) },
  }
}

// A hand-built legacy v2 payload (triangle island) as an old autosave would
// have written it.
function legacyV2() {
  return {
    version: 2,
    worldSize: 24,
    coastline: [
      { x: 6, z: 0 },
      { x: -6, z: 5 },
      { x: -6, z: -5 },
    ],
    heightProfile: { seaLevel: 0, plateauHeight: 1, coastFalloff: 2, cliffSteepness: 0.45, seafloorDepth: -1.2 },
    relief: { resolution: 4, data: new Array(16).fill(0) },
  }
}

describe('persistence (v3)', () => {
  it('round-trips a valid IslandSpec', () => {
    const storage = makeStorage()
    const spec = seedIsland()
    saveSpec(spec, storage)
    const loaded = loadSpec(storage)
    expect(loaded).toEqual(spec)
  })

  it('loadSpec returns null when storage is empty', () => {
    expect(loadSpec(makeStorage())).toBeNull()
  })

  it('loadSpec returns null on corrupt JSON', () => {
    const storage = makeStorage()
    storage.setItem(STORAGE_KEY, '{not valid json}}}')
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when version is unsupported', () => {
    const storage = makeStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...legacyV2(), version: 5 }))
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when the grid is malformed', () => {
    const storage = makeStorage()
    const bad = JSON.parse(JSON.stringify(seedIsland())) as Record<string, unknown>
    ;(bad.grid as Record<string, unknown>).tiers = ['123'] // wrong row count/shape
    storage.setItem(STORAGE_KEY, JSON.stringify(bad))
    expect(loadSpec(storage)).toBeNull()
  })

  it('loadSpec returns null when tierHeights is not ascending', () => {
    const storage = makeStorage()
    const spec = seedIsland()
    saveSpec(spec, storage)
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) as string)
    raw.tierHeights = [0, 0, 0, 0, 0]
    storage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadSpec(storage)).toBeNull()
  })

  it('a legacy v2 autosave under STORAGE_KEY loads as a migrated v3 spec', () => {
    const storage = makeStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(legacyV2()))
    const loaded = loadSpec(storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.version).toBe(3)
    expect(loaded?.grid.cols).toBe(GRID_COLS)
    expect(loaded?.grid.rows).toBe(GRID_ROWS)
    expect(loaded?.grid.tiers.some((t) => t >= 2)).toBe(true) // migration made land
  })

  it('clearSaved removes the stored spec', () => {
    const storage = makeStorage()
    saveSpec(seedIsland(), storage)
    expect(loadSpec(storage)).not.toBeNull()
    clearSaved(storage)
    expect(loadSpec(storage)).toBeNull()
  })

  it('createAutosaver debounces saves', async () => {
    vi.useFakeTimers()
    const storage = makeStorage()
    const saver = createAutosaver(400, storage)
    const spec = seedIsland()

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
    const good = seedIsland()
    saveSpec(good, storage)
    const bad = { ...seedIsland(), worldSize: Number.NaN } as IslandSpec
    saveSpec(bad, storage)
    expect(loadSpec(storage)).toEqual(good) // last-good retained, invalid write skipped
  })

  it('saveSpec is a no-op when storage is null', () => {
    expect(() => saveSpec(seedIsland(), null)).not.toThrow()
  })

  it('clearSaved is a no-op when storage is null', () => {
    expect(() => clearSaved(null)).not.toThrow()
  })

  it('persists the grid as digit-string rows (compact, diffable)', () => {
    const storage = makeStorage()
    saveSpec(seedIsland(), storage)
    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.grid.tiers).toHaveLength(GRID_ROWS)
    expect(typeof parsed.grid.tiers[0]).toBe('string')
  })
})
