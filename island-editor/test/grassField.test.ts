import { describe, expect, it } from 'vitest'
import { grassInstanceTransforms } from '../src/terrain/grassField'
import {
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

describe('grassField — grassInstanceTransforms', () => {
  it('emits nothing for an unpainted (all-auto) grid', () => {
    expect(grassInstanceTransforms(specFrom(createOceanGrid()))).toEqual([])
  })

  it('emits a transform only for grass-painted LAND cells, not a painted water cell', () => {
    const grid = createOceanGrid()
    const land = cellIndex(grid, 32, 32)
    const water = cellIndex(grid, 10, 10)
    grid.tiers[land] = 2 // above sea level (land)
    // grid.tiers[water] stays 0 (ocean floor, below sea level)
    grid.surface[land] = SURFACE_GRASS
    grid.surface[water] = SURFACE_GRASS
    const spec = specFrom(grid)
    const transforms = grassInstanceTransforms(spec)
    expect(transforms).toHaveLength(1)
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
    expect(grassInstanceTransforms(spec)).toEqual(grassInstanceTransforms(spec))
  })

  it('y matches evaluateHeight at the cell center', () => {
    const grid = createOceanGrid()
    grid.tiers[cellIndex(grid, 32, 32)] = 3
    grid.surface[cellIndex(grid, 32, 32)] = SURFACE_GRASS
    const spec = specFrom(grid)
    const [t] = grassInstanceTransforms(spec)
    expect(t).toBeDefined()
    expect(t.y).toBeCloseTo(evaluateHeight(spec, t.x, t.z), 10)
  })

  it('yaw is in [0, 2π) and scale is in [0.95, 1.35] across many painted cells', () => {
    const grid = createOceanGrid()
    for (let r = 0; r < grid.rows; r += 3) {
      for (let c = 0; c < grid.cols; c += 3) {
        grid.tiers[cellIndex(grid, c, r)] = 2
        grid.surface[cellIndex(grid, c, r)] = SURFACE_GRASS
      }
    }
    const spec = specFrom(grid)
    const transforms = grassInstanceTransforms(spec)
    expect(transforms.length).toBeGreaterThan(0)
    for (const t of transforms) {
      expect(t.yaw).toBeGreaterThanOrEqual(0)
      expect(t.yaw).toBeLessThan(Math.PI * 2)
      expect(t.scale).toBeGreaterThanOrEqual(0.95)
      expect(t.scale).toBeLessThan(1.35)
    }
  })
})
