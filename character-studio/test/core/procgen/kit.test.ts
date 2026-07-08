// Kit substrate tests (plan 013 step 1): deterministic stitched-shell
// primitives. Vanilla vitest + real three, modelled after
// test/core/skeleton/assemble.test.ts.

import { describe, expect, it } from 'vitest'
import { CH_BELLY, torsoChannels } from '../../../src/core/procgen/kit/channels'
import { filletLimbIntoTorso, makeTorsoSdf } from '../../../src/core/procgen/kit/fillet'
import { capsuleGrid } from '../../../src/core/procgen/kit/loft'
import { pearProfile } from '../../../src/core/procgen/kit/profiles'
import { ellipsoidTransform, gridToPiece, unitSphere } from '../../../src/core/procgen/kit/sphereGrid'
import { MeshBuilder, manifoldReport, packSkinning } from '../../../src/core/procgen/kit/stitch'
import { UV_ATLAS, headUv, islandUv } from '../../../src/core/procgen/kit/uv'
import { chainWeights, torsoWeights } from '../../../src/core/procgen/kit/weights'
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

  it('build() winds the whole welded mesh consistently OUTWARD (smooth normals across junctions)', () => {
    // head sphere bridged to a torso sphere + an arm loft bridged into a torso
    // block — the exact junction rings where the per-bridge heuristic wound the
    // strip opposite the shell, cancelling computeVertexNormals into a crease.
    const head = unitSphere(12, 12)
    ellipsoidTransform(head, [0, 0.7, 0], [0.18, 0.18, 0.18])
    const headPiece = gridToPiece('head', head, [{ kind: 'poleBottom', ring: 2, loop: 'neck' }])
    const torso = unitSphere(12, 14)
    ellipsoidTransform(torso, [0, 0.4, 0], [0.2, 0.35, 0.16])
    const torsoPiece = gridToPiece('torso', torso, [
      { kind: 'poleTop', ring: 11, loop: 'neck' },
      { kind: 'block', ringLo: 6, ringHi: 9, colStart: 2, colCount: 3, loop: 'shoulder' },
    ])
    const arm = capsuleGrid({ a: [0.18, 0.45, 0], b: [0.34, 0.2, 0], radiusA: 0.06, radiusB: 0.05, useg: 12, vseg: 10 })
    const armPiece = gridToPiece('armL', arm, [{ kind: 'poleBottom', ring: 1, loop: 'root' }])
    const b = new MeshBuilder()
    b.add(headPiece)
    b.add(torsoPiece)
    b.add(armPiece)
    b.bridge(b.loopIndex.head.neck, b.loopIndex.torso.neck)
    b.bridge(b.loopIndex.torso.shoulder, b.loopIndex.armL.root)
    const { positions, indices } = b.build()

    // every interior edge of a consistently-wound manifold is traversed in
    // OPPOSITE directions by its two faces → no same-direction (crease) edges.
    const dir = new Map<string, number>()
    const bump = (a: number, c: number) => dir.set(`${a}>${c}`, (dir.get(`${a}>${c}`) ?? 0) + 1)
    for (let t = 0; t < indices.length; t += 3) {
      bump(indices[t], indices[t + 1])
      bump(indices[t + 1], indices[t + 2])
      bump(indices[t + 2], indices[t])
    }
    let sameDir = 0
    for (const [k, c] of dir) {
      const [a, c2] = k.split('>').map(Number)
      if (a < c2 && (c >= 2 || (dir.get(`${c2}>${a}`) ?? 0) === 0)) sameDir++
    }
    expect(sameDir).toBe(0)

    // outward orientation: signed volume of the closed surface is positive.
    let vol6 = 0
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]
      const p = indices[t + 1]
      const q = indices[t + 2]
      vol6 +=
        positions[a * 3] * (positions[p * 3 + 1] * positions[q * 3 + 2] - positions[p * 3 + 2] * positions[q * 3 + 1]) -
        positions[a * 3 + 1] * (positions[p * 3] * positions[q * 3 + 2] - positions[p * 3 + 2] * positions[q * 3]) +
        positions[a * 3 + 2] * (positions[p * 3] * positions[q * 3 + 1] - positions[p * 3 + 1] * positions[q * 3])
    }
    expect(vol6).toBeGreaterThan(0)
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

  it('front-centered UVs land inside their island rect (u), v within the glTF-flipped band', () => {
    const rect = UV_ATLAS.torso
    const [u0, v0, u1, v1] = rect
    for (let u = 0; u < 1; u += 0.1) {
      const [uu, vv] = islandUv(rect, u, 0.5, true)
      expect(uu).toBeGreaterThanOrEqual(u0 - 1e-9)
      expect(uu).toBeLessThanOrEqual(u1 + 1e-9)
      // v is exported glTF-flipped: it lands in the MIRROR band [1−v1, 1−v0].
      expect(vv).toBeGreaterThanOrEqual(1 - v1 - 1e-9)
      expect(vv).toBeLessThanOrEqual(1 - v0 + 1e-9)
    }
  })

  it('head front (azimuth 0) maps to the island u-center (face contract)', () => {
    const [u] = headUv(0, 0.7)
    const [u0, , u1] = UV_ATLAS.head
    expect(u).toBeCloseTo((u0 + u1) / 2, 6)
  })

  it('head UVs match the shipped GLB export orientation (glTF V-flip)', () => {
    // The face overlay (faceComposite) + palette masks are authored against the
    // exported GLBs, whose head UVs are Blender→glTF V-flipped. Assert the two
    // anchors read off body-biped-round.glb:
    //   TOP pole (polar v01=1)      → uv ≈ (0.275, 0.0)
    //   FRONT equator (az 0, v01=.5)→ uv ≈ (0.275, 0.275)
    const [uTop, vTop] = headUv(0, 1)
    expect(uTop).toBeCloseTo(0.275, 6)
    expect(vTop).toBeCloseTo(0.0, 6)
    const [uEq, vEq] = headUv(0, 0.5)
    expect(uEq).toBeCloseTo(0.275, 6)
    expect(vEq).toBeCloseTo(0.275, 6)
    // v must INCREASE toward the neck (v01→0) — i.e. top-of-head is the small-v
    // edge of the island, the orientation faceComposite's (1−v) draw expects.
    const [, vNeck] = headUv(0, 0)
    expect(vNeck).toBeGreaterThan(vEq)
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

describe('analytic weight recipe', () => {
  const boneIdx = (b: string): number =>
    ['upperArmL', 'foreArmL', 'handL', 'hips', 'spine', 'chest'].indexOf(b)

  it('chain-limb weights are normalized and never exceed 3 influences', () => {
    const arm = capsuleGrid({ a: [0.18, 0.5, 0], b: [0.34, 0.2, 0], radiusA: 0.06, radiusB: 0.05 })
    const piece = gridToPiece('armL', arm, [])
    chainWeights(piece, ['upperArmL', 'foreArmL'], [0.5], 0.18)
    const b = new MeshBuilder()
    b.add(piece)
    const built = b.build()
    const { skinIndex, skinWeight } = packSkinning(built, boneIdx)
    for (let i = 0; i < built.vertexCount; i++) {
      const w = [0, 1, 2, 3].map((s) => skinWeight[i * 4 + s])
      expect(w[0] + w[1] + w[2] + w[3]).toBeCloseTo(1, 5)
      const nonZero = w.filter((x) => x > 1e-6).length
      expect(nonZero).toBeLessThanOrEqual(4)
      // the analytic recipe caps at 3 across the whole mesh
      expect(nonZero).toBeLessThanOrEqual(3)
    }
    // both chain bones are actually referenced (index >= 0)
    expect([...skinIndex]).toContain(0)
    expect([...skinIndex]).toContain(1)
  })

  it('torso bands (hips/spine/chest) sum to 1 per vertex', () => {
    const torso = unitSphere(24, 18)
    ellipsoidTransform(torso, [0, 0.42, 0], [0.18, 0.24, 0.14])
    const piece = gridToPiece('torso', torso, [])
    torsoWeights(piece, 0.34, 0.4, 0.46)
    const n = piece.pos.length / 3
    for (let i = 0; i < n; i++) {
      const s = (piece.weights.get('hips')?.[i] ?? 0) + (piece.weights.get('spine')?.[i] ?? 0) + (piece.weights.get('chest')?.[i] ?? 0)
      expect(s).toBeCloseTo(1, 6)
    }
  })
})

describe('channels', () => {
  it('the channel array length is 4×vertexCount and values stay in [0,1]', () => {
    const torso = unitSphere(24, 18)
    ellipsoidTransform(torso, [0, 0.42, 0], [0.18, 0.24, 0.14])
    const piece = gridToPiece('torso', torso, [])
    const n = piece.pos.length / 3
    torsoChannels(piece, 0.42, 0.24, 0.18, 'biped-round')
    expect(piece.channels).toHaveLength(4 * n)
    for (const c of piece.channels) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
    // the belly channel actually lights up on the front (some vertex > 0)
    let maxBelly = 0
    for (let i = 0; i < n; i++) maxBelly = Math.max(maxBelly, piece.channels[i * 4 + CH_BELLY])
    expect(maxBelly).toBeGreaterThan(0.1)
  })
})

describe('fillet (smin projection)', () => {
  it('pushes near-junction limb verts outward yet leaves deep-inside verts tucked, deterministically', () => {
    const cy = 0.42
    const ry = 0.24
    const rx = 0.18
    const rz = 0.14
    const torsoSdf = makeTorsoSdf(cy, ry, rx, rz, pearProfile(0.28, 0.16))
    const build = (): number[] => {
      const arm = capsuleGrid({ a: [0.08, 0.5, 0], b: [0.34, 0.2, 0], radiusA: 0.06, radiusB: 0.05 })
      const pos = arm.pos.slice()
      filletLimbIntoTorso(pos, [0.08, 0.5, 0], [0.34, 0.2, 0], 0.06, 0.05, torsoSdf, 0.055)
      return pos
    }
    const armGrid = capsuleGrid({ a: [0.08, 0.5, 0], b: [0.34, 0.2, 0], radiusA: 0.06, radiusB: 0.05 })
    const before = armGrid.pos.slice()
    const after = build()
    const n = before.length / 3
    let moved = 0
    let deepUnchanged = 0
    let deepSeen = 0
    for (let i = 0; i < n; i++) {
      const dx = after[i * 3] - before[i * 3]
      const dy = after[i * 3 + 1] - before[i * 3 + 1]
      const dz = after[i * 3 + 2] - before[i * 3 + 2]
      const d = Math.hypot(dx, dy, dz)
      if (d > 1e-5) moved++
      const p: [number, number, number] = [before[i * 3], before[i * 3 + 1], before[i * 3 + 2]]
      if (torsoSdf(p) < -0.6 * 0.055) {
        deepSeen++
        if (d < 1e-9) deepUnchanged++
      }
    }
    expect(moved).toBeGreaterThan(0) // some fillet-band verts flared outward
    expect(deepUnchanged).toBe(deepSeen) // deep-inside verts are left tucked
    // determinism: same params → byte-equal positions
    expect(Float32Array.from(build())).toEqual(Float32Array.from(after))
  })
})
