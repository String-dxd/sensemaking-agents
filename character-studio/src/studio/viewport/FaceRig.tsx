import { useTexture } from '@react-three/drei'
import { Suspense, useEffect } from 'react'
import type * as THREE from 'three'
import { create } from 'zustand'
import { resolveAtlasUrls, resolveFaceAtlasId } from '../../core/face/atlasRegistry'
import {
  type CanvasSourceLike,
  createFaceCompositor,
  DEFAULT_PLACEMENT,
  type FacePlacement,
} from '../../core/face/faceComposite'
import { createFaceRig, type FaceRig as FaceRigHandle } from '../../core/face/faceRig'
import { setFaceMap, type ToonMaterial } from '../../core/materials/toonMaterial'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { useCharacterStore } from '../state/characterStore'

/**
 * Shared handle to the live rig so DOM-side panels (FacePanel) can drive it.
 * null while textures load or when no rig is mounted.
 */
export const useFaceRigStore = create<{ rig: FaceRigHandle | null }>(() => ({ rig: null }))

export interface FaceRigProps {
  /** The body region's toon material — the face overlay draws into its head
   * UVs via setFaceMap (advisor plan 002: no more floating face planes). */
  bodyMaterial: ToonMaterial
  /** Per-archetype angular placement overrides (plan 006 anchor config). */
  placement?: Partial<FacePlacement>
  /** Beak parts ARE the mouth — draw no mouth (plan 006). */
  hideMouth?: boolean
  /** Assembled lower-mandible meshes; the rig hinges these while talking. */
  beakJaw?: THREE.Mesh[]
}

/** Max jaw drop (radians about the muzzle socket's x-axis). */
const JAW_MAX_RAD = 0.38

function FaceRigInner({ bodyMaterial, placement, hideMouth = false, beakJaw }: FaceRigProps) {
  // Class-aware atlas set (plan 006 step 3b + plan 022): personality picks the
  // 관상 variant; bird archetypes swap to the AC bird-eye set (big glossy
  // ovals) derived from archetype + personality. Mammals keep the spec's
  // stored atlasId. Unknown ids fall back to face-v1 in resolveAtlasUrls.
  const archetype = useCharacterStore((s) => s.spec.meta.archetype)
  const personality = useCharacterStore((s) => s.spec.meta.personality)
  const storedAtlasId = useCharacterStore((s) => s.spec.face.atlasId)
  const urls = resolveAtlasUrls(resolveFaceAtlasId(archetype, personality, storedAtlasId))
  const [eye, pupil, brow, mouth] = useTexture([urls.eye, urls.pupil, urls.brow, urls.mouth])

  useEffect(() => {
    // Texture.image is typed `unknown`; loaded atlas PNGs are Image/ImageBitmap
    // sources, which is exactly what the compositor's drawImage consumes.
    const image = (t: { image: unknown }) => t.image as CanvasSourceLike
    const compositor = createFaceCompositor({
      images: { eye: image(eye), pupil: image(pupil), brow: image(brow), mouth: image(mouth) },
      placement: { ...DEFAULT_PLACEMENT, ...placement },
    })
    const rig = createFaceRig({
      compositor,
      rng: Math.random, // Math.random stays outside src/core/** — injected here
      hideMouth,
      applyTexture: (texture) => setFaceMap(bodyMaterial, texture),
      // hinge at the attach bone: +x rotation drops the mandible tip
      applyJaw: beakJaw?.length
        ? (open01) => {
            for (const jaw of beakJaw) jaw.rotation.x = open01 * JAW_MAX_RAD
          }
        : undefined,
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
  }, [bodyMaterial, placement, hideMouth, beakJaw, eye, pupil, brow, mouth])

  return null
}

/**
 * Owns the drawn-face lifecycle: builds the compositor from the loaded atlas
 * textures, attaches its overlay texture to the body toon material, and ticks
 * the rig in the frame loop's `procedural` phase. Renders no scene objects —
 * the face lives in the head mesh's own material.
 */
export function FaceRig(props: FaceRigProps) {
  return (
    <Suspense fallback={null}>
      <FaceRigInner {...props} />
    </Suspense>
  )
}
