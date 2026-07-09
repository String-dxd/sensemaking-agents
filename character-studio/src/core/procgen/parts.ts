// Procedural anatomy-part builders (plan 013 step 3) — ports scripts/blender/
// parts.py. `buildProceduralPart(partId)` returns a scene shaped like the part
// GLB, matching assemble.ts's conventions:
//   - skinned (ears, tails): a SkinnedMesh bound to the full reference-space
//     canonical skeleton, weights only on the part's chain bones. Assembly
//     rebinds by bone name and scales the bind by the archetype's uniformScale.
//   - rigid (muzzles/beaks/crest): plain Mesh(es), vertices authored in the
//     attach bone's LOCAL reference frame (origin at the bone), `userData
//     .attachBone` set. Assembly parents to the bone at scale = uniformScale.
//   - rigid multi-attach (claws): one Mesh per attach bone (@handL/@handR/…).
//
// Parts are authored in REFERENCE space (uniformScale 1). Shapes overlap freely
// (the AC "tucked into the body" pattern) — parts are their own meshes and are
// NOT welded to the body, so no manifold constraint here.

import * as THREE from 'three'
import { ARCHETYPES_DEF, archetypeBuildOptions } from '../skeleton/archetypes'
import { birdFlankX, birdTrunkDims } from './birdTrunk'
import { type BuiltSkeleton, buildSkeleton, restWorldPositions } from '../skeleton/canonical'
import { PART_REGISTRY, type PartId } from '../skeleton/partRegistry'
import { BONE_NAMES, type BoneName } from '../spec/schema'
import { CH_ACCENT, CH_BELLY, CH_SECONDARY } from './kit/channels'
import { bendChain, smoothPath } from './kit/bend'
import { capsuleGrid } from './kit/loft'
import { ellipsoidTransform, gridToPiece, unitSphere } from './kit/sphereGrid'
import { MeshBuilder, packSkinning } from './kit/stitch'
import { type SurfacePiece, type Vec3, smoothstep, v as vec, vertexCount } from './kit/surface'

type J = Record<BoneName, [number, number, number]>

interface PartMesh {
  name: string
  shells: SurfacePiece[]
  attach: BoneName | null
  morphKeys: Record<string, Float32Array> // per concatenated-vertex n×3
}

// --- shell helpers ------------------------------------------------------------

function closedEllipsoid(name: string, center: Vec3, radii: Vec3, useg: number, vseg: number, boxiness = 0): SurfacePiece {
  const g = unitSphere(useg, vseg)
  ellipsoidTransform(g, center, radii, undefined, boxiness)
  const p = gridToPiece(name, g, [])
  paintParamUv(p)
  return p
}

function closedCapsule(
  name: string,
  a: Vec3,
  b: Vec3,
  rA: number,
  rB: number,
  useg: number,
  vseg: number,
  bulge = 0,
  fullness = 0,
): SurfacePiece {
  const g = capsuleGrid({ a, b, radiusA: rA, radiusB: rB, useg, vseg, bulge, fullness })
  const p = gridToPiece(name, g, [])
  paintParamUv(p)
  return p
}

/** Simple param-based UV (plan 015 rasterizes part masks properly). */
function paintParamUv(p: SurfacePiece): void {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) {
    p.uv[i * 2] = p.params[i * 2]
    p.uv[i * 2 + 1] = p.params[i * 2 + 1]
  }
}

function setChannelAll(p: SurfacePiece, idx: number, value: number): void {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) p.channels[i * 4 + idx] = value
}

function setChannelFn(p: SurfacePiece, idx: number, fn: (i: number) => number): void {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) p.channels[i * 4 + idx] = Math.min(Math.max(fn(i), 0), 1)
}

function chainWeightsPiece(p: SurfacePiece, bones: string[], splits: number[], width: number): void {
  const n = vertexCount(p)
  const t = (i: number): number => p.params[i * 2 + 1]
  const fs = splits.map((s) => (i: number) => smoothstep(s - width, s + width, t(i)))
  for (let b = 0; b < bones.length; b++) {
    const track = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      let w = 1
      if (b > 0) w *= fs[b - 1](i)
      if (b < bones.length - 1) w *= 1 - fs[b](i)
      track[i] = w
    }
    p.weights.set(bones[b], track)
  }
}

// --- morph keys (parts.py _length_width_keys / _muzzle_length_key) ------------

const EAR_L = ['earL.1', 'earL.2']
const TAIL_BONES = ['tail.1', 'tail.2', 'tail.3', 'tail.4']

function lengthWidthKeys(shells: SurfacePiece[], root: Vec3, tip: Vec3): Record<string, Float32Array> {
  const total = shells.reduce((a, s) => a + vertexCount(s), 0)
  const length = new Float32Array(total * 3)
  const width = new Float32Array(total * 3)
  const axis = vec.norm(vec.sub(tip, root))
  let off = 0
  for (const s of shells) {
    const n = vertexCount(s)
    for (let i = 0; i < n; i++) {
      const rel: Vec3 = [s.pos[i * 3] - root[0], s.pos[i * 3 + 1] - root[1], s.pos[i * 3 + 2] - root[2]]
      const along = vec.dot(rel, axis)
      const clamped = Math.max(along, 0)
      length[(off + i) * 3] = axis[0] * clamped * 0.3
      length[(off + i) * 3 + 1] = axis[1] * clamped * 0.3
      length[(off + i) * 3 + 2] = axis[2] * clamped * 0.3
      const perp: Vec3 = [rel[0] - along * axis[0], rel[1] - along * axis[1], rel[2] - along * axis[2]]
      width[(off + i) * 3] = perp[0] * 0.32
      width[(off + i) * 3 + 1] = perp[1] * 0.32
      width[(off + i) * 3 + 2] = perp[2] * 0.32
    }
    off += n
  }
  return { length, width }
}

function muzzleLengthKey(shells: SurfacePiece[], attach: Vec3): Record<string, Float32Array> {
  const total = shells.reduce((a, s) => a + vertexCount(s), 0)
  const length = new Float32Array(total * 3)
  let off = 0
  for (const s of shells) {
    const n = vertexCount(s)
    for (let i = 0; i < n; i++) {
      const w = smoothstep(attach[2] - 0.02, attach[2] + 0.08, s.pos[i * 3 + 2])
      length[(off + i) * 3 + 2] = w * 0.055
    }
    off += n
  }
  return { length }
}

