// Play Mode driver (plan 007 step 5) — mounts inside the Canvas. While the
// studio is in play mode it owns the character's base motion layer:
//
//   animation:  locomotion (root along the circle) + clip state machine
//   physics:    foot IK correction (springs are registered by CharacterRoot
//               and run in the same phase on disjoint bones)
//   procedural: talk driver (mouth cells + camera gaze); breath/blink/gaze
//               easing keep running from their existing owners
//
// The idle layer is narrowed to breath-only through the IdleChannels seam
// (clips own hips position and head rotation here). Everything is torn down
// and the rest pose restored when leaving play mode, and the whole driver
// re-creates itself when a spec change reassembles the character
// (CharacterRoot publishes a fresh CharacterHandle).

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { GAZE_MAX } from '../../core/face/facePlane'
import {
  createClipMachine,
  type GestureName,
  type MachineState,
} from '../../core/motion/clipStateMachine'
import { createFootIK, type FootIkLeg } from '../../core/motion/footIK'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { createLocomotion } from '../../core/motion/locomotion'
import { mulberry32 } from '../../core/motion/noise'
import { createTalkDriver, makeSpeechSynthAmplitude } from '../../core/motion/talkDriver'
import { CANONICAL_BONES } from '../../core/skeleton/canonical'
import { useMotionStudio } from '../state/studioStores'
import { useCharacterStore } from '../state/characterStore'
import { useFaceRigStore } from '../viewport/FaceRig'
import { usePlayStore } from './playStore'

const SOAK_SEED = 20260703
const clipsUrl = new URL('../../assets/clips/clips-core-v1.glb', import.meta.url).href

/** Reference-skeleton hips rest local position (clips were authored on it). */
const REF_HIPS = (() => {
  const hips = CANONICAL_BONES.find((b) => b.name === 'hips')
  if (!hips) throw new Error('canonical skeleton has no hips bone')
  return hips.position
})()

const SOAK_STATES: ReadonlyArray<MachineState> = ['idle', 'walk', 'run', 'sit', 'talk']
const SOAK_GESTURES_STANDING: ReadonlyArray<GestureName> = [
  'gestureWave',
  'gestureNod',
  'gestureShrug',
  'gestureCheer',
]

export function PlayMode() {
  const mode = usePlayStore((s) => s.mode)
  return mode === 'play' ? <PlayModeDriver /> : null
}

