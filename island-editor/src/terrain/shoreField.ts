// Grid-derived signed shore-distance field. Drives all water/foam effects in the
// sea shader and replaces the app's analytic `silhouette(theta)` radial hack — it
// works for ANY drawn coastline, including carved interior rivers/ponds. Pure,
// unit-testable, recomputed per grid edit. NO three/r3f imports.

import { blurTiers, sampleTierField, type TerrainGrid } from './terrainGrid'

export interface ShoreField {
  /** Lattice resolution (res × res points over the square world). */
  res: number
  /** Signed distance in world units, row-major length res*res.
   *  Positive on water, negative on land. */
  data: Float32Array
}

/**
 * Signed distance (world units) to the land↔water boundary, sampled on a lattice
 * at `scale ×` the grid resolution. Land where `sampleTierField ≥ 0.5`. Distances
 * come from a multi-source 8-neighbor BFS over the lattice from all boundary
 * points; approximate (≈ steps × latticeStep) — good enough for foam bands.
 * Degenerate all-land / all-water fills a large constant of the right sign.
 */
export function shoreDistanceField(grid: TerrainGrid, worldSize: number, scale = 2): ShoreField {
  const res = grid.cols * scale
  const n = res * res
  const latticeStep = worldSize / res
  const half = worldSize / 2

  const blurred = blurTiers(grid)
  const isLand = new Uint8Array(n)
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * latticeStep
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * latticeStep
      isLand[j * res + i] = sampleTierField(grid, blurred, worldSize, x, z) >= 0.5 ? 1 : 0
    }
  }

  const data = new Float32Array(n)
  const steps = new Int32Array(n).fill(-1)
  const queue: number[] = []

  // Sources: any point with an 8-neighbor of the opposite type (a shore point).
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const idx = j * res + i
      const land = isLand[idx]
      let boundary = false
      for (let dj = -1; dj <= 1 && !boundary; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || ni >= res || nj < 0 || nj >= res) continue
          if (isLand[nj * res + ni] !== land) {
            boundary = true
            break
          }
        }
      }
      if (boundary) {
        steps[idx] = 0
        queue.push(idx)
      }
    }
  }

  if (queue.length === 0) {
    // All land or all water: no boundary. Fill a large constant of the right sign.
    const big = worldSize
    data.fill(isLand[0] ? -big : big)
    return { res, data }
  }

  // Multi-source BFS (8-neighbor). steps × latticeStep ≈ distance to the boundary.
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const i = idx % res
    const j = (idx - i) / res
    const nextStep = steps[idx] + 1
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || ni >= res || nj < 0 || nj >= res) continue
        const nIdx = nj * res + ni
        if (steps[nIdx] === -1) {
          steps[nIdx] = nextStep
          queue.push(nIdx)
        }
      }
    }
  }

  // Signed distance: the +0.5 offset keeps shore points nonzero so the sign flips
  // strictly across the boundary (adjacent land/water points differ in sign).
  for (let idx = 0; idx < n; idx++) {
    const magnitude = (steps[idx] + 0.5) * latticeStep
    data[idx] = isLand[idx] ? -magnitude : magnitude
  }

  return { res, data }
}
