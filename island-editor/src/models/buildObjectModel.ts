import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { mulberry32 } from './rand'

// Stylized object models built from three.js primitives (the bird-builder
// approach: our own authorship, no asset/licensing pipeline). Art direction:
// Animal Crossing / Pokopia — chunky, rounded, soft. Foliage is smooth-shaded
// icospheres clustered into fluffy cloud-like masses (not angular facets);
// trunks and rocks keep gentle low-poly facets so they still sit inside the
// editor's flat-shaded terrain. Lit for the scene sun (Backdrop.tsx: ambient
// 0.6 + a directional 1.15 at [18,20,10]). Deterministic given a seed so
// previews are stable and placement re-derives the same variety on reload.
// No Math.random / Date — the seeded PRNG is the only entropy source.

type Rand = () => number

const TRUNK = 0x9c6b43 // warm, slightly saturated bark
const LEAF = 0x77b84e // bright AC grass-green canopy
const LEAF_DEEP = 0x4f9145 // richer green for the conifer tiers
const APPLE = 0xe4564a // cheerful red fruit
const ROCK = 0x9c968b // warm light stone
const COCONUT = 0x7a5230
// Signature AC bush bloom: soft pink, cream, buttery yellow.
const FLOWERS = [0xf7a8c8, 0xfff2e6, 0xffd766]

/** Gently faceted lit material — trunks, rocks, anything that should keep a
 *  low-poly edge to sit with the flat-shaded terrain. */
function flat(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, metalness: 0 })
}

/** Smooth (non-faceted) lit material — the soft, rounded AC foliage look. */
function soft(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.95, metalness: 0 })
}

/** `soft` with a small seeded lightness jitter so clustered lobes read as
 *  distinct volumes within one fluffy mass rather than a single flat blob. */
function tinted(base: number, rand: Rand, amount = 0.07): THREE.MeshStandardMaterial {
  const c = new THREE.Color(base)
  c.offsetHSL(0, 0, (rand() - 0.5) * amount)
  return soft(c)
}

/** A rounded foliage blob: a detail-1 icosphere (rounded silhouette, ~80 tris)
 *  smooth-shaded so it reads as a soft puff, not an angular gem. */
function blob(r: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat)
}

// An AC apple tree: a stubby chunky trunk under one big fluffy cloud canopy —
// a central puff plus a few smaller bumps so the mass is round but lumpy — with
// a scatter of bright apples nestled into the leaves.
function fruitTree(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.46, 7), flat(TRUNK))
  trunk.position.y = 0.23
  parts.push(trunk)

  const coreY = 0.95
  // Central puff, then bumps clustered around/above it for a cloud silhouette.
  const core = blob(0.5, tinted(LEAF, rand))
  core.position.y = coreY
  core.rotation.y = rand() * Math.PI
  parts.push(core)

  const bumpCount = 3 + Math.floor(rand() * 2) // 3 or 4
  for (let i = 0; i < bumpCount; i++) {
    const a = (i / bumpCount) * Math.PI * 2 + rand() * 0.5
    const bump = blob(0.28 + rand() * 0.08, tinted(LEAF, rand))
    bump.position.set(Math.cos(a) * 0.32, coreY + 0.12 + rand() * 0.18, Math.sin(a) * 0.32)
    bump.rotation.y = rand() * Math.PI
    parts.push(bump)
  }

  const appleCount = 3 + Math.floor(rand() * 3) // 3..5
  for (let i = 0; i < appleCount; i++) {
    const theta = rand() * Math.PI * 2
    const y = rand() * 2 - 1
    const rxy = Math.sqrt(Math.max(0, 1 - y * y))
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), soft(APPLE))
    apple.position.set(rxy * Math.cos(theta) * 0.46, coreY + y * 0.42, rxy * Math.sin(theta) * 0.46)
    parts.push(apple)
  }

  return parts
}

