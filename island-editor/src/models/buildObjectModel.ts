import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { hashString, mulberry32 } from './rand'
import { modelTexture } from './textures'

// Stylized object models built from three.js primitives (the bird-builder
// approach: our own authorship, no asset/licensing pipeline). Art direction:
// Animal Crossing / Pokopia — chunky, rounded, soft — but with our own
// signature layered on top: seeded organic lumpiness (icosphere vertices
// displaced along their normals), sun-lightened canopy tips facing the scene
// sun, and mossy rocks. Surfaces carry soft hand-painted maps (bark / leaf /
// rock) so placed objects read with the same painterly finish as the textured
// terrain. Lit for the scene sun (Backdrop.tsx: ambient 0.6 + a directional
// 1.15 at [18,20,10]). Deterministic given a seed so previews are stable and
// placement re-derives the same variety on reload. No Math.random / Date — the
// seeded PRNG is the only entropy source.

type Rand = () => number

// Base tints. The bark/leaf/rock maps multiply the material color, which darkens
// the result, so these are lightened relative to the pre-texture solids to hold
// the same on-screen brightness under the scene sun (tune in the browser).
const TRUNK = 0xc9a878 // light warm tint so the bark map reads bright, not muddy
const LEAF = 0x8fd062 // bright AC grass-green canopy (lightened for the leaf map)
const LEAF_DEEP = 0x63a84f // richer green for the conifer tiers (lightened too)
const APPLE = 0xe4564a // cheerful red fruit (untextured accent)
const ROCK = 0xb8b2a6 // warm light stone (lightened for the rock map)
const COCONUT = 0x7a5230
// Signature AC bush bloom: soft pink, cream, buttery yellow.
const FLOWERS = [0xf7a8c8, 0xfff2e6, 0xffd766]

// Scene sun direction (Backdrop.tsx directional at [18,20,10]); canopy sun-tips
// are nestled on the lobe surface facing this.
const SUN = new THREE.Vector3(18, 20, 10).normalize()

/** Guarded texture lookup: `null` in a DOM-less env (vitest/node) so the builder
 *  runs headless without touching TextureLoader; a shared, cached THREE.Texture
 *  in the browser. Never dispose or mutate the returned texture — it is shared
 *  across every model (mutating tex.repeat etc. would corrupt other instances). */
function tex(name: Parameters<typeof modelTexture>[0]): THREE.Texture | null {
  return typeof document === 'undefined' ? null : modelTexture(name)
}

/** Bark material — warm tint over the vertical-streak bark map, gently faceted
 *  so trunks keep a low-poly edge that sits with the flat-shaded terrain. */
function bark(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: TRUNK,
    map: tex('bark-soft-streaks') ?? undefined,
    flatShading: true,
    roughness: 0.88,
    metalness: 0,
  })
}

/** Leaf material — smooth-shaded, carrying the soft leaf-tuft map under the
 *  given tint. The map is painted light so per-lobe HSL tints don't muddy it. */
function leafMat(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map: tex('leaf-soft-tufts') ?? undefined,
    flatShading: false,
    roughness: 0.95,
    metalness: 0,
  })
}

/** Stone material — ROCK tint over the speckled stone map, with a small seeded
 *  lightness jitter so clustered stones read as distinct volumes. */
function stone(rand: Rand): THREE.MeshStandardMaterial {
  const c = new THREE.Color(ROCK)
  c.offsetHSL(0, 0, (rand() - 0.5) * 0.05)
  return new THREE.MeshStandardMaterial({
    color: c,
    map: tex('rock-soft-speckle') ?? undefined,
    flatShading: false,
    roughness: 0.9,
    metalness: 0,
  })
}

/** Smooth (non-faceted) untextured lit material — clean accents (apples,
 *  flowers, coconuts, the palm hub) that read better without a map. */
function soft(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.95, metalness: 0 })
}

