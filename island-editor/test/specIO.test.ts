import { describe, expect, it } from 'vitest'
import { deserializeSpec, serializeSpec, validateSpecObject } from '../src/editor/specIO'
import { mulberry32 } from '../src/models/rand'
import { makePlacedObject } from '../src/terrain/objectOps'
import { seedIsland } from '../src/terrain/seed'
import {
  createOceanGrid,
  DEFAULT_TIER_HEIGHTS,
  GRID_COLS,
  GRID_ROWS,
  LEGACY_DEFAULT_TIER_HEIGHTS,
  SURFACE_AUTO,
  SURFACE_GRASS,
} from '../src/terrain/terrainGrid'

// A hand-built legacy v2 spec (a triangle island).
function v2Spec() {
  return {
    version: 2,
    worldSize: 24,
    coastline: [
      { x: 6, z: 0 },
      { x: -6, z: 5 },
      { x: -6, z: -5 },
    ],
    heightProfile: { seaLevel: 0.25, plateauHeight: 1, coastFalloff: 2, cliffSteepness: 0.45, seafloorDepth: -1.2 },
    relief: { resolution: 4, data: new Array(16).fill(0) },
  }
}

describe('specIO', () => {
  it('round-trips a v5 spec through serialize/deserialize', () => {
    const spec = seedIsland()
    const back = deserializeSpec(serializeSpec(spec))
    expect(back.version).toBe(5)
    expect(back.worldSize).toBe(spec.worldSize)
    expect(back.seaLevel).toBe(spec.seaLevel)
    expect(back.tierHeights).toEqual(spec.tierHeights)
    expect(back.grid).toEqual(spec.grid)
    expect(back.objects).toEqual([])
  })

  it('round-trips a v5 spec with placed objects', () => {
    const spec = seedIsland()
    spec.objects = [
      makePlacedObject('tree', 10, 12, mulberry32(1)),
      makePlacedObject('rock', 40, 5, mulberry32(2)),
    ]
    const back = deserializeSpec(serializeSpec(spec))
    expect(back.version).toBe(5)
    expect(back.objects).toEqual(spec.objects)
  })

  it('serializes the grid as digit-string rows and objects as a plain array', () => {
    const spec = seedIsland()
    spec.objects = [makePlacedObject('tree', 1, 2, mulberry32(3))]
    const json = JSON.parse(serializeSpec(spec))
    expect(json.version).toBe(5)
    expect(json.grid.tiers).toHaveLength(GRID_ROWS)
    expect(typeof json.grid.tiers[0]).toBe('string')
    expect(json.grid.tiers[0]).toHaveLength(GRID_COLS)
    expect(Array.isArray(json.objects)).toBe(true)
    expect(json.objects[0].kind).toBe('tree')
  })

  it('validates a v2 spec and returns it migrated to v5 with a 64×64 grid + empty objects', () => {
    const spec = validateSpecObject(v2Spec())
    expect(spec.version).toBe(5)
    expect(spec.worldSize).toBe(24)
    expect(spec.seaLevel).toBe(0.25) // taken from v2 heightProfile.seaLevel
    expect(spec.tierHeights).toEqual(DEFAULT_TIER_HEIGHTS)
    expect(spec.grid.cols).toBe(GRID_COLS)
    expect(spec.grid.rows).toBe(GRID_ROWS)
    // migration produced actual land
    expect(spec.grid.tiers.some((t) => t >= 2)).toBe(true)
    expect(spec.objects).toEqual([])
  })

  it('migrates a v3 spec to v5 with an empty objects array', () => {
    // Build a valid v3 file: serialize a v5 seed, then downgrade to version 3
    // and strip the objects field (a genuine pre-v4 payload).
    const parsed = JSON.parse(serializeSpec(seedIsland()))
    parsed.version = 3
    parsed.objects = undefined
    const spec = validateSpecObject(parsed)
    expect(spec.version).toBe(5)
    expect(spec.objects).toEqual([])
  })

  it('throws on an unsupported version', () => {
    expect(() => validateSpecObject({ ...v2Spec(), version: 6 })).toThrow(/version must be/)
  })

  it('throws on an invalid object entry (unknown kind)', () => {
    const parsed = JSON.parse(serializeSpec(seedIsland()))
    parsed.objects = [{ id: 'x', kind: 'dragon', c: 0, r: 0, yaw: 0, scale: 1 }]
    expect(() => validateSpecObject(parsed)).toThrow(/objects\[0\]\.kind/)
  })

  it('migrates the retired tree kinds (fruitTree/pine/palm) to `tree` instead of rejecting the spec', () => {
    // An island saved before the three authored trees collapsed into one Meshy
    // asset must still open — the ids are stable, only the kind is rewritten.
    const parsed = JSON.parse(serializeSpec(seedIsland()))
    parsed.objects = [
      { id: 'a', kind: 'fruitTree', c: 1, r: 1, yaw: 0, scale: 1 },
      { id: 'b', kind: 'pine', c: 2, r: 2, yaw: 0, scale: 1 },
      { id: 'c', kind: 'palm', c: 3, r: 3, yaw: 0, scale: 1 },
      { id: 'd', kind: 'rock', c: 4, r: 4, yaw: 0, scale: 1 },
    ]
    const spec = validateSpecObject(parsed)
    expect(spec.objects.map((o) => o.kind)).toEqual(['tree', 'tree', 'tree', 'rock'])
    expect(spec.objects.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('throws on an object with an out-of-range cell', () => {
    const parsed = JSON.parse(serializeSpec(seedIsland()))
    parsed.objects = [{ id: 'x', kind: 'rock', c: 9999, r: 0, yaw: 0, scale: 1 }]
    expect(() => validateSpecObject(parsed)).toThrow(/objects\[0\]\.c/)
  })

  it('throws on an object with a non-positive scale', () => {
    const parsed = JSON.parse(serializeSpec(seedIsland()))
    parsed.objects = [{ id: 'x', kind: 'rock', c: 0, r: 0, yaw: 0, scale: 0 }]
    expect(() => validateSpecObject(parsed)).toThrow(/objects\[0\]\.scale/)
  })

  it('throws on malformed JSON', () => {
    expect(() => deserializeSpec('{not json')).toThrow(/malformed JSON/)
  })

  it('throws when tierHeights is not strictly ascending', () => {
    const spec = seedIsland()
    const bad = JSON.parse(serializeSpec(spec))
    bad.tierHeights = [0, 0, 1, 2, 3]
    expect(() => validateSpecObject(bad)).toThrow(/strictly-ascending/)
  })
})

describe('v5 surface migration (dirt path removed, code 1 now means grass)', () => {
  // A grid with a couple of painted cells (surface code 1), following the
  // file's own convention for hand-built specs.
  function paintedGrid() {
    const grid = createOceanGrid()
    grid.surface[0] = SURFACE_GRASS
    grid.surface[10] = SURFACE_GRASS
    grid.tiers[0] = 2 // land, so the paint would be meaningful if it survived
    return grid
  }

  it('clears a v4 payload’s painted surface on load, preserving tiers and objects', () => {
    const parsed = {
      version: 4,
      worldSize: 24,
      seaLevel: 0,
      tierHeights: DEFAULT_TIER_HEIGHTS.slice(),
      grid: paintedGrid(),
      objects: [{ id: 'x', kind: 'rock', c: 5, r: 5, yaw: 0, scale: 1 }],
    }
    const spec = validateSpecObject(parsed)
    expect(spec.version).toBe(5)
    expect(spec.grid.surface.every((s) => s === SURFACE_AUTO)).toBe(true)
    expect(spec.grid.tiers[0]).toBe(2) // tiers untouched
    expect(spec.objects).toHaveLength(1)
    expect(spec.objects[0].id).toBe('x')
  })

  it('clears a v3 payload’s painted surface on load, with objects forced empty', () => {
    const parsed = {
      version: 3,
      worldSize: 24,
      seaLevel: 0,
      tierHeights: DEFAULT_TIER_HEIGHTS.slice(),
      grid: paintedGrid(),
    }
    const spec = validateSpecObject(parsed)
    expect(spec.version).toBe(5)
    expect(spec.grid.surface.every((s) => s === SURFACE_AUTO)).toBe(true)
    expect(spec.objects).toEqual([])
  })

  it('preserves a v5 payload’s painted surface (grass survives its own round-trip)', () => {
    const parsed = {
      version: 5,
      worldSize: 24,
      seaLevel: 0,
      tierHeights: DEFAULT_TIER_HEIGHTS.slice(),
      grid: paintedGrid(),
      objects: [],
    }
    const spec = validateSpecObject(parsed)
    expect(spec.version).toBe(5)
    expect(spec.grid.surface[0]).toBe(SURFACE_GRASS)
    expect(spec.grid.surface[10]).toBe(SURFACE_GRASS)
  })
})

describe('tierHeights migration', () => {
  // Minimal valid v4 spec object, following the file's own convention for
  // hand-built specs (see applyOps.test.ts): an ocean grid, no objects.
  function minimalV4Spec(tierHeights: number[]) {
    return {
      version: 4,
      worldSize: 24,
      seaLevel: 0,
      tierHeights,
      grid: createOceanGrid(),
      objects: [],
    }
  }

  it('migrates a spec carrying exactly the legacy default tier heights to the current defaults', () => {
    const spec = validateSpecObject(minimalV4Spec(LEGACY_DEFAULT_TIER_HEIGHTS.slice()))
    expect(spec.tierHeights).toEqual(DEFAULT_TIER_HEIGHTS)
  })

  it('preserves custom-authored tier heights untouched', () => {
    const custom = [-1, 0.3, 0.9, 1.4, 2]
    const spec = validateSpecObject(minimalV4Spec(custom))
    expect(spec.tierHeights).toEqual(custom)
  })

  it('does not migrate a near-miss array that only resembles the legacy defaults', () => {
    const nearMiss = [-1.2, 0.12, 1.0, 1.65, 2.31] // last entry differs from LEGACY_DEFAULT_TIER_HEIGHTS
    const spec = validateSpecObject(minimalV4Spec(nearMiss))
    expect(spec.tierHeights).toEqual(nearMiss)
  })
})
