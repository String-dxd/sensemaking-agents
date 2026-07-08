import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { hashString, mulberry32 } from './rand'
import { modelTexture } from './textures'

// Stylized object models built from three.js primitives (the bird-builder
// approach: our own authorship, no asset/licensing pipeline). Art direction:
// Animal Crossing / Pokémon-cozy — each crown reads as ONE cohesive matte mass
// with a smooth baked vertical color gradient (deep green low → sunny
// yellow-green high) and rounded scallop bumps, not a pile of distinct
// textured spheres. Foliage is untextured flat color (vertex-color gradient);
// only bark and stone carry soft hand-painted maps. Lit for the scene sun
// (Backdrop.tsx: ambient 0.6 + a directional 1.15 at [18,20,10]).
// Deterministic given a seed so previews are stable and placement re-derives
// the same variety on reload. No Math.random / Date — the seeded PRNG is the
// only entropy source.

type Rand = () => number

// Base tints. Bark/rock maps multiply the material color (so those are
// lightened); foliage gradients are baked per-vertex and render as-is.
const TRUNK = 0xcf9a58 // caramel tint; the bark map is painted light so this reads as AC's honey trunk
const LEAF = 0x8fd062 // flat mid green — palm hub/fronds, rock moss
const CANOPY_LOW = 0x3d8038 // broadleaf crown gradient: shaded underside…
const CANOPY_HIGH = 0xb4e060 // …to sunny yellow-green top
const CEDAR_LOW = 0x2c6650 // cedar skirt gradient: dark teal base…
const CEDAR_HIGH = 0x6bac76 // …to lighter blue-green tips
const APPLE = 0xd84340 // deep cheerful red fruit (reads well on flat green)
const ROCK = 0xb8b2a6 // warm light stone (lightened for the rock map)
const COCONUT = 0x7a5230
// Signature AC bush bloom: soft pink, cream, buttery yellow.
const FLOWERS = [0xf7a8c8, 0xfff2e6, 0xffd766]

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
 *  flowers, coconuts, palm fronds) that read better without a map. */
function soft(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.95, metalness: 0 })
}

/** Foliage material — fully matte, colored ONLY by the baked per-vertex
 *  gradient (see bakeGradient). No map, no highlight: the flat toon look. */
function gradientMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: false,
    roughness: 1,
    metalness: 0,
  })
}

/** Bake a bottom→top color gradient into a mesh's vertex colors, keyed on the
 *  vertex's CROWN-space height (mesh.position.y + local y × scale.y), so a
 *  crown assembled from several meshes shades as ONE continuous mass from
 *  `y0` (bottom color) to `y1` (top color). A small skyward term lightens
 *  up-facing vertices — soft painted sky light, not a specular highlight.
 *  Deterministic; consumes no rand(). Safe only for meshes whose rotation
 *  preserves Y (rotation.y); don't call it on tilted meshes. */
function bakeGradient(mesh: THREE.Mesh, bottom: THREE.Color, top: THREE.Color, y0: number, y1: number): void {
  const geo = mesh.geometry
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = mesh.position.y + pos.getY(i) * mesh.scale.y
    const lin = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))
    const t = lin ** 1.5 // bias dark low: the underside stays shaded well past midway
    c.copy(bottom).lerp(top, t)
    const sky = 0.05 * Math.max(0, nrm.getY(i))
    colors[i * 3] = c.r + sky
    colors[i * 3 + 1] = c.g + sky
    colors[i * 3 + 2] = c.b + sky
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/** Average normals across co-located (quantized) duplicate vertices so a
 *  non-indexed icosphere shades as one continuous soft bubble instead of
 *  crumpled facets. Same quantization key as `lumpy()` so duplicates agree. */
