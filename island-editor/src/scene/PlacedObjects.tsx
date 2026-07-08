import { useEffect, useMemo } from 'react'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildObjectModel } from '../models/buildObjectModel'
import { hashString } from '../models/rand'
import { blurTiers, type IslandSpec, type PlacedObject, worldPositionOfObject } from '../terrain/terrainGrid'

// Models are authored ~1 world-unit tall/footprint, so the per-object jitter
// scale multiplies directly. A single knob if the whole set reads too big/small.
const BASE_OBJECT_SCALE = 1.0

/** Dispose every geometry + material under a group (r3f does NOT auto-dispose an
 *  object passed via <primitive>, so we do it on unmount / remove). */
function disposeModel(model: THREE.Object3D) {
  model.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return
    n.geometry.dispose()
    const mat = n.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
  })
}

interface PlacedObjectsProps {
  spec: IslandSpec
  placeMode: boolean
  onRemove: (id: string) => void
}

/** Render every placed object on the terrain. In place mode, a pointer-down on an
 *  object removes it (see the precedence note on `PlacedObjectMesh`). */
export function PlacedObjects({ spec, placeMode, onRemove }: PlacedObjectsProps) {
  // Blurred tier field for terrain-top height sampling; recomputed per spec edit.
  const blurred = useMemo(() => blurTiers(spec.grid), [spec])
  return (
    <>
      {spec.objects.map((o) => (
        <PlacedObjectMesh
          key={o.id}
          spec={spec}
          object={o}
          blurred={blurred}
          placeMode={placeMode}
          onRemove={onRemove}
        />
      ))}
    </>
  )
}

interface PlacedObjectMeshProps {
  spec: IslandSpec
  object: PlacedObject
  blurred: Float32Array
  placeMode: boolean
  onRemove: (id: string) => void
}

function PlacedObjectMesh({ spec, object: o, blurred, placeMode, onRemove }: PlacedObjectMeshProps) {
  // Deterministic per id: the same object re-derives the same silhouette on
  // reload; stable across spec ticks so terrain edits don't rebuild the model.
  const model = useMemo(() => buildObjectModel(o.kind, hashString(o.id)), [o.kind, o.id])
  useEffect(() => () => disposeModel(model), [model])

  // Wind sway of the crown. Tree kinds carry a 'canopy' sub-group with a
  // per-kind stiffness in userData.windAmp (fruitTree 1, palm 0.7, pine 0.35);
  // bush/rock resolve undefined → no-op. A slow gust envelope swells and eases
  // the sway, a faster low-amplitude term adds flutter, and a subtle vertical
  // "breathing" makes the crown feel alive. Phase is derived from the object id
  // so neighbouring trees sway out of phase; frozen under prefers-reduced-motion.
  // Render-layer only — the deterministic builder never sees time.
  const canopy = useMemo(() => model.getObjectByName('canopy'), [model])
  const phase = useMemo(() => ((hashString(o.id) % 1000) / 1000) * Math.PI * 2, [o.id])
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame((state) => {
    if (!canopy || reduce) return
    const t = state.clock.elapsedTime
    const amp = (canopy.userData.windAmp as number | undefined) ?? 1
    const gust = 0.6 + 0.4 * Math.sin(t * 0.23 + phase)
    canopy.rotation.z = (Math.sin(t * 1.1 + phase) * 0.045 + Math.sin(t * 2.3 + phase * 1.7) * 0.012) * gust * amp
    canopy.rotation.x = Math.cos(t * 0.9 + phase) * 0.03 * gust * amp
    canopy.scale.y = 1 + 0.02 * Math.sin(t * 1.7 + phase) * amp
  })

  const { x, y, z } = worldPositionOfObject(spec, o, blurred)
  return (
    <primitive
      object={model}
      position={[x, y, z]}
      rotation={[0, o.yaw, 0]}
      scale={o.scale * BASE_OBJECT_SCALE}
      // Remove on POINTER-DOWN (not click): the terrain places on pointer-down,
      // so we must intercept the same event and stopPropagation() to win — a
      // click (pointer-up) would fire AFTER the terrain already placed. The
      // object sits above the ground, so it is the nearer raycast hit and its
      // handler runs first. Only in place mode (terraform clicks never delete).
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!placeMode) return
        e.stopPropagation()
        onRemove(o.id)
      }}
    />
  )
}
