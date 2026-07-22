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

  // These loops scan per-vertex over SEGMENTS² lattice points (~263k at 512).
  // Plan 030 rev 1 gave them a 30s timeout for that reason, but plan 031 rev 2
  // found the REAL cost was ~1M expect() calls (263k vertices × ~4 checks each)
  // — vitest's per-call overhead (tens of µs) dominates runtime, so worker
  // contention could still push a file past 30s. Both loops now aggregate
  // violations into plain counters and assert once per condition after the
  // loop — same assertion strength, without the expect()-call tax.
  it('yields finite positions and normals for every vertex', () => {
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    expect(pos.count).toBe(field.n * field.n)
    expect(nor.count).toBe(pos.count)
    let nonFiniteCount = 0
    for (let i = 0; i < pos.count; i++) {
      if (
        !Number.isFinite(pos.getX(i)) ||
        !Number.isFinite(pos.getY(i)) ||
        !Number.isFinite(pos.getZ(i)) ||
        !Number.isFinite(nor.getY(i))
      ) {
        nonFiniteCount++
      }
    }
    expect(nonFiniteCount).toBe(0)
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
    let tierFlatOutOfRange = 0
    let wallnessOutOfRange = 0
    let surfaceInvalid = 0
    for (let i = 0; i < tierFlat.count; i++) {
      const t = tierFlat.getX(i)
      const w = wallness.getX(i)
      const s = surface.getX(i)
      if (t < 0 || t > 4) tierFlatOutOfRange++
      if (w < 0 || w > 1.0001) wallnessOutOfRange++
      if (s !== 0 && s !== 1) surfaceInvalid++
    }
    expect(tierFlatOutOfRange).toBe(0)
    expect(wallnessOutOfRange).toBe(0)
    expect(surfaceInvalid).toBe(0)
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
