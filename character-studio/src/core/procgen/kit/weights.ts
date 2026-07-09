// Analytic skin-weight recipe for the procedural body (plan 013), ported from
// scripts/blender/bodies.py (_chain_weights / _torso_weights + head/hand/foot).
// Every function assigns per-vertex weight tracks on a SurfacePiece; the recipe
// is normalized by construction (each vertex's tracks sum to 1) and never
// exceeds 3 influences, so packSkinning's ≤4-influence cap is always satisfied.

import { smoothstep, type SurfacePiece, vertexCount } from './surface'

/** Head / hand: rigid single-bone attach (weight 1.0 to `bone`). bodies.py:172,269. */
export function rigidWeight(piece: SurfacePiece, bone: string): void {
  const n = vertexCount(piece)
  piece.weights.set(bone, new Array(n).fill(1))
}

/**
 * Chain-limb weights: split the loft's along-chain param t (polar v01, 0 at the
 * root pole → 1 at the tip) across `bones` with a smooth blend band at each
 * `split`. bodies.py:327-336 `_chain_weights`. Leg: `['upperLeg','lowerLeg']`
 * split `[0.5]` width 0.16. Chain-lofted arms/wings pass the ACTUAL
 * cumulative-arclength params of their joint waypoints as splits (see
 * body.ts `limbPolyline`) so the loft bends exactly at its geometric joints.
 */
export function chainWeights(piece: SurfacePiece, bones: string[], splits: number[], width: number): void {
  const n = vertexCount(piece)
  const t = (i: number): number => piece.params[i * 2 + 1]
  const fs = splits.map((s) => (i: number) => smoothstep(s - width, s + width, t(i)))
  const nb = bones.length
  for (let b = 0; b < nb; b++) {
    const track = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      let w = 1
      if (b > 0) w *= fs[b - 1](i)
      if (b < nb - 1) w *= 1 - fs[b](i)
      track[i] = w
    }
    piece.weights.set(bones[b], track)
  }
}

/**
 * Torso vertical bands: hips/spine/chest by vertex world-Y smoothstep with band
 * width `0.45·(chestY − hipsY)`. bodies.py:339-346 `_torso_weights`. Sums to 1.
 */
export function torsoWeights(piece: SurfacePiece, hipsY: number, spineY: number, chestY: number): void {
  const n = vertexCount(piece)
  const band = (chestY - hipsY) * 0.45
  const hips = new Array(n).fill(0)
  const spine = new Array(n).fill(0)
  const chest = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const y = piece.pos[i * 3 + 1]
    const s1 = smoothstep(spineY - band, spineY + band, y)
    const s2 = smoothstep(chestY - band, chestY + band, y)
    hips[i] = 1 - s1
    spine[i] = s1 * (1 - s2)
    chest[i] = s1 * s2
  }
  piece.weights.set('hips', hips)
  piece.weights.set('spine', spine)
  piece.weights.set('chest', chest)
}

/**
 * Foot/toes split by a z-smoothstep over the front 70% of the foot: foot bone
 * `1 − 0.6·tz`, toes bone `0.6·tz`. bodies.py:307-309. `centerZ` is the foot
 * ellipsoid centre z; `fz` its z-radius. Sums to 1.
 */
export function footWeights(
  piece: SurfacePiece,
  footBone: string,
  toesBone: string,
  centerZ: number,
  fz: number,
): void {
  const n = vertexCount(piece)
  const foot = new Array(n).fill(0)
  const toes = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const tz = smoothstep(centerZ, centerZ + fz * 0.7, piece.pos[i * 3 + 2])
    foot[i] = 1 - 0.6 * tz
    toes[i] = 0.6 * tz
  }
  piece.weights.set(footBone, foot)
  piece.weights.set(toesBone, toes)
}
