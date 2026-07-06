import { describe, expect, it } from 'vitest'
import {
  blurTiers,
  cellCenter,
  cellLine,
  createOceanGrid,
  DEFAULT_TIER_HEIGHTS,
  evaluateHeight,
  GRID_COLS,
  GRID_ROWS,
  type IslandSpec,
  MAX_TIER,
  terraceHeight,
  type TerrainGrid,
  worldToCell,
} from '../src/terrain/terrainGrid'

const WORLD = 24

function specFrom(grid: TerrainGrid): IslandSpec {
  return { version: 3, worldSize: WORLD, seaLevel: 0, tierHeights: DEFAULT_TIER_HEIGHTS, grid }
}

function uniformGrid(tier: number): TerrainGrid {
  const grid = createOceanGrid()
  grid.tiers.fill(tier)
  return grid
}

describe('terrainGrid — terrace evaluation', () => {
  it('a flat uniform grid evaluates to exactly its tier top at an interior cell center', () => {
    for (const tier of [1, 2, 3]) {
      const spec = specFrom(uniformGrid(tier))
      const { x, z } = cellCenter(WORLD, spec.grid, 32, 32)
      expect(evaluateHeight(spec, x, z)).toBeCloseTo(DEFAULT_TIER_HEIGHTS[tier], 10)
    }
  })

  it('an isolated tier-2 cell keeps its height (within 0.1) at its center, ocean far away, monotonic wall between', () => {
    const grid = createOceanGrid()
    grid.tiers[32 * GRID_COLS + 32] = 2
    const spec = specFrom(grid)
    const blurred = blurTiers(grid)

    const center = cellCenter(WORLD, grid, 32, 32)
    const atCenter = evaluateHeight(spec, center.x, center.z, blurred)
    // thin-feature regression guard: must not collapse below sea level
    expect(Math.abs(atCenter - DEFAULT_TIER_HEIGHTS[2])).toBeLessThan(0.1)

    // far away → ocean floor
    const far = cellCenter(WORLD, grid, 5, 5)
    expect(evaluateHeight(spec, far.x, far.z, blurred)).toBeCloseTo(DEFAULT_TIER_HEIGHTS[0], 6)

    // walk along +x from the cell center outward: heights are (weakly) monotonic down
    let prev = atCenter
    for (let step = 1; step <= 6; step++) {
      const h = evaluateHeight(spec, center.x + step * 0.2, center.z, blurred)
      expect(h).toBeLessThanOrEqual(prev + 1e-9)
      prev = h
    }
    expect(prev).toBeLessThan(atCenter)
  })

  it('terraceHeight at an integer tier returns exactly that tier top', () => {
    for (let t = 0; t <= MAX_TIER; t++) {
      expect(terraceHeight(t, DEFAULT_TIER_HEIGHTS)).toBeCloseTo(DEFAULT_TIER_HEIGHTS[t], 10)
    }
  })

  it('blur treats out-of-bounds as ocean: a corner is lower than the interior on a uniform grid', () => {
    const grid = uniformGrid(1)
    const blurred = blurTiers(grid)
    const corner = blurred[0]
    const interior = blurred[32 * GRID_COLS + 32]
    expect(interior).toBeCloseTo(1, 6)
    expect(corner).toBeLessThan(interior)
  })

  it('worldToCell and cellCenter round-trip', () => {
    const grid = createOceanGrid()
    for (const [c, r] of [
      [0, 0],
      [32, 17],
      [63, 63],
      [10, 50],
    ] as const) {
      const { x, z } = cellCenter(WORLD, grid, c, r)
      const back = worldToCell(WORLD, grid, x, z)
      expect(back).toEqual({ c, r })
    }
  })

  it('createOceanGrid is all ocean with matching dimensions', () => {
    const grid = createOceanGrid()
    expect(grid.cols).toBe(GRID_COLS)
    expect(grid.rows).toBe(GRID_ROWS)
    expect(grid.tiers).toHaveLength(GRID_COLS * GRID_ROWS)
    expect(grid.tiers.every((t) => t === 0)).toBe(true)
    expect(grid.surface.every((s) => s === 0)).toBe(true)
  })

  it('cellLine returns a single cell when start == end', () => {
    expect(cellLine(5, 7, 5, 7)).toEqual([{ c: 5, r: 7 }])
  })

  it('cellLine walks a horizontal run inclusively', () => {
    expect(cellLine(2, 4, 5, 4)).toEqual([
      { c: 2, r: 4 },
      { c: 3, r: 4 },
      { c: 4, r: 4 },
      { c: 5, r: 4 },
    ])
  })

  it('cellLine is 8-connected and contiguous (no gaps) on a diagonal-ish run', () => {
    const pts = cellLine(0, 0, 10, 4)
    // endpoints correct
    expect(pts[0]).toEqual({ c: 0, r: 0 })
    expect(pts[pts.length - 1]).toEqual({ c: 10, r: 4 })
    // every step moves at most one cell in each axis (no skipped cells)
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i].c - pts[i - 1].c)).toBeLessThanOrEqual(1)
      expect(Math.abs(pts[i].r - pts[i - 1].r)).toBeLessThanOrEqual(1)
      expect(pts[i]).not.toEqual(pts[i - 1]) // strictly advances
    }
  })

  it('cellLine handles negative/descending directions', () => {
    const pts = cellLine(8, 8, 3, 2)
    expect(pts[0]).toEqual({ c: 8, r: 8 })
    expect(pts[pts.length - 1]).toEqual({ c: 3, r: 2 })
  })
})
