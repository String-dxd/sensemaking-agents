import { useTexture } from '@react-three/drei'
import { Suspense, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { resolveAtlasUrls } from '../../core/face/atlasRegistry'
import { createFaceRig, type FacePlacement, type FaceRig as FaceRigHandle } from '../../core/face/faceRig'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { useCharacterStore } from '../state/characterStore'

/**
 * Shared handle to the live rig so DOM-side panels (FacePanel) can drive it.
 * null while textures load or when no rig is mounted.
 */
export const useFaceRigStore = create<{ rig: FaceRigHandle | null }>(() => ({ rig: null }))

export interface FaceRigProps {
  headRadius: number
  /** Per-archetype angular placement overrides (plan 006 anchor config). */
  placement?: Partial<FacePlacement>
  /** Beak parts ARE the mouth — hide the drawn mouth plane (plan 006). */
  hideMouth?: boolean
}

function FaceRigInner({ headRadius, placement, hideMouth = false }: FaceRigProps) {
  const groupRef = useRef<THREE.Group>(null)
  // Personality-authored atlas set (plan 006 step 3b): the spec's atlasId
  // picks the registered 관상 variant; unknown ids fall back to face-v1.
  const atlasId = useCharacterStore((s) => s.spec.face.atlasId)
  const urls = resolveAtlasUrls(atlasId)
  const [eye, pupil, brow, mouth] = useTexture([urls.eye, urls.pupil, urls.brow, urls.mouth])

  useEffect(() => {
    const parent = groupRef.current
    if (!parent) return
    for (const texture of [eye, pupil, brow, mouth]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
    }
    const rig = createFaceRig(parent, {
      headRadius,
      rng: Math.random, // Math.random stays outside src/core/** — injected here
      textures: { eye, pupil, brow, mouth },
      placement,
    })
    const update = (dt: number) => rig.update(dt)
    registerUpdate('procedural', update)
    // FacePanel re-syncs expression + blink interval from the spec whenever
    // the store's rig handle changes, so a rebuilt rig never resets to defaults.
    useFaceRigStore.setState({ rig })
    return () => {
      unregisterUpdate('procedural', update)
      useFaceRigStore.setState({ rig: null })
      rig.dispose()
    }
  }, [headRadius, placement, eye, pupil, brow, mouth])

  useEffect(() => {
    const mouthPlane = groupRef.current?.getObjectByName('mouth')
    if (mouthPlane) mouthPlane.visible = !hideMouth
  })

  return <group ref={groupRef} />
}

/**
 * Mounts the drawn-face rig as a child of the head anchor (local origin =
 * head-sphere centre) and ticks it in the frame loop's `procedural` phase.
 */
export function FaceRig(props: FaceRigProps) {
  return (
    <Suspense fallback={null}>
      <FaceRigInner {...props} />
    </Suspense>
  )
}
