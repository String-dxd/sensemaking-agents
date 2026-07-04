// Sculpt brush kernels (plan 009, step 3) — SculptGL algorithm ports as
// PURE functions: weighted point sets in, displacement arrays out. No mesh,
// no scene, no React — the viewport tool (step 4) owns picking, coordinate
// transforms, mirroring, and command emission.
//
// Conventions: all inputs live in ONE consistent space (the tool works in
// world space; tests use identity-transform local space). `weights` are the
// soft-selection falloff (softSelect.ts). Displacements are ADDITIVE deltas,
// 3 components per point, same order as the input arrays.

export type BrushKind = 'grab' | 'inflate' | 'smooth' | 'pinch'

export const BRUSH_KINDS: readonly BrushKind[] = ['grab', 'inflate', 'smooth', 'pinch']

/** Grab: move every point by the drag vector × its weight (weight-1 points
 * follow the cursor exactly — SculptGL's translate brush). */
export function grabDisplacements(weights: Float32Array, drag: readonly [number, number, number]): Float32Array {
  const out = new Float32Array(weights.length * 3)
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]
    out[i * 3] = drag[0] * w
    out[i * 3 + 1] = drag[1] * w
    out[i * 3 + 2] = drag[2] * w
  }
  return out
}

/** Inflate: push along the point normal × strength × weight. `strength` is
 * signed meters at weight 1 (negative deflates). Normals need not be unit —
 * they are normalized here (skinned world normals arrive scaled). */
export function inflateDisplacements(weights: Float32Array, normals: Float32Array, strength: number): Float32Array {
  const out = new Float32Array(weights.length * 3)
  for (let i = 0; i < weights.length; i++) {
    const nx = normals[i * 3]
    const ny = normals[i * 3 + 1]
    const nz = normals[i * 3 + 2]
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const s = (strength * weights[i]) / len
    out[i * 3] = nx * s
    out[i * 3 + 1] = ny * s
    out[i * 3 + 2] = nz * s
  }
  return out
}

/** Smooth: Laplacian relax — move each point toward its neighbor centroid
 * by strength × weight (strength ∈ (0,1] is the relax fraction per
 * application; repeated application converges instead of overshooting). */
export function smoothDisplacements(
  positions: Float32Array,
  neighborCentroids: Float32Array,
  weights: Float32Array,
  strength: number,
): Float32Array {
  const out = new Float32Array(weights.length * 3)
  const s = Math.min(Math.max(strength, 0), 1)
  for (let i = 0; i < weights.length; i++) {
    const k = s * weights[i]
    out[i * 3] = (neighborCentroids[i * 3] - positions[i * 3]) * k
    out[i * 3 + 1] = (neighborCentroids[i * 3 + 1] - positions[i * 3 + 1]) * k
    out[i * 3 + 2] = (neighborCentroids[i * 3 + 2] - positions[i * 3 + 2]) * k
  }
  return out
}

/** Pinch: pull points toward the brush center TANGENTIALLY (the normal
 * component of the pull is removed so the surface gathers instead of
 * denting — SculptGL's pinch). `strength` is the pull fraction at weight 1;
 * negative spreads. */
export function pinchDisplacements(
  positions: Float32Array,
  normals: Float32Array,
  weights: Float32Array,
  center: readonly [number, number, number],
  strength: number,
): Float32Array {
  const out = new Float32Array(weights.length * 3)
  for (let i = 0; i < weights.length; i++) {
    let vx = center[0] - positions[i * 3]
    let vy = center[1] - positions[i * 3 + 1]
    let vz = center[2] - positions[i * 3 + 2]
    const nx = normals[i * 3]
    const ny = normals[i * 3 + 1]
    const nz = normals[i * 3 + 2]
    const nLen2 = nx * nx + ny * ny + nz * nz
    if (nLen2 > 0) {
      const dot = (vx * nx + vy * ny + vz * nz) / nLen2
      vx -= nx * dot
      vy -= ny * dot
      vz -= nz * dot
    }
    const k = strength * weights[i]
    out[i * 3] = vx * k
    out[i * 3 + 1] = vy * k
    out[i * 3 + 2] = vz * k
  }
  return out
}