// A soft conifer: a short trunk under 4 rounded tiers (flattened puffs of
// decreasing radius) stacked into a cushiony christmas-tree, capped by a little
// ball — the fluffy layered pine of AC/Pokopia rather than sharp cones.
function pine(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.34, 7), flat(TRUNK))
  trunk.position.y = 0.17
  parts.push(trunk)

  const radii = [0.52, 0.42, 0.32, 0.22]
  const centers = [0.5, 0.78, 1.03, 1.24]
  for (let i = 0; i < radii.length; i++) {
    const tier = blob(radii[i], tinted(LEAF_DEEP, rand, 0.05))
    tier.scale.y = 0.66 // flatten each puff into a soft tier
    tier.position.set((rand() - 0.5) * 0.05, centers[i], (rand() - 0.5) * 0.05)
    tier.rotation.y = rand() * Math.PI
    parts.push(tier)
  }

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), soft(LEAF_DEEP))
  tip.position.y = 1.4
  parts.push(tip)

  return parts
}

// A palm: a tall trunk leaning slightly (the whole thing lives in a `lean` group
// rotated about its base) with a crown of broad drooping fronds, a rounded crown
// hub to hide their origins, and a couple of coconuts. Returns the single lean
// group so the base pivot stays at y=0.
function palm(rand: Rand): THREE.Object3D[] {
  const lean = new THREE.Group()
  lean.rotation.z = (0.05 + rand() * 0.07) * (rand() < 0.5 ? 1 : -1) // ±0.05..0.12 rad

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.0, 7), flat(TRUNK))
  trunk.position.y = 0.5
  lean.add(trunk)

  const crownY = 1.0
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), soft(LEAF))
  hub.position.y = crownY
  lean.add(hub)

  const frondCount = 7 + Math.floor(rand() * 3) // 7..9
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.Group()
    frond.position.y = crownY
    frond.rotation.y = (i / frondCount) * Math.PI * 2 + rand() * 0.2

    const blade = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), soft(LEAF))
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

// A flowering shrub: a rounded fluffy mound of 3–4 overlapping smooth lobes near
// the ground, dotted with a few little AC bloom flowers. No trunk.
function bush(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const lobeCount = 3 + Math.floor(rand() * 2) // 3 or 4
  const lobes: { x: number; y: number; z: number; r: number }[] = []
  for (let i = 0; i < lobeCount; i++) {
    const r = 0.24 + rand() * 0.1 // 0.24..0.34
    const x = (rand() - 0.5) * 0.28
    const z = (rand() - 0.5) * 0.28
    const y = r - 0.04 + rand() * 0.1
    const lobe = blob(r, tinted(LEAF, rand, 0.09))
    lobe.position.set(x, y, z)
    lobe.rotation.y = rand() * Math.PI
    parts.push(lobe)
    lobes.push({ x, y, z, r })
  }

  const flowerColor = FLOWERS[Math.floor(rand() * FLOWERS.length)]
  const flowerCount = 3 + Math.floor(rand() * 3) // 3..5
  for (let i = 0; i < flowerCount; i++) {
    const base = lobes[Math.floor(rand() * lobes.length)]
    const theta = rand() * Math.PI * 2
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), soft(flowerColor))
    // Perch near the top-outer surface of a chosen lobe.
    flower.position.set(
      base.x + Math.cos(theta) * base.r * 0.7,
      base.y + base.r * 0.6,
      base.z + Math.sin(theta) * base.r * 0.7,
    )
    parts.push(flower)
  }

  return parts
}

// A boulder: 1–2 smooth rounded stones (detail-1 icospheres, gentle non-uniform
// scale) — lumpy but rounded, not jagged. Final grounding (below) drops it so it
// rests on the terrain regardless of rotation.
function rock(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const count = rand() < 0.4 ? 2 : 1
  for (let i = 0; i < count; i++) {
    const r = 0.3 + rand() * 0.12 // 0.3..0.42
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), tinted(ROCK, rand, 0.05))
    stone.scale.set(1 + rand() * 0.18, 0.68 + rand() * 0.2, 1 + rand() * 0.18)
    stone.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4)
    stone.position.set((rand() - 0.5) * 0.25, r * 0.5, (rand() - 0.5) * 0.25)
    parts.push(stone)
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
