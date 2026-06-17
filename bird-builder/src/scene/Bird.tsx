import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import type { BirdConfig } from '../bird/birdConfig'
import { NONE_ITEM, SLOTS } from '../bird/slots'
import { prepareBase } from '../rig/loadBird'
import { applyToonMaterials, makeToonGradient, recolorFeathers } from '../rig/toon'
import { Clothing } from './Clothing'

// V1 base = the canonical rigged bird, reused from the repo-root public/ via the
// studio's publicDir. Draco decoder served from /draco/ (the GLB happens to be
// uncompressed, so the decoder is configured-but-unused — harmless).
const GLB = '/birds/MaskedBower.glb'
const DRACO = '/draco/'

export function Bird({ config }: { config: BirdConfig }) {
  const { scene: gltfScene } = useGLTF(GLB, DRACO)
  const gradient = useMemo(() => makeToonGradient(3), [])

  // Clone + toon-ify once per loaded GLB (the useGLTF result is cache-stable).
  const prepared = useMemo(() => {
    const p = prepareBase(gltfScene)
    applyToonMaterials(p.scene, gradient)
    return p
  }, [gltfScene, gradient])

  // Re-tint feathers whenever the palette changes (idempotent color.set).
  useLayoutEffect(() => {
    recolorFeathers(prepared.scene, config.featherPalette)
  }, [prepared, config.featherPalette])

  return (
    <>
      <primitive object={prepared.scene} />
      {SLOTS.map((slot) => {
        const state = config.slots[slot.id]
        if (!state || state.itemId === NONE_ITEM) return null
        const node = prepared.attachNodes[slot.id]
        if (!node) return null
        return <Clothing key={slot.id} state={state} attachNode={node} gradient={gradient} />
      })}
    </>
  )
}

useGLTF.preload(GLB, DRACO)
