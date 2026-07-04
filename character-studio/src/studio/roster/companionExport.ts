// Shared in-browser `.companion.glb` export (plan 011 + 012 stitch).
//
// Plan 011 shipped the compiler (src/core/export) and a standalone ExportPanel;
// plan 012 shipped the roster. This module is the seam both use so there is ONE
// in-browser compile path: load a spec's assets (GLTFLoader for scenes, WebIO
// for the clips Document, fetch for PNG atlases/masks — mirroring
// scripts/lib/node-assets on the node side), compile, and download the GLB.
// ExportPanel exports the live open character; the roster exports any saved
// character by parsing its stored spec first.

import { WebIO } from '@gltf-transform/core'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { resolveAtlasUrls } from '../../core/face/atlasRegistry'
import { type CompileAssets, type CompileStats, compileCharacter } from '../../core/export'
import { BODY_REGISTRY, getPart } from '../../core/skeleton/partRegistry'
import type { CharacterSpec, PartSlot, Region } from '../../core/spec/schema'
import { resolveWornItems, WARDROBE_REGISTRY } from '../../core/wardrobe'

const CLIPS_URL = new URL('../../assets/clips/clips-core-v1.glb', import.meta.url).href

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Load every asset the compiler needs for `spec`, in the browser. */
export async function loadBrowserAssets(spec: CharacterSpec): Promise<CompileAssets> {
  const loader = new GLTFLoader()
  const body = BODY_REGISTRY[spec.meta.archetype]
  const bodyScene = (await loader.loadAsync(body.url)).scene

  const partScenes: CompileAssets['partScenes'] = {}
  const maskPngsByRegion: Partial<Record<Region, Uint8Array>> = {}
  await fetchBytes(body.maskUrl)
    .then((b) => {
      maskPngsByRegion.body = b
    })
    .catch(() => {})
  for (const [slot, entry] of Object.entries(spec.anatomy.parts)) {
    if (!entry) continue
    const def = getPart(entry.partId)
    if (!def || def.url === null) continue
    partScenes[slot as PartSlot] = (await loader.loadAsync(def.url)).scene
    if (def.maskUrl && !maskPngsByRegion[def.region]) {
      await fetchBytes(def.maskUrl)
        .then((b) => {
          maskPngsByRegion[def.region] = b
        })
        .catch(() => {})
    }
  }

  const itemScenes: CompileAssets['itemScenes'] = {}
  for (const item of resolveWornItems(spec.wardrobe, WARDROBE_REGISTRY).items) {
    const def = (WARDROBE_REGISTRY as Record<string, { url?: string }>)[item.itemId]
    if (def?.url) itemScenes[item.itemId] = (await loader.loadAsync(def.url)).scene
  }

  const clipsDocument = await new WebIO().readBinary(await fetchBytes(CLIPS_URL))

  const atlas = resolveAtlasUrls(spec.face.atlasId)
  const atlasPngs = {
    eye: await fetchBytes(atlas.eye),
    pupil: await fetchBytes(atlas.pupil),
    brow: await fetchBytes(atlas.brow),
    mouth: await fetchBytes(atlas.mouth),
  }

  return { bodyScene, partScenes, itemScenes, clipsDocument, atlasPngs, maskPngsByRegion }
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Slugify a character name for a download filename. */
export function companionFilename(name: string): string {
  return `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'companion'}.companion.glb`
}

/** Compile `spec` to a `.companion.glb` in the browser and download it. */
export async function compileAndDownloadCompanion(spec: CharacterSpec): Promise<CompileStats> {
  const assets = await loadBrowserAssets(spec)
  const { glb, stats } = await compileCharacter(spec, assets)
  triggerDownload(glb, companionFilename(spec.meta.name))
  return stats
}
