// Ported from island-editor/src/terrain/buildIslandGeometry.ts — behavior kept
// in sync via shared test vectors (see State/islandSpecCore/terrainGrid.ts).
//
// Terraced-heightfield geometry for the spec grid. This module MAY import
// three (it is the renderer boundary of the terrain core). The ground material
// reads three custom attributes written here:
//   aTierFlat — the effective tier at the vertex (float)
//   aWallness — s * (1 - s) * 4: 0 on flat tops → 1 mid-wall
//   aSurface  — the containing cell's surface code (0 auto | 1 grass paint)
//
// Engine difference from the editor: the terrain never changes at runtime, so
// geometry is built once per boot (KTD-10) — the per-edit refresh path exists
// only because `composeGeometry` uses it to fill the fresh buffers.

import * as THREE from 'three'
import {
  blurTiers,
  type IslandSpec,
  sampleTierField,
  terraceBlend,
  worldToCell,
} from '../State/islandSpecCore/terrainGrid.ts'

// 8 segments per grid cell (512 / GRID_COLS 64). Kept an EVEN multiple of the
// grid so cell centers land exactly on lattice vertices. WHY 4 and not 2: the
// terrace wall's rounded lip/base (terraceBlend's smoothstep, ~0.35 cell ≈
// 0.13 world wide) is finer than a 2-seg/cell step — at 128 the rounding fell
// *between* vertices and corners collapsed to a single hard vertex. At 256 the
// wall spans ~1.4 segments, so the intended lip/base/corner rounding actually
// tessellates.
//
// WHY 8 in the engine (512, not 256): the app camera zooms close to the
// character; at 256 the ~0.094-unit vertex step spans ~25–30 screen px,
// polygonizing the smooth tier-field contours into sawtooth terrace lips and
// stair-stepped shorelines (maintainer screenshot, plan 030). At 512 the
// smooth-bilinear corner rounding (~0.1–0.19 world units) spans 2–4 vertices
// and reads as a curve. ~263k vertices, built ONCE per boot (KTD-10) — this
// is why the engine can afford it while the editor (per-edit rebuilds)
// deliberately stays at 256.
export const SEGMENTS = 512

/** Static per-resolution lattice: world XZ per vertex + triangle indices. */
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

/** Write vertex heights (blur + terrace) and the three material attributes
 *  into the geometry's existing buffers, then refresh normals + bounds. */
export function updateGeometry(
  geo: THREE.BufferGeometry,
  field: IslandField,
  spec: IslandSpec,
  blurred?: Float32Array,
): void {
  const { grid, worldSize, tierHeights } = spec
  const blur = blurred ?? blurTiers(grid)
  const count = field.n * field.n

  const position = geo.getAttribute('position') as THREE.BufferAttribute
  const aTierFlat = geo.getAttribute('aTierFlat') as THREE.BufferAttribute
  const aWallness = geo.getAttribute('aWallness') as THREE.BufferAttribute
  const aSurface = geo.getAttribute('aSurface') as THREE.BufferAttribute

  for (let v = 0; v < count; v++) {
    const x = field.xs[v] ?? 0
    const z = field.zs[v] ?? 0
    const t = sampleTierField(grid, blur, worldSize, x, z)
    const { i, s } = terraceBlend(t)
    const lo = tierHeights[i] ?? 0
    const hi = tierHeights[i + 1] ?? lo
    const height = lo + (hi - lo) * s

    position.setXYZ(v, x, height, z)
    aTierFlat.setX(v, s > 0.5 ? i + 1 : i)
    aWallness.setX(v, s * (1 - s) * 4)

    // Containing cell's surface code (clamped: edge vertices at +worldSize/2
    // floor to an out-of-bounds cell).
    const cell = worldToCell(worldSize, grid, x, z)
    const c = Math.min(Math.max(cell.c, 0), grid.cols - 1)
    const r = Math.min(Math.max(cell.r, 0), grid.rows - 1)
    aSurface.setX(v, grid.surface[r * grid.cols + c] ?? 0)
  }

  position.needsUpdate = true
  aTierFlat.needsUpdate = true
  aWallness.needsUpdate = true
  aSurface.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}

/** Build a fresh geometry over the field and fill it from the spec. */
export function composeGeometry(
  field: IslandField,
  spec: IslandSpec,
  blurred?: Float32Array,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const count = field.n * field.n
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aTierFlat', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setAttribute('aWallness', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setAttribute('aSurface', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setIndex(new THREE.BufferAttribute(field.indices, 1))
  updateGeometry(geo, field, spec, blurred)
  return geo
}
