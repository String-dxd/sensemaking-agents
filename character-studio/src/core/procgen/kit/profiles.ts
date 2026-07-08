// Radial profile curves for the mesh kit (plan 013), ported from
// scripts/blender/bodies.py / meshkit.py. A profile is a per-vertex radial
// multiplier f(v01) applied to a shell's cross-section radius.

export type Profile = (v01: number) => number

/**
 * Torso "pear" profile (bodies.py:189-191) — widest low, tapering toward the
 * shoulders. `pear` bulges the lower body; `taper` narrows the top.
 *   1 + pear·(1−v)²·sin(πv)·2 − taper·v²
 */
export function pearProfile(pear: number, taper: number): Profile {
  return (v01) => {
    const c = Math.min(Math.max(v01, 0), 1)
    return 1.0 + pear * (1.0 - c) ** 2 * Math.sin(Math.PI * c) * 2.0 - taper * c * c
  }
}

/**
 * Capsule "fullness" boost (meshkit.py capsule_along:155-161). The stretched
 * sphere's radial magnitude is sin(polar) — 1 mid-shell, 0 at the poles.
 * Raising it toward 1 (mag^(1−fullness)) keeps cross-sections plump and gives
 * rounded caps instead of spindle points. Returns the multiplier for a given
 * radial magnitude.
 */
export function fullnessBoost(mag: number, fullness: number): number {
  if (fullness <= 0.0) return 1.0
  if (mag <= 1e-9) return 0.0
  return mag ** (1.0 - fullness) / Math.max(mag, 1e-9)
}
