// Ported from island-editor/src/models/textures.ts — behavior kept in sync via
// shared test vectors (see State/islandSpecCore/terrainGrid.ts).
//
// Shared, lazily-loaded texture cache for the object models. Configured like
// the ground-texture loader (sRGB via the r149 `encoding` API, repeat wrap,
// linear mipmaps) so placed objects read with the same painterly finish as the
// terrain. Textures are keyed by URL and reused across every model instance.

import * as THREE from 'three'
import { markTextureSRGB } from './r149.ts'

const BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/'
const ASSET_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`

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
    markTextureSRGB(tex) // r149 API — see r149.ts
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

// Only the bush is still procedural, so it's the only model that needs a map —
// `tree` carries its color in baked vertex colors and `rock` embeds its own
// WebP base map in the GLB.
export type ModelTextureName = 'bush-leaves'

/** Lazily load a model texture. Cached for the app's lifetime — callers must
 *  NOT dispose these (material.dispose() does not touch material.map, so the
 *  cache survives). */
export function modelTexture(
  name: ModelTextureName,
  onReady?: (tex: THREE.Texture) => void,
): THREE.Texture {
  return loadSharedTexture(`${ASSET_BASE}student-space/textures/${name}.png`, onReady)
}
