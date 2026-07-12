// v5 spec serialization + validation. Keeps the accepts-old-versions-normalizes-
// to-current contract: v1/v2 files are validated by the legacy module and migrated
// (rasterized) to a grid on load; v3 files migrate forward with an empty objects
// layer; v4 files validate their objects array; both v3 and v4 have their surface
// layer's dirt-path paint cleared (v5 repurposes that code to mean grass); v5
// files validate objects and keep their surface as-is. NO three/r3f imports.
//
// Sole serialization/validation module since the Step 9 cutover (the legacy
// validator lives in terrain/legacy/specV2.ts, imported only from here and seed).

import { rasterizeV2ToGrid, validateSpecV2Object } from '../terrain/legacy/specV2'
import {
  CURRENT_SPEC_VERSION,
  DEFAULT_TIER_HEIGHTS,
  GRID_COLS,
  GRID_ROWS,
  type IslandSpec,
  LEGACY_DEFAULT_TIER_HEIGHTS,
  MAX_TIER,
  LEGACY_OBJECT_KINDS,
  type ObjectKind,
  OBJECT_KINDS,
  type PlacedObject,
  SURFACE_AUTO,
  SURFACE_GRASS,
  type TerrainGrid,
} from '../terrain/terrainGrid'
import { decodeGrid, encodeGrid } from './gridCodec'

// ── Serialize ────────────────────────────────────────────────────────────────

export function serializeSpec(spec: IslandSpec): string {
  return JSON.stringify(
    {
      version: CURRENT_SPEC_VERSION,
      worldSize: spec.worldSize,
      seaLevel: spec.seaLevel,
      tierHeights: spec.tierHeights,
      grid: encodeGrid(spec.grid),
      // Plain array — placed objects are all primitives, no special encoding.
      objects: spec.objects,
    },
    null,
    2,
  )
}

// ── Validate + Deserialize ───────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

/** Validate a numeric (in-memory) TerrainGrid; throws with field-level messages. */
function validateNumericGrid(g: Record<string, unknown>): TerrainGrid {
  const { cols, rows } = g
  if (typeof cols !== 'number' || !Number.isInteger(cols) || cols < 1) {
    throw new Error(`Invalid grid: cols must be a positive integer, got ${String(cols)}`)
  }
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 1) {
    throw new Error(`Invalid grid: rows must be a positive integer, got ${String(rows)}`)
  }
  const n = cols * rows
  const check = (arr: unknown, field: string, maxCode: number): number[] => {
    if (!Array.isArray(arr) || arr.length !== n) {
      throw new Error(`Invalid grid: ${field} must be a numeric array of length ${n}`)
    }
    for (const v of arr) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > maxCode) {
        throw new Error(`Invalid grid: ${field} entries must be integers 0..${maxCode}`)
      }
    }
    return (arr as number[]).slice()
  }
  return { cols, rows, tiers: check(g.tiers, 'tiers', MAX_TIER), surface: check(g.surface, 'surface', SURFACE_GRASS) }
}

/** Accept either a serialized grid (digit-string rows) or an in-memory numeric
 *  grid — `validateSpecObject` runs both on parsed JSON (from deserialize) and on
 *  in-memory specs (the applyOps final gate). */
function toGrid(input: unknown): TerrainGrid {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid grid: must be an object')
  const o = input as Record<string, unknown>
  if (Array.isArray(o.tiers) && (o.tiers.length === 0 || typeof o.tiers[0] === 'string')) {
    return decodeGrid(o) // serialized digit-string rows
  }
  return validateNumericGrid(o)
}

function validateTierHeights(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length !== MAX_TIER + 1) return false
  for (let i = 0; i < v.length; i++) {
    if (!isFiniteNumber(v[i])) return false
    if (i > 0 && v[i] <= v[i - 1]) return false // strictly ascending
  }
  return true
}

/** Validate a serialized `objects` array (v4). Each entry is field-validated and
 *  throws with an index+field message on failure — matching the file's grid
 *  validation style. Cells are range-checked against the (already-parsed) grid. */
