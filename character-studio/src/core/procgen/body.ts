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
import { accentAll, headChannels, torsoChannels } from './kit/channels'
import { filletLimbIntoTorso, makeTorsoSdf } from './kit/fillet'
import { capsuleGrid, chainCapsuleGrid } from './kit/loft'
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
import { type IslandName, UV_ATLAS, islandUv } from './kit/uv'
import { chainWeights, footWeights, rigidWeight, torsoWeights } from './kit/weights'

// --- per-archetype style knobs (started as bodies.py STYLE; biped-slim
// remodeled 2026-07-08 toward the chibi toy-render benchmark) ------------------

interface Style {
  torsoRx: number
  torsoRz: number
  pear: number
  shoulderTaper: number
  /** Torso ellipsoid overshoot below the hips joint (× torso height). */
  torsoBottomOvershoot: number
  /** Torso ellipsoid overshoot above the neck joint (× torso height) — small
   * on the bird so a chin/neck line reads instead of swallowing the head. */
  torsoTopOvershoot: number
  armR: number
  handR: number
  legR: number
  foot: readonly [number, number, number]
  headSquash: number
  headWide: number
  wing: boolean
}

const STYLE: Record<Archetype, Style> = {
  'biped-round': { torsoRx: 0.8, torsoRz: 0.64, pear: 0.32, shoulderTaper: 0.18, torsoBottomOvershoot: 0.42, torsoTopOvershoot: 0.55, armR: 0.046, handR: 0.052, legR: 0.064, foot: [0.06, 0.042, 0.096], headSquash: 0.95, headWide: 1.05, wing: false },
  'biped-slim': { torsoRx: 0.8, torsoRz: 0.7, pear: 0.3, shoulderTaper: 0.22, torsoBottomOvershoot: 0.42, torsoTopOvershoot: 0.55, armR: 0.042, handR: 0.048, legR: 0.06, foot: [0.058, 0.042, 0.088], headSquash: 0.95, headWide: 1.06, wing: false },
  // Bird (AC villager remodel 2026-07-09): egg torso narrower than the head
  // but clearly PRESENT (max width incl. the pear bulge ~0.88·headR), lifted
  // off the legs (small bottom overshoot → visible stick legs), small top
  // overshoot so the head sits ON the body with a chin tuck.
  bird: { torsoRx: 0.68, torsoRz: 0.7, pear: 0.3, shoulderTaper: 0.14, torsoBottomOvershoot: 0.3, torsoTopOvershoot: 0.33, armR: 0.055, handR: 0, legR: 0.05, foot: [0.06, 0.046, 0.13], headSquash: 1.02, headWide: 1, wing: true },
}

// Trunk shells (head + torso) share this azimuth resolution so their neck rings
// bridge one-to-one. The face is drawn in the head's UVs (a texture), so the
// head's geometric azimuth resolution is not a fidelity constraint.
const TRUNK_USEG = 32
const HEAD_VSEG = 22
const TORSO_VSEG = 18
const LIMB_USEG = 12
const LIMB_VSEG = 10
const WING_USEG = 14
const WING_VSEG = 12

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

/** Paint an island's UVs onto a piece from its (azimuth u01, polar v01) params. */
function paintUv(piece: SurfacePiece, island: IslandName, frontCenter: boolean): void {
  const rect = UV_ATLAS[island]
  const n = vertexCount(piece)
  for (let i = 0; i < n; i++) {
    const [uu, vv] = islandUv(rect, piece.params[i * 2], piece.params[i * 2 + 1], frontCenter)
    piece.uv[i * 2] = uu
    piece.uv[i * 2 + 1] = vv
  }
}

/**
 * Polyline for a chain-lofted limb: root (torso block-center) → arm joints →
 * end. Interior waypoints that fail to ADVANCE along the root→end chord are
 * dropped (on stubby chibi arms the upperArm joint is buried behind the
 * torso-surface root; keeping it would fold the polyline back on itself and
 * reverse the loft frames). Returns the kept points plus each keyed joint's
 * cumulative-arclength param t∈[0,1] — the exact splits `chainWeights` needs
 * for the loft to bend at that joint (dropped joints fall back to their chord
 * projection).
 */
