// Build the checked-in object assets (public/models/*.glb) from the raw Meshy AI
// exports in assets/meshy/ (NOT in git — see assets/meshy/README.md).
//
//   node scripts/optimize-meshy-glb.mjs          # both
//   node scripts/optimize-meshy-glb.mjs tree     # one
//
// A Meshy export is unusable as-is: the tree ships 1.0M triangles and 65 MB of
// 2048² JPEGs, and every placement clones it. This pipeline is what makes it a
// web asset:
//
//   1. Strip the maps the scene doesn't light with. Meshy writes an emissive
//      map at full strength (emissiveFactor [1,1,1]) — that renders FULLBRIGHT
//      and flattens the model against our sun. Zeroing it, and dropping the
//      metallic-roughness + normal maps, is both the right art direction (matte
//      masses, same as the procedural bush) and ~3/4 of the file.
//   2. Decimate (meshoptimizer). Vertex-collapse only: surviving vertices keep
//      their original UVs, so the baked albedo still maps correctly.
//   3. Rescale to the editor's authoring contract — models are authored at final
//      world scale, centered on X/Z, base at y=0 (PlacedObjects then applies its
//      own yaw/scale jitter on top).
//   4. Wrap trees in a 'canopy' pivot carrying userData.windAmp, so the existing
//      wind spring (useCanopyWind + wind.ts) drives them unchanged. Meshy fuses
//      trunk and leaves into ONE mesh, so the pivot sits at the base and the
//      whole tree bows — hence a gentler windAmp than the authored trees used.
//   5. Textures → WebP, geometry → EXT_meshopt_compression.
//
// Why meshopt + WebP over Draco + KTX2: both decode with ZERO loader-side setup
// here — drei's useGLTF registers MeshoptDecoder by default, and three r171
// decodes EXT_texture_webp natively. Draco would add a CDN fetch for its wasm;
// KTX2 would need transcoder files in /public, a live renderer for
// detectSupport() (which breaks the module-scope useGLTF.preload), and the
// native `ktx` binary on every machine that rebuilds assets. KTX2/ETC1S is only
// worth that once the scene has many UNIQUE textured models — clones share
// textures, so VRAM here is bounded by the two assets below.

import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  clearNodeTransform,
  dedup,
  getBounds,
  meshopt,
  prune,
  simplify,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Per-asset build settings.
 *
 * `height` is the authoring contract, in world units: the authored trees this
 * replaces stood 1.45–1.70 tall with a ~1.2–1.45 footprint, and the procedural
 * rock it replaces was small ground clutter (~0.1–0.35 tall). The Meshy rock
 * exports at 0.75 × 0.30, so its scale factor lands just under 1.
 *
 * `simplify.error` is a HARD CAP as a fraction of mesh radius, and it binds
 * BEFORE `ratio` — meshoptimizer treats the UV-atlas chart borders of a Meshy
 * mesh as collapse constraints, so a tight error floors the triangle count well
 * above the target. If the reported tri count comes in high, raise `error`, not
 * `ratio`. Past ~0.05 the silhouette starts to visibly wobble.
 */
