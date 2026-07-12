import { describe, expect, it } from 'vitest'
import { BLADES_PER_CELL, grassBlades } from '../src/terrain/grassField'
import {
  cellCenter,
  cellIndex,
  createOceanGrid,
  DEFAULT_TIER_HEIGHTS,
  evaluateHeight,
  type IslandSpec,
  SURFACE_GRASS,
} from '../src/terrain/terrainGrid'

const WORLD = 24

function specFrom(grid: IslandSpec['grid']): IslandSpec {
  return { version: 5, worldSize: WORLD, seaLevel: 0, tierHeights: DEFAULT_TIER_HEIGHTS, grid, objects: [] }
}

describe('grassField — grassBlades', () => {
  it('emits nothing for an unpainted (all-auto) grid', () => {
    expect(grassBlades(specFrom(createOceanGrid()))).toEqual([])
  })

  it('scatters exactly BLADES_PER_CELL blades near an interior painted land cell', () => {
    const grid = createOceanGrid()
    const c = 32
    const r = 32
    // Raise the whole 3×3 neighborhood to tier 2 so the blurred terrain stays
    // above sea level across the painted cell's full scatter radius — an
    // ISOLATED raised cell's edges blur down toward the surrounding ocean and
    // would water-clip its outer blades (that clipping is the shore contract,
    // tested below; here we want the no-clipping count).
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        grid.tiers[cellIndex(grid, c + dc, r + dr)] = 2
      }
    }
    grid.surface[cellIndex(grid, c, r)] = SURFACE_GRASS
    const spec = specFrom(grid)
    const blades = grassBlades(spec)
    expect(blades).toHaveLength(BLADES_PER_CELL)

    // Every blade stays within the ±0.575-cell scatter of the cell center.
    const cellSize = WORLD / grid.cols
    const center = cellCenter(WORLD, grid, c, r)
    for (const b of blades) {
      expect(Math.abs(b.x - center.x)).toBeLessThanOrEqual(0.575 * cellSize)
      expect(Math.abs(b.z - center.z)).toBeLessThanOrEqual(0.575 * cellSize)
    }
  })

  it('clips blades that spill onto a terrace wall', () => {
    const grid = createOceanGrid()
    const c = 32
    const r = 32
    // 3×3 tier-2 neighborhood EXCEPT the entire c+1 column, which stays a
    // tier LOWER (1, still land) — the painted center cell now borders a
    // terrace wall, so scatter spilling east lands on the cliff face (above
    // sea level, so the sea clip alone would keep it) and must be clipped.
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        grid.tiers[cellIndex(grid, c + dc, r + dr)] = dc === 1 ? 1 : 2
      }
    }
    grid.surface[cellIndex(grid, c, r)] = SURFACE_GRASS
    const spec = specFrom(grid)
    const blades = grassBlades(spec)

    // Some blades survive, some spilled ones got cliff-clipped.
    expect(blades.length).toBeGreaterThan(0)
    expect(blades.length).toBeLessThan(BLADES_PER_CELL)

    // Every survivor stands on the painted cell's own plateau.
    const center = cellCenter(WORLD, grid, c, r)
    const yCell = evaluateHeight(spec, center.x, center.z)
    for (const b of blades) {
      expect(Math.abs(b.y - yCell)).toBeLessThanOrEqual(0.05)
    }
  })

  it('emits nothing for a grass-painted WATER cell', () => {
    const grid = createOceanGrid()
    grid.surface[cellIndex(grid, 10, 10)] = SURFACE_GRASS
    // tiers[10,10] stays 0 (ocean floor, below sea level)
    expect(grassBlades(specFrom(grid))).toHaveLength(0)
  })

  it('is deterministic: two calls on the same spec produce identical output', () => {
    const grid = createOceanGrid()
    for (const [c, r] of [
      [10, 10],
      [20, 30],
      [40, 15],
    ] as const) {
      grid.tiers[cellIndex(grid, c, r)] = 2
      grid.surface[cellIndex(grid, c, r)] = SURFACE_GRASS
    }
    const spec = specFrom(grid)
    expect(grassBlades(spec)).toEqual(grassBlades(spec))
  })

  it("every blade's y is the terrain height at the blade's own x/z, above sea level", () => {
    const grid = createOceanGrid()
    // 3×3 raised neighborhood (see above): an ISOLATED raised cell is a spike,
    // not a plateau — its blurred height falls off inside the cell, so the
    // plan-021 cliff clip would (correctly) reject every blade.
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        grid.tiers[cellIndex(grid, 32 + dc, 32 + dr)] = 3
      }
    }
    grid.surface[cellIndex(grid, 32, 32)] = SURFACE_GRASS
    const spec = specFrom(grid)
    const blades = grassBlades(spec)
    expect(blades.length).toBeGreaterThan(0)
    for (const b of blades.slice(0, 5)) {
      expect(b.y).toBeCloseTo(evaluateHeight(spec, b.x, b.z), 10)
    }
    for (const b of blades) {
      expect(b.y).toBeGreaterThan(spec.seaLevel)
    }
  })

  it('yaw/height/shade/phase stay within their documented ranges across many cells', () => {
    const grid = createOceanGrid()
    for (let r = 0; r < grid.rows; r += 5) {
      for (let c = 0; c < grid.cols; c += 5) {
        grid.tiers[cellIndex(grid, c, r)] = 2
        grid.surface[cellIndex(grid, c, r)] = SURFACE_GRASS
      }
    }
    const blades = grassBlades(specFrom(grid))
    expect(blades.length).toBeGreaterThan(0)
    for (const b of blades) {
      expect(b.yaw).toBeGreaterThanOrEqual(0)
      expect(b.yaw).toBeLessThan(Math.PI * 2)
      expect(b.height).toBeGreaterThanOrEqual(0.1)
      expect(b.height).toBeLessThan(0.24)
      expect(b.shade).toBeGreaterThanOrEqual(0)
      expect(b.shade).toBeLessThan(1)
      expect(b.phase).toBeGreaterThanOrEqual(0)
      expect(b.phase).toBeLessThan(Math.PI * 2)
    }
  })

  it('respects a custom perCell density', () => {
    const grid = createOceanGrid()
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        grid.tiers[cellIndex(grid, 32 + dc, 32 + dr)] = 2 // no water clipping (see above)
      }
    }
    grid.surface[cellIndex(grid, 32, 32)] = SURFACE_GRASS
    expect(grassBlades(specFrom(grid), 3)).toHaveLength(3)
  })
})