function PlayModeDriver() {
  const character = useMotionStudio((s) => s.character)
  const camera = useThree((s) => s.camera)
  const gltf = useGLTF(clipsUrl)
  const animations = gltf.animations

  useEffect(() => {
    if (!character) return
    const { idle, rig } = useMotionStudio.getState()
    const { root, boneByName, hipsRest } = character

    // ---- rest-pose snapshot (restored on exit) --------------------------------
    const snapshot = [...boneByName.values()].map((bone) => ({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    }))

    // ---- build the stack (bones are at rest here: footIK measures rest heights,
    // the machine rebases hips tracks onto the assembly-time rest offset) -------
    const mixer = new THREE.AnimationMixer(root)
    const machine = createClipMachine(mixer, animations, {
      hipsRebase: { from: [REF_HIPS[0], REF_HIPS[1], REF_HIPS[2]], to: hipsRest },
    })
    const locomotion = createLocomotion(root, { radius: 1.2 })
    const poleDir = new THREE.Vector3(0, 0, 1)
    const legs: FootIkLeg[] = (['L', 'R'] as const).flatMap((side) => {
      const upper = boneByName.get(`upperLeg${side}`)
      const lower = boneByName.get(`lowerLeg${side}`)
      const foot = boneByName.get(`foot${side}`)
      return upper && lower && foot ? [{ upper, lower, foot }] : []
    })
    const footIK = createFootIK(legs, { groundY: 0, poleDir })
    const rng = mulberry32(SOAK_SEED)
    const talk = createTalkDriver(
      { setMouthOverride: (cell) => useFaceRigStore.getState().rig?.setMouthOverride(cell) },
      rng,
      { onNod: () => machine.playGesture('gestureNod') },
    )

    // Clips own hips position + head rotation now; keep only breath.
    idle?.setChannels({ headBob: false, sway: false, microTurn: false })

    // ---- bird sit adaptation (round 7) ---------------------------------------
    // The shared sit clip folds mammal legs; on the bird's half-scale stick
    // legs the folded tips dig below the floor and the sit reads legless.
    // While seated, blend the thighs toward horizontal (legs point forward
    // out of the egg — the AC toy sit), undo the shin fold, and clamp the
    // hips drop so the egg rests ON the pedestal instead of through it.
    const isBird = useCharacterStore.getState().spec.meta.archetype === 'bird'
    const DEG = Math.PI / 180
    let sitW = 0
    // Re-entering play (or reassembling mid-play) resumes the requested state.
    const startState = usePlayStore.getState().desiredState
    if (startState !== 'idle') machine.setState(startState)

    // ---- per-frame driver ------------------------------------------------------
    let lastGestureSeq = usePlayStore.getState().gestureRequest?.seq ?? 0
    let soakStateTimer = 1 // first soak decision arrives quickly
    let soakGestureTimer = 6
    const scratch = { v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion() }

    const onAnimation = (dt: number) => {
      const store = usePlayStore.getState()

      // Soak test: seeded random drift through states/speeds/gestures.
      if (store.soak) {
        soakStateTimer -= dt
        if (soakStateTimer <= 0) {
          soakStateTimer = 5 + rng() * 10 // plan 007: every 5–15 s
          // Skip past the current state so every tick visibly drifts.
          let next = SOAK_STATES[Math.floor(rng() * SOAK_STATES.length)]
          if (next === store.desiredState) {
            next = SOAK_STATES[(SOAK_STATES.indexOf(next) + 1) % SOAK_STATES.length]
          }
          store.requestState(next)
          if (next === 'walk') store.setSpeed(0.6 + rng() * 0.7)
          if (next === 'run') store.setSpeed(1.7 + rng() * 0.9)
        }
        soakGestureTimer -= dt
        if (soakGestureTimer <= 0) {
          soakGestureTimer = 4 + rng() * 8
          const state = machine.getState()
          if (state === 'sit' || state === 'talk') {
            machine.playGesture('gestureNod')
          } else {
            machine.playGesture(SOAK_GESTURES_STANDING[Math.floor(rng() * SOAK_GESTURES_STANDING.length)])
          }
        }
      }

      // Gesture buttons.
      const req = store.gestureRequest
      if (req && req.seq !== lastGestureSeq) {
        lastGestureSeq = req.seq
        machine.playGesture(req.name)
      }

      // Reconcile: sit/talk are commanded directly; otherwise speed drives
      // the gait mapping (hysteresis lives in locomotion).
      const desired = store.desiredState
      if (desired === 'sit' || desired === 'talk') {
        locomotion.setTargetSpeed(0)
        locomotion.update(dt)
        machine.setState(desired)
      } else {
        locomotion.setTargetSpeed(store.speed)
        locomotion.update(dt)
        machine.setState(locomotion.getGaitState())
      }
      machine.setLocomotionTimeScale(locomotion.getGaitTimeScale())
      machine.update(dt)

      if (isBird) {
        const target = desired === 'sit' ? 1 : 0
        sitW += (target - sitW) * (1 - Math.exp(-dt / 0.18))
        if (sitW > 1e-3) {
          for (const side of ['L', 'R'] as const) {
            const splay = (side === 'L' ? 1 : -1) * 14 * DEG
            const upper = boneByName.get(`upperLeg${side}`)
            const lower = boneByName.get(`lowerLeg${side}`)
            const foot = boneByName.get(`foot${side}`)
            if (upper) {
              upper.rotation.x -= 46 * DEG * sitW // past horizontal — toes tip up
              upper.rotation.z += splay * sitW // little V-spread, the AC toy sit
            }
            if (lower) lower.rotation.x -= 30 * DEG * sitW
            if (foot) foot.rotation.x -= 10 * DEG * sitW
          }
          const hips = boneByName.get('hips')
          if (hips) {
            const minY = hipsRest[1] * 0.66
            if (hips.position.y < minY) hips.position.y += (minY - hips.position.y) * sitW
          }
        }
      }

      // Talk driver lifecycle follows the desired state.
      if (desired === 'talk' && !talk.isTalking()) talk.start(makeSpeechSynthAmplitude(mulberry32(SOAK_SEED + 7)))
      if (desired !== 'talk' && talk.isTalking()) {
        talk.stop()
        useFaceRigStore.getState().rig?.setGaze(0, 0)
      }

      if (store.liveState !== machine.getState()) usePlayStore.setState({ liveState: machine.getState() })
    }

    const onPhysics = (dt: number) => {
      // Foot IK is a GROUND-CONTACT layer — while seated (or mid sit
      // transition) the folded legs violate its stance assumptions and the
      // stance-detector ↔ correction feedback thrashes the short bird legs
      // into a visible spin. Sit owns the leg pose; drop the anchors instead.
      if (machine.getState() === 'sit' || machine.isTransitioning()) {
        footIK.reset()
        return
      }
      // Keep the knee pole aligned with the (turning) character's forward.
      root.getWorldQuaternion(scratch.q)
      poleDir.set(0, 0, 1).applyQuaternion(scratch.q)
      footIK.update(dt)
    }

    const onProcedural = (dt: number) => {
      talk.update(dt)
      if (talk.isTalking()) {
        // Gaze mode "camera" while chatting: aim the pupils at the viewer.
        const faceRig = useFaceRigStore.getState().rig
        const head = boneByName.get('head')
        if (faceRig && head) {
          head.getWorldQuaternion(scratch.q)
          scratch.v.setFromMatrixPosition(head.matrixWorld)
          camera.getWorldPosition(scratch.w).sub(scratch.v).normalize()
          scratch.w.applyQuaternion(scratch.q.invert())
          faceRig.setGaze(scratch.w.x * GAZE_MAX * 1.6, scratch.w.y * GAZE_MAX * 1.6)
        }
      }
    }

    registerUpdate('animation', onAnimation)
    registerUpdate('physics', onPhysics)
    registerUpdate('procedural', onProcedural)

    return () => {
      unregisterUpdate('animation', onAnimation)
      unregisterUpdate('physics', onPhysics)
      unregisterUpdate('procedural', onProcedural)
      talk.stop()
      useFaceRigStore.getState().rig?.setGaze(0, 0)
      machine.dispose()
      mixer.stopAllAction()
      // Restore the assembly rest pose and snap the springs onto it.
      for (const { bone, position, quaternion } of snapshot) {
        bone.position.copy(position)
        bone.quaternion.copy(quaternion)
      }
      locomotion.reset()
      footIK.reset()
      rig?.reset()
      idle?.setChannels({ headBob: true, sway: true, microTurn: true })
      usePlayStore.setState({ liveState: 'idle' })
    }
  }, [character, animations, camera])

  return <PlayCamera />
}

