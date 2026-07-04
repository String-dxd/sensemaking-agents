// The default island. Built by rasterizing the historical v2 silhouette onto the
// v3 grid — one code path shared with importing old files (see specIO.ts).

import { rasterizeV2ToGrid, seedV2 } from './legacy/specV2'
import { DEFAULT_TIER_HEIGHTS, GRID_COLS, GRID_ROWS, type IslandSpec } from './terrainGrid'

/** The v3 seed spec: the original island silhouette, terraced onto a 64×64 grid. */
export function seedIsland(): IslandSpec {
  return {
    version: 3,
    worldSize: 24,
    seaLevel: 0,
    tierHeights: DEFAULT_TIER_HEIGHTS,
    grid: rasterizeV2ToGrid(seedV2(), GRID_COLS, GRID_ROWS),
  }
}