const ASSETS = {
  tree: {
    src: 'assets/meshy/tree.glb',
    out: 'public/models/tree.glb',
    material: 'tree-surface',
    meshNode: 'crown',
    height: 1.7,
    // See bakeVertexColors: the tree CANNOT be decimated while it carries
    // Meshy's UV atlas, so its albedo is baked to vertex colors and the atlas is
    // dropped. That is also just the house style — every procedural model here is
    // a matte mass with baked vertex-color shading.
    bakeVertexColors: true,
    // Contrast stretch on the baked albedo. Meshy renders the canopy fairly flat,
    // and with no UVs there is no roughness/metalness map to shape it — the vertex
    // colors ARE the only per-point signal the tree has, so the depth has to come
    // from here. Deepens the shadow inside the crown and brightens the sunlit
    // tips. 1 = leave the albedo alone.
    colorContrast: 1.35,
    simplify: { ratio: 0.03, error: 0.05 }, // 1.0M tris → ~25k
    textureSize: 1024,
    doubleSided: true, // the crown's leaf shells read from both faces
    windAmp: 0.55,
  },
  rock: {
    src: 'assets/meshy/rock.glb',
    out: 'public/models/rock.glb',
    material: 'rock-surface',
    meshNode: 'stone',
    height: 0.24,
    // Keeps its atlas: at 2.7k tris there is nothing to decimate, so the seams
    // that block the tree never come up, and a 512² WebP costs ~60 KB for detail
    // (lichen, cracks) that 2.7k vertices could never carry.
    bakeVertexColors: false,
    simplify: null,
    textureSize: 512,
    doubleSided: false,
    windAmp: null, // no canopy node → useCanopyWind no-ops; stones don't sway
  },
}

const KB = (bytes) => `${(bytes / 1024).toFixed(0)} KB`

/** Triangles across every primitive in the document. */
function triangleCount(document) {
  let tris = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)
      tris += count / 3
    }
  }
  return tris
}

/** glTF COLOR_0 is LINEAR (spec), the baked JPEG is sRGB, and three's GLTFLoader
 *  applies no conversion — so the transfer function has to be undone here or
 *  every model renders washed out. */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Contrast S-curve about mid-grey, applied to an sRGB channel in [0,1].
 *
 *  Deliberately applied in sRGB, BEFORE the linear conversion: 0.5 is only the
 *  perceptual midpoint on the sRGB curve (it lands at ~0.21 in linear), so
 *  pivoting a linear value about 0.5 would clamp most of the canopy's midtones
 *  into shadow instead of spreading them. `strength` 1 is a no-op. */
function contrast(c, strength) {
  return Math.min(1, Math.max(0, (c - 0.5) * strength + 0.5))
}

/**
 * Replace the UV atlas with per-vertex colors sampled from the base-color map,
 * then weld by POSITION — the two halves of the one change that makes this asset
 * decimatable at all.
 *
 * WHY. Meshy atlases the surface into thousands of UV charts, and every chart
 * border splits its vertices (1.3M vertices for 1.0M triangles — more vertices
 * than triangles). meshoptimizer will not collapse an edge across an attribute
 * discontinuity, so `simplify` floors out at ~547k triangles NO MATTER the error
 * cap — measured, not assumed. Welding by position first would fix the topology
 * but wreck the texture: a triangle on chart B whose corner got welded to chart
 * A's UV interpolates clear across the atlas and samples garbage. That is exactly
 * why the splits exist.
 *
 * Baking the color per vertex dissolves the problem instead of fighting it. Each
 * vertex is sampled through its OWN correct UV *before* anything is merged, so no
 * color is smeared; afterwards there is no UV attribute left to be discontinuous,
 * the co-located duplicates become genuinely identical, and the mesh welds and
 * decimates like the clean manifold it always was underneath. The texture then
 * drops out of the file entirely.
 */
