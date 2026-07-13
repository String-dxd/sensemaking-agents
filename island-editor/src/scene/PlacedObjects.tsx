import { useEffect, useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ClipSelection } from '../models/characterAsset'
import { hashString } from '../models/rand'
import { disposeObjectModel, useObjectModel } from '../models/useObjectModel'
import { blurredForSpec } from '../terrain/specCache'
import { type IslandSpec, type PlacedObject, worldPositionOfObject } from '../terrain/terrainGrid'
import { CharacterActor } from './CharacterActor'
import { useCanopyWind } from './useCanopyWind'

// Models are authored ~1 world-unit tall/footprint, so the per-object jitter
// scale multiplies directly. A single knob if the whole set reads too big/small.
const BASE_OBJECT_SCALE = 1.0

interface PlacedObjectsProps {
  spec: IslandSpec
  placeMode: boolean
  onRemove: (id: string) => void
  /** The dock's clip selection for the placed character ('auto' = behavior machine). */
  clip: ClipSelection
}

/** Render every placed object on the terrain. In place mode, a pointer-down on an
 *  object removes it (see the precedence note on `PlacedObjectMesh`). The
 *  `character` kind routes to `CharacterActor` (skeletal mixer) instead of the
 *  shared `PlacedObjectMesh`. */
export function PlacedObjects({ spec, placeMode, onRemove, clip }: PlacedObjectsProps) {
  // Blurred tier field for terrain-top height sampling; recomputed per spec edit.
  const blurred = useMemo(() => blurredForSpec(spec), [spec])
  return (
    <>
      {spec.objects.map((o) =>
        o.kind === 'character' ? (
          <CharacterActor
            key={o.id}
            spec={spec}
            object={o}
            blurred={blurred}
            placeMode={placeMode}
            onRemove={onRemove}
            clip={clip}
          />
        ) : (
          <PlacedObjectMesh
            key={o.id}
            spec={spec}
            object={o}
            blurred={blurred}
            placeMode={placeMode}
            onRemove={onRemove}
          />
        ),
      )}
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
  // (r3f does NOT auto-dispose a <primitive> object, so we dispose on unmount —
  // disposeObjectModel no-ops for shared GLB clones.)
  const model = useObjectModel(o.kind, hashString(o.id))
  useEffect(() => () => disposeObjectModel(model), [model])

  const { x, y, z } = worldPositionOfObject(spec, o, blurred)

  // Spring-damper wind on the crown (see wind.ts): the world position feeds the
  // traveling gust front, the object id seeds the flutter phase.
  useCanopyWind(model, o.id, x, z)

  // Hover target: in place mode (where a click removes), hovering any placed
  // object shows a soft translucent box around its bounds so it's unambiguous
  // what a click will hit. Bounds are model-local (measured at rest, before
  // wind sway) and live inside the transformed group, so the box tracks the
  // object's yaw/scale for free.
  const [hovered, setHovered] = useState(false)
  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    return { size, center }
  }, [model])

  return (
    <group
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
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!placeMode) return
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <primitive object={model} />
      {placeMode && hovered && (
        <mesh position={bounds.center} raycast={() => null}>
          <boxGeometry args={[bounds.size.x * 1.06, bounds.size.y * 1.06, bounds.size.z * 1.06]} />
          <meshBasicMaterial color={0xfff0a8} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
