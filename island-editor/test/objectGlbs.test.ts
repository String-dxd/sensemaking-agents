import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'

// Contract tests against the CHECKED-IN object assets (public/models/*.glb, built
// from the raw Meshy exports by scripts/optimize-meshy-glb.mjs). The runtime hook,
// the wind spring, and placement all rely on this contract — if a rebuild
// regresses (a stray node transform, a resurrected 65 MB texture, a lost canopy),
// these fail before the editor ever loads it.
//
// Read through gltf-transform's NodeIO rather than three's GLTFLoader: the rock's
// base map is WebP, and three decodes EXT_texture_webp via `new Image()`, which
// does not exist in node. NodeIO is DOM-free and checks the same on-disk facts.

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')

const KINDS = ['tree', 'rock'] as const

/** The whole point of the import pipeline: the raws are 65.6 MB and 8.1 MB. Any
 *  rebuild that lands near those numbers has silently lost the decimation or the
 *  texture compression. */
const SIZE_BUDGET_KB: Record<(typeof KINDS)[number], number> = { tree: 400, rock: 200 }
const TRI_BUDGET: Record<(typeof KINDS)[number], number> = { tree: 40_000, rock: 5_000 }

/** Authored world scale — placement multiplies its own 0.85..1.15 jitter on top. */
const HEIGHT: Record<(typeof KINDS)[number], number> = { tree: 1.7, rock: 0.24 }

const docs = new Map<string, Document>()

beforeAll(async () => {
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
  for (const kind of KINDS) docs.set(kind, await io.read(join(MODELS_DIR, `${kind}.glb`)))
})

function triangles(doc: Document): number {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0
      tris += count / 3
    }
  }
  return tris
}

describe('object GLB assets', () => {
  it.each(KINDS)('%s stays inside its size and triangle budget', (kind) => {
    const bytes = statSync(join(MODELS_DIR, `${kind}.glb`)).size
    expect(bytes / 1024).toBeLessThan(SIZE_BUDGET_KB[kind])
    expect(triangles(docs.get(kind) as Document)).toBeLessThan(TRI_BUDGET[kind])
  })

  it.each(KINDS)('%s is authored at world scale, centered on X/Z with its base at y=0', (kind) => {
    const doc = docs.get(kind) as Document
    const { min, max } = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])
    expect(max[1] - min[1]).toBeCloseTo(HEIGHT[kind], 2)
    expect(min[1]).toBeCloseTo(0, 3) // grounded — placement puts y at the terrain top
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 2)
    expect((min[2] + max[2]) / 2).toBeCloseTo(0, 2)
  })

  it('the tree carries a canopy pivot the wind spring can drive', () => {
    const doc = docs.get('tree') as Document
    const canopy = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === 'canopy')
    expect(canopy).toBeDefined()
    // GLTFLoader surfaces `extras` as `userData` — useCanopyWind reads windAmp there.
    expect((canopy?.getExtras() as { windAmp?: number }).windAmp).toBe(0.55)

    // The pivot MUST stay identity. meshopt quantizes vertex positions and parks
    // the dequantization translate+scale on whichever node holds the mesh, so the
    // mesh node is an unsafe handle: rotating it would swing the tree about the
    // quantization offset instead of its base. useObjectModel's per-instance
    // jitter and the wind spring both write to 'canopy' precisely because this
    // node is one we author and quantization never touches.
    expect(canopy?.getTranslation()).toEqual([0, 0, 0])
    expect(canopy?.getRotation()).toEqual([0, 0, 0, 1])
    expect(canopy?.getScale()).toEqual([1, 1, 1])
    expect(canopy?.getMesh()).toBeNull()
    expect(canopy?.listChildren().map((n) => n.getName())).toEqual(['crown'])
  })

  it('the rock has no canopy — stones do not sway', () => {
    const names = (docs.get('rock') as Document)
      .getRoot()
      .listNodes()
      .map((n) => n.getName())
    expect(names).not.toContain('canopy')
    expect(names).toContain('stone')
  })

  it('the tree carries its color in vertex colors, with no texture at all', () => {
    const doc = docs.get('tree') as Document
    // Meshy's UV atlas is what blocked decimation (see optimize-meshy-glb.mjs);
    // the albedo is baked to COLOR_0 and the atlas dropped. GLTFLoader turns a
    // COLOR_0 attribute into material.vertexColors on its own.
    expect(doc.getRoot().listTextures()).toHaveLength(0)
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('COLOR_0')).not.toBeNull()
        expect(prim.getAttribute('TEXCOORD_0')).toBeNull()
      }
    }
  })

  it('the rock keeps a single compressed base map and nothing else', () => {
    const doc = docs.get('rock') as Document
    const textures = doc.getRoot().listTextures()
    expect(textures).toHaveLength(1)
    expect(textures[0].getMimeType()).toBe('image/webp')
    expect(textures[0].getSize()).toEqual([512, 512])
  })

  it.each(KINDS)('%s is matte and unlit-by-itself — no emissive, metal or leftover PBR maps', (kind) => {
    for (const material of (docs.get(kind) as Document).getRoot().listMaterials()) {
      // Meshy ships emissiveFactor [1,1,1] + an emissive map, which renders
      // FULLBRIGHT and flattens the model against the scene sun.
      expect(material.getEmissiveFactor()).toEqual([0, 0, 0])
      expect(material.getEmissiveTexture()).toBeNull()
      expect(material.getMetallicRoughnessTexture()).toBeNull()
      expect(material.getNormalTexture()).toBeNull()
      expect(material.getMetallicFactor()).toBe(0)
      expect(material.getRoughnessFactor()).toBe(1)
    }
  })

  it.each(KINDS)('%s is meshopt-compressed (drei registers the decoder; no CDN, no transcoder)', (kind) => {
    const used = (docs.get(kind) as Document)
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName)
    expect(used).toContain('EXT_meshopt_compression')
  })
})
