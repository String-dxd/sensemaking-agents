// Ported from island-editor/test/characterBehavior.test.ts — the editor's own
// suite run against the engine port (parity through shared vectors, U8).

import { describe, expect, it } from 'vitest'
import {
  advanceBehavior,
  type BehaviorEnv,
  type BehaviorState,
  behaviorClip,
  bodyTargetY,
  commandMoveTo,
  createBehaviorState,
  MAX_SWIM_DIST,
  sampleShoreDistance,
  TALK_SECONDS,
  triggerTalk,
} from '~/engine/student-space/Game/State/characterBehavior.ts'
import { mulberry32 } from '~/engine/student-space/Game/State/islandSpecCore/rand.ts'
import { shoreDistanceField } from '~/engine/student-space/Game/State/islandSpecCore/shoreField.ts'
import {
  cellCenter,
  createOceanGrid,
  DEFAULT_TIER_HEIGHTS,
  GRID_COLS,
} from '~/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts'

const WORLD = 24

/** Fake env: dry land everywhere, well inside the shore, seeded stream. */
function makeEnv(overrides: Partial<BehaviorEnv> = {}): BehaviorEnv {
  return {
    heightAt: () => 1,
    shoreDistanceAt: () => -2,
    seaLevel: 0,
    worldSize: WORLD,
    rand: mulberry32(42),
    ...overrides,
  }
}

/** A state literal with the plan-026 fields defaulted. */
function makeState(overrides: Partial<BehaviorState> = {}): BehaviorState {
  return {
    phase: 'walk',
    x: 0,
    z: 0,
    yaw: 0,
    remaining: 5,
    tx: 0,
    tz: 0,
    gotoPending: false,
    wet: false,
    ...overrides,
  }
}

/** Tick the machine n times at a fixed dt. */
function tick(s: BehaviorState, env: BehaviorEnv, n: number, dt = 0.1): void {
  for (let i = 0; i < n; i++) advanceBehavior(s, dt, env)
}

