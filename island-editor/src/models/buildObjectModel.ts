import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { mulberry32 } from './rand'

// Stylized low-poly object models built from three.js primitives (the
// bird-builder approach: our own authorship, no asset/licensing pipeline). Kept
// low-poly + flat-shaded so they read under the editor's simple daylight
// (Backdrop.tsx: ambient 0.6 + a directional at [18,20,10]). Deterministic given
// a seed so previews are stable and placement re-derives the same variety on
// reload. No Math.random / Date — the seeded PRNG is the only entropy source.

type Rand = () => number

const TRUNK = 0x8a5a3b
const LEAF_A = 0x5a8f4e
const LEAF_DARK = 0x3f6b3a
const APPLE = 0xd6483b
const ROCK = 0x8a8276
const COCONUT = 0x6b4a2b

/** Flat-shaded lit material — the low-poly / toon-ish look under the scene sun. */
function toon(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 })
}

/** `toon` with a small seeded lightness jitter, so clustered lobes/canopies read
 *  as distinct volumes rather than one flat blob. */
function tinted(base: number, rand: Rand, amount = 0.08): THREE.MeshStandardMaterial {
  const c = new THREE.Color(base)
  c.offsetHSL(0, 0, (rand() - 0.5) * amount)
  return toon(c)
}

// A round apple tree: a stubby trunk under 2–3 overlapping icosahedron canopies
// with a scatter of small apple spheres on the canopy surface.
function fruitTree(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.55, 6), toon(TRUNK))
  trunk.position.y = 0.275
  parts.push(trunk)

  const canopyCount = 2 + Math.floor(rand() * 2) // 2 or 3
  for (let i = 0; i < canopyCount; i++) {
    const r = 0.42 - i * 0.06 // 0.42, 0.36, 0.30
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), tinted(LEAF_A, rand))
    canopy.position.set((rand() - 0.5) * 0.14, 0.72 + i * 0.16, (rand() - 0.5) * 0.14)
    canopy.rotation.y = rand() * Math.PI
    parts.push(canopy)
  }

  const appleCount = 3 + Math.floor(rand() * 3) // 3..5
  for (let i = 0; i < appleCount; i++) {
    const theta = rand() * Math.PI * 2
    const y = rand() * 2 - 1
    const rxy = Math.sqrt(Math.max(0, 1 - y * y))
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), toon(APPLE))
    apple.position.set(rxy * Math.cos(theta) * 0.4, 0.82 + y * 0.4, rxy * Math.sin(theta) * 0.4)
    parts.push(apple)
  }

  return parts
}

// A conifer: a thin trunk under three stacked cones, each jittered a touch so the
// silhouette is not a perfect stack.
function pine(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 6), toon(TRUNK))
  trunk.position.y = 0.2
  parts.push(trunk)

  const radii = [0.5, 0.38, 0.26]
  const centers = [0.5, 0.8, 1.05]
  const heights = [0.55, 0.5, 0.45]
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radii[i], heights[i], 7), tinted(LEAF_DARK, rand, 0.06))
    cone.position.set((rand() - 0.5) * 0.06, centers[i], (rand() - 0.5) * 0.06)
    cone.rotation.y = rand() * Math.PI
    parts.push(cone)
  }

  return parts
}

// A palm: a tall trunk leaning slightly (the whole thing lives in a `lean` group
// rotated about its base) with a crown of drooping bladed fronds and a couple of
// coconuts. Returns the single lean group so the base pivot stays at y=0.
function palm(rand: Rand): THREE.Object3D[] {
  const lean = new THREE.Group()
  lean.rotation.z = (0.05 + rand() * 0.07) * (rand() < 0.5 ? 1 : -1) // ±0.05..0.12 rad

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 6), toon(TRUNK))
  trunk.position.y = 0.5
  lean.add(trunk)

  const crownY = 1.0
  const frondCount = 6 + Math.floor(rand() * 3) // 6..8
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.Group()
    frond.position.y = crownY
    frond.rotation.y = (i / frondCount) * Math.PI * 2 + rand() * 0.2

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 4), toon(LEAF_A))
    blade.scale.set(1.4, 1, 0.35) // flatten the cone into a leaf blade
    blade.rotation.x = Math.PI / 2 + 0.5 // point outward, then droop down
    blade.position.set(0, -0.02, 0.28) // splay outward from the crown center
    frond.add(blade)
    lean.add(frond)
  }

  if (rand() < 0.6) {
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2
      const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), toon(COCONUT))
      coconut.position.set(Math.cos(a) * 0.08, crownY - 0.08, Math.sin(a) * 0.08)
      lean.add(coconut)
    }
  }

  return [lean]
}

// A leafy shrub: 3–4 overlapping low icosahedron lobes clustered near the ground,
// each tinted + rotated a little for a rough, natural read. No trunk.
function bush(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const lobeCount = 3 + Math.floor(rand() * 2) // 3 or 4
  for (let i = 0; i < lobeCount; i++) {
    const r = 0.22 + rand() * 0.1 // 0.22..0.32
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), tinted(LEAF_A, rand, 0.1))
    lobe.position.set((rand() - 0.5) * 0.28, r - 0.02 + rand() * 0.12, (rand() - 0.5) * 0.28)
    lobe.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    parts.push(lobe)
  }

  return parts
}

// A boulder: 1–2 icosahedra scaled non-uniformly and randomly rotated. Final
// grounding (below) drops it so it rests on the terrain regardless of rotation.
function rock(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  const count = rand() < 0.4 ? 2 : 1
  for (let i = 0; i < count; i++) {
    const r = 0.3 + rand() * 0.12 // 0.3..0.42
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), tinted(ROCK, rand, 0.06))
    stone.scale.set(1 + rand() * 0.2, 0.6 + rand() * 0.25, 1 + rand() * 0.2)
    stone.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
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

/** Stylized low-poly model for `kind`, centered on X/Z with its base at y=0 and a
 *  ~1-unit footprint (callers scale/position uniformly). Deterministic given
 *  `seed`. The contract Plans B (placement) + C (palette) consume — do not change
 *  the signature without updating them. */
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
