import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — engine source is JavaScript without companion declarations.
import Time from '~/engine/student-space/Game/State/Time.js'

/**
 * `Time.elapsed` is the animation clock: shaders (`uTime`), wander deadlines
 * (`elapsed + duration`), and weather phase ends all read it. When the render
 * loop is paused — a routed sheet covering the world, or a hidden tab — no
 * frames tick, so the next `update()` sees a wall-clock gap the size of the
 * whole pause. Accumulating that raw gap would jerk every animation forward
 * and expire every deadline instantly, so the clamp has to land *before* the
 * `elapsed +=`, not after it.
 *
 * `Time`'s constructor and `update()` only read `Date.now()`, so these tests
 * drive it directly with a spied clock — no engine boot needed.
 */

const MAX_DELTA = 60 / 1000

interface TimeInstance {
  start: number
  current: number
  elapsed: number
  rawDelta: number
  delta: number
  update(): void
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Time.update', () => {
  it('clamps delta and elapsed after a long pause instead of jumping the whole gap', () => {
    let nowMs = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const time: TimeInstance = new Time()

    // One normal frame first, so `current` is primed off the same clock.
    nowMs += 16
    time.update()
    const elapsedAfterFirstFrame = time.elapsed

    // Now simulate a two-minute stay on a routed sheet: no frames ticked,
    // so the next update() sees 120s of wall clock at once.
    nowMs += 120_000
    time.update()

    expect(time.rawDelta).toBeCloseTo(120, 5)
    expect(time.delta).toBe(MAX_DELTA)
    expect(time.elapsed - elapsedAfterFirstFrame).toBeCloseTo(MAX_DELTA, 10)
  })

  it('is unchanged for a normal 60fps frame — delta is the true wall-clock gap', () => {
    let nowMs = 2_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const time: TimeInstance = new Time()
    nowMs += 16
    time.update()

    expect(time.rawDelta).toBeCloseTo(0.016, 10)
    expect(time.delta).toBeCloseTo(0.016, 10)
    expect(time.elapsed).toBeCloseTo(0.016, 10)
  })

  it('accumulates elapsed across many frames without drifting from the sum of deltas', () => {
    let nowMs = 3_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const time: TimeInstance = new Time()
    let sum = 0
    for (let i = 0; i < 10; i++) {
      nowMs += 16
      time.update()
      sum += time.delta
    }

    expect(time.elapsed).toBeCloseTo(sum, 10)
    expect(time.elapsed).toBeCloseTo(0.16, 10)
  })
})
