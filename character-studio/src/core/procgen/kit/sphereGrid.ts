// Lat/long sphere grids + ring-opening extraction (plan 013), ported from
// meshkit.py sphere_shell/ellipsoid. A `Grid` is the shared quad topology
// (two pole fans + rings of wrap-closed quads) used by both ellipsoid shells
// and capsule lofts; `gridToPiece` triangulates it minus any removed caps,
// exposing the boundary rings as named loops for stitching.

import { type Profile } from './profiles'
import { type SurfacePiece, type Vec3 } from './surface'

export interface Grid {
  useg: number
  vseg: number
  /** Flat positions (3·n), mutated in place by transforms. */
  pos: number[]
  /** Flat params azimuth-u01/polar-v01 (2·n). */
  params: number[]
  bottomPole: number
  topPole: number
  /** Vertex index for ring∈[1,vseg-1], column c (wraps). */
  rv(ring: number, c: number): number
}

/** Unit sphere: bottom pole (v=0) + rings + top pole (v=1). meshkit sphere_shell. */
export function unitSphere(useg: number, vseg: number): Grid {
  const pos: number[] = []
  const params: number[] = []
  pos.push(0, -1, 0)
  params.push(0, 0)
  for (let ring = 1; ring < vseg; ring++) {
    const pol = (Math.PI * ring) / vseg
    const y = -Math.cos(pol)
    const r = Math.sin(pol)
    for (let c = 0; c < useg; c++) {
      const az = (2 * Math.PI * c) / useg
      pos.push(r * Math.sin(az), y, r * Math.cos(az))
      params.push(c / useg, ring / vseg)
    }
  }
  pos.push(0, 1, 0)
  params.push(0, 1)
  const topPole = pos.length / 3 - 1
  return {
    useg,
    vseg,
    pos,
    params,
    bottomPole: 0,
    topPole,
    rv: (ring, c) => 1 + (ring - 1) * useg + ((c % useg) + useg) % useg,
  }
}

/** Scale by radii about `center`, with optional profile + superellipse boxiness. */
export function ellipsoidTransform(
  grid: Grid,
  center: Vec3,
  radii: Vec3,
  profile?: Profile,
  boxiness = 0,
): void {
  const n = grid.pos.length / 3
  for (let i = 0; i < n; i++) {
    let x = grid.pos[i * 3]
    let z = grid.pos[i * 3 + 2]
    if (boxiness > 0) {
      const e = 2.0 / (1.0 - 0.55 * boxiness)
      const ax = Math.abs(x)
      const az = Math.abs(z)
      const rr = Math.hypot(ax, az)
      const se = (ax ** e + az ** e) ** (1.0 / e)
      const m = se > 1e-9 ? rr / se : 1.0
      x *= m
      z *= m
    }
    if (profile) {
      const mult = profile(grid.params[i * 2 + 1])
      x *= mult
      z *= mult
    }
    grid.pos[i * 3] = x * radii[0] + center[0]
    grid.pos[i * 3 + 1] = grid.pos[i * 3 + 1] * radii[1] + center[1]
    grid.pos[i * 3 + 2] = z * radii[2] + center[2]
  }
}

export type Opening =
  | { kind: 'poleBottom'; ring: number; loop: string }
  | { kind: 'poleTop'; ring: number; loop: string }
  | { kind: 'block'; ringLo: number; ringHi: number; colStart: number; colCount: number; loop: string }

/**
 * Triangulate a grid minus removed caps. Removed regions drop their faces
 * (interior verts become dead — harmless), and the ring bounding each removed
 * region is exposed as a named boundary loop (ordered for stitching).
 */
export function gridToPiece(name: string, grid: Grid, openings: Opening[] = []): SurfacePiece {
  const { useg, vseg, rv } = grid
  const n = grid.pos.length / 3
  const uv = new Array(n * 2).fill(0)
  const channels = new Array(n * 4).fill(0)

  // Which structural faces to drop.
  const dropBottomFan = openings.some((o) => o.kind === 'poleBottom')
  const dropTopFan = openings.some((o) => o.kind === 'poleTop')
  const bottomRing = openings.find((o) => o.kind === 'poleBottom') as
    | Extract<Opening, { kind: 'poleBottom' }>
    | undefined
  const topRing = openings.find((o) => o.kind === 'poleTop') as
    | Extract<Opening, { kind: 'poleTop' }>
    | undefined
  const blocks = openings.filter((o) => o.kind === 'block') as Extract<Opening, { kind: 'block' }>[]

  const inBlock = (q: number, c: number): Extract<Opening, { kind: 'block' }> | undefined => {
    for (const b of blocks) {
      if (q < b.ringLo || q >= b.ringHi) continue
      const rel = ((c - b.colStart) % useg + useg) % useg
      if (rel < b.colCount) return b
    }
    return undefined
  }

  const tris: number[] = []
  const pushQuad = (a: number, b: number, c2: number, d: number) => {
    tris.push(a, b, c2, a, c2, d)
  }

  // bottom fan
  if (!dropBottomFan) {
    for (let c = 0; c < useg; c++) tris.push(grid.bottomPole, rv(1, c + 1), rv(1, c))
  }
  // quad rings: q connects ring q → q+1
  for (let q = 1; q < vseg - 1; q++) {
    for (let c = 0; c < useg; c++) {
      if (bottomRing && q < bottomRing.ring) continue // opened below ring m
      if (topRing && q >= topRing.ring) continue // opened above ring m
      if (inBlock(q, c)) continue
      pushQuad(rv(q, c), rv(q, c + 1), rv(q + 1, c + 1), rv(q + 1, c))
    }
  }
  // top fan
  if (!dropTopFan) {
    for (let c = 0; c < useg; c++) tris.push(grid.topPole, rv(vseg - 1, c), rv(vseg - 1, c + 1))
  }

  const loops: Record<string, number[]> = {}
  if (bottomRing) loops[bottomRing.loop] = ringLoop(rv, bottomRing.ring, useg)
  if (topRing) loops[topRing.loop] = ringLoop(rv, topRing.ring, useg)
  for (const b of blocks) loops[b.loop] = blockPerimeter(rv, b, useg)

  return {
    name,
    pos: grid.pos.slice(),
    uv,
    tris,
    params: grid.params.slice(),
    loops,
    weights: new Map(),
    channels,
  }
}

function ringLoop(rv: Grid['rv'], ring: number, useg: number): number[] {
  const loop: number[] = []
  for (let c = 0; c < useg; c++) loop.push(rv(ring, c))
  return loop
}

/** Ordered perimeter of a removed rectangular block (rings ringLo..ringHi). */
function blockPerimeter(rv: Grid['rv'], b: Extract<Opening, { kind: 'block' }>, _useg: number): number[] {
  const { ringLo, ringHi, colStart, colCount } = b
  const loop: number[] = []
  // bottom edge (ringLo): colStart .. colStart+colCount
  for (let c = colStart; c < colStart + colCount; c++) loop.push(rv(ringLo, c))
  // right edge (col = colStart+colCount): ringLo .. ringHi
  for (let q = ringLo; q < ringHi; q++) loop.push(rv(q, colStart + colCount))
  // top edge (ringHi): colStart+colCount .. colStart (descending)
  for (let c = colStart + colCount; c > colStart; c--) loop.push(rv(ringHi, c))
  // left edge (col = colStart): ringHi .. ringLo (descending)
  for (let q = ringHi; q > ringLo; q--) loop.push(rv(q, colStart))
  return loop
}
