import { describe, expect, it } from 'vitest'
import { adjustTier, brushCells, fillRect, setSurface, setTier } from '../src/terrain/gridOps'
import { cellIndex, createOceanGrid, MAX_TIER, SURFACE_PATH } from '../src/terrain/terrainGrid'

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
    setSurface(grid, [target], SURFACE_PATH)
    expect(grid.surface[target]).toBe(SURFACE_PATH)
    expect(grid.surface.filter((s) => s === SURFACE_PATH)).toHaveLength(1)
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
})
