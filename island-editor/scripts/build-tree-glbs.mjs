// Authors the island-editor tree models as real geometry and exports checked-in
// .glb assets (island-editor/public/models/*.glb). This is the GLB lane: the
// runtime loads these instead of building tree primitives per placement.
//
// Art direction (reference: the New Pokémon Snap "Aspear tree" close-up + the
// wide AC scene): a billowy crown of stacked horizontal RUFFLE TIERS — rings of
// rounded puffs with dark crevice seams between rows — over a thick smooth
// lathe trunk, fruit nestled half-sunk into the top seams. All shading is baked
// vertex color (global bottom-dark → top-light gradient × per-puff crevice
// darkening); painted texture maps are attached at runtime by the app.
//
// Contract (mirrors the old buildObjectModel contract — the runtime hook, wind
// spring, placement, and tests all consume it):
//   - root children grounded: bbox min.y == 0, footprint |x|,|z| < 1.2
//   - one child group named 'canopy' with userData.windAmp (GLTF extras) —
//     everything wind should sway lives inside it; trunk stays outside
//   - materials: 'foliage' (vertex-colored matte), 'bark' — named so the
//     runtime can attach painted maps / swap palettes
//
// Deterministic: seeded PRNG only (no Math.random), so re-running the script
// reproduces byte-identical geometry for unchanged authoring code.
//
// Run from island-editor/:  node scripts/build-tree-glbs.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// GLTFExporter's binary path reads its Blob back through FileReader, which node
// doesn't have — shim just the readAsArrayBuffer flavor it uses.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf
      this.onloadend?.()
    })
  }
}

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')

// ---------------------------------------------------------------------------
// Shared helpers (ported from src/models/buildObjectModel.ts)
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) — the script's only entropy source. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Average normals across co-located duplicate vertices so a non-indexed
 *  icosphere shades as one soft bubble instead of crumpled facets. */
function smoothNormals(geo) {
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  const keyOf = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
  const acc = new Map()
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i)
    const a = acc.get(k) ?? [0, 0, 0]
    a[0] += nrm.getX(i)
    a[1] += nrm.getY(i)
    a[2] += nrm.getZ(i)
    acc.set(k, a)
  }
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keyOf(i)) ?? [0, 1, 0]
    v.set(a[0], a[1], a[2]).normalize()
    nrm.setXYZ(i, v.x, v.y, v.z)
  }
  nrm.needsUpdate = true
}

/**
 * Bake the crown shading into a puff mesh's vertex colors:
 *  - GLOBAL gradient: crown-space height y0 (bottom color) → y1 (top color),
 *    dark-biased so undersides stay shaded past midway.
 *  - CREVICE term: each puff darkens toward its own bottom, so the seams
 *    between ruffle rows read as deep shadowed folds (the Aspear-tree look).
 *  - a small skyward lighten on up-facing normals (painted sky light).
 * Assumes the mesh's rotation preserves Y.
 */
