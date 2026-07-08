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
const innerEar = (p: SurfacePiece, planeZ: number, depth: number): void => {
  setChannelFn(p, CH_BELLY, (i) => smoothstep(planeZ + depth * 0.15, planeZ + depth * 0.7, p.pos[i * 3 + 2]) * 0.95)
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
  const path: Vec3[] = [root, add(root, [0.07, 0.085, 0.008]), add(root, [0.135, 0.03, 0.018]), add(root, [0.165, -0.085, 0.032]), add(root, [0.17, -0.2, 0.048])]
  bendChain(ear.pos, root, L, smoothPath(path, 40))
  innerEar(ear, 0.01, 0.04)
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
  const root = V(j['earL.1'])
  const L = 0.3
  const base = vec.sub(root, [0, 0.02, 0])
  const ear = closedCapsule('earL', base, add(root, [0.02, L, -0.01]), 0.038, 0.024, 12, 14, 0.014)
  flatZ(ear, root[2], 0.55)
  chainWeightsPiece(ear, EAR_L, [0.45], 0.2)
  const path: Vec3[] = [root, add(root, [0.02, 0.12, -0.005]), add(root, [0.05, 0.22, -0.015]), add(root, [0.085, 0.29, -0.03])]
  bendChain(ear.pos, base, L + 0.02, smoothPath(path, 32))
  innerEar(ear, 0, 0.035)
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
  const beak = closedCapsule('beak', [a[0], a[1] + 0.02, a[2] - 0.03], [a[0], a[1] - 0.012, a[2] + 0.085], 0.046, 0.007, 12, 10)
  flatY(beak, a[1] + 0.004, 0.72)
  setChannelAll(beak, CH_ACCENT, 1)
  return [{ name: 'muzzle-beak-small', shells: [beak], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([beak], a) }]
}

function muzzleBeakRound(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const upper = closedCapsule('beakU', [a[0], a[1] + 0.025, a[2] - 0.03], [a[0], a[1] - 0.02, a[2] + 0.07], 0.052, 0.018, 12, 10, 0.008)
  const lower = closedEllipsoid('beakL', [a[0], a[1] - 0.018, a[2] + 0.012], [0.038, 0.02, 0.038], 10, 8)
  setChannelAll(upper, CH_ACCENT, 1)
  setChannelAll(lower, CH_ACCENT, 1)
  return [{ name: 'muzzle-beak-round', shells: [upper, lower], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([upper, lower], a) }]
}

function muzzleBeakHooked(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const upper = closedCapsule('beakU', [a[0], a[1] + 0.03, a[2] - 0.03], [a[0], a[1] - 0.005, a[2] + 0.075], 0.05, 0.014, 12, 10, 0.006)
  for (let i = 0; i < vertexCount(upper); i++) {
    const t = upper.params[i * 2 + 1]
    const hook = Math.max(t - 0.65, 0) ** 2
    upper.pos[i * 3 + 1] -= hook * 0.16
    upper.pos[i * 3 + 2] -= hook * 0.03
  }
  const lower = closedEllipsoid('beakL', [a[0], a[1] - 0.022, a[2] + 0.008], [0.034, 0.016, 0.03], 10, 8)
  setChannelAll(upper, CH_ACCENT, 1)
  setChannelAll(lower, CH_ACCENT, 1)
  return [{ name: 'muzzle-beak-hooked', shells: [upper, lower], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([upper, lower], a) }]
}

function muzzleBillDuck(j: J): PartMesh[] {
  const a = V(j['socket.muzzle'])
  const bill = closedCapsule('bill', [a[0], a[1] + 0.012, a[2] - 0.02], [a[0], a[1] - 0.006, a[2] + 0.095], 0.05, 0.03, 14, 10)
  scaleX(bill, a[0], 1.5)
  flatY(bill, a[1], 0.42)
  for (let i = 0; i < vertexCount(bill); i++) bill.pos[i * 3 + 1] += smoothstep(0.7, 1, bill.params[i * 2 + 1]) * 0.008
  setChannelAll(bill, CH_ACCENT, 1)
  return [{ name: 'muzzle-bill-duck', shells: [bill], attach: 'socket.muzzle', morphKeys: muzzleLengthKey([bill], a) }]
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
  const angles = [-38, -19, 0, 19, 38]
  angles.forEach((ang, i) => {
    const a = (ang * Math.PI) / 180
    const dir = vec.norm([Math.sin(a) * 0.9, 0.18, -Math.cos(a) * 0.9])
    const tip = add(root, vec.scale(dir, Math.abs(ang) < 30 ? 0.26 : 0.22))
    const f = closedCapsule(`feather${i}`, root, tip, 0.02, 0.035, 10, 10, 0.012)
    flatY(f, root[1], 0.35)
    chainWeightsPiece(f, TAIL_BONES, [0.3, 0.55, 0.8], 0.12)
    setChannelFn(f, CH_SECONDARY, (k) => smoothstep(0.6, 0.9, f.params[k * 2 + 1]) * 0.85)
    shells.push(f)
  })
  return [{ name: 'tail-feather-fan', shells, attach: null, morphKeys: lengthWidthKeys(shells, root, add(root, [0, 0.06, -0.26])) }]
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

function crestFeatherTuft(j: J): PartMesh[] {
  const a = V(j['socket.hat'])
  const shells: SurfacePiece[] = []
  const specs: Array<[number, number]> = [
    [-24, 0.1],
    [0, 0.14],
    [24, 0.1],
  ]
  specs.forEach(([ang, ln], i) => {
    const r = (ang * Math.PI) / 180
    const dir = vec.norm([Math.sin(r) * 0.45, Math.cos(r * 0.6), -0.35])
    const base = add(a, [Math.sin(r) * 0.02, -0.01, 0])
    const f = closedCapsule(`tuft${i}`, base, add(base, vec.scale(dir, ln)), 0.016, 0.024, 8, 8, 0.006)
    scaleX(f, base[0], 0.5)
    setChannelAll(f, CH_ACCENT, 1)
    shells.push(f)
  })
  return [{ name: 'crest-feather-tuft', shells, attach: 'socket.hat', morphKeys: {} }]
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
  'curl-shiba': tailCurlShiba,
  'fluff-fox': tailFluffFox,
  'slim-cat': tailSlimCat,
  'stub-round': tailStubRound,
  'feather-fan': tailFeatherFan,
  'stub-claws': clawsStub,
  'feather-tuft': crestFeatherTuft,
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

/** Build the procedural scene for a part id (skinned or rigid). */
export function buildProceduralPart(partId: PartId): THREE.Object3D {
  const def = PART_REGISTRY[partId]
  const builder = BUILDERS[partId]
  if (!builder) throw new Error(`buildProceduralPart: no builder for "${partId}"`)
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
    mesh.frustumCulled = false
    scene.add(mesh)
  }
  return scene
}
