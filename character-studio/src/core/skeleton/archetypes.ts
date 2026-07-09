// Archetype proportion tables (plan 006, step 1b).
//
// One canonical skeleton (./canonical.ts), three archetype builds: the same
// bones with per-bone rest-offset multipliers + one uniform height multiplier
// applied at build time. Proportions live HERE (and in the JSON the Blender
// builder consumes — scripts/export-skeleton-json.ts) so archetype bodies,
// the TS skeleton, and the exported GLBs always agree.
//
// The skull is not a bone: `headCenter` (relative to the `head` bone) and
// `headRadius` describe the cranium sphere the face rig draws on and the
// head collider protects. Both are in REFERENCE space and get multiplied by
// `uniformScale` like every bone offset.

import type { ColliderGroup } from '../motion/springTypes'
import type { Archetype, BoneName } from '../spec/schema'
import { type BuildSkeletonOptions, type BuiltSkeleton, buildSkeleton, restWorldPositions } from './canonical'

export interface ArchetypeDef {
  archetype: Archetype
  /** Target skull-top height (m) — the number the proportion math hits. */
  height: number
  /** Uniform multiplier applied to all offsets (chosen so skull top = height). */
  uniformScale: number
  /** Per-bone component-wise rest-offset multipliers (see BuildSkeletonOptions). */
  offsetScales: Partial<Record<BoneName, readonly [number, number, number]>>
  /** Cranium centre relative to the `head` bone, reference space. */
  headCenter: readonly [number, number, number]
  /** Cranium radius, reference space. */
  headRadius: number
}

function legs(scale: number): Partial<Record<BoneName, readonly [number, number, number]>> {
  const s = [1, scale, 1] as const
  return {
    upperLegL: s,
    lowerLegL: s,
    footL: s,
    toesL: [1, scale, 1],
    upperLegR: s,
    lowerLegR: s,
    footR: s,
    toesR: [1, scale, 1],
  }
}

function arms(scale: readonly [number, number, number]): Partial<Record<BoneName, readonly [number, number, number]>> {
  return {
    upperArmL: scale,
    foreArmL: scale,
    handL: scale,
    'socket.handL': scale,
    upperArmR: scale,
    foreArmR: scale,
    handR: scale,
    'socket.handR': scale,
  }
}

function spineChain(scale: number): Partial<Record<BoneName, readonly [number, number, number]>> {
  const s = [1, scale, 1] as const
  return { spine: s, chest: s, neck: s, head: s }
}

export const ARCHETYPES_DEF: Record<Archetype, ArchetypeDef> = {
  // Chunky teddy silhouette: shortest legs, biggest cranium (chibi pass
  // 2026-07-08: bigger head, stubbier limbs, arms clear of the fat flank).
  'biped-round': {
    archetype: 'biped-round',
    height: 0.88,
    uniformScale: 0.88 / 0.9366,
    offsetScales: {
      hips: [1, 0.78, 1],
      ...legs(0.6),
      ...spineChain(0.88),
      // A-pose: the arm drops down-and-out ~45°; a touch of X-stretch keeps
      // the mitten from burying itself in the fat pear flank while the chain
      // still hugs the body reading chibi-stubby.
      ...arms([1.1, 1, 1]),
    },
    headCenter: [0, 0.19, 0],
    headRadius: 0.235,
  },
  // Chibi mascot silhouette (rabbit/cat/fox): big round head (~45 % of
  // height), egg torso, stubby drop arms and short leg stubs — the toy-render
  // benchmark, no longer "taller and leggier".
  'biped-slim': {
    archetype: 'biped-slim',
    height: 0.92,
    uniformScale: 0.92 / 0.924,
    offsetScales: {
      hips: [1, 0.8, 1],
      ...legs(0.6),
      ...spineChain(0.9),
      // A-pose: stubby plush arm hanging down-out along the egg torso's
      // flank; mild X-stretch keeps the mitten clear of the surface.
      ...arms([1.05, 1, 1]),
    },
    headCenter: [0, 0.19, 0],
    headRadius: 0.21,
  },
  // Humanoid AC bird villager (remodel 2026-07-09): clearly STACKED — a big
  // round head (~49 % of height in diameter) sitting ON a visible egg torso
  // (top ~53 % of height, max width ~88 % of the head's), on thin stick legs
  // (egg bottom ~24 % of height, feet grounded). The wing-arms hang near-
  // vertically at the flank to hip level (see body.ts STYLE).
  bird: {
    archetype: 'bird',
    height: 0.8,
    uniformScale: 0.8 / 1.217,
    offsetScales: {
      hips: [1, 1.05, 1],
      ...legs(0.95),
      ...spineChain(1),
      // T-POSE wing-arm (AC catalogue rest state): the arm chain runs
      // HORIZONTALLY out from a raised shoulder (y-drop scaled to ~0), the
      // flat tapered wing extending straight past the head's silhouette —
      // the classic AC bird villager default pose. Expressed per-archetype
      // via offsetScales so the canonical reference skeleton (and every
      // authored clip) stays untouched.
      shoulderL: [1, 1.5, 1],
      shoulderR: [1, 1.5, 1],
      // y 0.35 (not ~0): the wing chain ROOT sits on the torso surface a
      // touch below the shoulder, so a zero drop tilts the blade upward —
      // the slight drop levels it out to the reference's horizontal line
      ...arms([2.1, 0.35, 1]),
      // The bird head is much bigger than the reference cranium, so the
      // head-mounted sockets stretch out to its surface: beak root at the
      // face front, lower third (goal: prominent beak), eyewear socket on the
      // face surface, hat crown near the skull top.
      'socket.muzzle': [1, 1.55, 1.5],
      'socket.face': [1, 1.2, 1.45],
      'socket.hat': [1, 1.6, 1],
      // up-swept tail rest (AC sparrow/crane): the feather fan angles
      // back-and-UP from the rump; the spring solver holds this line at rest
      'tail.1': [1, 1.1, 1.1],
      'tail.2': [1, 1.1, 1.1],
      'tail.3': [1, 1.1, 1.1],
      'tail.4': [1, 1.1, 1.1],
    },
    headCenter: [0, 0.28, 0],
    headRadius: 0.3,
  },
}

