// Procedural body builder (plan 013 step 2) — ports scripts/blender/bodies.py
// to a deterministic TS mesh generator. Produces a scene shaped exactly like a
// loaded body GLB: the canonical 38-bone skeleton + region-split SkinnedMeshes
// (body / body_torso / body_hips / body_upperLegs, matching the shipped GLB),
// with POSITION/NORMAL/TEXCOORD_0(UV atlas)/JOINTS_0/WEIGHTS_0, the five
// BODY_MORPHS as relative morph targets, and per-vertex palette channels.
//
// Divergence from the Python lane (deliberate, per plan 013): the Python recipe
// unions overlapping shells and welds them with a Blender boolean; TS has no
// robust boolean, so the kit produces the welded result BY CONSTRUCTION — limbs
// are lofted and bridged ring-to-ring into the torso openings, the head bridges
// to the torso at the neck, so the merged buffer is a closed 2-manifold with no
// interior faces. Hands/feet are short capsule lofts (not free ellipsoids) so
// their attach pole faces the wrist/ankle for a clean bridge. Same silhouette,
// cleaner topology. The fillet reshapes near-junction rings onto the smooth-min
// union surface so the shoulders/haunches read as the AC sculpted fillet.

import * as THREE from 'three'
import { ARCHETYPES_DEF, archetypeBuildOptions, archetypeHead } from '../skeleton/archetypes'
import { type BuiltSkeleton, buildSkeleton, restWorldPositions } from '../skeleton/canonical'
import type { Archetype } from '../spec/schema'
import { BODY_MORPHS } from '../skeleton/partRegistry'
import { BONE_NAMES, type BoneName } from '../spec/schema'
import { CH_ACCENT, accentAll, headChannels, torsoChannels } from './kit/channels'
import { filletLimbIntoTorso, makeTorsoSdf } from './kit/fillet'
import { capsuleGrid } from './kit/loft'
import { pearProfile } from './kit/profiles'
import { type Opening, ellipsoidTransform, gridToPiece, unitSphere } from './kit/sphereGrid'
import { MeshBuilder, manifoldReport, packSkinning } from './kit/stitch'
import {
  type SurfacePiece,
  type Vec3,
  setChannel,
  smoothstep,
  v as vec,
  vertexCount,
} from './kit/surface'
import { type IslandName, UV_ATLAS, islandUv, splitWrapSeam } from './kit/uv'
import { chainWeights, footWeights, rigidWeight, torsoWeights } from './kit/weights'

// --- per-archetype style knobs (started as bodies.py STYLE; biped-slim
// remodeled 2026-07-08 toward the chibi toy-render benchmark) ------------------

interface Style {
  torsoRx: number
  torsoRz: number
  pear: number
  shoulderTaper: number
  armR: number
  handR: number
  legR: number
  foot: readonly [number, number, number]
  headSquash: number
  headWide: number
  wing: boolean
}

const STYLE: Record<Archetype, Style> = {
  'biped-round': { torsoRx: 0.8, torsoRz: 0.64, pear: 0.32, shoulderTaper: 0.18, armR: 0.046, handR: 0.052, legR: 0.064, foot: [0.06, 0.042, 0.096], headSquash: 0.95, headWide: 1.05, wing: false },
  'biped-slim': { torsoRx: 0.8, torsoRz: 0.7, pear: 0.3, shoulderTaper: 0.22, armR: 0.042, handR: 0.048, legR: 0.06, foot: [0.058, 0.042, 0.088], headSquash: 0.95, headWide: 1.06, wing: false },
  bird: { torsoRx: 0.85, torsoRz: 0.78, pear: 0.36, shoulderTaper: 0.14, armR: 0.042, handR: 0, legR: 0.038, foot: [0.064, 0.046, 0.1], headSquash: 0.96, headWide: 1.04, wing: true },
}

// Trunk shells (head + torso) share this azimuth resolution so their neck rings
// bridge one-to-one. The face is drawn in the head's UVs (a texture), so the
// head's geometric azimuth resolution is not a fidelity constraint.
const TRUNK_USEG = 32
const HEAD_VSEG = 22
const TORSO_VSEG = 18
const LIMB_USEG = 12
const LIMB_VSEG = 10

// --- bird shape seam (plan 017) ------------------------------------------------
// Per-species silhouette knobs for the bird archetype only; plans 018–020 key
// species presets off this. Mammal archetypes ignore it entirely.

