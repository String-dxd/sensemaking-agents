// pnpm exec tsx scripts/resample-island-grid.ts — one-time DATA transform
// (plan 031): resample the saved island's tier grid 64×64 → 128×128, baking a
// strongly-blurred continuous field into the new binary grid so the
// coastline/terrace outlines read as curves instead of a macro staircase.
//
// This is a maintainer-requested artistic bake, run ONCE against the saved
// island — it is not part of the live editing path and must NOT touch
// `terrainGrid.ts` (either copy). The runtime `sampleTierField` mix
// (`BLUR_MIX = 0.4`) is deliberately weak so live edits preserve thin
// single-cell features; this script's `RESAMPLE_MIX` may be much stronger
// because it runs once, offline, specifically to erase macro-scale steps that
// the runtime mix cannot and should not touch.
//
// Idempotent: if the save is already 128 cols, this prints and exits 0
// without touching the file, so re-running (e.g. from a stale terminal) is
// safe.
//
// Run with: pnpm exec tsx scripts/resample-island-grid.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  serializeSpec,
  validateSpecObject,
} from '../src/engine/student-space/Game/State/islandSpecCore/specIO.ts'
import { MAX_TIER, type PlacedObject, type TerrainGrid } from '../src/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const savePath = resolve(root, 'island-editor/saves/island.json')

// One-time bake knobs — see file header for why these may exceed the runtime
// sampler's constants (`BLUR_PASSES = 2`, `BLUR_MIX = 0.4` in terrainGrid.ts).
const RESAMPLE_BLUR_PASSES = 3
const RESAMPLE_MIX = 0.75

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Same 3×3 tent kernel as `blurTiers`, applied `passes` times. Duplicated
 *  here deliberately — this script must not import or alter the core's
 *  blur/mix constants, which are tuned for live editing, not this bake. */
function blur(tiers: number[], cols: number, rows: number, passes: number): Float32Array {
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  let src: ArrayLike<number> = tiers
  let out = new Float32Array(cols * rows)
  for (let pass = 0; pass < passes; pass++) {
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
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
              sum += (src[nr * cols + nc] ?? 0) * (weights[k] ?? 0)
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

/** Identical smooth-bilinear sampler to the core's `bilinear` (cell-center
 *  space, smoothstepped fractions on both axes). Duplicated for the same
 *  reason as `blur` above. */
function bilinear(field: ArrayLike<number>, cols: number, u: number, v: number): number {
  const c0 = Math.floor(u)
  const r0 = Math.floor(v)
  const c1 = Math.min(c0 + 1, cols - 1)
  const rows = field.length / cols
  const r1 = Math.min(r0 + 1, rows - 1)
  let fu = u - c0
  let fv = v - r0
  fu = fu * fu * (3 - 2 * fu)
  fv = fv * fv * (3 - 2 * fv)
  const h00 = field[r0 * cols + c0] ?? 0
  const h10 = field[r0 * cols + c1] ?? 0
  const h01 = field[r1 * cols + c0] ?? 0
  const h11 = field[r1 * cols + c1] ?? 0
  const a = h00 + (h10 - h00) * fu
  const b = h01 + (h11 - h01) * fu
  return a + (b - a) * fv
}

function landFraction(tiers: ArrayLike<number>): number {
  let land = 0
  for (let i = 0; i < tiers.length; i++) if ((tiers[i] ?? 0) >= 1) land++
  return land / tiers.length
}

function tierCounts(tiers: ArrayLike<number>): number[] {
  const counts = new Array(MAX_TIER + 1).fill(0)
  for (let i = 0; i < tiers.length; i++) counts[tiers[i] ?? 0]++
  return counts
}

function maxTierPresent(tiers: ArrayLike<number>): number {
  let max = 0
  for (let i = 0; i < tiers.length; i++) max = Math.max(max, tiers[i] ?? 0)
  return max
}

function runResample(mix: number): {
  newGrid: TerrainGrid
  oldGrid: TerrainGrid
  newObjects: PlacedObject[]
  relocated: { id: string; from: [number, number]; to: [number, number] }[]
  failed: string | null
} {
  const parsed: unknown = JSON.parse(readFileSync(savePath, 'utf8'))
  const spec = validateSpecObject(parsed)
  const oldGrid = spec.grid
  const oldCols = oldGrid.cols
  const oldRows = oldGrid.rows
  const worldSize = spec.worldSize
  const oldCellSize = worldSize / oldCols
  const newCols = oldCols * 2
  const newRows = oldRows * 2
  const newCellSize = worldSize / newCols

  const blurred = blur(oldGrid.tiers, oldCols, oldRows, RESAMPLE_BLUR_PASSES)

  const newTiers = new Array<number>(newCols * newRows)
  const newSurface = new Array<number>(newCols * newRows)
  for (let r = 0; r < newRows; r++) {
    for (let c = 0; c < newCols; c++) {
      const x = -worldSize / 2 + (c + 0.5) * newCellSize
      const z = -worldSize / 2 + (r + 0.5) * newCellSize
      const u = clamp((x + worldSize / 2) / oldCellSize - 0.5, 0, oldCols - 1)
      const v = clamp((z + worldSize / 2) / oldCellSize - 0.5, 0, oldRows - 1)
      const raw = bilinear(oldGrid.tiers, oldCols, u, v)
      const bl = bilinear(blurred, oldCols, u, v)
      const t = raw * (1 - mix) + bl * mix
      newTiers[r * newCols + c] = clamp(Math.round(t), 0, MAX_TIER)
      const oc = Math.floor(c / 2)
      const or_ = Math.floor(r / 2)
      newSurface[r * newCols + c] = oldGrid.surface[or_ * oldCols + oc] ?? 0
    }
  }
  const newGrid: TerrainGrid = { cols: newCols, rows: newRows, tiers: newTiers, surface: newSurface }

  // ── Remap objects, relocating any that landed off the new land mass ────────
  const relocated: { id: string; from: [number, number]; to: [number, number] }[] = []
  let failed: string | null = null
  const newObjects: PlacedObject[] = spec.objects.map((o) => {
    const c0 = o.c * 2
    const r0 = o.r * 2
    if ((newTiers[r0 * newCols + c0] ?? 0) >= 1) {
      return { ...o, c: c0, r: r0 }
    }
    let found: { c: number; r: number } | null = null
    for (let radius = 1; radius <= 3 && !found; radius++) {
      let best: { c: number; r: number; d2: number } | null = null
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue // ring only
          const c = c0 + dc
          const r = r0 + dr
          if (c < 0 || c >= newCols || r < 0 || r >= newRows) continue
          if ((newTiers[r * newCols + c] ?? 0) < 1) continue
          const d2 = dc * dc + dr * dr
          if (!best || d2 < best.d2) best = { c, r, d2 }
        }
      }
      if (best) found = { c: best.c, r: best.r }
    }
    if (!found) {
      failed = o.id
      return { ...o, c: c0, r: r0 }
    }
    relocated.push({ id: o.id, from: [c0, r0], to: [found.c, found.r] })
    return { ...o, c: found.c, r: found.r }
  })

  return { newGrid, oldGrid, newObjects, relocated, failed }
}

