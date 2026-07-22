// Ported from island-editor/src/terrain/shoreField.ts — behavior kept in sync
// via shared test vectors (see terrainGrid.ts provenance note).
//
// Grid-derived signed shore-distance field. Drives all water/foam effects in
// the sea shader and replaces the engine's analytic `silhouette(theta)` radial
// path — it works for ANY drawn shore outline, including carved interior
// rivers/ponds. Pure, unit-testable, computed once per spec. NO three imports.

import { blurTiers, sampleTierField, type TerrainGrid } from './terrainGrid.ts'

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
    const idx = queue[head++] as number
    const i = idx % res
    const j = (idx - i) / res
    const nextStep = (steps[idx] ?? 0) + 1
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
    const magnitude = ((steps[idx] ?? 0) + 0.5) * latticeStep
    data[idx] = isLand[idx] ? -magnitude : magnitude
  }

  // Round the isolines: the BFS runs on a binarized mask, so every foam band in
  // the sea shader would trace the tile outline's exact staircase. Blurring the
  // SIGNED field rounds its contours (corners of the zero-crossing bow into
  // arcs) while straight shores are untouched — a box average of a linear ramp
  // is the same ramp. Radius = `scale` lattice cells = one grid tile: enough to
  // round single-tile steps. Sign-preserving: a plain blur would average away
  // the core of one-tile features (a lone land cell, a small pond), so each
  // point is clamped to a small value of its original sign instead of flipping.
  smoothField(data, isLand, res, scale, 2, latticeStep * 0.25)

  return { res, data }
}

/** In-place separable box blur, `passes` iterations (2 ≈ Gaussian). Clamped
 *  edges. Radius in lattice cells. After blurring, every point is clamped to at
 *  least `minMag` of its ORIGINAL sign (from the land mask) so smoothing never
 *  flips land to water or vice versa — thin features keep a small core. */
function smoothField(
  data: Float32Array,
  isLand: Uint8Array,
  res: number,
  radius: number,
  passes: number,
  minMag: number,
): void {
  const tmp = new Float32Array(data.length)
  const norm = 1 / (2 * radius + 1)
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        let sum = 0
        for (let k = -radius; k <= radius; k++) {
          sum += data[j * res + Math.min(res - 1, Math.max(0, i + k))] ?? 0
        }
        tmp[j * res + i] = sum * norm
      }
    }
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        let sum = 0
        for (let k = -radius; k <= radius; k++) {
          sum += tmp[Math.min(res - 1, Math.max(0, j + k)) * res + i] ?? 0
        }
        data[j * res + i] = sum * norm
      }
    }
  }
  for (let idx = 0; idx < data.length; idx++) {
    const d = data[idx] ?? 0
    if (isLand[idx]) {
      if (d > -minMag) data[idx] = -minMag
    } else if (d < minMag) {
      data[idx] = minMag
    }
  }
}