/** Mirror a piece across X into a new piece with L→R bone names. */
function mirrorX(p: SurfacePiece, name: string): SurfacePiece {
  const n = vertexCount(p)
  const pos = p.pos.slice()
  for (let i = 0; i < n; i++) pos[i * 3] = -pos[i * 3]
  const weights = new Map<string, number[]>()
  for (const [bone, track] of p.weights) weights.set(bone.endsWith('L') ? `${bone.slice(0, -1)}R` : bone.endsWith('R') ? `${bone.slice(0, -1)}L` : bone, track.slice())
  // reverse winding to keep outward normals
  const tris = p.tris.slice()
  for (let t = 0; t < tris.length; t += 3) {
    const tmp = tris[t + 1]
    tris[t + 1] = tris[t + 2]
    tris[t + 2] = tmp
  }
  return { name, pos, uv: p.uv.slice(), tris, params: p.params.slice(), loops: {}, weights, channels: p.channels.slice() }
}

// --- part builders ------------------------------------------------------------

const dirTo = (a: Vec3, b: Vec3): Vec3 => vec.norm(vec.sub(b, a))
const V = (p: [number, number, number]): Vec3 => [p[0], p[1], p[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const flatZ = (p: SurfacePiece, aboutZ: number, factor: number): void => {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) p.pos[i * 3 + 2] = (p.pos[i * 3 + 2] - aboutZ) * factor + aboutZ
}
const flatY = (p: SurfacePiece, aboutY: number, factor: number): void => {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) p.pos[i * 3 + 1] = (p.pos[i * 3 + 1] - aboutY) * factor + aboutY
}
const scaleX = (p: SurfacePiece, aboutX: number, factor: number): void => {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) p.pos[i * 3] = (p.pos[i * 3] - aboutX) * factor + aboutX
}
/** Blend a shell's cross-section toward a diamond (the AC low-poly beak read).
 * Splits each vertex's offset from `about` into an axis component (kept) and a
 * radial remainder expressed in an orthonormal (u,v) basis ⊥ `axis`; the diamond
 * radius for direction θ is 1/(|cosθ|+|sinθ|) — 1 on the axes, √½ on the
 * diagonals, so only the diagonals pull in and the top/bottom/left/right extents
 * are unchanged. `v` is aimed as up-ish as possible so a ridge (a diamond vertex)
 * sits along the beak top (AC culmen), not a flat facet. `k` = 0 (round) … 1
 * (hard diamond). */
function diamondize(p: SurfacePiece, about: Vec3, axis: Vec3, k: number): void {
  const ax = vec.norm(axis)
  const ref: Vec3 = Math.abs(ax[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]
  const u = vec.norm(vec.cross(ref, ax)) // side axis
  const w = vec.norm(vec.cross(ax, u)) // up-ish axis → top ridge along +w
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) {
    const rel: Vec3 = [p.pos[i * 3] - about[0], p.pos[i * 3 + 1] - about[1], p.pos[i * 3 + 2] - about[2]]
    const along = vec.dot(rel, ax)
    const qu = vec.dot(rel, u)
    const qw = vec.dot(rel, w)
    const r = Math.hypot(qu, qw)
    if (r < 1e-9) continue
    const diamond = 1 / (Math.abs(qu / r) + Math.abs(qw / r))
    const f = 1 - k + diamond * k
    const nu = qu * f
    const nw = qw * f
    p.pos[i * 3] = about[0] + along * ax[0] + nu * u[0] + nw * w[0]
    p.pos[i * 3 + 1] = about[1] + along * ax[1] + nu * u[1] + nw * w[1]
    p.pos[i * 3 + 2] = about[2] + along * ax[2] + nu * u[2] + nw * w[2]
  }
}

// Inner-ear dish reads as accentA (soft pink on the rabbit, darker fur tones
// elsewhere) — belly tone was indistinguishable from the coat on pale species.
// Call BEFORE any bendChain so the mask follows the authored (unbent) surface.
const innerEar = (p: SurfacePiece, planeZ: number, depth: number): void => {
  setChannelFn(p, CH_ACCENT, (i) => smoothstep(planeZ + depth * 0.45, planeZ + depth * 0.85, p.pos[i * 3 + 2]) * 0.95)
}

function earsUprightPointy(j: J): PartMesh[] {
  const root = V(j['earL.1'])
  const mid = V(j['earL.2'])
  const d = dirTo(root, mid)
  const tip = add(root, vec.scale(d, 0.21))
  const ear = closedCapsule('earL', vec.sub(root, vec.scale(d, 0.03)), tip, 0.052, 0.008, 12, 12)
  flatZ(ear, 0, 0.72)
  for (let i = 0; i < vertexCount(ear); i++) ear.pos[i * 3 + 2] += root[2] * 0.28
  chainWeightsPiece(ear, EAR_L, [0.5], 0.18)
  innerEar(ear, 0, 0.05)
  return [pairEar('ears-upright-pointy', ear, root, tip)]
}

function earsFloppyLong(j: J): PartMesh[] {
  const root = V(j['earL.1'])
  const L = 0.34
  const ear = closedCapsule('earL', root, add(root, [0, L, 0]), 0.062, 0.034, 12, 18, 0.014)
  flatZ(ear, root[2], 0.45)
  chainWeightsPiece(ear, EAR_L, [0.4], 0.2)
  innerEar(ear, 0.01, 0.04)
  const path: Vec3[] = [root, add(root, [0.07, 0.085, 0.008]), add(root, [0.135, 0.03, 0.018]), add(root, [0.165, -0.085, 0.032]), add(root, [0.17, -0.2, 0.048])]
  bendChain(ear.pos, root, L, smoothPath(path, 40))
  return [pairEar('ears-floppy-long', ear, root, path[path.length - 1])]
}

function earsRoundBear(j: J): PartMesh[] {
  const root = V(j['earL.1'])
  const mid = V(j['earL.2'])
  const d = dirTo(root, mid)
  const c = add(root, vec.scale(d, 0.055))
  const ear = closedEllipsoid('earL', c, [0.062, 0.058, 0.032], 14, 10)
  const n = vertexCount(ear)
  const w1: number[] = new Array(n)
  const w2: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = smoothstep(c[1] - 0.06, c[1] + 0.06, ear.pos[i * 3 + 1])
    w1[i] = 1 - 0.35 * t
    w2[i] = 0.35 * t
  }
  ear.weights.set('earL.1', w1)
  ear.weights.set('earL.2', w2)
  innerEar(ear, c[2], 0.032)
  return [pairEar('ears-round-bear', ear, root, add(root, vec.scale(d, 0.12)))]
}

