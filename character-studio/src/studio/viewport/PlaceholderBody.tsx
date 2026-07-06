import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  addOutline,
  applyMaterialAssign,
  applyPalette,
  applyTextureId,
  createToonMaterial,
  getOutline,
  removeOutline,
  type ToonMaterial,
} from '../../core/materials'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { mulberry32 } from '../../core/motion/noise'
import { createIdleLayer } from '../../core/motion/proceduralIdle'
import { createFixedStepper, createSpringRig } from '../../core/motion/springSolver'
import type { ColliderGroup, SpringChainDef, SpringJointParams } from '../../core/motion/springTypes'
import type { Region } from '../../core/spec/schema'
import { useCharacterStore } from '../state/characterStore'
// Shared studio stores + movers moved to ../state/studioStores and
// ./bodyMover when CharacterRoot (plan 006) took over mounting; re-exported
// here for backwards compatibility while this file stays as a fallback body.
import { FALLBACK_ASSIGN, useMotionStudio, useToonStudio, type BodyMover } from '../state/studioStores'
import { createBodyMover } from './bodyMover'
import { FaceRig } from './FaceRig'

export { FALLBACK_ASSIGN, useMotionStudio, useToonStudio }
export type { BodyMover }

// Minimal stand-in character: a capsule body + sphere head, toon-shaded, now
// with placeholder spring-bone chains (plan 003 step 2): 2 ear chains
// (2 bones each) on the head, 1 tail chain (4 bones) on the body rear —
// cone/capsule meshes rigidly parented per bone so motion is visible.
// Plans 002/006 replace this with the real skeleton/skin — the bone names
// (earL.1, earL.2, earR.1, earR.2, tail.1..tail.4) already match the
// canonical plan-006 skeleton so the chain defs port over unchanged.

// Spring parameters (plan 003 step 5 motion-feel gate). Tuned live against
// the dev scene (hop/shake/walk probes measuring the earL tip particle):
//  - stiffness: how tightly the chain tracks the head/body. The plan's 0.65
//    starting value tracked the 400 ms hop almost rigidly (tip rise 0.156 m
//    for a 0.15 m hop, no visible lag). 0.25 gives the wanted shape: tip
//    lags on the rise (peak +0.148), floats at apex, overshoots −0.015
//    below rest on landing, settles within ~1 s (residual ≈ 0.01 m — inside
//    the breath envelope, i.e. no spring jitter). Tail lower still (0.3
//    across 4 joints compounds per-joint) so walking makes it trail.
//  - gravityPower: rest droop. Against the per-step stiffness constraint the
//    equilibrium droop is ≈ g·dt²·(1−k)/k, so this must be far larger than
//    9.8 to read at all; 30/25 gives ears/tail a soft settled curve without
//    wilting.
//  - dragForce: settle time. 0.12/0.1 lets exactly one clear overshoot
//    bounce through after a hop, dead by ~1 s, no residual vibration.
//  - hitRadius: 0.02 keeps ear capsules (r 0.045) from visibly sinking into
//    the skull collider before pushout kicks in.
export const EAR_PARAMS: SpringJointParams = {
  stiffness: 0.25,
  gravityPower: 30,
  gravityDir: [0, -1, 0],
  dragForce: 0.12,
  hitRadius: 0.02,
}

export const TAIL_PARAMS: SpringJointParams = {
  stiffness: 0.3,
  gravityPower: 25,
  gravityDir: [0, -1, 0],
  dragForce: 0.1,
  hitRadius: 0.02,
}

const CHAINS: SpringChainDef[] = [
  {
    name: 'earL',
    boneNames: ['earL.1', 'earL.2'],
    joints: [{ ...EAR_PARAMS }, { ...EAR_PARAMS }],
    colliderGroupRefs: ['head'],
  },
  {
    name: 'earR',
    boneNames: ['earR.1', 'earR.2'],
    joints: [{ ...EAR_PARAMS }, { ...EAR_PARAMS }],
    colliderGroupRefs: ['head'],
  },
  {
    name: 'tail',
    boneNames: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
    joints: [{ ...TAIL_PARAMS }, { ...TAIL_PARAMS }, { ...TAIL_PARAMS }, { ...TAIL_PARAMS }],
    colliderGroupRefs: [],
  },
]

