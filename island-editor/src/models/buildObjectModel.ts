import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { hashString, mulberry32 } from './rand'
import { modelTexture } from './textures'

// Stylized PROCEDURAL models built from three.js primitives — now only the
// small ground clutter (bush, rock). The tree kinds moved to the GLB lane:
// authored by scripts/build-tree-glbs.mjs into public/models/*.glb and loaded
// through useObjectModel (which routes non-GLB kinds back here). Art direction
// still AC-cozy: matte masses with baked vertex-color gradients. Lit for the
// scene sun (Backdrop.tsx: ambient 0.6 + a directional 1.15 at [18,20,10]).
// Deterministic given a seed so previews are stable and placement re-derives
// the same variety on reload. No Math.random / Date — the seeded PRNG is the
// only entropy source.

/** The kinds this builder still owns (everything else ships as a GLB asset). */
export type ProceduralKind = Extract<ObjectKind, 'bush' | 'rock'>

type Rand = () => number

// Base tints.
const LEAF = 0x8fd062 // bush fallback tint until the bush-leaves map loads
const ROCK = 0xf7f4ee // near-white tint — the painted stone map carries the color

/** Guarded texture lookup: `null` in a DOM-less env (vitest/node) so the builder
 *  runs headless without touching TextureLoader; a shared, cached THREE.Texture
 *  in the browser. Never dispose or mutate the returned texture — it is shared
 *  across every model instance. */
function tex(name: Parameters<typeof modelTexture>[0]): THREE.Texture | null {
  return typeof document === 'undefined' ? null : modelTexture(name)
}

/** Stone material — the soft painted stone map (pale warm white with subtle
 *  mottling) under a near-white tint, with a small seeded lightness jitter so
 *  placed stones read as distinct volumes. */
function stone(rand: Rand): THREE.MeshStandardMaterial {
  const c = new THREE.Color(ROCK)
  c.offsetHSL(0, 0, (rand() - 0.5) * 0.06)
  return new THREE.MeshStandardMaterial({
    color: c,
    map: tex('rock-painted') ?? undefined,
    flatShading: false,
    roughness: 0.95,
    metalness: 0,
  })
}

/** Smooth (non-faceted) untextured lit material — clean accents (apples,
 *  flowers, coconuts, palm fronds) that read better without a map. */
function soft(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.95, metalness: 0 })
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

// A leafy shrub: one small squat mound (no flowers) ringed by a few grass
// tufts. Shape parameters are all seeded, so no two bushes share a silhouette;
// deliberately small next to the ~1.7-unit trees.
function bush(rand: Rand): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []

  // The dome: the bush-leaves map (full-color, the sand-pipeline approach) is
  // the surface color once loaded; until then the material keeps a LEAF-green
  // fallback tint. Vertex colors carry hue-neutral shading (dark base → lit
  // top) that multiplies the map.
  const R = 0.19 + rand() * 0.09 // 0.19..0.28
  const geo = new THREE.IcosahedronGeometry(R, 2)
  lumpy(geo, rand, 0.13 * R)
  const mat = new THREE.MeshStandardMaterial({ color: LEAF, vertexColors: true, roughness: 1, metalness: 0 })
  mat.name = 'bush-foliage'
  if (typeof document !== 'undefined') {
    modelTexture('bush-leaves', (t) => {
      mat.map = t
      mat.color.set(0xffffff)
      mat.needsUpdate = true
    })
  }
  const squash = 0.62 + rand() * 0.22 // squat pancake → rounder mound
  const DOME_Y = R * 0.52
  const dome = new THREE.Mesh(geo, mat)
  dome.scale.set(1 + (rand() - 0.5) * 0.24, squash, 1 + (rand() - 0.5) * 0.24)
  dome.position.y = DOME_Y
  dome.rotation.y = rand() * Math.PI
  bakeGradient(dome, new THREE.Color(0.7, 0.7, 0.7), new THREE.Color(1, 1, 1), 0, DOME_Y + R * squash)
  parts.push(dome)

  // Grass tufts skirting the base: little pointed blades leaning outward, in a
  // slightly lighter green than the dome so they read against it.
  const tuftCount = 5 + Math.floor(rand() * 4) // 5..8
  for (let i = 0; i < tuftCount; i++) {
    const az = (i / tuftCount) * Math.PI * 2 + rand() * 0.9
    const dist = R * (1.0 + rand() * 0.35)
    const h = 0.05 + rand() * 0.05
    const c = new THREE.Color(0x8cc75f)
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.08)
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.02 + rand() * 0.012, h, 5), soft(c))
    tuft.position.set(Math.cos(az) * dist, h * 0.45, Math.sin(az) * dist)
    // Lean away from the bush so the skirt splays naturally.
    tuft.rotation.set(Math.sin(az) * (0.2 + rand() * 0.25), 0, -Math.cos(az) * (0.2 + rand() * 0.25))
    parts.push(tuft)
  }

  return parts
}