export interface BirdBodyShape {
  /** DEPRECATED (plan 023): wings are separate parts now (`wing-*` in the
   * wings slot); these three fields are inert pass-throughs kept so 020's
   * presets still parse. Remove in a later SPEC-adjacent sweep. */
  wingLength: number
  wingWidth: number
  wingScallop: number
  /** Bare-leg (tarsus) thinness + length below the body hem. */
  tarsusRadius: number // default 0.014 (reference-space m)
  tarsusLength: number // default 1 (multiplier on the exposed drop)
  footLength: number // default 1
  /** Toe-cut depth on the foot fan; 0 = fully webbed (duck), 1 = deep cut. */
  toeCut: number // default 0.7
  hindToe: boolean // default true
  /** Torso egg-ness override (multiplies STYLE.bird pear). */
  belly: number // default 1
  headSize: number // default 1 (multiplies head radii)
  /** Extra exposed neck as a fraction of head radius (plan 023): raises the
   * head and lofts the head's lower rings into a smooth neck column.
   * Peacock/crane ≈ 0.5–0.7. */
  neckLength: number // default 0
  /** Forward+width bulge of the upper-front torso (plan 023). Eagle ≈ 0.6. */
  chestBulge: number // default 0
}

export const DEFAULT_BIRD_SHAPE: BirdBodyShape = {
  wingLength: 1,
  wingWidth: 1,
  wingScallop: 1,
  tarsusRadius: 0.014,
  tarsusLength: 1,
  footLength: 1,
  toeCut: 0.7,
  hindToe: true,
  belly: 1,
  headSize: 1,
  neckLength: 0,
  chestBulge: 0,
}

// --- public shape -------------------------------------------------------------

export interface ProcBodyData {
  /** Canonical skeleton + region-split SkinnedMeshes (shaped like a body GLB). */
  scene: THREE.Object3D
  /** n×4 palette channels (R/G/B/A = primary/secondary/belly/accentA). Plan 015. */
  channels: Float32Array
  /** Pattern-field coordinate system (plan 015 consumes). */
  meta: {
    torso: { cy: number; ry: number; rx: number; rz: number }
    headCenter: [number, number, number]
    headRadius: number
    /** vertex range [start, end) per piece in the merged buffer. */
    shellRanges: Record<string, [start: number, end: number]>
    /** chain param t per limb vertex (only limb pieces populated). */
    limbParams: Record<string, Float32Array>
  }
  /** Triangle count across all region meshes (budget gate). */
  triangleCount: number
  /** Topology audit of the full welded mesh (before region split). */
  manifold: { boundaryEdges: number; overSharedEdges: number; components: number }
}

// --- helpers ------------------------------------------------------------------

const V = (p: readonly [number, number, number]): Vec3 => [p[0], p[1], p[2]]

/** Grid ring index whose ellipsoid latitude sits nearest world-Y `targetY`. */
function ringForY(vseg: number, cy: number, ry: number, targetY: number): number {
  const cos = Math.min(Math.max((cy - targetY) / ry, -1), 1)
  return Math.min(Math.max(Math.round((vseg / Math.PI) * Math.acos(cos)), 1), vseg - 1)
}

/** Grid column nearest a world azimuth (atan2(x, z): +Z=0, +X=π/2). */
function colForAzimuth(useg: number, x: number, z: number): number {
  const az = Math.atan2(x, z)
  const col = Math.round((az / (2 * Math.PI)) * useg)
  return ((col % useg) + useg) % useg
}

/**
 * Paint an island's UVs onto a piece from its (azimuth u01, polar v01) params.
 * Splits the azimuth wrap seam first (plan 017 r2): the seam column and pole
 * fans get render-only duplicate vertices so no triangle spans the island in
 * UV — the back-centerline texture stripe. Must run AFTER weights/channels
 * (duplicates copy them) and is therefore each piece's last step before add.
 */
function paintUv(piece: SurfacePiece, island: IslandName, frontCenter: boolean): void {
  splitWrapSeam(piece, frontCenter)
  const rect = UV_ATLAS[island]
  const n = vertexCount(piece)
  for (let i = 0; i < n; i++) {
    const [uu, vv] = islandUv(rect, piece.params[i * 2], piece.params[i * 2 + 1], frontCenter)
    piece.uv[i * 2] = uu
    piece.uv[i * 2 + 1] = vv
  }
}

/** Copy a limb loft's along-chain param (polar v01) into a per-vertex array. */
function limbParamArray(piece: SurfacePiece): Float32Array {
  const n = vertexCount(piece)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = piece.params[i * 2 + 1]
  return out
}

// --- builder ------------------------------------------------------------------