async function bakeVertexColors(document, colorContrast = 1) {
  const material = document.getRoot().listMaterials()[0]
  const image = material.getBaseColorTexture()?.getImage()
  if (!image) throw new Error('no base-color texture to bake')

  const { data, info } = await sharp(Buffer.from(image)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info

  /** Nearest-texel sample → contrast-stretched linear RGB. (Bilinear buys
   *  nothing: at 1024² the texel grid is far finer than the post-decimation
   *  vertex grid.) */
  const sample = (u, v) => {
    const x = Math.min(w - 1, Math.max(0, Math.round(u * w)))
    const y = Math.min(h - 1, Math.max(0, Math.round(v * h)))
    const i = (y * w + x) * 3
    return [0, 1, 2].map((o) => srgbToLinear(contrast(data[i + o] / 255, colorContrast)))
  }

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray()
      const nrm = prim.getAttribute('NORMAL').getArray()
      const uv = prim.getAttribute('TEXCOORD_0').getArray()
      const idx = prim.getIndices().getArray()

      // Canonical vertex per QUANTIZED POSITION. Source coords span ~±5 units, so
      // 1e-5 resolves every distinct vertex while still collapsing the atlas's
      // bitwise-identical duplicates. Normals and freshly-sampled colors are
      // averaged across each group — the duplicates of a position sample nearly
      // the same color anyway (they are the same point on the surface), so this
      // is a no-op visually, and it lets the weld actually merge them.
      const canonical = new Map()
      const remap = new Int32Array(pos.length / 3)
      const outPos = []
      const acc = [] // [nx, ny, nz, r, g, b, n] per canonical vertex

      for (let i = 0; i < pos.length / 3; i++) {
        const key = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`
        let v = canonical.get(key)
        if (v === undefined) {
          v = outPos.length / 3
          canonical.set(key, v)
          outPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
          acc.push([0, 0, 0, 0, 0, 0, 0])
        }
        remap[i] = v
        const [r, g, b] = sample(uv[i * 2], uv[i * 2 + 1])
        const a = acc[v]
        a[0] += nrm[i * 3]
        a[1] += nrm[i * 3 + 1]
        a[2] += nrm[i * 3 + 2]
        a[3] += r
        a[4] += g
        a[5] += b
        a[6] += 1
      }

      const outNrm = new Float32Array(acc.length * 3)
      const outCol = new Float32Array(acc.length * 3)
      for (let v = 0; v < acc.length; v++) {
        const [nx, ny, nz, r, g, b, n] = acc[v]
        const len = Math.hypot(nx, ny, nz) || 1
        outNrm[v * 3] = nx / len
        outNrm[v * 3 + 1] = ny / len
        outNrm[v * 3 + 2] = nz / len
        outCol[v * 3] = r / n
        outCol[v * 3 + 1] = g / n
        outCol[v * 3 + 2] = b / n
      }

      // Welding co-located corners can leave slivers with two corners on the same
      // vertex — degenerate, so drop them rather than hand them to the simplifier.
      const outIdx = []
      for (let t = 0; t < idx.length; t += 3) {
        const a = remap[idx[t]]
        const b = remap[idx[t + 1]]
        const c = remap[idx[t + 2]]
        if (a !== b && b !== c && a !== c) outIdx.push(a, b, c)
      }

      const buffer = document.getRoot().listBuffers()[0]
      const attr = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
      prim.setAttribute('POSITION', attr('VEC3', new Float32Array(outPos)))
      prim.setAttribute('NORMAL', attr('VEC3', outNrm))
      prim.setAttribute('COLOR_0', attr('VEC3', outCol)) // GLTFLoader turns this into material.vertexColors
      prim.setAttribute('TEXCOORD_0', null)
      prim.setIndices(attr('SCALAR', new Uint32Array(outIdx)))
    }
  }

  material.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1])
}

/**
 * Bake a uniform scale + recentering into the mesh vertices so the asset lands
 * on the authoring contract: `height` tall, centered on X/Z, base at y=0.
 *
 * Baked into GEOMETRY rather than left on a node transform on purpose — the wind
 * spring writes `canopy.scale.y` every frame, so a normalization scale parked on
 * any node the spring touches would be clobbered on the first frame.
 */
function normalize(document, height) {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0]
  // Fold any authored node TRS down into the vertices first, so the bounds below
  // and the matrix we bake are in the same (now-identity) space.
  for (const node of scene.listChildren()) clearNodeTransform(node)

  const { min, max } = getBounds(scene)
  const s = height / (max[1] - min[1])
  const cx = (min[0] + max[0]) / 2
  const cz = (min[2] + max[2]) / 2

  // Column-major mat4: uniform scale `s`, then translate the scaled centroid to
  // (0, _, 0) and the scaled floor to y=0.
  const matrix = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -s * cx, -s * min[1], -s * cz, 1]
  for (const mesh of document.getRoot().listMeshes()) transformMesh(mesh, matrix)
  return s
}

/**
 * Re-root the scene on the graph the runtime expects. Trees get a 'canopy' pivot
 * (named + `extras.windAmp`, which GLTFLoader surfaces as `userData.windAmp`) at
 * the base; the mesh hangs beneath it, which is also what `useObjectModel` jitters
 * per instance — so seeded variety and the wind sway never fight over the same
 * transform.
 */
function reroot(document, cfg) {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0]
  const meshNode = scene.listChildren().find((n) => n.getMesh())
  if (!meshNode) throw new Error('no mesh node in scene')
  meshNode.setName(cfg.meshNode)

  if (cfg.windAmp == null) return
  const canopy = document.createNode('canopy').setExtras({ windAmp: cfg.windAmp })
  scene.removeChild(meshNode)
  canopy.addChild(meshNode)
  scene.addChild(canopy)
}

async function build(name) {
  const cfg = ASSETS[name]
  const src = join(ROOT, cfg.src)
  const out = join(ROOT, cfg.out)

  let srcBytes
  try {
    srcBytes = statSync(src).size
  } catch {
    throw new Error(`Missing raw asset ${cfg.src} — see assets/meshy/README.md for where to put it.`)
  }

  await MeshoptSimplifier.ready
  await MeshoptEncoder.ready

  // EXT_meshopt_compression encodes at WRITE time, inside the extension — it
  // resolves its codec off the IO, not off the meshopt() transform's argument.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  const document = await io.read(src)
  const srcTris = triangleCount(document)

  // 1. Strip the maps we don't light with. Must run BEFORE prune(), which is what
  //    actually evicts the now-orphaned image data from the binary.
  for (const material of document.getRoot().listMaterials()) {
    material
      .setName(cfg.material)
      .setEmissiveTexture(null)
      .setEmissiveFactor([0, 0, 0]) // Meshy ships [1,1,1] — i.e. fullbright
      .setMetallicRoughnessTexture(null)
      .setNormalTexture(null)
      .setMetallicFactor(0)
      .setRoughnessFactor(1) // matte, like the procedural bush
      .setDoubleSided(cfg.doubleSided)
  }

  // 2. Bake the atlas down to vertex colors, so the mesh can actually decimate.
  if (cfg.bakeVertexColors) await bakeVertexColors(document, cfg.colorContrast ?? 1)

  // 3. Decimate.
  await document.transform(
    dedup(),
    weld(),
    ...(cfg.simplify
      ? [simplify({ simplifier: MeshoptSimplifier, ratio: cfg.simplify.ratio, error: cfg.simplify.error })]
      : []),
  )

  // 4 + 5. Land on the authoring contract, then on the runtime's scene graph.
  const scale = normalize(document, cfg.height)
  reroot(document, cfg)

  // 6. Compress.
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /baseColorTexture/,
      resize: [cfg.textureSize, cfg.textureSize],
      quality: 85,
    }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )

  mkdirSync(dirname(out), { recursive: true })
  await io.write(out, document)

  const outBytes = statSync(out).size
  const tris = triangleCount(document)
  console.log(
    `${name.padEnd(5)} ${KB(srcBytes).padStart(9)} → ${KB(outBytes).padStart(7)}` +
      `  (${(srcBytes / outBytes).toFixed(0)}× smaller)   ` +
      `tris ${srcTris.toLocaleString().padStart(9)} → ${tris.toLocaleString().padStart(6)}   ` +
      `scale ×${scale.toFixed(3)}`,
  )
}

const names = process.argv.slice(2)
for (const name of names.length ? names : Object.keys(ASSETS)) {
  if (!ASSETS[name]) throw new Error(`Unknown asset "${name}" — expected one of: ${Object.keys(ASSETS).join(', ')}`)
  await build(name)
}
