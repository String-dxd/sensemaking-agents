// Ported from island-editor/src/editor/specIO.ts — behavior kept in sync via
// shared test vectors (see terrainGrid.ts provenance note).
//
// Spec validation + (de)serialization. Accepts v3/v4/v5 and normalizes to v5;
// v3/v4 surface paint (the removed dirt-path tool) is cleared on migration.
// DELIBERATE DIVERGENCE from the editor: v1/v2 payloads are REJECTED instead of
// rasterized — the engine never sees pre-grid saves, so the legacy rasterizer
// (island-editor/src/terrain/legacy/specV2.ts) is not ported; rejection routes
// the loader to its frozen fallback (see Game/Data/islandSpec.ts). NO three
// imports.

import { decodeGrid, encodeGrid } from './gridCodec.ts'
import {
  CURRENT_SPEC_VERSION,
  DEFAULT_TIER_HEIGHTS,
  type IslandSpec,
  LEGACY_DEFAULT_TIER_HEIGHTS,
  LEGACY_OBJECT_KINDS,
  MAX_TIER,
  OBJECT_KINDS,
  type ObjectKind,
  type PlacedObject,
  SURFACE_AUTO,
  SURFACE_GRASS,
  type TerrainGrid,
} from './terrainGrid.ts'

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
  return typeof v === 'number' && Number.isFinite(v)
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
  return {
    cols,
    rows,
    tiers: check(g.tiers, 'tiers', MAX_TIER),
    surface: check(g.surface, 'surface', SURFACE_GRASS),
  }
}

/** Accept either a serialized grid (digit-string rows) or an in-memory numeric
 *  grid — `validateSpecObject` runs both on parsed JSON and in-memory specs. */
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
    if (i > 0 && (v[i] as number) <= (v[i - 1] as number)) return false // strictly ascending
  }
  return true
}

/** Validate a serialized `objects` array. Each entry is field-validated and
 *  throws with an index+field message on failure. Cells are range-checked
 *  against the (already-parsed) grid. Invariant enforced AFTER per-entry
 *  validation (normalize, don't throw): at most one `character` entry
 *  survives, the first if several are present. */
function validateObjects(input: unknown, grid: TerrainGrid): PlacedObject[] {
  if (!Array.isArray(input)) {
    throw new Error('Invalid island spec: objects must be an array')
  }
  const objects = input.map((raw: unknown, i): PlacedObject => {
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
    if (!isFiniteNumber(o.scale) || o.scale <= 0) {
      throw new Error(`Invalid island spec: objects[${i}].scale must be a finite number > 0`)
    }
    return { id: o.id, kind, c: o.c as number, r: o.r as number, yaw: o.yaw, scale: o.scale }
  })
  let seenCharacter = false
  return objects.filter((o) => {
    if (o.kind !== 'character') return true
    if (seenCharacter) return false // drop every character after the first
    seenCharacter = true
    return true
  })
}

/** Validate an already-parsed value as an IslandSpec, migrating v3/v4 → v5.
 *  v3 gets `objects: []`; v4 and v5 validate their `objects`. Surface code 1
 *  meant the removed path tool through v4 and now means "painted grass" (v5) —
 *  a ≤v4 file's paint is cleared to SURFACE_AUTO on migration; v5 files keep
 *  their surface as-is. v1/v2 (and unknown versions) throw — the engine's
 *  fallback path covers them. Throws with a field-level message on failure. */
export function validateSpecObject(parsed: unknown): IslandSpec {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid island spec: root must be an object')
  }
  const o = parsed as Record<string, unknown>

  if (o.version !== 3 && o.version !== 4 && o.version !== CURRENT_SPEC_VERSION) {
    throw new Error(
      `Invalid island spec: version must be 3, 4, or ${CURRENT_SPEC_VERSION}, got ${String(o.version)}`,
    )
  }

  if (!isFiniteNumber(o.worldSize) || o.worldSize <= 0) {
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
  // ≤v4 paint silently disappears (tiers and objects are untouched) rather
  // than being reinterpreted as grass. v5 files keep their painted surface.
  if (o.version === 3 || o.version === 4) {
    grid.surface = grid.surface.map(() => SURFACE_AUTO)
  }
  // v3 migrates forward with an empty objects layer; v4 and v5 validate theirs.
  const objects = o.version !== 3 ? validateObjects(o.objects, grid) : []

  // Specs saved before the editor's 2026-07-12 beach lowering carry the old
  // default heights; rewrite exactly that array to the current defaults so
  // saved islands pick up the retuned shoreline. Custom heights pass as-is.
  const th = o.tierHeights
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