export function buildProceduralBody(archetype: Archetype, birdShape?: Partial<BirdBodyShape>): ProcBodyData {
  // Mammal archetypes must ignore the bird shape seam (byte-identical output).
  const shape: BirdBodyShape = { ...DEFAULT_BIRD_SHAPE, ...(archetype === 'bird' ? birdShape : undefined) }
  const built: BuiltSkeleton = buildSkeleton(archetypeBuildOptions(archetype))
  const j = restWorldPositions(built)
  const u = ARCHETYPES_DEF[archetype].uniformScale
  const head = archetypeHead(archetype)
  const headCenter: Vec3 = [j.head[0] + head.center[0], j.head[1] + head.center[1], j.head[2] + head.center[2]]
  const headR = head.radius
  const style = STYLE[archetype]

  // torso ellipsoid params (bodies.py) --------------------------------------
  const torsoH = j.neck[1] - j.hips[1]
  const torsoBottom = j.hips[1] - torsoH * 0.42
  const torsoTop = j.neck[1] + torsoH * 0.55
  const cy = (torsoBottom + torsoTop) / 2
  const ry = (torsoTop - torsoBottom) / 2
  const rx = headR * style.torsoRx
  const rz = headR * style.torsoRz
  const isBird = style.wing
  // chest bulge (plan 023): widen the upper-chest band via the radial profile
  // (the SDF/fillet see the same curve) + a forward-only push below.
  const chest = isBird ? shape.chestBulge : 0
  // band peaks just above the equator and is ZERO by the neck ring (v01 =
  // neckRing/TORSO_VSEG ≈ 0.667) so the head bridge ring keeps its radius
  const chestBump = (v01: number): number => smoothstep(0.32, 0.5, v01) * (1 - smoothstep(0.58, 0.66, v01))
  const pearBase = pearProfile(style.pear * (isBird ? shape.belly : 1), style.shoulderTaper)
  const torsoProfile = chest > 0 ? (v01: number) => pearBase(v01) * (1 + 0.22 * chest * chestBump(v01)) : pearBase
  const torsoSdf = makeTorsoSdf(cy, ry, rx, rz, torsoProfile)

  const builder = new MeshBuilder()

  // Openings on the torso grid: neck (top pole), one block per limb root.
  const neckRing = ringForY(TORSO_VSEG, cy, ry, j.neck[1])
  const armRing = Math.min(ringForY(TORSO_VSEG, cy, ry, j.upperArmL[1]), neckRing - 2)
  // leg openings sit low on the torso (near the bottom pole) so the leg
  // capsule drops vertically under the body instead of slanting in from the
  // wide flank — the slant read as splayed "bent knees" on the fat chibi torso.
  // Bird (plan 017 r1): openings move to the UNDERSIDE proper — the tarsus is a
  // straight vertical stick under the egg, centered near x ≈ ±0.35·rx (the AC
  // wind-up-toy stance), so the ring drops to 2 and the azimuths pull inward.
  const legRing = isBird ? 2 : Math.max(ringForY(TORSO_VSEG, cy, ry, j.hips[1] - torsoH * 0.28), 2)
  const armColL = colForAzimuth(TRUNK_USEG, 1, 0.15)
  const armColR = colForAzimuth(TRUNK_USEG, -1, 0.15)
  // (bird cols are fixed mirrored indices, not colForAzimuth: the 3-col block's
  // vertex range [col-1, col+2] is off-center, so a naive mirror lands the two
  // openings half a column apart in azimuth — L cols 3..6 must pair with R
  // cols 26..29 for a symmetric stance)
  const legColL = isBird ? 4 : colForAzimuth(TRUNK_USEG, 1, 0.05)
  const legColR = isBird ? TRUNK_USEG - 5 : colForAzimuth(TRUNK_USEG, -1, 0.05)

  // plan 023: bird arms are separate wing PARTS (wings slot) — the bird torso
  // has NO welded arm openings; it closes smoothly over the shoulder.
  const torsoOpenings: Opening[] = [
    { kind: 'poleTop', ring: neckRing, loop: 'neck' },
    ...(isBird
      ? []
      : ([
          { kind: 'block', ringLo: armRing - 1, ringHi: armRing + 2, colStart: armColL - 1, colCount: 3, loop: 'armL' },
          { kind: 'block', ringLo: armRing - 1, ringHi: armRing + 2, colStart: armColR - 1, colCount: 3, loop: 'armR' },
        ] as Opening[])),
    { kind: 'block', ringLo: legRing - 1, ringHi: legRing - 1 + 3, colStart: legColL - 1, colCount: 3, loop: 'legL' },
    { kind: 'block', ringLo: legRing - 1, ringHi: legRing - 1 + 3, colStart: legColR - 1, colCount: 3, loop: 'legR' },
  ]

  const torsoGrid = unitSphere(TRUNK_USEG, TORSO_VSEG)
  ellipsoidTransform(torsoGrid, [0, cy, 0], [rx, ry, rz], torsoProfile)
  if (chest > 0) {
    // forward push on the upper-FRONT band only (the eagle barrel chest) —
    // displacement-only, topology untouched. Fades out well below the neck
    // ring so the head bridge is unaffected.
    for (let i = 0; i < torsoGrid.pos.length / 3; i++) {
      const v01 = torsoGrid.params[i * 2 + 1]
      const front = smoothstep(0, 0.7, torsoGrid.pos[i * 3 + 2] / rz)
      torsoGrid.pos[i * 3 + 2] += chest * rz * 0.3 * chestBump(v01) * front
    }
  }
  const torso = gridToPiece('torso', torsoGrid, torsoOpenings)
  torsoWeights(torso, j.hips[1], j.spine[1], j.chest[1])
  torsoChannels(torso, cy, ry, rx, archetype)
  paintUv(torso, 'torso', true)
  builder.add(torso)

  // head ellipsoid — bottom pole opened for the neck bridge ------------------
  const headGrid = unitSphere(TRUNK_USEG, HEAD_VSEG)
  const headScale = isBird ? shape.headSize : 1
  ellipsoidTransform(headGrid, headCenter, [headR * style.headWide * headScale, headR * style.headSquash * headScale, headR * headScale])
  // species neck (plan 023): raise the head mass and loft the head's lower
  // rings into a smooth pinched neck column. The bottom (bridge) ring stays
  // put so the torso bridge is untouched; displacement-only, topology intact
  // — the head→neck→body line reads as an S-curve, not snowman-stacked.
  const neckLift = isBird ? shape.neckLength * headR * headScale : 0
  if (neckLift > 0) {
    for (let i = 0; i < headGrid.pos.length / 3; i++) {
      const v01 = headGrid.params[i * 2 + 1] // 0 bottom pole → 1 top; bridge ring at 2/HEAD_VSEG ≈ 0.09
      headGrid.pos[i * 3 + 1] += neckLift * smoothstep(0.1, 0.42, v01)
      const band = smoothstep(0.08, 0.2, v01) * (1 - smoothstep(0.3, 0.5, v01))
      const pinch = 1 - 0.3 * Math.min(shape.neckLength, 1) * band
      headGrid.pos[i * 3] = (headGrid.pos[i * 3] - headCenter[0]) * pinch + headCenter[0]
      headGrid.pos[i * 3 + 2] = (headGrid.pos[i * 3 + 2] - headCenter[2]) * pinch + headCenter[2]
    }
  }
  const headCenterEff: Vec3 = [headCenter[0], headCenter[1] + neckLift, headCenter[2]]
  const headPiece = gridToPiece('head', headGrid, [{ kind: 'poleBottom', ring: 2, loop: 'neck' }])
  rigidWeight(headPiece, 'head')
  headChannels(headPiece, headCenterEff, headR, archetype)
  paintUv(headPiece, 'head', true)
  builder.add(headPiece)
  builder.bridge(builder.loopIndex.head.neck, builder.loopIndex.torso.neck)

  const armR = (style.armR * u) / 0.9
  const handR = (style.handR * u) / 0.9
  const legR = (style.legR * u) / 0.9
  const limbParams: Record<string, Float32Array> = {}

  // Attach point on the torso surface for a block loop (loop centroid).
  const blockCenter = (loop: string): Vec3 => {
    const idx = builder.loopIndex.torso[loop]
    const c: [number, number, number] = [0, 0, 0]
    for (const gi of idx) {
      c[0] += builder.positionAt(gi)[0]
      c[1] += builder.positionAt(gi)[1]
      c[2] += builder.positionAt(gi)[2]
    }
    return [c[0] / idx.length, c[1] / idx.length, c[2] / idx.length]
  }

  // mammal-only (plan 023: bird wings are separate parts — no welded limb)
  const buildArm = (side: 'L' | 'R'): void => {
    const name = `arm${side}` as const
    const root = blockCenter(name)
    const hand = side === 'L' ? V(j.handL) : V(j.handR)
    // plush arm: near-constant width, soft mitten end ------------------------
    // fillet reach stays well under the root→hand span — an oversized reach
    // on a short chibi arm re-projects most of the capsule onto the torso
    // surface and crumples it into a faceted slab
    const armSpan = Math.hypot(hand[0] - root[0], hand[1] - root[1], hand[2] - root[2])
    const grid = capsuleGrid({ a: root, b: hand, radiusA: armR * 1.15, radiusB: armR * 0.95, useg: LIMB_USEG, vseg: LIMB_VSEG, fullness: 0.55 })
    filletLimbIntoTorso(grid.pos, root, hand, armR * 1.15, armR * 0.95, torsoSdf, Math.min(0.055 * u, armSpan * 0.28))
    const arm = gridToPiece(name, grid, [
      { kind: 'poleBottom', ring: 1, loop: 'root' },
      { kind: 'poleTop', ring: LIMB_VSEG - 1, loop: 'wrist' },
    ])
    chainWeights(arm, [`upperArm${side}`, `foreArm${side}`], [0.5], 0.18)
    paintUv(arm, side === 'L' ? 'armL' : 'armR', false)
    limbParams[name] = limbParamArray(arm)
    builder.add(arm)
    builder.bridge(builder.loopIndex.torso[name], builder.loopIndex[name].root)

    // mitten hand — short fat capsule, a-pole at the wrist for a clean bridge
    const wristOut = vec.norm(vec.sub(hand, root))
    const handTip: Vec3 = [hand[0] + wristOut[0] * handR * 1.4, hand[1] + wristOut[1] * handR * 1.4, hand[2] + wristOut[2] * handR * 1.4]
    const handGrid = capsuleGrid({ a: hand, b: handTip, radiusA: handR * 0.95, radiusB: handR * 0.85, useg: LIMB_USEG, vseg: 9, fullness: 0.7 })
    const handName = `hand${side}` as const
    const handPiece = gridToPiece(handName, handGrid, [{ kind: 'poleBottom', ring: 1, loop: 'wrist' }])
    rigidWeight(handPiece, handName)
    // mitten paws stay body-colored (chibi benchmark: no dark gloves)
    paintUv(handPiece, side === 'L' ? 'handL' : 'handR', false)
    builder.add(handPiece)
    builder.bridge(builder.loopIndex[name].wrist, builder.loopIndex[handName].wrist)
  }

  const buildLeg = (side: 'L' | 'R'): void => {
    const name = `leg${side}` as const
    const root = blockCenter(name)
    const footJoint = side === 'L' ? V(j.footL) : V(j.footR)
    // bird: tarsusLength stretches the exposed drop below the body hem
    const legEndY = footJoint[1] * (isBird ? 0.7 - 0.25 * (shape.tarsusLength - 1) : 0.7)
    // bird (plan 017 r1): the exposed column is VERTICAL — legEnd shares the
    // block-opening centroid's x/z so the tarsus drops plumb from the
    // underside (no slant toward the skeleton's foot-joint x). Bones are
    // untouched; only the skinned geometry deviates from the foot-joint x.
    const legEnd: Vec3 = isBird ? [root[0], legEndY, root[2]] : [footJoint[0], legEndY, footJoint[2]]
    const legSpan = Math.hypot(legEnd[0] - root[0], legEnd[1] - root[1], legEnd[2] - root[2])
    const grid = capsuleGrid({ a: root, b: legEnd, radiusA: legR, radiusB: legR * 0.85, useg: LIMB_USEG, vseg: LIMB_VSEG, fullness: 0.55 })
    if (isBird) {
      // bare tarsus (plan 017): root ring keeps legR to mate with the torso
      // opening; the shaft pinches to a thin stick by mid-length. Radial
      // scale only — params/topology untouched.
      const tarsusR = (shape.tarsusRadius * u) / 0.9
      const axis = vec.norm(vec.sub(legEnd, root))
      for (let i = 0; i < grid.pos.length / 3; i++) {
        const pinch = 1 + (tarsusR / legR - 1) * smoothstep(0.3, 0.55, grid.params[i * 2 + 1])
        const rel: Vec3 = [grid.pos[i * 3] - root[0], grid.pos[i * 3 + 1] - root[1], grid.pos[i * 3 + 2] - root[2]]
        const along = vec.dot(rel, axis)
        const radial = vec.sub(rel, vec.scale(axis, along))
        grid.pos[i * 3] = root[0] + axis[0] * along + radial[0] * pinch
        grid.pos[i * 3 + 1] = root[1] + axis[1] * along + radial[1] * pinch
        grid.pos[i * 3 + 2] = root[2] + axis[2] * along + radial[2] * pinch
      }
    }
    filletLimbIntoTorso(grid.pos, root, legEnd, legR, legR * 0.85, torsoSdf, Math.min(0.05 * u, legSpan * 0.28))
    const leg = gridToPiece(name, grid, [
      { kind: 'poleBottom', ring: 1, loop: 'root' },
      { kind: 'poleTop', ring: LIMB_VSEG - 1, loop: 'ankle' },
    ])
    chainWeights(leg, [`upperLeg${side}`, `lowerLeg${side}`], [0.5], 0.16)
    // AC birds: the bare tarsus takes the beak/feet accent color; the
    // feathered thigh stub stays body-colored
    if (isBird) setChannel(leg, CH_ACCENT, (i) => smoothstep(0.38, 0.55, leg.params[i * 2 + 1]))
    paintUv(leg, side === 'L' ? 'legL' : 'legR', false)
    limbParams[name] = limbParamArray(leg)
    builder.add(leg)
    builder.bridge(builder.loopIndex.torso[name], builder.loopIndex[name].root)

    // foot — short capsule forward+down from the ankle, a-pole at the ankle
    const [fx, fy, fz] = style.foot
    const fzS = (fz * u) / 0.9
    const fyS = (fy * u) / 0.9
    const fxS = (fx * u) / 0.9
    const drop = legEndY - footJoint[1] * 0.7 // 0 unless bird tarsusLength ≠ 1
    // bird: ankle + foot anchor directly below the leg root (same x/z); toes
    // displace forward (+z) only — feet point straight ahead, wind-up-toy style
    const anchorX = isBird ? root[0] : footJoint[0]
    const anchorZ = isBird ? root[2] : footJoint[2]
    // plant the bird sole ON the ground plane (plan 023): the flattened sole
    // sits at ankle.y − fyS; drop the whole foot so that lands at y ≈ 0.002.
    // The leg→foot bridge strip covers the gap and reads as the ankle taper
    // (tarsusLength keeps steering the exposed leg via legEnd).
    const soleDrop = isBird ? footJoint[1] * 0.55 + drop - fyS - 0.002 : 0
    const ankle: Vec3 = [anchorX, footJoint[1] * 0.55 + drop - soleDrop, anchorZ]
    const toeLen = isBird ? fzS * 1.45 * shape.footLength : fzS * 1.5
    const toe: Vec3 = [anchorX, footJoint[1] * 0.4 + drop - soleDrop, anchorZ + toeLen]
    const footGrid = capsuleGrid({ a: ankle, b: toe, radiusA: fyS, radiusB: fyS * 0.72, useg: LIMB_USEG, vseg: 9, fullness: 0.65 })
    if (isBird) {
      // AC toe-fan (plan 017, toe rework plan 023): flat wedge widening toward
      // the front, front edge split into 3 SPREAD toes by deep notches
      // (toeCut 0 = webbed duck triangle), domed top so the toes read from a
      // 30° camera, plus an optional hind-toe bump. Positional passes only.
      const soleY = ankle[1] - fyS
      for (let i = 0; i < footGrid.pos.length / 3; i++) {
        const u01 = footGrid.params[i * 2]
        const v01 = footGrid.params[i * 2 + 1]
        // domed top: tall at the ankle, thinning toward the toe tips so the
        // toe tops stay visible from above; sole stays flat at soleY
        const flatten = 0.8 - 0.3 * v01
        footGrid.pos[i * 3 + 1] = (footGrid.pos[i * 3 + 1] - soleY) * flatten + soleY
        const widen = (fxS / Math.max(fyS, 1e-9)) * (0.7 + 1.15 * v01)
        footGrid.pos[i * 3] = (footGrid.pos[i * 3] - anchorX) * widen + anchorX
        // toe lobes: sin(az) IS the x-direction factor of the radial basis,
        // so lobes keyed on it stay x-symmetric top and bottom
        const sinAz = Math.sin(2 * Math.PI * u01)
        const cosAz = Math.cos(2 * Math.PI * u01)
        const frontZone = smoothstep(0.55, 1.0, v01)
        const scallop = Math.abs(Math.sin((sinAz * 0.5 + 0.5) * 3 * Math.PI))
        const cut = (1 - scallop) * shape.toeCut
        // deep notches (≥55% of the toe reach at toeCut 0.7+) + longer toes
        footGrid.pos[i * 3 + 2] += frontZone * (0.55 * fzS * (1 - cut) - 0.62 * fzS * cut)
        // spread: outer toes angle outward ~25°; scales with toeCut so the
        // duckling's webbed triangle stays webbed
        footGrid.pos[i * 3] += frontZone * sinAz * fzS * 0.7 * shape.toeCut
        // groove the top along the notch lines so the three toes read as
        // distinct nubs from the default (slightly high) camera, not only in
        // the front-edge silhouette
        footGrid.pos[i * 3 + 1] = soleY + (footGrid.pos[i * 3 + 1] - soleY) * (1 - 0.85 * frontZone * cut)
        if (shape.hindToe) {
          // rear bump on the down-facing heel zone
          const heel = smoothstep(0.25, 0.08, v01) * smoothstep(-0.3, -0.85, cosAz)
          footGrid.pos[i * 3 + 2] -= fzS * 0.35 * heel
        }
      }
    } else {
      // widen across X to the foot's x-radius (fx), keep it flat-ish
      for (let i = 0; i < footGrid.pos.length / 3; i++) {
        footGrid.pos[i * 3] = (footGrid.pos[i * 3] - footJoint[0]) * (fxS / Math.max(fyS, 1e-9)) + footJoint[0]
      }
    }
    const footName = `foot${side}` as const
    const foot = gridToPiece(footName, footGrid, [{ kind: 'poleBottom', ring: 1, loop: 'ankle' }])
    footWeights(foot, footName, `toes${side}`, ankle[2], fzS)
    if (isBird) accentAll(foot, 1) // feet share the beak accent color
    paintUv(foot, side === 'L' ? 'footL' : 'footR', false)
    builder.add(foot)
    builder.bridge(builder.loopIndex[name].ankle, builder.loopIndex[footName].ankle)
  }

  if (!isBird) {
    buildArm('L')
    buildArm('R')
  }
  buildLeg('L')
  buildLeg('R')

  const mesh = builder.build()
  // Audit the PRE-SPLIT topology: the UV wrap-seam split (splitWrapSeam)
  // deliberately cuts the index buffer along seam columns, so the render
  // indices carry boundary edges there by design. weldedIndices remaps the
  // duplicates back to their sources — the gate stays 0/0/1, meaningfully.
  const manifold = manifoldReport(mesh.weldedIndices)

  // --- morph targets (bodies.py body_shape_keys, numeric) -------------------
  const morphs = buildMorphs(mesh, { cy, ry, rx }, headCenterEff, u)

  // --- region partition (weld.welded_region_ids rule) ----------------------
  const regionOfTri = classifyRegions(mesh, j.spine[1], j.lowerLegL[1])

  // --- assemble THREE scene -------------------------------------------------
  const skin = packSkinning(mesh, (b) => (BONE_NAMES as readonly string[]).indexOf(b as BoneName))
  const scene = assembleScene(archetype, built, mesh, skin, morphs, regionOfTri)

  return {
    scene,
    channels: mesh.channels,
    meta: {
      torso: { cy, ry, rx, rz },
      headCenter: [headCenterEff[0], headCenterEff[1], headCenterEff[2]],
      headRadius: headR,
      shellRanges: mesh.ranges,
      limbParams,
    },
    triangleCount: mesh.indices.length / 3,
    manifold: { boundaryEdges: manifold.boundaryEdges, overSharedEdges: manifold.overSharedEdges, components: manifold.components },
  }
}

