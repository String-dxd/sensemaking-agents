// Capsule lofts (plan 013), ported from meshkit.py capsule_along.
// A loft is a unit sphere grid warped along a path — either the single
// segment a→b (`capsuleGrid`) or a polyline of joints (`chainCapsuleGrid`) —
// with a tapered, optionally bulged/plump radius: the AC limb shape. Both
// pole ends can be opened (via gridToPiece) for ring-to-ring stitching; the
// wing keeps its tip capped.

import { type Grid, unitSphere } from './sphereGrid'
import { fullnessBoost } from './profiles'
import { type Vec3, v } from './surface'

export interface CapsuleOptions {
  a: Vec3
  b: Vec3
  radiusA: number
  radiusB: number
  useg?: number
  vseg?: number
  bulge?: number
  fullness?: number
}

/** Build a capsule grid (unit sphere warped along a→b). Topology unchanged. */
export function capsuleGrid(opts: CapsuleOptions): Grid {
  const { a, b, radiusA, radiusB, useg = 12, vseg = 10, bulge = 0, fullness = 0 } = opts
  const grid = unitSphere(useg, vseg)
  const axisVec = v.sub(b, a)
  const length = v.len(axisVec) || 1e-9
  const axis = v.scale(axisVec, 1 / length)
  const up: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  const x = v.norm(v.cross(up, axis))
  const z = v.cross(axis, x)

  const n = grid.pos.length / 3
  for (let i = 0; i < n; i++) {
    const ux = grid.pos[i * 3]
    const uy = grid.pos[i * 3 + 1]
    const uz = grid.pos[i * 3 + 2]
    const t = grid.params[i * 2 + 1] // polar v01: 0 at a-pole, 1 at b-pole
    const r = radiusA + (radiusB - radiusA) * t + bulge * Math.sin(Math.PI * t)
    let rx = ux
    let rz = uz
    if (fullness > 0) {
      const mag = Math.hypot(ux, uz)
      const boost = fullnessBoost(mag, fullness)
      rx *= boost
      rz *= boost
    }
    const along = (uy * 0.5 + 0.5) * length
    grid.pos[i * 3] = a[0] + axis[0] * along + x[0] * (rx * r) + z[0] * (rz * r)
    grid.pos[i * 3 + 1] = a[1] + axis[1] * along + x[1] * (rx * r) + z[1] * (rz * r)
    grid.pos[i * 3 + 2] = a[2] + axis[2] * along + x[2] * (rx * r) + z[2] * (rz * r)
  }
  return grid
}

export interface ChainCapsuleOptions {
  /** Polyline waypoints (≥2). a-pole lands exactly on points[0], b-pole on points[last]. */
  points: Vec3[]
  /** Per-waypoint radius (same length as points), lerped along each segment. */
  radii: number[]
  useg?: number
  vseg?: number
  fullness?: number
}

/**
 * Loft a capsule along a POLYLINE of joints — the multi-segment sibling of
 * `capsuleGrid` (same unit-sphere topology, so `gridToPiece` openings and
 * `filletLimbIntoTorso` keep working; pass points[0]/points[last] as the
 * fillet's root/tip endpoints). The polar param t∈[0,1] maps LINEARLY to
 * arclength along the polyline, so a waypoint's along-chain param is simply
 * its cumulative arclength ÷ total — feed those params to `chainWeights`
 * splits and the loft bends exactly at its joints. Ring frames blend the
 * adjacent segment directions at each interior waypoint (averaged tangents,
 * lerped along the segment) so rings rotate smoothly instead of pinching.
 */
export function chainCapsuleGrid(opts: ChainCapsuleOptions): Grid {
  const { points, radii, useg = 12, vseg = 10, fullness = 0 } = opts
  if (points.length < 2) throw new Error('chainCapsuleGrid: need at least 2 waypoints')
  if (radii.length !== points.length) throw new Error('chainCapsuleGrid: radii/points length mismatch')
  const grid = unitSphere(useg, vseg)

  const nSeg = points.length - 1
  const segDir: Vec3[] = []
  const cum: number[] = [0]
  for (let s = 0; s < nSeg; s++) {
    const d = v.sub(points[s + 1], points[s])
    const l = v.len(d) || 1e-9
    segDir.push(v.scale(d, 1 / l))
    cum.push(cum[s] + l)
  }
  const total = cum[nSeg] || 1e-9
  // per-waypoint tangents: segment dirs at the ends, averaged at interior
  // joints — lerping between them gives a smoothly-rotating frame axis
  const tangents: Vec3[] = [segDir[0]]
  for (let k = 1; k < nSeg; k++) tangents.push(v.norm(v.add(segDir[k - 1], segDir[k])))
  tangents.push(segDir[nSeg - 1])
  // one stable reference up for the whole chain (from the chord) so the ring
  // frame never flips sign between neighbouring rings
  const chord = v.norm(v.sub(points[points.length - 1], points[0]))
  const up: Vec3 = Math.abs(chord[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]

  const n = grid.pos.length / 3
  for (let i = 0; i < n; i++) {
    const ux = grid.pos[i * 3]
    const uz = grid.pos[i * 3 + 2]
    const t = grid.params[i * 2 + 1] // polar v01: 0 at a-pole, 1 at b-pole
    const s = Math.min(Math.max(t, 0), 1) * total
    let k = nSeg - 1
    for (let q = 0; q < nSeg; q++) {
      if (s <= cum[q + 1]) {
        k = q
        break
      }
    }
    const f = (s - cum[k]) / Math.max(cum[k + 1] - cum[k], 1e-9)
    const p = v.add(points[k], v.scale(v.sub(points[k + 1], points[k]), f))
    const axis = v.norm(v.add(v.scale(tangents[k], 1 - f), v.scale(tangents[k + 1], f)))
    const x = v.norm(v.cross(up, axis))
    const z = v.cross(axis, x)
    const r = radii[k] + (radii[k + 1] - radii[k]) * f
    let rx = ux
    let rz = uz
    if (fullness > 0) {
      const mag = Math.hypot(ux, uz)
      const boost = fullnessBoost(mag, fullness)
      rx *= boost
      rz *= boost
    }
    grid.pos[i * 3] = p[0] + x[0] * (rx * r) + z[0] * (rz * r)
    grid.pos[i * 3 + 1] = p[1] + x[1] * (rx * r) + z[1] * (rz * r)
    grid.pos[i * 3 + 2] = p[2] + x[2] * (rx * r) + z[2] * (rz * r)
  }
  return grid
}
