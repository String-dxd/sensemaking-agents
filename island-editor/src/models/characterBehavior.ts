// Pure, framework-agnostic behavior machine for the placed character (plan
// 025): wander / stop-and-wave / sleep / wake / swim-with-leash / click-to-
// talk. NO three/r3f imports — CharacterActor (r3f) drives this from its
// useFrame and applies the result (position/yaw/clip); keeping the decision
// logic here makes it headless-testable, mirroring grassField/shoreField.
//
// Movement is RUNTIME-ONLY: the spec still stores the placed cell (the
// character's "home"); wandering never writes to the spec, so undo/redo and
// save/load are unaffected and a reload restarts the walk from home.

import type { ShoreField } from '../terrain/shoreField'
import type { CharacterClip } from './characterAsset'

/** Nearest-lattice sample of the signed shore distance (+ = water) at world (x,z). */
export function sampleShoreDistance(field: ShoreField, worldSize: number, x: number, z: number): number {
  const half = worldSize / 2
  const step = worldSize / field.res
  const i = Math.min(field.res - 1, Math.max(0, Math.floor((x + half) / step)))
  const j = Math.min(field.res - 1, Math.max(0, Math.floor((z + half) / step)))
  return field.data[j * field.res + i]
}

export type BehaviorPhase = 'walk' | 'hi' | 'sleep' | 'wake' | 'swim' | 'talk'

export interface BehaviorState {
  phase: BehaviorPhase
  x: number
  z: number
  yaw: number
  /** Seconds remaining in the current phase. */
  remaining: number
}

export interface BehaviorEnv {
  heightAt(x: number, z: number): number
  shoreDistanceAt(x: number, z: number): number
  seaLevel: number
  worldSize: number
  /** Seeded stream (mulberry32) — NO Math.random (repo rule). */
  rand(): number
}

// Tuning knobs (see the plan-025 maintenance notes).
export const WALK_SPEED = 0.5 // world units/s (world is 24 wide)
export const SWIM_SPEED = 0.32
export const MAX_SWIM_DIST = 1.6 // leash: max signed shore distance while swimming
export const TALK_SECONDS = 3.5
const MAX_DT = 0.1 // tab-switch guard: one frame never advances more than this
const WANDER_TURN = 1.6 // rad/s of random heading drift while walking
const HI_SECONDS = 2.8
const WAKE_SECONDS = 2.6
const SWIM_STEER = 2.4 // rad/s turned while the leash refuses a step
const EDGE_MARGIN = 1 // world-edge leash: keep |x|,|z| under worldSize/2 - this
const WATER_EPS = 0.02 // heightAt <= seaLevel + this counts as water

/** Enter walk with a freshly rolled 4–9 s duration. */
function rollWalk(s: BehaviorState, rand: () => number): void {
  s.phase = 'walk'
  s.remaining = 4 + rand() * 5
}

export function createBehaviorState(x: number, z: number, yaw: number, rand: () => number): BehaviorState {
  return { phase: 'walk', x, z, yaw, remaining: 4 + rand() * 5 }
}

/** Put the machine in talk (from ANY phase — being woken by a click is fine). */
export function triggerTalk(s: BehaviorState): void {
  s.phase = 'talk'
  s.remaining = TALK_SECONDS
}

/** Advance the machine by dt seconds. Mutates `s` (no per-frame allocations).
 *  Movement convention (everywhere): x += sin(yaw)·speed·dt,
 *  z += cos(yaw)·speed·dt — matches a three.js group with rotation.y = yaw
 *  facing +Z at yaw 0; turning toward the center is yaw = atan2(-x, -z). */
export function advanceBehavior(s: BehaviorState, dt: number, env: BehaviorEnv): void {
  if (dt > MAX_DT) dt = MAX_DT
  switch (s.phase) {
    case 'walk': {
      // Wander: random heading drift, then a forward step along yaw.
      s.yaw += (env.rand() - 0.5) * WANDER_TURN * dt
      const limit = env.worldSize / 2 - EDGE_MARGIN
      let nx = s.x + Math.sin(s.yaw) * WALK_SPEED * dt
      let nz = s.z + Math.cos(s.yaw) * WALK_SPEED * dt
      // World-edge leash: a step that would leave the margin turns the chick
      // toward the center instead, and the step is retaken along the new yaw.
      if (Math.abs(nx) > limit || Math.abs(nz) > limit) {
        s.yaw = Math.atan2(-s.x, -s.z)
        nx = s.x + Math.sin(s.yaw) * WALK_SPEED * dt
        nz = s.z + Math.cos(s.yaw) * WALK_SPEED * dt
      }
      s.x = nx
      s.z = nz
      // Walked into water → swim (entered from any moving phase; swim has no
      // timer, it exits on the walked-back-ashore condition below).
      if (env.heightAt(s.x, s.z) <= env.seaLevel + WATER_EPS) {
        s.phase = 'swim'
        s.remaining = 0
        return
      }
      s.remaining -= dt
      // Walk expiry → stop and say hi (the wave clip).
      if (s.remaining <= 0) {
        s.phase = 'hi'
        s.remaining = HI_SECONDS
      }
      return
    }
    case 'hi': {
      // Stopped, waving; no movement. Expiry → 70% walk on, 30% sleep 6–12 s.
      s.remaining -= dt
      if (s.remaining <= 0) {
        if (env.rand() < 0.7) {
          rollWalk(s, env.rand)
        } else {
          s.phase = 'sleep'
          s.remaining = 6 + env.rand() * 6
        }
      }
      return
    }
    case 'sleep': {
      // No movement. Expiry → wake-up animation, then walk on.
      s.remaining -= dt
      if (s.remaining <= 0) {
        s.phase = 'wake'
        s.remaining = WAKE_SECONDS
      }
      return
    }
    case 'wake': {
      s.remaining -= dt
      if (s.remaining <= 0) rollWalk(s, env.rand)
      return
    }
    case 'swim': {
      // Swim forward; the leash refuses any step whose CANDIDATE position is
      // farther than MAX_SWIM_DIST from shore and steers home instead (keeps
      // turning until a step becomes legal). Never transitions to hi/sleep in
      // water; exits to walk (re-rolled duration) once back ashore.
      const nx = s.x + Math.sin(s.yaw) * SWIM_SPEED * dt
      const nz = s.z + Math.cos(s.yaw) * SWIM_SPEED * dt
      if (env.shoreDistanceAt(nx, nz) > MAX_SWIM_DIST) {
        s.yaw += SWIM_STEER * dt
      } else {
        s.x = nx
        s.z = nz
      }
      if (env.heightAt(s.x, s.z) > env.seaLevel + WATER_EPS) rollWalk(s, env.rand)
      return
    }
    case 'talk': {
      // No movement (the clip is stationary). Expiry → walk on.
      s.remaining -= dt
      if (s.remaining <= 0) rollWalk(s, env.rand)
      return
    }
  }
}

/** The clip each phase plays (dock 'auto' mode). */
export function behaviorClip(phase: BehaviorPhase): CharacterClip {
  switch (phase) {
    case 'walk':
      return 'Walking'
    case 'hi':
      return 'Wave_for_Help_2'
    case 'sleep':
      return 'Stand_To_Side_Lying'
    case 'wake':
      return 'Wake_Up_and_Look_Up'
    case 'swim':
      return 'Swim_Forward'
    case 'talk':
      return 'Talk_Passionately'
  }
}
