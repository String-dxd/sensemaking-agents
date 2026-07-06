import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
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