/** Leaf material with a small seeded lightness jitter so clustered foliage lobes
 *  read as distinct volumes within one fluffy mass rather than a single blob. */
function tinted(base: number, rand: Rand, amount = 0.07): THREE.MeshStandardMaterial {
  const c = new THREE.Color(base)
  c.offsetHSL(0, 0, (rand() - 0.5) * amount)
  return leafMat(c)
}

/** A rounded foliage blob: a detail-1 icosphere (rounded silhouette, ~80 tris)
 *  smooth-shaded so it reads as a soft puff, not an angular gem. */
function blob(r: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat)
}

/** Seeded organic lumpiness — our signature over AC's clean spheres. Displaces
 *  each vertex of an icosphere along its normal by a small amount, then
 *  recomputes normals for chunky low-poly facets.
 *
 *  NOTE: IcosahedronGeometry is NON-indexed in three (each face owns its 3
 *  vertices, so co-located duplicates exist). We therefore key the displacement
 *  off the *quantized vertex position*, not the array slot: every duplicate of a
 *  vertex gets the SAME offset and the surface stays watertight (offsetting by
 *  slot index would tear the mesh apart). Consumes exactly one rand() (a salt)
 *  so call order — and thus determinism — is independent of the vertex count. */
function lumpy(geo: THREE.BufferGeometry, rand: Rand, amount: number): void {
  const salt = Math.floor(rand() * 0xffffffff)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Stable per-position pseudo-random in [-0.5, 0.5] (duplicates hash equal).
    const h = hashString(`${salt}:${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`)
    const d = (h / 0xffffffff - 0.5) * amount
    pos.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

/** Nestle a small, lighter foliage lobe on a parent lobe's sun-facing upper side
 *  — a painted sun-kissed highlight. Consumes one rand() (the tip radius). */
function addSunTip(
  parts: THREE.Object3D[],
  center: { x: number; y: number; z: number },
  r: number,
  base: number,
  rand: Rand,
): void {
  const c = new THREE.Color(base)
  c.offsetHSL(0, 0, 0.1)
  const tipR = r * (0.3 + rand() * 0.1) // 30–40% of the parent lobe
  const tip = blob(tipR, leafMat(c))
  tip.position.set(center.x + SUN.x * 0.6 * r, center.y + SUN.y * 0.6 * r, center.z + SUN.z * 0.6 * r)
  parts.push(tip)
}

/** One rounded, lumpy, leaf-textured canopy block, nudged by a small seeded
 *  jitter and spun. Consumes a FIXED count of rand() (lumpy salt, tint jitter,
 *  3 position jitters, spin) so the caller's rand() order stays deterministic. */
function leafBlock(rand: Rand, x: number, y: number, z: number, r: number): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(r, 1)
  lumpy(g, rand, 0.12 * r)
  const m = new THREE.Mesh(g, tinted(LEAF, rand))
  m.position.set(x + (rand() - 0.5) * 0.05, y + (rand() - 0.5) * 0.05, z + (rand() - 0.5) * 0.05)
  m.rotation.y = rand() * Math.PI
  return m
}

