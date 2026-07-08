// Stitch a set of shells/lofts into ONE welded, manifold, indexed
// BufferGeometry (plan 013). The MeshBuilder (surface.ts) bridges opening
// loops ring-to-ring so the merged buffer is a closed 2-manifold by
// construction; this module turns a BuiltMesh into a THREE geometry and
// provides the manifold audit the kit/body tests gate on.

import * as THREE from 'three'
import { type BuiltMesh } from './surface'

export { MeshBuilder } from './surface'

export interface SkinPacking {
  skinIndex: Uint16Array // n×4
  skinWeight: Float32Array // n×4
}

/**
 * Pack the per-bone weight tracks into ≤4-influence skinIndex/skinWeight
 * attributes, normalized. `boneIndexOf` maps a bone name to its skeleton
 * index. The analytic recipe never exceeds 3 influences per vertex.
 */
export function packSkinning(built: BuiltMesh, boneIndexOf: (bone: string) => number): SkinPacking {
  const n = built.vertexCount
  const skinIndex = new Uint16Array(n * 4)
  const skinWeight = new Float32Array(n * 4)
  const entries = [...built.weights.entries()].map(([bone, track]) => ({ index: boneIndexOf(bone), track }))
  for (let i = 0; i < n; i++) {
    const influences = entries
      .map((e) => ({ index: e.index, w: e.track[i] ?? 0 }))
      .filter((e) => e.w > 1e-6 && e.index >= 0)
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
    let sum = 0
    for (const inf of influences) sum += inf.w
    if (sum <= 1e-9) {
      // Fallback: pin to the first influence (or bone 0) so the vertex is
      // rigidly attached rather than collapsing to the origin.
      skinIndex[i * 4] = influences[0]?.index ?? 0
      skinWeight[i * 4] = 1
      continue
    }
    for (let s = 0; s < influences.length; s++) {
      skinIndex[i * 4 + s] = influences[s].index
      skinWeight[i * 4 + s] = influences[s].w / sum
    }
  }
  return { skinIndex, skinWeight }
}

/** BufferGeometry from a BuiltMesh: position, uv, index, computed normals. */
export function toGeometry(built: BuiltMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(built.uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

export interface ManifoldReport {
  boundaryEdges: number
  overSharedEdges: number
  components: number
  triangleCount: number
}

/**
 * Audit the mesh topology (keyed by vertex INDEX — the kit welds by shared
 * bridge loops, so no position-merge is needed). A closed 2-manifold has every
 * edge shared by exactly 2 triangles and a single connected component over the
 * referenced vertices.
 */
export function manifoldReport(indices: ArrayLike<number>): ManifoldReport {
  const edge = new Map<string, number>()
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as number
    let c = x
    while (parent.get(c) !== c) {
      const nx = parent.get(c) as number
      parent.set(c, r)
      c = nx
    }
    return r
  }
  const union = (a: number, b: number) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const key = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  let triangleCount = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    triangleCount++
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      edge.set(key(i, j), (edge.get(key(i, j)) ?? 0) + 1)
      union(i, j)
    }
  }
  let boundaryEdges = 0
  let overSharedEdges = 0
  for (const count of edge.values()) {
    if (count === 1) boundaryEdges++
    else if (count > 2) overSharedEdges++
  }
  const roots = new Set<number>()
  for (const k of parent.keys()) roots.add(find(k))
  return { boundaryEdges, overSharedEdges, components: roots.size, triangleCount }
}