function earsBunnyTall(j: J): PartMesh[] {
  // Chibi paddle ears: long, wide, round-tipped, near-vertical with a gentle
  // backward curve — not the old narrow outward-flaring spikes.
  const root = V(j['earL.1'])
  const L = 0.42
  const base = vec.sub(root, [0, 0.03, 0])
  const ear = closedCapsule('earL', base, add(root, [0.01, L, -0.01]), 0.052, 0.038, 14, 16, 0.022)
  flatZ(ear, root[2], 0.5)
  chainWeightsPiece(ear, EAR_L, [0.45], 0.2)
  innerEar(ear, 0, 0.04)
  const path: Vec3[] = [root, add(root, [0.008, 0.15, -0.006]), add(root, [0.022, 0.29, -0.024]), add(root, [0.04, 0.41, -0.055])]
  bendChain(ear.pos, base, L + 0.03, smoothPath(path, 32))
  return [pairEar('ears-bunny-tall', ear, root, path[path.length - 1])]
}

/** L ear + mirrored R ear, morph keys spanning both. */
function pairEar(name: string, earL: SurfacePiece, rootL: Vec3, tipL: Vec3): PartMesh {
  const earR = mirrorX(earL, 'earR')
  // rebind mirrored weights already handled in mirrorX; ensure R uses EAR_R
  const shells = [earL, earR]
  const keysL = lengthWidthKeys([earL], rootL, tipL)
  const rootR: Vec3 = [-rootL[0], rootL[1], rootL[2]]
  const tipR: Vec3 = [-tipL[0], tipL[1], tipL[2]]
  const keysR = lengthWidthKeys([earR], rootR, tipR)
  const morphKeys: Record<string, Float32Array> = {}
  for (const k of Object.keys(keysL)) morphKeys[k] = concatF32(keysL[k], keysR[k])
  return { name, shells, attach: null, morphKeys }
}

function concatF32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

// muzzles / beaks ---------------------------------------------------------------

function muzzleShortCat(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const m = closedEllipsoid('muzzle', [a[0], a[1] - 0.008, a[2] + 0.028], [0.075, 0.052, 0.052], 16, 12, 0.15)
  setChannelAll(m, CH_BELLY, 0.9)
  const nose = closedEllipsoid('nose', [a[0], a[1] + 0.028, a[2] + 0.062], [0.02, 0.015, 0.014], 10, 8)
  setChannelAll(nose, CH_ACCENT, 1)
  return [{ name: 'muzzle-short-cat', shells: [m, nose], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([m, nose], a) }]
}

function muzzleBoxyDog(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const m = closedEllipsoid('muzzle', [a[0], a[1] - 0.012, a[2] + 0.045], [0.082, 0.058, 0.078], 16, 12, 0.55)
  setChannelAll(m, CH_BELLY, 0.9)
  const nose = closedEllipsoid('nose', [a[0], a[1] + 0.026, a[2] + 0.112], [0.026, 0.019, 0.017], 10, 8, 0.2)
  setChannelAll(nose, CH_ACCENT, 1)
  return [{ name: 'muzzle-boxy-dog', shells: [m, nose], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([m, nose], a) }]
}

function muzzleBeakSmall(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const base: Vec3 = [a[0], a[1] + 0.012, a[2] - 0.025]
  const tip: Vec3 = [a[0], a[1] - 0.02, a[2] + 0.13]
  const beak = closedCapsule('beak', base, tip, 0.075, 0.014, 12, 10)
  flatY(beak, a[1] + 0.004, 0.8)
  diamondize(beak, base, dirTo(base, tip), 0.55)
  setChannelAll(beak, CH_ACCENT, 1)
  return [
    { name: 'muzzle-beak-small', shells: [beak], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([beak], a) },
    beakJaw(a, 0.085, 0.05),
  ]
}

/** Lower mandible as its OWN PartMesh/mesh so assembly can hinge it — the
 * beak opens and closes while talking (anatomy round 3). A flat under-wedge
 * tucked beneath the upper beak; closed it disappears into the upper's
 * silhouette, open it drops and reads as the AC talking flap. */
function beakJaw(a: Vec3, len: number, halfW: number, drop = 0.016): PartMesh {
  const base: Vec3 = [a[0], a[1] - drop, a[2] - 0.02]
  const tip: Vec3 = [a[0], a[1] - drop - 0.012, a[2] + len]
  const jaw = closedCapsule('beakJaw', base, tip, halfW, 0.012, 12, 8)
  flatY(jaw, base[1] + 0.004, 0.5)
  diamondize(jaw, base, dirTo(base, tip), 0.45)
  setChannelAll(jaw, CH_ACCENT, 1)
  return { name: 'muzzle-beak.jaw', shells: [jaw], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([jaw], a) }
}

function muzzleBeakRound(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const base: Vec3 = [a[0], a[1] + 0.022, a[2] - 0.025]
  const tip: Vec3 = [a[0], a[1] - 0.016, a[2] + 0.108]
  const upper = closedCapsule('beakU', base, tip, 0.082, 0.024, 12, 10, 0.008)
  flatY(upper, a[1] + 0.008, 0.82)
  diamondize(upper, base, dirTo(base, tip), 0.5)
  const lowC: Vec3 = [a[0], a[1] - 0.026, a[2] + 0.026]
  const lower = closedEllipsoid('beakL', lowC, [0.06, 0.026, 0.053], 10, 8)
  diamondize(lower, lowC, [0, 0, 1], 0.4)
  setChannelAll(upper, CH_ACCENT, 1)
  setChannelAll(lower, CH_ACCENT, 1)
  return [
    { name: 'muzzle-beak-round', shells: [upper], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([upper], a) },
    { name: 'muzzle-beak-round.jaw', shells: [lower], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([lower], a) },
  ]
}

function muzzleBeakHooked(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const base: Vec3 = [a[0], a[1] + 0.028, a[2] - 0.028]
  const tip: Vec3 = [a[0], a[1] - 0.005, a[2] + 0.137]
  const upper = closedCapsule('beakU', base, tip, 0.082, 0.017, 12, 10, 0.006)
  flatY(upper, a[1] + 0.008, 0.85)
  diamondize(upper, base, dirTo(base, tip), 0.5)
  for (let i = 0; i < vertexCount(upper); i++) {
    const t = upper.params[i * 2 + 1]
    const hook = Math.max(t - 0.6, 0) ** 2
    upper.pos[i * 3 + 1] -= hook * 0.28
    upper.pos[i * 3 + 2] -= hook * 0.05
  }
  const lowC: Vec3 = [a[0], a[1] - 0.028, a[2] + 0.018]
  const lower = closedEllipsoid('beakL', lowC, [0.05, 0.022, 0.042], 10, 8)
  diamondize(lower, lowC, [0, 0, 1], 0.4)
  setChannelAll(upper, CH_ACCENT, 1)
  setChannelAll(lower, CH_ACCENT, 1)
  // dark tip zone (plan 019/020 palette makes it Apollo-dark)
  setChannelFn(upper, CH_SECONDARY, (i) => (upper.params[i * 2 + 1] > 0.8 ? 0.9 : 0))
  return [
    { name: 'muzzle-beak-hooked', shells: [upper], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([upper], a) },
    { name: 'muzzle-beak-hooked.jaw', shells: [lower], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([lower], a) },
  ]
}