// An AC apple tree: a two-segment chunky trunk with a squashed root flare, under
// a full, dense round canopy built as a tiered stack of rounded lumpy leaf
// blocks (interlocking rings), sun-tipped on top and scattered with apples.
function fruitTree(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  // Root flare: a squashed sphere at the foot so the trunk grows out of a base.
  const flare = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bark())
  flare.scale.y = 0.4
  flare.position.y = 0.06
  parts.push(flare)

  // Two-segment trunk: base cylinder + a narrower, slightly tilted upper.
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.34, 7), bark())
  lower.position.y = 0.23
  parts.push(lower)

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.28, 7), bark())
  upper.position.y = 0.53
  upper.rotation.z = (rand() - 0.5) * 0.15
  parts.push(upper)

  // Foliage lives in a named 'canopy' sub-group pivoted at the trunk top, so the
  // render layer can sway the whole crown (wind) without moving the trunk. All
  // foliage positions below are canopy-LOCAL (world y − CANOPY_PIVOT_Y).
  const CANOPY_PIVOT_Y = 0.72
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.y = CANOPY_PIVOT_Y
  const foliage: THREE.Object3D[] = []

  // Stacked tiers of rounded lumpy leaf blocks piled into one full round mass;
  // rings are offset half a step so the blocks interlock and read solid, not
  // sparse. mid + upper lobes are remembered so apples can hang off them.
  type Lobe = { x: number; y: number; z: number; r: number }

  // Base tier: a center block ringed by 5 (widest, seats on the trunk top).
  foliage.push(leafBlock(rand, 0, 0.2, 0, 0.34))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    foliage.push(leafBlock(rand, Math.cos(a) * 0.34, 0.2, Math.sin(a) * 0.34, 0.3))
  }

  // Mid tier: ring of 5, rotated half a step so it sits in the base ring's gaps.
  const mid: Lobe[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5
    const x = Math.cos(a) * 0.28
    const z = Math.sin(a) * 0.28
    foliage.push(leafBlock(rand, x, 0.48, z, 0.27))
    mid.push({ x, y: 0.48, z, r: 0.27 })
  }

  // Upper tier: tighter ring of 4.
  const upperTier: Lobe[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(a) * 0.18
    const z = Math.sin(a) * 0.18
    foliage.push(leafBlock(rand, x, 0.74, z, 0.23))
    upperTier.push({ x, y: 0.74, z, r: 0.23 })
  }

  // Cap block closes the top.
  foliage.push(leafBlock(rand, 0, 0.96, 0, 0.21))

  // Sun-kissed highlights: the cap + three upper/outer blocks (fixed count).
  addSunTip(foliage, { x: 0, y: 0.96, z: 0 }, 0.21, LEAF, rand)
  for (let i = 0; i < 3; i++) addSunTip(foliage, upperTier[i], upperTier[i].r, LEAF, rand)

  // Apples nestled on the outer surface of the mid + upper tiers.
  const hangLobes = [...mid, ...upperTier]
  const appleCount = 3 + Math.floor(rand() * 3) // 3..5
  for (let i = 0; i < appleCount; i++) {
    const base = hangLobes[Math.floor(rand() * hangLobes.length)]
    const theta = rand() * Math.PI * 2
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), soft(APPLE))
    apple.position.set(
      base.x + Math.cos(theta) * base.r * 0.85,
      base.y - base.r * 0.2,
      base.z + Math.sin(theta) * base.r * 0.85,
    )
    foliage.push(apple)
  }

  for (const f of foliage) canopy.add(f)
  parts.push(canopy)

  return parts
}

// A soft conifer: a short trunk under 4 rounded tiers (flattened, drooping puffs
// of decreasing radius) stacked into a cushiony christmas-tree, each tier ringed
// with a few tiny lighter-green tip-bumps, capped by a little ball.
function pine(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.34, 7), bark())
  trunk.position.y = 0.17
  parts.push(trunk)

  const radii = [0.52, 0.42, 0.32, 0.22]
  const centers = [0.5, 0.78, 1.03, 1.24]
  const tipTint = new THREE.Color(LEAF_DEEP)
  tipTint.offsetHSL(0, 0, 0.12)
  for (let i = 0; i < radii.length; i++) {
    const tier = blob(radii[i], tinted(LEAF_DEEP, rand, 0.05))
    tier.scale.y = 0.6 // flatten + droop each puff into a soft tier
    tier.position.set((rand() - 0.5) * 0.05, centers[i], (rand() - 0.5) * 0.05)
    tier.rotation.y = rand() * Math.PI + (i % 2) * (Math.PI / 5) // alternate spin
    parts.push(tier)

    // 2–3 lighter tip-bumps perched on this tier's rim.
    const tipCount = 2 + Math.floor(rand() * 2) // 2 or 3
    for (let t = 0; t < tipCount; t++) {
      const ang = rand() * Math.PI * 2
      const nub = blob(0.06, leafMat(tipTint))
      nub.position.set(Math.cos(ang) * radii[i] * 0.9, centers[i] + 0.02, Math.sin(ang) * radii[i] * 0.9)
      parts.push(nub)
    }
  }

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), soft(LEAF_DEEP))
  tip.position.y = 1.4
  parts.push(tip)

  return parts
}

