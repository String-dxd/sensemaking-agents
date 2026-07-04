import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../src/core/motion/noise'
import { createIdleLayer, type IdleParams } from '../../../src/core/motion/proceduralIdle'

const H = 1 / 60

function makeTargets() {
  const chest = new Object3D()
  const head = new Object3D()
  head.position.y = 0.65
  const hips = new Object3D()
  return { chest, head, hips }
}

describe('createIdleLayer', () => {
  it('breath has the configured amplitude and period (measured via the layer clock)', () => {
    const targets = makeTargets()
    const layer = createIdleLayer(targets, mulberry32(1), { breathAmplitude: 0.015, breathPeriod: 3.8 })
    // Quarter period → peak inhale; half → neutral; three-quarters → peak exhale.
    layer.update(0, 3.8 / 4)
    expect(targets.chest.scale.x).toBeCloseTo(1.015, 5)
    expect(targets.head.position.y).toBeCloseTo(0.65 + 0.004, 5)
    layer.update(0, 3.8 / 2)
    expect(targets.chest.scale.x).toBeCloseTo(1, 5)
    layer.update(0, (3.8 * 3) / 4)
    expect(targets.chest.scale.x).toBeCloseTo(0.985, 5)
    // Full period back to neutral — the cycle repeats.
    layer.update(0, 3.8)
    expect(targets.chest.scale.x).toBeCloseTo(1, 5)
  })

  it('sway stays within ±swayAmplitude at every step', () => {
    const targets = makeTargets()
    const layer = createIdleLayer(targets, mulberry32(2), { swayAmplitude: 0.004 })
    for (let i = 0; i < 60 * 60; i++) {
      layer.update(H)
      expect(Math.abs(targets.hips.position.x)).toBeLessThanOrEqual(0.004 + 1e-9)
    }
  })

  it('is deterministic under a seeded RNG', () => {
    const a = makeTargets()
    const b = makeTargets()
    const layerA = createIdleLayer(a, mulberry32(1234))
    const layerB = createIdleLayer(b, mulberry32(1234))
    for (let i = 0; i < 60 * 30; i++) {
      layerA.update(H)
      layerB.update(H)
      expect(a.chest.scale.x).toBe(b.chest.scale.x)
      expect(a.head.position.y).toBe(b.head.position.y)
      expect(a.head.rotation.y).toBe(b.head.rotation.y)
      expect(a.hips.position.x).toBe(b.hips.position.x)
    }
  })

  it('produces zero motion when all amplitudes are zero', () => {
    const targets = makeTargets()
    const zero: Partial<IdleParams> = {
      breathAmplitude: 0,
      headBobAmplitude: 0,
      swayAmplitude: 0,
      microTurnMaxAngle: 0,
    }
    const layer = createIdleLayer(targets, mulberry32(3), zero)
    for (let i = 0; i < 60 * 30; i++) {
      layer.update(H)
      expect(targets.chest.scale.x).toBe(1)
      expect(targets.chest.scale.y).toBe(1)
      expect(targets.head.position.y).toBe(0.65)
      expect(targets.head.rotation.y).toBe(0)
      expect(targets.hips.position.x).toBe(0)
    }
  })

  it('micro head turns happen within the configured interval and stay within the max angle', () => {
    const targets = makeTargets()
    const layer = createIdleLayer(targets, mulberry32(9), {
      microTurnMinInterval: 5,
      microTurnMaxInterval: 12,
      microTurnMaxAngle: 0.12,
    })
    let firstTurnAt = -1
    for (let i = 0; i < 60 * 60; i++) {
      layer.update(H)
      const yaw = targets.head.rotation.y
      expect(Math.abs(yaw)).toBeLessThanOrEqual(0.12 + 1e-9)
      if (firstTurnAt < 0 && Math.abs(yaw) > 1e-6) firstTurnAt = (i + 1) * H
    }
    // A turn happened, and not before the minimum interval.
    expect(firstTurnAt).toBeGreaterThanOrEqual(5)
    expect(firstTurnAt).toBeLessThanOrEqual(12 + 1)
  })

  it('setChannels gates writes: breath-only leaves clip-owned transforms alone (plan 007 Play Mode)', () => {
    const targets = makeTargets()
    const layer = createIdleLayer(targets, mulberry32(21))
    for (let i = 0; i < 60 * 8; i++) layer.update(H) // accumulate offsets
    layer.setChannels({ headBob: false, sway: false, microTurn: false })
    // Disabling restores the base transforms once...
    expect(targets.head.position.y).toBe(0.65)
    expect(targets.head.rotation.y).toBe(0)
    expect(targets.hips.position.x).toBe(0)
    // ...and the clip layer's writes are never clobbered afterwards.
    for (let i = 0; i < 60 * 8; i++) {
      targets.head.position.y = 0.7 // "animated" values
      targets.head.rotation.y = 0.3
      targets.hips.position.x = 0.05
      layer.update(H)
      expect(targets.head.position.y).toBe(0.7)
      expect(targets.head.rotation.y).toBe(0.3)
      expect(targets.hips.position.x).toBe(0.05)
    }
    // Breath keeps running (clips never scale bones — no conflict).
    let sawBreath = false
    for (let i = 0; i < 60 * 4; i++) {
      layer.update(H)
      if (Math.abs(targets.chest.scale.x - 1) > 1e-4) sawBreath = true
    }
    expect(sawBreath).toBe(true)
  })

  it('re-enabling a channel resumes writes without a scheduler jump', () => {
    const targets = makeTargets()
    const layer = createIdleLayer(targets, mulberry32(22))
    layer.setChannels({ microTurn: false })
    for (let i = 0; i < 60 * 20; i++) layer.update(H)
    expect(targets.head.rotation.y).toBe(0)
    layer.setChannels({ microTurn: true })
    let moved = false
    for (let i = 0; i < 60 * 20; i++) {
      layer.update(H)
      expect(Math.abs(targets.head.rotation.y)).toBeLessThanOrEqual(0.12 + 1e-9)
      if (Math.abs(targets.head.rotation.y) > 1e-6) moved = true
    }
    expect(moved).toBe(true)
  })
})
