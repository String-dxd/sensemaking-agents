// Pure, framework-agnostic behavior machine for the placed character (plans
// 025/026): wander / stop-and-nap / wake / swim-with-leash / click-to-talk /
// click-to-move (goto). NO three/r3f imports — CharacterActor (r3f) drives
// this from its useFrame and applies the result (position/yaw/clip); keeping
// the decision logic here makes it headless-testable, mirroring
// grassField/shoreField.
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

export type BehaviorPhase = 'walk' | 'idle' | 'sleep' | 'wake' | 'swim' | 'talk' | 'goto'

export interface BehaviorState {
  phase: BehaviorPhase
  x: number
  z: number
  yaw: number
  /** Seconds remaining in the current phase. */
  remaining: number
  /** Click-to-move target (plan 026); meaningful while phase is 'goto'. */
  tx: number
  tz: number
  /** A goto command arrived during sleep: wake first, then go. */
  gotoPending: boolean
  /** Standing in water after the last advance (drives the goto clip + draught). */
  wet: boolean
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
const GOTO_TURN = 3.5 // rad/s max steering rate toward a click-to-move target
const WAKE_SECONDS = 2.6
const SWIM_STEER = 2.4 // rad/s turned while the leash refuses a step
const EDGE_MARGIN = 1 // world-edge leash: keep |x|,|z| under worldSize/2 - this
// Water hysteresis (plan 027): entry and exit use DIFFERENT thresholds so the
// phase can't flip-flop swim↔walk every few ticks right at the waterline
// (each flip restarted the clip and popped the draught — the "patchy swim").
// Both thresholds MUST stay below the beach top (tier 1 = seaLevel + 0.05): an
// exit bar above it is unreachable from the sand, so a bird that came ashore
// keeps the swim clip and draught while walking the dry beach.
const WATER_ENTER = -0.02 // heightAt <= seaLevel + this → submerged, start swimming
const WATER_EXIT = 0.02 // heightAt >  seaLevel + this → dry footing, back ashore

/** Enter walk with a freshly rolled 4–9 s duration. */
function rollWalk(s: BehaviorState, rand: () => number): void {
  s.phase = 'walk'
  s.remaining = 4 + rand() * 5
}

/** Enter sleep with the stop-nap roll (5–9 s). */
function rollSleep(s: BehaviorState, rand: () => number): void {
  s.phase = 'sleep'
  s.remaining = 5 + rand() * 4
}

/** Enter idle: stand and breathe for 6–10 s. This is what a STOP normally is —
 *  the idle clip is a held standing pose plus a breathing bob (CharacterActor),
 *  because character.glb ships no idle animation of its own. */
function rollIdle(s: BehaviorState, rand: () => number): void {
  s.phase = 'idle'
  s.remaining = 6 + rand() * 4
}

/** Chance that a stop is a real nap rather than a plain idle. Plan 026 made
 *  EVERY stop a nap, which read as a bird that does nothing but sleep; naps are
 *  now the occasional treat they were meant to be. */
const NAP_CHANCE = 0.25

/** The stop: mostly idle, occasionally a nap. Draws ONE rand for the coin flip
 *  before the duration roll — so a `() => 0.5` stub deterministically idles. */
function rollStop(s: BehaviorState, rand: () => number): void {
  if (rand() < NAP_CHANCE) rollSleep(s, rand)
  else rollIdle(s, rand)
}

/** Enter swim with a rolled paddle-about duration (4–8 s). When it expires the
 *  bird heads for land — it does NOT stop at sea (see the swim case). */
function rollSwim(s: BehaviorState, rand: () => number): void {
  s.phase = 'swim'
  s.remaining = 4 + rand() * 4
}

/** Unit vector pointing back toward land: the steepest DESCENT of the signed
 *  shore distance (+ = water), by central differences on the same field the
 *  leash reads. `SHORE_PROBE` must clear a couple of lattice steps — the field
 *  samples nearest-lattice (worldSize/(cols·2) ≈ 0.19 u), so a smaller probe
 *  would difference two identical cells and read a flat zero. Returns null
 *  where the field is genuinely flat (open sea in a test fixture, say), which
 *  the caller treats as "no opinion — keep the current heading". */
const SHORE_PROBE = 0.4
function shoreward(env: BehaviorEnv, x: number, z: number): { x: number; z: number } | null {
  const gx = env.shoreDistanceAt(x + SHORE_PROBE, z) - env.shoreDistanceAt(x - SHORE_PROBE, z)
  const gz = env.shoreDistanceAt(x, z + SHORE_PROBE) - env.shoreDistanceAt(x, z - SHORE_PROBE)
  const len = Math.hypot(gx, gz)
  if (len < 1e-6) return null
  return { x: -gx / len, z: -gz / len } // negative gradient = toward land
}

/** Steer `s.yaw` toward a heading at a bounded turn rate (shared by goto and
 *  the swim-home leg). */
function steerToward(s: BehaviorState, dirX: number, dirZ: number, rate: number, dt: number): void {
  const want = Math.atan2(dirX, dirZ)
  let diff = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw))
  const maxTurn = rate * dt
  if (diff > maxTurn) diff = maxTurn
  else if (diff < -maxTurn) diff = -maxTurn
  s.yaw += diff
}