function validateObjects(input: unknown, grid: TerrainGrid): PlacedObject[] {
  if (!Array.isArray(input)) {
    throw new Error('Invalid island spec: objects must be an array')
  }
  return input.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Invalid island spec: objects[${i}] must be an object`)
    }
    const o = raw as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id.length === 0) {
      throw new Error(`Invalid island spec: objects[${i}].id must be a non-empty string`)
    }
    // Retired kinds (fruitTree/pine/palm) migrate to `tree` rather than throwing.
    const kind = (LEGACY_OBJECT_KINDS[o.kind as string] ?? o.kind) as ObjectKind
    if (typeof o.kind !== 'string' || !OBJECT_KINDS.includes(kind)) {
      throw new Error(`Invalid island spec: objects[${i}].kind must be one of ${OBJECT_KINDS.join(', ')}`)
    }
    if (!Number.isInteger(o.c) || (o.c as number) < 0 || (o.c as number) >= grid.cols) {
      throw new Error(`Invalid island spec: objects[${i}].c must be an integer in [0, ${grid.cols})`)
    }
    if (!Number.isInteger(o.r) || (o.r as number) < 0 || (o.r as number) >= grid.rows) {
      throw new Error(`Invalid island spec: objects[${i}].r must be an integer in [0, ${grid.rows})`)
    }
    if (!isFiniteNumber(o.yaw)) {
      throw new Error(`Invalid island spec: objects[${i}].yaw must be a finite number`)
    }
    if (!isFiniteNumber(o.scale) || (o.scale as number) <= 0) {
      throw new Error(`Invalid island spec: objects[${i}].scale must be a finite number > 0`)
    }
    return { id: o.id, kind, c: o.c as number, r: o.r as number, yaw: o.yaw, scale: o.scale }
  })
}

/** Validate an already-parsed value as an IslandSpec, migrating v1/v2/v3/v4 → v5.
 *  v1/v2 rasterize to the grid AND get `objects: []`; v3 gets `objects: []`; v4
 *  and v5 validate their `objects`. Surface code 1 meant the now-removed path
 *  tool through v4 and now means "painted grass" (v5) — a ≤v4 file's painted
 *  surface encoded a feature that no longer exists, so it is cleared to
 *  SURFACE_AUTO on migration (tiers and objects are untouched); v5 files keep
 *  their surface as-is. Throws with a field-level message on failure. */
export function validateSpecObject(parsed: unknown): IslandSpec {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid island spec: root must be an object')
  }
  const o = parsed as Record<string, unknown>

  if (o.version === 1 || o.version === 2) {
    // Legacy file: validate the v2 shape, then rasterize onto a fresh grid.
    const v2 = validateSpecV2Object(parsed)
    return {
      version: CURRENT_SPEC_VERSION,
      worldSize: v2.worldSize,
      seaLevel: v2.heightProfile.seaLevel,
      tierHeights: DEFAULT_TIER_HEIGHTS.slice(),
      grid: rasterizeV2ToGrid(v2, GRID_COLS, GRID_ROWS),
      objects: [],
    }
  }

  if (o.version !== 3 && o.version !== 4 && o.version !== CURRENT_SPEC_VERSION) {
    throw new Error(
      `Invalid island spec: version must be 1, 2, 3, 4, or ${CURRENT_SPEC_VERSION}, got ${String(o.version)}`,
    )
  }

  if (!isFiniteNumber(o.worldSize) || (o.worldSize as number) <= 0) {
    throw new Error('Invalid island spec: worldSize must be a finite number > 0')
  }
  if (!isFiniteNumber(o.seaLevel)) {
    throw new Error('Invalid island spec: seaLevel must be a finite number')
  }
  if (!validateTierHeights(o.tierHeights)) {
    throw new Error(
      `Invalid island spec: tierHeights must be a strictly-ascending finite array of length ${MAX_TIER + 1}`,
    )
  }

  // toGrid throws its own field-level messages on a bad grid.
  const grid = toGrid(o.grid)
  // Surface code 1 meant the now-removed path tool through v4; an island saved
  // yesterday must still open, so ≤v4 paint silently disappears (tiers and
  // objects are untouched) rather than being reinterpreted as grass. v5 files
  // keep their surface as painted — grass survives its own round-trip.
  if (o.version === 3 || o.version === 4) {
    grid.surface = grid.surface.map(() => SURFACE_AUTO)
  }
  // v3 migrates forward with an empty objects layer; v4 and v5 validate theirs.
  const objects = o.version !== 3 ? validateObjects(o.objects, grid) : []

  // Specs saved before the 2026-07-12 beach lowering carry the old default
  // heights; rewrite exactly that array to the current defaults so autosaved
  // islands pick up the retuned shoreline. Custom heights pass through as-is.
  const th = o.tierHeights as number[]
  const isLegacyDefault =
    th.length === LEGACY_DEFAULT_TIER_HEIGHTS.length &&
    th.every((v, i) => v === LEGACY_DEFAULT_TIER_HEIGHTS[i])
  const tierHeights = isLegacyDefault ? DEFAULT_TIER_HEIGHTS.slice() : th.slice()

  return {
    version: CURRENT_SPEC_VERSION,
    worldSize: o.worldSize,
    seaLevel: o.seaLevel,
    tierHeights,
    grid,
    objects,
  }
}

export function deserializeSpec(json: string): IslandSpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid island spec: malformed JSON')
  }
  return validateSpecObject(parsed)
}

// ── Download (browser-only) ──────────────────────────────────────────────────

export function downloadSpec(spec: IslandSpec, filename?: string): void {
  const json = serializeSpec(spec)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const name = filename ?? `island-${Date.now()}.json`
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// ── Import (browser-only) ────────────────────────────────────────────────────

export function importSpecFromFile(file: File): Promise<IslandSpec> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        reject(new Error('Failed to read file: result is not a string'))
        return
      }
      try {
        resolve(deserializeSpec(text))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    reader.readAsText(file)
  })
}