// A palm: a tall trunk leaning slightly (the whole thing lives in a `lean` group
// rotated about its base) with a few faint trunk rings, a crown of broad drooping
// two-tone fronds, a rounded crown hub to hide their origins, and a couple of
// coconuts. Returns the single lean group so the base pivot stays at y=0.
function palm(rand: Rand): THREE.Object3D[] {
  const lean = new THREE.Group()
  lean.rotation.z = (0.05 + rand() * 0.07) * (rand() < 0.5 ? 1 : -1) // ±0.05..0.12 rad

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.0, 7), bark())
  trunk.position.y = 0.5
  lean.add(trunk)

  // 2–3 faint ring bumps banding the trunk.
  const ringCount = 2 + Math.floor(rand() * 2) // 2 or 3
  for (let i = 0; i < ringCount; i++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8), bark())
    ring.position.y = 0.25 + i * 0.28
    lean.add(ring)
  }

  const crownY = 1.0
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), soft(LEAF))
  hub.position.y = crownY
  lean.add(hub)

  const frondCount = 7 + Math.floor(rand() * 3) // 7..9
  const deep = new THREE.Color(LEAF)
  deep.offsetHSL(0, 0.03, -0.08) // slightly deeper alternating tone
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.Group()
    frond.position.y = crownY
    frond.rotation.y = (i / frondCount) * Math.PI * 2 + rand() * 0.2

    const blade = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), soft(i % 2 === 0 ? LEAF : deep))
    blade.scale.set(0.42, 0.28, 1.7) // squash a sphere into a broad soft blade
    blade.rotation.x = 0.55 // splay outward, then droop down
    blade.position.set(0, -0.03, 0.34)
    frond.add(blade)
    lean.add(frond)
  }

  if (rand() < 0.6) {
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2
      const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), soft(COCONUT))
      coconut.position.set(Math.cos(a) * 0.08, crownY - 0.09, Math.sin(a) * 0.08)
      lean.add(coconut)
    }
  }

  return [lean]
}

// A flowering shrub: a rounded fluffy mound of 3–4 overlapping lumpy lobes near
// the ground, each with a sun-tip highlight, dotted with a few little AC bloom
// flowers (each a colored petal ball with a tiny cream center). No trunk.
function bush(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const lobeCount = 3 + Math.floor(rand() * 2) // 3 or 4
  const lobes: { x: number; y: number; z: number; r: number }[] = []
  for (let i = 0; i < lobeCount; i++) {
    const r = 0.24 + rand() * 0.1 // 0.24..0.34
    const x = (rand() - 0.5) * 0.28
    const z = (rand() - 0.5) * 0.28
    const y = r - 0.04 + rand() * 0.1
    const geo = new THREE.IcosahedronGeometry(r, 1)
    lumpy(geo, rand, 0.12 * r)
    const lobe = new THREE.Mesh(geo, tinted(LEAF, rand, 0.09))
    lobe.position.set(x, y, z)
    lobe.rotation.y = rand() * Math.PI
    parts.push(lobe)
    lobes.push({ x, y, z, r })
    addSunTip(parts, { x, y, z }, r, LEAF, rand)
  }

  const flowerColor = FLOWERS[Math.floor(rand() * FLOWERS.length)]
  const flowerCount = 2 + Math.floor(rand() * 5) // 2..6
  for (let i = 0; i < flowerCount; i++) {
    const base = lobes[Math.floor(rand() * lobes.length)]
    const theta = rand() * Math.PI * 2
    // Perch near the top-outer surface of a chosen lobe.
    const px = base.x + Math.cos(theta) * base.r * 0.7
    const py = base.y + base.r * 0.6
    const pz = base.z + Math.sin(theta) * base.r * 0.7
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), soft(flowerColor))
    flower.position.set(px, py, pz)
    parts.push(flower)
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), soft(0xfff6df))
    center.position.set(px, py + 0.035, pz)
    parts.push(center)
  }

  return parts
}