function muzzleBillDuck(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const bill = closedCapsule('bill', [a[0], a[1] + 0.01, a[2] - 0.02], [a[0], a[1] - 0.005, a[2] + 0.12], 0.056, 0.036, 14, 10)
  scaleX(bill, a[0], 1.75)
  flatY(bill, a[1], 0.36)
  for (let i = 0; i < vertexCount(bill); i++) bill.pos[i * 3 + 1] += smoothstep(0.7, 1, bill.params[i * 2 + 1]) * 0.012
  setChannelAll(bill, CH_ACCENT, 1)
  // lower bill: same wide flat plate, slightly smaller, tucked under
  const lowBill = closedCapsule('billJaw', [a[0], a[1] - 0.012, a[2] - 0.015], [a[0], a[1] - 0.022, a[2] + 0.105], 0.05, 0.032, 14, 10)
  scaleX(lowBill, a[0], 1.7)
  flatY(lowBill, a[1] - 0.016, 0.3)
  setChannelAll(lowBill, CH_ACCENT, 1)
  return [
    { name: 'muzzle-bill-duck', shells: [bill], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([bill], a) },
    { name: 'muzzle-bill-duck.jaw', shells: [lowBill], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([lowBill], a) },
  ]
}

function muzzleBeakChicken(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const base: Vec3 = [a[0], a[1] + 0.01, a[2] - 0.015]
  const tip: Vec3 = [a[0], a[1] - 0.014, a[2] + 0.105]
  const beak = closedCapsule('beak', base, tip, 0.068, 0.012, 12, 10)
  flatY(beak, a[1] + 0.002, 0.82)
  diamondize(beak, base, dirTo(base, tip), 0.6)
  setChannelAll(beak, CH_ACCENT, 1)
  // red wattle: two lobes hanging under the beak base / chin (centers ~0.035
  // below the base, slightly forward — hanging wattles, not whiskers)
  const wattleY = base[1] - 0.035
  const wattleL = closedEllipsoid('wattleL', [a[0] + 0.012, wattleY, a[2] + 0.03], [0.02, 0.036, 0.016], 10, 8)
  const wattleR = closedEllipsoid('wattleR', [a[0] - 0.012, wattleY, a[2] + 0.03], [0.02, 0.036, 0.016], 10, 8)
  setChannelAll(wattleL, CH_SECONDARY, 1)
  setChannelAll(wattleR, CH_SECONDARY, 1)
  return [
    { name: 'muzzle-beak-chicken', shells: [beak, wattleL, wattleR], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([beak, wattleL, wattleR], a) },
    beakJaw(a, 0.07, 0.045, 0.014),
  ]
}

function muzzleBeakPenguin(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const base: Vec3 = [a[0], a[1] + 0.008, a[2] - 0.02]
  const tip: Vec3 = [a[0], a[1] - 0.009, a[2] + 0.145]
  const beak = closedCapsule('beak', base, tip, 0.06, 0.01, 12, 10)
  flatY(beak, a[1], 0.8)
  diamondize(beak, base, dirTo(base, tip), 0.4)
  for (let i = 0; i < vertexCount(beak); i++) {
    const t = beak.params[i * 2 + 1]
    beak.pos[i * 3 + 1] -= t * t * 0.02
  }
  setChannelAll(beak, CH_ACCENT, 1)
  return [
    { name: 'muzzle-beak-penguin', shells: [beak], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([beak], a) },
    beakJaw(a, 0.105, 0.038, 0.012),
  ]
}

// tails -------------------------------------------------------------------------

function tailChain(j: J): Vec3 {
  return V(j['tail.1'])
}

function tailCurlShiba(j: J): PartMesh[] {
  const root = tailChain(j)
  const L = 0.3
  const tail = closedCapsule('tail', root, add(root, [0, L, 0]), 0.058, 0.03, 14, 20, 0.012, 0.5)
  const path: Vec3[] = [root, add(root, [0, 0.05, -0.09]), add(root, [0, 0.14, -0.115]), add(root, [0, 0.215, -0.06]), add(root, [0, 0.23, 0.03])]
  bendChain(tail.pos, root, L, smoothPath(path, 44))
  chainWeightsPiece(tail, TAIL_BONES, [0.3, 0.55, 0.8], 0.1)
  setChannelFn(tail, CH_BELLY, (i) => smoothstep(0.72, 0.95, tail.params[i * 2 + 1]) * 0.9)
  return [{ name: 'tail-curl-shiba', shells: [tail], attach: null, morphKeys: lengthWidthKeys([tail], root, path[path.length - 1]) }]
}

function tailFluffFox(j: J): PartMesh[] {
  const root = tailChain(j)
  const L = 0.36
  const tail = closedCapsule('tail', root, add(root, [0, L, 0]), 0.052, 0.032, 16, 18, 0.07, 0.35)
  const path: Vec3[] = [root, add(root, [0, 0.015, -0.12]), add(root, [0, 0.06, -0.24]), add(root, [0, 0.15, -0.335])]
  bendChain(tail.pos, root, L, smoothPath(path, 36))
  chainWeightsPiece(tail, TAIL_BONES, [0.3, 0.55, 0.8], 0.1)
  setChannelFn(tail, CH_BELLY, (i) => smoothstep(0.68, 0.92, tail.params[i * 2 + 1]))
  return [{ name: 'tail-fluff-fox', shells: [tail], attach: null, morphKeys: lengthWidthKeys([tail], root, path[path.length - 1]) }]
}

function tailSlimCat(j: J): PartMesh[] {
  const root = tailChain(j)
  const L = 0.34
  const tail = closedCapsule('tail', root, add(root, [0, L, 0]), 0.026, 0.02, 12, 18, 0, 0.5)
  const path: Vec3[] = [root, add(root, [0, 0.02, -0.1]), add(root, [0, 0.1, -0.16]), add(root, [0, 0.22, -0.14]), add(root, [0, 0.3, -0.07])]
  bendChain(tail.pos, root, L, smoothPath(path, 40))
  chainWeightsPiece(tail, TAIL_BONES, [0.3, 0.55, 0.8], 0.1)
  setChannelFn(tail, CH_ACCENT, (i) => smoothstep(0.8, 0.95, tail.params[i * 2 + 1]) * 0.9)
  return [{ name: 'tail-slim-cat', shells: [tail], attach: null, morphKeys: lengthWidthKeys([tail], root, path[path.length - 1]) }]
}

