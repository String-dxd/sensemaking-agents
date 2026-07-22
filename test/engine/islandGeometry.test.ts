// U4: ported terrain geometry builder against the committed spec.

import { describe, expect, it } from 'vitest'
import { loadIslandSpec } from '~/engine/student-space/Game/Data/islandSpec.ts'
import {
  blurTiers,
  cellCenter,
  evaluateHeight,
} from '~/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts'
import {
  buildIslandField,
  composeGeometry,
} from '~/engine/student-space/Game/View/islandGeometry.ts'

const spec = loadIslandSpec()

describe('islandGeometry — composeGeometry on the committed spec', () => {
  const field = buildIslandField(spec.worldSize)
  const geo = composeGeometry(field, spec)

  // These loops assert per-vertex over SEGMENTS² lattice points (~263k at 512) —
  // well past Vitest's 5s default under full-suite worker contention (plan 030 rev 1).
  it('yields finite positions and normals for every vertex', () => {
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    expect(pos.count).toBe(field.n * field.n)
    expect(nor.count).toBe(pos.count)
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true)
      expect(Number.isFinite(pos.getY(i))).toBe(true)
      expect(Number.isFinite(pos.getZ(i))).toBe(true)
      expect(Number.isFinite(nor.getY(i))).toBe(true)
    }
  }, 30_000)

  it('carries the three custom material attributes with sane ranges', () => {
    for (const name of ['aTierFlat', 'aWallness', 'aSurface'] as const) {
      const attr = geo.getAttribute(name)
      expect(attr, `missing attribute ${name}`).toBeDefined()
      expect(attr.count).toBe(field.n * field.n)
    }
    const tierFlat = geo.getAttribute('aTierFlat')
    const wallness = geo.getAttribute('aWallness')
    const surface = geo.getAttribute('aSurface')
    for (let i = 0; i < tierFlat.count; i++) {
      expect(tierFlat.getX(i)).toBeGreaterThanOrEqual(0)
      expect(tierFlat.getX(i)).toBeLessThanOrEqual(4)
      expect(wallness.getX(i)).toBeGreaterThanOrEqual(0)
      expect(wallness.getX(i)).toBeLessThanOrEqual(1.0001)
      expect([0, 1]).toContain(surface.getX(i))
    }
  }, 30_000)

  it('vertex heights agree with evaluateHeight at cell centers (lattice invariant)', () => {
    // SEGMENTS is an even multiple of the grid, so cell centers land exactly
    // on lattice vertices.
    const pos = geo.getAttribute('position')
    const blurred = blurTiers(spec.grid)
    const segPerCell = field.segments / spec.grid.cols
    for (const [c, r] of [
      [20, 33],
      [32, 32],
      [10, 40],
    ] as const) {
      const { x, z } = cellCenter(spec.worldSize, spec.grid, c, r)
      const i = Math.round((x + spec.worldSize / 2) / (spec.worldSize / field.segments))
      const j = Math.round((z + spec.worldSize / 2) / (spec.worldSize / field.segments))
      expect(segPerCell % 2).toBe(0) // even multiple → centers on vertices
      const v = j * field.n + i
      expect(pos.getX(v)).toBeCloseTo(x, 5)
      expect(pos.getZ(v)).toBeCloseTo(z, 5)
      expect(pos.getY(v)).toBeCloseTo(evaluateHeight(spec, x, z, blurred), 5)
    }
  })
})
