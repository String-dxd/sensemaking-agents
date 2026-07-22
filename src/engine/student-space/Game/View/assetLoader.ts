// Shared GLB lane for the editor-authored models (world-port U6, KTD-9).
//
// One GLTFLoader for all editor GLBs (public/models/, self-hosted — gstatic is
// blocked on school networks), with three's MeshoptDecoder registered BEFORE
// any load (the assets are EXT_meshopt_compression'd; an unregistered decoder
// throws inside GLTFLoader). Loads are module-cached by URL and NEVER reject:
// a fetch/parse failure logs and resolves to null so views fall back to their
// placeholder path and `ready` promises still settle (Kira's catch-and-keep-
// placeholder precedent).

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

// Asset paths mirror Tree/Kira: derive from Vite's BASE_URL for subpath
// deploys, with "/" as the unit-test/SSR fallback.
const BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/'
const ASSET_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`

export const MODEL_URLS = {
  tree: `${ASSET_BASE}models/tree.glb`,
  rock: `${ASSET_BASE}models/rock.glb`,
  character: `${ASSET_BASE}models/character.glb`,
} as const

type LoaderLike = { loadAsync(url: string): Promise<GLTF> }

let loaderPromise: Promise<LoaderLike> | null = null
let loaderFactory: (() => Promise<LoaderLike>) | null = null
const cache = new Map<string, Promise<GLTF | null>>()

async function defaultLoaderFactory(): Promise<LoaderLike> {
  // Decoder registration is part of loader construction, so it is impossible
  // to reach loadAsync before the decoder is ready and attached.
  await MeshoptDecoder.ready
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

function getLoader(): Promise<LoaderLike> {
  if (!loaderPromise) loaderPromise = (loaderFactory ?? defaultLoaderFactory)()
  return loaderPromise
}

/**
 * Load a GLB, cached by URL for the app's lifetime. Resolves to null (never
 * rejects) on failure — callers keep their placeholder. The resolved GLTF's
 * scene is SHARED: callers must clone (SkeletonUtils.clone for skinned scenes)
 * and never dispose the cached asset.
 */
export function loadGlb(url: string): Promise<GLTF | null> {
  let entry = cache.get(url)
  if (!entry) {
    entry = getLoader()
      .then((loader) => loader.loadAsync(url))
      .catch((error) => {
        console.error(`[assetLoader] failed to load ${url} — keeping placeholder`, error)
        return null
      })
    cache.set(url, entry)
  }
  return entry
}

/** TEST ONLY: swap the loader factory and clear caches. */
export function __setLoaderForTests(factory: (() => Promise<LoaderLike>) | null): void {
  loaderFactory = factory
  loaderPromise = null
  cache.clear()
}