function limbPolyline(
  root: Vec3,
  joints: Array<{ p: Vec3; key?: string }>,
  end: Vec3,
): { points: Vec3[]; params: number[]; length: number; tOf: Record<string, number> } {
  const chord = vec.norm(vec.sub(end, root))
  const endAlong = vec.dot(vec.sub(end, root), chord)
  const kept: Array<{ p: Vec3; key?: string }> = [{ p: root }]
  let prev = 0
  for (const jp of joints) {
    const along = vec.dot(vec.sub(jp.p, root), chord)
    if (along > prev + 1e-4 && along < endAlong - 1e-4) {
      kept.push(jp)
      prev = along
    }
  }
  kept.push({ p: end })
  const cum = [0]
  for (let i = 1; i < kept.length; i++) cum.push(cum[i - 1] + vec.len(vec.sub(kept[i].p, kept[i - 1].p)))
  const length = cum[cum.length - 1] || 1e-9
  const tOf: Record<string, number> = {}
  for (const jp of joints) {
    if (!jp.key) continue
    const ki = kept.indexOf(jp)
    tOf[jp.key] =
      ki >= 0
        ? cum[ki] / length
        : Math.min(Math.max(vec.dot(vec.sub(jp.p, root), chord) / length, 0), 1)
  }
  return { points: kept.map((k) => k.p), params: cum.map((c) => c / length), length, tOf }
}

/** Copy a limb loft's along-chain param (polar v01) into a per-vertex array. */
function limbParamArray(piece: SurfacePiece): Float32Array {
  const n = vertexCount(piece)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = piece.params[i * 2 + 1]
  return out
}

// --- builder ------------------------------------------------------------------

