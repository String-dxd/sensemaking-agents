import * as THREE from 'three'
import { loadSharedTexture, type ModelTextureName } from './textures'

// Texture THEMES for the placed-object models: switchable sets of the same
// maps in different cozy art styles, plus 'off' (no maps — the flat matte
// vertex-color look). Painted materials register here once; switching the
// theme re-points every live material, so the scene updates in place (GLB
// clones share their materials with the cache, bushes register per instance).
//
// Theme files live at /textures/themes/<theme>/<name>.png ('classic' uses the
// original /textures/<name>.png set). Themed sets are authored as final
// colors and render under a white tint; the classic set keeps its per-material
// tints (the golden bark maps are pulled brown by them).

export const TEXTURE_THEMES = ['classic', 'pastel', 'storybook', 'off'] as const
export type TextureTheme = (typeof TEXTURE_THEMES)[number]

const STORAGE_KEY = 'island-editor.texture-theme'
const WHITE = new THREE.Color(0xffffff)

interface PaintedEntry {
  mat: THREE.MeshStandardMaterial
  mapName: ModelTextureName
  /** Tint multiplied over the CLASSIC map (themed maps render as painted). */
  classicTint: THREE.Color
  /** The material's authored color, restored when textures are off. */
  fallback: THREE.Color
}

const registry = new Set<PaintedEntry>()
const byMaterial = new Map<THREE.MeshStandardMaterial, PaintedEntry>()

let current: TextureTheme = (() => {
  if (typeof localStorage === 'undefined') return 'classic'
  const saved = localStorage.getItem(STORAGE_KEY) as TextureTheme | null
  return saved && (TEXTURE_THEMES as readonly string[]).includes(saved) ? saved : 'classic'
})()

export function currentTextureTheme(): TextureTheme {
  return current
}

function urlFor(theme: TextureTheme, name: ModelTextureName): string {
  return theme === 'classic' ? `/textures/${name}.png` : `/textures/themes/${theme}/${name}.png`
}

function apply(entry: PaintedEntry): void {
  const theme = current
  if (theme === 'off') {
    entry.mat.map = null
    entry.mat.color.copy(entry.fallback)
    entry.mat.needsUpdate = true
    return
  }
  // TextureLoader needs a DOM; in node (tests, SSR) the registry still tracks
  // colors/fallbacks, it just can't paint.
  if (typeof document === 'undefined') return
  loadSharedTexture(urlFor(theme, entry.mapName), (tex) => {
    // A slow load must not clobber a newer selection (or a removed material).
    if (current !== theme || !byMaterial.has(entry.mat)) return
    entry.mat.map = tex
    entry.mat.color.copy(theme === 'classic' ? entry.classicTint : WHITE)
    entry.mat.needsUpdate = true
  })
}

/** Register a material for themed painting, then apply the active theme.
 *  `offTint` is the flat matte color for the textures-off look; it defaults to
 *  the material's CURRENT color, but map-carried-color materials (authored
 *  white, e.g. the broadleaf crown) must pass a real one or 'off' renders
 *  white. */
export function registerPaintedMaterial(
  mat: THREE.MeshStandardMaterial,
  mapName: ModelTextureName,
  classicTint: THREE.ColorRepresentation = 0xffffff,
  offTint?: THREE.ColorRepresentation,
): void {
  if (byMaterial.has(mat)) return
  const entry: PaintedEntry = {
    mat,
    mapName,
    classicTint: new THREE.Color(classicTint),
    fallback: offTint !== undefined ? new THREE.Color(offTint) : mat.color.clone(),
  }
  registry.add(entry)
  byMaterial.set(mat, entry)
  apply(entry)
}

/** (Re-)register every material under `root` that carries a `userData.paint`
 *  spec ({ map, classicTint?, offTint? }, stamped at authoring time). Call on
 *  React mount: StrictMode's mount→cleanup→remount disposes the model once
 *  while it keeps rendering, which unregisters per-instance materials — this
 *  puts them back so they keep following theme switches. Idempotent (already-
 *  registered materials are skipped). */
export function registerPaintedModel(root: THREE.Object3D): void {
  root.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return
    const mats = Array.isArray(n.material) ? n.material : [n.material]
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue
      const spec = m.userData.paint as
        | { map: ModelTextureName; classicTint?: THREE.ColorRepresentation; offTint?: THREE.ColorRepresentation }
        | undefined
      if (spec) registerPaintedMaterial(m, spec.map, spec.classicTint ?? 0xffffff, spec.offTint)
    }
  })
}

/** Drop a disposed material from the registry (bush materials are per-instance
 *  and die with their model; the shared GLB materials live forever). */
export function unregisterPaintedMaterial(mat: THREE.Material): void {
  const entry = byMaterial.get(mat as THREE.MeshStandardMaterial)
  if (!entry) return
  byMaterial.delete(entry.mat)
  registry.delete(entry)
}

/** Switch the active theme and re-point every registered material. */
export function setTextureTheme(theme: TextureTheme): void {
  if (theme === current) return
  current = theme
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, theme)
  for (const entry of registry) apply(entry)
}
