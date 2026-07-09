import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { disposeObjectModel, useObjectModel } from '../models/useObjectModel'
import { type IslandSpec, type ObjectKind, worldPositionOfObject } from '../terrain/terrainGrid'

interface PlaceGhostProps {
  spec: IslandSpec
  kind: ObjectKind
  /** Hovered cell (from IslandTerrain's onPlaceHover), or null when the pointer
   *  is off the terrain / out of bounds — the ghost hides. */
  cell: { c: number; r: number } | null
}

/** A translucent preview of the armed model kind, snapped to the hovered cell
 *  and sitting on the terrain height. GLB clones SHARE materials with every
 *  placed instance, so the ghost swaps in per-ghost material clones before
 *  making them transparent (mutating in place would ghost the whole island);
 *  `depthWrite` off stops the overlapping lobes from z-fighting the ghost
 *  against itself. On unmount the material clones are disposed, and geometry
 *  is released only for procedural kinds (disposeObjectModel skips shared). */
export function PlaceGhost({ spec, kind, cell }: PlaceGhostProps) {
  const model = useObjectModel(kind, 1)
  const swapped = useMemo(() => {
    const ghosts: THREE.Material[] = []
    const originals: THREE.Material[] = []
    model.traverse((n) => {
      if (!(n instanceof THREE.Mesh)) return
      const mats = Array.isArray(n.material) ? n.material : [n.material]
      const replacements = mats.map((m) => {
        originals.push(m)
        const g = m.clone()
        g.transparent = true
        g.opacity = 0.5
        g.depthWrite = false
        ghosts.push(g)
        return g
      })
      n.material = Array.isArray(n.material) ? replacements : replacements[0]
    })
    return { ghosts, originals }
  }, [model])

  useEffect(
    () => () => {
      for (const m of swapped.ghosts) m.dispose()
      // The swap orphaned the originals on procedural models — release them
      // (shared GLB originals still belong to the useGLTF cache: hands off).
      if (!model.userData.sharedAssets) for (const m of swapped.originals) m.dispose()
      disposeObjectModel(model)
    },
    [model, swapped],
  )

  if (!cell) return null
  const { x, y, z } = worldPositionOfObject(spec, { id: 'ghost', kind, c: cell.c, r: cell.r, yaw: 0, scale: 1 })
  return <primitive object={model} position={[x, y, z]} />
}
