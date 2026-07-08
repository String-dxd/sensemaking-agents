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
import { resolveAtlasUrls, resolveFaceAtlasId } from '../../core/face/atlasRegistry'
import { type CompileAssets, type CompileStats, compileCharacter } from '../../core/export'
import { getBodyMask } from '../../core/materials'
import { buildBodyScene } from '../../core/procgen/buildBody'
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
  // Body + anatomy parts are procedural (plan 013): build the scenes; only
  // wardrobe items still load from GLB (plan 016). The body build rides the
  // species shape seam (plan 017).
  if (body.source?.kind !== 'procedural') throw new Error(`export: body "${spec.meta.archetype}" has no procedural source`)
  const bodyScene = buildBodyScene(spec.meta.archetype, spec.meta.species)

  const partScenes: CompileAssets['partScenes'] = {}
  const maskPngsByRegion: Partial<Record<Region, Uint8Array>> = {}
  // Plan 019: the body mask is rasterized from the body's channels (plain
  // 'authored') or a species pattern field — UV-aligned, replacing the baked
  // body PNG. Part masks stay on their baked PNGs (plan 015 step 5 removes them).
  maskPngsByRegion.body = getBodyMask(spec.materials.body?.textureId ?? 'authored', spec.meta.archetype).pngBytes()
  for (const [slot, entry] of Object.entries(spec.anatomy.parts)) {
    if (!entry) continue
    const def = getPart(entry.partId)
    if (!def || def.url === null) continue
    if (def.source?.kind !== 'procedural') throw new Error(`export: part "${entry.partId}" has no procedural source`)
    partScenes[slot as PartSlot] = def.source.build()
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

  const atlas = resolveAtlasUrls(resolveFaceAtlasId(spec.meta.archetype, spec.meta.personality, spec.face.atlasId))
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