// --- morphs -------------------------------------------------------------------

interface MorphSet {
  names: readonly string[]
  deltas: Float32Array[] // one n×3 per name
}

function buildMorphs(
  mesh: ReturnType<MeshBuilder['build']>,
  torso: { cy: number; ry: number; rx: number },
  headCenter: Vec3,
  u: number,
): MorphSet {
  const n = mesh.vertexCount
  const deltas = BODY_MORPHS.map(() => new Float32Array(n * 3))
  const idx = (name: string): number => BODY_MORPHS.indexOf(name as (typeof BODY_MORPHS)[number])
  const pos = mesh.positions
  const pieceOf = (i: number): string => {
    for (const [name, [s, e]] of Object.entries(mesh.ranges)) if (i >= s && i < e) return name
    return ''
  }
  // per-piece centroids (limbs) for the radial chubby/slim morphs
  const centroids: Record<string, [number, number, number]> = {}
  const counts: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const name = pieceOf(i)
    ;(centroids[name] ??= [0, 0, 0])[0] += pos[i * 3]
    centroids[name][1] += pos[i * 3 + 1]
    centroids[name][2] += pos[i * 3 + 2]
    counts[name] = (counts[name] ?? 0) + 1
  }
  for (const name of Object.keys(centroids)) {
    centroids[name][0] /= counts[name]
    centroids[name][1] /= counts[name]
    centroids[name][2] /= counts[name]
  }

  const set = (m: number, i: number, dx: number, dy: number, dz: number): void => {
    deltas[m][i * 3] = dx
    deltas[m][i * 3 + 1] = dy
    deltas[m][i * 3 + 2] = dz
  }

  const LIMBS = new Set(['armL', 'armR', 'legL', 'legR', 'handL', 'handR', 'footL', 'footR'])
  for (let i = 0; i < n; i++) {
    const name = pieceOf(i)
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    if (name === 'torso') {
      const du = x / (torso.rx * 1.1)
      const dv = (y - (torso.cy - torso.ry * 0.18)) / (torso.ry * 0.7)
      const w = (1 - smoothstep(0.4, 1, Math.hypot(du, dv))) * smoothstep(-0.1, 0.5, z / torso.rx)
      // radial = horizontal unit direction from the y-axis
      const rl = Math.hypot(x, z) || 1e-9
      const rux = x / rl
      const ruz = z / rl
      set(idx('bellyRound'), i, rux * w * 0.075 * u, 0, ruz * w * 0.075 * u + w * 0.02 * u)
      set(idx('chubby'), i, rux * 0.05 * u, 0, ruz * 0.05 * u)
      set(idx('slim'), i, rux * -0.038 * u, 0, ruz * -0.038 * u)
    } else if (LIMBS.has(name)) {
      const c = centroids[name]
      const dx = x - c[0]
      const dy = y - c[1]
      const dz = z - c[2]
      set(idx('chubby'), i, dx * 0.1, dy * 0.1, dz * 0.1)
      set(idx('slim'), i, dx * -0.08, dy * -0.08, dz * -0.08)
    } else if (name === 'head') {
      const dx = x - headCenter[0]
      const dy = y - headCenter[1]
      const dz = z - headCenter[2]
      set(idx('headBig'), i, dx * 0.13, dy * 0.13, dz * 0.13)
      set(idx('headSmall'), i, dx * -0.11, dy * -0.11, dz * -0.11)
      set(idx('chubby'), i, dx * 0.02, dy * 0.02, dz * 0.02)
    }
  }
  return { names: BODY_MORPHS, deltas }
}

