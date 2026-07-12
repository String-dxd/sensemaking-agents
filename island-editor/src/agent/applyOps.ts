import { validateSpecObject } from '../editor/specIO'
import { adjustTier, fillRect, setSurface, setTier } from '../terrain/gridOps'
import { seedIsland } from '../terrain/seed'
import { type IslandSpec, MAX_TIER, SURFACE_AUTO, SURFACE_GRASS, type TerrainGrid } from '../terrain/terrainGrid'
import type { Op, OpError } from './ops'

/** A rect op's coordinate fields, validated as integers in bounds with c0≤c1. */
interface Rect {
  c0: number
  r0: number
  c1: number
  r1: number
}

function assertInt(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${name} must be an integer, got ${String(v)}`)
}

function validateRect(grid: TerrainGrid, rect: Rect): void {
  assertInt('c0', rect.c0)
  assertInt('r0', rect.r0)
  assertInt('c1', rect.c1)
  assertInt('r1', rect.r1)
  if (rect.c0 > rect.c1) throw new Error(`c0 (${rect.c0}) must not exceed c1 (${rect.c1})`)
  if (rect.r0 > rect.r1) throw new Error(`r0 (${rect.r0}) must not exceed r1 (${rect.r1})`)
  if (rect.c0 < 0 || rect.c1 >= grid.cols) throw new Error(`columns out of bounds 0..${grid.cols - 1}`)
  if (rect.r0 < 0 || rect.r1 >= grid.rows) throw new Error(`rows out of bounds 0..${grid.rows - 1}`)
}

function cloneGrid(g: TerrainGrid): TerrainGrid {
  return { cols: g.cols, rows: g.rows, tiers: g.tiers.slice(), surface: g.surface.slice() }
}

function rectCells(grid: TerrainGrid, rect: Rect): number[] {
  const cells: number[] = []
  fillRect(grid, rect.c0, rect.r0, rect.c1, rect.r1, (i) => cells.push(i))
  return cells
}

function applyOne(spec: IslandSpec, op: Op): IslandSpec {
  switch (op.op) {
    case 'fillRect': {
      if (!Number.isInteger(op.tier) || op.tier < 0 || op.tier > MAX_TIER) {
        throw new Error(`tier must be an integer 0..${MAX_TIER}, got ${String(op.tier)}`)
      }
      validateRect(spec.grid, op)
      const grid = cloneGrid(spec.grid)
      setTier(grid, rectCells(grid, op), op.tier)
      return { ...spec, grid }
    }
    case 'adjustRect': {
      if (op.delta !== -1 && op.delta !== 1) throw new Error(`delta must be -1 or 1, got ${String(op.delta)}`)
      validateRect(spec.grid, op)
      const grid = cloneGrid(spec.grid)
      adjustTier(grid, rectCells(grid, op), op.delta)
      return { ...spec, grid }
    }
    case 'paintRect': {
      if (op.surface !== SURFACE_AUTO && op.surface !== SURFACE_GRASS) {
        throw new Error(`surface must be ${SURFACE_AUTO} or ${SURFACE_GRASS}, got ${String(op.surface)}`)
      }
      validateRect(spec.grid, op)
      const grid = cloneGrid(spec.grid)
      setSurface(grid, rectCells(grid, op), op.surface)
      return { ...spec, grid }
    }
    case 'reset':
      return seedIsland()
    default: {
      // Unknown op — untyped JSON (e.g. via the CLI) can carry an op outside the
      // union. The `never` assignment makes a forgotten case a COMPILE error; at
      // runtime this throws so the fold records an OpError instead of returning
      // undefined and poisoning `current`.
      const _exhaustive: never = op
      throw new Error(`unknown op: ${(_exhaustive as { op?: string })?.op ?? 'unrecognized'}`)
    }
  }
}

/** Fold ops over a spec. Never throws mid-batch; bad ops are skipped and recorded. */
export function applyOps(spec: IslandSpec, ops: Op[]): { spec: IslandSpec; errors: OpError[] } {
  let current = spec
  const errors: OpError[] = []
  ops.forEach((op, index) => {
    try {
      current = applyOne(current, op)
    } catch (e) {
      errors.push({
        index,
        op: (op as { op?: string } | null)?.op ?? 'unknown',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })
  try {
    validateSpecObject(current) // final gate; throws if the batch produced an invalid spec
  } catch (e) {
    errors.push({ index: -1, op: 'validate', message: e instanceof Error ? e.message : String(e) })
  }
  return { spec: current, errors }
}
