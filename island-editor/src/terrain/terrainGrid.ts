// Pure, framework-agnostic v3 island model: a tile grid of discrete elevation
// tiers with a terraced-cliff height evaluation. NO three/r3f imports here — this
// is the headless-testable core and the durable export artifact (the "island
// spec"). The renderer (r3f) and the eventual student-space migration both
// consume these same functions/data. Height lookup is O(1) bilinear + terrace,
// which is what makes future engine binding cheap.

export const MAX_TIER = 4 // tiers 0..4
export const GRID_COLS = 64
export const GRID_ROWS = 64
export const SURFACE_AUTO = 0 // grass/sand derived from tier
export const SURFACE_PATH = 1 // dirt path tint

/** Corner-rounding strength for the terrace field (knob, 0..0.4). See the WHY
 *  comment in `sampleTierField`. */
export const BLUR_MIX = 0.25

/** Wall width fraction between tiers (tuning knob). */
export const DEFAULT_WALL_WIDTH = 0.35

export interface TerrainGrid {
  cols: number
  rows: number
  /** row-major, length cols*rows, integer 0..MAX_TIER */
  tiers: number[]
  /** row-major, length cols*rows, integer surface code (0 | 1) */
  surface: number[]
}

export interface IslandSpec {
  version: 3
  /** Square world bounds: X and Z each span [-worldSize/2, worldSize/2]. */
  worldSize: number
  /** World Y of the water surface. */
  seaLevel: number
  /** World Y of each tier's flat top, ascending, length MAX_TIER + 1. */
  tierHeights: number[]
  grid: TerrainGrid
}

/** Default tier tops. Tier 2 = 1.0 matches the engine's plateauTopY (see the
 *  v2 seed comment). Seafloor matches v2 seafloorDepth. */
export const DEFAULT_TIER_HEIGHTS = [-1.2, 0.12, 1.0, 1.65, 2.3]

/** Current spec version. `validateSpecObject` accepts this and older versions and
 *  normalizes (migrates) to it. Single source of truth for the literal. */
export const CURRENT_SPEC_VERSION = 3

// ── Grid indexing ────────────────────────────────────────────────────────────

export function cellIndex(grid: TerrainGrid, c: number, r: number): number {
  return r * grid.cols + c
}

export function inBounds(grid: TerrainGrid, c: number, r: number): boolean {
  return c >= 0 && c < grid.cols && r >= 0 && r < grid.rows
}

/** World XZ of the center of cell (c, r). The grid is square over `worldSize`. */
export function cellCenter(worldSize: number, grid: TerrainGrid, c: number, r: number): { x: number; z: number } {
  const cellSize = worldSize / grid.cols
  return {
    x: -worldSize / 2 + (c + 0.5) * cellSize,
    z: -worldSize / 2 + (r + 0.5) * cellSize,
  }
}

/** Floor-based world→cell mapping. Result may be out of bounds — callers check. */
export function worldToCell(worldSize: number, grid: TerrainGrid, x: number, z: number): { c: number; r: number } {
  const cellSize = worldSize / grid.cols
  return {
    c: Math.floor((x + worldSize / 2) / cellSize),
    r: Math.floor((z + worldSize / 2) / cellSize),
  }
}

/** Integer cells on the line from (c0,r0) to (c1,r1), inclusive (Bresenham).
 *  Used to interpolate a paint stroke between two pointer samples so a fast
 *  drag paints a continuous line instead of skipping cells. Cells may be out of
 *  bounds — callers clip (brushCells already does). */
export function cellLine(c0: number, r0: number, c1: number, r1: number): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = []
  let c = c0
  let r = r0
  const dc = Math.abs(c1 - c0)
  const dr = Math.abs(r1 - r0)
  const sc = c0 < c1 ? 1 : -1
  const sr = r0 < r1 ? 1 : -1
  let err = dc - dr
  // Guard against a pathological span (pointer teleport) producing a huge array.
  for (let guard = 0; guard <= dc + dr; guard++) {
    out.push({ c, r })
    if (c === c1 && r === r1) break
    const e2 = 2 * err
    if (e2 > -dr) {
      err -= dr
      c += sc
    }
    if (e2 < dc) {
      err += dc
      r += sr
    }
  }
  return out
}

/** A fresh all-ocean grid (every cell tier 0, surface auto). */
export function createOceanGrid(cols = GRID_COLS, rows = GRID_ROWS): TerrainGrid {
  const n = cols * rows
  return {
    cols,
    rows,
    tiers: new Array(n).fill(0),
    surface: new Array(n).fill(SURFACE_AUTO),
  }
}

// ── Terrace field ────────────────────────────────────────────────────────────

/** 3×3 tent blur of the tier field as floats. Out-of-bounds neighbors count as
 *  tier 0 (ocean surrounds the island). Kernel (1 2 1 / 2 4 2 / 1 2 1)/16. */
