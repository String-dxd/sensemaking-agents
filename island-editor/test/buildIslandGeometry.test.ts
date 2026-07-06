import { describe, expect, it } from 'vitest'
import { buildIslandField, composeGeometry, SEGMENTS, updateGeometry } from '../src/terrain/buildIslandGeometry'
import { seedIsland } from '../src/terrain/seed'
import {
  cellCenter,
  createOceanGrid,
  DEFAULT_TIER_HEIGHTS,
  GRID_COLS,
  type IslandSpec,
  MAX_TIER,
} from '../src/terrain/terrainGrid'

const WORLD = 24

function specFrom(grid: IslandSpec['grid']): IslandSpec {
  return { version: 4, worldSize: WORLD, seaLevel: 0, tierHeights: DEFAULT_TIER_HEIGHTS, grid, objects: [] }
}

describe('buildIslandGeometry', () => {
  const field = buildIslandField(WORLD)
  const seed = seedIsland()
  const seedGeo = composeGeometry(field, seed)

  it('builds the (segments+1)² lattice with standard triangulation', () => {
    expect(field.segments).toBe(SEGMENTS)
    expect(field.n).toBe(SEGMENTS + 1)
    expect(seedGeo.getAttribute('position').count).toBe((SEGMENTS + 1) ** 2)
    expect(field.indices.length).toBe(SEGMENTS * SEGMENTS * 6)
  })

  it('exposes aTierFlat / aWallness / aSurface with itemSize 1', () => {
    for (const name of ['aTierFlat', 'aWallness', 'aSurface']) {
      const attr = seedGeo.getAttribute(name)
      expect(attr).toBeDefined()
      expect(attr.itemSize).toBe(1)
      expect(attr.count).toBe((SEGMENTS + 1) ** 2)
    }
  })

  it('seed heights stay within [tierHeights[0], tierHeights[MAX_TIER]]', () => {
    const pos = seedGeo.getAttribute('position')
    let min = Infinity
    let max = -Infinity
    for (let v = 0; v < pos.count; v++) {
      min = Math.min(min, pos.getY(v))
      max = Math.max(max, pos.getY(v))
    }
    expect(min).toBeCloseTo(DEFAULT_TIER_HEIGHTS[0], 3)
    expect(max).toBeLessThanOrEqual(DEFAULT_TIER_HEIGHTS[MAX_TIER] + 1e-4)
  })

  it('an interior grass cell center sits within 0.01 of its tier top with aWallness ≈ 0', () => {
    // Seed cell (31, 23) is tier 2 with a uniform 5×5 neighborhood (probed).
    const c = 31
    const r = 23
    const tier = seed.grid.tiers[r * GRID_COLS + c]
    expect(tier).toBeGreaterThanOrEqual(2)
    const { x, z } = cellCenter(WORLD, seed.grid, c, r)
    const pos = seedGeo.getAttribute('position')
    const wall = seedGeo.getAttribute('aWallness')
    let found = false
    for (let v = 0; v < pos.count; v++) {
      if (Math.abs(pos.getX(v) - x) < 1e-4 && Math.abs(pos.getZ(v) - z) < 1e-4) {
        found = true
        expect(Math.abs(pos.getY(v) - DEFAULT_TIER_HEIGHTS[tier])).toBeLessThan(0.01)
        expect(wall.getX(v)).toBeLessThan(0.01)
      }
    }
    expect(found).toBe(true) // SEGMENTS = 2× grid → cell centers are lattice vertices
  })

  it('aWallness exceeds 0.5 between an isolated tier-2 cell and its tier-0 neighbor', () => {
    const grid = createOceanGrid()
    grid.tiers[32 * GRID_COLS + 32] = 2
    const geo = composeGeometry(field, specFrom(grid))
    const pos = geo.getAttribute('position')
    const wall = geo.getAttribute('aWallness')
    const a = cellCenter(WORLD, grid, 32, 32)
    const b = cellCenter(WORLD, grid, 33, 32)
    let best = 0
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v)
      const z = pos.getZ(v)
      if (x >= a.x - 1e-6 && x <= b.x + 1e-6 && Math.abs(z - a.z) <= 0.2) {
        best = Math.max(best, wall.getX(v))
      }
    }
    expect(best).toBeGreaterThan(0.5)
  })

  it('aSurface carries the containing cell surface code', () => {
    const grid = createOceanGrid()
    grid.surface[10 * GRID_COLS + 10] = 1
    const geo = composeGeometry(field, specFrom(grid))
    const pos = geo.getAttribute('position')
    const surf = geo.getAttribute('aSurface')
    const { x, z } = cellCenter(WORLD, grid, 10, 10)
    let painted = 0
    for (let v = 0; v < pos.count; v++) {
      if (surf.getX(v) === 1) {
        painted++
        // every painted vertex lies in/on the painted cell
        expect(Math.abs(pos.getX(v) - x)).toBeLessThanOrEqual(WORLD / GRID_COLS / 2 + 1e-6)
        expect(Math.abs(pos.getZ(v) - z)).toBeLessThanOrEqual(WORLD / GRID_COLS / 2 + 1e-6)
      }
    }
    expect(painted).toBeGreaterThan(0)
  })

  it('updateGeometry refreshes an existing geometry in place', () => {
    const grid = createOceanGrid()
    const spec = specFrom(grid)
    const geo = composeGeometry(field, spec)
    const before = geo.getAttribute('position').getY(0)
    grid.tiers.fill(2)
    updateGeometry(geo, field, spec)
    const pos = geo.getAttribute('position')
    // an interior vertex now sits at tier 2
    const mid = Math.floor(pos.count / 2)
    expect(pos.getY(mid)).toBeCloseTo(DEFAULT_TIER_HEIGHTS[2], 2)
    expect(pos.getY(0)).not.toBe(before) // corner rose too (edge blur pulls it slightly down)
  })
})
