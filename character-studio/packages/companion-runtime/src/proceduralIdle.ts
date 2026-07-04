// Procedural idle layer (plan 003 step 3): breath, weight-shift sway, and
// micro head turns — the "never perfectly still" baseline every animation
// layers under.
//
// Phase contract (plan 003 "Current state" #4): this layer registers in the
// `procedural` frame phase, which runs AFTER `physics` within a frame
// (animation → physics → procedural → render). The transforms written here
// are *next-frame intent*: the renderer shows them this frame, and the
// spring solver reads them as pose targets on the NEXT frame's physics step.
// That one-frame latency is deliberate and imperceptible; it keeps physics
// reacting to a fully-written, stable pose. Breath scaling the chest is what
// makes a resting body excite the ear/tail spring chains.
//
// Randomness is injected (seeded Rng) — core never calls the global random generator.

// PORT of the studio's `src/core/motion/proceduralIdle.ts` (plan 003) — the
// only change from the original is the Object3D type source (structural
// three-types instead of `three`); the body writes plain position/scale/
// rotation and constructs no three objects, so it is otherwise verbatim.
import { createValueNoise1d, type Rng } from './noise'
import type { Object3DLike as Object3D } from './three-types'

export interface IdleTargets {
  /** Breath target: uniformly scaled by 1 + breathAmplitude * sin(2πt / breathPeriod). */
  chest: Object3D
  /** Head-bob (position.y) and micro-turn (rotation.y) target. */
  head: Object3D
  /** Weight-shift sway target: position.x offset by seeded value noise. */
  hips: Object3D
}

export interface IdleParams {
  /** Chest scale amplitude (0.015 → ±1.5 %). */
  breathAmplitude: number
  /** Seconds per breath cycle (~3.8 s). */
  breathPeriod: number
  /** Metres of vertical head bob, in phase with breath. */
  headBobAmplitude: number
  /** Metres of lateral hip sway (± bound). */
  swayAmplitude: number
  /** Seconds per sway-noise unit (~6 s). */
  swayPeriod: number
  /** Seconds: min/max interval between micro head turns (5–12 s). */
  microTurnMinInterval: number
  microTurnMaxInterval: number
  /** Radians: max micro-turn yaw (±). */
  microTurnMaxAngle: number
  /** Seconds a micro turn takes to ease to its new yaw. */
  microTurnDuration: number
}

export const DEFAULT_IDLE_PARAMS: IdleParams = {
  breathAmplitude: 0.015,
  breathPeriod: 3.8,
  headBobAmplitude: 0.004,
  swayAmplitude: 0.004,
  swayPeriod: 6,
  microTurnMinInterval: 5,
  microTurnMaxInterval: 12,
  microTurnMaxAngle: 0.12,
  microTurnDuration: 0.9,
}

/**
 * Which transforms the idle layer is allowed to write. Play Mode (plan 007)
 * disables everything except breath: the clip layer owns hips position and
 * head rotation there, and this layer writes ABSOLUTE base+offset values that
 * would clobber the animated pose. Breath (chest scale) never conflicts —
 * clips are forbidden from scaling bones.
 */
export interface IdleChannels {
  breath: boolean
  headBob: boolean
  sway: boolean
  microTurn: boolean
}

export interface IdleLayer {
  /**
   * Advance by dt seconds and write the idle pose. Pass `tOverride` to pin
   * the internal clock to an absolute time (deterministic tests).
   */
  update(dt: number, tOverride?: number): void
  setParams(partial: Partial<IdleParams>): void
  /** Enable/disable individual write channels (disabled ones restore base once). */
  setChannels(partial: Partial<IdleChannels>): void
  /** Restore base transforms and restart the clock. */
  reset(): void
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

export function createIdleLayer(targets: IdleTargets, rng: Rng, initial?: Partial<IdleParams>): IdleLayer {
  const params: IdleParams = { ...DEFAULT_IDLE_PARAMS, ...initial }
  const channels: IdleChannels = { breath: true, headBob: true, sway: true, microTurn: true }
  const noise = createValueNoise1d(rng)

  // Base pose captured at creation; the layer writes base + offset so it
  // never accumulates drift and never fights the layers that own the base.
  const baseChestScale = targets.chest.scale.clone()
  const baseHeadY = targets.head.position.y
  const baseHeadYaw = targets.head.rotation.y
  const baseHipsX = targets.hips.position.x

  let t = 0
  let yawOffset = 0
  let yawFrom = 0
  let yawTo = 0
  let turnStart = -Infinity
  let nextTurnAt = scheduleNext(0)

  function scheduleNext(now: number): number {
    return now + params.microTurnMinInterval + rng() * (params.microTurnMaxInterval - params.microTurnMinInterval)
  }

  function update(dt: number, tOverride?: number): void {
    t = tOverride ?? t + dt

    // Breath: chest scale + slight head bob, one sine cycle per breathPeriod.
    const phase = Math.sin((t * 2 * Math.PI) / params.breathPeriod)
    if (channels.breath) {
      const s = 1 + params.breathAmplitude * phase
      targets.chest.scale.set(baseChestScale.x * s, baseChestScale.y * s, baseChestScale.z * s)
    }
    if (channels.headBob) {
      targets.head.position.y = baseHeadY + params.headBobAmplitude * phase
    }

    // Weight-shift sway: lateral hip offset from seeded value noise, ±amplitude.
    if (channels.sway) {
      targets.hips.position.x = baseHipsX + params.swayAmplitude * (noise(t / params.swayPeriod) * 2 - 1)
    }

    // Micro head turns: every microTurnMin..MaxInterval seconds, ease to a
    // new small yaw and hold it until the next turn. The scheduler keeps
    // ticking while the channel is off so re-enabling doesn't cause a jump —
    // only the WRITE is gated.
    if (t >= nextTurnAt) {
      yawFrom = yawOffset
      yawTo = (rng() * 2 - 1) * params.microTurnMaxAngle
      turnStart = t
      nextTurnAt = scheduleNext(t)
    }
    const u = clamp01((t - turnStart) / params.microTurnDuration)
    const eased = u * u * (3 - 2 * u)
    yawOffset = yawFrom + (yawTo - yawFrom) * eased
    if (channels.microTurn) {
      targets.head.rotation.y = baseHeadYaw + yawOffset
    }
  }

  function setParams(partial: Partial<IdleParams>): void {
    Object.assign(params, partial)
  }

  function setChannels(partial: Partial<IdleChannels>): void {
    // Restore the base transform once for every channel switching on -> off,
    // so the last-written offset doesn't linger under the new owner (the
    // mixer only writes properties its clips key — chest scale / head pos
    // would otherwise keep the stale idle offset forever).
    if (partial.breath === false && channels.breath) targets.chest.scale.copy(baseChestScale)
    if (partial.headBob === false && channels.headBob) targets.head.position.y = baseHeadY
    if (partial.sway === false && channels.sway) targets.hips.position.x = baseHipsX
    if (partial.microTurn === false && channels.microTurn) targets.head.rotation.y = baseHeadYaw
    Object.assign(channels, partial)
  }

  function reset(): void {
    targets.chest.scale.copy(baseChestScale)
    targets.head.position.y = baseHeadY
    targets.head.rotation.y = baseHeadYaw
    targets.hips.position.x = baseHipsX
    t = 0
    yawOffset = 0
    yawFrom = 0
    yawTo = 0
    turnStart = -Infinity
    nextTurnAt = scheduleNext(0)
  }

  return { update, setParams, setChannels, reset }
}
