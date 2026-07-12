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

const KINDS = ['tree', 'rock', 'grass'] as const

/** The whole point of the import pipeline: the raws are 48.2 MB, 8.1 MB and 10.4 MB.
 *  Any rebuild that lands near those numbers has silently lost the decimation or the
 *  texture compression.
 *
 *  tree: re-baselined 2026-07-12. The source (tree-2.glb, "Emerald Canopy") is a
 *  pre-decimated, textured 31k-tri model — unlike the old 1.76M-tri atlas'd source,
 *  there's nothing to vertex-color-bake or simplify away, so this asset keeps its
 *  real UV atlas (like the rock) instead. That atlas splits vertices at every chart
 *  seam (58k vertices for 31k triangles), which costs ~610 KB of geometry alone —
 *  texture compression (quality 80, 512² — see optimize-meshy-glb.mjs) can't touch
 *  that, so the budget is set just above the actual 819 KB output rather than the
 *  old 400 KB ceiling that applied to the vertex-color-baked (textureless) tree. */
const SIZE_BUDGET_KB: Record<(typeof KINDS)[number], number> = { tree: 850, rock: 200, grass: 250 }
const TRI_BUDGET: Record<(typeof KINDS)[number], number> = { tree: 40_000, rock: 5_000, grass: 5_000 }

/** Authored world scale — placement multiplies its own 0.85..1.15 jitter on top. */
const HEIGHT: Record<(typeof KINDS)[number], number> = { tree: 1.7, rock: 0.24, grass: 0.16 }

const docs = new Map<string, Document>()

// The character isn't in KINDS — its scale contract deliberately differs (see the
// 'character GLB asset' describe block below) — but it shares the same NodeIO setup,
// so it's loaded alongside the static kinds.
const CHARACTER_PATH = join(MODELS_DIR, 'character.glb')
let characterDoc: Document

beforeAll(async () => {
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
  for (const kind of KINDS) docs.set(kind, await io.read(join(MODELS_DIR, `${kind}.glb`)))
  characterDoc = await io.read(CHARACTER_PATH)
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

  it('the grass has no canopy — it is a static InstancedMesh source, not wind-driven', () => {
    const names = (docs.get('grass') as Document)
      .getRoot()
      .listNodes()
      .map((n) => n.getName())
    expect(names).not.toContain('canopy')
    expect(names).toContain('tuft')
  })

  it('the tree keeps a single compressed base map and nothing else', () => {
    // Re-baselined 2026-07-12: tree-2.glb ("Emerald Canopy") is pre-decimated and
    // textured — its look lives in the base map, not per-vertex color, so unlike
    // the old source this one keeps its UV atlas (mirrors the rock/grass contract).
    const doc = docs.get('tree') as Document
    const textures = doc.getRoot().listTextures()
    expect(textures).toHaveLength(1)
    expect(textures[0].getMimeType()).toBe('image/webp')
    expect(textures[0].getSize()).toEqual([512, 512])
  })

  it('the rock keeps a single compressed base map and nothing else', () => {
    const doc = docs.get('rock') as Document
    const textures = doc.getRoot().listTextures()
    expect(textures).toHaveLength(1)
    expect(textures[0].getMimeType()).toBe('image/webp')
    expect(textures[0].getSize()).toEqual([512, 512])
  })

  it('the grass keeps a single compressed base map and nothing else', () => {
    const doc = docs.get('grass') as Document
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

/** The 10 clip names baked into the merged-animations export (see
 *  scripts/optimize-meshy-glb.mjs's buildCharacter and assets/meshy/README.md).
 *  Plan 017 hardcodes this same list in a UI constant — this test is what keeps
 *  that constant honest if the source ever changes. */
const EXPECTED_CLIP_NAMES = [
  'Running',
  'Skip_Forward',
  'Stand_Talking_Angry',
  'Stand_To_Side_Lying',
  'Swim_Forward',
  'Talk_Passionately',
  'Talk_with_Right_Hand_Open',
  'Wake_Up_and_Look_Up',
  'Walking',
  'Wave_for_Help_2',
].sort()

/** Column-major 4x4 matrix multiply: returns a*b. */
function mat4mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = sum
    }
  }
  return out
}

/**
 * Bind-pose (rest-pose) world-space bounds of the character's skinned mesh.
 *
 * WHY NOT `getBounds(scene)` (used for the static kinds above), and NOT the
 * mesh's raw local POSITION data either: `optimize-meshy-glb.mjs`'s `meshopt()`
 * step quantizes POSITION to a normalized Int16 range. For an ordinary
 * (non-skinned) mesh, gltf-transform compensates by writing a corrective
 * scale+offset onto the node that holds the mesh — which is what makes
 * `getBounds()` correct for tree/rock/grass above. But per the glTF skinning
 * spec, a SKINNED mesh's node transform is mathematically inert (it cancels out
 * of the render equation), so gltf-transform can't put the correction there —
 * instead (see `@gltf-transform/functions`' `quantize.ts`, `transformSkin`) it
 * bakes the SAME correction into every joint's inverse-bind matrix instead.
 *
 * That correction is recoverable without re-deriving gltf-transform's internals:
 * at rest pose, a joint's `getWorldMatrix()` times its ORIGINAL inverse-bind
 * matrix is exactly the identity (that's what "inverse bind" means). Since the
 * correction was applied uniformly to every joint's IBM, `jointWorldMatrix *
 * correctedIBM` for ANY joint equals that same correction matrix — pure
 * scale+translate, verified empirically to be ×0.81 + translate (0, 0.81, 0)
 * for this asset, recovering the known-correct 1.62-tall source bounds exactly.
 * Applying it to the (quantization-denormalized, via `getElement()`) vertex
 * positions gives true bind-pose world coordinates.
 */
function characterBindPoseBounds(doc: Document): { min: number[]; max: number[] } {
  const skinnedNode = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getMesh() && n.getSkin())
  const skin = skinnedNode?.getSkin()
  const mesh = skinnedNode?.getMesh()
  const ibmAccessor = skin?.getInverseBindMatrices()
  const joint = skin?.listJoints()[0]
  if (!skin || !mesh || !ibmAccessor || !joint) throw new Error('character.glb: expected a skinned mesh node')

  const correctedIbm: number[] = []
  ibmAccessor.getElement(0, correctedIbm)
  const correction = mat4mul(joint.getWorldMatrix(), correctedIbm)

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const v: number[] = [0, 0, 0]
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      const [x, y, z] = v
      const world = [0, 1, 2].map(
        (k) => correction[k] * x + correction[4 + k] * y + correction[8 + k] * z + correction[12 + k],
      )
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], world[k])
        max[k] = Math.max(max[k], world[k])
      }
    }
  }
  return { min, max }
}

