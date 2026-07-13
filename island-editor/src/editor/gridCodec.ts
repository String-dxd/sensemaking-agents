// Serialize the v3 grid as arrays of digit strings (one string per row) — human-
// readable, git-diffable, agent-writable, ~4 KB per layer. Digits are the integer
// codes, capped at 9 (MAX_TIER = 4, fine). NO three/r3f imports.

import { MAX_TIER, SURFACE_GRASS, type TerrainGrid } from '../terrain/terrainGrid'

export interface SerializedGrid {
  cols: number
  rows: number
  /** length rows, each a string of `cols` digit chars (integer tier codes). */
  tiers: string[]
  /** length rows, each a string of `cols` digit chars (integer surface codes). */
  surface: string[]
}

function encodeLayer(values: number[], cols: number, rows: number): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    for (let c = 0; c < cols; c++) row += String(values[r * cols + c])
    out.push(row)
  }
  return out
}

export function encodeGrid(grid: TerrainGrid): SerializedGrid {
  return {
    cols: grid.cols,
    rows: grid.rows,
    tiers: encodeLayer(grid.tiers, grid.cols, grid.rows),
    surface: encodeLayer(grid.surface, grid.cols, grid.rows),
  }
}

function decodeLayer(rowsArr: unknown, cols: number, rows: number, field: string, maxDigit: number): number[] {
  if (!Array.isArray(rowsArr)) {
    throw new Error(`Invalid grid: ${field} must be an array of ${rows} row strings`)
  }
  if (rowsArr.length !== rows) {
    throw new Error(`Invalid grid: ${field} must have ${rows} rows, got ${rowsArr.length}`)
  }
  const values = new Array<number>(cols * rows)
  for (let r = 0; r < rows; r++) {
    const row = rowsArr[r]
    if (typeof row !== 'string') {
      throw new Error(`Invalid grid: ${field}[${r}] must be a string`)
    }
    if (row.length !== cols) {
      throw new Error(`Invalid grid: ${field}[${r}] must be ${cols} chars, got ${row.length}`)
    }
    for (let c = 0; c < cols; c++) {
      const ch = row[c]
      if (ch < '0' || ch > '9') {
        throw new Error(`Invalid grid: ${field}[${r}][${c}] is not a digit: ${JSON.stringify(ch)}`)
      }
      const digit = ch.charCodeAt(0) - 48
      if (digit > maxDigit) {
        throw new Error(`Invalid grid: ${field}[${r}][${c}] digit ${digit} exceeds max ${maxDigit}`)
      }
      values[r * cols + c] = digit
    }
  }
  return values
}

export function decodeGrid(serialized: unknown): TerrainGrid {
  if (typeof serialized !== 'object' || serialized === null) {
    throw new Error('Invalid grid: must be an object')
  }
  const o = serialized as Record<string, unknown>
  const { cols, rows } = o
  if (typeof cols !== 'number' || !Number.isInteger(cols) || cols < 1) {
    throw new Error(`Invalid grid: cols must be a positive integer, got ${String(cols)}`)
  }
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 1) {
    throw new Error(`Invalid grid: rows must be a positive integer, got ${String(rows)}`)
  }
  return {
    cols,
    rows,
    tiers: decodeLayer(o.tiers, cols, rows, 'tiers', MAX_TIER),
    surface: decodeLayer(o.surface, cols, rows, 'surface', SURFACE_GRASS),
  }
}