export function createBehaviorState(x: number, z: number, yaw: number, rand: () => number): BehaviorState {
  return { phase: 'walk', x, z, yaw, remaining: 4 + rand() * 5, tx: 0, tz: 0, gotoPending: false, wet: false }
}

/** Put the machine in talk (from ANY phase — being woken by a click is fine).
 *  Any click-to-move target is dropped (never resumed after talk). */
export function triggerTalk(s: BehaviorState): void {
  s.phase = 'talk'
  s.remaining = TALK_SECONDS
  s.gotoPending = false
}

/** Player command: walk/swim to (x,z). From sleep, wake first (the wake clip
 *  plays), then go; from any other phase, go immediately. */
export function commandMoveTo(s: BehaviorState, x: number, z: number): void {
  s.tx = x
  s.tz = z
  if (s.phase === 'sleep') {
    s.phase = 'wake'
    s.remaining = WAKE_SECONDS
    s.gotoPending = true
  } else {
    s.phase = 'goto'
    s.gotoPending = false
  }
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
      // Walked into water → swim (entered from any moving phase).
      if (env.heightAt(s.x, s.z) <= env.seaLevel + WATER_ENTER) {
        rollSwim(s, env.rand)
        break
      }
      s.remaining -= dt
      // Walk expiry → stop: stand idle, or now and then a nap.
      if (s.remaining <= 0) rollStop(s, env.rand)
      break
    }
    case 'idle': {
      // Stand still and breathe. No movement; expiry → walk on.
      s.remaining -= dt
      if (s.remaining <= 0) rollWalk(s, env.rand)
      break
    }
    case 'sleep': {
      // No movement. Expiry → wake-up animation, then walk on.
      s.remaining -= dt
      if (s.remaining <= 0) {
        s.phase = 'wake'
        s.remaining = WAKE_SECONDS
      }
      break
    }
    case 'wake': {
      s.remaining -= dt
      if (s.remaining <= 0) {
        // A click-to-move command that arrived during sleep resumes here:
        // wake clip finished → head for the target instead of wandering.
        if (s.gotoPending) {
          s.gotoPending = false
          s.phase = 'goto'
        } else {
          rollWalk(s, env.rand)
        }
      }
      break
    }
    case 'goto': {
      // Steer toward the target with a bounded turn rate (shortest angular
      // difference, clamped to GOTO_TURN·dt per tick).
      steerToward(s, s.tx - s.x, s.tz - s.z, GOTO_TURN, dt)
      // Footing decides the gait: swim speed in water, walk speed ashore.
      // Uses s.wet from the previous tick's hysteresis update (plan 027)
      // instead of re-deriving with a single threshold — same no-flip-flop
      // guarantee as the swim phase itself.
      const wet = s.wet
      const speed = wet ? SWIM_SPEED : WALK_SPEED
      const nx = s.x + Math.sin(s.yaw) * speed * dt
      const nz = s.z + Math.cos(s.yaw) * speed * dt
      // The swim leash blocks the route → abandon the target (deterministic,
      // no endless circling): resume swim in water / a re-rolled walk ashore.
      if (env.heightAt(nx, nz) <= env.seaLevel + WATER_ENTER && env.shoreDistanceAt(nx, nz) > MAX_SWIM_DIST) {
        if (wet) rollSwim(s, env.rand)
        else rollWalk(s, env.rand)
        break
      }
      s.x = nx
      s.z = nz
      // Arrival within 0.2 u → it stopped. Ashore that is the plan-026 nap; in
      // WATER there is no stopping — hand off to swim, which paddles out its
      // roll and then heads for land. (This used to nap unconditionally, so a
      // click on the sea left the bird asleep and floating on it.)
      const dx = s.tx - s.x
      const dz = s.tz - s.z
      if (dx * dx + dz * dz < 0.04) {
        if (s.wet) rollSwim(s, env.rand)
        else rollStop(s, env.rand)
      }
      break
    }
    case 'swim': {
      // A swim ALWAYS ends on land: there is no stop, nap or idle at sea. The
      // bird paddles about for its rolled duration, then turns for shore and
      // keeps swimming until the walked-ashore exit below fires. (Before, the
      // swim had no timer and no homing — it could only reach land by chance,
      // and a goto that finished in the water simply lay down and slept there.)
      s.remaining -= dt
      if (s.remaining <= 0) {
        const home = shoreward(env, s.x, s.z)
        if (home) steerToward(s, home.x, home.z, SWIM_STEER, dt)
      }
      // The leash refuses any step whose CANDIDATE position is farther than
      // MAX_SWIM_DIST from shore and steers instead (keeps turning until a step
      // becomes legal).
      const nx = s.x + Math.sin(s.yaw) * SWIM_SPEED * dt
      const nz = s.z + Math.cos(s.yaw) * SWIM_SPEED * dt
      if (env.shoreDistanceAt(nx, nz) > MAX_SWIM_DIST) {
        s.yaw += SWIM_STEER * dt
      } else {
        s.x = nx
        s.z = nz
      }
      // Exit uses the HIGHER hysteresis threshold: only clearly ashore ends
      // the swim, so the waterline can't churn swim↔walk (plan 027).
      if (env.heightAt(s.x, s.z) > env.seaLevel + WATER_EXIT) rollWalk(s, env.rand)
      break
    }
    case 'talk': {
      // No movement (the clip is stationary). Expiry → walk on.
      s.remaining -= dt
      if (s.remaining <= 0) rollWalk(s, env.rand)
      break
    }
  }
  // Footing after this tick — drives the goto clip (walk vs swim gait) and
  // the actor's swim draught. Maintained on EVERY advance, whatever the phase.
  // Hysteresis (plan 027): once wet, stays wet until clearly ashore.
  const h = env.heightAt(s.x, s.z)
  s.wet = s.wet ? h <= env.seaLevel + WATER_EXIT : h <= env.seaLevel + WATER_ENTER
}

