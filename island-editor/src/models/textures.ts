import * as THREE from 'three'

// Shared, lazily-loaded texture cache for the object models. Configured exactly
// like IslandTerrain.tsx's ground-texture loader (SRGB color space, repeat wrap,
// linear mipmaps) so placed objects read with the same painterly finish as the
// terrain. Textures are keyed by name and reused across every model instance.
const cache = new Map<string, THREE.Texture>()

/** Lazily load a model texture from /textures. Cached for the app's lifetime —
 *  callers must NOT dispose these (PlacedObjects disposes materials only, and
 *  material.dispose() does not touch material.map, so the cache survives). */
export function modelTexture(
  name: 'bark-soft-streaks' | 'leaf-soft-tufts' | 'rock-soft-speckle',
): THREE.Texture {
  let tex = cache.get(name)
  if (!tex) {
    tex = new THREE.TextureLoader().load(`/textures/${name}.png`)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    cache.set(name, tex)
  }
  return tex
}
