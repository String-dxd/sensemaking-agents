// Ported from island-editor/src/models/toonMaterial.ts — behavior kept in sync
// via shared test vectors (see State/islandSpecCore/terrainGrid.ts).
//
// BOTW-style banding: a tiny NearestFilter ramp quantizes N·L into steps —
// dark base, mid band, lit top. Keep the darkest step well above 0 so shade
// reads cool-tinted by the hemisphere light, never black — same intent as the
// terrain shader's sky ambient. (Toon gradient maps need explicit
// NearestFilter / no mipmaps — r149 note in the world-port plan.)

import * as THREE from 'three'

let sharedRamp: THREE.DataTexture | null = null
export function objectGradientMap(): THREE.DataTexture {
  if (sharedRamp) return sharedRamp
  const data = new Uint8Array([115, 115, 115, 255, 200, 200, 200, 255, 255, 255, 255, 255])
  sharedRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  sharedRamp.minFilter = THREE.NearestFilter
  sharedRamp.magFilter = THREE.NearestFilter
  sharedRamp.generateMipmaps = false
  sharedRamp.needsUpdate = true
  return sharedRamp
}

/** Convert every mesh material under `root` to MeshToonMaterial IN PLACE,
 *  preserving map / vertexColors / color / transparency / side / name.
 *  Idempotent (safe to call on the same cached scene more than once) — this
 *  is called on the shared loadGlb-cached scenes, so all clones share the
 *  converted materials and the never-dispose-shared rule holds. */
export function applyToonMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const converted = mats.map((m) => {
      if ((m as THREE.MeshToonMaterial).isMeshToonMaterial) return m
      const src = m as THREE.MeshStandardMaterial
      const toon = new THREE.MeshToonMaterial({
        map: src.map ?? null,
        color: src.color?.clone() ?? new THREE.Color(0xffffff),
        vertexColors: src.vertexColors ?? false,
        transparent: src.transparent ?? false,
        opacity: src.opacity ?? 1,
        side: src.side ?? THREE.FrontSide,
        gradientMap: objectGradientMap(),
      })
      toon.name = src.name
      return toon
    })
    mesh.material = Array.isArray(mesh.material) ? converted : (converted[0] as THREE.Material)
  })
}
