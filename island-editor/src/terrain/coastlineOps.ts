import type { Vec2 } from './islandSpec'

/** Insert a midpoint on the edge points[index] → points[(index+1) % n]. Returns a NEW array. */
export function insertPointAfter(points: Vec2[], index: number): Vec2[] {
  const n = points.length
  if (n === 0) return points.slice()
  const i = ((index % n) + n) % n
  const a = points[i]
  const b = points[(i + 1) % n]
  const out = points.slice()
  out.splice(i + 1, 0, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })
  return out
}

/** Remove the point at index. No-op (returns a copy) if it would drop below 3 points. */
export function deletePoint(points: Vec2[], index: number): Vec2[] {
  if (points.length <= 3) return points.slice()
  const n = points.length
  const i = ((index % n) + n) % n
  const out = points.slice()
  out.splice(i, 1)
  return out
}

/** Move the point at index to next. Returns a NEW array; other points are reused. */
export function movePointTo(points: Vec2[], index: number, next: Vec2): Vec2[] {
  return points.map((p, i) => (i === index ? { x: next.x, z: next.z } : p))
}
