import { MathUtils } from 'three'

// Wind physics for the canopy sway. Two layers:
//
//  1. A global gust FIELD — deterministic layered sines whose front travels
//     across the island, so a gust reaches downwind trees a beat later and the
//     whole stand ripples instead of metronoming in sync.
//  2. A per-tree SPRING — each canopy is an underdamped angular spring-damper
//     driven by the field. The crown lags a rising gust, overshoots when it
//     lets go, and rings down naturally: the Animal Crossing wobble, from
//     physics rather than a baked sine.
//
// Pure math, no three.js scene objects and no React — the r3f seam is
// `useCanopyWind` (useCanopyWind.ts). Everything is a function of (t, position,
// phase), so the sim is deterministic and testable in node.

/** Compass heading the wind blows toward, drifting slowly so the lean
 *  direction wanders over ~minutes without ever snapping. Unit vector. */
export function windDirection(t: number): { x: number; z: number } {
  const a = 0.5 + 0.35 * Math.sin(t * 0.043)
  return { x: Math.cos(a), z: Math.sin(a) }
}

/** How fast the gust front sweeps the island: a tree at world (x, z) sees the
 *  origin's gust `(x + 0.6z) * GUST_TRAVEL` seconds later. */
const GUST_TRAVEL = 0.35

/** Gust strength in [0, 1] at time `t` and world (x, z). Layered incommensurate
 *  sines: long swells with faster ripples on top, clamped so lulls go fully
 *  slack (0) and peaks saturate (1). */
export function gustStrength(t: number, worldX: number, worldZ: number): number {
  const u = t - (worldX + 0.6 * worldZ) * GUST_TRAVEL
  return MathUtils.clamp(
    0.45 + 0.3 * Math.sin(u * 0.31) + 0.2 * Math.sin(u * 0.73 + 1.7) + 0.12 * Math.sin(u * 1.9 + 4.2),
    0,
    1,
  )
}

const STIFFNESS = 38 // spring constant: natural frequency ≈ 1 Hz — a tree-sized wobble
const DAMPING = 3.6 // well under critical (2·√38 ≈ 12.3): gusts overshoot and ring down
const MAX_LEAN = 0.09 // radians of lean a full gust asks of a windAmp-1 crown
const MAX_DT = 1 / 30 // clamp tab-switch frame spikes so the integrator can't blow up

/**
 * One canopy's angular spring state. Call `step` once per frame, then copy
 * `rotX` / `rotZ` / `scaleY` onto the canopy group. `phase` de-syncs the
 * per-tree flutter and breathing (derive it from the object id/seed);
 * neighbouring trees additionally de-sync through the traveling gust front.
 */
export class CanopySpring {
  rotX = 0
  rotZ = 0
  scaleY = 1
  private velX = 0
  private velZ = 0

  constructor(private readonly phase: number) {}

  step(t: number, rawDt: number, worldX: number, worldZ: number, amp: number): void {
    const dt = Math.min(rawDt, MAX_DT)
    if (dt <= 0) return

    // Where the wind is pushing this crown right now: the traveling gust sets
    // the magnitude, a small fast per-tree flutter roughens it (leaf noise the
    // broad field is too smooth to carry), and windAmp scales it per kind
    // (fruitTree 1 > palm 0.7 > stiff cedar 0.35).
    const gust = gustStrength(t, worldX, worldZ)
    const flutter = 0.012 * Math.sin(t * 2.9 + this.phase) + 0.008 * Math.sin(t * 4.3 + this.phase * 2.1)
    const lean = (MAX_LEAN * gust + flutter) * amp

    // Lean AWAY from the wind: rotation.x tips the crown toward +z, rotation.z
    // tips it toward −x, hence the sign split.
    const dir = windDirection(t)
    const targetX = lean * dir.z
    const targetZ = -lean * dir.x

    // Semi-implicit Euler on the spring-damper (stable at the clamped dt).
    this.velX += ((targetX - this.rotX) * STIFFNESS - this.velX * DAMPING) * dt
    this.velZ += ((targetZ - this.rotZ) * STIFFNESS - this.velZ * DAMPING) * dt
    this.rotX += this.velX * dt
    this.rotZ += this.velZ * dt

    // Squash-and-stretch: the crown flattens a touch as it bends (bend is the
    // spring's live state, so the squash rings with the overshoot), over a slow
    // idle breathing so a becalmed tree still feels alive.
    const bend = Math.hypot(this.rotX, this.rotZ)
    this.scaleY = 1 - 0.35 * bend + 0.012 * amp * Math.sin(t * 1.7 + this.phase)
  }
}
