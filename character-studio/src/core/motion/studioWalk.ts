// Studio walk session (advisor plan 001) — drives the authored gait clips
// outside Play mode so the debug "walk circle" articulates limbs. Same
// primitives as PlayMode (mixer + clip machine + locomotion + ground-contact
// foot IK), minimal: no soak, no talk. Pure three — the React layer owns
// mounting.

import * as THREE from 'three'
import { createClipMachine } from './clipStateMachine'
import { createFootIK, type FootIkLeg } from './footIK'
import { createLocomotion, WALK_SPEED } from './locomotion'

export interface StudioWalkSession {
  /** Advance locomotion + clips. Register in the `animation` phase. */
  update(dt: number): void
  /** Restore the captured rest pose and root transform, release the mixer. */
  dispose(): void
}

export function createStudioWalk(
  root: THREE.Object3D,
  bones: Iterable<THREE.Object3D>,
  animations: THREE.AnimationClip[],
  options: {
    hipsRebase: { from: [number, number, number]; to: readonly [number, number, number] }
    speed?: number
    /** Per-bone rest-pose compensation (see ClipMachineOptions). */
    restPoseOffsets?: Partial<Record<string, readonly [number, number, number]>>
  },
): StudioWalkSession {
  const speed = options.speed ?? WALK_SPEED

  // ---- rest-pose snapshot (restored on dispose) ------------------------------
  const boneSnapshot = [...bones].map((bone) => ({
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
  }))
  const rootPosition = root.position.clone()
  const rootRotationY = root.rotation.y

  const mixer = new THREE.AnimationMixer(root)
  const machine = createClipMachine(mixer, animations, {
    hipsRebase: options.hipsRebase,
    restPoseOffsets: options.restPoseOffsets,
  })
  const locomotion = createLocomotion(root, { radius: 1.2 })
  // Ground contact (bones are at rest here — footIK measures rest heights):
  // same correction-only pinning as PlayMode, so the debug circle doesn't
  // drive the stubby-leg archetypes' feet through the floor at plant.
  // (`bones` is a one-shot iterator, already drained by the snapshot above.)
  const boneByName = new Map(boneSnapshot.map(({ bone }) => [bone.name, bone]))
  const legs: FootIkLeg[] = (['L', 'R'] as const).flatMap((side) => {
    const upper = boneByName.get(`upperLeg${side}`)
    const lower = boneByName.get(`lowerLeg${side}`)
    const foot = boneByName.get(`foot${side}`)
    return upper && lower && foot ? [{ upper, lower, foot }] : []
  })
  const footIK = createFootIK(legs, { groundY: 0, poleDir: new THREE.Vector3(0, 0, 1) })

  return {
    update(dt: number): void {
      locomotion.setTargetSpeed(speed)
      locomotion.update(dt)
      machine.setState(locomotion.getGaitState())
      machine.setLocomotionTimeScale(locomotion.getGaitTimeScale())
      machine.update(dt)
      root.updateWorldMatrix(true, true)
      footIK.update(dt)
    },
    dispose(): void {
      machine.dispose()
      mixer.stopAllAction()
      for (const { bone, position, quaternion } of boneSnapshot) {
        bone.position.copy(position)
        bone.quaternion.copy(quaternion)
      }
      root.position.copy(rootPosition)
      root.rotation.y = rootRotationY
    },
  }
}