// --- region partition ---------------------------------------------------------

type BodyRegion = 'main' | 'torso' | 'hips' | 'upperLegs'

/** Per-triangle hide-region id (weld.welded_region_ids rule, piece-based). */
function classifyRegions(mesh: ReturnType<MeshBuilder['build']>, spineY: number, kneeY: number): BodyRegion[] {
  const idx = mesh.indices
  const pos = mesh.positions
  const ranges = Object.entries(mesh.ranges)
  const pieceOf = (i: number): string => {
    for (const [name, [s, e]] of ranges) if (i >= s && i < e) return name
    return ''
  }
  const out: BodyRegion[] = []
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]
    const b = idx[t + 1]
    const c = idx[t + 2]
    // dominant piece = majority of the triangle's three verts
    const votes: Record<string, number> = {}
    for (const gi of [a, b, c]) {
      const p = pieceOf(gi)
      votes[p] = (votes[p] ?? 0) + 1
    }
    let piece = ''
    let best = 0
    for (const [p, v2] of Object.entries(votes)) if (v2 > best) { best = v2; piece = p }
    const cyTri = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
    if (piece === 'torso') out.push(cyTri >= spineY ? 'torso' : 'hips')
    else if (piece === 'legL' || piece === 'legR') out.push(cyTri >= kneeY ? 'upperLegs' : 'main')
    else out.push('main')
  }
  return out
}

