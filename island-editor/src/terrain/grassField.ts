// Pure, framework-agnostic derivation of grass-tuft instance transforms from a
// painted spec (v5). NO three/r3f imports — GrassLayer (r3f) consumes this to
// build an InstancedMesh; keeping the math here makes it headless-testable,
// mirroring objectOps/gridOps.

import { mulberry32 } from '../models/rand'
import { isLandTier } from './gridOps'
import { blurTiers, cellCenter, cellIndex, evaluateHeight, type IslandSpec, SURFACE_GRASS } from './terrainGrid'

export interface GrassInstanceTransform {
  x: number
  y: number
  z: number
  /** Radians, Y-axis rotation. */
  yaw: number
  scale: number
}

/** One transform per grass-painted LAND cell (surface code SURFACE_GRASS AND
 *  above sea level — paint on a water cell is invisible and yields nothing).
 *  Deterministic: the same spec always yields the same transforms in the same
 *  order (row-major cell scan), so callers can rely on stable instance indices
 *  across re-renders that don't change the paint/tiers. */
export function grassInstanceTransforms(spec: IslandSpec): GrassInstanceTransform[] {
  const { grid, worldSize, tierHeights, seaLevel } = spec
  const blurred = blurTiers(grid)
  const out: GrassInstanceTransform[] = []
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const i = cellIndex(grid, c, r)
      if (grid.surface[i] !== SURFACE_GRASS) continue
      if (!isLandTier(grid.tiers[i], tierHeights, seaLevel)) continue
      const { x, z } = cellCenter(worldSize, grid, c, r)
      const y = evaluateHeight(spec, x, z, blurred)
      // +1 because mulberry32(0) is a degenerate seed (yields 0 as its first
      // draw); yaw is drawn before scale from the same stream.
      const rand = mulberry32(i + 1)
      const yaw = rand() * Math.PI * 2
      const scale = 0.95 + rand() * 0.4
      out.push({ x, y, z, yaw, scale })
    }
  }
  return out
}
