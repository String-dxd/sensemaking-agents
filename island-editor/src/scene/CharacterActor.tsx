import { useEffect, useRef, useState } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'
import type { CharacterClip } from '../models/characterAsset'
import { disposeObjectModel, useObjectModel } from '../models/useObjectModel'
import { hashString } from '../models/rand'
import { type IslandSpec, type PlacedObject, worldPositionOfObject } from '../terrain/terrainGrid'

interface CharacterActorProps {
  spec: IslandSpec
  object: PlacedObject
  blurred: Float32Array
  placeMode: boolean
  onRemove: (id: string) => void
  clip: CharacterClip
}

/**
 * The single placed character: a skinned, animated actor. Mirrors
 * `PlacedObjectMesh`'s group/hover/remove contract (PlacedObjects.tsx) but
 * swaps the static bounds-box hover highlight for one with FIXED dims (see
 * below) and adds a drei animation mixer bound to the clip cycler in
 * AnimationDock.
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

  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    action.reset().fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [actions, clip])

  const { x, y, z } = worldPositionOfObject(spec, o, blurred)

  const [hovered, setHovered] = useState(false)

  return (
    <group
      ref={groupRef}
      position={[x, y, z]}
      rotation={[0, o.yaw, 0]}
      // Same remove-on-pointer-down-in-place-mode precedence as
      // PlacedObjectMesh: terrain places on pointer-down, so we must
      // intercept the same event and stopPropagation() to win.
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!placeMode) return
        e.stopPropagation()
        onRemove(o.id)
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