function smoothNormals(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  const keyOf = (i: number) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
  const acc = new Map<string, [number, number, number]>()
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

/** Seeded organic lumpiness — kept subtle (bush lobes, rocks). Displaces each
 *  vertex of an icosphere along its normal by a small amount, then re-smooths
 *  the normals so the surface reads as a soft rounded bubble, not crumpled
 *  low-poly facets.
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
  smoothNormals(geo)
}

// An AC apple tree: a two-segment chunky trunk with a squashed root flare under
// ONE cohesive crown — a big squashed core sphere with rounded scallop mounds
// embedded in its surface and larger lobes around the bottom rim, all sharing a
// single baked bottom-dark → top-light gradient, dotted with apples.
function fruitTree(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  // Root flare: a squashed sphere at the foot so the trunk grows out of a base.
  const flare = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), bark())
  flare.scale.y = 0.4
  flare.position.y = 0.06
  parts.push(flare)

  // Two-segment chunky trunk: base cylinder + a narrower, slightly tilted upper.
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.34, 7), bark())
  lower.position.y = 0.23
  parts.push(lower)

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.28, 7), bark())
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
  canopy.userData.windAmp = 1 // broadleaf crown takes the full wind

  const low = new THREE.Color(CANOPY_LOW)
  const high = new THREE.Color(CANOPY_HIGH)
  const CROWN_C = 0.5 // crown center, canopy-local
  const CORE_R = 0.52
  const GRAD_Y0 = -0.06 // crown-space gradient span (bottom rim lobes…)
  const GRAD_Y1 = 1.02 // …to the top of the highest scallop

  // The core: one big, slightly squashed sphere — the crown IS this mass.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(CORE_R, 3), gradientMat())
  core.scale.y = 0.92
  core.position.y = CROWN_C
  bakeGradient(core, low, high, GRAD_Y0, GRAD_Y1)
  canopy.add(core)

  // Scallop mounds half-embedded in the core surface: evenly fanned azimuths
  // with seeded jitter, biased to the upper hemisphere so the top reads as
  // billowy stacked puffs while the sides stay rounded.
  for (let i = 0; i < 10; i++) {
    const az = (i / 10) * Math.PI * 2 + rand() * 0.55
    const el = -0.12 + rand() * 0.85 // radians above the equator (mostly upper)
    const r = 0.17 + rand() * 0.09
    const dist = CORE_R - r * 0.35 // half-embedded: ~0.65r of the mound protrudes
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), gradientMat())
    m.position.set(
      Math.cos(el) * Math.cos(az) * dist,
      CROWN_C + Math.sin(el) * dist * 0.92,
      Math.cos(el) * Math.sin(az) * dist,
    )
    m.scale.y = 0.9
    bakeGradient(m, low, high, GRAD_Y0, GRAD_Y1)
    canopy.add(m)
  }

  // A fixed billowy cap mound so the top always reads as stacked puffs even
  // when the seeded scallops land low.
  const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 2), gradientMat())
  cap.position.set(0, CROWN_C + (CORE_R - 0.21 * 0.35) * 0.92, 0)
  cap.scale.y = 0.9
  bakeGradient(cap, low, high, GRAD_Y0, GRAD_Y1)
  canopy.add(cap)

  // Bottom rim lobes so the underside silhouette reads lobed, not spherical.
  for (let i = 0; i < 4; i++) {
    const az = (i / 4) * Math.PI * 2 + rand() * 0.5
    const r = 0.23 + rand() * 0.05
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), gradientMat())
    m.position.set(Math.cos(az) * 0.34, CROWN_C - 0.3, Math.sin(az) * 0.34)
    m.scale.y = 0.85
    bakeGradient(m, low, high, GRAD_Y0, GRAD_Y1)
    canopy.add(m)
  }

  // Apples perched on the visible skin of the crown (outward low-mid band).
  const appleCount = 3 + Math.floor(rand() * 3) // 3..5
  for (let i = 0; i < appleCount; i++) {
    const az = (i / appleCount) * Math.PI * 2 + rand() * 1.2
    const el = -0.1 + rand() * 0.5
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), soft(APPLE))
    apple.position.set(
      Math.cos(el) * Math.cos(az) * CORE_R * 1.02,
      CROWN_C + Math.sin(el) * CORE_R * 0.94,
      Math.cos(el) * Math.sin(az) * CORE_R * 1.02,
    )
    canopy.add(apple)
  }

  parts.push(canopy)
  return parts
}

// An AC cedar: a short trunk under 4 conical skirts — each a flattened center
// puff fringed with a ring of small drooping lobes (the scalloped rim) — in a
// dark-teal bottom → lighter top gradient, with a soft pointed spire on top.
function pine(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.34, 7), bark())
  trunk.position.y = 0.17
  parts.push(trunk)

  // Foliage skirts live in a 'canopy' group pivoted at the trunk top so the wind
  // hook can rock the whole cone. Conifers are stiff: windAmp damps the sway.
  // Positions below are canopy-LOCAL (world y − PINE_PIVOT_Y).
  const PINE_PIVOT_Y = 0.4
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.y = PINE_PIVOT_Y
  canopy.userData.windAmp = 0.35
  parts.push(canopy)

  const low = new THREE.Color(CEDAR_LOW)
  const high = new THREE.Color(CEDAR_HIGH)
  const GRAD_Y0 = -0.16
  const GRAD_Y1 = 1.12

  const radii = [0.5, 0.4, 0.31, 0.22]
  const centers = [0.1, 0.38, 0.63, 0.84] // canopy-local tier heights
  const rims = [8, 8, 7, 6]
  for (let i = 0; i < radii.length; i++) {
    const R = radii[i]
    // Center puff: a flattened sphere carrying the tier's mass.
    const tier = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 2), gradientMat())
    tier.scale.y = 0.45
    tier.position.set((rand() - 0.5) * 0.04, centers[i], (rand() - 0.5) * 0.04)
    bakeGradient(tier, low, high, GRAD_Y0, GRAD_Y1)
    canopy.add(tier)

    // Fringed rim: small flattened lobes seated slightly below the tier center
    // so the skirt droops like the reference cedar.
    for (let t = 0; t < rims[i]; t++) {
      const ang = (t / rims[i]) * Math.PI * 2 + rand() * 0.4 + i * 0.35
      const lr = R * 0.34
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(lr, 2), gradientMat())
      lobe.scale.y = 0.5
      lobe.position.set(Math.cos(ang) * R * 0.82, centers[i] - R * 0.12, Math.sin(ang) * R * 0.82)
      bakeGradient(lobe, low, high, GRAD_Y0, GRAD_Y1)
      canopy.add(lobe)
    }
  }

  // Soft pointed spire (a stretched icosphere — NOT a cone/cylinder, the trunk
  // contract test treats tall cylinders inside the canopy as bent trunks).
  const spire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), gradientMat())
  spire.scale.set(0.55, 2.1, 0.55)
  spire.position.y = 1.0
  bakeGradient(spire, low, high, GRAD_Y0, GRAD_Y1)
  canopy.add(spire)

  return parts
}

// A palm: a tall trunk leaning slightly (the whole thing lives in a `lean` group
// rotated about its base) with a few faint trunk rings, a crown of arched
// drooping two-tone fronds (two overlapping blades per frond along a downward
// arc), a rounded crown hub to hide their origins, and a couple of coconuts.
// Returns the single lean group so the base pivot stays at y=0.
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

  // The whole crown (hub + fronds + coconuts) lives in a 'canopy' group pivoted
  // at the crown so the wind hook can toss it. Positions are canopy-LOCAL.
  // Nested inside `lean`, so grounding (which shifts top-level children) moves
  // it together with the trunk.
  const crownY = 1.0
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.position.y = crownY
  canopy.userData.windAmp = 0.7
  lean.add(canopy)

  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), soft(LEAF))
  canopy.add(hub)

  const frondCount = 7 + Math.floor(rand() * 3) // 7..9
  const deep = new THREE.Color(LEAF)
  deep.offsetHSL(0, 0.03, -0.08) // slightly deeper alternating tone
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.Group()
    frond.rotation.y = (i / frondCount) * Math.PI * 2 + rand() * 0.2
    const tone = soft(i % 2 === 0 ? LEAF : deep)

    // Two overlapping blades along a downward arc: the inner splays up-and-out,
    // the outer tapers and droops — the AC arched frond.
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), tone)
    inner.scale.set(0.5, 0.26, 1.5)
    inner.rotation.x = 0.32
    inner.position.set(0, 0.05, 0.28)
    frond.add(inner)

    const outer = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), tone)
    outer.scale.set(0.36, 0.18, 1.2)
    outer.rotation.x = 1.3
    outer.position.set(0, -0.1, 0.55)
    frond.add(outer)

    canopy.add(frond)
  }

  if (rand() < 0.6) {
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2
      const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), soft(COCONUT))
      coconut.position.set(Math.cos(a) * 0.08, -0.09, Math.sin(a) * 0.08)
      canopy.add(coconut)
    }
  }

  return [lean]
}

// A flowering shrub: a rounded fluffy mound of 3–4 overlapping lumpy lobes near
// the ground sharing one bottom-dark → top-light gradient, dotted with a few
// little AC bloom flowers (a colored petal ball with a cream center). No trunk.
function bush(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const low = new THREE.Color(CANOPY_LOW)
  const high = new THREE.Color(CANOPY_HIGH)

  const lobeCount = 3 + Math.floor(rand() * 2) // 3 or 4
  const lobes: { x: number; y: number; z: number; r: number }[] = []
  const meshes: THREE.Mesh[] = []
  let topY = 0.4
  for (let i = 0; i < lobeCount; i++) {
    const r = 0.24 + rand() * 0.1 // 0.24..0.34
    const x = (rand() - 0.5) * 0.28
    const z = (rand() - 0.5) * 0.28
    const y = r - 0.04 + rand() * 0.1
    const geo = new THREE.IcosahedronGeometry(r, 2)
    lumpy(geo, rand, 0.1 * r)
    const lobe = new THREE.Mesh(geo, gradientMat())
    lobe.position.set(x, y, z)
    lobe.rotation.y = rand() * Math.PI
    parts.push(lobe)
    meshes.push(lobe)
    lobes.push({ x, y, z, r })
    topY = Math.max(topY, y + r)
  }
  // One shared gradient across the whole mound (bake after topY is known).
  for (const m of meshes) bakeGradient(m, low, high, 0, topY)

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

// A boulder: 1–2 lumpy rounded stones (icospheres displaced along their
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

  // Moss cap: a very flattened, darker matte lobe on the biggest stone (~half
  // the time). The rand() is always consumed so call order stays fixed.
  if (rand() < 0.5) {
    const c = new THREE.Color(LEAF)
    c.offsetHSL(0, 0, -0.05)
    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(biggest.r * 0.55, 1), soft(c))
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
