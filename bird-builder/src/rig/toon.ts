import * as THREE from 'three'
import type { PlumagePalette } from '../bird/genome'

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

// The shared toon-material factory. The procedural bird port needs more than a
// flat color: the wing bakes a back→accent gradient into VERTEX COLORS, and the
// head wears a CANVAS-PAINTED face as a `map`. A narrow (color, gradient) factory
// would silently drop both (flat wings, no face) — so this takes an options bag.
// (Stress-test port-bug #1.)
export interface ToonMatOptions {
  gradientMap: THREE.Texture
  color?: THREE.ColorRepresentation
  /** A painted texture (e.g. the canvas face). sRGB by default — see below. */
  map?: THREE.Texture | null
  vertexColors?: boolean
  side?: THREE.Side
  /** Material name so recolor passes can find it (e.g. 'base' / 'accent' / a zone). */
  name?: string
}

export function toonMat(opts: ToonMatOptions): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: opts.color ?? '#ffffff',
    gradientMap: opts.gradientMap,
    map: opts.map ?? null,
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
  })
  // three r150+ flipped default texture color management; the Kira face painter
  // predates it (r149). A painted sRGB canvas renders washed-out/dark unless we
  // tag it. (Stress-test port-bug #3.)
  if (opts.map) opts.map.colorSpace = THREE.SRGBColorSpace
  if (opts.name) m.name = opts.name
  return m
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

// GLB recolor: which authored material names take which of the 6 plumage zones.
// The masked GLB only names body + tie materials; the other zones (belly/beak/
// legs/eye) simply have no target until a hero GLB authored to the ASSET-CONTRACT
// names them. (Generalizes the old 2-channel recolorFeathers.)
const GLB_ZONE_TINTS: Record<string, 'back' | 'accent'> = {
  MB_BodyYellow: 'back',
  MB_HeadOrange: 'back',
  Uniform_TieStriped: 'accent',
}

export function recolorZones(root: THREE.Object3D, palette: PlumagePalette): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of materialsOf(mesh)) {
      const zone = GLB_ZONE_TINTS[m.name]
      if (!zone) continue
      const hex = palette[zone]
      if (!hex) continue
      ;(m as THREE.MeshToonMaterial).color.set(hex)
      m.needsUpdate = true
    }
  })
}
