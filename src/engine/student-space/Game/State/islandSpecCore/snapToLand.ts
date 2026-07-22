// Pure hydrate-time position snap (KTD-7). No editor counterpart — this is the
// engine-side migration helper for persisted placements that land outside land
// or on terrace walls under the spec terrain. Terrain validity is INJECTED
// (State/Island's `isPlaceable`) so this module stays three-free and testable.

import { cellIndex, type IslandSpec, worldToCell } from './terrainGrid.ts'

export interface SnapEnv {
  worldSize: number
  cols: number
  rows: number
  /** Injected terrain predicate — true where an object may stand. */
  isValid: (x: number, z: number) => boolean
}

/** Cell key (r*cols+c) for a world position; null when out of grid bounds. */
function cellKeyAt(env: SnapEnv, x: number, z: number): number | null {
  const cellSize = env.worldSize / env.cols
  const c = Math.floor((x + env.worldSize / 2) / cellSize)
  const r = Math.floor((z + env.worldSize / 2) / cellSize)
  if (c < 0 || c >= env.cols || r < 0 || r >= env.rows) return null
  return r * env.cols + c
}

function centerOf(env: SnapEnv, c: number, r: number): { x: number; z: number } {
  const cellSize = env.worldSize / env.cols
  return {
    x: -env.worldSize / 2 + (c + 0.5) * cellSize,
    z: -env.worldSize / 2 + (r + 0.5) * cellSize,
  }
}

/** The occupancy pre-seed: every decorative object's cell (character included)
 *  from the committed spec, so a snapped functional object never lands inside
 *  an editor tree or on the character spawn. */
export function occupiedCellsFromSpec(spec: IslandSpec): Set<number> {
  const occupied = new Set<number>()
  for (const o of spec.objects) occupied.add(cellIndex(spec.grid, o.c, o.r))
  return occupied
}

/** Mark the cell containing (x, z) occupied (used to claim the cells of
 *  already-valid objects before snapping the invalid ones). */
export function claimCellAt(env: SnapEnv, occupied: Set<number>, x: number, z: number): void {
  const key = cellKeyAt(env, x, z)
  if (key !== null) occupied.add(key)
}

/**
 * Snap an invalid position to the center of the nearest valid, unoccupied cell.
 *
 * - A VALID position is returned untouched (byte-identical) and its cell is NOT
 *   claimed — callers claim valid objects' cells up front via `claimCellAt` so
 *   later snaps avoid them.
 * - An INVALID position ring-searches outward (Chebyshev rings, row-major scan
 *   within each ring — deterministic) from its containing cell for the first
 *   cell whose CENTER satisfies `isValid` and is not in `occupied`; that cell
 *   is claimed (added to `occupied`) so clustered invalid objects fan out to
 *   distinct cells instead of stacking.
 * - Returns null when no valid cell exists anywhere in the grid (caller keeps
 *   the original position — nothing sensible to do).
 */
export function snapPositionToLand(
  env: SnapEnv,
  occupied: Set<number>,
  x: number,
  z: number,
): { x: number; z: number } | null {
  if (env.isValid(x, z)) return { x, z }

  // Origin cell, clamped into bounds so off-world points search from the edge.
  const spec = { cols: env.cols, rows: env.rows, tiers: [], surface: [] }
  const raw = worldToCell(env.worldSize, spec, x, z)
  const c0 = Math.min(env.cols - 1, Math.max(0, raw.c))
  const r0 = Math.min(env.rows - 1, Math.max(0, raw.r))

  const maxRadius = Math.max(env.cols, env.rows)
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue // ring only
        const c = c0 + dc
        const r = r0 + dr
        if (c < 0 || c >= env.cols || r < 0 || r >= env.rows) continue
        const key = r * env.cols + c
        if (occupied.has(key)) continue
        const center = centerOf(env, c, r)
        if (!env.isValid(center.x, center.z)) continue
        occupied.add(key)
        return center
      }
    }
  }
  return null
}
