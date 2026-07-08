// Polyline bending (plan 013), ported from meshkit.py smooth_path / bend_chain.
// Straight-authored shell verts (along +Y from an origin, extent `length`) are
// bent along a Catmull-Rom-smoothed polyline with parallel-transport frames —
// curled tails and drooping ears without cross-section twist kinks. Pure math,
// mutates the flat position array in place.

import { type Vec3, v } from './surface'

/** Catmull-Rom resample of a coarse polyline into `samples` points. */
export function smoothPath(points: Vec3[], samples = 32): Vec3[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1], p[2]])
  const ctrl = [points[0], ...points, points[points.length - 1]]
  const out: Vec3[] = []
  const perSeg = Math.max(2, Math.floor(samples / (points.length - 1)))
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = ctrl[i]
    const p1 = ctrl[i + 1]
    const p2 = ctrl[i + 2]
    const p3 = ctrl[i + 3]
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        0.5 * (2 * p1[2] + (-p0[2] + p2[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3),
      ])
    }
  }
  out.push([...points[points.length - 1]] as unknown as Vec3)
  return out
}

/**
 * Bend flat positions (authored straight along +Y from `origin`, extent
 * `length`) along `points`. Each vert's park t = (y − origin.y)/length picks a
 * point + parallel-transport frame; the vert's x/z offset rides that frame.
 */
export function bendChain(pos: number[], origin: Vec3, length: number, points: Vec3[]): void {
  const seg: Vec3[] = []
  const segLen: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const s = v.sub(points[i + 1], points[i])
    seg.push(s)
    segLen.push(v.len(s))
  }
  const total = segLen.reduce((a, b) => a + b, 0) || 1e-9
  const cum = [0]
  for (const l of segLen) cum.push(cum[cum.length - 1] + l)
  for (let i = 0; i < cum.length; i++) cum[i] /= total

  const ups = seg.map((s, i) => v.scale(s, 1 / Math.max(segLen[i], 1e-9)))
  const up0 = ups[0]
  const ref: Vec3 = Math.abs(up0[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]
  let side = v.norm(v.cross(up0, ref))
  const frames: Array<[Vec3, Vec3]> = [[side, v.cross(side, up0)]]
  for (let k = 1; k < seg.length; k++) {
    const a = ups[k - 1]
    const b = ups[k]
    const axis0 = v.cross(a, b)
    const sMag = v.len(axis0)
    const c = Math.min(Math.max(v.dot(a, b), -1), 1)
    side = frames[frames.length - 1][0]
    if (sMag > 1e-9) {
      const axis = v.scale(axis0, 1 / sMag)
      const ang = Math.atan2(sMag, c)
      const term1 = v.scale(side, Math.cos(ang))
      const term2 = v.scale(v.cross(axis, side), Math.sin(ang))
      const term3 = v.scale(axis, v.dot(axis, side) * (1 - Math.cos(ang)))
      side = v.add(v.add(term1, term2), term3)
    }
    side = v.sub(side, v.scale(b, v.dot(side, b)))
    side = v.norm(side)
    frames.push([side, v.cross(side, b)])
  }

  const n = pos.length / 3
  for (let i = 0; i < n; i++) {
    const ti = Math.min(Math.max((pos[i * 3 + 1] - origin[1]) / Math.max(length, 1e-9), 0), 1)
    let k = 0
    while (k < cum.length - 1 && cum[k + 1] < ti) k++
    k = Math.min(Math.max(k, 0), seg.length - 1)
    const localT = (ti - cum[k]) / Math.max(cum[k + 1] - cum[k], 1e-9)
    const base = v.add(points[k], v.scale(seg[k], localT))
    const ox = pos[i * 3] - origin[0]
    const oz = pos[i * 3 + 2] - origin[2]
    const [sideF, fwdF] = frames[k]
    pos[i * 3] = base[0] + sideF[0] * ox + fwdF[0] * oz
    pos[i * 3 + 1] = base[1] + sideF[1] * ox + fwdF[1] * oz
    pos[i * 3 + 2] = base[2] + sideF[2] * ox + fwdF[2] * oz
  }
}
