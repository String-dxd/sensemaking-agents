import * as THREE from 'three'

// Shared, lazily-loaded texture cache for the object models. Configured exactly
// like IslandTerrain.tsx's ground-texture loader (SRGB color space, repeat wrap,
// linear mipmaps) so placed objects read with the same painterly finish as the
// terrain. Textures are keyed by name and reused across every model instance.
const cache = new Map<string, THREE.Texture>()
const ready = new Set<string>()
const waiters = new Map<string, Array<(t: THREE.Texture) => void>>()

export type ModelTextureName =
  | 'bark-soft-streaks'
  | 'leaf-soft-tufts'
  | 'rock-soft-speckle'
  | 'foliage-leaves'
  | 'foliage-cedar'
  | 'bush-leaves'
  | 'palm-frond'
  | 'palm-trunk'
  | 'rock-painted'
  | 'bark-painted'

/** Lazily load a model texture from /textures. Cached for the app's lifetime —
 *  callers must NOT dispose these (PlacedObjects disposes materials only, and
 *  material.dispose() does not touch material.map, so the cache survives).
 *
 *  `onReady` fires once the image has actually loaded (immediately if it
 *  already has) — attach maps to materials there, NOT eagerly: a material
 *  pointing at a texture whose file is missing renders BLACK, so callers keep
 *  their painted fallback tint until the pixels are really available. */
export function modelTexture(name: ModelTextureName, onReady?: (tex: THREE.Texture) => void): THREE.Texture {
  let tex = cache.get(name)
  if (!tex) {
    tex = new THREE.TextureLoader().load(`/textures/${name}.png`, (t) => {
      ready.add(name)
      for (const w of waiters.get(name) ?? []) w(t)
      waiters.delete(name)
    })
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    cache.set(name, tex)
  }
  if (onReady) {
    if (ready.has(name)) onReady(tex)
    else {
      const list = waiters.get(name) ?? []
      list.push(onReady)
      waiters.set(name, list)
    }
  }
  return tex
}
