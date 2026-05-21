/**
 * Shared easing / interpolation primitives. Lift these out of every
 * file that was reinventing the same one-liner. The engine's animation
 * code is supposed to read like motion design, not like a math library
 * — name the curves, don't paste them.
 *
 * `progress(now, start, duration)` returns a u ∈ [0, 1] suitable for
 * passing into any of the easing functions below.
 */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v

export const lerp = (a, b, t) => a + (b - a) * t

/** Three-channel rgb lerp; inputs are plain {r,g,b} 0..1 objects. */
export const lerpRgb = (a, b, t) => ({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
})

/** Hermite cubic — `3t² - 2t³`. Smooth in/out, the bread-and-butter ease. */
export const smoothstep = (t) => t * t * (3 - 2 * t)

/** Quintic Hermite — slower start/end than smoothstep. Reads as "considered". */
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10)

/** Cubic ease-out — fast start, settles. Reads as "confident". */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

/** Cubic ease-in — slow start, accelerates. */
export const easeInCubic = (t) => t * t * t

/**
 * Clamped progress from a timestamp + start + duration. Returns 0 when
 * elapsed ≤ 0 and 1 when elapsed ≥ duration. Use this instead of the
 * inline `Math.min(1, (now - start) / duration)` that's scattered
 * through the codebase.
 */
export const progress = (now, start, duration) =>
{
    if(duration <= 0) return 1
    const u = (now - start) / duration
    return u < 0 ? 0 : u > 1 ? 1 : u
}