function bakeCrownShading(mesh, bottom, top, y0, y1, creviceDepth = 0.3) {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const yWorld = mesh.position.y + pos.getY(i) * mesh.scale.y
    const lin = Math.min(1, Math.max(0, (yWorld - y0) / (y1 - y0)))
    c.copy(bottom).lerp(top, lin ** 1.5)
    // Puff-local crevice: 0 at the puff's own bottom → 1 at its top.
    const puffT = (pos.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y)
    const crevice = 1 - creviceDepth * (1 - puffT) ** 1.4
    const sky = 0.05 * Math.max(0, nrm.getY(i))
    colors[i * 3] = c.r * crevice + sky
    colors[i * 3 + 1] = c.g * crevice + sky
    colors[i * 3 + 2] = c.b * crevice + sky
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

// Palette (matches src/models/buildObjectModel.ts so mixed procedural/GLB kinds
// stay in one family).
const LEAF = 0x8fd062
const COCONUT = 0x7a5230

/** Foliage: the runtime attaches the full-color AC leaf map (foliage-leaves.png,
 *  the sand-pipeline approach — the MAP is the surface color). Vertex colors are
 *  baked as hue-NEUTRAL grayscale shading (gradient + crevices) that multiplies
 *  the map; `tint` shifts the map's hue per kind (white = as painted). */
function foliageMat(tint = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({ color: tint, vertexColors: true, roughness: 1, metalness: 0 })
  m.name = 'foliage'
  return m
}
function barkMat() {
  // Deeper than the shared TRUNK tint: untextured GLB bark carries all its
  // color itself (the painted map, once attached at runtime, lightens it back).
  const m = new THREE.MeshStandardMaterial({ color: 0xb5824a, roughness: 0.88, metalness: 0 })
  m.name = 'bark'
  return m
}

/** A soft ruffle puff: smoothed icosphere, y-squashed, crevice-shaded.
 *  detail 1 (smoothed) keeps ring puffs light — dozens ship per crown; the few
 *  big core/dome puffs use detail 2 for a clean silhouette. */
function puff(r, squash, mat, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(r, detail)
  smoothNormals(geo)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.scale.y = squash
  return mesh
}

/** A soft foliage blob (the Pokopia read): an icosphere displaced along its
 *  normals by a seeded, position-keyed amount (watertight — duplicate vertices
 *  get the same offset), then normal-SMOOTHED so it renders as a gently
 *  scalloped rounded mass — organic bumps in the silhouette, no hard facets.
 *  Consumes exactly one rand(). */
function blob(r, squash, mat, rand, amount, detail = 2) {
  const geo = new THREE.IcosahedronGeometry(r, detail)
  const salt = Math.floor(rand() * 0xffffffff)
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const h = hashString(`${salt}:${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`)
    const d = (h / 0xffffffff - 0.5) * amount
    pos.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  smoothNormals(geo)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.scale.y = squash
  return mesh
}

/** A conifer skirt: a downward-flaring cone whose rim gets a gentle seeded
 *  wobble (scaled in XZ only, keyed on position so seam duplicates move
 *  together and the surface stays watertight), then normal-smoothed so it
 *  shades softly like the rest of the set. Consumes exactly one rand(). */
function skirt(R, H, mat, rand, amount) {
  const geo = new THREE.ConeGeometry(R, H, 10, 1)
  const salt = Math.floor(rand() * 0xffffffff)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (Math.hypot(x, z) < 1e-4) continue // apex/axis verts stay put
    const h = hashString(`${salt}:${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`)
    const d = 1 + (h / 0xffffffff - 0.5) * amount
    pos.setXYZ(i, x * d, y, z * d)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  smoothNormals(geo)
  return new THREE.Mesh(geo, mat)
}

/** Small stable string→int hash (same as src/models/rand.ts). */
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// fruitTree — the Aspear-tree form
// ---------------------------------------------------------------------------

function buildFruitTree() {
  const rand = mulberry32(7)
  const root = new THREE.Group()
  root.name = 'fruitTree'

  // Trunk: one smooth lathe — wide root flare, slim shaft, a collar flaring
  // back out where it vanishes into the crown. Smooth-shaded (the reference
  // trunk is a clean painted surface, not faceted).
  const profile = [
    new THREE.Vector2(0.3, 0),
    new THREE.Vector2(0.21, 0.06),
    new THREE.Vector2(0.15, 0.16),
    new THREE.Vector2(0.125, 0.34),
    new THREE.Vector2(0.125, 0.5),
    new THREE.Vector2(0.145, 0.62),
    new THREE.Vector2(0.17, 0.7),
    new THREE.Vector2(0.0, 0.74),
  ]
  const trunk = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), barkMat())
  trunk.name = 'trunk'
  root.add(trunk)

  // The crown sways as one mass: everything below lives in the named 'canopy'
  // group, pivoted where the trunk meets the foliage.
  const CANOPY_PIVOT_Y = 0.62
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.y = CANOPY_PIVOT_Y
  canopy.userData.windAmp = 1
  root.add(canopy)

  // Hue-neutral shade span: undersides fall to ~58% brightness, tops to full.
  const low = new THREE.Color(0.68, 0.68, 0.68)
  const high = new THREE.Color(1, 1, 1)
  const GRAD_Y0 = -0.08 // crown-space span: lobe undersides…
  const GRAD_Y1 = 1.05 // …to the dome top
  const leaf = foliageMat() // ONE shared material for the whole crown

  // The AC/Pokopia stack, simplified to FOUR masses: three fat lower lobes
  // ringing the fork + one big dome on top. Each is a soft `blob` — smooth
  // rounded, gently scalloped by seeded displacement — so the crown reads as
  // plump painterly masses (Pokopia) while the four-mass grouping keeps the
  // AC silhouette.
  const ringYaw = rand() * Math.PI * 2
  for (let i = 0; i < 3; i++) {
    const az = ringYaw + (i / 3) * Math.PI * 2 + (rand() - 0.5) * 0.25
    const r = 0.35 + rand() * 0.04
    const lobe = blob(r, 0.85, leaf, rand, 0.16 * r)
    lobe.rotation.y = rand() * Math.PI
    lobe.position.set(Math.cos(az) * 0.25, 0.3 + (rand() - 0.5) * 0.04, Math.sin(az) * 0.25)
    bakeCrownShading(lobe, low, high, GRAD_Y0, GRAD_Y1, 0.16)
    canopy.add(lobe)
  }

  const dome = blob(0.45, 0.92, leaf, rand, 0.06, 2)
  dome.rotation.y = rand() * Math.PI
  dome.position.y = 0.66
  bakeCrownShading(dome, low, high, GRAD_Y0, GRAD_Y1, 0.1)
  canopy.add(dome)

  return root
}

