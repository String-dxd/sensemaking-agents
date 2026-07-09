// Bird trunk silhouette constants (anatomy round 4) — the single source of
// truth for the bird's STANDING-EGG body, shared by the body builder
// (src/core/procgen/body.ts) and every part that must hug the egg (wings,
// feet in src/core/procgen/parts.ts). Keeping one module prevents the two
// from drifting apart (round 3 hardcoded copies in the wing builder).
//
// AC read: the body is a vertical egg — TALLER than wide (ry > rx), widest
// just below the middle, tapering to a small top the neck rises out of.
// Round 3's trunk was oblate (rx·profile ≈ 0.21 > ry ≈ 0.15): a lying egg
// with the head pulled up, exactly the operator's "가로로 누운 계란" defect.

import type { BoneName } from '../spec/schema'

export const BIRD_TRUNK = {
  /** Torso ellipsoid horizontal radii as fractions of the head radius. */
  rxFactor: 0.72,
  rzFactor: 0.72,
  /** pearProfile params: low-belly bulge + strong top taper. */
  pear: 0.28,
  taper: 0.34,
  /** Torso vertical span rules (fractions of hips→neck height). */
  bottomDrop: 0.42,
  topRise: 0.55,
  /** Torso ring count (denser than the mammal 18 — the egg's curvature
   * carries the whole silhouette, and the toon ramp shows faceting). */
  vseg: 26,
} as const

/** The bird egg's radial profile (pearProfile with BIRD_TRUNK params). */
export function birdEggProfile(v01: number): number {
  const c = Math.min(Math.max(v01, 0), 1)
  return 1 + BIRD_TRUNK.pear * (1 - c) ** 2 * Math.sin(Math.PI * c) * 2 - BIRD_TRUNK.taper * c * c
}

export interface BirdTrunkDims {
  cy: number
  ry: number
  rx: number
  rz: number
}

/** Torso ellipsoid dims from the bird skeleton's world joints + head radius
 * (both already at world scale). Mirrors buildProceduralBody's span rules. */
export function birdTrunkDims(
  j: Record<BoneName, [number, number, number]>,
  headRadiusWorld: number,
): BirdTrunkDims {
  const torsoH = j.neck[1] - j.hips[1]
  const bottom = j.hips[1] - torsoH * BIRD_TRUNK.bottomDrop
  const top = j.neck[1] + torsoH * BIRD_TRUNK.topRise
  return {
    cy: (bottom + top) / 2,
    ry: (top - bottom) / 2,
    rx: headRadiusWorld * BIRD_TRUNK.rxFactor,
    rz: headRadiusWorld * BIRD_TRUNK.rzFactor,
  }
}

/** World flank |x| of the bird egg at world height yW. */
export function birdFlankX(dims: BirdTrunkDims, yW: number): number {
  const c = Math.min(Math.max((dims.cy - yW) / dims.ry, -1), 1)
  const pol = Math.acos(c)
  return dims.rx * Math.sin(pol) * birdEggProfile(pol / Math.PI)
}
