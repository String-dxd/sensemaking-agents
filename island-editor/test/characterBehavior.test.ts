import { describe, expect, it } from 'vitest'
import {
  advanceBehavior,
  type BehaviorEnv,
  type BehaviorState,
  behaviorClip,
  commandMoveTo,
  createBehaviorState,
  MAX_SWIM_DIST,
  sampleShoreDistance,
  TALK_SECONDS,
  triggerTalk,
} from '../src/models/characterBehavior'
import { mulberry32 } from '../src/models/rand'
import { shoreDistanceField } from '../src/terrain/shoreField'
import { cellCenter, createOceanGrid, GRID_COLS } from '../src/terrain/terrainGrid'

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
  return { phase: 'walk', x: 0, z: 0, yaw: 0, remaining: 5, tx: 0, tz: 0, gotoPending: false, wet: false, ...overrides }
}

/** Tick the machine n times at a fixed dt. */
function tick(s: BehaviorState, env: BehaviorEnv, n: number, dt = 0.1): void {
  for (let i = 0; i < n; i++) advanceBehavior(s, dt, env)
}

describe('behavior machine transitions', () => {
  it('walk expires straight into sleep (5–9 s), then wake (2.6 s), then walk — no wave', () => {
    // rand stub 0.5: no wander drift, walk duration 6.5 s, sleep roll 7 s.
    const env = makeEnv({ rand: () => 0.5 })
    const s = createBehaviorState(0, 0, 0, () => 0.5)
    expect(s.phase).toBe('walk')
    expect(s.remaining).toBeCloseTo(6.5, 6)
    tick(s, env, 66) // 6.6 s > 6.5 — plan 026: the stop is a nap, not a wave
    expect(s.phase).toBe('sleep')
    expect(s.remaining).toBeCloseTo(5 + 0.5 * 4, 4)
    const { x, z } = s
    tick(s, env, 71) // 7.1 s > 7.0
    expect(s.phase).toBe('wake')
    tick(s, env, 10) // 1.0 s into the 2.6 s wake — still waking
    expect(s.phase).toBe('wake')
    // Neither sleep nor (so far) wake moved the chick.
    expect(s.x).toBe(x)
    expect(s.z).toBe(z)
    tick(s, env, 20) // past the wake timer → walking again
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
  it('commandMoveTo from walk enters goto, converges on the target, and arrival naps', () => {
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
    expect(s.phase).toBe('sleep') // it stopped → per plan 026, it naps
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
    const wetEnv = makeEnv({ rand: () => 0.5, heightAt: () => -1, shoreDistanceAt: () => MAX_SWIM_DIST + 1 })
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
  const BETWEEN = 0.04 // between WATER_ENTER (0.02) and WATER_EXIT (0.07)

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
    const env = makeEnv({ rand: () => 0.5, heightAt: () => 0.1 }) // > seaLevel + 0.07
    const s = makeState({ phase: 'swim', x: 5, z: 5, wet: true })
    advanceBehavior(s, 0.1, env)
    expect(s.phase).toBe('walk')
    expect(s.wet).toBe(false)
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
