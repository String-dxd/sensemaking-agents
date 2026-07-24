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
  return { version: 5, worldSize: WORLD, seaLevel: 0, tierHeights: DEFAULT_TIER_HEIGHTS, grid, objects: [] }
}

function uniformGrid(tier: number): TerrainGrid {
  const grid = createOceanGrid()
  grid.tiers.fill(tier)
  return grid
}

/** Stamp a `size`×`size` block of `tier` centered on cell (32,32), anchored so
 *  (32,32) is always included (half = floor(size/2), matching the plan-032
 *  invariant probe). size=1 stamps only (32,32); size=2 stamps the 2×2 block
 *  with (32,32) at its lower-right corner; size=5 stamps a true 5×5 square
 *  centered on (32,32). */
function stampSquare(tier: number, size: number): TerrainGrid {
  const grid = createOceanGrid()
  const half = Math.floor(size / 2)
  for (let dr = -half; dr <= size - 1 - half; dr++) {
    for (let dc = -half; dc <= size - 1 - half; dc++) {
      grid.tiers[(32 + dr) * GRID_COLS + (32 + dc)] = tier
    }
  }
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

  it('plan 032 feature-preservation floor: a lone cell sinks, a 2×2 block stays visible land, a 5×5 block is a raised bump', () => {
    // At BLUR_PASSES = 4 / BLUR_MIX = 0.85 (plan 032, retuned for the 128×128
    // grid's coastline curves — plan 031), the old "isolated single cell stays
    // a raised bump" floor no longer holds, and that's DELIBERATE: the
    // maintainer's island art direction is "few big smooth scalloped masses" —
    // sub-2×2 detail is intentionally not authorable at this blur strength.
    // The redefined, verified floor:
    //   - a lone tier-2 cell samples ≈0.427 → terraces to ≈−0.943, BELOW sea
    //     level (sinks; asserted as expected, not a regression).
    //   - a 2×2 tier-2 block (≈ the old single 64-grid cell's world footprint,
    //     0.375 units) samples ≈0.712 → terraces to exactly tierHeights[1]
    //     (0.05) — the preserved "stays visible land" floor.
    //   - a 5×5 tier-2 block (~0.94 world units) samples ≈1.769 → terraces to
    //     tierHeights[2] (1.0) — a full raised bump, the new practical minimum
    //     for a plateau-height feature.

    // (a) lone cell — intentionally sinks below sea level.
    {
      const grid = stampSquare(2, 1)
      const spec = specFrom(grid)
      const blurred = blurTiers(grid)
      const center = cellCenter(WORLD, grid, 32, 32)
      const h = evaluateHeight(spec, center.x, center.z, blurred)
      expect(h).toBeLessThan(spec.seaLevel)
      expect(h).toBeCloseTo(-1.0117777846015792, 6) // observed; B-spline kernel (was -0.9429, plan 032)
    }

    // (b) 2×2 block — preserved "visible land" floor.
    {
      const grid = stampSquare(2, 2)
      const spec = specFrom(grid)
      const blurred = blurTiers(grid)
      const center = cellCenter(WORLD, grid, 32, 32)
      const h = evaluateHeight(spec, center.x, center.z, blurred)
      expect(h).toBeGreaterThan(spec.seaLevel) // the floor is "visible land", not the exact beach top
      expect(h).toBeCloseTo(0.048227955350686136, 6) // observed; B-spline kernel (was exactly 0.05, plan 032)
    }

    // (c) 5×5 block — a raised bump, the new practical minimum.
    {
      const grid = stampSquare(2, 5)
      const spec = specFrom(grid)
      const blurred = blurTiers(grid)
      const center = cellCenter(WORLD, grid, 32, 32)
      const h = evaluateHeight(spec, center.x, center.z, blurred)
      expect(h).toBeGreaterThan(DEFAULT_TIER_HEIGHTS[1])
      expect(h).toBeCloseTo(1, 6) // observed; B-spline kernel — still exactly tierHeights[2]
    }
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