// ---------------------------------------------------------------------------
// pine — the AC cedar from the wide reference: stacked conical ruffle skirts
// ---------------------------------------------------------------------------

function buildPine() {
  const rand = mulberry32(7)
  const root = new THREE.Group()
  root.name = 'pine'

  // Slim trunk, only its foot visible under the lowest skirt.
  const trunkProfile = [
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.11, 0.08),
    new THREE.Vector2(0.09, 0.3),
    new THREE.Vector2(0.0, 0.4),
  ]
  const cedarBark = barkMat()
  cedarBark.name = 'bark-cedar' // redder-brown map tint at runtime (AC cedar trunk)
  const trunk = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 10), cedarBark)
  trunk.name = 'trunk'
  root.add(trunk)

  // Conifers are stiff: the whole cone rocks as one, damped by windAmp.
  const CANOPY_PIVOT_Y = 0.3
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.y = CANOPY_PIVOT_Y
  canopy.userData.windAmp = 0.35
  root.add(canopy)

  // Cedar reads darker + bluer: a teal tint over the shared leaf map, and a
  // deeper hue-neutral shade span than the broadleaf crown.
  const low = new THREE.Color(0.78, 0.78, 0.78)
  const high = new THREE.Color(1, 1, 1)
  const GRAD_Y0 = -0.12
  const GRAD_Y1 = 1.2
  const leaf = foliageMat(0xb2dab9) // fallback tint until the cedar map attaches
  leaf.name = 'foliage-cedar' // its own blue-green feather map at runtime

  // Skirts, bottom → top: [base y, radius, height] — each a downward-flaring
  // CONE (the classic pointed conifer of the reference), overlapping the tier
  // above so the silhouette steps inward; the top cone is tall relative to its
  // radius, so the tree ends in a real point instead of a rounded nub. Gentle
  // seeded rim wobble keeps the hems organic; the crevice bake shades each
  // skirt's underside so tiers read as distinct shadowed layers.
  // Dense stacking (hems ~0.15 apart, tall cones) so tiers always overlap —
  // no see-through slivers between skirts at grazing angles.
  const skirts = [
    [0.0, 0.5, 0.52],
    [0.15, 0.43, 0.5],
    [0.3, 0.36, 0.48],
    [0.45, 0.29, 0.46],
    [0.6, 0.2, 0.55], // the peak
  ]
  for (const [y, R, H] of skirts) {
    const cone = skirt(R, H, leaf, rand, 0.14)
    cone.rotation.y = rand() * Math.PI
    cone.position.set((rand() - 0.5) * 0.03, y + H / 2, (rand() - 0.5) * 0.03)
    bakeCrownShading(cone, low, high, GRAD_Y0, GRAD_Y1, 0.16)
    canopy.add(cone)
  }

  return root
}

// ---------------------------------------------------------------------------
// palm — segmented stepped trunk, broad arched blade fronds, green coconuts
// (references: a low-poly palm render + the official AC coconut palm)
// ---------------------------------------------------------------------------

/** One palm frond: a creased tapering strip — a shallow inverted-V cross
 *  section (edges fold below the midrib) that arcs outward and droops along
 *  its length, widest mid-blade, ending in a point. UVs run u across the blade
 *  and v along it, so the leaflet texture's fringe follows the blade. Rendered
 *  double-sided (a strip has no volume). Consumes exactly two rand(). */
function frondBlade(L, W, mat, rand) {
  const N = 7
  const rise = 0.32 + rand() * 0.08 // initial upward reach…
  const droop = 0.85 + rand() * 0.12 // …arched over, tips hanging
  const positions = []
  const uvs = []
  for (let s = 0; s <= N; s++) {
    const t = s / N
    const out = L * t
    const y = rise * t - droop * t * t
    // Narrow stem, then BROAD along the whole length with a rounded tip —
    // the AC feather frond (the leaflet map's fringe does the rest).
    const w = W * Math.min(1, 0.3 + t * 3) * Math.sqrt(1 - t ** 3)
    const fold = 0.48 * w
    positions.push(out, y - fold, -w, out, y, 0, out, y - fold, w)
    uvs.push(0, t, 0.5, t, 1, t)
  }
  const indices = []
  for (let s = 0; s < N; s++) {
    const a = s * 3
    const b = a + 3
    indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, mat)
}

