// Seeded randomness helpers (plan 003).
//
// Working agreement: no `Math.random` anywhere in src/core/** — every caller
// that needs randomness injects a seeded Rng so simulation stays
// deterministic and testable.

export type Rng = () => number

/** Deterministic 32-bit PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 1-D value noise: a seeded lattice of 256 values, smoothstep-interpolated,
 * wrapping every 256 units. Output in [0, 1). Continuous in t.
 */
export function createValueNoise1d(rng: Rng): (t: number) => number {
  const lattice = new Float32Array(256)
  for (let i = 0; i < lattice.length; i++) {
    lattice[i] = rng()
  }
  return (t: number) => {
    const i = Math.floor(t)
    const f = t - i
    const u = f * f * (3 - 2 * f)
    const a = lattice[i & 255]
    const b = lattice[(i + 1) & 255]
    return a + (b - a) * u
  }
}
