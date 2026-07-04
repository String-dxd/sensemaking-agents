import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import type { BuildMode } from '../bird/buildPlan'
import type { BirdGenome, GlbBase, ProceduralBase } from '../bird/genome'
import { NONE_ITEM, SLOTS } from '../bird/slots'
import { buildBird } from '../rig/buildBird'
import { prepareBase } from '../rig/loadBird'
import { applyToonMaterials, makeToonGradient, recolorZones } from '../rig/toon'
import { Clothing } from './Clothing'

// Draco decoder served from /draco/ (the GLB is uncompressed, so configured-but-
// unused — harmless). The GLB lane is the legacy/upgrade path; the procedural
// lane is the default and where variety lives.
const DRACO = '/draco/'

// The procedural bird is authored in ~unit scale (head at y≈1.3); this frames it
// on the turntable next to the camera/target the studio already uses.
const DISPLAY_SCALE = 0.55

export function Bird({ config, mode }: { config: BirdGenome; mode: BuildMode }) {
  return config.base.kind === 'procedural' ? (
    <ProceduralBirdView base={config.base} slots={config.slots} mode={mode} />
  ) : (
    <GlbBirdView base={config.base} slots={config.slots} />
  )
}

// ── Procedural lane (the default) ───────────────────────────────────────────────
function ProceduralBirdView({ base, slots, mode }: { base: ProceduralBase; slots: BirdGenome['slots']; mode: BuildMode }) {
  const gradient = useMemo(() => makeToonGradient(3), [])

  // Rebuild the whole bird on any base OR build-mode change (one character on
  // screen — cheap), keyed on a structural signature. dispose() the prior build
  // to free the 1024×512 face CanvasTexture + geometry (port-bug #4).
  const baseKey = useMemo(() => JSON.stringify(base), [base])
  const built = useMemo(() => buildBird(base, gradient, mode), [baseKey, gradient, mode])
  useEffect(() => () => built.dispose(), [built])
  useFrame((state) => built.update(state.clock.elapsedTime))

  return (
    <group scale={DISPLAY_SCALE}>
      <primitive object={built.root} />
      {SLOTS.map((slot) => {
        const state = slots[slot.id]
        if (!state || state.itemId === NONE_ITEM) return null
        const node = built.attach[slot.id as keyof typeof built.attach]
        if (!node) return null
        // Key on the build identity so a bird rebuild REMOUNTS the portal into
        // the fresh attach node — createPortal does not re-render on a changed
        // container, so an update alone would drop the worn item (see Clothing).
        return <Clothing key={`${slot.id}:${baseKey}:${mode}`} state={state} attachNode={node} gradient={gradient} />
      })}
    </group>
  )
}

// ── GLB lane (legacy masked hero + the future authored-asset upgrade path) ──────
function GlbBirdView({ base, slots }: { base: GlbBase; slots: BirdGenome['slots'] }) {
  const { scene: gltfScene } = useGLTF(base.glbUrl, DRACO)
  const gradient = useMemo(() => makeToonGradient(3), [])

  const prepared = useMemo(() => {
    const p = prepareBase(gltfScene)
    applyToonMaterials(p.scene, gradient)
    return p
  }, [gltfScene, gradient])

  useLayoutEffect(() => {
    recolorZones(prepared.scene, base.palette)
  }, [prepared, base.palette])

  return (
    <>
      <primitive object={prepared.scene} />
      {SLOTS.map((slot) => {
        const state = slots[slot.id]
        if (!state || state.itemId === NONE_ITEM) return null
        const node = prepared.attachNodes[slot.id]
        if (!node) return null
        return <Clothing key={slot.id} state={state} attachNode={node} gradient={gradient} />
      })}
    </>
  )
}

useGLTF.preload('/birds/MaskedBower.glb', DRACO)
