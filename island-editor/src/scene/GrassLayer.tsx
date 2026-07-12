import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { applyToonMaterials } from '../models/toonMaterial'
import { grassInstanceTransforms } from '../terrain/grassField'
import type { IslandSpec } from '../terrain/terrainGrid'

const UP = new THREE.Vector3(0, 1, 0)

/** Renders every grass-painted cell (see grassField.grassInstanceTransforms) as
 *  one instance of the grass.glb tuft mesh — a single InstancedMesh draw call
 *  regardless of how many cells are painted (up to the grid's cell count),
 *  instead of per-tuft <primitive> clones (which would defeat the perf design
 *  the same way PlacedObjects' per-object clones are fine only because objects
 *  are sparse; painted grass can cover the whole island).
 *
 *  Meshopt quantization caveat (see useObjectModel.ts): meshopt parks its
 *  dequantization translate+scale on the node HOLDING the mesh — for grass.glb
 *  that's the 'tuft' node, not the mesh itself — so that node's matrixWorld
 *  must be folded into every instance matrix, or every tuft would sit offset
 *  and undersized relative to its painted cell. */
export function GrassLayer({ spec }: { spec: IslandSpec }) {
  const gltf = useGLTF('/models/grass.glb')

  const { geometry, material, dequant } = useMemo(() => {
    let mesh: THREE.Mesh | undefined
    // Toon-convert the CACHED scene in place (idempotent) before extracting
    // the material, so the InstancedMesh renders toon too (plan 019).
    applyToonMaterials(gltf.scene)
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((n) => {
      if (!mesh && (n as THREE.Mesh).isMesh) mesh = n as THREE.Mesh
    })
    if (!mesh) throw new Error('grass.glb has no mesh')
    return {
      geometry: mesh.geometry,
      material: mesh.material as THREE.Material,
      dequant: mesh.matrixWorld.clone(),
    }
  }, [gltf])

  const meshRef = useRef<THREE.InstancedMesh>(null)
  // Upper bound on painted cells (grid cols × rows); `count` is set to the
  // actual painted-cell total below, so unused instance slots simply don't draw.
  const capacity = spec.grid.cols * spec.grid.rows

  useEffect(() => {
    const im = meshRef.current
    if (!im) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const transforms = grassInstanceTransforms(spec)
    transforms.forEach((t, idx) => {
      p.set(t.x, t.y, t.z)
      q.setFromAxisAngle(UP, t.yaw)
      s.setScalar(t.scale)
      // Compose the placement transform, then fold in the mesh-holder node's
      // dequantization matrix so the tuft's authored offset/scale survives.
      m.compose(p, q, s).multiply(dequant)
      im.setMatrixAt(idx, m)
    })
    im.count = transforms.length
    im.instanceMatrix.needsUpdate = true
  }, [spec, dequant])

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      castShadow
      receiveShadow
      frustumCulled={false} // instance bounds aren't tracked; the island is always in frame
      raycast={() => null} // never intercept paint/place picks
    />
  )
}
useGLTF.preload('/models/grass.glb')
