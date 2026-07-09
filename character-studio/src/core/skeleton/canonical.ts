// Canonical skeleton (plan 006, step 1) — plan 000 §5 encoded as code.
//
// THE CONTRACT: bone names, hierarchy, and ordering here are shared by every
// archetype body, every anatomy part, every animation clip (plan 007), and
// the Blender authoring scripts (scripts/blender/*). Names are exact and
// case-sensitive; never rename or re-parent (that is a plan-000 change).
//
// Rest pose conventions (also captured in src/assets/anatomy/ASSET-CONTRACT.md):
//   - +Y up, character faces +Z, units are meters.
//   - Reference character is 1.0 units tall (skull top at y = 1.0);
//     archetype proportions (./archetypes.ts) rescale at build time.
//   - Rest pose is standing in a relaxed A-POSE (AC/Pokopia villager stance):
//     each arm angles DOWN-AND-OUT ~45° below horizontal from the shoulder,
//     with a slight bend at the forearm (the chain is deliberately NOT one
//     perfectly straight line — the elbow/wrist joints stay recoverable from
//     positions).
//   - Every bone's rest LOCAL ROTATION is identity — positions carry the
//     whole pose. This keeps spec `boneScales` axes world-aligned (y = up)
//     and lets the Blender builder export byte-identical rest transforms
//     (all edit bones point +Y with zero roll).
//
// The skull is not a bone: the head BONE sits at the skull base; the skull
// centre/radius used by the face rig and head collider live in
// ./archetypes.ts (per-archetype).

import { Bone, Skeleton, Vector3 } from 'three'
import { BONE_NAMES, type BoneName } from '../spec/schema'

export interface CanonicalBoneDef {
  name: BoneName
  parent: BoneName | null
  /** Rest position local to the parent (reference character, 1.0 tall). */
  position: readonly [number, number, number]
}

// Reference-space WORLD joint positions (1.0-tall character). Local offsets
// are derived below — keeping the source of truth in world space makes the
// numbers reviewable against the silhouette (head ≈ 40 % of height, stubby
// limbs, big feet).
const W: Record<BoneName, readonly [number, number, number]> = {
  root: [0, 0, 0],
  hips: [0, 0.34, 0],
  spine: [0, 0.4, 0],
  chest: [0, 0.46, 0],
  neck: [0, 0.56, 0],
  head: [0, 0.62, 0],
  jaw: [0, 0.7, 0.12],
  'earL.1': [0.09, 0.96, 0],
  'earL.2': [0.125, 1.06, 0],
  'earR.1': [-0.09, 0.96, 0],
  'earR.2': [-0.125, 1.06, 0],
  'tail.1': [0, 0.33, -0.16],
  'tail.2': [0, 0.355, -0.25],
  'tail.3': [0, 0.385, -0.33],
  'tail.4': [0, 0.42, -0.4],
  shoulderL: [0.055, 0.52, 0],
  upperArmL: [0.105, 0.485, 0.005],
  foreArmL: [0.155, 0.435, 0.01],
  handL: [0.2, 0.39, 0.015], // wrist ~45° below the shoulder (relaxed A-pose drop)
  shoulderR: [-0.055, 0.52, 0],
  upperArmR: [-0.105, 0.485, 0.005],
  foreArmR: [-0.155, 0.435, 0.01],
  handR: [-0.2, 0.39, 0.015],
  upperLegL: [0.075, 0.33, 0],
  lowerLegL: [0.075, 0.185, 0],
  footL: [0.075, 0.055, -0.01],
  toesL: [0.075, 0.015, 0.1],
  upperLegR: [-0.075, 0.33, 0],
  lowerLegR: [-0.075, 0.185, 0],
  footR: [-0.075, 0.055, -0.01],
  toesR: [-0.075, 0.015, 0.1],
  'socket.hat': [0, 0.98, 0],
  'socket.face': [0, 0.8, 0.2],
  'socket.muzzle': [0, 0.75, 0.19],
  'socket.torso': [0, 0.47, 0.12],
  'socket.back': [0, 0.45, -0.14],
  'socket.handL': [0.215, 0.375, 0.018],
  'socket.handR': [-0.215, 0.375, 0.018],
}

