// Ported from island-editor/src/terrain/grassField.ts — behavior kept in sync
// via shared test vectors (see terrainGrid.ts provenance note).
//
// Pure, framework-agnostic derivation of grass BLADE transforms from a painted
// spec (v5). NO three imports — the engine's Grass view consumes this to fill
// instanced attributes; keeping the math here makes it headless-testable.

import { mulberry32 } from './rand.ts'
import {
  blurTiers,
  cellCenter,
  cellIndex,
  evaluateHeight,
  type IslandSpec,
  isLandTier,
  SURFACE_GRASS,
} from './terrainGrid.ts'

export interface GrassBlade {
  x: number
  y: number
  z: number
  /** Radians, Y rotation of the blade card. */
  yaw: number
  /** World height of this blade (already jittered). */
  height: number
  /** 0..1 per-blade shade jitter (fragment darkening variety). */
  shade: number
  /** 0..2π wind phase offset. */
  phase: number
}

// Density knob; ~262k blades worst-case full grid. The engine's Grass view
// derives its buffer capacity from this constant (scaled by quality tier).
export const BLADES_PER_CELL = 64

/** Plateau interiors are flat (terraced terrain: smoothstep is 0 or 1 away
 *  from walls), so any per-blade height deviating from the CELL CENTER's
 *  height by more than the lip's rounding means the blade left its cell's
 *  plateau for a terrace wall. The smallest inter-tier step is 0.65
 *  (DEFAULT_TIER_HEIGHTS), so 0.05 cleanly separates "on the plateau" from
 *  "on the cliff", both downhill and uphill spills. Assumes plateaus. */
const CLIFF_DROP = 0.05

/** SoA blade layout matching the instanced attributes exactly, so the scatter
 *  can fill the GPU-bound arrays directly (no per-blade object allocation).
 *  Float64Array is accepted so the object-view wrapper below stays LOSSLESS
 *  (float32 quantization happens exactly at the GPU attribute). */
export interface GrassBladeArrays {
  /** xyz per blade (3 floats) */
  offsets: Float32Array | Float64Array
  /** yaw, height per blade (2 floats) */
  yawScales: Float32Array | Float64Array
  /** shade, phase per blade (2 floats) */
  shadePhases: Float32Array | Float64Array
}

/** Scatter `perCell` blades over every grass-painted LAND cell, writing into
 *  caller-owned arrays (capacity ≥ cells×perCell blades); returns the blade
 *  COUNT. Blades jitter ±0.575 cells around the center — 15% overflow past
 *  the cell edge, so adjacent painted cells interlock into a continuous
 *  meadow with organic edges instead of visible crop rows. Each blade's y is
 *  the terrain height at ITS OWN x/z (blades follow slopes); blades whose
 *  ground lands at or below sea level are skipped (shore-edge overflow must
 *  not stand in water), as are blades that dropped off the cell's plateau
 *  onto a terrace wall (CLIFF_DROP). Deterministic: same spec → identical
 *  fill (row-major cell scan, one mulberry32(cellIndex + 1) stream per cell).
 *  Zero allocations beyond the one blurTiers (pass `blurred` to avoid even
 *  that). */
export function fillGrassBlades(
  spec: IslandSpec,
  out: GrassBladeArrays,
  perCell = BLADES_PER_CELL,
  blurred?: Float32Array,
): number {
  const { grid, worldSize, tierHeights, seaLevel } = spec
  const cellSize = worldSize / grid.cols
  const blur = blurred ?? blurTiers(grid)
  let count = 0
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const i = cellIndex(grid, c, r)
      if (grid.surface[i] !== SURFACE_GRASS) continue
      if (!isLandTier(grid.tiers[i] ?? 0, tierHeights, seaLevel)) continue
      const { x: cx, z: cz } = cellCenter(worldSize, grid, c, r)
      const yCell = evaluateHeight(spec, cx, cz, blur)
      // +1 because mulberry32(0) is a degenerate seed (yields 0 as its first
      // draw); per blade the draw order is dx, dz, yaw, height, shade, phase.
      const rand = mulberry32(i + 1)
      for (let b = 0; b < perCell; b++) {
        const x = cx + (rand() * 2 - 1) * 0.575 * cellSize
        const z = cz + (rand() * 2 - 1) * 0.575 * cellSize
        const yaw = rand() * Math.PI * 2
        const height = 0.08 + rand() * 0.2
        const shade = rand()
        const phase = rand() * Math.PI * 2
        const y = evaluateHeight(spec, x, z, blur)
        if (y <= seaLevel + 0.01) continue // edge blades must not stand in water
        if (Math.abs(y - yCell) > CLIFF_DROP) continue // spilled onto a terrace wall
        out.offsets[count * 3] = x
        out.offsets[count * 3 + 1] = y
        out.offsets[count * 3 + 2] = z
        out.yawScales[count * 2] = yaw
        out.yawScales[count * 2 + 1] = height
        out.shadePhases[count * 2] = shade
        out.shadePhases[count * 2 + 1] = phase
        count++
      }
    }
  }
  return count
}

/** Object-array view of the scatter (test-facing contract; the Grass view uses
 *  fillGrassBlades directly). Materialized FROM the SoA fill, so determinism
 *  is identical by construction. */
export function grassBlades(spec: IslandSpec, perCell = BLADES_PER_CELL): GrassBlade[] {
  const capacity = spec.grid.cols * spec.grid.rows * perCell
  // Float64 buffers: the object view must carry the exact same values the
  // editor's object-pushing implementation produced (tests assert y to 1e-10).
  const arrays: GrassBladeArrays = {
    offsets: new Float64Array(capacity * 3),
    yawScales: new Float64Array(capacity * 2),
    shadePhases: new Float64Array(capacity * 2),
  }
  const count = fillGrassBlades(spec, arrays, perCell)
  const out: GrassBlade[] = new Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = {
      x: arrays.offsets[i * 3] ?? 0,
      y: arrays.offsets[i * 3 + 1] ?? 0,
      z: arrays.offsets[i * 3 + 2] ?? 0,
      yaw: arrays.yawScales[i * 2] ?? 0,
      height: arrays.yawScales[i * 2 + 1] ?? 0,
      shade: arrays.shadePhases[i * 2] ?? 0,
      phase: arrays.shadePhases[i * 2 + 1] ?? 0,
    }
  }
  return out
}
