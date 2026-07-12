// Pure, framework-agnostic derivation of grass BLADE transforms from a painted
// spec (v5). NO three/r3f imports — GrassLayer (r3f) consumes this to fill
// instanced attributes; keeping the math here makes it headless-testable,
// mirroring objectOps/gridOps.

import { mulberry32 } from '../models/rand'
import { isLandTier } from './gridOps'
import { blurTiers, cellCenter, cellIndex, evaluateHeight, type IslandSpec, SURFACE_GRASS } from './terrainGrid'

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

// Density knob; ~196k blades worst-case full grid. Retuned 24 → 48 (plan 021):
// thinner blades (BLADE_W 0.045 → 0.018) need tighter packing — maintainer
// feedback. GrassLayer's buffer capacity derives from this constant.
export const BLADES_PER_CELL = 48

/** Plateau interiors are flat (terraced terrain: smoothstep is 0 or 1 away
 *  from walls), so any per-blade height deviating from the CELL CENTER's
 *  height by more than the lip's rounding means the blade left its cell's
 *  plateau for a terrace wall. The smallest inter-tier step is 0.65
 *  (DEFAULT_TIER_HEIGHTS), so 0.05 cleanly separates "on the plateau" from
 *  "on the cliff", both downhill and uphill spills. Assumes plateaus — a
 *  future deliberate-slope feature would need to rethink this rule. */
const CLIFF_DROP = 0.05

/** Scatter `perCell` blades over every grass-painted LAND cell (plan 020's
 *  BOTW meadow). Blades jitter ±0.575 cells around the center — 15% overflow
 *  past the cell edge, so adjacent painted cells interlock into a continuous
 *  meadow with organic edges instead of visible crop rows. Each blade's y is
 *  the terrain height at ITS OWN x/z (blades follow slopes); blades whose
 *  ground lands at or below sea level are skipped (shore-edge overflow must
 *  not stand in water), as are blades that dropped off the cell's plateau
 *  onto a terrace wall (CLIFF_DROP; plan 021). Deterministic: same spec →
 *  identical array (row-major cell scan, one mulberry32(cellIndex + 1)
 *  stream per cell). */
export function grassBlades(spec: IslandSpec, perCell = BLADES_PER_CELL): GrassBlade[] {
  const { grid, worldSize, tierHeights, seaLevel } = spec
  const cellSize = worldSize / grid.cols
  const blurred = blurTiers(grid)
  const out: GrassBlade[] = []
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const i = cellIndex(grid, c, r)
      if (grid.surface[i] !== SURFACE_GRASS) continue
      if (!isLandTier(grid.tiers[i], tierHeights, seaLevel)) continue
      const { x: cx, z: cz } = cellCenter(worldSize, grid, c, r)
      const yCell = evaluateHeight(spec, cx, cz, blurred)
      // +1 because mulberry32(0) is a degenerate seed (yields 0 as its first
      // draw); per blade the draw order is dx, dz, yaw, height, shade, phase.
      const rand = mulberry32(i + 1)
      for (let b = 0; b < perCell; b++) {
        const x = cx + (rand() * 2 - 1) * 0.575 * cellSize
        const z = cz + (rand() * 2 - 1) * 0.575 * cellSize
        const yaw = rand() * Math.PI * 2
        const height = 0.1 + rand() * 0.14
        const shade = rand()
        const phase = rand() * Math.PI * 2
        const y = evaluateHeight(spec, x, z, blurred)
        if (y <= seaLevel + 0.01) continue // edge blades must not stand in water
        if (Math.abs(y - yCell) > CLIFF_DROP) continue // spilled onto a terrace wall
        out.push({ x, y, z, yaw, height, shade, phase })
      }
    }
  }
  return out
}