function tailStubRound(j: J): PartMesh[] {
  const root = tailChain(j)
  const c = add(root, [0, 0.015, -0.045])
  const stub = closedEllipsoid('tail', c, [0.052, 0.048, 0.055], 14, 10)
  const n = vertexCount(stub)
  const w1: number[] = new Array(n)
  const w2: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = smoothstep(c[2] + 0.05, c[2] - 0.05, stub.pos[i * 3 + 2])
    w1[i] = 1 - 0.4 * t
    w2[i] = 0.4 * t
  }
  stub.weights.set('tail.1', w1)
  stub.weights.set('tail.2', w2)
  return [{ name: 'tail-stub-round', shells: [stub], attach: null, morphKeys: lengthWidthKeys([stub], root, add(c, [0, 0, -0.06])) }]
}

function tailFeatherFan(j: J): PartMesh[] {
  const root = tailChain(j)
  const shells: SurfacePiece[] = []
  const angles = [-30, -15, 0, 15, 30]
  angles.forEach((ang, i) => {
    const a = (ang * Math.PI) / 180
    const dir = vec.norm([Math.sin(a) * 0.9, 0.45, -Math.cos(a) * 0.9])
    const tip = add(root, vec.scale(dir, Math.abs(ang) < 20 ? 0.3 : 0.25))
    const f = closedCapsule(`feather${i}`, root, tip, 0.02, 0.035, 10, 10, 0.012)
    flatY(f, root[1], 0.5)
    chainWeightsPiece(f, TAIL_BONES, [0.3, 0.55, 0.8], 0.12)
    setChannelFn(f, CH_SECONDARY, (k) => smoothstep(0.6, 0.9, f.params[k * 2 + 1]) * 0.85)
    shells.push(f)
  })
  return [{ name: 'tail-feather-fan', shells, attach: null, morphKeys: lengthWidthKeys(shells, root, add(root, [0, 0.13, -0.26])) }]
}

function tailSickleRooster(j: J): PartMesh[] {
  const root = tailChain(j)
  const shells: SurfacePiece[] = []
  const L = 0.34
  const fan = [-12, 0, 12]
  fan.forEach((deg, i) => {
    const fx = Math.sin((deg * Math.PI) / 180) * 0.14
    const feather = closedCapsule(`sickle${i}`, root, add(root, [0, L, 0]), 0.02, 0.008, 10, 16, 0.01)
    // arc rising ABOVE the back then curving down BEHIND the body (apex ~+0.22;
    // reviewer round 1: authored high so spring rest sag never drops the arcs
    // beside the legs)
    const path: Vec3[] = [
      root,
      add(root, [fx * 0.3, 0.14, -0.04]),
      add(root, [fx * 0.7, 0.22, -0.16]),
      add(root, [fx, 0.16, -0.3]),
      add(root, [fx * 1.1, 0.04, -0.37]),
    ]
    bendChain(feather.pos, root, L, smoothPath(path, 40))
    chainWeightsPiece(feather, TAIL_BONES, [0.3, 0.55, 0.8], 0.1)
    setChannelFn(feather, CH_SECONDARY, (k) => (feather.params[k * 2 + 1] > 0.85 ? 0.9 : 0))
    shells.push(feather)
  })
  return [{ name: 'tail-sickle-rooster', shells, attach: null, morphKeys: lengthWidthKeys(shells, root, add(root, [0, 0.04, -0.37])) }]
}

function tailTrainPeacock(j: J): PartMesh[] {
  const root = tailChain(j)
  const shells: SurfacePiece[] = []
  // near-vertical fan, only ~15° back-tilt (reviewer round 1: rest pose must
  // read upright behind the torso, tips at/above mid-head height)
  const tilt = (15 * Math.PI) / 180
  const up: Vec3 = [0, Math.cos(tilt), -Math.sin(tilt)] // upright, tilted back
  const xhat: Vec3 = [1, 0, 0]
  const planeN = vec.norm(vec.cross(xhat, up)) // out-of-plane normal
  const N = 7
  for (let i = 0; i < N; i++) {
    const f01 = i / (N - 1)
    const phi = (-55 + f01 * 110) * (Math.PI / 180)
    const dir = vec.norm(add(vec.scale(up, Math.cos(phi)), vec.scale(xhat, Math.sin(phi))))
    const len = 0.24 + (1 - Math.abs(f01 - 0.5) * 2) * 0.06 // 0.24 edges → 0.30 centre
    const tip = add(root, vec.scale(dir, len))
    const feather = closedCapsule(`train${i}`, root, tip, 0.016, 0.03, 10, 12, 0.01)
    // flatten perpendicular to the fan plane (thin flat feathers)
    for (let k = 0; k < vertexCount(feather); k++) {
      const d =
        (feather.pos[k * 3] - root[0]) * planeN[0] +
        (feather.pos[k * 3 + 1] - root[1]) * planeN[1] +
        (feather.pos[k * 3 + 2] - root[2]) * planeN[2]
      feather.pos[k * 3] -= planeN[0] * d * 0.6
      feather.pos[k * 3 + 1] -= planeN[1] * d * 0.6
      feather.pos[k * 3 + 2] -= planeN[2] * d * 0.6
    }
    chainWeightsPiece(feather, TAIL_BONES, [0.3, 0.55, 0.8], 0.12)
    // eyespot: accent ring band near the tip, belly spot core inside it
    setChannelFn(feather, CH_ACCENT, (k) => {
      const t = feather.params[k * 2 + 1]
      return smoothstep(0.78, 0.86, t) * (1 - smoothstep(0.9, 0.97, t))
    })
    setChannelFn(feather, CH_BELLY, (k) => smoothstep(0.9, 0.96, feather.params[k * 2 + 1]))
    shells.push(feather)
  }
  return [{ name: 'tail-train-peacock', shells, attach: null, morphKeys: lengthWidthKeys(shells, root, add(root, vec.scale(up, 0.3))) }]
}

// wings (plan 023) ----------------------------------------------------------------
//
// AC read: the wing is its own layer riding the flank — narrow at the shoulder,
// WIDENING toward the tip, ending in overlapping scallop rows of flat feathers
// (Zion's blue wing with white tips; Phil's brown layered scallops). Skinned to
// the arm chain; authored in reference space around the reference shoulder.

// Wings ride the SHOULDER bone alone (anatomy round 3): chain-splitting the
// weights onto the bird's compressed fore-arm/hand bones remapped the authored
// drape onto the stubby arm and crumpled the wing into a shoulder tuft. AC
// folded wings are effectively rigid plates — single-bone weights keep the
// authored silhouette exactly and still follow the shoulder's idle/walk sway.
const ARM_L = ['upperArmL']

interface WingSpec {
  /** Primaries in the main fan. */
  count: number
  /** Longest (rearmost) primary length, reference-space m. */
  len: number
  /** Back-sweep of the rearmost primary (z component at t01=1). */
  sweep: number
  /** Tip radius of the longest primary (teardrop wide end). */
  tipR: number
  /** Covert layer on top (0 = none, else covert feather count). */
  coverts: number
}

