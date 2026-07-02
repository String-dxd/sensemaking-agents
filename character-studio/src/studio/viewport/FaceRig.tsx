import { useTexture } from '@react-three/drei'
import { Suspense, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { createFaceRig, type FaceRig as FaceRigHandle } from '../../core/face/faceRig'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'

// Vite resolves these to hashed asset URLs; new URL() keeps tsconfig free of
// module declarations for *.png.
const EYE_URL = new URL('../../assets/face/eye-atlas.png', import.meta.url).href
const PUPIL_URL = new URL('../../assets/face/pupil-atlas.png', import.meta.url).href
const BROW_URL = new URL('../../assets/face/brow-atlas.png', import.meta.url).href
const MOUTH_URL = new URL('../../assets/face/mouth-atlas.png', import.meta.url).href

/**
 * Shared handle to the live rig so DOM-side panels (FacePanel) can drive it.
 * null while textures load or when no rig is mounted.
 */
export const useFaceRigStore = create<{ rig: FaceRigHandle | null }>(() => ({ rig: null }))

function FaceRigInner({ headRadius }: { headRadius: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const [eye, pupil, brow, mouth] = useTexture([EYE_URL, PUPIL_URL, BROW_URL, MOUTH_URL])

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
    })
    const update = (dt: number) => rig.update(dt)
    registerUpdate('procedural', update)
    useFaceRigStore.setState({ rig })
    return () => {
      unregisterUpdate('procedural', update)
      useFaceRigStore.setState({ rig: null })
      rig.dispose()
    }
  }, [headRadius, eye, pupil, brow, mouth])

  return <group ref={groupRef} />
}

/**
 * Mounts the drawn-face rig as a child of the head mesh (local origin =
 * head-sphere centre) and ticks it in the frame loop's `procedural` phase.
 */
export function FaceRig({ headRadius }: { headRadius: number }) {
  return (
    <Suspense fallback={null}>
      <FaceRigInner headRadius={headRadius} />
    </Suspense>
  )
}
