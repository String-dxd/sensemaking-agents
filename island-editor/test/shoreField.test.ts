import { describe, expect, it } from 'vitest'
import { shoreDistanceField } from '../src/terrain/shoreField'
import { createOceanGrid, GRID_COLS } from '../src/terrain/terrainGrid'

const WORLD = 24

// Nearest lattice index to a world coordinate (lattice points sit at cell-center
// offsets, matching shoreField's sampling).
function latticeAt(res: number, worldSize: number, x: number, z: number): number {
  const step = worldSize / res
  const half = worldSize / 2
  const i = Math.round((x + half) / step - 0.5)
  const j = Math.round((z + half) / step - 0.5)
  return j * res + i
}

describe('shoreDistanceField', () => {
  it('lattice resolution is scale × the grid resolution', () => {
    const grid = createOceanGrid()
    expect(shoreDistanceField(grid, WORLD, 2).res).toBe(GRID_COLS * 2)
    expect(shoreDistanceField(grid, WORLD, 3).res).toBe(GRID_COLS * 3)
  })

  it('a single land cell in ocean is negative at its center, positive around it, increasing outward', () => {
    const grid = createOceanGrid()
    grid.tiers[32 * GRID_COLS + 32] = 4 // one tall land cell
    const f = shoreDistanceField(grid, WORLD, 2)
    const step = WORLD / f.res
    // cell (32,32) center in world coords
    const cx = -WORLD / 2 + (32 + 0.5) * (WORLD / GRID_COLS)
    const center = f.data[latticeAt(f.res, WORLD, cx, cx)]
    expect(center).toBeLessThan(0) // land

    const ring1 = f.data[latticeAt(f.res, WORLD, cx + 2 * step, cx)]
    const ring2 = f.data[latticeAt(f.res, WORLD, cx + 3 * step, cx)]
    expect(ring1).toBeGreaterThan(0) // water beyond the shore
    expect(ring2).toBeGreaterThan(ring1) // increasing outward
    // Roughly one lattice step per ring. Not exact: the isoline smoothing pass
    // flattens the ramp near a lone cell's conical tip (straight shores keep
    // their exact gradient — a box average of a linear ramp is the same ramp).
    expect(ring2 - ring1).toBeGreaterThan(step * 0.5)
    expect(ring2 - ring1).toBeLessThan(step * 1.5)
  })

  it('an all-ocean grid is uniformly large positive', () => {
    const f = shoreDistanceField(createOceanGrid(), WORLD, 2)
    expect(f.data.every((v) => v > 0)).toBe(true)
    expect(f.data[0]).toBeGreaterThanOrEqual(WORLD)
  })

  it('a carved pond inside land is positive (water) at the pond center', () => {
    // A single carved cell is filled by the blur-mix (the symmetric cost of the
    // design's thin-feature preservation), so use a 3×3 pond, which reliably
    // carves below the land mask.
    const grid = createOceanGrid()
    grid.tiers.fill(3)
    for (let r = 31; r <= 33; r++) {
      for (let c = 31; c <= 33; c++) grid.tiers[r * GRID_COLS + c] = 0
    }
    const f = shoreDistanceField(grid, WORLD, 2)
    const cx = -WORLD / 2 + (32 + 0.5) * (WORLD / GRID_COLS)
    expect(f.data[latticeAt(f.res, WORLD, cx, cx)]).toBeGreaterThan(0)
  })

  it('the sign flips exactly at the boundary (no zero-valued lattice points)', () => {
    const grid = createOceanGrid()
    for (let r = 20; r < 44; r++) {
      for (let c = 20; c < 44; c++) grid.tiers[r * GRID_COLS + c] = 3
    }
    const f = shoreDistanceField(grid, WORLD, 2)
    let flips = 0
    for (let idx = 0; idx < f.data.length - 1; idx++) {
      if (idx % f.res === f.res - 1) continue // skip row wrap
      expect(f.data[idx]).not.toBe(0)
      if (Math.sign(f.data[idx]) !== Math.sign(f.data[idx + 1])) flips++
    }
    expect(flips).toBeGreaterThan(0)
  })
})