/** Parent of each bone — plan 000 §5's tree, verbatim (incl. 2026-07-03 amendment: shoulders under chest). */
export const BONE_PARENTS: Record<BoneName, BoneName | null> = {
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  jaw: 'head',
  'earL.1': 'head',
  'earL.2': 'earL.1',
  'earR.1': 'head',
  'earR.2': 'earR.1',
  'socket.hat': 'head',
  'socket.face': 'head',
  'socket.muzzle': 'head',
  shoulderL: 'chest',
  upperArmL: 'shoulderL',
  foreArmL: 'upperArmL',
  handL: 'foreArmL',
  'socket.handL': 'handL',
  shoulderR: 'chest',
  upperArmR: 'shoulderR',
  foreArmR: 'upperArmR',
  handR: 'foreArmR',
  'socket.handR': 'handR',
  upperLegL: 'hips',
  lowerLegL: 'upperLegL',
  footL: 'lowerLegL',
  toesL: 'footL',
  upperLegR: 'hips',
  lowerLegR: 'upperLegR',
  footR: 'lowerLegR',
  toesR: 'footR',
  'tail.1': 'hips',
  'tail.2': 'tail.1',
  'tail.3': 'tail.2',
  'tail.4': 'tail.3',
  'socket.torso': 'chest',
  'socket.back': 'hips',
}

/** Ordered bone list (BONE_NAMES order — parents always precede children). */
export const CANONICAL_BONES: readonly CanonicalBoneDef[] = BONE_NAMES.map((name) => {
  const parent = BONE_PARENTS[name]
  const world = W[name]
  const parentWorld = parent ? W[parent] : ([0, 0, 0] as const)
  return {
    name,
    parent,
    position: [world[0] - parentWorld[0], world[1] - parentWorld[1], world[2] - parentWorld[2]] as const,
  }
})

/** The `socket.*` subset (plain bones — attachment points for parts/wardrobe). */
export const SOCKETS: readonly BoneName[] = BONE_NAMES.filter((n) => n.startsWith('socket.'))

/** Spring-chain bones (taken over by the solver at runtime; never keyframed). */
export const SPRING_CHAIN_BONES: readonly BoneName[] = [
  'earL.1',
  'earL.2',
  'earR.1',
  'earR.2',
  'tail.1',
  'tail.2',
  'tail.3',
  'tail.4',
]

export interface BuiltSkeleton {
  /** All 38 bones in canonical order; `bones[0]` is `root`. */
  bones: Bone[]
  skeleton: Skeleton
  boneByName: Map<BoneName, Bone>
}

export interface BuildSkeletonOptions {
  /**
   * Component-wise multiplier applied to each bone's rest LOCAL offset
   * (archetype proportions — see ./archetypes.ts). Scaling a bone's offset
   * moves its whole subtree, which is exactly how limb lengths shorten.
   */
  offsetScales?: Partial<Record<BoneName, readonly [number, number, number]>>
  /** Uniform multiplier applied to every local offset (overall height). */
  uniformScale?: number
}

/**
 * Build the canonical skeleton as a live three.js bone hierarchy (rest pose,
 * identity rotations). Returns the ordered bone array, a `THREE.Skeleton`
 * over it, and a name lookup. World matrices are up to date on return.
 */
export function buildSkeleton(options: BuildSkeletonOptions = {}): BuiltSkeleton {
  const { offsetScales = {}, uniformScale = 1 } = options
  const boneByName = new Map<BoneName, Bone>()
  const bones: Bone[] = []

  for (const def of CANONICAL_BONES) {
    const bone = new Bone()
    bone.name = def.name
    const scale = offsetScales[def.name]
    bone.position.set(
      def.position[0] * (scale?.[0] ?? 1) * uniformScale,
      def.position[1] * (scale?.[1] ?? 1) * uniformScale,
      def.position[2] * (scale?.[2] ?? 1) * uniformScale,
    )
    if (def.parent) {
      const parent = boneByName.get(def.parent)
      if (!parent) throw new Error(`canonical skeleton: parent "${def.parent}" of "${def.name}" not built yet`)
      parent.add(bone)
    }
    boneByName.set(def.name, bone)
    bones.push(bone)
  }

  const root = bones[0]
  root.updateWorldMatrix(true, true)
  return { bones, skeleton: new Skeleton(bones), boneByName }
}

/** Rest WORLD position of every bone for a built skeleton (test/export aid). */
export function restWorldPositions(built: BuiltSkeleton): Record<BoneName, [number, number, number]> {
  const out = {} as Record<BoneName, [number, number, number]>
  const v = new Vector3()
  for (const [name, bone] of built.boneByName) {
    v.setFromMatrixPosition(bone.matrixWorld)
    out[name] = [v.x, v.y, v.z]
  }
  return out
}
