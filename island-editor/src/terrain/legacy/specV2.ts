// Legacy v1/v2 island spec — a SELF-CONTAINED copy of the deleted `islandSpec.ts`
// / `reliefCodec.ts` / v2 validator, kept ONLY so `specIO.ts` can open and migrate
// old files (exports, localStorage autosaves, the historical seed) to the v3 grid.
// Renamed with a `V2` suffix where names collide with `terrainGrid.ts`
// (`IslandSpec` → `IslandSpecV2`, `evaluateHeight` → `evaluateHeightV2`).
//
// IMPORT RULE: only `editor/specIO.ts` and `terrain/seed.ts` may import this
// module. It is dead weight everywhere else. NO three/r3f imports.

import {
  cellCenter,
  createOceanGrid,
  LEGACY_DEFAULT_TIER_HEIGHTS,
  MAX_TIER,
  SURFACE_AUTO,
  type TerrainGrid,
} from '../terrainGrid'

export interface Vec2 {
  x: number
  z: number
}

export interface HeightProfile {
  seaLevel: number
  plateauHeight: number
  coastFalloff: number
  cliffSteepness: number
  seafloorDepth: number
}

export interface ReliefGrid {
  resolution: number
  data: number[]
}

export interface IslandSpecV2 {
  version: 2
  worldSize: number
  coastline: Vec2[]
  heightProfile: HeightProfile
  relief: ReliefGrid
}

// ── Coastline curve ─────────────────────────────────────────────────────────

/** Catmull-Rom on a closed loop, sampled into a dense polygon. */
export function sampleCoastline(points: Vec2[], perSpan = 12): Vec2[] {
  const n = points.length
  if (n < 3) return points.slice()
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan
      out.push(catmullRom(p0, p1, p2, p3, t))
    }
  }
  return out
}

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t
  const t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) }
}

// ── Geometry queries (operate on the sampled polygon) ────────────────────────