describe('behavior machine transitions', () => {
  it('walk expires into a standing IDLE (6–10 s), then walks on — the stop is not a nap', () => {
    // rand stub 0.5: no wander drift, walk 6.5 s; 0.5 >= NAP_CHANCE → idle, 8 s.
    const env = makeEnv({ rand: () => 0.5 })
    const s = createBehaviorState(0, 0, 0, () => 0.5)
    expect(s.phase).toBe('walk')
    expect(s.remaining).toBeCloseTo(6.5, 6)
    tick(s, env, 66) // 6.6 s > 6.5
    expect(s.phase).toBe('idle')
    expect(s.remaining).toBeCloseTo(6 + 0.5 * 4, 4)
    const { x, z } = s
    tick(s, env, 50) // 5 s into the 8 s idle — still idling, and rooted
    expect(s.phase).toBe('idle')
    expect(s.x).toBe(x)
    expect(s.z).toBe(z)
    tick(s, env, 40) // past the idle timer → walking again, no wake clip in sight
    expect(s.phase).toBe('walk')
  })

  it('a stop naps instead when the coin flip lands under NAP_CHANCE: sleep → wake → walk', () => {
    // rand stub 0.1: 0.1 < 0.25 → nap. (Walk duration 4.5 s, sleep roll 5.4 s.)
    const env = makeEnv({ rand: () => 0.1 })
    const s = createBehaviorState(0, 0, 0, () => 0.1)
    tick(s, env, 46) // past the 4.5 s walk
    expect(s.phase).toBe('sleep')
    tick(s, env, 55) // past the 5.4 s nap
    expect(s.phase).toBe('wake')
    tick(s, env, 27) // past the 2.6 s wake
    expect(s.phase).toBe('walk')
  })

  it('moves by x += sin(yaw)·v·dt, z += cos(yaw)·v·dt (three.js yaw convention)', () => {
    const env = makeEnv({ rand: () => 0.5 }) // 0.5 → zero wander drift
    const s0 = createBehaviorState(0, 0, 0, () => 0.5)
    advanceBehavior(s0, 0.1, env)
    expect(s0.z).toBeGreaterThan(0) // yaw 0 faces +Z
    expect(s0.x).toBeCloseTo(0, 9)

    const s90 = createBehaviorState(0, 0, Math.PI / 2, () => 0.5)
    advanceBehavior(s90, 0.1, env)
    expect(s90.x).toBeGreaterThan(0) // yaw π/2 faces +X
    expect(s90.z).toBeCloseTo(0, 9)
  })

  it('walking into water enters swim, and swim maps to the Swim_Forward clip', () => {
    const env = makeEnv({ rand: () => 0.5, heightAt: () => -1 }) // everywhere underwater
    const s = createBehaviorState(0, 0, 0, () => 0.5)
    advanceBehavior(s, 0.1, env)
    expect(s.phase).toBe('swim')
    expect(s.wet).toBe(true)
    expect(behaviorClip(s)).toBe('Swim_Forward')
  })

  it('the leash refuses steps beyond MAX_SWIM_DIST — position holds while yaw steers home', () => {
    const env = makeEnv({
      rand: () => 0.5,
      heightAt: () => -1, // stays in water
      shoreDistanceAt: () => MAX_SWIM_DIST + 1, // every candidate step is too far out
    })
    const s = makeState({ phase: 'swim', x: 5, z: 5, remaining: 0 })
    tick(s, env, 50)
    expect(s.phase).toBe('swim')
    expect(s.x).toBe(5) // never moved
    expect(s.z).toBe(5)
    expect(s.yaw).toBeGreaterThan(0) // kept turning toward a legal step
  })

  it('triggerTalk works from walk AND sleep; talk is stationary and resumes walk', () => {
    for (const phase of ['walk', 'sleep'] as const) {
      const env = makeEnv({ rand: () => 0.5 })
      const s = makeState({ phase, x: 1, z: 2, yaw: 0.3 })
      triggerTalk(s)
      expect(s.phase).toBe('talk')
      expect(s.remaining).toBe(TALK_SECONDS)
      tick(s, env, 34) // 3.4 s < 3.5 — still talking, never moving
      expect(s.phase).toBe('talk')
      expect(s.x).toBe(1)
      expect(s.z).toBe(2)
      tick(s, env, 2) // crosses TALK_SECONDS
      expect(s.phase).toBe('walk')
    }
  })

  it('the world-edge leash keeps a wanderer heading outward inside the bounds', () => {
    const env = makeEnv({ rand: () => 0.5 }) // no wander drift
    // Start near the +x margin (worldSize/2 - 1 = 11), heading straight out.
    const s = createBehaviorState(10.5, 0, Math.PI / 2, () => 0.5)
    const limit = WORLD / 2 - 1
    for (let i = 0; i < 100; i++) {
      advanceBehavior(s, 0.1, env)
      expect(Math.abs(s.x)).toBeLessThanOrEqual(limit + 1e-9)
      expect(Math.abs(s.z)).toBeLessThanOrEqual(limit + 1e-9)
    }
  })

  it('is deterministic: same seed + env + dt sequence → identical state', () => {
    const makeSeededEnv = () => makeEnv({ rand: mulberry32(7) })
    const a = createBehaviorState(1, -2, 0.4, mulberry32(99))
    const b = createBehaviorState(1, -2, 0.4, mulberry32(99))
    const envA = makeSeededEnv()
    const envB = makeSeededEnv()
    const dts = [0.016, 0.032, 0.1, 0.05, 0.016, 0.2, 0.016]
    for (let round = 0; round < 40; round++) {
      for (const dt of dts) {
        advanceBehavior(a, dt, envA)
        advanceBehavior(b, dt, envB)
      }
    }
    expect(a).toEqual(b)
  })
})

