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
import { type BuildSkeletonOptions, type BuiltSkeleton, buildSkeleton } from './canonical'

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
  // Chunky teddy silhouette: shortest legs, biggest cranium.
  'biped-round': {
    archetype: 'biped-round',
    height: 0.9,
    uniformScale: 0.9 / 0.9684,
    offsetScales: {
      hips: [1, 0.86, 1],
      ...legs(0.85),
      ...spineChain(0.95),
      ...arms([0.9, 0.9, 1]),
    },
    headCenter: [0, 0.19, 0],
    headRadius: 0.22,
  },
  // Taller, leggier silhouette (deer/rabbit-adjacent).
  'biped-slim': {
    archetype: 'biped-slim',
    height: 1.05,
    uniformScale: 1.05 / 1.0229,
    offsetScales: {
      hips: [1, 1.1, 1],
      ...legs(1.15),
      ...spineChain(1.05),
      ...arms([1.1, 1.1, 1]),
    },
    headCenter: [0, 0.17, 0],
    headRadius: 0.185,
  },
  // Round bird: shortest overall, high ankles, wing-arms, fanned tail root.
  bird: {
    archetype: 'bird',
    height: 0.8,
    uniformScale: 0.8 / 0.9068,
    offsetScales: {
      hips: [1, 0.82, 1],
      ...legs(0.72),
      ...spineChain(0.85),
      ...arms([0.95, 1, 1]),
      'tail.1': [1, 0.6, 1.1],
      'tail.2': [1, 0.6, 1.1],
      'tail.3': [1, 0.6, 1.1],
      'tail.4': [1, 0.6, 1.1],
    },
    headCenter: [0, 0.18, 0],
    headRadius: 0.21,
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

/**
 * Default collider set for an archetype: one skull sphere (group "head") —
 * ear/tail chains reference it by name (spec `colliderGroupRefs`).
 */
export function archetypeColliderGroups(archetype: Archetype): ColliderGroup[] {
  const head = archetypeHead(archetype)
  return [
    {
      name: 'head',
      colliders: [{ boneName: 'head', offset: head.center, radius: head.radius * 0.92 }],
    },
  ]
}
