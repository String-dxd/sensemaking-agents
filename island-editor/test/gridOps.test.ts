import { describe, expect, it } from 'vitest'
import {
  adjustTier,
  adjustTierToward,
  brushCells,
  fillRect,
  isLandTier,
  setSurface,
  setTier,
} from '../src/terrain/gridOps'
import { cellIndex, createOceanGrid, DEFAULT_TIER_HEIGHTS, MAX_TIER, SURFACE_GRASS } from '../src/terrain/terrainGrid'

describe('gridOps', () => {
  it('adjustTier raises and clamps at MAX_TIER', () => {
    const grid = createOceanGrid()
    const cells = [cellIndex(grid, 10, 10)]
    for (let n = 0; n < 10; n++) adjustTier(grid, cells, +1)
    expect(grid.tiers[cells[0]]).toBe(MAX_TIER)
  })

  it('adjustTier lowers and clamps at 0', () => {
    const grid = createOceanGrid()
    const cells = [cellIndex(grid, 10, 10)]
    setTier(grid, cells, 2)
    for (let n = 0; n < 10; n++) adjustTier(grid, cells, -1)
    expect(grid.tiers[cells[0]]).toBe(0)
  })

  it('adjustTierToward raise moves a cell one step toward the target, never past it', () => {
    const grid = createOceanGrid()
    const below = cellIndex(grid, 10, 10)
    const atTarget = cellIndex(grid, 11, 10)
    const above = cellIndex(grid, 12, 10)
    const atZero = cellIndex(grid, 13, 10)
    setTier(grid, [below], 2)
    setTier(grid, [atTarget], 3)
    setTier(grid, [above], 4)
    setTier(grid, [atZero], 0)
    adjustTierToward(grid, [below, atTarget, above, atZero], +1, 3)
    expect(grid.tiers[below]).toBe(3) // 2 -> 3 (toward target)
    expect(grid.tiers[atTarget]).toBe(3) // already at target, unchanged
    expect(grid.tiers[above]).toBe(4) // above target, not lowered
    expect(grid.tiers[atZero]).toBe(1) // one step toward target, not jumped to 3
  })

  it('adjustTierToward lower moves a cell one step toward the target, never past it', () => {
    const grid = createOceanGrid()
    const above = cellIndex(grid, 10, 10)
    const atTarget = cellIndex(grid, 11, 10)
    const below = cellIndex(grid, 12, 10)
    setTier(grid, [above], 3)
    setTier(grid, [atTarget], 1)
    setTier(grid, [below], 0)
    adjustTierToward(grid, [above, atTarget, below], -1, 1)
    expect(grid.tiers[above]).toBe(2) // 3 -> 2 (toward target)
    expect(grid.tiers[atTarget]).toBe(1) // already at target, unchanged
    expect(grid.tiers[below]).toBe(0) // below target, not raised
  })

  it('adjustTierToward stays within 0..MAX_TIER when stepping toward the target', () => {
    const grid = createOceanGrid()
    const cell = cellIndex(grid, 10, 10)
    setTier(grid, [cell], MAX_TIER - 1)
    adjustTierToward(grid, [cell], +1, MAX_TIER)
    expect(grid.tiers[cell]).toBe(MAX_TIER)
    adjustTierToward(grid, [cell], +1, MAX_TIER)
    expect(grid.tiers[cell]).toBe(MAX_TIER) // already at target/MAX_TIER, unchanged
  })

  it('brushCells clips at grid edges', () => {
    const grid = createOceanGrid()
    // size-3 block centered at the corner (0,0) → only the 4 in-bounds cells
    const corner = brushCells(grid, 0, 0, 3)
    expect(corner.sort((a, b) => a - b)).toEqual(
      [cellIndex(grid, 0, 0), cellIndex(grid, 1, 0), cellIndex(grid, 0, 1), cellIndex(grid, 1, 1)].sort(
        (a, b) => a - b,
      ),
    )
    // size-1 is exactly one cell; a centered size-3 block is 9 cells
    expect(brushCells(grid, 32, 32, 1)).toHaveLength(1)
    expect(brushCells(grid, 32, 32, 3)).toHaveLength(9)
  })

  it('setSurface touches only the listed cells', () => {
    const grid = createOceanGrid()
    const target = cellIndex(grid, 20, 20)
    setSurface(grid, [target], SURFACE_GRASS)
    expect(grid.surface[target]).toBe(SURFACE_GRASS)
    expect(grid.surface.filter((s) => s === SURFACE_GRASS)).toHaveLength(1)
  })

  it('setTier clamps out-of-range values', () => {
    const grid = createOceanGrid()
    const cells = [cellIndex(grid, 5, 5)]
    setTier(grid, cells, 99)
    expect(grid.tiers[cells[0]]).toBe(MAX_TIER)
    setTier(grid, cells, -5)
    expect(grid.tiers[cells[0]]).toBe(0)
  })

  it('fillRect covers the inclusive rectangle exactly', () => {
    const grid = createOceanGrid()
    let count = 0
    fillRect(grid, 2, 3, 4, 6, (i) => {
      grid.tiers[i] = 1
      count++
    })
    // inclusive [2..4] × [3..6] = 3 × 4 = 12 cells
    expect(count).toBe(12)
    expect(grid.tiers.filter((t) => t === 1)).toHaveLength(12)
    expect(grid.tiers[cellIndex(grid, 2, 3)]).toBe(1)
    expect(grid.tiers[cellIndex(grid, 4, 6)]).toBe(1)
    expect(grid.tiers[cellIndex(grid, 5, 6)]).toBe(0) // just outside
  })

  it('fillRect accepts reversed corner order', () => {
    const grid = createOceanGrid()
    let count = 0
    fillRect(grid, 4, 6, 2, 3, () => count++)
    expect(count).toBe(12)
  })

  it('isLandTier: tier 0 with default heights and seaLevel 0 is water', () => {
    expect(isLandTier(0, DEFAULT_TIER_HEIGHTS, 0)).toBe(false) // ocean floor, -1.2
  })

  it('isLandTier: tiers 1..4 with default heights and seaLevel 0 are land', () => {
    expect(isLandTier(1, DEFAULT_TIER_HEIGHTS, 0)).toBe(true) // 0.05 > 0
    expect(isLandTier(2, DEFAULT_TIER_HEIGHTS, 0)).toBe(true)
    expect(isLandTier(3, DEFAULT_TIER_HEIGHTS, 0)).toBe(true)
    expect(isLandTier(4, DEFAULT_TIER_HEIGHTS, 0)).toBe(true)
  })

  it('isLandTier respects a custom seaLevel', () => {
    expect(isLandTier(1, DEFAULT_TIER_HEIGHTS, 0.5)).toBe(false) // 0.05 <= 0.5
    expect(isLandTier(2, DEFAULT_TIER_HEIGHTS, 0.5)).toBe(true) // 1.0 > 0.5
  })

  it('isLandTier treats a tier top exactly at sea level as water (strictly above)', () => {
    expect(isLandTier(0, [0], 0)).toBe(false)
  })

  it('isLandTier treats an out-of-range tier as water', () => {
    expect(isLandTier(99, DEFAULT_TIER_HEIGHTS, 0)).toBe(false)
  })
})