/**
 * Rest-pose compensation for played clips (ClipMachineOptions.restPoseOffsets):
 * clips are authored on the REFERENCE rest (arms ~42° down); the bird rests in
 * a T-POSE (~8° droop), so during Play its wing chain pre-rotates down by the
 * difference — played clips then land on the silhouette the animator authored
 * instead of wiggling around the horizontal.
 */
export const ARCHETYPE_CLIP_POSE_OFFSETS: Partial<
  Record<Archetype, Partial<Record<BoneName, readonly [number, number, number]>>>
> = {
  bird: {
    upperArmL: [0, 0, -0.58],
    upperArmR: [0, 0, 0.58],
  },
}

/** BuildSkeletonOptions for an archetype (feed to buildSkeleton). */
export function archetypeBuildOptions(archetype: Archetype): BuildSkeletonOptions {
  const def = ARCHETYPES_DEF[archetype]
  return { offsetScales: def.offsetScales, uniformScale: def.uniformScale }
}

/** Build the canonical skeleton at an archetype's proportions. */
export function buildArchetypeSkeleton(archetype: Archetype): BuiltSkeleton {
  return buildSkeleton(archetypeBuildOptions(archetype))
}

export interface ArchetypeHead {
  /** Cranium centre relative to the `head` bone (world-scale units). */
  center: [number, number, number]
  radius: number
}

/** Cranium sphere at world scale (face-rig anchor + head collider). */
export function archetypeHead(archetype: Archetype): ArchetypeHead {
  const def = ARCHETYPES_DEF[archetype]
  const u = def.uniformScale
  return {
    center: [def.headCenter[0] * u, def.headCenter[1] * u, def.headCenter[2] * u],
    radius: def.headRadius * u,
  }
}

/** Torso front-depth as a fraction of the head radius — mirrors the
 * `torsoRz` proportions in src/core/procgen/body.ts STYLE (the bodies are
 * built from these numbers, so the colliders track the real silhouette). */
const TORSO_RZ: Record<Archetype, number> = { 'biped-round': 0.62, 'biped-slim': 0.7, bird: 0.7 }

/** Torso-top overshoot past the neck joint — mirrors `torsoTopOvershoot` in
 * body.ts STYLE (the bird's chin/neck line needs a small overshoot so the
 * head is not swallowed; bipeds keep the classic 0.55). */
const TORSO_TOP_OVERSHOOT: Record<Archetype, number> = { 'biped-round': 0.55, 'biped-slim': 0.55, bird: 0.33 }

/** Torso-bottom overshoot below the hips joint — mirrors `torsoBottomOvershoot`
 * in body.ts STYLE (the bird egg is lifted off the legs so they stay visible). */
const TORSO_BOTTOM_OVERSHOOT: Record<Archetype, number> = { 'biped-round': 0.42, 'biped-slim': 0.42, bird: 0.3 }

/**
 * Default collider set for an archetype: one skull sphere (group "head") for
 * ear/tail chains, plus two torso spheres (group "torso", plan 008) that keep
 * dangling wardrobe chains — scarf ends, drawstrings, strap tails — from
 * diving into the body while they trail and settle. Radii sit ~1 hitRadius
 * inside the garment rest surface so colliders are a backstop, not a spring
 * rest-pose influence. Chains opt in by name (spec `colliderGroupRefs`).
 */
export function archetypeColliderGroups(archetype: Archetype): ColliderGroup[] {
  const head = archetypeHead(archetype)
  const world = restWorldPositions(buildArchetypeSkeleton(archetype))
  const [, hipsY] = world.hips
  const [, neckY] = world.neck
  const [, chestY] = world.chest
  // the bodies.py torso ellipsoid: bottom/top overshoot the hip/neck joints
  const torsoH = neckY - hipsY
  const bottom = hipsY - torsoH * TORSO_BOTTOM_OVERSHOOT[archetype]
  const top = neckY + torsoH * TORSO_TOP_OVERSHOOT[archetype]
  const cy = (bottom + top) / 2
  const ry = (top - bottom) / 2
  const rz = head.radius * TORSO_RZ[archetype]
  return [
    {
      name: 'head',
      colliders: [{ boneName: 'head', offset: head.center, radius: head.radius * 0.92 }],
    },
    {
      name: 'torso',
      colliders: [
        { boneName: 'chest', offset: [0, cy + ry * 0.3 - chestY, 0], radius: rz * 0.85 },
        { boneName: 'hips', offset: [0, cy - ry * 0.28 - hipsY, 0], radius: rz * 1.05 },
      ],
    },
  ]
}
