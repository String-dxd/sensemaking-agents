import { describe, expect, it } from 'vitest'
import { createFixedStepper } from '../../../src/core/motion/springSolver'

describe('createFixedStepper', () => {
  it('runs exactly one 60 Hz substep per 1/60 s frame', () => {
    const steps: number[] = []
    const stepper = createFixedStepper((h) => steps.push(h))
    for (let i = 0; i < 10; i++) {
      expect(stepper.advance(1 / 60)).toBe(1)
    }
    expect(steps).toHaveLength(10)
    for (const h of steps) expect(h).toBeCloseTo(1 / 60, 12)
  })

  it('clamps a 200 ms frame to 3 substeps and drops the debt (spiral-of-death clamp)', () => {
    let calls = 0
    const stepper = createFixedStepper(() => calls++)
    expect(stepper.advance(0.2)).toBe(3)
    expect(calls).toBe(3)
    // Debt was dropped: an immediate zero-dt frame runs nothing…
    expect(stepper.advance(0)).toBe(0)
    // …and a normal frame runs exactly one substep again.
    expect(stepper.advance(1 / 60)).toBe(1)
    expect(calls).toBe(4)
  })

  it('accumulates sub-step-size frames until a full substep fits', () => {
    let calls = 0
    const stepper = createFixedStepper(() => calls++)
    for (let i = 0; i < 10; i++) stepper.advance(0.008) // 80 ms total
    expect(calls).toBe(Math.floor(0.08 / (1 / 60))) // 4
  })
})
