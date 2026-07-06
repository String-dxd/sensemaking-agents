import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildObjectModel } from '../models/buildObjectModel'
import { type IslandSpec, type ObjectKind, worldPositionOfObject } from '../terrain/terrainGrid'

interface PlaceGhostProps {
  spec: IslandSpec
  kind: ObjectKind
  /** Hovered cell (from IslandTerrain's onPlaceHover), or null when the pointer
   *  is off the terrain / out of bounds — the ghost hides. */
  cell: { c: number; r: number } | null
}

/** A translucent preview of the armed model kind, snapped to the hovered cell and
 *  sitting on the terrain height. `buildObjectModel` mints fresh materials per
 *  call, so we make them transparent in place (no clone needed); `depthWrite`
 *  off stops the overlapping lobes from z-fighting the ghost against itself. */
export function PlaceGhost({ spec, kind, cell }: PlaceGhostProps) {
  const model = useMemo(() => {
    const g = buildObjectModel(kind)
    g.traverse((n) => {
      if (!(n instanceof THREE.Mesh)) return
      const mats = Array.isArray(n.material) ? n.material : [n.material]
      for (const m of mats) {
        m.transparent = true
        m.opacity = 0.5
        m.depthWrite = false
      }
    })
    return g
  }, [kind])

  useEffect(
    () => () => {
      model.traverse((n) => {
        if (!(n instanceof THREE.Mesh)) return
        n.geometry.dispose()
        const mat = n.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      })
    },
    [model],
  )

  if (!cell) return null
  const { x, y, z } = worldPositionOfObject(spec, { id: 'ghost', kind, c: cell.c, r: cell.r, yaw: 0, scale: 1 })
  return <primitive object={model} position={[x, y, z]} />
}