// A boulder: 1–2 lumpy rounded stones (detail-1 icospheres displaced along their
// normals, gentle non-uniform scale), often wearing a flat moss cap, with a
// pebble or two beside them. Final grounding (below) drops it onto the terrain.
function rock(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const count = rand() < 0.4 ? 2 : 1
  let biggest = { r: 0, x: 0, y: 0 }
  for (let i = 0; i < count; i++) {
    const r = 0.3 + rand() * 0.12 // 0.3..0.42
    const geo = new THREE.IcosahedronGeometry(r, 1)
    lumpy(geo, rand, 0.12 * r)
    const st = new THREE.Mesh(geo, stone(rand))
    const sx = (rand() - 0.5) * 0.25
    const sy = r * 0.5
    const sz = (rand() - 0.5) * 0.25
    st.scale.set(1 + rand() * 0.18, 0.68 + rand() * 0.2, 1 + rand() * 0.18)
    st.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4)
    st.position.set(sx, sy, sz)
    parts.push(st)
    if (r > biggest.r) biggest = { r, x: sx, y: sy }
  }

  // Moss cap: a very flattened, darker leaf lobe on the biggest stone (~half the
  // time). The rand() is always consumed so call order stays fixed.
  if (rand() < 0.5) {
    const c = new THREE.Color(LEAF)
    c.offsetHSL(0, 0, -0.05)
    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(biggest.r * 0.55, 1), leafMat(c))
    moss.scale.y = 0.25
    moss.position.set(biggest.x, biggest.y + biggest.r * 0.4, 0)
    parts.push(moss)
  }

  // 1–2 pebbles (chunky detail-0 icosahedra) beside the boulder.
  const pebbleCount = 1 + Math.floor(rand() * 2) // 1 or 2
  for (let i = 0; i < pebbleCount; i++) {
    const pr = 0.05 + rand() * 0.03 // 0.05..0.08
    const a = rand() * Math.PI * 2
    const peb = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 0), stone(rand))
    peb.position.set(Math.cos(a) * (biggest.r + 0.15), pr * 0.5, Math.sin(a) * (biggest.r + 0.15))
    parts.push(peb)
  }

  return parts
}

const BUILDERS: Record<ObjectKind, (rand: Rand) => THREE.Object3D[]> = {
  fruitTree,
  pine,
  palm,
  bush,
  rock,
}

/** Stylized model for `kind`, centered on X/Z with its base at y=0 and a ~1-unit
 *  footprint (callers scale/position uniformly). Deterministic given `seed`. The
 *  contract Plans B (placement) + C (palette) consume — do not change the
 *  signature without updating them. */
export function buildObjectModel(kind: ObjectKind, seed = 1): THREE.Group {
  const rand = mulberry32(seed)
  const group = new THREE.Group()
  group.name = kind

  for (const part of BUILDERS[kind](rand)) group.add(part)

  // Ground the model: shift every child up so the lowest point sits at y=0. We
  // move the CHILDREN (not group.position) so a caller can freely set
  // group.position — e.g. an r3f <primitive position> — without clobbering the
  // grounding. Shifting all children by the same dy translates the whole bbox.
  const dy = new THREE.Box3().setFromObject(group).min.y
  for (const child of group.children) child.position.y -= dy

  return group
}
