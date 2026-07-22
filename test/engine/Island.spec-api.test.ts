// U2: State/Island.js rewired to the committed spec — grid-native facade.

import { describe, expect, it } from 'vitest'
import Island from '~/engine/student-space/Game/State/Island.js'
import {
  cellCenter,
  cellIndex,
  type IslandSpec,
} from '~/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts'
import golden from './fixtures/islandSpecGolden.json'

const island = new Island()
const spec: IslandSpec = island.spec

/** Find a cell whose full (2k+1)² neighborhood sits at exactly `tier`. */
function findFlatCell(tier: number, k = 1): { c: number; r: number } {
  const { grid } = spec
  for (let r = k; r < grid.rows - k; r++) {
    outer: for (let c = k; c < grid.cols - k; c++) {
      for (let dr = -k; dr <= k; dr++) {
        for (let dc = -k; dc <= k; dc++) {
          if (grid.tiers[cellIndex(grid, c + dc, r + dr)] !== tier) continue outer
        }
      }
      return { c, r }
    }
  }
  throw new Error(
    `no flat tier-${tier} cell with a ${2 * k + 1}² neighborhood in the committed spec`,
  )
}

/** Find two horizontally-adjacent cells with different land tiers (a wall). */
function findWallPair(): { a: { c: number; r: number }; b: { c: number; r: number } } {
  const { grid, tierHeights } = spec
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols - 1; c++) {
      const t0 = grid.tiers[cellIndex(grid, c, r)] ?? 0
      const t1 = grid.tiers[cellIndex(grid, c + 1, r)] ?? 0
      const top0 = tierHeights[t0] ?? -99
      const top1 = tierHeights[t1] ?? -99
      if (t0 !== t1 && top0 > spec.seaLevel && top1 > spec.seaLevel) {
        return { a: { c, r }, b: { c: c + 1, r } }
      }
    }
  }
  throw new Error('no adjacent land tier step (terrace wall) in the committed spec')
}

