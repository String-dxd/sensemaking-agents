// Seeded RNG for the procedural mesh kit (plan 013).
//
// `src/core/**` bans `Math.random` (test/core-no-react.test.ts spirit +
// determinism contract): the kit must be reproducible so morph targets and
// sculpt deltas can index vertices by buffer position. Geometry generation is
// fully analytic today, but any future jitter must draw from a seeded source
// threaded through the builders (plan 012 BuildContext.rng).

export interface SeededRng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number
}

/**
 * mulberry32 — a compact, well-distributed 32-bit PRNG. Same seed → same
 * stream, so two builds with the same params are byte-identical.
 */
export function makeRng(seed: number): SeededRng {
  let a = seed >>> 0
  const next = (): number => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
  }
}