// An AC boulder (reference: pale flat-topped stones with soft-rounded corners):
// ONE stone per placement, built as a "cube-sphere" — a segmented box whose
// vertices are pulled partway toward the circumscribed sphere, so it keeps a
// boxy trapezoidal profile (flat top, bulging middle) with softly rounded
// corners, then radially jittered and gently tapered toward the top. Flat
// facets via face normals on the non-indexed geometry. Size is seeded (small
// clutter, not landmarks); placement adds its own scale/yaw jitter on top.
function rock(rand: Rand): THREE.Object3D[] {
  const r = 0.07 + rand() * 0.08 // 0.07..0.15 — small clutter next to ~1.7-unit trees

  // Every shape parameter is seeded so no two stones share a silhouette:
  // roundness (boxy slab → rounded pebble), top taper, jitter strength, and
  // proportions all vary per placement.
  const roundness = 0.5 + rand() * 0.25 // how far corners pull toward the sphere
  const taperAmt = 0.05 + rand() * 0.25 // top pinch: near-prism → clearly tapered
  const jitterAmt = 0.08 + rand() * 0.08 // gentle: quads stay near-planar → BIG facets

  // BoxGeometry is indexed — go non-indexed so computeVertexNormals bakes flat
  // per-face facets. All displacement is keyed on position (radial direction /
  // shared hash), so duplicated corner vertices move together: watertight.
  const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).toNonIndexed()
  const salt = Math.floor(rand() * 0xffffffff)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const sph = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    sph.copy(v).normalize().multiplyScalar(0.72)
    v.lerp(sph, roundness)
    const h = hashString(`${salt}:${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`)
    v.multiplyScalar(1 + (h / 0xffffffff - 0.5) * jitterAmt)
    const taper = 1 - taperAmt * (v.y / 0.62 + 1) * 0.5 // narrower toward the top
    pos.setXYZ(i, v.x * taper * r * 2, v.y * r * 2, v.z * taper * r * 2)
  }
  pos.needsUpdate = true

  // Soft-edged facets: blend flat face normals halfway toward the smoothed
  // ones, so the big polygons stay readable but their shared edges shade as
  // gentle bevels instead of hard creases.
  geo.computeVertexNormals() // non-indexed → flat face normals
  const flat = Array.from((geo.attributes.normal as THREE.BufferAttribute).array)
  smoothNormals(geo)
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < nrm.count; i++) {
    v.set(
      flat[i * 3] * 0.45 + nrm.getX(i) * 0.55,
      flat[i * 3 + 1] * 0.45 + nrm.getY(i) * 0.55,
      flat[i * 3 + 2] * 0.45 + nrm.getZ(i) * 0.55,
    ).normalize()
    nrm.setXYZ(i, v.x, v.y, v.z)
  }
  nrm.needsUpdate = true

  const stone_ = new THREE.Mesh(geo, stone(rand))
  // Proportions run from squat-wide slabs to upright boulders, with an
  // elongation axis and a small settle tilt so stones sit like they fell.
  stone_.scale.set(0.9 + rand() * 0.5, 0.65 + rand() * 0.5, 0.9 + rand() * 0.35)
  stone_.rotation.set((rand() - 0.5) * 0.16, rand() * Math.PI, (rand() - 0.5) * 0.16)
  stone_.position.y = r * 0.8
  return [stone_]
}

const BUILDERS: Record<ProceduralKind, (rand: Rand) => THREE.Object3D[]> = {
  bush,
  rock,
}

/** Stylized model for `kind`, centered on X/Z with its base at y=0 and a ~1-unit
 *  footprint (callers scale/position uniformly). Deterministic given `seed`. The
 *  contract Plans B (placement) + C (palette) consume — do not change the
 *  signature without updating them. */
export function buildObjectModel(kind: ProceduralKind, seed = 1): THREE.Group {
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