/** The idle POSE: character.glb ships no idle animation, so idle is this clip
 *  FROZEN at one frame (CharacterActor sets timeScale 0) plus a breathing bob —
 *  never played through, so the wave itself (which starts later in the clip) is
 *  never seen. Frame 0 of the wave is the rig's neutral standing stance, which
 *  is the closest thing to an idle the asset has. Checked by eye against the
 *  alternatives: the wake clip's LAST frame (the obvious guess) is a slumped,
 *  half-lying pose, not a stand. Swap these two constants to retune the pose —
 *  nothing else depends on the choice. If an Idle clip is ever baked into the
 *  GLB, point IDLE_POSE_CLIP at it and drop the freeze in CharacterActor. */
export const IDLE_POSE_CLIP: CharacterClip = 'Wave_for_Help_2'
export const IDLE_POSE_AT_END = false

/** The clip each phase plays (dock 'auto' mode). goto is water-aware: it
 *  swims when the footing is wet, walks ashore. The swim-DRAUGHT decision
 *  stays out of here (the actor uses `s.wet || s.phase === 'swim'` for y).
 *  NOTE 'idle' returns a clip it does NOT play: the actor freezes it on one
 *  frame (see IDLE_POSE_CLIP). That decision keys off the PHASE, never off the
 *  clip name — the same clip chosen from the dock still animates. */
export function behaviorClip(s: Pick<BehaviorState, 'phase' | 'wet'>): CharacterClip {
  switch (s.phase) {
    case 'walk':
      return 'Walking'
    case 'idle':
      return IDLE_POSE_CLIP
    case 'sleep':
      return 'Stand_To_Side_Lying'
    case 'wake':
      return 'Wake_Up_and_Look_Up'
    case 'swim':
      return 'Swim_Forward'
    case 'goto':
      return s.wet ? 'Swim_Forward' : 'Walking'
    case 'talk':
      return 'Talk_Passionately'
  }
}
