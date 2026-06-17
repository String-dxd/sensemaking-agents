import * as THREE from 'three'

// AC-style toon look: convert the GLB's standard materials to MeshToonMaterial
// with a 3-step gradient ramp (the closest built-in to AC's 2-3 tone shading),
// and recolor the bird's feather materials by the config's palette.
// (Outline pass is added at the scene layer via drei <Outlines>.)

/** A small N-step luminance ramp sampled with NearestFilter → hard toon bands. */
export function makeToonGradient(steps = 3): THREE.DataTexture {
  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) data[i] = Math.round((i / (steps - 1)) * 255)
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Replace every mesh material with a MeshToonMaterial, preserving color + map + name. */
export function applyToonMaterials(root: THREE.Object3D, gradientMap: THREE.Texture): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const toon = materialsOf(mesh).map((m) => {
      const src = m as THREE.MeshStandardMaterial
      const t = new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color('#ffffff'),
        map: src.map ?? null,
        gradientMap,
      })
      t.name = src.name
      return t
    })
    mesh.material = Array.isArray(mesh.material) ? toon : toon[0]
  })
}

// Feather recolor: which GLB material names take the body vs accent tint.
const FEATHER_TINTS: Record<string, 'body' | 'accent'> = {
  MB_BodyYellow: 'body',
  MB_HeadOrange: 'body',
  Uniform_TieStriped: 'accent',
}

export function recolorFeathers(
  root: THREE.Object3D,
  palette: { body: string; accent: string },
): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of materialsOf(mesh)) {
      const slot = FEATHER_TINTS[m.name]
      if (!slot) continue
      ;(m as THREE.MeshToonMaterial).color.set(palette[slot])
      m.needsUpdate = true
    }
  })
}
