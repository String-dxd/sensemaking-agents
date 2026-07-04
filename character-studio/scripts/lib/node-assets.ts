// Node-side asset loader for the export CLI + conformance tests (plan 011).
//
// The compiler (`compileCharacter`) is pure + DOM-free by design; loading the
// GLBs / PNGs is the caller's job. This helper does it headless in node:
// three's `GLTFLoader.parse` runs without a DOM for our texture-less rig GLBs,
// and gltf-transform's NodeIO reads the clips GLB into a Document.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { resolveAtlasUrls } from '../../src/core/face/atlasRegistry'
import type { CompileAssets } from '../../src/core/export/compile'
import { BODY_REGISTRY, getPart, PART_REGISTRY } from '../../src/core/skeleton/partRegistry'
import type { CharacterSpec, PartSlot, Region } from '../../src/core/spec/schema'
import { resolveWornItems, WARDROBE_REGISTRY } from '../../src/core/wardrobe'

const CLIPS_URL = new URL('../../src/assets/clips/clips-core-v1.glb', import.meta.url)

function urlToPath(url: string): string {
  return url.startsWith('file:') ? fileURLToPath(url) : url
}

function readBytes(url: string): Uint8Array {
  const buf = readFileSync(urlToPath(url))
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

function parseScene(bytes: Uint8Array): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Promise((resolve, reject) => {
    loader.parse(ab, '', (gltf) => resolve(gltf.scene), reject)
  })
}

function loadScene(url: string): Promise<THREE.Object3D> {
  return parseScene(readBytes(url))
}

/** Read the four atlas PNGs for a spec's atlasId, falling back to face-v1 when a
 * personality-specific atlas directory is not authored on disk. */
function loadAtlasPngs(atlasId: string): CompileAssets['atlasPngs'] {
  const load = (id: string) => {
    const urls = resolveAtlasUrls(id)
    return {
      eye: readBytes(urls.eye),
      pupil: readBytes(urls.pupil),
      brow: readBytes(urls.brow),
      mouth: readBytes(urls.mouth),
    }
  }
  try {
    return load(atlasId)
  } catch {
    return load('face-v1')
  }
}

/** Resolve + load everything `compileCharacter` needs from disk. */
export async function loadCompileAssets(spec: CharacterSpec): Promise<CompileAssets> {
  const body = BODY_REGISTRY[spec.meta.archetype]
  const bodyScene = await loadScene(body.url)

  const partScenes: CompileAssets['partScenes'] = {}
  const maskPngsByRegion: Partial<Record<Region, Uint8Array>> = {}
  try {
    maskPngsByRegion.body = readBytes(body.maskUrl)
  } catch {
    /* mask optional */
  }
  for (const [slot, entry] of Object.entries(spec.anatomy.parts)) {
    if (!entry) continue
    const def = getPart(entry.partId)
    if (!def || def.url === null) continue
    partScenes[slot as PartSlot] = await loadScene(def.url)
    if (def.maskUrl && !maskPngsByRegion[def.region]) {
      try {
        maskPngsByRegion[def.region] = readBytes(def.maskUrl)
      } catch {
        /* mask optional */
      }
    }
  }

  const itemScenes: CompileAssets['itemScenes'] = {}
  for (const item of resolveWornItems(spec.wardrobe, WARDROBE_REGISTRY).items) {
    const def = (WARDROBE_REGISTRY as Record<string, { url: string }>)[item.itemId]
    if (def?.url) itemScenes[item.itemId] = await loadScene(def.url)
  }

  const clipsDocument = await new NodeIO().read(urlToPath(CLIPS_URL.href))

  return {
    bodyScene,
    partScenes,
    itemScenes,
    clipsDocument,
    atlasPngs: loadAtlasPngs(spec.face.atlasId),
    maskPngsByRegion,
  }
}

export { PART_REGISTRY }
