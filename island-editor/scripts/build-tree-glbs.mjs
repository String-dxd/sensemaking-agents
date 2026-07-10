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
// palm — low-poly cozy remodel (2026-07-09): a gently CURVED trunk of stacked
// flared collar bands + chunky flat-faceted fronds whose edges are cut into
// deep rounded leaflet lobes. References: two cozy-game low-poly palm renders
// (soft scalloped-lobe crowns / papercraft faceted fronds over banded,
// pineapple-notched trunks). Unlike the smooth broadleaf/cedar set, the palm
// is deliberately FLAT-shaded everywhere — the facets ARE the style.
// ---------------------------------------------------------------------------

/** Re-index to per-face normals: the flat papercraft facet shading. */
function faceted(geo) {
  const g = geo.toNonIndexed()
  g.computeVertexNormals()
  return g
}

/** One palm frond: a narrow creased LANCE — a pointed diamond silhouette
 *  (widest ~35% out, tapering to a sharp tip) with sawtooth leaflet points
 *  cut into the edges, folded along a center crease. The SPINE is a true
 *  palm arc: it leaves the growth point climbing at `theta0` (radians above
 *  horizontal) and bends continuously through `bend` radians, so the frond
 *  reaches up-and-out then arches over with the tip hanging — the fountain
 *  shape every real palm crown has. The crease fold stays perpendicular to
 *  the spine's local direction (a vertical fold would flatten the steep
 *  base). Flat-faceted; UVs run u across the blade, v along it; double-sided
 *  (a strip has no volume). Consumes exactly two rand(). */
function frondBlade(L, W, theta0, bend, mat, rand) {
  const N = 7 // few long facets — the papercraft reference blades are plain
  const th0 = theta0 + (rand() - 0.5) * 0.1
  const dth = bend + (rand() - 0.5) * 0.14
  const positions = []
  const uvs = []
  const ds = L / N
  let px = 0
  let py = 0
  for (let s = 0; s <= N; s++) {
    const t = s / N
    const theta = th0 - dth * t // spine direction, bending over as it goes
    // Clean diamond silhouette: near-linear widen to ~40% out, straight
    // taper to a point. No edge teeth — the reference blades are plain
    // creased lances; the low segment count alone gives the faceted look.
    const env = t < 0.4 ? 0.4 + (t / 0.4) * 0.6 : (1 - t) / 0.6
    const w = W * env
    // Fold perpendicular to the spine: edges drop toward the blade's local
    // "down" (sin, -cos), keeping the V crease through the whole arc.
    const fold = 0.42 * W * env
    const fx = fold * Math.sin(theta)
    const fy = -fold * Math.cos(theta)
    positions.push(px + fx, py + fy, -w, px, py, 0, px + fx, py + fy, w)
    uvs.push(0, t, 0.5, t, 1, t)
    px += Math.cos(theta) * ds
    py += Math.sin(theta) * ds
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
  return new THREE.Mesh(faceted(geo), mat)
}

function buildPalm() {
  const rand = mulberry32(7)
  const root = new THREE.Group()
  root.name = 'palm'

  // Curved spine, baked into the asset (the runtime adds per-instance yaw, so
  // the bend direction varies): vertical at the base, leaning increasingly
  // toward +x with height — the reference palms all bow, never telescope.
  const TRUNK_H = 1.35
  const BEND = 0.24 // total sideways offset at the crown
  const spineX = (t) => BEND * t * t
  const spineTilt = (t) => Math.atan2(2 * BEND * t, TRUNK_H) // lean angle from vertical

  // Trunk: ONE smooth tapered column following the spine (the simplified
  // reference trunks are plain faceted poles — no notch bands): 5 stacked
  // frustum segments with continuous radii, 7 radial sides, flat facets.
  // Broad at the root (extra ground flare), ~55% radius under the crown.
  const palmBark = new THREE.MeshStandardMaterial({ color: 0xc9954f, roughness: 0.9, metalness: 0 })
  palmBark.name = 'bark-palm'
  const SEGS = 5
  const segH = TRUNK_H / SEGS
  const radiusAt = (t) => (0.115 - 0.052 * t) * (t < 0.08 ? 1.14 : 1)
  for (let i = 0; i < SEGS; i++) {
    const t0 = i / SEGS
    const t1 = (i + 1) / SEGS
    const seg = new THREE.Mesh(
      // 1.03 height overlap hides hairline gaps where the tilt changes.
      faceted(new THREE.CylinderGeometry(radiusAt(t1), radiusAt(t0), segH * 1.03, 7, 1)),
      palmBark,
    )
    const tm = (t0 + t1) / 2
    seg.position.set(spineX(tm), TRUNK_H * tm, 0)
    seg.rotation.z = -spineTilt(tm)
    if (i === 0) seg.name = 'trunk'
    root.add(seg)
  }

  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.set(spineX(1), TRUNK_H - 0.02, 0)
  // Palms are the LOOSEST crown in the set: long flexible fronds catch every
  // gust, so they sway harder than the broadleaf (1), not softer.
  canopy.userData.windAmp = 1.25
  root.add(canopy)

  // Emissive floor: fronds are thin DoubleSide strips, so half of them face
  // away from the sun at any angle — without a lift their undersides crush to
  // near-black and the crown reads lopsided. The soft self-light keeps both
  // faces in the same painted key.
  const frondMat = new THREE.MeshStandardMaterial({
    color: LEAF,
    emissive: 0x2a5a26,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  frondMat.name = 'frond'

  // Crown hub: a small faceted knuckle covering the blade roots and the
  // trunk's top band.
  const hub = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.1, 7, 5)), frondMat)
  hub.scale.y = 0.65
  hub.position.y = 0.02
  canopy.add(hub)

  // The simplified crown: TWO strictly uniform tiers — 8 long rim fronds at
  // 45° spacing arching over, and 4 short steep ones sitting exactly between
  // them — with NO per-frond yaw jitter, so the star reads clean and even
  // from every direction (the reference crowns are tidy bursts; the earlier
  // jittered 16-frond stack read as a crumpled mass in-game). Per-blade
  // theta/bend jitter alone keeps it from looking stamped. Holders stay
  // GROUPS: the runtime re-fans them per placement.
  const tiers = [
    { count: 8, L: 0.72, W: 0.2, theta0: 0.75, bend: 1.4, yawOff: 0 },
    { count: 4, L: 0.48, W: 0.15, theta0: 1.2, bend: 0.95, yawOff: Math.PI / 8 },
  ]
  for (const tier of tiers) {
    for (let i = 0; i < tier.count; i++) {
      const holder = new THREE.Group()
      holder.rotation.y = (i / tier.count) * Math.PI * 2 + tier.yawOff
      const blade = frondBlade(tier.L + rand() * 0.04, tier.W, tier.theta0, tier.bend, frondMat, rand)
      holder.add(blade)
      holder.rotation.order = 'YXZ'
      canopy.add(holder)
    }
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
