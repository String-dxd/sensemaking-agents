import { useEffect, useMemo, useRef, useState } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { CharacterClip, ClipSelection } from '../models/characterAsset'
import {
  advanceBehavior,
  type BehaviorEnv,
  type BehaviorState,
  behaviorClip,
  commandMoveTo,
  createBehaviorState,
  sampleShoreDistance,
  triggerTalk,
} from '../models/characterBehavior'
import { characterCommand } from './characterCommand'
import { disposeObjectModel, useObjectModel } from '../models/useObjectModel'
import { hashString, mulberry32 } from '../models/rand'
import { shoreDistanceField } from '../terrain/shoreField'
import { evaluateHeight, type IslandSpec, type PlacedObject, worldPositionOfObject } from '../terrain/terrainGrid'
import { characterPose } from './characterPose'

interface CharacterActorProps {
  spec: IslandSpec
  object: PlacedObject
  blurred: Float32Array
  placeMode: boolean
  onRemove: (id: string) => void
  clip: ClipSelection
}

/** How far below the waterline the group sits while swimming — waterline at
 *  the chick's belly (look knob; the clip is horizontal, no pitch needed). */
const SWIM_SINK = 0.12

/**
 * The single placed character: a skinned, animated actor. Mirrors
 * `PlacedObjectMesh`'s group/hover/remove contract (PlacedObjects.tsx) but
 * swaps the static bounds-box hover highlight for one with FIXED dims (see
 * below) and adds a drei animation mixer bound to the clip cycler in
 * AnimationDock.
 *
 * Plan 025: when the dock selects 'auto' (the default) the pure behavior
 * machine (characterBehavior.ts) drives position/yaw/clip from useFrame —
 * wander, wave, sleep/wake, swim with a shore leash, click-to-talk. Picking
 * a concrete clip freezes the chick where it stands and loops that clip.
 * Movement is runtime-only: the spec keeps the placed cell as "home".
 */
