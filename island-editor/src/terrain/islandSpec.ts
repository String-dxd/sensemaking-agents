// Pure, framework-agnostic island shape model + evaluation.
// NO three/r3f imports here — this is the headless-testable core and the
// durable export artifact (the "island spec"). The renderer (r3f) and the
// eventual student-space migration both consume these same functions/data.

export interface Vec2 {
  x: number
  z: number
}

export interface HeightProfile {
  /** World Y of the waterline — the coast crosses through this height. */
  seaLevel: number
  /** World Y of the island interior, far from the coast. */
  plateauHeight: number
  /** Horizontal distance over which land rises from seaLevel to plateauHeight. */
  coastFalloff: number
  /** 0..1 — higher = sharper rise near the coast (cliff), lower = gentle beach. */
  cliffSteepness: number
  /** World Y the terrain sinks to offshore. */
  seafloorDepth: number
}

export interface ReliefGrid {
  /** N — the grid is N×N samples across the world bounds. */
  resolution: number
  /** length resolution², additive displacement applied on land. */
  data: number[]
}

export interface IslandSpec {
  version: 2
  /** Square world bounds: X and Z each span [-worldSize/2, worldSize/2]. */
  worldSize: number
  /** Ordered control points of the closed coastline curve. */
  coastline: Vec2[]
  heightProfile: HeightProfile
  relief: ReliefGrid
}

/** Current spec version (in-memory + the version `serializeSpec` writes). Bump
 *  when the format changes; `validateSpecObject` accepts this and all older
 *  versions and normalizes to it. Single source of truth — reference this
 *  instead of writing the literal `2` at each call site. */
export const CURRENT_SPEC_VERSION = 2

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
    const intersects =
      a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
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
  // steepness 0 → linear; →1 → rises fast near the coast.
  const k = 1 / (1 + steepness * 4)
  return Math.pow(Math.max(0, Math.min(1, t)), k)
}

/** Analytic base height from coastline + profile (no relief). */
export function baseHeightAt(
  profile: HeightProfile,
  inside: boolean,
  distToCoast: number,
): number {
  const { seaLevel, plateauHeight, coastFalloff, cliffSteepness, seafloorDepth } = profile
  if (inside) {
    const t = cliffEase(distToCoast / coastFalloff, cliffSteepness)
    return seaLevel + (plateauHeight - seaLevel) * t
  }
  const t = Math.max(0, Math.min(1, distToCoast / coastFalloff))
  return seaLevel + (seafloorDepth - seaLevel) * t
}

/** Bilinear sample of the relief grid over the world bounds. */
export function reliefAt(spec: IslandSpec, x: number, z: number): number {
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
export function evaluateHeight(spec: IslandSpec, x: number, z: number): number {
  const poly = sampleCoastline(spec.coastline)
  const inside = isInsidePolygon(poly, x, z)
  const d = distanceToPolygon(poly, x, z)
  const base = baseHeightAt(spec.heightProfile, inside, d)
  return inside ? base + reliefAt(spec, x, z) : base
}

/** Convenience: is a world point on land (inside the coastline)? */
export function isInside(spec: IslandSpec, x: number, z: number): boolean {
  return isInsidePolygon(sampleCoastline(spec.coastline), x, z)
}

// ── Seed: reproduce today's island ───────────────────────────────────────────

// The current student-space island silhouette (State/Island.js:31-39),
// copied (not imported) so this package stays self-contained and free of the
// three@0.149 boundary. radiusAtTheta = BASE_RADIUS * silhouetteAt(theta).
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

/** Build the default spec by sampling today's island silhouette + profile. */
export function seedFromCurrentIsland(controlPoints = 24, reliefResolution = 192): IslandSpec {
  const coastline: Vec2[] = []
  for (let i = 0; i < controlPoints; i++) {
    const theta = (i / controlPoints) * Math.PI * 2
    const r = SEED_BASE_RADIUS * silhouetteAt(theta)
    coastline.push({ x: r * Math.cos(theta), z: r * Math.sin(theta) })
  }
  return {
    version: CURRENT_SPEC_VERSION,
    worldSize: 24,
    coastline,
    heightProfile: {
      seaLevel: 0,
      plateauHeight: 1.0, // matches plateauTopY
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
