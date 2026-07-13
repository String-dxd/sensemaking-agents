import * as THREE from 'three'

// Shared, lazily-loaded texture cache for the object models. Configured exactly
// like IslandTerrain.tsx's ground-texture loader (SRGB color space, repeat wrap,
// linear mipmaps) so placed objects read with the same painterly finish as the
// terrain. Textures are keyed by URL and reused across every model instance.
const cache = new Map<string, THREE.Texture>()
const ready = new Set<string>()
const waiters = new Map<string, Array<(t: THREE.Texture) => void>>()

/** Load + cache a texture by URL. `onReady` fires once the image has actually
 *  loaded (immediately if it already has) — attach maps to materials there,
 *  NOT eagerly: a material pointing at a texture whose file is missing renders
 *  BLACK, so callers keep their painted fallback tint until the pixels are
 *  really available. Never dispose the returned texture — it is shared. */
function loadSharedTexture(url: string, onReady?: (tex: THREE.Texture) => void): THREE.Texture {
  let tex = cache.get(url)
  if (!tex) {
    tex = new THREE.TextureLoader().load(url, (t) => {
      ready.add(url)
      for (const w of waiters.get(url) ?? []) w(t)
      waiters.delete(url)
    })
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    cache.set(url, tex)
  }
  if (onReady) {
    if (ready.has(url)) onReady(tex)
    else {
      const list = waiters.get(url) ?? []
      list.push(onReady)
      waiters.set(url, list)
    }
  }
  return tex
}

// Only the bush is still procedural, so it's the only model that needs a map
// from /textures — `tree` carries its color in baked vertex colors and `rock`
// embeds its own WebP base map in the GLB.
export type ModelTextureName = 'bush-leaves'

/** Lazily load a model texture from /textures. Cached for the app's lifetime —
 *  callers must NOT dispose these (PlacedObjects disposes materials only, and
 *  material.dispose() does not touch material.map, so the cache survives).
 *
 *  `onReady` fires once the image has actually loaded (immediately if it
 *  already has) — attach maps to materials there, NOT eagerly: a material
 *  pointing at a texture whose file is missing renders BLACK, so callers keep
 *  their painted fallback tint until the pixels are really available. */
export function modelTexture(name: ModelTextureName, onReady?: (tex: THREE.Texture) => void): THREE.Texture {
  return loadSharedTexture(`/textures/${name}.png`, onReady)
}