/** One wing side (L), the AC folded-wing read: every feather ROOTS AT THE
 * SHOULDER (the wing's narrow top), and the fan drapes DIAGONALLY down the
 * flank — the front primary drops nearly straight down along the leading
 * edge, the rear ones sweep progressively back toward the tail. Roots are
 * teardrop-narrow (converging at the shoulder) and tips wide, so the
 * silhouette is narrow at the shoulder and widens downward, ending in the
 * overlapping round scallops of the tip caps. Feathers are flattened in x
 * (the egg's flank tangent plane is ~yz), with the root nudged INTO the
 * flank so the wing reads as a layer ON the body, not a paddle beside it. */
function wingSideL(j: J, spec: WingSpec, curl = 0): { shells: SurfacePiece[]; root: Vec3; tip: Vec3 } {
  // +0.105 y compensates the bird arm-chain compression (the archetype's
  // scaled offsets land the reference shoulder ~0.09 world lower), so the
  // folded wing's top edge sits at the AC shoulder line, not mid-egg.
  // root sits INSIDE the flank (x pulled in, modest y raise) so the narrow
  // capsule caps are buried in the egg — no nubs poking out at the shoulder
  const shoulder: Vec3 = [j.upperArmL[0] - 0.01, j.upperArmL[1] + 0.07, j.upperArmL[2] - 0.02]
  const shells: SurfacePiece[] = []
  let mainTip: Vec3 = shoulder

  // The wing must HUG the egg — not guess at it. Rebuild the bird trunk's
  // exact world silhouette (mirrors buildProceduralBody's bird constants:
  // STYLE rx/pear/taper and the torso span rules) plus the exact
  // authored→world transform of upperArmL-bound vertices (rigid single-bone
  // bind scaled by uniformScale), then project every feather vertex to ride
  // a fixed clearance proud of that silhouette.
  const bird = ARCHETYPES_DEF.bird
  const u = bird.uniformScale
  const jb = restWorldPositions(buildSkeleton(archetypeBuildOptions('bird')))
  const tX = jb.upperArmL[0] - u * j.upperArmL[0]
  const tY = jb.upperArmL[1] - u * j.upperArmL[1]
  const dims = birdTrunkDims(jb, bird.headRadius * u)
  const flankX = (yW: number): number => birdFlankX(dims, yW)

  const drape = (t01: number, len: number, r0: number, r1: number, name: string, layerX: number): SurfacePiece => {
    // front (t01=0) → down the leading edge; rear (t01=1) → swept to the tail
    const dir = vec.norm([0, -1, -spec.sweep * t01])
    const tip = add(shoulder, vec.scale(dir, len))
    const feather = closedCapsule(name, shoulder, tip, r0, r1, 8, 8, 0.008)
    scaleX(feather, shoulder[0], 0.3) // flat plate in the flank tangent plane
    for (let i = 0; i < vertexCount(feather); i++) {
      const v01 = feather.params[i * 2 + 1]
      // plate-local thickness = offset from the feather's flat spine
      const thick = feather.pos[i * 3] - shoulder[0]
      // authored x that puts this vertex `clearance` proud of the egg flank
      const yW = feather.pos[i * 3 + 1] * u + tY
      const hugged = (flankX(yW) + 0.014 + layerX - tX) / u + thick
      // root cap stays buried at the shoulder; the visible run hugs the egg
      const blend = smoothstep(0.04, 0.3, v01)
      feather.pos[i * 3] = feather.pos[i * 3] * (1 - blend) + hugged * blend
    }
    return feather
  }
  for (let f = 0; f < spec.count; f++) {
    const t01 = spec.count === 1 ? 1 : f / (spec.count - 1)
    // rearmost primary is the longest — the diagonal tip of the folded wing
    const len = spec.len * (0.62 + 0.38 * t01)
    const feather = drape(t01, len, 0.014, spec.tipR * (0.78 + 0.22 * t01), `wingP${f}`, 0)
    if (curl > 0) {
      // flipper: slight outward curl at the tip
      for (let i = 0; i < vertexCount(feather); i++) {
        const v01 = feather.params[i * 2 + 1]
        feather.pos[i * 3] += v01 * v01 * curl
      }
    }
    chainWeightsPiece(feather, ARM_L, [], 0.16)
    // white feather tips (Zion) — accent band via palette
    setChannelFn(feather, CH_ACCENT, (i) => smoothstep(0.8, 0.93, feather.params[i * 2 + 1]))
    // rear primaries carry the secondary tone for the layered read
    if (spec.count > 1 && t01 > 0.55) {
      setChannelFn(feather, CH_SECONDARY, (i) => (feather.params[i * 2 + 1] > 0.4 ? 0.85 : 0))
    }
    shells.push(feather)
    if (f === spec.count - 1) mainTip = add(shoulder, vec.scale(vec.norm([0.24, -1, -spec.sweep]), len))
  }
  // covert layer: a shorter fan riding just proud of the primaries, covering
  // the upper wing — gives the AC two-ledge scallop silhouette
  for (let f = 0; f < spec.coverts; f++) {
    const t01 = spec.coverts === 1 ? 0.5 : f / (spec.coverts - 1)
    const len = spec.len * 0.5 * (0.72 + 0.28 * t01)
    const covert = drape(t01 * 0.9, len, 0.013, spec.tipR * 0.8, `wingC${f}`, 0.012)
    chainWeightsPiece(covert, ARM_L, [], 0.16)
    shells.push(covert)
  }
  return { shells, root: shoulder, tip: mainTip }
}

/** L shells + mirrored R shells in one PartMesh, morph keys spanning both. */
function pairWing(name: string, j: J, spec: WingSpec, curl = 0): PartMesh[] {
  const { shells, root, tip } = wingSideL(j, spec, curl)
  const right = shells.map((p, i) => mirrorX(p, `${p.name}R${i}`))
  const keysL = lengthWidthKeys(shells, root, tip)
  const keysR = lengthWidthKeys(right, [-root[0], root[1], root[2]], [-tip[0], tip[1], tip[2]])
  const morphKeys: Record<string, Float32Array> = {}
  for (const k of Object.keys(keysL)) morphKeys[k] = concatF32(keysL[k], keysR[k])
  return [{ name, shells: [...shells, ...right], attach: null, morphKeys }]
}

function wingRound(j: J): PartMesh[] {
  // default songbird/chicken/owl. AC folded wings hang DOWN the flank like
  // little arms — barely any back-sweep (anatomy round 4); the feather fan
  // reads in the tip scallops, not in a back-wrap.
  return pairWing('wing-round', j, { count: 4, len: 0.26, sweep: 0.22, tipR: 0.042, coverts: 3 })
}

