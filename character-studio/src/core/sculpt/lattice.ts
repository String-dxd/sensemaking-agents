// Trivariate Bernstein free-form deformation (plan 009, step 5) —
// Sederberg & Parry 1986, implemented from the paper's formula (no
// maintained three.js FFD lib exists — plan 000 §2.4). Pure math, no three.
//
// A lattice is an l×m×n grid of control points spanning a box. A point p
// inside the box has normalized coordinates (s,t,u) ∈ [0,1]³ and deforms to
//
//   X(s,t,u) = Σᵢ Σⱼ Σₖ  Bᵢˡ⁻¹(s) · Bⱼᵐ⁻¹(t) · Bₖⁿ⁻¹(u) · P_ijk
//
// with Bernstein polynomials B. With control points at their grid positions
// the map is the identity (partition of unity + linear precision), so an
// untouched lattice bakes a zero delta. Points outside the box are not
// bound and never move.
//
// The Bernstein weights depend only on the ORIGINAL (s,t,u) — constant for
// the whole lattice session — so binding precomputes k×(l·m·n) weights once
// and each control-point drag is a dense weighted sum (36 madds/vertex at
// the default 3×4×3).

export interface Lattice {
  /** Box minimum (the lattice's coordinate space — world in the studio). */
  origin: [number, number, number]
  /** Box extents (> 0 on every axis). */
  size: [number, number, number]
  /** Control points per axis, ≥ 2 each. Default [3, 4, 3]. */
  resolution: [number, number, number]
  /** Control point positions, flat 3·(l·m·n), x-fastest (i + l·(j + m·k)). */
  points: Float32Array
}

export const DEFAULT_LATTICE_RESOLUTION: [number, number, number] = [3, 4, 3]

export function latticePointIndex(lattice: Lattice, i: number, j: number, k: number): number {
  const [l, m] = lattice.resolution
  return i + l * (j + m * k)
}

export function createLattice(
  bbox: { min: [number, number, number]; max: [number, number, number] },
  resolution: [number, number, number] = DEFAULT_LATTICE_RESOLUTION,
): Lattice {
  const [l, m, n] = resolution
  if (l < 2 || m < 2 || n < 2) throw new Error(`createLattice: resolution must be ≥ 2 per axis, got ${resolution}`)
  const origin: [number, number, number] = [...bbox.min]
  const size: [number, number, number] = [
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2],
  ]
  if (size.some((s) => s <= 0)) throw new Error('createLattice: degenerate bounding box')
  const points = new Float32Array(l * m * n * 3)
  let w = 0
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < l; i++) {
        points[w++] = origin[0] + (size[0] * i) / (l - 1)
        points[w++] = origin[1] + (size[1] * j) / (m - 1)
        points[w++] = origin[2] + (size[2] * k) / (n - 1)
      }
    }
  }
  return { origin, size, resolution: [l, m, n], points }
}

function binomial(n: number, i: number): number {
  let out = 1
  for (let k = 0; k < i; k++) out = (out * (n - k)) / (k + 1)
  return out
}

/** Bernstein basis Bᵢⁿ(t) = C(n,i)·tⁱ·(1−t)ⁿ⁻ⁱ. */
export function bernstein(n: number, i: number, t: number): number {
  return binomial(n, i) * t ** i * (1 - t) ** (n - i)
}

export interface LatticeBinding {
  /** Indices (into the caller's point list) that fall inside the lattice. */
  boundIndices: Uint32Array
  /** Bernstein weights, boundIndices.length × (l·m·n), control-point order. */
  weights: Float32Array
}

/**
 * Precompute Bernstein weights for every point inside the lattice box.
 * `positions` is a flat 3·N array in the lattice's coordinate space.
 */
export function bindToLattice(lattice: Lattice, positions: Float32Array, epsilon = 1e-6): LatticeBinding {
  const [l, m, n] = lattice.resolution
  const { origin, size } = lattice
  const bound: number[] = []
  const weightRows: number[] = []

  const bs = new Float64Array(l)
  const bt = new Float64Array(m)
  const bu = new Float64Array(n)

  for (let p = 0; p < positions.length / 3; p++) {
    const s = (positions[p * 3] - origin[0]) / size[0]
    const t = (positions[p * 3 + 1] - origin[1]) / size[1]
    const u = (positions[p * 3 + 2] - origin[2]) / size[2]
    if (s < -epsilon || s > 1 + epsilon || t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) continue
    const sc = Math.min(Math.max(s, 0), 1)
    const tc = Math.min(Math.max(t, 0), 1)
    const uc = Math.min(Math.max(u, 0), 1)
    for (let i = 0; i < l; i++) bs[i] = bernstein(l - 1, i, sc)
    for (let j = 0; j < m; j++) bt[j] = bernstein(m - 1, j, tc)
    for (let k = 0; k < n; k++) bu[k] = bernstein(n - 1, k, uc)
    bound.push(p)
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < m; j++) {
        const bjk = bt[j] * bu[k]
        for (let i = 0; i < l; i++) weightRows.push(bs[i] * bjk)
      }
    }
  }

  // weights rows are bound-point-major, (l·m·n) entries each
  return { boundIndices: Uint32Array.from(bound), weights: Float32Array.from(weightRows) }
}

/**
 * Evaluate the FFD for every bound point: out[3·r] = Σ w_r,cp · P_cp.
 * Returns a fresh 3·boundIndices.length array of deformed positions.
 */
export function evaluateLattice(lattice: Lattice, binding: LatticeBinding): Float32Array {
  const cpCount = lattice.points.length / 3
  const { boundIndices, weights } = binding
  const out = new Float32Array(boundIndices.length * 3)
  const points = lattice.points
  for (let r = 0; r < boundIndices.length; r++) {
    let x = 0
    let y = 0
    let z = 0
    const row = r * cpCount
    for (let c = 0; c < cpCount; c++) {
      const w = weights[row + c]
      if (w === 0) continue
      x += w * points[c * 3]
      y += w * points[c * 3 + 1]
      z += w * points[c * 3 + 2]
    }
    out[r * 3] = x
    out[r * 3 + 1] = y
    out[r * 3 + 2] = z
  }
  return out
}
