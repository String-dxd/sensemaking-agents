import { describe, expect, it } from 'vitest'
import {
  advanceBehavior,
  type BehaviorEnv,
  type BehaviorState,
  behaviorClip,
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

/** Tick the machine n times at a fixed dt. */
function tick(s: BehaviorState, env: BehaviorEnv, n: number, dt = 0.1): void {
  for (let i = 0; i < n; i++) advanceBehavior(s, dt, env)
}

describe('behavior machine transitions', () => {
  it('walk expires into hi, and hi resumes walking on the 70% branch', () => {
    // rand stub 0.5: no wander drift, walk duration 6.5 s, hi branch 0.5 < 0.7.
    const env = makeEnv({ rand: () => 0.5 })
    const s = createBehaviorState(0, 0, 0, () => 0.5)
    expect(s.phase).toBe('walk')
    expect(s.remaining).toBeCloseTo(6.5, 6)
    tick(s, env, 66) // 6.6 s > 6.5
    expect(s.phase).toBe('hi')
    tick(s, env, 29) // 2.9 s > the 2.8 s hi duration
    expect(s.phase).toBe('walk')
  })

  it('hi falls asleep on the 30% branch, then wake (2.6 s) leads back to walk', () => {
    // rand stub 0.9: hi branch 0.9 >= 0.7 → sleep for 6 + 0.9*6 = 11.4 s.
    const env = makeEnv({ rand: () => 0.9 })
    const s: BehaviorState = { phase: 'hi', x: 0, z: 0, yaw: 0, remaining: 0.1 }
    tick(s, env, 1) // 0.1 s consumes the last of hi → sleep entered fresh
    expect(s.phase).toBe('sleep')
    expect(s.remaining).toBeCloseTo(11.4, 4)
    const { x, z } = s
    tick(s, env, 115) // 11.5 s > 11.4
    expect(s.phase).toBe('wake')
    tick(s, env, 10) // 1.0 s into the 2.6 s wake — still waking
    expect(s.phase).toBe('wake')
    // Neither hi, sleep, nor (so far) wake moved the chick.
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
    expect(behaviorClip(s.phase)).toBe('Swim_Forward')
  })

  it('the leash refuses steps beyond MAX_SWIM_DIST — position holds while yaw steers home', () => {
    const env = makeEnv({
      rand: () => 0.5,
      heightAt: () => -1, // stays in water
      shoreDistanceAt: () => MAX_SWIM_DIST + 1, // every candidate step is too far out
    })
    const s: BehaviorState = { phase: 'swim', x: 5, z: 5, yaw: 0, remaining: 0 }
    tick(s, env, 50)
    expect(s.phase).toBe('swim')
    expect(s.x).toBe(5) // never moved
    expect(s.z).toBe(5)
    expect(s.yaw).toBeGreaterThan(0) // kept turning toward a legal step
  })

  it('triggerTalk works from walk AND sleep; talk is stationary and resumes walk', () => {
    for (const phase of ['walk', 'sleep'] as const) {
      const env = makeEnv({ rand: () => 0.5 })
      const s: BehaviorState = { phase, x: 1, z: 2, yaw: 0.3, remaining: 5 }
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