export function blurTiers(grid: TerrainGrid): Float32Array {
  const { cols, rows, tiers } = grid
  const out = new Float32Array(cols * rows)
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0
      let k = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc
          const nr = r + dr
          // out-of-bounds = tier 0 → contributes nothing to the weighted sum,
          // but the fixed /16 divisor still counts it, pulling edges down.
          if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
            sum += tiers[nr * cols + nc] * weights[k]
          }
          k++
        }
      }
      out[r * cols + c] = sum / 16
    }
  }
  return out
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Bilinear sample of a row-major field in cell-center space (integer u/v = a
 *  cell center). u/v are expected pre-clamped to [0, cols-1] / [0, rows-1]. */
function bilinear(field: ArrayLike<number>, cols: number, u: number, v: number): number {
  const c0 = Math.floor(u)
  const r0 = Math.floor(v)
  const c1 = Math.min(c0 + 1, cols - 1)
  const rows = field.length / cols
  const r1 = Math.min(r0 + 1, rows - 1)
  const fu = u - c0
  const fv = v - r0
  const h00 = field[r0 * cols + c0]
  const h10 = field[r0 * cols + c1]
  const h01 = field[r1 * cols + c0]
  const h11 = field[r1 * cols + c1]
  const a = h00 + (h10 - h00) * fu
  const b = h01 + (h11 - h01) * fu
  return a + (b - a) * fv
}

/**
 * Continuous tier field at world (x, z): bilinear of the raw grid mixed with the
 * bilinear of the blurred grid by `BLUR_MIX`.
 *
 * WHY the mix (do not "simplify" to blur-only): a fully-blurred field destroys
 * thin features — an isolated tier-2 cell tent-blurs to 0.5, which would terrace
 * to BELOW sea level, i.e. stamping one cell of land would be invisible.
 * Terracing the raw bilinear field preserves single-cell amplitude exactly; the
 * bounded blur mix only rounds plan-view corners. At BLUR_MIX = 0.25 an isolated
 * tier-2 cell keeps ≈ 95% of its height.
 */
export function sampleTierField(
  grid: TerrainGrid,
  blurred: ArrayLike<number>,
  worldSize: number,
  x: number,
  z: number,
): number {
  const { cols, rows, tiers } = grid
  const cellSize = worldSize / cols
  const u = clamp((x + worldSize / 2) / cellSize - 0.5, 0, cols - 1)
  const v = clamp((z + worldSize / 2) / cellSize - 0.5, 0, rows - 1)
  const raw = bilinear(tiers, cols, u, v)
  const blur = bilinear(blurred, cols, u, v)
  return raw + (blur - raw) * BLUR_MIX
}

/**
 * Terrace blend at continuous tier value `t`: flat tops at integer tiers, steep
 * rounded walls between. Returns the lower tier index `i` and the smoothstep
 * wall factor `s` (0 on tier i's flat top → 1 on tier i+1's).
 */
export function terraceBlend(t: number, wallWidth = DEFAULT_WALL_WIDTH): { i: number; s: number } {
  let i = Math.floor(t)
  if (i < 0) i = 0
  if (i > MAX_TIER - 1) i = MAX_TIER - 1 // i+1 stays in range; t == MAX_TIER → f == 1
  const f = t - i
  const W = wallWidth
  const g = clamp((f - 0.5 + W / 2) / W, 0, 1)
  const s = g * g * (3 - 2 * g) // smoothstep rounds lip + base
  return { i, s }
}

/** Terraced world height for a continuous tier value `t`. */
export function terraceHeight(t: number, tierHeights: number[], wallWidth = DEFAULT_WALL_WIDTH): number {
  const { i, s } = terraceBlend(t, wallWidth)
  return tierHeights[i] + (tierHeights[i + 1] - tierHeights[i]) * s
}

/** Final terrain height at world (x, z). Pass a precomputed `blurred` (from
 *  `blurTiers`) in hot loops to avoid recomputing it per query. O(1). */
export function evaluateHeight(spec: IslandSpec, x: number, z: number, blurred?: ArrayLike<number>): number {
  const b = blurred ?? blurTiers(spec.grid)
  const t = sampleTierField(spec.grid, b, spec.worldSize, x, z)
  return terraceHeight(t, spec.tierHeights)
}

// ── Object kinds ───────────────────────────────────────────────────────────
// The decorative object kinds the procedural model factory (src/models/
// buildObjectModel.ts) can build. Placement (Plan B) + palette (Plan C) build on
// this. Kept in the pure spec module so the enum the renderer consumes lives
// alongside the rest of the headless-testable core.

export type ObjectKind = 'fruitTree' | 'pine' | 'palm' | 'bush' | 'rock'
export const OBJECT_KINDS: ObjectKind[] = ['fruitTree', 'pine', 'palm', 'bush', 'rock']
