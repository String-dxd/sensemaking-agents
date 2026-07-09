import { describe, expect, it } from 'vitest'
import { CanopySpring, gustStrength, windDirection } from '../src/scene/wind'

describe('windDirection', () => {
  it('is always a unit vector', () => {
    for (let t = 0; t < 300; t += 1.7) {
      const d = windDirection(t)
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 9)
    }
  })
})

describe('gustStrength', () => {
  it('stays in [0, 1] and actually reaches both lulls and strong gusts', () => {
    let min = 1
    let max = 0
    for (let t = 0; t < 600; t += 0.05) {
      const g = gustStrength(t, 0, 0)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      min = Math.min(min, g)
      max = Math.max(max, g)
    }
    expect(min).toBeLessThan(0.05) // becalmed lulls exist
    expect(max).toBeGreaterThan(0.9) // saturated gusts exist
  })

  it('travels: a tree at (x, z) sees the origin gust delayed by (x + 0.6z) · 0.35 s', () => {
    for (const [x, z] of [
      [3, 0],
      [0, 5],
      [-2, 4],
    ]) {
      for (let t = 10; t < 40; t += 3.1) {
        expect(gustStrength(t, x, z)).toBeCloseTo(gustStrength(t - (x + 0.6 * z) * 0.35, 0, 0), 12)
      }
    }
  })
})

describe('CanopySpring', () => {
  const DT = 1 / 60

  /** Run a spring through `seconds` of simulated frames. */
  function run(spring: CanopySpring, seconds: number, amp = 1, dt = DT, x = 0, z = 0): void {
    for (let t = 0; t < seconds; t += dt) spring.step(t, dt, x, z, amp)
  }

  it('starts at rest', () => {
    const s = new CanopySpring(0)
    expect(s.rotX).toBe(0)
    expect(s.rotZ).toBe(0)
    expect(s.scaleY).toBe(1)
  })

  it('responds to wind but stays bounded (lean + overshoot never exceeds ~3× the max target)', () => {
    const s = new CanopySpring(1.3)
    let peak = 0
    for (let t = 0; t < 120; t += DT) {
      s.step(t, DT, 0, 0, 1)
      peak = Math.max(peak, Math.hypot(s.rotX, s.rotZ))
      expect(Number.isFinite(s.rotX)).toBe(true)
      expect(Number.isFinite(s.rotZ)).toBe(true)
      expect(Math.hypot(s.rotX, s.rotZ)).toBeLessThan(0.3)
    }
    expect(peak).toBeGreaterThan(0.02) // it does visibly sway
  })

  it('a windAmp of 0 never moves the crown', () => {
    const s = new CanopySpring(2)
    run(s, 30, 0)
    expect(s.rotX).toBeCloseTo(0, 6)
    expect(s.rotZ).toBeCloseTo(0, 6)
  })

  it('clamps runaway frame deltas (a 2 s tab-switch frame cannot blow up the integrator)', () => {
    const s = new CanopySpring(0.4)
    for (let i = 0; i < 200; i++) s.step(i * 2, 2, 0, 0, 1)
    expect(Number.isFinite(s.rotX)).toBe(true)
    expect(Math.hypot(s.rotX, s.rotZ)).toBeLessThan(0.3)
  })

  it('ignores non-positive deltas', () => {
    const s = new CanopySpring(0)
    s.step(5, 0, 0, 0, 1)
    s.step(5, -1, 0, 0, 1)
    expect(s.rotX).toBe(0)
    expect(s.rotZ).toBe(0)
  })

  it('is deterministic: two springs with the same phase and inputs agree exactly', () => {
    const a = new CanopySpring(0.9)
    const b = new CanopySpring(0.9)
    run(a, 20)
    run(b, 20)
    expect(a.rotX).toBe(b.rotX)
    expect(a.rotZ).toBe(b.rotZ)
    expect(a.scaleY).toBe(b.scaleY)
  })

  it('squash-and-stretch keeps scaleY in a sane band around 1', () => {
    const s = new CanopySpring(3)
    for (let t = 0; t < 60; t += DT) {
      s.step(t, DT, 2, 1, 1)
      expect(s.scaleY).toBeGreaterThan(0.85)
      expect(s.scaleY).toBeLessThan(1.1)
    }
  })
})
