// Locomotion (plan 007 step 3) — drives the character root along a path at a
// commanded speed and maps speed to a clip-machine state with hysteresis.
//
// The clips are authored in-place (root at origin); this module supplies the
// missing world motion. Zero foot-skate calibration: at timeScale 1 the walk
// clip's stance foot travels at WALK_CLIP_SPEED and run's at RUN_CLIP_SPEED
// (measured by scripts/blender/clips.py `measure_gait_speed` — rerun
// `pnpm gen:clips` to re-print after editing gaits). getGaitTimeScale()
// returns rootSpeed / clipRefSpeed so the machine plays the gait exactly as
// fast as the ground moves.
//
// Default path: a circle through the home position (radius 1.2 m), heading
// tangent to travel. Pure three-adjacent math — no React, no randomness.

import type { Object3D } from 'three'

/** Stance-foot ground speed of the authored clips at timeScale 1 (m/s). */
export const WALK_CLIP_SPEED = 0.89
export const RUN_CLIP_SPEED = 1.766

/** Commanded speeds the UI presets use (plan 007 reference speeds). */
export const WALK_SPEED = 0.9
export const RUN_SPEED = 2.2
export const MAX_SPEED = 3.2

/** speed -> state mapping with hysteresis (plan 007: 0 / <=1.4 / else). */
const IDLE_TO_WALK = 0.08
const WALK_TO_IDLE = 0.03
const WALK_TO_RUN = 1.5
const RUN_TO_WALK = 1.3

/** How fast the actual speed chases the commanded speed (m/s²). */
const ACCEL = 3.0
const DECEL = 4.5

export type GaitState = 'idle' | 'walk' | 'run'

export interface LocomotionOptions {
  /** Circle radius in meters (default 1.2). */
  radius?: number
  /** Initial commanded speed (default 0). */
  speed?: number
}

export interface Locomotion {
  /** Advance along the path; writes root position + heading. `animation` phase. */
  update(dt: number): void
  /** Command a target ground speed (m/s, clamped to [0, MAX_SPEED]). */
  setTargetSpeed(speed: number): void
  getTargetSpeed(): number
  /** The eased actual speed the root is moving at right now. */
  getSpeed(): number
  /** Speed-derived gait state, with hysteresis. */
  getGaitState(): GaitState
  /** Mixer timeScale that makes the current gait clip match ground speed. */
  getGaitTimeScale(): number
  /** Snap the root home and zero the speed. */
  reset(): void
}

export function createLocomotion(root: Object3D, options: LocomotionOptions = {}): Locomotion {
  const radius = options.radius ?? 1.2
  const home = root.position.clone()
  const homeYaw = root.rotation.y

  let targetSpeed = clampSpeed(options.speed ?? 0)
  let speed = 0
  let gait: GaitState = 'idle'
  /** Angle around the circle; 0 = home. Circle centre sits left of home. */
  let theta = 0

  function clampSpeed(v: number): number {
    return v < 0 ? 0 : v > MAX_SPEED ? MAX_SPEED : v
  }

  function updateGait(): void {
    // Hysteresis: promote/demote only past the asymmetric thresholds so the
    // state doesn't flap when the speed hovers on a boundary.
    if (gait === 'idle') {
      if (speed >= IDLE_TO_WALK) gait = speed >= WALK_TO_RUN ? 'run' : 'walk'
    } else if (gait === 'walk') {
      if (speed >= WALK_TO_RUN) gait = 'run'
      else if (speed <= WALK_TO_IDLE) gait = 'idle'
    } else if (gait === 'run') {
      if (speed <= RUN_TO_WALK) gait = speed <= WALK_TO_IDLE ? 'idle' : 'walk'
    }
  }

  return {
    update(dt: number): void {
      if (dt <= 0) return
      // Ease actual speed toward the command (bounded accel — transitions
      // sweep through the crossfade bands instead of teleporting past them).
      const rate = targetSpeed > speed ? ACCEL : DECEL
      const maxStep = rate * dt
      const delta = targetSpeed - speed
      speed += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep
      updateGait()

      if (speed > 0) {
        theta += (speed / radius) * dt
        // Circle through home: centre at home + radius to the character's
        // rest-heading left (-X for a +Z-facing character at theta 0).
        root.position.x = home.x + radius * (Math.cos(theta) - 1)
        root.position.z = home.z + radius * Math.sin(theta)
        // Heading = tangent of travel (d/dθ of the position above).
        root.rotation.y = homeYaw - theta
      }
    },
    setTargetSpeed(v: number): void {
      targetSpeed = clampSpeed(v)
    },
    getTargetSpeed: () => targetSpeed,
    getSpeed: () => speed,
    getGaitState: () => gait,
    getGaitTimeScale(): number {
      if (gait === 'run') return speed / RUN_CLIP_SPEED
      if (gait === 'walk') return speed / WALK_CLIP_SPEED
      return 1
    },
    reset(): void {
      targetSpeed = 0
      speed = 0
      gait = 'idle'
      theta = 0
      root.position.copy(home)
      root.rotation.y = homeYaw
    },
  }
}