/** Even-odd ray-cast point-in-polygon. */
export function isInsidePolygon(poly: Vec2[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersects = a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

/** Unsigned distance from (x,z) to the nearest polygon edge. */
export function distanceToPolygon(poly: Vec2[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegment(x, z, poly[j], poly[i]))
  }
  return best
}

function distToSegment(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cz = a.z + t * dz
  return Math.hypot(px - cx, pz - cz)
}

// ── Height evaluation ────────────────────────────────────────────────────────

function cliffEase(t: number, steepness: number): number {
  const k = 1 / (1 + steepness * 4)
  return Math.pow(Math.max(0, Math.min(1, t)), k)
}

/** Analytic base height from coastline + profile (no relief). */
export function baseHeightAt(profile: HeightProfile, inside: boolean, distToCoast: number): number {
  const { seaLevel, plateauHeight, coastFalloff, cliffSteepness, seafloorDepth } = profile
  if (inside) {
    const t = cliffEase(distToCoast / coastFalloff, cliffSteepness)
    return seaLevel + (plateauHeight - seaLevel) * t
  }
  const t = Math.max(0, Math.min(1, distToCoast / coastFalloff))
  return seaLevel + (seafloorDepth - seaLevel) * t
}

/** Bilinear sample of the relief grid over the world bounds. */
export function reliefAt(spec: IslandSpecV2, x: number, z: number): number {
  const { resolution, data } = spec.relief
  if (resolution < 2 || data.length < resolution * resolution) return 0
  const half = spec.worldSize / 2
  const u = ((x + half) / spec.worldSize) * (resolution - 1)
  const v = ((z + half) / spec.worldSize) * (resolution - 1)
  if (u < 0 || v < 0 || u > resolution - 1 || v > resolution - 1) return 0
  const x0 = Math.floor(u)
  const z0 = Math.floor(v)
  const x1 = Math.min(x0 + 1, resolution - 1)
  const z1 = Math.min(z0 + 1, resolution - 1)
  const fx = u - x0
  const fz = v - z0
  const h00 = data[z0 * resolution + x0]
  const h10 = data[z0 * resolution + x1]
  const h01 = data[z1 * resolution + x0]
  const h11 = data[z1 * resolution + x1]
  const a = h00 + (h10 - h00) * fx
  const b = h01 + (h11 - h01) * fx
  return a + (b - a) * fz
}

/** Final terrain height = analytic base + sculpt relief (relief applied on land). */
export function evaluateHeightV2(spec: IslandSpecV2, x: number, z: number): number {
  const poly = sampleCoastline(spec.coastline)
  const inside = isInsidePolygon(poly, x, z)
  const d = distanceToPolygon(poly, x, z)
  const base = baseHeightAt(spec.heightProfile, inside, d)
  return inside ? base + reliefAt(spec, x, z) : base
}

// ── Seed silhouette (copied from the deleted islandSpec.ts) ───────────────────

const SEED_BASE_RADIUS = 5.0

function silhouetteAt(theta: number): number {
  return (
    1.0 +
    Math.sin(theta * 2.0 + 0.7) * 0.13 +
    Math.sin(theta * 3.0 - 1.3) * 0.07 +
    Math.sin(theta * 5.0 + 2.1) * 0.04 +
    Math.sin(theta * 7.0 - 0.4) * 0.018 +
    Math.sin(theta * 9.0 + 1.8) * 0.012
  )
}

/** Build the historical v2 spec by sampling the original island silhouette. */
export function seedV2(controlPoints = 24, reliefResolution = 192): IslandSpecV2 {
  const coastline: Vec2[] = []
  for (let i = 0; i < controlPoints; i++) {
    const theta = (i / controlPoints) * Math.PI * 2
    const r = SEED_BASE_RADIUS * silhouetteAt(theta)
    coastline.push({ x: r * Math.cos(theta), z: r * Math.sin(theta) })
  }
  return {
    version: 2,
    worldSize: 24,
    coastline,
    heightProfile: {
      seaLevel: 0,
      plateauHeight: 1.0,
      coastFalloff: 2.0,
      cliffSteepness: 0.45,
      seafloorDepth: -1.2,
    },
    relief: {
      resolution: reliefResolution,
      data: new Array(reliefResolution * reliefResolution).fill(0),
    },
  }
}

// ── Sparse relief decode (copied from the deleted reliefCodec.ts) ─────────────

interface SparseRelief {
  resolution: number
  encoding: 'sparse'
  entries: { i: number; h: number }[]
}

type SerializedRelief = ReliefGrid | SparseRelief

function isSparseRelief(r: unknown): r is SparseRelief {
  return typeof r === 'object' && r !== null && (r as { encoding?: unknown }).encoding === 'sparse'
}

/** Expand any serialized relief back to a dense grid. Dense input is cloned. */
function decodeRelief(serialized: SerializedRelief): ReliefGrid {
  if (isSparseRelief(serialized)) {
    const data = new Array(serialized.resolution * serialized.resolution).fill(0)
    for (const { i, h } of serialized.entries) {
      if (i >= 0 && i < data.length) data[i] = h
    }
    return { resolution: serialized.resolution, data }
  }
  return { resolution: serialized.resolution, data: serialized.data.slice() }
}

// ── v1/v2 shape validator (copied from the deleted exportSpec.ts:61-109) ──────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function validateVec2(v: unknown): v is Vec2 {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.x === 'number' && isFinite(o.x) && typeof o.z === 'number' && isFinite(o.z)
}

function validateHeightProfile(v: unknown): v is HeightProfile {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isFiniteNumber(o.seaLevel) &&
    isFiniteNumber(o.plateauHeight) &&
    isFiniteNumber(o.coastFalloff) &&
    isFiniteNumber(o.cliffSteepness) &&
    isFiniteNumber(o.seafloorDepth)
  )
}

