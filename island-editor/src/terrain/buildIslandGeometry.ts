// Terraced-heightfield geometry for the v3 grid. Written fresh for the sandbox
// terraforming refactor (architecture idea only from the old pipeline: cache the
// static lattice, refresh vertex data cheaply in place per edit).
//
// This module MAY import three (it is the renderer boundary of the terrain core).
// The material reads three custom attributes written here:
//   aTierFlat — the effective tier at the vertex (float)
//   aWallness — s * (1 - s) * 4: 0 on flat tops → 1 mid-wall
//   aSurface  — the containing cell's surface code (0 auto | 1 path)

import * as THREE from 'three'
import {
  blurTiers,
  type IslandSpec,
  sampleTierField,
  terraceBlend,
  worldToCell,
} from './terrainGrid'

export const SEGMENTS = 128

/** Static per-resolution lattice: world XZ per vertex + triangle indices.
 *  Depends only on worldSize + segments — build once, reuse across edits. */
export interface IslandField {
  segments: number
  /** vertices per side = segments + 1 */
  n: number
  /** length n*n world X per vertex */
  xs: Float32Array
  /** length n*n world Z per vertex */
  zs: Float32Array
  /** standard grid triangulation, length segments² * 6 */
  indices: Uint32Array
}

export function buildIslandField(worldSize: number, segments = SEGMENTS): IslandField {
  const n = segments + 1
  const xs = new Float32Array(n * n)
  const zs = new Float32Array(n * n)
  const half = worldSize / 2
  const step = worldSize / segments
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      xs[j * n + i] = -half + i * step
      zs[j * n + i] = -half + j * step
    }
  }
  const indices = new Uint32Array(segments * segments * 6)
  let k = 0
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices[k++] = a
      indices[k++] = c
      indices[k++] = b
      indices[k++] = b
      indices[k++] = c
      indices[k++] = d
    }
  }
  return { segments, n, xs, zs, indices }
}

/** One pass per edit: write vertex heights (blur + terrace) and the three
 *  material attributes into the geometry's existing buffers, then refresh
 *  normals + bounds. The geometry must have been built by `composeGeometry`
 *  over the same field. */
export function updateGeometry(geo: THREE.BufferGeometry, field: IslandField, spec: IslandSpec): void {
  const { grid, worldSize, tierHeights } = spec
  const blurred = blurTiers(grid)
  const count = field.n * field.n

  const position = geo.getAttribute('position') as THREE.BufferAttribute
  const aTierFlat = geo.getAttribute('aTierFlat') as THREE.BufferAttribute
  const aWallness = geo.getAttribute('aWallness') as THREE.BufferAttribute
  const aSurface = geo.getAttribute('aSurface') as THREE.BufferAttribute

  for (let v = 0; v < count; v++) {
    const x = field.xs[v]
    const z = field.zs[v]
    const t = sampleTierField(grid, blurred, worldSize, x, z)
    const { i, s } = terraceBlend(t)
    const height = tierHeights[i] + (tierHeights[i + 1] - tierHeights[i]) * s

    position.setXYZ(v, x, height, z)
    aTierFlat.setX(v, s > 0.5 ? i + 1 : i)
    aWallness.setX(v, s * (1 - s) * 4)

    // Containing cell's surface code (clamped: edge vertices at +worldSize/2
    // floor to an out-of-bounds cell).
    let { c, r } = worldToCell(worldSize, grid, x, z)
    c = Math.min(Math.max(c, 0), grid.cols - 1)
    r = Math.min(Math.max(r, 0), grid.rows - 1)
    aSurface.setX(v, grid.surface[r * grid.cols + c])
  }

  position.needsUpdate = true
  aTierFlat.needsUpdate = true
  aWallness.needsUpdate = true
  aSurface.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}

/** Build a fresh geometry over the field and fill it from the spec. */
export function composeGeometry(field: IslandField, spec: IslandSpec): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const count = field.n * field.n
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aTierFlat', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setAttribute('aWallness', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setAttribute('aSurface', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setIndex(new THREE.BufferAttribute(field.indices, 1))
  updateGeometry(geo, field, spec)
  return geo
}