/** Camera presets: follow / face close-up (orbit keeps the Stage's OrbitControls). */
function PlayCamera() {
  const preset = usePlayStore((s) => s.cameraPreset)
  const character = useMotionStudio((s) => s.character)
  const camera = useThree((s) => s.camera)
  const damping = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      goalPos: new THREE.Vector3(),
      goalLook: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      v: new THREE.Vector3(),
      initialized: false,
    }),
    [],
  )
  const presetRef = useRef(preset)
  if (presetRef.current !== preset) {
    presetRef.current = preset
    damping.initialized = false
  }

  useFrame((_, rawDt) => {
    if (preset === 'orbit' || !character) return
    const dt = Math.min(rawDt, 0.1)
    const root = character.root
    if (preset === 'follow') {
      root.getWorldQuaternion(damping.q)
      damping.goalPos
        .set(0, 0.62, -1.9) // behind and above (character faces +Z)
        .applyQuaternion(damping.q)
        .add(root.position)
      damping.goalLook.set(0, 0.5, 0).add(root.position)
    } else {
      const head = character.boneByName.get('head')
      if (!head) return
      head.getWorldQuaternion(damping.q)
      damping.v.setFromMatrixPosition(head.matrixWorld)
      damping.goalPos.set(0, 0.12, 1.15).applyQuaternion(damping.q).add(damping.v)
      damping.goalLook.copy(damping.v).add(damping.v.set(0, 0.06, 0).applyQuaternion(damping.q))
    }
    if (!damping.initialized) {
      damping.initialized = true
      damping.pos.copy(camera.position)
      damping.look.copy(damping.goalLook)
    }
    const k = 1 - Math.exp(-dt / (preset === 'face' ? 0.14 : 0.3))
    damping.pos.lerp(damping.goalPos, k)
    damping.look.lerp(damping.goalLook, k)
    camera.position.copy(damping.pos)
    camera.lookAt(damping.look)
  })

  return null
}

useGLTF.preload(clipsUrl)