function main() {
  const parsed: unknown = JSON.parse(readFileSync(savePath, 'utf8'))
  const spec = validateSpecObject(parsed)

  if (spec.grid.cols !== 64) {
    console.log(
      `[resample-island-grid] save is already ${spec.grid.cols}×${spec.grid.rows} (not 64×64) — already resampled, nothing to do.`,
    )
    process.exit(0)
  }

  let mix = RESAMPLE_MIX
  let result = runResample(mix)

  if (result.failed) {
    console.error(
      `[resample-island-grid] object "${result.failed}" has no land (tier ≥ 1) within Chebyshev radius 3 of its remapped cell.`,
    )
    process.exit(1)
  }

  let oldFraction = landFraction(result.oldGrid.tiers)
  let newFraction = landFraction(result.newGrid.tiers)
  let relDelta = Math.abs(newFraction - oldFraction) / oldFraction

  if (relDelta >= 0.15) {
    console.warn(
      `[resample-island-grid] land fraction changed ${(relDelta * 100).toFixed(1)}% at RESAMPLE_MIX=${mix} — retrying once at M=0.6 per plan 031 STOP conditions.`,
    )
    mix = 0.6
    result = runResample(mix)
    if (result.failed) {
      console.error(
        `[resample-island-grid] object "${result.failed}" has no land (tier ≥ 1) within Chebyshev radius 3 of its remapped cell (retry at M=0.6).`,
      )
      process.exit(1)
    }
    oldFraction = landFraction(result.oldGrid.tiers)
    newFraction = landFraction(result.newGrid.tiers)
    relDelta = Math.abs(newFraction - oldFraction) / oldFraction
    if (relDelta >= 0.15) {
      console.error(
        `[resample-island-grid] land fraction still changed ${(relDelta * 100).toFixed(1)}% at RESAMPLE_MIX=0.6 (≥15% bound) — the resample mix is eating the island. Reporting, not tuning further.`,
      )
      process.exit(1)
    }
  }

  const oldMaxTier = maxTierPresent(result.oldGrid.tiers)
  const newMaxTier = maxTierPresent(result.newGrid.tiers)
  if (oldMaxTier !== newMaxTier) {
    console.error(
      `[resample-island-grid] max tier present changed: old=${oldMaxTier} new=${newMaxTier} — aborting.`,
    )
    process.exit(1)
  }

  const newSpec = {
    version: spec.version,
    worldSize: spec.worldSize,
    seaLevel: spec.seaLevel,
    tierHeights: spec.tierHeights,
    grid: result.newGrid,
    objects: result.newObjects,
  }

  const oldCounts = tierCounts(result.oldGrid.tiers)
  const newCounts = tierCounts(result.newGrid.tiers)

  console.log(`[resample-island-grid] RESAMPLE_MIX used: ${mix}`)
  console.log(
    `[resample-island-grid] land fraction: old=${oldFraction.toFixed(4)} new=${newFraction.toFixed(4)} Δrel=${(relDelta * 100).toFixed(2)}%`,
  )
  console.log(
    `[resample-island-grid] per-tier cell counts — old×4 vs new: ${oldCounts
      .map((n, i) => `tier${i}: ${n * 4} vs ${newCounts[i]}`)
      .join(', ')}`,
  )
  console.log(`[resample-island-grid] max tier present: old=${oldMaxTier} new=${newMaxTier} (unchanged)`)
  console.log(`[resample-island-grid] objects relocated: ${result.relocated.length}`)
  for (const r of result.relocated) {
    console.log(`  - ${r.id}: (${r.from[0]},${r.from[1]}) → (${r.to[0]},${r.to[1]})`)
  }

  writeFileSync(savePath, `${serializeSpec(newSpec)}\n`)
  console.log(`[resample-island-grid] wrote ${savePath} (${newSpec.grid.cols}×${newSpec.grid.rows}).`)
}

main()
