// Kit substrate tests (plan 013 step 1): deterministic stitched-shell
// primitives. Vanilla vitest + real three, modelled after
// test/core/skeleton/assemble.test.ts.

import { describe, expect, it } from 'vitest'
import { capsuleGrid } from '../../../src/core/procgen/kit/loft'
import { ellipsoidTransform, gridToPiece, unitSphere } from '../../../src/core/procgen/kit/sphereGrid'
import { MeshBuilder, manifoldReport, packSkinning } from '../../../src/core/procgen/kit/stitch'
import { UV_ATLAS, headUv, islandUv } from '../../../src/core/procgen/kit/uv'
import { makeRng } from '../../../src/core/procgen/rng'

describe('sphere grid', () => {
  it('a closed unit sphere is a manifold single component', () => {
    const grid = unitSphere(16, 12)
    const piece = gridToPiece('s', grid, [])
    const b = new MeshBuilder()
    b.add(piece)
    const rep = manifoldReport(b.build().indices)
    expect(rep.boundaryEdges).toBe(0)
    expect(rep.overSharedEdges).toBe(0)
    expect(rep.components).toBe(1)
  })

  it('a pole-opened shell exposes a ring loop of useg vertices', () => {
    const grid = unitSphere(16, 12)
    const piece = gridToPiece('s', grid, [{ kind: 'poleBottom', ring: 2, loop: 'neck' }])
    expect(piece.loops.neck).toHaveLength(16)
    const b = new MeshBuilder()
    b.add(piece)
    const rep = manifoldReport(b.build().indices)
    // one open ring → exactly `useg` boundary edges
    expect(rep.boundaryEdges).toBe(16)
  })

  it('a removed grid block exposes a rectangular perimeter loop', () => {
    const grid = unitSphere(16, 12)
    const piece = gridToPiece('s', grid, [
      { kind: 'block', ringLo: 4, ringHi: 7, colStart: 3, colCount: 3, loop: 'shoulder' },
    ])
    // perimeter = 2·colCount + 2·(ringHi−ringLo) = 6 + 6
    expect(piece.loops.shoulder).toHaveLength(12)
    const b = new MeshBuilder()
    b.add(piece)
    const rep = manifoldReport(b.build().indices)
    expect(rep.boundaryEdges).toBe(12)
  })
})

describe('stitching (welded manifold)', () => {
  it('bridges two pole-opened shells into a closed manifold', () => {
    const top = unitSphere(16, 12)
    ellipsoidTransform(top, [0, 0.5, 0], [0.3, 0.3, 0.3])
    const bottom = unitSphere(16, 12)
    ellipsoidTransform(bottom, [0, 0, 0], [0.4, 0.4, 0.4])
    const topPiece = gridToPiece('head', top, [{ kind: 'poleBottom', ring: 2, loop: 'neck' }])
    const botPiece = gridToPiece('torso', bottom, [{ kind: 'poleTop', ring: 10, loop: 'neck' }])
    const b = new MeshBuilder()
    b.add(topPiece)
    b.add(botPiece)
    b.bridge(b.loopIndex.head.neck, b.loopIndex.torso.neck)
    const rep = manifoldReport(b.build().indices)
    expect(rep.boundaryEdges).toBe(0)
    expect(rep.overSharedEdges).toBe(0)
    expect(rep.components).toBe(1)
  })

  it('bridges a limb loft into a torso grid block (manifold, one component)', () => {
    const torso = unitSphere(12, 14)
    ellipsoidTransform(torso, [0, 0.4, 0], [0.2, 0.35, 0.16])
    const torsoPiece = gridToPiece('torso', torso, [
      { kind: 'block', ringLo: 8, ringHi: 11, colStart: 2, colCount: 3, loop: 'shoulder' },
    ])
    const arm = capsuleGrid({ a: [0.18, 0.5, 0], b: [0.34, 0.2, 0], radiusA: 0.06, radiusB: 0.05, useg: 12, vseg: 10 })
    // block perimeter = 2·3 + 2·3 = 12 == arm useg
    const armPiece = gridToPiece('armL', arm, [{ kind: 'poleBottom', ring: 1, loop: 'root' }])
    const b = new MeshBuilder()
    b.add(torsoPiece)
    b.add(armPiece)
    expect(b.loopIndex.torso.shoulder).toHaveLength(12)
    expect(b.loopIndex.armL.root).toHaveLength(12)
    b.bridge(b.loopIndex.torso.shoulder, b.loopIndex.armL.root)
    const rep = manifoldReport(b.build().indices)
    expect(rep.boundaryEdges).toBe(0)
    expect(rep.overSharedEdges).toBe(0)
    expect(rep.components).toBe(1)
  })
})

describe('determinism', () => {
  it('two identical builds produce byte-equal positions', () => {
    const buildOnce = () => {
      const g = unitSphere(16, 12)
      ellipsoidTransform(g, [0, 0.1, 0], [0.3, 0.25, 0.2])
      return gridToPiece('s', g, []).pos
    }
    expect(Float32Array.from(buildOnce())).toEqual(Float32Array.from(buildOnce()))
  })
})

describe('UV atlas', () => {
  it('every island rect stays inside [0,1]²', () => {
    for (const rect of Object.values(UV_ATLAS)) {
      const [u0, v0, u1, v1] = rect
      expect(u0).toBeGreaterThanOrEqual(0)
      expect(v0).toBeGreaterThanOrEqual(0)
      expect(u1).toBeLessThanOrEqual(1)
      expect(v1).toBeLessThanOrEqual(1)
      expect(u1).toBeGreaterThan(u0)
      expect(v1).toBeGreaterThan(v0)
    }
  })

  it('front-centered UVs land inside their island rect', () => {
    const rect = UV_ATLAS.torso
    for (let u = 0; u < 1; u += 0.1) {
      const [uu, vv] = islandUv(rect, u, 0.5, true)
      expect(uu).toBeGreaterThanOrEqual(rect[0] - 1e-9)
      expect(uu).toBeLessThanOrEqual(rect[2] + 1e-9)
      expect(vv).toBeGreaterThanOrEqual(rect[1] - 1e-9)
      expect(vv).toBeLessThanOrEqual(rect[3] + 1e-9)
    }
  })

  it('head front (azimuth 0) maps to the island u-center (face contract)', () => {
    const [u] = headUv(0, 0.7)
    const [u0, , u1] = UV_ATLAS.head
    expect(u).toBeCloseTo((u0 + u1) / 2, 6)
  })
})

describe('rng', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const c = makeRng(43)
    const sa = [a.next(), a.next(), a.next()]
    const sb = [b.next(), b.next(), b.next()]
    expect(sa).toEqual(sb)
    expect([c.next(), c.next(), c.next()]).not.toEqual(sa)
    for (const x of sa) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('skin packing', () => {
  it('caps at 4 influences and normalizes to 1', () => {
    const built = {
      vertexCount: 1,
      weights: new Map([
        ['a', Float32Array.from([0.5])],
        ['b', Float32Array.from([0.3])],
        ['c', Float32Array.from([0.15])],
        ['d', Float32Array.from([0.1])],
        ['e', Float32Array.from([0.05])],
      ]),
    } as never
    const { skinIndex, skinWeight } = packSkinning(built, (n) => 'abcde'.indexOf(n))
    const sum = skinWeight[0] + skinWeight[1] + skinWeight[2] + skinWeight[3]
    expect(sum).toBeCloseTo(1, 6)
    // lowest-weight influence 'e' is dropped
    expect([...skinIndex.slice(0, 4)]).not.toContain(4)
  })
})