function wingEagle(j: J): PartMesh[] {
  // eagle/peacock: longer (tip below hip), slightly more diagonal
  return pairWing('wing-eagle', j, { count: 5, len: 0.33, sweep: 0.3, tipR: 0.044, coverts: 4 })
}

function wingFlipper(j: J): PartMesh[] {
  // penguin: one smooth slim flat paddle, no scallops, slight outward curl
  return pairWing('wing-flipper', j, { count: 1, len: 0.24, sweep: 0.06, tipR: 0.05, coverts: 0 }, 0.035)
}

// claws + crest -----------------------------------------------------------------

function clawsStub(j: J): PartMesh[] {
  const handDir = dirTo(V(j.foreArmL), V(j.handL))
  const handLBase = add(V(j.handL), vec.scale(handDir, 0.035))
  const footLBase = add(V(j.toesL), [0, 0.012, 0.055])
  const footDir = vec.norm([0, -0.15, 1])
  const specs: Array<{ bone: BoneName; base: Vec3; dir: Vec3; spread: Vec3 }> = [
    { bone: 'handL', base: handLBase, dir: handDir, spread: [0, 0, 1] },
    { bone: 'handR', base: [-handLBase[0], handLBase[1], handLBase[2]], dir: [-handDir[0], handDir[1], handDir[2]], spread: [0, 0, 1] },
    { bone: 'footL', base: footLBase, dir: footDir, spread: [1, 0, 0] },
    { bone: 'footR', base: [-footLBase[0], footLBase[1], footLBase[2]], dir: footDir, spread: [1, 0, 0] },
  ]
  return specs.map(({ bone, base, dir, spread }) => {
    const d = vec.norm(dir)
    const shells: SurfacePiece[] = []
    for (const k of [-1, 0, 1]) {
      const c = add(base, vec.scale(spread, k * 0.02))
      const claw = closedCapsule(`claw${k + 1}`, c, add(c, vec.scale(d, 0.028)), 0.009, 0.002, 8, 6)
      setChannelAll(claw, CH_BELLY, 1)
      shells.push(claw)
    }
    return { name: `claws-stub@${bone}`, shells, attach: bone, morphKeys: {} }
  })
}

// bird feet (anatomy round 4) — the visible foot is a PROPER mesh: three
// separated toe capsules plus a heel, one rigid part per foot bone, replacing
// round 3's displacement-sculpted paddle. Ground alignment: the builder maps
// the authored sole so it lands exactly on y=0 after the rigid bone mapping
// (world = birdBoneWorld + (v − refBone)·uniformScale).

function birdToesSide(j: J, bone: 'footL' | 'footR', webbed: boolean): PartMesh {
  const u = ARCHETYPES_DEF.bird.uniformScale
  const jb = restWorldPositions(buildSkeleton(archetypeBuildOptions('bird')))
  const ref = V(j[bone])
  const mirror = bone === 'footR' ? -1 : 1
  const soleY = ref[1] - jb[bone][1] / u // authored y that lands on world 0
  const toeR = 0.026
  const flat = 0.62 // vertical squash — low flat toes, round in plan view
  const lift = toeR * flat // centreline height so the squashed sole touches 0
  const heelZ = -0.015
  const shells: SurfacePiece[] = []
  const toe = (name: string, angDeg: number, len: number, r: number): void => {
    const a = (angDeg * Math.PI) / 180
    const dir: Vec3 = [Math.sin(a) * mirror, 0, Math.cos(a)]
    const base: Vec3 = [ref[0], soleY + lift, ref[2] + heelZ]
    const tip = add(base, vec.scale(dir, len))
    const t = closedCapsule(name, base, tip, r, r * 0.78, 10, 8, 0, 0.55)
    flatY(t, soleY + lift, flat)
    setChannelAll(t, CH_ACCENT, 1)
    shells.push(t)
  }
  if (webbed) {
    // shorter toes joined by a thin web plate (duck/penguin)
    toe('toeMid', 0, 0.085, toeR * 0.9)
    toe('toeIn', -24, 0.072, toeR * 0.85)
    toe('toeOut', 24, 0.072, toeR * 0.85)
    const web = closedEllipsoid('web', [ref[0], soleY + lift * 0.7, ref[2] + heelZ + 0.045], [0.052, lift * 0.55, 0.05], 12, 8)
    setChannelAll(web, CH_ACCENT, 1)
    shells.push(web)
  } else {
    // three clearly SEPARATED toes — middle longest — plus a short hind toe
    toe('toeMid', 0, 0.105, toeR)
    toe('toeIn', -27, 0.085, toeR * 0.88)
    toe('toeOut', 27, 0.085, toeR * 0.88)
    toe('toeHind', 180, 0.05, toeR * 0.8)
  }
  return { name: `${webbed ? 'bird-toes-webbed' : 'bird-toes'}@${bone}`, shells, attach: bone, morphKeys: {} }
}

function birdToes(j: J): PartMesh[] {
  return [birdToesSide(j, 'footL', false), birdToesSide(j, 'footR', false)]
}

function birdToesWebbed(j: J): PartMesh[] {
  return [birdToesSide(j, 'footL', true), birdToesSide(j, 'footR', true)]
}

function crestFeatherTuft(j: J): PartMesh[] {
  // Two owl brow tufts (Blathers): a trio at +x, mirrored to −x, each aimed
  // up-and-out from the crown sides.
  const a = V(j['socket.hat'])
  const specs: Array<[number, number]> = [
    [-35, 0.085],
    [-15, 0.11],
    [8, 0.08],
  ]
  const base = add(a, [0.055, -0.005, 0])
  const right: SurfacePiece[] = specs.map(([ang, ln], i) => {
    const r = (ang * Math.PI) / 180
    const dir = vec.norm([Math.sin(r) + 0.35, Math.cos(r), -0.15])
    const f = closedCapsule(`tuftR${i}`, base, add(base, vec.scale(dir, ln)), 0.016, 0.02, 8, 8, 0.006)
    scaleX(f, base[0], 0.5)
    setChannelAll(f, CH_ACCENT, 1)
    return f
  })
  const left = right.map((p, i) => mirrorX(p, `tuftL${i}`))
  return [{ name: 'crest-feather-tuft', shells: [...right, ...left], attach: 'socket.hat', morphKeys: {} }]
}

function crestCombChicken(j: J): PartMesh[] {
  // Serrated red crown ridge: 4 overlapping thin lobes along the head midline,
  // descending back-to-front.
  const a = V(j['socket.hat'])
  const zs = [-0.07, -0.015, 0.04, 0.09]
  const shells = zs.map((dz, i) => {
    const h = 0.07 - (i / (zs.length - 1)) * 0.02 // 0.07 back → 0.05 front
    const c: Vec3 = [a[0], a[1] + h * 0.45, a[2] + dz]
    const lobe = closedEllipsoid(`comb${i}`, c, [0.02, h, 0.045], 10, 8)
    setChannelAll(lobe, CH_SECONDARY, 1)
    return lobe
  })
  return [{ name: 'crest-comb-chicken', shells, attach: 'socket.hat', morphKeys: {} }]
}

