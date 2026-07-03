// Locomotion (plan 007 step 3): circle path, speed easing, gait mapping with
// hysteresis, and gait-sync timeScale calibration.

import { Group, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  createLocomotion,
  RUN_CLIP_SPEED,
  RUN_SPEED,
  WALK_CLIP_SPEED,
  WALK_SPEED,
} from '../../../src/core/motion/locomotion'

const H = 1 / 60

function settle(loco: { update(dt: number): void }, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / H); i++) loco.update(H)
}

describe('createLocomotion', () => {
  it('stays on the radius-1.2 circle through home, heading tangent', () => {
    const root = new Group()
    root.position.set(0.5, 0, -0.25) // arbitrary home
    const loco = createLocomotion(root, { radius: 1.2 })
    loco.setTargetSpeed(WALK_SPEED)
    const centre = new Vector3(0.5 - 1.2, 0, -0.25)
    settle(loco, 5)
    const p = root.position
    expect(Math.hypot(p.x - centre.x, p.z - centre.z)).toBeCloseTo(1.2, 6)
    expect(p.y).toBe(0)
    // Heading is the travel tangent: advancing a hair moves the root along
    // the direction the character faces (+Z rotated by rotation.y).
    const before = p.clone()
    loco.update(H)
    const facing = new Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y))
    const step = root.position.clone().sub(before).normalize()
    expect(step.dot(facing)).toBeGreaterThan(0.999)
  })

  it('eases the actual speed toward the target (bounded accel)', () => {
    const root = new Group()
    const loco = createLocomotion(root)
    loco.setTargetSpeed(RUN_SPEED)
    settle(loco, 0.1)
    expect(loco.getSpeed()).toBeGreaterThan(0.2)
    expect(loco.getSpeed()).toBeLessThan(0.4) // ACCEL = 3 m/s² -> ~0.3 after 0.1 s
    settle(loco, 2)
    expect(loco.getSpeed()).toBeCloseTo(RUN_SPEED, 5)
  })

  it('maps speed to gait with hysteresis (no flapping on the boundary)', () => {
    const root = new Group()
    const loco = createLocomotion(root)
    expect(loco.getGaitState()).toBe('idle')
    loco.setTargetSpeed(WALK_SPEED)
    settle(loco, 1)
    expect(loco.getGaitState()).toBe('walk')
    loco.setTargetSpeed(1.45) // above the plain 1.4 boundary but below promote (1.5)
    settle(loco, 1)
    expect(loco.getGaitState()).toBe('walk')
    loco.setTargetSpeed(1.55)
    settle(loco, 1)
    expect(loco.getGaitState()).toBe('run')
    loco.setTargetSpeed(1.4) // above demote (1.3): stays run
    settle(loco, 1)
    expect(loco.getGaitState()).toBe('run')
    loco.setTargetSpeed(1.25)
    settle(loco, 1)
    expect(loco.getGaitState()).toBe('walk')
    loco.setTargetSpeed(0)
    settle(loco, 2)
    expect(loco.getGaitState()).toBe('idle')
  })

  it('gait timeScale matches ground speed to the measured clip speeds', () => {
    const root = new Group()
    const loco = createLocomotion(root)
    loco.setTargetSpeed(WALK_CLIP_SPEED)
    settle(loco, 2)
    expect(loco.getGaitTimeScale()).toBeCloseTo(1, 5) // authored speed -> 1:1 playback
    loco.setTargetSpeed(RUN_SPEED)
    settle(loco, 2)
    expect(loco.getGaitTimeScale()).toBeCloseTo(RUN_SPEED / RUN_CLIP_SPEED, 5)
  })

  it('reset snaps home and zeroes speed and gait', () => {
    const root = new Group()
    root.position.set(1, 0, 2)
    root.rotation.y = 0.3
    const loco = createLocomotion(root)
    loco.setTargetSpeed(RUN_SPEED)
    settle(loco, 3)
    expect(root.position.distanceTo(new Vector3(1, 0, 2))).toBeGreaterThan(0.1)
    loco.reset()
    expect(root.position.x).toBe(1)
    expect(root.position.z).toBe(2)
    expect(root.rotation.y).toBe(0.3)
    expect(loco.getSpeed()).toBe(0)
    expect(loco.getGaitState()).toBe('idle')
  })
})