function validateRelief(v: unknown): v is SerializedRelief {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (!isFiniteNumber(o.resolution) || !Number.isInteger(o.resolution) || (o.resolution as number) < 2) {
    return false
  }
  const cells = (o.resolution as number) * (o.resolution as number)
  if (isSparseRelief(v)) {
    if (!Array.isArray(o.entries)) return false
    return (o.entries as unknown[]).every((e) => {
      if (typeof e !== 'object' || e === null) return false
      const cell = e as Record<string, unknown>
      return (
        isFiniteNumber(cell.i) &&
        Number.isInteger(cell.i) &&
        (cell.i as number) >= 0 &&
        (cell.i as number) < cells &&
        isFiniteNumber(cell.h)
      )
    })
  }
  if (!Array.isArray(o.data)) return false
  if (o.data.length !== cells) return false
  return (o.data as unknown[]).every((d) => isFiniteNumber(d))
}

/** Validate a parsed v1/v2 object and return a dense IslandSpecV2; throws with a
 *  field-level message on failure. */
export function validateSpecV2Object(parsed: unknown): IslandSpecV2 {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid island spec: root must be an object')
  }
  const o = parsed as Record<string, unknown>

  if (o.version !== 1 && o.version !== 2) {
    throw new Error(`Invalid island spec: version must be 1 or 2, got ${String(o.version)}`)
  }
  if (!isFiniteNumber(o.worldSize)) {
    throw new Error('Invalid island spec: worldSize must be a finite number')
  }
  if (!Array.isArray(o.coastline) || o.coastline.length < 3) {
    throw new Error(
      `Invalid island spec: coastline must be an array of at least 3 points, got ${Array.isArray(o.coastline) ? o.coastline.length : typeof o.coastline}`,
    )
  }
  for (let i = 0; i < (o.coastline as unknown[]).length; i++) {
    if (!validateVec2((o.coastline as unknown[])[i])) {
      throw new Error(`Invalid island spec: coastline[${i}] must be {x: number, z: number}`)
    }
  }
  if (!validateHeightProfile(o.heightProfile)) {
    throw new Error(
      'Invalid island spec: heightProfile must have finite numeric fields seaLevel, plateauHeight, coastFalloff, cliffSteepness, seafloorDepth',
    )
  }
  if (!validateRelief(o.relief)) {
    throw new Error('Invalid island spec: relief must have numeric resolution and data array of length resolution*resolution')
  }

  return {
    ...(parsed as object),
    version: 2,
    relief: decodeRelief(o.relief as SerializedRelief),
  } as IslandSpecV2
}

// ── Migration rasterizer ──────────────────────────────────────────────────────

/** Rasterize a (dense) v2 spec onto a fresh v3 grid: each cell center gets the
 *  nearest tier top of its legacy height, offshore cells forced to ocean. */
export function rasterizeV2ToGrid(v2: IslandSpecV2, cols: number, rows: number): TerrainGrid {
  const grid = createOceanGrid(cols, rows)
  const poly = sampleCoastline(v2.coastline) // hoisted out of the loop
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = cellCenter(v2.worldSize, grid, c, r)
      const inside = isInsidePolygon(poly, x, z)
      let tier = 0
      if (inside) {
        const d = distanceToPolygon(poly, x, z)
        const height = baseHeightAt(v2.heightProfile, true, d) + reliefAt(v2, x, z)
        tier = nearestTier(height)
      }
      grid.tiers[r * cols + c] = tier
      grid.surface[r * cols + c] = SURFACE_AUTO
    }
  }
  return grid
}

/** Index of the LEGACY_DEFAULT_TIER_HEIGHTS entry closest to `height`. The v2
 *  analytic profile was authored against those heights; pinning the mapping to
 *  them keeps v1/v2 rasterization (and the seed island's silhouette) stable
 *  when DEFAULT_TIER_HEIGHTS is retuned. */
function nearestTier(height: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i <= MAX_TIER; i++) {
    const d = Math.abs(height - LEGACY_DEFAULT_TIER_HEIGHTS[i])
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}
