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
export const SURFACE_GRASS = 1 // painted grass tufts (v5; was dirt path in ≤v4)

/** Corner-rounding strength for the terrace field (knob, 0..1). Plan 032:
 *  raised 0.4 → 0.85 for the 128×128 grid (plan 031's resample) — a binary
 *  grid's iso-contours stay hard-edged until the raw weight drops below
 *  roughly 0.2, so smoothing a 128-cell coastline needs the mix this high.
 *  See the WHY comment in `sampleTierField` for the redefined
 *  feature-preservation floor this trades against. */
export const BLUR_MIX = 0.85

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
  version: 5
  /** Square world bounds: X and Z each span [-worldSize/2, worldSize/2]. */
  worldSize: number
  /** World Y of the water surface. */
  seaLevel: number
  /** World Y of each tier's flat top, ascending, length MAX_TIER + 1. */
  tierHeights: number[]
  grid: TerrainGrid
  /** Decorative objects placed on the terrain (v4). Empty on migrated v1/v2/v3
   *  specs. Position is keyed by grid CELL (c,r) — see `worldPositionOfObject`. */
  objects: PlacedObject[]
}

/** Default tier tops. Tier 2 = 1.0 matches the engine's plateauTopY (see the
 *  v2 seed comment). Seafloor matches v2 seafloorDepth. Tier 1 (the beach) was
 *  lowered 0.12 → 0.05 on 2026-07-12 so the shore sits nearly flush with the
 *  sea; the floor is the sea shader's ripple crest (+0.027 — see the vertex
 *  2-sine in SeaMaterial.ts), so keep it above ~0.035 or waves clip the sand. */
export const DEFAULT_TIER_HEIGHTS = [-1.2, 0.05, 1.0, 1.65, 2.3]

/** The default tier tops before the 2026-07-12 beach lowering. Saved/exported
 *  specs that still carry exactly this array migrate to DEFAULT_TIER_HEIGHTS on
 *  load (see validateSpecObject) — an island saved yesterday must still open,
 *  and should pick up the retuned shoreline. Custom-authored heights are never
 *  rewritten. Also keeps legacy v1/v2 rasterization stable (see specV2.ts). */
export const LEGACY_DEFAULT_TIER_HEIGHTS = [-1.2, 0.12, 1.0, 1.65, 2.3]

/** Current spec version. `validateSpecObject` accepts this and older versions and
 *  normalizes (migrates) to it. Single source of truth for the literal.
 *
 *  v5 (2026-07-12): surface code 1 now means painted grass (drag-painted tufts,
 *  rendered by GrassLayer) instead of the removed dirt-path tool. A ≤v4 file's
 *  path paint encoded a feature that no longer exists, so `validateSpecObject`
 *  clears surface code 1 back to SURFACE_AUTO on migration — tiers and objects
 *  are untouched. */
export const CURRENT_SPEC_VERSION = 5

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

/** Blur passes for the terrace field. Plan 032: 2 → 4 chained 3×3 tent blurs
 *  (a wider effective Gaussian) for the 128×128 grid (plan 031's resample) —
 *  at BLUR_MIX = 0.85 the wider kernel is what makes the coastline read as
 *  gentle scalloped curves instead of a rounded-but-still-blocky outline;
 *  raising BLUR_MIX alone without widening the blur just softens the steps,
 *  it doesn't erase them. */
export const BLUR_PASSES = 4

/** 3×3 tent blur of the tier field as floats, applied `BLUR_PASSES` times.
 *  Out-of-bounds neighbors count as tier 0 (ocean surrounds the island).
 *  Kernel (1 2 1 / 2 4 2 / 1 2 1)/16 per pass. */