function crestPeacock(j: J): PartMesh[] {
  // 3 thin stalks with teardrop tips (the peacock's upright crown fan).
  const a = V(j['socket.hat'])
  const shells: SurfacePiece[] = []
  const specs: Array<[number, number]> = [
    [-14, 0.1],
    [0, 0.12],
    [14, 0.1],
  ]
  specs.forEach(([ang, ln], i) => {
    const r = (ang * Math.PI) / 180
    const dir = vec.norm([Math.sin(r), Math.cos(r), -0.1])
    const base = add(a, [Math.sin(r) * 0.01, 0, 0])
    const end = add(base, vec.scale(dir, ln))
    const stalk = closedCapsule(`stalk${i}`, base, end, 0.006, 0.004, 8, 8)
    setChannelAll(stalk, CH_ACCENT, 1)
    shells.push(stalk)
    const tip = closedEllipsoid(`teardrop${i}`, end, [0.016, 0.02, 0.01], 8, 6)
    setChannelAll(tip, CH_SECONDARY, 1)
    shells.push(tip)
  })
  return [{ name: 'crest-peacock', shells, attach: 'socket.hat', morphKeys: {} }]
}

const BUILDERS: Partial<Record<PartId, (j: J) => PartMesh[]>> = {
  'upright-pointy': earsUprightPointy,
  'floppy-long': earsFloppyLong,
  'round-bear': earsRoundBear,
  'bunny-tall': earsBunnyTall,
  'short-cat': muzzleShortCat,
  'boxy-dog': muzzleBoxyDog,
  'beak-small': muzzleBeakSmall,
  'beak-round': muzzleBeakRound,
  'beak-hooked': muzzleBeakHooked,
  'bill-duck': muzzleBillDuck,
  'beak-chicken': muzzleBeakChicken,
  'beak-penguin': muzzleBeakPenguin,
  'curl-shiba': tailCurlShiba,
  'fluff-fox': tailFluffFox,
  'slim-cat': tailSlimCat,
  'stub-round': tailStubRound,
  'feather-fan': tailFeatherFan,
  'tail-sickle-rooster': tailSickleRooster,
  'tail-train-peacock': tailTrainPeacock,
  'stub-claws': clawsStub,
  'bird-toes': birdToes,
  'bird-toes-webbed': birdToesWebbed,
  'wing-round': wingRound,
  'wing-eagle': wingEagle,
  'wing-flipper': wingFlipper,
  'feather-tuft': crestFeatherTuft,
  'comb-chicken': crestCombChicken,
  'crest-peacock': crestPeacock,
}

// --- scene assembly -----------------------------------------------------------

function referenceSkeleton(): BuiltSkeleton {
  // A fresh skeleton per part build (bones can only live in one graph).
  return buildSkeleton()
}

function mergePart(pm: PartMesh): {
  positions: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  channels: Float32Array
  weights: Map<string, Float32Array>
  morphs: Record<string, Float32Array>
} {
  const b = new MeshBuilder()
  for (const s of pm.shells) b.add(s)
  const built = b.build()
  return { positions: built.positions, uvs: built.uvs, indices: built.indices, channels: built.channels, weights: built.weights, morphs: pm.morphKeys }
}

function geometryFrom(
  merged: ReturnType<typeof mergePart>,
  morphNames: readonly string[],
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(merged.positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(merged.uvs, 2))
  geo.setAttribute('paletteChannels', new THREE.BufferAttribute(merged.channels, 4))
  geo.setIndex(new THREE.BufferAttribute(merged.indices, 1))
  geo.computeVertexNormals()
  if (morphNames.length > 0) {
    geo.morphAttributes.position = morphNames.map((name) => {
      const arr = merged.morphs[name] ?? new Float32Array(merged.positions.length)
      const a = new THREE.BufferAttribute(arr, 3)
      a.name = name
      return a
    })
    geo.morphTargetsRelative = true
    geo.userData.targetNames = [...morphNames]
  }
  return geo
}

/** Build the procedural scene for a part id (skinned or rigid). `partId` is a
 * plain string (not `PartId`) so partRegistry's `source.build` closures don't
 * make PART_REGISTRY's type circularly reference itself. */
export function buildProceduralPart(partId: string): THREE.Object3D {
  const def = PART_REGISTRY[partId as PartId]
  const builder = BUILDERS[partId as PartId]
  if (!def || !builder) throw new Error(`buildProceduralPart: no builder for "${partId}"`)
  const built = referenceSkeleton()
  const j = restWorldPositions(built)
  const meshes = builder(j)

  const scene = new THREE.Group()
  scene.name = partId

  const skinned = meshes.some((m) => m.attach === null)
  if (skinned) {
    // one SkinnedMesh bound to the full reference skeleton; weights on chain bones
    scene.add(built.bones[0])
    for (const pm of meshes) {
      const merged = mergePart(pm)
      const geo = geometryFrom(merged, def.morphs)
      const skin = packSkinning(
        { vertexCount: merged.positions.length / 3, weights: merged.weights } as never,
        (bn) => (BONE_NAMES as readonly string[]).indexOf(bn as BoneName),
      )
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(skin.skinIndex, 4))
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(skin.skinWeight, 4))
      const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial())
      mesh.name = pm.name
      mesh.bind(built.skeleton, new THREE.Matrix4())
      mesh.frustumCulled = false
      scene.add(mesh)
    }
    return scene
  }

  // rigid: each mesh authored in its attach bone's LOCAL reference frame
  for (const pm of meshes) {
    const merged = mergePart(pm)
    const bone = pm.attach as BoneName
    const bonePos = j[bone]
    // translate base positions into the bone-local frame (origin at the bone)
    for (let i = 0; i < merged.positions.length / 3; i++) {
      merged.positions[i * 3] -= bonePos[0]
      merged.positions[i * 3 + 1] -= bonePos[1]
      merged.positions[i * 3 + 2] -= bonePos[2]
    }
    const geo = geometryFrom(merged, def.morphs)
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial())
    mesh.name = pm.name
    mesh.userData.attachBone = bone
    // lower mandibles hinge at the muzzle socket — assembly collects these
    // so the talk layer can open/close the beak (anatomy round 3)
    if (pm.name.endsWith('.jaw')) mesh.userData.beakJaw = true
    mesh.frustumCulled = false
    scene.add(mesh)
  }
  return scene
}