describe('click-to-move (goto)', () => {
  it('commandMoveTo from walk enters goto, converges on the target, and arrival stops', () => {
    const env = makeEnv({ rand: () => 0.5 })
    const s = createBehaviorState(0, 0, 0, () => 0.5)
    commandMoveTo(s, 0, 1.5) // straight ahead of yaw 0
    expect(s.phase).toBe('goto')
    expect(s.gotoPending).toBe(false)
    let prev = Math.hypot(s.tx - s.x, s.tz - s.z)
    for (let i = 0; i < 10; i++) {
      advanceBehavior(s, 0.1, env)
      const d = Math.hypot(s.tx - s.x, s.tz - s.z)
      expect(d).toBeLessThan(prev) // strictly decreasing over a second of ticks
      prev = d
    }
    tick(s, env, 40) // more than enough to cover the remaining ~0.8 u
    expect(s.phase).toBe('idle') // it stopped on DRY land → stands (rand 0.5 ≥ NAP_CHANCE)
  })

  it('a goto that finishes IN THE WATER swims — a bird never stops at sea', () => {
    // Underwater everywhere, well inside the leash: the goto reaches its target
    // and hands off to swim instead of lying down asleep on the open sea.
    const env = makeEnv({ rand: () => 0.5, heightAt: () => -1, shoreDistanceAt: () => 0.5 })
    const s = makeState({ phase: 'goto', x: 0, z: 0, yaw: 0, tx: 0, tz: 1.5, wet: true })
    tick(s, env, 80)
    expect(s.phase).toBe('swim')
    expect(s.wet).toBe(true)
  })

  it('a swim whose paddle-about expires steers back toward land and ends ashore', () => {
    // Shore distance falls off toward -z, so "downhill" (toward land) is -z; the
    // bird starts facing +z (out to sea) and must turn around. Land begins at z < 0.
    const env = makeEnv({
      rand: () => 0.5,
      heightAt: (_x: number, z: number) => (z < 0 ? 1 : -1), // dry land at z < 0
      shoreDistanceAt: (_x: number, z: number) => z, // + = water, decreasing toward land
    })
    const s = makeState({ phase: 'swim', x: 0, z: 1, yaw: 0, remaining: 0, wet: true })
    // ~1.3 s to turn around, then ~4 s of swimming home; 8 s covers it with room
    // to spare while staying inside the walk roll that follows.
    tick(s, env, 80)
    expect(s.phase).toBe('walk') // reached dry land and resumed walking
    expect(s.z).toBeLessThan(0)
  })

  it('commandMoveTo from sleep wakes first (gotoPending), then goes — not walk', () => {
    const env = makeEnv({ rand: () => 0.5 })
    const s = makeState({ phase: 'sleep', remaining: 8 })
    commandMoveTo(s, 3, 4)
    expect(s.phase).toBe('wake')
    expect(s.gotoPending).toBe(true)
    expect(s.remaining).toBeCloseTo(2.6, 6)
    tick(s, env, 27) // 2.7 s > 2.6
    expect(s.phase).toBe('goto')
    expect(s.tx).toBe(3)
    expect(s.tz).toBe(4)
  })

  it('steering toward a target directly behind never turns faster than 3.5 rad/s', () => {
    const env = makeEnv({ rand: () => 0.5 })
    const s = makeState({ phase: 'goto', yaw: 0, tx: 0, tz: -5 }) // target behind (want = π)
    const dt = 0.1
    for (let i = 0; i < 12; i++) {
      const before = s.yaw
      advanceBehavior(s, dt, env)
      expect(Math.abs(s.yaw - before)).toBeLessThanOrEqual(3.5 * dt + 1e-9)
    }
  })

  it('goto is water-aware: wet maps to Swim_Forward, dry to Walking, and advancing into water sets wet', () => {
    expect(behaviorClip({ phase: 'goto', wet: true })).toBe('Swim_Forward')
    expect(behaviorClip({ phase: 'goto', wet: false })).toBe('Walking')

    const env = makeEnv({ rand: () => 0.5, heightAt: () => -1 }) // wet region everywhere
    const s = makeState({ phase: 'goto', tx: 0, tz: 5 })
    expect(s.wet).toBe(false)
    advanceBehavior(s, 0.1, env)
    expect(s.wet).toBe(true)
    expect(behaviorClip(s)).toBe('Swim_Forward')
  })

  it('a leash-blocked route abandons the target instead of circling forever', () => {
    // Wet start: every candidate step exceeds the leash → back to plain swim.
    // (wet: true — plan 027: goto's footing reads the hysteresis-maintained
    // s.wet instead of re-deriving, so an in-water fixture must carry it.)
    const wetEnv = makeEnv({
      rand: () => 0.5,
      heightAt: () => -1,
      shoreDistanceAt: () => MAX_SWIM_DIST + 1,
    })
    const inWater = makeState({ phase: 'goto', x: 5, z: 5, tx: 8, tz: 8, wet: true })
    advanceBehavior(inWater, 0.1, wetEnv)
    expect(inWater.phase).toBe('swim')

    // Dry start whose next step lands in blocked water → re-rolled walk.
    const dryEnv = makeEnv({
      rand: () => 0.5,
      heightAt: (_x: number, z: number) => (z > 0.01 ? -1 : 1), // water just ahead
      shoreDistanceAt: () => MAX_SWIM_DIST + 1,
    })
    const ashore = makeState({ phase: 'goto', x: 0, z: 0, yaw: 0, tx: 0, tz: 5 })
    advanceBehavior(ashore, 0.1, dryEnv)
    expect(ashore.phase).toBe('walk')
    expect(ashore.remaining).toBeCloseTo(6.5, 6) // rollWalk re-rolled 4 + 0.5·5
  })

  it('triggerTalk during goto drops the target: talk, then walk (never back to goto)', () => {
    const env = makeEnv({ rand: () => 0.5 })
    const s = makeState({ phase: 'goto', tx: 5, tz: 5 })
    triggerTalk(s)
    expect(s.phase).toBe('talk')
    tick(s, env, 36) // crosses TALK_SECONDS
    expect(s.phase).toBe('walk')
    expect(s.gotoPending).toBe(false)
  })
})