export function CharacterActor({ spec, object: o, blurred, placeMode, onRemove, clip }: CharacterActorProps) {
  // The scaled wrapper group from useObjectModel's character branch (a
  // SkeletonUtils clone inside, normalized to CHARACTER_HEIGHT).
  const model = useObjectModel('character', hashString(o.id))
  useEffect(() => () => disposeObjectModel(model), [model])

  const groupRef = useRef<THREE.Group>(null)
  // useGLTF is cache-only here — the asset itself was already loaded (and
  // preloaded) by useObjectModel's shared useGLTF(GLB_URL_LIST) call.
  const { animations } = useGLTF('/models/character.glb')
  // Bind clips against the clone reachable from groupRef: SkeletonUtils.clone
  // preserves bone NAMES, and drei's mixer resolves clip tracks by walking the
  // root's descendants looking for those names — it doesn't matter that
  // groupRef is an ancestor of the actual skinned node, not the node itself.
  const { actions } = useAnimations(animations, groupRef)

  // The behavior env: pure terrain queries + a seeded stream (NO Math.random).
  // Rebuilt per spec edit — the shore field is the same one the sea shader
  // derives its foam from, recomputed on the same trigger.
  const shore = useMemo(() => shoreDistanceField(spec.grid, spec.worldSize), [spec])
  const env = useMemo<BehaviorEnv>(
    () => ({
      heightAt: (x: number, z: number) => evaluateHeight(spec, x, z, blurred),
      shoreDistanceAt: (x: number, z: number) => sampleShoreDistance(shore, spec.worldSize, x, z),
      seaLevel: spec.seaLevel,
      worldSize: spec.worldSize,
      rand: mulberry32(hashString(o.id) ^ 0x9e3779b9),
    }),
    [spec, blurred, shore, o.id],
  )

  // Home = the placed cell's terrain top (what the spec stores). The behavior
  // state lives in a ref (per-frame mutation, no re-renders) and RESETS when
  // the character is re-placed (id or home cell change) — the walk restarts
  // from home. Terrain edits elsewhere deliberately do not reset it.
  const home = worldPositionOfObject(spec, o, blurred)
  const stateRef = useRef<BehaviorState | null>(null)
  // Rate-limited vertical blend (plan 027): the ground↔draught change eases
  // at 10/s instead of popping when the swim starts/ends at the shoreline.
  const smoothY = useRef<number | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on id + home cell by design
  useEffect(() => {
    const { x, z } = worldPositionOfObject(spec, o, blurred)
    stateRef.current = createBehaviorState(x, z, o.yaw, mulberry32(hashString(o.id)))
    smoothY.current = null // re-place snaps to the new ground, no glide (plan 027)
  }, [o.id, o.c, o.r])

  // Mark the live pose inactive when the character is removed so the grass
  // fade disc falls back to the spec-written uniform (plan 024) and the sea
  // wake shuts off (plan 027).
  useEffect(
    () => () => {
      characterPose.active = false
      characterPose.swimming = false
    },
    [],
  )

  // Wind-down under prefers-reduced-motion: no autonomous movement (same
  // matchMedia-once pattern as GrassLayer).
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // The clip actually playing. The phase lives in a ref, so the RESOLVED clip
  // is mirrored into state from useFrame only when it changes (cheap string
  // compare) — that drives the existing crossfade effect below.
  const [resolvedClip, setResolvedClip] = useState<CharacterClip>(clip === 'auto' ? 'Walking' : clip)
  const resolvedRef = useRef<CharacterClip>(resolvedClip)

  // Click-to-move command channel (plan 026). Initialized to the CURRENT seq
  // at mount so stale pre-mount clicks never fire.
  const lastSeq = useRef(characterCommand.seq)

  useFrame((_, dt) => {
    const group = groupRef.current
    const s = stateRef.current
    if (!group || !s) return

    if (reduce) {
      // No movement: pin to home, keep the pose store honest, skip the rest.
      group.position.set(home.x, home.y, home.z)
      group.rotation.y = o.yaw
      characterPose.x = home.x
      characterPose.y = home.y
      characterPose.z = home.z
      characterPose.active = true
      characterPose.swimming = false
      return
    }

    // Consume a pending click-to-move command (by sequence number). Under a
    // manual override the seq is still synced — commands are swallowed, not
    // queued for when Auto resumes.
    if (characterCommand.seq !== lastSeq.current) {
      lastSeq.current = characterCommand.seq
      if (clip === 'auto') commandMoveTo(s, characterCommand.x, characterCommand.z)
    }

    // Manual override (concrete dock clip): freeze in place — do not advance;
    // the position stays wherever the walk left it. 'auto' runs the machine.
    if (clip === 'auto') advanceBehavior(s, dt, env)

    // Resolve y: land follows the terrain (cliff edges snap — accepted until a
    // jump clip exists); swimming (incl. a wet goto) sits at a fixed draught.
    // The ground↔draught switch is BLENDED at 10/s (plan 027) so entering or
    // leaving the water never pops the body vertically.
    const swimming = s.phase === 'swim' || (s.phase === 'goto' && s.wet)
    const ground = env.heightAt(s.x, s.z)
    const targetY = swimming ? spec.seaLevel - SWIM_SINK : ground
    smoothY.current =
      smoothY.current === null ? targetY : smoothY.current + (targetY - smoothY.current) * Math.min(1, 10 * dt)
    group.position.set(s.x, smoothY.current, s.z)
    group.rotation.y = s.yaw

    // Live pose for the grass fade disc (GrassLayer) and the sea wake rings
    // (SeaSurface, plan 027). The y written is the BLENDED, visible one.
    characterPose.x = s.x
    characterPose.y = smoothY.current
    characterPose.z = s.z
    characterPose.active = true
    characterPose.swimming = swimming

    const next = clip === 'auto' ? behaviorClip(s) : clip
    if (next !== resolvedRef.current) {
      resolvedRef.current = next
      setResolvedClip(next)
    }
  })

  useEffect(() => {
    const action = actions[resolvedClip]
    if (!action) return
    action.reset().fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [actions, resolvedClip])

  const [hovered, setHovered] = useState(false)

  return (
    <group
      ref={groupRef}
      position={[home.x, home.y, home.z]}
      rotation={[0, o.yaw, 0]}
      // Same remove-on-pointer-down-in-place-mode precedence as
      // PlacedObjectMesh: terrain places on pointer-down, so we must
      // intercept the same event and stopPropagation() to win. Outside place
      // mode, a pointer-down means "talk to me" (plan 025) — stopPropagation
      // also keeps the paint tools from painting under the chick.
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (placeMode) {
          e.stopPropagation()
          onRemove(o.id)
          return
        }
        e.stopPropagation()
        if (stateRef.current) triggerTalk(stateRef.current)
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!placeMode) return
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <primitive object={model} />
      {placeMode && hovered && (
        // Box3.setFromObject would read the skinned clone's quantized raw
        // vertex range (±32767) instead of true bounds — the dequantization
        // correction lives in the skin's inverse-bind matrices, not on any
        // node Box3 can see (see the AMENDMENT note in useObjectModel.ts /
        // characterAsset.ts). So these dims are FIXED, derived from the
        // asset's known source bounds (1.56 × 1.62 × 1.24) times the
        // CHARACTER_HEIGHT/CHARACTER_SOURCE_HEIGHT normalization (≈0.370),
        // with the same 6% hover padding PlacedObjectMesh applies.
        <mesh position={[0, 0.31, 0]} raycast={() => null}>
          <boxGeometry args={[0.61, 0.63, 0.49]} />
          <meshBasicMaterial color={0xfff0a8} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
