import { describe, expect, it } from 'vitest'
import { seedIsland } from '../src/terrain/seed'
import { cellIndex, GRID_COLS, GRID_ROWS, MAX_TIER } from '../src/terrain/terrainGrid'

describe('seedIsland', () => {
  const spec = seedIsland()
  const { grid } = spec

  it('is a 64×64 v3 spec', () => {
    expect(spec.version).toBe(3)
    expect(grid.cols).toBe(GRID_COLS)
    expect(grid.rows).toBe(GRID_ROWS)
    expect(grid.tiers).toHaveLength(GRID_COLS * GRID_ROWS)
    expect(grid.surface).toHaveLength(GRID_COLS * GRID_ROWS)
  })

  it('has land at the center (tier ≥ 2)', () => {
    expect(grid.tiers[cellIndex(grid, 32, 32)]).toBeGreaterThanOrEqual(2)
  })

  it('has ocean at all four corners (tier 0)', () => {
    expect(grid.tiers[cellIndex(grid, 0, 0)]).toBe(0)
    expect(grid.tiers[cellIndex(grid, GRID_COLS - 1, 0)]).toBe(0)
    expect(grid.tiers[cellIndex(grid, 0, GRID_ROWS - 1)]).toBe(0)
    expect(grid.tiers[cellIndex(grid, GRID_COLS - 1, GRID_ROWS - 1)]).toBe(0)
  })

  it('has a beach ring (at least one tier-1 cell)', () => {
    expect(grid.tiers.some((t) => t === 1)).toBe(true)
  })

  it('every tier is an integer in 0..MAX_TIER', () => {
    for (const t of grid.tiers) {
      expect(Number.isInteger(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(MAX_TIER)
    }
  })
})