describe('Island — spec-backed facade', () => {
  it('heightAt matches the golden fixture at every lattice point (cell centers and midpoints)', () => {
    for (const { x, z, h } of golden.heights) {
      expect(island.heightAt(x, z)).toBeCloseTo(h, 10)
    }
  })

  it('exposes seaLevel and worldSize from the spec', () => {
    expect(island.seaLevel).toBe(spec.seaLevel)
    expect(island.worldSize).toBe(spec.worldSize)
    expect(island.worldSize).toBe(24)
  })

  it('out-of-bounds heightAt returns the clamped edge (seafloor) — never NaN', () => {
    for (const [x, z] of [
      [1000, 0],
      [-1000, -1000],
      [0, 55],
      [-13, 13],
    ] as const) {
      const h = island.heightAt(x, z)
      expect(Number.isFinite(h)).toBe(true)
      expect(h).toBeLessThan(spec.seaLevel) // committed island is ocean-ringed
    }
  })

  it('isPlaceable accepts a flat tier-2 interior point', () => {
    const { c, r } = findFlatCell(2)
    const { x, z } = cellCenter(spec.worldSize, spec.grid, c, r)
    expect(island.isPlaceable(x, z)).toBe(true)
    expect(island.isWalkable(x, z)).toBe(true)
  })

  it('isPlaceable rejects a sea cell', () => {
    const { c, r } = findFlatCell(0, 2) // deep ocean
    const { x, z } = cellCenter(spec.worldSize, spec.grid, c, r)
    expect(island.isPlaceable(x, z)).toBe(false)
    expect(island.isWalkable(x, z)).toBe(false)
  })

  it('isPlaceable and isWalkable reject a terrace-wall sample between two tiers', () => {
    const { a, b } = findWallPair()
    const pa = cellCenter(spec.worldSize, spec.grid, a.c, a.r)
    const pb = cellCenter(spec.worldSize, spec.grid, b.c, b.r)
    const wall = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 } // the cell boundary
    expect(island.isWalkable(wall.x, wall.z)).toBe(false)
    expect(island.isPlaceable(wall.x, wall.z)).toBe(false)
  })

  it('isPlaceable rejects a point outside worldSize/2 bounds', () => {
    expect(island.isPlaceable(spec.worldSize / 2 + 1, 0)).toBe(false)
    expect(island.isPlaceable(0, -spec.worldSize / 2 - 1)).toBe(false)
  })

  it('isWalkable vs isPlaceable differ where expected: beach edge walkable, near-wall not placeable', () => {
    // A tier-1 (beach) cell is land above the sea → walkable at its center.
    const beach = findFlatCell(1)
    const pb = cellCenter(spec.worldSize, spec.grid, beach.c, beach.r)
    expect(island.isWalkable(pb.x, pb.z)).toBe(true)

    // A walkable point right next to a wall: walkable but NOT placeable
    // (the inset clearance test catches the wall).
    const { a, b } = findWallPair()
    const pa = cellCenter(spec.worldSize, spec.grid, a.c, a.r)
    const pbb = cellCenter(spec.worldSize, spec.grid, b.c, b.r)
    // step from the lower cell center toward the wall, staying on the plateau
    const lower = island.heightAt(pa.x, pa.z) < island.heightAt(pbb.x, pbb.z) ? pa : pbb
    const other = lower === pa ? pbb : pa
    const dirX = Math.sign(other.x - lower.x)
    const near = { x: lower.x + dirX * 0.12, z: lower.z }
    if (island.isWalkable(near.x, near.z)) {
      expect(island.isPlaceable(near.x, near.z, 0.3)).toBe(false)
    }
  })

  it('normalAt returns a unit vector, up on flat ground', () => {
    const { c, r } = findFlatCell(2)
    const { x, z } = cellCenter(spec.worldSize, spec.grid, c, r)
    const [nx, ny, nz] = island.normalAt(x, z)
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
    expect(ny).toBeGreaterThan(0.99)
  })

  it('shoreDistanceAt is negative on land, positive on water, finite everywhere', () => {
    const landCell = findFlatCell(2)
    const pl = cellCenter(spec.worldSize, spec.grid, landCell.c, landCell.r)
    expect(island.shoreDistanceAt(pl.x, pl.z)).toBeLessThan(0)
    const seaCell = findFlatCell(0, 2)
    const ps = cellCenter(spec.worldSize, spec.grid, seaCell.c, seaCell.r)
    expect(island.shoreDistanceAt(ps.x, ps.z)).toBeGreaterThan(0)
    expect(Number.isFinite(island.shoreDistanceAt(500, 500))).toBe(true)
  })

  it('landCells returns only land cells covering the island, with cell-center coordinates', () => {
    const cells = island.landCells()
    expect(cells.length).toBeGreaterThan(50)
    for (const cell of cells.slice(0, 25)) {
      const top = spec.tierHeights[cell.tier] ?? -99
      expect(top).toBeGreaterThan(spec.seaLevel)
      const { x, z } = cellCenter(spec.worldSize, spec.grid, cell.c, cell.r)
      expect(cell.x).toBe(x)
      expect(cell.z).toBe(z)
    }
    expect(island.landCells()).toBe(cells) // cached
  })

  it('re-boot hygiene: two sequential constructions produce independent, correct caches', () => {
    const a = new Island()
    const b = new Island()
    expect(a.spec).not.toBe(b.spec)
    expect(a._blurred).not.toBe(b._blurred)
    const probe = golden.heights[Math.floor(golden.heights.length / 2)]
    if (!probe) throw new Error('empty golden fixture')
    expect(a.heightAt(probe.x, probe.z)).toBeCloseTo(probe.h, 10)
    expect(b.heightAt(probe.x, probe.z)).toBeCloseTo(probe.h, 10)
  })
})
