// Capsule-along-chain lofts (plan 013), ported from meshkit.py capsule_along.
// A loft is a unit sphere grid warped along the segment a→b with a tapered,
// optionally bulged/plump radius — the AC limb shape. Both pole ends can be
// opened (via gridToPiece) for ring-to-ring stitching; the wing keeps its tip
// capped.

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