function buildPalm() {
  const rand = mulberry32(7)
  const root = new THREE.Group()
  root.name = 'palm'

  // The whole tree leans slightly from its base (the lean is part of the
  // asset; the runtime adds per-instance yaw, so the lean direction varies).
  const lean = new THREE.Group()
  lean.name = 'lean'
  lean.rotation.z = 0.06
  root.add(lean)

  // Trunk: a flared foot + five stacked tapering segments, each a touch wider
  // at its base than the segment below's top — the stepped knuckles of the
  // low-poly reference. Octagonal so the steps read as facets.
  const palmBark = new THREE.MeshStandardMaterial({ color: 0xc9954f, roughness: 0.9, metalness: 0 })
  palmBark.name = 'bark-palm'
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.1, 8), palmBark)
  foot.name = 'trunk'
  foot.position.y = 0.05
  lean.add(foot)
  const radii = [0.155, 0.138, 0.12, 0.105, 0.09]
  const SEG_H = 0.16
  for (let i = 0; i < radii.length; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(radii[i] * 0.84, radii[i], SEG_H, 8), palmBark)
    seg.position.y = 0.1 + SEG_H / 2 + i * (SEG_H - 0.005)
    lean.add(seg)
  }

  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.y = 0.1 + radii.length * (SEG_H - 0.005) + 0.02
  canopy.userData.windAmp = 0.7
  lean.add(canopy)

  const frondMat = new THREE.MeshStandardMaterial({
    color: LEAF,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  frondMat.name = 'frond'

  // Crown hub hides the blade stems and plugs the umbrella's center so the
  // crown reads solid from above.
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), frondMat)
  hub.scale.y = 0.55
  hub.position.y = 0.03
  canopy.add(hub)

  // Seven broad feather fronds fanned around the crown (the AC palm), each
  // arching up-and-over with hanging tips; small per-frond lift variation.
  const frondCount = 9
  for (let i = 0; i < frondCount; i++) {
    const holder = new THREE.Group()
    holder.rotation.y = (i / frondCount) * Math.PI * 2 + (rand() - 0.5) * 0.25
    const blade = frondBlade(0.68 + rand() * 0.06, 0.125, frondMat, rand)
    blade.rotation.z = 0.02 + (rand() - 0.5) * 0.08
    holder.add(blade)
    // Blades are authored along +x; the holder's yaw fans them around.
    holder.rotation.order = 'YXZ'
    canopy.add(holder)
  }

  // Two big bright coconuts hanging just under the crown (the AC pair).
  const cocoMat = new THREE.MeshStandardMaterial({ color: 0xa9ce55, roughness: 0.95, metalness: 0 })
  cocoMat.name = 'coconut'
  const cocoAz = rand() * Math.PI * 2
  for (let i = 0; i < 2; i++) {
    const a = cocoAz + i * 1.1 + (rand() - 0.5) * 0.3
    const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.085, 9, 7), cocoMat)
    coconut.scale.y = 1.15
    coconut.position.set(Math.cos(a) * 0.11, -0.08, Math.sin(a) * 0.11)
    canopy.add(coconut)
  }

  return root
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Ground the model (children shifted so bbox min.y = 0) and assert contract. */
function groundAndCheck(root) {
  const dy = new THREE.Box3().setFromObject(root).min.y
  for (const child of root.children) child.position.y -= dy
  const box = new THREE.Box3().setFromObject(root)
  const err = (msg) => {
    throw new Error(`${root.name}: ${msg} (bbox ${JSON.stringify(box)})`)
  }
  if (Math.abs(box.min.y) > 1e-6) err('base not grounded at y=0')
  if (box.max.y < 0.5) err('too short')
  for (const k of ['x', 'z']) {
    if (Math.abs(box.min[k]) > 1.2 || Math.abs(box.max[k]) > 1.2) err(`footprint exceeds ±1.2 on ${k}`)
  }
  if (!root.getObjectByName('canopy')) err("missing 'canopy' group")
}

async function exportGlb(root) {
  groundAndCheck(root)
  const exporter = new GLTFExporter()
  const buffer = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, { binary: true })
  })
  mkdirSync(OUT_DIR, { recursive: true })
  const file = join(OUT_DIR, `${root.name}.glb`)
  writeFileSync(file, Buffer.from(buffer))
  const kb = (buffer.byteLength / 1024).toFixed(1)
  console.log(`wrote ${file} (${kb} kB)`)
}

for (const build of [buildFruitTree, buildPine, buildPalm]) {
  await exportGlb(build())
}
