import { describe, expect, it } from 'vitest'
import { deserializeSpec, serializeSpec, validateSpecObject } from '../src/editor/specIO'
import { seedIsland } from '../src/terrain/seed'
import { DEFAULT_TIER_HEIGHTS, GRID_COLS, GRID_ROWS } from '../src/terrain/terrainGrid'

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
  it('round-trips a v3 spec through serialize/deserialize', () => {
    const spec = seedIsland()
    const back = deserializeSpec(serializeSpec(spec))
    expect(back.version).toBe(3)
    expect(back.worldSize).toBe(spec.worldSize)
    expect(back.seaLevel).toBe(spec.seaLevel)
    expect(back.tierHeights).toEqual(spec.tierHeights)
    expect(back.grid).toEqual(spec.grid)
  })

  it('serializes the grid as digit-string rows', () => {
    const json = JSON.parse(serializeSpec(seedIsland()))
    expect(json.version).toBe(3)
    expect(json.grid.tiers).toHaveLength(GRID_ROWS)
    expect(typeof json.grid.tiers[0]).toBe('string')
    expect(json.grid.tiers[0]).toHaveLength(GRID_COLS)
  })

  it('validates a v2 spec and returns it migrated to v3 with a 64×64 grid', () => {
    const spec = validateSpecObject(v2Spec())
    expect(spec.version).toBe(3)
    expect(spec.worldSize).toBe(24)
    expect(spec.seaLevel).toBe(0.25) // taken from v2 heightProfile.seaLevel
    expect(spec.tierHeights).toEqual(DEFAULT_TIER_HEIGHTS)
    expect(spec.grid.cols).toBe(GRID_COLS)
    expect(spec.grid.rows).toBe(GRID_ROWS)
    // migration produced actual land
    expect(spec.grid.tiers.some((t) => t >= 2)).toBe(true)
  })

  it('throws on an unsupported version', () => {
    expect(() => validateSpecObject({ ...v2Spec(), version: 4 })).toThrow(/version must be/)
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