export function buildProceduralBody(archetype: Archetype): ProcBodyData {
  const built: BuiltSkeleton = buildSkeleton(archetypeBuildOptions(archetype))
  const j = restWorldPositions(built)
  const u = ARCHETYPES_DEF[archetype].uniformScale
  const head = archetypeHead(archetype)
  const headCenter: Vec3 = [j.head[0] + head.center[0], j.head[1] + head.center[1], j.head[2] + head.center[2]]
  const headR = head.radius
  const style = STYLE[archetype]

  // torso ellipsoid params (bodies.py; overshoots are STYLE knobs) -----------
  const torsoH = j.neck[1] - j.hips[1]
  const torsoBottom = j.hips[1] - torsoH * style.torsoBottomOvershoot
  const torsoTop = j.neck[1] + torsoH * style.torsoTopOvershoot
  const cy = (torsoBottom + torsoTop) / 2
  const ry = (torsoTop - torsoBottom) / 2
  const rx = headR * style.torsoRx
  const rz = headR * style.torsoRz
  const torsoProfile = pearProfile(style.pear, style.shoulderTaper)
  const torsoSdf = makeTorsoSdf(cy, ry, rx, rz, torsoProfile)

  const builder = new MeshBuilder()

  // Openings on the torso grid: neck (top pole), one block per limb root.
  // Guards: the neck ring stays ≥2 rings below the pole (a real bridge band
  // survives above it) and the arm ring ≥2 rings below the neck ring.
  const neckRing = Math.min(ringForY(TORSO_VSEG, cy, ry, j.neck[1]), TORSO_VSEG - 2)
  const armRing = Math.min(ringForY(TORSO_VSEG, cy, ry, j.upperArmL[1]), neckRing - 2)
  // leg openings sit low on the torso (near the bottom pole) so the leg
  // capsule drops vertically under the body instead of slanting in from the
  // wide flank — the slant read as splayed "bent knees" on the fat chibi torso
  const legRing = Math.max(ringForY(TORSO_VSEG, cy, ry, j.hips[1] - torsoH * 0.28), 2)
  const armColL = colForAzimuth(TRUNK_USEG, 1, 0.15)
  const armColR = colForAzimuth(TRUNK_USEG, -1, 0.15)
  const legColL = colForAzimuth(TRUNK_USEG, 1, 0.05)
  const legColR = colForAzimuth(TRUNK_USEG, -1, 0.05)

  const wing = style.wing
  const limbCols = wing ? 4 : 3 // block colCount → perimeter = 2·cols + 2·rings
  const limbRings = wing ? 3 : 3 // arm/leg perimeter 12 (LIMB_USEG) or wing 14 (WING_USEG)

  const torsoOpenings: Opening[] = [
    { kind: 'poleTop', ring: neckRing, loop: 'neck' },
    { kind: 'block', ringLo: armRing - Math.floor(limbRings / 2), ringHi: armRing - Math.floor(limbRings / 2) + limbRings, colStart: armColL - Math.floor(limbCols / 2), colCount: limbCols, loop: 'armL' },
    { kind: 'block', ringLo: armRing - Math.floor(limbRings / 2), ringHi: armRing - Math.floor(limbRings / 2) + limbRings, colStart: armColR - Math.floor(limbCols / 2), colCount: limbCols, loop: 'armR' },
    { kind: 'block', ringLo: legRing - 1, ringHi: legRing - 1 + 3, colStart: legColL - 1, colCount: 3, loop: 'legL' },
    { kind: 'block', ringLo: legRing - 1, ringHi: legRing - 1 + 3, colStart: legColR - 1, colCount: 3, loop: 'legR' },
  ]

  const torsoGrid = unitSphere(TRUNK_USEG, TORSO_VSEG)
  ellipsoidTransform(torsoGrid, [0, cy, 0], [rx, ry, rz], torsoProfile)
  const torso = gridToPiece('torso', torsoGrid, torsoOpenings)
  torsoWeights(torso, j.hips[1], j.spine[1], j.chest[1])
  torsoChannels(torso, cy, ry, rx, archetype)
  paintUv(torso, 'torso', true)
  builder.add(torso)

  // head ellipsoid — bottom pole opened for the neck bridge ------------------
  const headGrid = unitSphere(TRUNK_USEG, HEAD_VSEG)
  ellipsoidTransform(headGrid, headCenter, [headR * style.headWide, headR * style.headSquash, headR])
  const headPiece = gridToPiece('head', headGrid, [{ kind: 'poleBottom', ring: 2, loop: 'neck' }])
  rigidWeight(headPiece, 'head')
  headChannels(headPiece, headCenter, headR, archetype)
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

  const buildArmOrWing = (side: 'L' | 'R'): void => {
    const name = `arm${side}` as const
    const root = blockCenter(name)
    const upperArm = side === 'L' ? V(j.upperArmL) : V(j.upperArmR)
    const foreArm = side === 'L' ? V(j.foreArmL) : V(j.foreArmR)
    const hand = side === 'L' ? V(j.handL) : V(j.handR)
    if (wing) {
      // hanging wing-arm (AC bird villager): a long, flat, tapered feather-arm
      // draped down the flank — a multi-segment loft chained through the arm
      // joints (root → upperArm → foreArm → hand → tip) so the mesh
      // articulates at the elbow and wrist; plump at the shoulder, tapering to
      // a pointy feather tip that reaches roughly hip height.
      // The whole chain lives in the FLANK plane (z clamped to the shoulder z):
      // any forward drift in the arm joints would curl the loft around the
      // belly instead of hanging at the side.
      // slight forward bias: at exactly the widest flank plane half the wing
      // hides behind the torso from the front — AC wings drape a touch forward
      const flankZ = upperArm[2] + 0.02 * u
      const rootF: Vec3 = [root[0], root[1], flankZ]
      const upperArmF: Vec3 = [upperArm[0], upperArm[1], flankZ]
      const foreArmF: Vec3 = [foreArm[0], foreArm[1], flankZ]
      const handF: Vec3 = [hand[0], hand[1], flankZ]
      // feather tip extends past the hand along the (horizontal) chain line
      const tipDir = vec.norm([(hand[0] - foreArm[0]) * 0.35, hand[1] - foreArm[1], 0])
      const tip: Vec3 = [handF[0] + tipDir[0] * 0.07 * u, handF[1] + tipDir[1] * 0.07 * u, flankZ]
      const chain = limbPolyline(rootF, [{ p: upperArmF }, { p: foreArmF, key: 'elbow' }, { p: handF, key: 'wrist' }], tip)
      const wingSpan = chain.length
      // thin tapered feather-BLADE (T-pose): the AC catalogue wing is a long
      // flat plank thinning to a sharp horizontal point, not a plump paddle
      const radii = chain.params.map((t) => armR * 1.05 + (armR * 0.18 - armR * 1.05) * t)
      const grid = chainCapsuleGrid({ points: chain.points, radii, useg: WING_USEG, vseg: WING_VSEG, fullness: 0.45 })
      // strong z-flatten about the shoulder z — a blade, not a paddle
      for (let i = 0; i < grid.pos.length / 3; i++) {
        grid.pos[i * 3 + 2] = (grid.pos[i * 3 + 2] - upperArm[2]) * 0.42 + upperArm[2]
      }
      // short fillet reach: blend ONLY the shoulder root — a longer reach
      // re-projects the hanging wing onto the flank and flattens it into the
      // torso surface (reads as a dent, not a wing)
      filletLimbIntoTorso(grid.pos, rootF, tip, armR * 1.05 * 0.5, armR * 0.18 * 0.5, torsoSdf, Math.min(0.035 * u, wingSpan * 0.16))
      const piece = gridToPiece(name, grid, [{ kind: 'poleBottom', ring: 1, loop: 'root' }])
      // splits at the ACTUAL arclength params of the foreArm/hand waypoints,
      // so bone rotations bend the loft exactly at its geometric joints
      chainWeights(piece, [`upperArm${side}`, `foreArm${side}`, `hand${side}`], [chain.tOf.elbow, chain.tOf.wrist], 0.16)
      // crisp full-strength accent band at the wing tip (AC-style flat region)
      for (let i = 0; i < vertexCount(piece); i++) piece.channels[i * 4 + 3] = smoothstep(0.78, 0.86, piece.params[i * 2 + 1])
      paintUv(piece, side === 'L' ? 'armL' : 'armR', false)
      limbParams[name] = limbParamArray(piece)
      builder.add(piece)
      builder.bridge(builder.loopIndex.torso[name], builder.loopIndex[name].root)
      return
    }
    // plush arm: near-constant width chained through upperArm → foreArm →
    // hand (elbow articulation), soft mitten end -----------------------------
    // fillet reach stays well under the root→hand span — an oversized reach
    // on a short chibi arm re-projects most of the capsule onto the torso
    // surface and crumples it into a faceted slab
    const chain = limbPolyline(root, [{ p: upperArm }, { p: foreArm, key: 'elbow' }], hand)
    const armSpan = chain.length
    const radii = chain.params.map((t) => armR * 1.15 + (armR * 0.95 - armR * 1.15) * t)
    const grid = chainCapsuleGrid({ points: chain.points, radii, useg: LIMB_USEG, vseg: LIMB_VSEG, fullness: 0.55 })
    filletLimbIntoTorso(grid.pos, root, hand, armR * 1.15, armR * 0.95, torsoSdf, Math.min(0.055 * u, armSpan * 0.28))
    const arm = gridToPiece(name, grid, [
      { kind: 'poleBottom', ring: 1, loop: 'root' },
      { kind: 'poleTop', ring: LIMB_VSEG - 1, loop: 'wrist' },
    ])
    chainWeights(arm, [`upperArm${side}`, `foreArm${side}`], [chain.tOf.elbow], 0.18)
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
    const legEnd: Vec3 = [footJoint[0], footJoint[1] * 0.7, footJoint[2]]
    const legSpan = Math.hypot(legEnd[0] - root[0], legEnd[1] - root[1], legEnd[2] - root[2])
    const grid = capsuleGrid({ a: root, b: legEnd, radiusA: legR, radiusB: legR * 0.85, useg: LIMB_USEG, vseg: LIMB_VSEG, fullness: 0.55 })
    filletLimbIntoTorso(grid.pos, root, legEnd, legR, legR * 0.85, torsoSdf, Math.min(0.05 * u, legSpan * 0.28))
    const leg = gridToPiece(name, grid, [
      { kind: 'poleBottom', ring: 1, loop: 'root' },
      { kind: 'poleTop', ring: LIMB_VSEG - 1, loop: 'ankle' },
    ])
    chainWeights(leg, [`upperLeg${side}`, `lowerLeg${side}`], [0.5], 0.16)
    // bird legs are accent-colored (match the beak/feet, AC-style) below the
    // body — fade in past the fillet so the accent doesn't bleed onto the torso
    if (wing) setChannel(leg, 3, (i) => smoothstep(0.3, 0.5, leg.params[i * 2 + 1]))
    paintUv(leg, side === 'L' ? 'legL' : 'legR', false)
    limbParams[name] = limbParamArray(leg)
    builder.add(leg)
    builder.bridge(builder.loopIndex.torso[name], builder.loopIndex[name].root)

    // foot — short capsule forward+down from the ankle, a-pole at the ankle
    const [fx, fy, fz] = style.foot
    const fzS = (fz * u) / 0.9
    const fyS = (fy * u) / 0.9
    const ankle: Vec3 = [footJoint[0], footJoint[1] * 0.55, footJoint[2]]
    const toe: Vec3 = [footJoint[0], footJoint[1] * 0.4, footJoint[2] + fzS * 1.5]
    const footGrid = capsuleGrid({ a: ankle, b: toe, radiusA: fyS, radiusB: fyS * 0.72, useg: LIMB_USEG, vseg: 9, fullness: 0.65 })
    // widen across X to the foot's x-radius (fx), keep it flat-ish
    const fxS = (fx * u) / 0.9
    for (let i = 0; i < footGrid.pos.length / 3; i++) {
      footGrid.pos[i * 3] = (footGrid.pos[i * 3] - footJoint[0]) * (fxS / Math.max(fyS, 1e-9)) + footJoint[0]
    }
    const footName = `foot${side}` as const
    const foot = gridToPiece(footName, footGrid, [{ kind: 'poleBottom', ring: 1, loop: 'ankle' }])
    footWeights(foot, footName, `toes${side}`, ankle[2], fzS)
    // bird feet in solid accent (yellow/orange bird feet, matching the beak)
    if (wing) accentAll(foot, 1)
    paintUv(foot, side === 'L' ? 'footL' : 'footR', false)
    builder.add(foot)
    builder.bridge(builder.loopIndex[name].ankle, builder.loopIndex[footName].ankle)
  }

  buildArmOrWing('L')
  buildArmOrWing('R')
  buildLeg('L')
  buildLeg('R')

  const mesh = builder.build()
  const manifold = manifoldReport(mesh.indices)

  // --- morph targets (bodies.py body_shape_keys, numeric) -------------------
  const morphs = buildMorphs(mesh, { cy, ry, rx }, headCenter, u)

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
      headCenter: [headCenter[0], headCenter[1], headCenter[2]],
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