export function blurTiers(grid: TerrainGrid): Float32Array {
  const { cols, rows, tiers } = grid
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  let src: ArrayLike<number> = tiers
  let out = new Float32Array(cols * rows)
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    if (pass > 0) {
      src = out
      out = new Float32Array(cols * rows)
    }
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
              sum += src[nr * cols + nc] * weights[k]
            }
            k++
          }
        }
        out[r * cols + c] = sum / 16
      }
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
  let fu = u - c0
  let fv = v - r0
  // C1 "smooth bilinear" (plan 028): smoothstepped fractions round the
  // field's iso-contours — plain bilinear contours are piecewise-linear with
  // kinks at every lattice point, which rendered the island silhouette as a
  // diamond sawtooth. At integer u/v the fractions are 0/1, so CELL-CENTER
  // VALUES ARE EXACT AND UNCHANGED — the thin-feature amplitude invariant
  // documented on sampleTierField (BLUR_MIX comment) is preserved.
  fu = fu * fu * (3 - 2 * fu)
  fv = fv * fv * (3 - 2 * fv)
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
 * WHY the mix (do not "simplify" to blur-only): a fully-blurred field would
 * destroy ALL thin features uniformly, with no floor at any size. Keeping
 * SOME raw weight instead gives features a SIZE-DEPENDENT floor: big enough
 * features stay visible land (or visible water, for a carved pocket); small
 * enough ones dissolve into their surroundings. Below is that floor, as
 * verified at the current constants.
 *
 * THE FEATURE-PRESERVATION FLOOR WAS REDEFINED IN PLAN 032 for the 128×128
 * grid (plan 031's resample), and CORRECTED in plan 032's second revision
 * (the first restatement below undercounted how much a lone cell sinks).
 * Verified numbers at BLUR_MIX = 0.85 / BLUR_PASSES = 4 (needed for the
 * coastline to actually read as curves — see the BLUR_MIX/BLUR_PASSES
 * comments), measured at a stamped block's anchor-cell center:
 *   - a LONE tier-2 cell samples ≈ 0.427 → terraces to ≈ −0.943, BELOW sea
 *     level. This is now DELIBERATE, not a bug: the maintainer's island art
 *     direction is "few big smooth scalloped masses" — sub-2×2 detail is
 *     intentionally not authorable at this blur strength.
 *   - a 2×2 tier-2 block (≈ the OLD single 64-grid cell's world footprint,
 *     0.375 units — the pre-031 floor) samples ≈ 0.712 → terraces to exactly
 *     tierHeights[1] (0.05): the preserved "stays visible land" floor.
 *   - a 5×5 tier-2 block (~0.94 world units) samples ≈ 1.769 → terraces to
 *     exactly tierHeights[2] (1.0): a full raised bump, the new practical
 *     minimum for a plateau-height feature.
 * The floor is SYMMETRIC for carved WATER pockets inside land — shoreField.ts
 * classifies land as `sampleTierField(...) >= 0.5`, the same function, so a
 * carved pocket smaller than ~5×5–7×7 cells (~0.9–1.3 world units) dissolves
 * back into land exactly like a lone raised cell dissolves into the sea (a
 * 3×3 pond now samples as land; 7×7 is confirmed water). This symmetry is
 * consistent between the terrain mesh and the shore field because both read
 * this same sampler — the capability lost is authoring sub-~5×5 ponds, which
 * matches the same approved trade. All four floors (lone cell, 2×2, 5×5,
 * pond) are pinned by numeric expectations in test/engine/islandSpecCore.test.ts
 * and island-editor/test/terrainGrid.test.ts / shoreField.test.ts / grassField.test.ts.
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
// The decorative object kinds the renderer can place. `tree` and `rock` load
// authored GLB assets (public/models/, built by scripts/optimize-meshy-glb.mjs);
// `bush` is still built procedurally (src/models/buildObjectModel.ts). Kept in
// the pure spec module so the enum the renderer consumes lives alongside the
// rest of the headless-testable core.

// `character` is max-1 per island (enforced in objectOps/specIO, not here —
// this module stays a pure enum) and renders through `CharacterActor`, not
// the shared `PlacedObjectMesh` (it needs a skeletal mixer the static kinds
// don't have).
export type ObjectKind = 'tree' | 'bush' | 'rock' | 'character'
export const OBJECT_KINDS: ObjectKind[] = ['tree', 'bush', 'rock', 'character']

/** Kinds retired on 2026-07-11, when the three authored tree variants collapsed
 *  into the single Meshy `tree` asset. Saved islands (and exported spec files)
 *  still carry them, so `validateSpecObject` rewrites them on load rather than
 *  rejecting the spec — an island saved yesterday must still open. */
export const LEGACY_OBJECT_KINDS: Record<string, ObjectKind> = {
  fruitTree: 'tree',
  pine: 'tree',
  palm: 'tree',
}

// ── Placed objects (v4) ──────────────────────────────────────────────────────
// A decorative object dropped on the terrain. Position is a grid CELL (snapped)
// so it survives grid edits and serializes tiny; world x/z derive from
// `cellCenter`, world y from `evaluateHeight` at that point (top of terrain).
// Placement adds a little yaw + scale jitter for natural variety.

export interface PlacedObject {
  /** Stable id, assigned once at placement (never recomputed). */
  id: string
  kind: ObjectKind
  /** Grid column (0..cols-1). */
  c: number
  /** Grid row (0..rows-1). */
  r: number
  /** Radians, placement jitter. */
  yaw: number
  /** ~0.85..1.15 placement jitter. */
  scale: number
}

/** World transform for a placed object: cell-center X/Z, terrain-top Y. Pass a
 *  precomputed `blurred` (from `blurTiers`) in hot loops. */
export function worldPositionOfObject(
  spec: IslandSpec,
  o: PlacedObject,
  blurred?: ArrayLike<number>,
): { x: number; y: number; z: number } {
  const { x, z } = cellCenter(spec.worldSize, spec.grid, o.c, o.r)
  return { x, y: evaluateHeight(spec, x, z, blurred), z }
}
