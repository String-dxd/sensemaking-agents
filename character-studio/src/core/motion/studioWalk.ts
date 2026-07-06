// Studio walk session (advisor plan 001) — drives the authored gait clips
// outside Play mode so the debug "walk circle" articulates limbs. Same
// primitives as PlayMode (mixer + clip machine + locomotion), minimal: no
// foot IK, no soak, no talk. Pure three — the React layer owns mounting.

import * as THREE from 'three'
import { createClipMachine } from './clipStateMachine'
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
  const machine = createClipMachine(mixer, animations, { hipsRebase: options.hipsRebase })
  const locomotion = createLocomotion(root, { radius: 1.2 })

  return {
    update(dt: number): void {
      locomotion.setTargetSpeed(speed)
      locomotion.update(dt)
      machine.setState(locomotion.getGaitState())
      machine.setLocomotionTimeScale(locomotion.getGaitTimeScale())
      machine.update(dt)
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
