import { describe, expect, it } from 'vitest'
import {
  baseHeightAt,
  distanceToPolygon,
  evaluateHeight,
  isInside,
  isInsidePolygon,
  seedFromCurrentIsland,
} from '../src/terrain/islandSpec'

describe('island spec — pure terrain core', () => {
  const spec = seedFromCurrentIsland()

  it('seeds a closed coastline of control points', () => {
    expect(spec.coastline.length).toBe(24)
  })

  it('classifies inside vs outside', () => {
    expect(isInside(spec, 0, 0)).toBe(true)
    expect(isInside(spec, 100, 100)).toBe(false)
  })

  it('center rises to ~plateau, far offshore sinks to/below sea level', () => {
    const center = evaluateHeight(spec, 0, 0)
    expect(center).toBeGreaterThan(spec.heightProfile.seaLevel)
    expect(center).toBeCloseTo(spec.heightProfile.plateauHeight, 1)
    expect(evaluateHeight(spec, 100, 100)).toBeLessThanOrEqual(spec.heightProfile.seaLevel)
  })

  it('base height runs seaLevel at the coast → plateau one falloff inland', () => {
    const p = spec.heightProfile
    expect(baseHeightAt(p, true, 0)).toBeCloseTo(p.seaLevel, 5)
    expect(baseHeightAt(p, true, p.coastFalloff)).toBeCloseTo(p.plateauHeight, 5)
  })

  it('point-in-polygon + distance agree on a unit square', () => {
    const sq = [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
    ]
    expect(isInsidePolygon(sq, 0, 0)).toBe(true)
    expect(isInsidePolygon(sq, 2, 0)).toBe(false)
    expect(distanceToPolygon(sq, 0, 0)).toBeCloseTo(1, 5)
  })
})