describe('character GLB asset', () => {
  // Deliberately NOT in KINDS above — its scale contract differs (ships at
  // SOURCE scale; see optimize-meshy-glb.mjs's buildCharacter), so it gets its
  // own assertions rather than the shared it.each contracts.

  it('stays inside its size and triangle budget', () => {
    const bytes = statSync(CHARACTER_PATH).size
    expect(bytes / 1024).toBeLessThan(3 * 1024)
    expect(triangles(characterDoc)).toBeLessThan(12_000)
  })

  it('keeps exactly one skin', () => {
    expect(characterDoc.getRoot().listSkins()).toHaveLength(1)
  })

  it('keeps all 10 animation clips, under the names plan 017 hardcodes', () => {
    const names = characterDoc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName())
      .sort()
    expect(names).toHaveLength(10)
    expect(names).toEqual(EXPECTED_CLIP_NAMES)
  })

  it('ships at source scale, grounded — normalize() must never run on this asset', () => {
    const { min, max } = characterBindPoseBounds(characterDoc)
    expect(max[1] - min[1]).toBeGreaterThan(1.5)
    expect(max[1] - min[1]).toBeLessThan(1.8)
    expect(min[1]).toBeCloseTo(0, 2) // tolerance 0.01
  })

  it('is matte and unlit-by-itself — no emissive, metal or leftover PBR maps', () => {
    for (const material of characterDoc.getRoot().listMaterials()) {
      expect(material.getEmissiveFactor()).toEqual([0, 0, 0])
      expect(material.getEmissiveTexture()).toBeNull()
      expect(material.getMetallicRoughnessTexture()).toBeNull()
      expect(material.getNormalTexture()).toBeNull()
    }
  })

  it('keeps a single compressed 1024² base map', () => {
    const textures = characterDoc.getRoot().listTextures()
    expect(textures).toHaveLength(1)
    expect(textures[0].getMimeType()).toBe('image/webp')
    expect(textures[0].getSize()).toEqual([1024, 1024])
  })

  it('is meshopt-compressed (drei registers the decoder; no CDN, no transcoder)', () => {
    const used = characterDoc
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName)
    expect(used).toContain('EXT_meshopt_compression')
  })
})
