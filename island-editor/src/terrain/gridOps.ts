// Pure, framework-free grid edits. Following the package convention, these
// MUTATE the passed grid's arrays in place; callers own cloning (see the
// pre-clone in agent/applyOps.ts and the stroke-start snapshot in App.tsx).
// NO three/r3f imports.

import { cellIndex, inBounds, MAX_TIER, SURFACE_AUTO, SURFACE_PATH, type TerrainGrid } from './terrainGrid'

function clampTier(t: number): number {
  return t < 0 ? 0 : t > MAX_TIER ? MAX_TIER : t
}

function clampSurface(s: number): number {
  return s < SURFACE_AUTO ? SURFACE_AUTO : s > SURFACE_PATH ? SURFACE_PATH : s
}

/** In-bounds cell indices of the size×size block centered on (centerC, centerR).
 *  size is 1 | 2 | 3; even sizes bias toward +c/+r. */
export function brushCells(grid: TerrainGrid, centerC: number, centerR: number, size: number): number[] {
  const lo = -Math.floor((size - 1) / 2)
  const cells: number[] = []
  for (let dr = 0; dr < size; dr++) {
    for (let dc = 0; dc < size; dc++) {
      const c = centerC + lo + dc
      const r = centerR + lo + dr
      if (inBounds(grid, c, r)) cells.push(cellIndex(grid, c, r))
    }
  }
  return cells
}

/** tier += delta, clamped to 0..MAX_TIER, for each listed cell. */
export function adjustTier(grid: TerrainGrid, cells: number[], delta: number): void {
  for (const i of cells) grid.tiers[i] = clampTier(grid.tiers[i] + delta)
}

/** Move each listed cell's tier one step (delta = +1 or -1) TOWARD `target`, but
 *  never past it: a raise (delta > 0) only lifts cells currently below `target`; a
 *  lower (delta < 0) only drops cells currently above `target`. Cells already at or
 *  beyond `target` are left unchanged. `target` should be pre-clamped by the caller.
 *  In place; clamped to 0..MAX_TIER. */
export function adjustTierToward(grid: TerrainGrid, cells: number[], delta: number, target: number): void {
  for (const i of cells) {
    const t = grid.tiers[i]
    if (delta > 0 && t < target) grid.tiers[i] = clampTier(t + 1)
    else if (delta < 0 && t > target) grid.tiers[i] = clampTier(t - 1)
  }
}

/** Set tier (clamped) for each listed cell. */
export function setTier(grid: TerrainGrid, cells: number[], tier: number): void {
  const t = clampTier(tier)
  for (const i of cells) grid.tiers[i] = t
}

/** Set surface code (clamped) for each listed cell. */
export function setSurface(grid: TerrainGrid, cells: number[], surface: number): void {
  const s = clampSurface(surface)
  for (const i of cells) grid.surface[i] = s
}

/** Iterate the inclusive rectangle [c0..c1] × [r0..r1], calling `apply` with each
 *  in-bounds cell index. `c0`/`c1` and `r0`/`r1` may be given in either order. */
export function fillRect(
  grid: TerrainGrid,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  apply: (index: number) => void,
): void {
  const cMin = Math.min(c0, c1)
  const cMax = Math.max(c0, c1)
  const rMin = Math.min(r0, r1)
  const rMax = Math.max(r0, r1)
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (inBounds(grid, c, r)) apply(cellIndex(grid, c, r))
    }
  }
}