export const CHAIN_NAMES = { ears: ['earL', 'earR'], tail: ['tail'] } as const
export const CHAIN_JOINT_COUNTS: Record<string, number> = { earL: 2, earR: 2, tail: 4 }

// One sphere collider on the skull so the ears never clip into the head.
const COLLIDER_GROUPS: ColliderGroup[] = [
  { name: 'head', colliders: [{ boneName: 'head', offset: [0, 0, 0], radius: 0.26 }] },
]

// Placeholder-body regions (subset of the spec's five — muzzle/claws arrive
// with plan-006 meshes). Meshes are tagged via userData.region below.
const BODY_REGIONS = ['body', 'ears', 'tail'] as const satisfies readonly Region[]

function meshesForRegion(root: THREE.Object3D, region: Region): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && obj.userData.region === region) meshes.push(obj as THREE.Mesh)
  })
  return meshes
}

const EAR_TILT = 0.22
const IDLE_SEED = 20260702

export function PlaceholderBody() {
  const rootRef = useRef<THREE.Group>(null)
  const materialsSpec = useCharacterStore((s) => s.spec.materials)
  const palette = useCharacterStore((s) => s.spec.palette)
  const terminatorWarmth = useToonStudio((s) => s.terminatorWarmth)

  // One toon material per placeholder region, created once from the mount-time
  // spec; every later spec change flows through the live-update effects below
  // (uniform writes — no material rebuild, no recompile except mask toggles).
  const regionMaterials = useMemo(() => {
    const { spec } = useCharacterStore.getState()
    const entries = BODY_REGIONS.map((region) => {
      const assign = spec.materials[region] ?? FALLBACK_ASSIGN
      return [region, createToonMaterial(assign, spec.palette)] as const
    })
    return Object.fromEntries(entries) as Record<(typeof BODY_REGIONS)[number], ToonMaterial>
  }, [])

  useEffect(() => {
    return () => {
      for (const material of Object.values(regionMaterials)) material.dispose()
    }
  }, [regionMaterials])

  // Live updates: MaterialAssign params + textureId + outline per region.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    for (const region of BODY_REGIONS) {
      const assign = materialsSpec[region] ?? FALLBACK_ASSIGN
      const material = regionMaterials[region]
      applyMaterialAssign(material, assign)
      applyTextureId(material, assign, palette)
      for (const mesh of meshesForRegion(root, region)) {
        if (assign.outline && !getOutline(mesh)) addOutline(mesh)
        else if (!assign.outline) removeOutline(mesh)
      }
    }
  }, [materialsSpec, palette, regionMaterials])

  // Live updates: palette recolor.
  useEffect(() => {
    for (const region of BODY_REGIONS) applyPalette(regionMaterials[region], palette)
  }, [palette, regionMaterials])

  // Live updates: studio-level terminator warmth (global across regions).
  useEffect(() => {
    for (const region of BODY_REGIONS) {
      regionMaterials[region].userData.toonUniforms.uTerminatorWarmth.value = terminatorWarmth
    }
  }, [terminatorWarmth, regionMaterials])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const chest = root.getObjectByName('chest')
    const neck = root.getObjectByName('neck')
    const head = root.getObjectByName('head')
    const hips = root.getObjectByName('hips')
    if (!chest || !neck || !head || !hips) throw new Error('PlaceholderBody: missing rig target group')

    // Physics: spring rig, stepped at fixed 60 Hz substeps (max 3/frame).
    const rig = createSpringRig(root, CHAINS, COLLIDER_GROUPS)
    const stepper = createFixedStepper((h) => rig.step(h))
    const onPhysics = (dt: number) => {
      stepper.advance(dt)
    }

    // Procedural: idle breath/sway/micro-turns (writes next-frame intent —
    // see proceduralIdle.ts for the ordering contract).
    const idle = createIdleLayer({ chest, head, hips }, mulberry32(IDLE_SEED))
    const onProcedural = (dt: number) => idle.update(dt)

    // Animation: temporary body movers (hop/shake/walk) that excite the springs.
    const mover = createBodyMover(root, neck)
    const onAnimation = (dt: number) => mover.update(dt)

    registerUpdate('animation', onAnimation)
    registerUpdate('physics', onPhysics)
    registerUpdate('procedural', onProcedural)
    useMotionStudio.setState({ rig, idle, mover, chains: CHAINS })

    return () => {
      unregisterUpdate('animation', onAnimation)
      unregisterUpdate('physics', onPhysics)
      unregisterUpdate('procedural', onProcedural)
      idle.reset()
      rig.dispose()
      useMotionStudio.setState({ rig: null, idle: null, mover: null, chains: [] })
    }
  }, [])

  return (
    <group ref={rootRef} name="characterRoot">
      <group name="hips" position={[0, 0.55, 0]}>
        <group name="chest">
          <mesh castShadow receiveShadow material={regionMaterials.body} userData={{ region: 'body' }}>
            <capsuleGeometry args={[0.3, 0.5, 4, 16]} />
          </mesh>
          <group name="neck" position={[0, 0.65, 0]}>
            <group name="head">
              <mesh castShadow receiveShadow material={regionMaterials.body} userData={{ region: 'body' }}>
                <sphereGeometry args={[0.28, 24, 16]} />
              </mesh>
              {/* Drawn face lives in the body material's UVs (advisor plan
                  002). NOTE: this retired fallback's sphere head has stock
                  sphere UVs, not the bodies.py head island — the face only
                  lands correctly on real archetype bodies (CharacterRoot). */}
              <FaceRig bodyMaterial={regionMaterials.body} />
              {/* Long rabbit-like ears: two stacked capsules rigidly parented per bone. */}
              <bone name="earL.1" position={[0.12, 0.22, 0]} rotation={[0, 0, -EAR_TILT]}>
                <mesh castShadow position={[0, 0.08, 0]} material={regionMaterials.ears} userData={{ region: 'ears' }}>
                  <capsuleGeometry args={[0.045, 0.1, 4, 8]} />
                </mesh>
                <bone name="earL.2" position={[0, 0.16, 0]}>
                  <mesh castShadow position={[0, 0.08, 0]} material={regionMaterials.ears} userData={{ region: 'ears' }}>
                    <capsuleGeometry args={[0.04, 0.1, 4, 8]} />
                  </mesh>
                </bone>
              </bone>
              <bone name="earR.1" position={[-0.12, 0.22, 0]} rotation={[0, 0, EAR_TILT]}>
                <mesh castShadow position={[0, 0.08, 0]} material={regionMaterials.ears} userData={{ region: 'ears' }}>
                  <capsuleGeometry args={[0.045, 0.1, 4, 8]} />
                </mesh>
                <bone name="earR.2" position={[0, 0.16, 0]}>
                  <mesh castShadow position={[0, 0.08, 0]} material={regionMaterials.ears} userData={{ region: 'ears' }}>
                    <capsuleGeometry args={[0.04, 0.1, 4, 8]} />
                  </mesh>
                </bone>
              </bone>
            </group>
          </group>
        </group>
        {/* Tail: four cone segments trailing off the body rear (-Z). */}
        <bone name="tail.1" position={[0, -0.15, -0.28]}>
          <mesh castShadow position={[0, 0, -0.055]} rotation={[-Math.PI / 2, 0, 0]} material={regionMaterials.tail} userData={{ region: 'tail' }}>
            <coneGeometry args={[0.055, 0.11, 8]} />
          </mesh>
          <bone name="tail.2" position={[0, -0.01, -0.11]}>
            <mesh castShadow position={[0, 0, -0.055]} rotation={[-Math.PI / 2, 0, 0]} material={regionMaterials.tail} userData={{ region: 'tail' }}>
              <coneGeometry args={[0.045, 0.11, 8]} />
            </mesh>
            <bone name="tail.3" position={[0, -0.01, -0.11]}>
              <mesh castShadow position={[0, 0, -0.055]} rotation={[-Math.PI / 2, 0, 0]} material={regionMaterials.tail} userData={{ region: 'tail' }}>
                <coneGeometry args={[0.035, 0.11, 8]} />
              </mesh>
              <bone name="tail.4" position={[0, -0.01, -0.11]}>
                <mesh castShadow position={[0, 0, -0.055]} rotation={[-Math.PI / 2, 0, 0]} material={regionMaterials.tail} userData={{ region: 'tail' }}>
                  <coneGeometry args={[0.025, 0.11, 8]} />
                </mesh>
              </bone>
            </bone>
          </bone>
        </bone>
      </group>
    </group>
  )
}
