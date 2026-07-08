// Implicit smooth-union fillets (plan 013), ported from
// scripts/blender/bodies.py `fillet_limb_into_torso` / `_smin` / `make_torso_sdf`.
//
// A shell-union body creases where a limb plunges into the torso — the
// signature of primitive stacking that AC/Pokopia sculpts never show. Instead
// of hiding the junction, we reshape near-junction limb verts onto the
// smooth-min union surface of (limb SDF, torso SDF): the limb flares
// tangentially into the torso like a sculpted fillet. Pure vector math — only
// positions move (outward, along each vert's own radial), so topology / UVs /
// weights / params all survive. Verts deep inside the torso stay tucked
// (masked by torso distance), keeping the overlap hidden and z-fight-free.
//
// The stitched kit makes the *weld* unnecessary (limbs are bridged ring-to-ring
// into one manifold), but the *fillet look* — the smooth shoulder/haunch — is
// still the AC read, so we apply it to the rings near the stitch boundary.

import { type Profile } from './profiles'
import { smoothstep, type Vec3, v } from './surface'

export type Sdf = (p: Vec3) => number

/** Polynomial smooth-min (iq) — blends two SDFs with fillet radius ~k. bodies.py `_smin`. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1)
  return b * (1 - h) + a * h - k * h * (1 - h)
}

/**
 * Approximate SDF of the profiled torso ellipsoid (accurate near the skin).
 * bodies.py `make_torso_sdf`. `profile` is the pear radial multiplier f(v01).
 */
export function makeTorsoSdf(cy: number, ry: number, rx: number, rz: number, profile: Profile): Sdf {
  return (p) => {
    const v01 = Math.min(Math.max((p[1] - (cy - ry)) / (2 * ry), 0), 1)
    const m = profile(v01)
    const qx = p[0] / (rx * m)
    const qy = (p[1] - cy) / ry
    const qz = p[2] / (rz * m)
    const q = Math.sqrt(qx * qx + qy * qy + qz * qz)
    return (q - 1) * Math.min(rx * m, ry, rz * m)
  }
}

/**
 * Project limb verts outward onto the smin(limb, torso) union surface. Mutates
 * the flat position array `pos` in place. bodies.py `fillet_limb_into_torso`:
 * `axisA→axisB` is the limb's core segment with tapered radius `r0→r1`; `k` is
 * the fillet radius (≈0.05–0.055·u). Deep-inside verts (torso SDF < −0.6k) are
 * left tucked; the fillet band blends toward the union surface by `lam`.
 */
export function filletLimbIntoTorso(
  pos: number[],
  axisA: Vec3,
  axisB: Vec3,
  r0: number,
  r1: number,
  torsoSdf: Sdf,
  k: number,
): void {
  const L = Math.max(v.len(v.sub(axisB, axisA)), 1e-9)
  const axis = v.scale(v.sub(axisB, axisA), 1 / L)
  const limbSdf = (p: Vec3): number => {
    const t = Math.min(Math.max(v.dot(v.sub(p, axisA), axis) / L, 0), 1)
    const q = v.add(axisA, v.scale(axis, t * L))
    return v.len(v.sub(p, q)) - (r0 + (r1 - r0) * t)
  }
  const unionSdf = (p: Vec3): number => smin(torsoSdf(p), limbSdf(p), k)

  const n = pos.length / 3
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
    const dT = torsoSdf(p)
    // deep-inside verts stay tucked (hidden overlap); the fillet zone blends in
    const lam = smoothstep(-0.6 * k, 0.3 * k, dT)
    if (lam <= 1e-4) continue
    const t = Math.min(Math.max(v.dot(v.sub(p, axisA), axis) / L, 0), 1)
    const q = v.add(axisA, v.scale(axis, t * L))
    const radial = v.sub(p, q)
    const rl = v.len(radial)
    if (rl < 1e-6) continue // on-axis pole vert
    const uDir = v.scale(radial, 1 / rl)
    if (unionSdf(p) >= 0) continue // already on/outside the union surface
    // bisect the outward crossing of the union surface
    let lo = 0
    let hi = 3 * k
    if (unionSdf(v.add(p, v.scale(uDir, hi))) < 0) continue // no crossing within reach
    for (let it = 0; it < 20; it++) {
      const mid = (lo + hi) / 2
      if (unionSdf(v.add(p, v.scale(uDir, mid))) < 0) lo = mid
      else hi = mid
    }
    const d = ((lo + hi) / 2) * lam
    pos[i * 3] = p[0] + uDir[0] * d
    pos[i * 3 + 1] = p[1] + uDir[1] * d
    pos[i * 3 + 2] = p[2] + uDir[2] * d
  }
}