// --- scene assembly -----------------------------------------------------------

function assembleScene(
  archetype: Archetype,
  built: BuiltSkeleton,
  mesh: ReturnType<MeshBuilder['build']>,
  skin: { skinIndex: Uint16Array; skinWeight: Float32Array },
  morphs: MorphSet,
  regionOfTri: BodyRegion[],
): THREE.Object3D {
  // Shared attributes (one copy, referenced by all region geometries).
  const positionAttr = new THREE.BufferAttribute(mesh.positions, 3)
  const uvAttr = new THREE.BufferAttribute(mesh.uvs, 2)
  const channelsAttr = new THREE.BufferAttribute(mesh.channels, 4)
  const skinIndexAttr = new THREE.BufferAttribute(skin.skinIndex, 4)
  const skinWeightAttr = new THREE.BufferAttribute(skin.skinWeight, 4)
  // compute shared vertex normals from the full welded mesh
  const normalSource = new THREE.BufferGeometry()
  normalSource.setAttribute('position', positionAttr)
  normalSource.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
  normalSource.computeVertexNormals()
  const normalAttr = normalSource.getAttribute('normal') as THREE.BufferAttribute
  // Weld-average normals across the UV wrap-seam duplicates: computeVertexNormals
  // sees the seam as a cut and gives each side a one-sided normal — a lighting
  // crease down the seam column. Summing each weld group's normals restores the
  // exact welded-topology normal (same incident-face sum) on every copy.
  {
    const nrm = normalAttr.array as Float32Array
    const weldSrc = new Map(mesh.weldPairs.map(([dup, src]) => [dup, src]))
    const root = (i: number): number => {
      let r = i
      while (weldSrc.has(r)) r = weldSrc.get(r) as number
      return r
    }
    const groups = new Map<number, number[]>()
    for (const [dup] of mesh.weldPairs) {
      const r = root(dup)
      let g = groups.get(r)
      if (!g) {
        g = [r]
        groups.set(r, g)
      }
      g.push(dup)
    }
    for (const g of groups.values()) {
      let x = 0
      let y = 0
      let z = 0
      for (const i of g) {
        x += nrm[i * 3]
        y += nrm[i * 3 + 1]
        z += nrm[i * 3 + 2]
      }
      const l = Math.hypot(x, y, z) || 1e-9
      x /= l
      y /= l
      z /= l
      for (const i of g) {
        nrm[i * 3] = x
        nrm[i * 3 + 1] = y
        nrm[i * 3 + 2] = z
      }
    }
  }
  const morphAttrs = morphs.deltas.map((d, i) => {
    const a = new THREE.BufferAttribute(d, 3)
    a.name = morphs.names[i]
    return a
  })

  // partition indices by region
  const byRegion: Record<BodyRegion, number[]> = { main: [], torso: [], hips: [], upperLegs: [] }
  for (let t = 0; t < regionOfTri.length; t++) {
    const region = regionOfTri[t]
    byRegion[region].push(mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2])
  }

  const makeMesh = (region: BodyRegion, name: string): THREE.SkinnedMesh | null => {
    const indices = byRegion[region]
    if (indices.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', positionAttr)
    geo.setAttribute('normal', normalAttr)
    geo.setAttribute('uv', uvAttr)
    geo.setAttribute('skinIndex', skinIndexAttr)
    geo.setAttribute('skinWeight', skinWeightAttr)
    geo.setAttribute('paletteChannels', channelsAttr)
    geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1))
    geo.morphAttributes.position = morphAttrs
    geo.morphTargetsRelative = true
    geo.userData.targetNames = [...morphs.names]
    const skm = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial())
    skm.name = name
    skm.bind(built.skeleton, new THREE.Matrix4())
    skm.frustumCulled = false
    if (region !== 'main') skm.userData.bodyRegion = region
    return skm
  }

  const scene = new THREE.Group()
  scene.name = `body-${archetype}`
  scene.add(built.bones[0]) // the root Bone hierarchy (all 38 bones)
  for (const [region, name] of [
    ['main', 'body'],
    ['torso', 'body_torso'],
    ['hips', 'body_hips'],
    ['upperLegs', 'body_upperLegs'],
  ] as const) {
    const m = makeMesh(region, name)
    if (m) scene.add(m)
  }
  return scene
}