describe('water hysteresis (plan 027)', () => {
  const BETWEEN = 0 // between WATER_ENTER (-0.02) and WATER_EXIT (0.02): the waterline itself

  it('a walking bird does NOT enter swim in the hysteresis band', () => {
    const env = makeEnv({ rand: () => 0.5, heightAt: () => BETWEEN })
    const s = createBehaviorState(0, 0, 0, () => 0.5)
    tick(s, env, 20)
    expect(s.phase).toBe('walk')
    expect(s.wet).toBe(false) // never crossed the enter threshold
  })

  it('a swimming bird does NOT exit swim in the hysteresis band (no flip-flop zone)', () => {
    const env = makeEnv({ rand: () => 0.5, heightAt: () => BETWEEN })
    const s = makeState({ phase: 'swim', x: 5, z: 5, wet: true })
    tick(s, env, 20)
    expect(s.phase).toBe('swim')
    expect(s.wet).toBe(true) // once wet, stays wet until clearly ashore
  })

  it('the swim exits once the ground is clearly above the exit threshold', () => {
    const env = makeEnv({ rand: () => 0.5, heightAt: () => 0.1 }) // > seaLevel + 0.02
    const s = makeState({ phase: 'swim', x: 5, z: 5, wet: true })
    advanceBehavior(s, 0.1, env)
    expect(s.phase).toBe('walk')
    expect(s.wet).toBe(false)
  })

  // The band must clear the beach: tier 1's top is the lowest LAND the bird can
  // stand on, so if the exit threshold sits above it the bird beaches itself and
  // keeps swimming across dry sand (observed: a bird doing breaststroke up the shore).
  it('a swimming bird that reaches the sand tier comes ashore', () => {
    const beachTop = DEFAULT_TIER_HEIGHTS[1] ?? 0.05 // 0.05 — dry land, the lowest there is
    const env = makeEnv({ rand: () => 0.5, heightAt: () => beachTop })
    const s = makeState({ phase: 'swim', x: 5, z: 5, wet: true })
    advanceBehavior(s, 0.1, env)
    expect(s.phase).toBe('walk')
    expect(s.wet).toBe(false) // no swim clip, no swim draught on the sand
  })
})

describe('bodyTargetY (swim draught never sinks into the island)', () => {
  const SEA = 0
  const SINK = 0.12 // CharacterActor.SWIM_SINK

  it('ashore, the body follows the ground exactly', () => {
    expect(bodyTargetY(false, SEA, SINK, 0.5)).toBe(0.5)
    expect(bodyTargetY(false, SEA, SINK, 1.0)).toBe(1.0)
  })

  it('over deep water, the body rides at the fixed draught below the waterline', () => {
    expect(bodyTargetY(true, SEA, SINK, -1.2)).toBeCloseTo(SEA - SINK, 9)
    expect(bodyTargetY(true, SEA, SINK, -0.5)).toBeCloseTo(SEA - SINK, 9)
  })

  it('coming ashore, the body rides UP the seabed instead of burying in it', () => {
    // Beach top (tier 1 = 0.05) is above the -0.12 draught: the swimming body
    // sits ON the sand, never inside it. This is the "swim into the island" fix.
    expect(bodyTargetY(true, SEA, SINK, 0.05)).toBe(0.05)
    // Invariant: a swimming body is NEVER below the terrain beneath it, at any
    // seabed height it can cross before the swim→walk exit fires.
    for (const ground of [-1.2, -0.5, -0.12, -0.05, 0, 0.02, 0.05]) {
      expect(bodyTargetY(true, SEA, SINK, ground)).toBeGreaterThanOrEqual(ground - 1e-9)
    }
  })
})

describe('sampleShoreDistance', () => {
  it('flips sign between a land-cell center and far ocean on a real field', () => {
    const grid = createOceanGrid()
    grid.tiers[32 * GRID_COLS + 32] = 4 // one tall land cell (shoreField test fixture)
    const field = shoreDistanceField(grid, WORLD)
    const { x, z } = cellCenter(WORLD, grid, 32, 32)
    expect(sampleShoreDistance(field, WORLD, x, z)).toBeLessThan(0) // land
    expect(sampleShoreDistance(field, WORLD, -11, -11)).toBeGreaterThan(0) // far ocean
  })
})
