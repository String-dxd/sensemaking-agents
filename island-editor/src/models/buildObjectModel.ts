import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { hashString, mulberry32 } from './rand'
import { modelTexture } from './textures'
import { objectGradientMap } from './toonMaterial'

// Stylized PROCEDURAL models built from three.js primitives — now only the bush.
// `tree` and `rock` ship as authored GLB assets (public/models/, built by
// scripts/optimize-meshy-glb.mjs) and load through useObjectModel, which routes
// non-GLB kinds back here. Art direction matches across lanes: matte masses
// with baked shading, TOON-LIT (plan 019) — the GLBs get MeshToonMaterial at
// load time (src/models/toonMaterial.ts), the bush builds with MeshToonMaterial
// directly; baked vertex colors multiply the shared toon ramp, so the whole
// scene shades as one system under the existing sun + hemisphere lights.
// Deterministic given a seed so previews are stable and placement re-derives the
// same variety on reload. No Math.random / Date — the seeded PRNG is the only
// entropy source.

/** The kinds this builder still owns (everything else ships as a GLB asset). */
export type ProceduralKind = Extract<ObjectKind, 'bush'>

type Rand = () => number

/** Bush fallback tint, held until the leaf map's pixels actually land. */
const LEAF = 0x8fd062

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

/** Seeded organic lumpiness. Displaces each vertex of an icosphere along its
 *  normal by a small amount, then re-smooths the normals so the surface reads as
 *  a soft rounded bubble, not crumpled low-poly facets.
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

/** Bake the bush's layered soft lighting into a lobe's vertex colors:
 *  hue-neutral, multiplying the leaf map. Three layers — a global bottom-dark
 *  → top-lit gradient across the whole mound, a per-lobe crevice term that
 *  shades each clump's underside (so the clumps read as separate leafy
 *  masses), and a generous skyward lighten that lays soft top light over the
 *  texture. Assumes the mesh's rotation preserves Y. */
function bakeBushShade(mesh: THREE.Mesh, y0: number, y1: number, creviceDepth: number): void {
  const geo = mesh.geometry
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  geo.computeBoundingBox()
  const bb = geo.boundingBox as THREE.Box3
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const yWorld = mesh.position.y + pos.getY(i) * mesh.scale.y
    const lin = Math.min(1, Math.max(0, (yWorld - y0) / (y1 - y0)))
    const base = 0.66 + 0.34 * lin ** 1.4
    const lobeT = (pos.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y)
    const crevice = 1 - creviceDepth * (1 - lobeT) ** 1.4
    const sky = 0.12 * Math.max(0, nrm.getY(i)) // the soft light layered on top
    const v = Math.min(1.08, base * crevice + sky)
    colors[i * 3] = v
    colors[i * 3 + 1] = v
    colors[i * 3 + 2] = v
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

// A leafy shrub (no flowers): ONE dome — the "stack" lives in the LEAVES, not in
// piled blobs: the leaf map carries the layered-leaf read, a strong scalloped
// displacement makes the silhouette bulge like leaf clumps, and the layered bake
// (gradient × crevice + soft sky light) shades it. Wrapped in a named 'canopy'
// group with a gentle windAmp so the wind spring rustles it like the trees.
function bush(rand: Rand): THREE.Object3D[] {
  // The bush-leaves map is the surface color; vertex colors carry only the
  // hue-neutral layered lighting that multiplies it.
  // MeshToonMaterial: the baked vertex-color shading now MULTIPLIES the toon
  // lighting — same system as the GLB objects (plan 019).
  const mat = new THREE.MeshToonMaterial({
    color: LEAF,
    vertexColors: true,
    gradientMap: objectGradientMap(),
  })
  mat.name = 'bush-foliage'
  // Attach the map on LOAD, not eagerly: a material pointing at a texture whose
  // pixels haven't arrived renders BLACK, so the LEAF tint holds the fallback
  // until they do, then white lets the map through as painted. (No-op in a
  // DOM-less env — vitest/node never reach TextureLoader.)
  if (typeof document !== 'undefined') {
    modelTexture('bush-leaves', (tex) => {
      mat.map = tex
      mat.color.set(0xffffff)
      mat.needsUpdate = true
    })
  }

  // Base-pivoted canopy group: the wind spring finds it by name and rocks the
  // whole mound gently (windAmp well under the trees' — shrubs rustle, not sway).
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  canopy.userData.windAmp = 0.25

  const R = 0.17 + rand() * 0.07
  const geo = new THREE.IcosahedronGeometry(R, 2)
  lumpy(geo, rand, 0.24 * R) // strong scallop: the silhouette bulges like leaf clumps
  const dome = new THREE.Mesh(geo, mat)
  const squash = 0.66 + rand() * 0.18
  dome.scale.set(1 + (rand() - 0.5) * 0.2, squash, 1 + (rand() - 0.5) * 0.2)
  dome.position.y = R * 0.55
  dome.rotation.y = rand() * Math.PI
  bakeBushShade(dome, 0, R * 0.55 + R * squash, 0.3)
  canopy.add(dome)

  return [canopy]
}

const BUILDERS: Record<ProceduralKind, (rand: Rand) => THREE.Object3D[]> = {
  bush,
}

/** Stylized model for `kind`, centered on X/Z with its base at y=0 and a ~1-unit
 *  footprint (callers scale/position uniformly). Deterministic given `seed`. The
 *  GLB assets are authored to the same contract — see scripts/optimize-meshy-glb.mjs. */
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
