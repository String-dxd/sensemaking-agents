// Foot IK (plan 007 step 3): analytic two-bone solver exactness + clamping,
// stance detection on a synthetic bobbing foot, and correction pinning.

import { Bone, Group, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createFootIK, solveTwoBoneIK } from '../../../src/core/motion/footIK'

const H = 1 / 60

/** Straight-down leg: hip at (0,1,0), knee (0,0.5,0), ankle (0,0,0). l1=l2=0.5. */
function makeLeg() {
  const root = new Group()
  const upper = new Bone()
  upper.name = 'upperLeg'
  upper.position.set(0, 1, 0)
  const lower = new Bone()
  lower.name = 'lowerLeg'
  lower.position.set(0, -0.5, 0)
  const foot = new Bone()
  foot.name = 'foot'
  foot.position.set(0, -0.5, 0)
  lower.add(foot)
  upper.add(lower)
  root.add(upper)
  root.updateWorldMatrix(true, true)
  return { root, upper, lower, foot }
}

function footWorld(foot: Bone): Vector3 {
  foot.updateWorldMatrix(true, false)
  return new Vector3().setFromMatrixPosition(foot.matrixWorld)
}

/**
 * Emulate the mixer rewriting the pose each frame (in the real pipeline the
 * animation phase resets bone rotations before footIK corrects them; without
 * this, corrections would accumulate in the bones across frames).
 */
function rewritePose(leg: { upper: Bone; lower: Bone; foot: Bone }, footRollX = 0): void {
  leg.upper.quaternion.identity()
  leg.lower.quaternion.identity()
  leg.foot.quaternion.identity()
  if (footRollX !== 0) leg.foot.rotation.x = footRollX
}

describe('solveTwoBoneIK', () => {
  it.each([
    [0.2, 0.3, 0.1],
    [0.0, 0.2, 0.4],
    [-0.3, 0.6, 0.2],
  ])('reaches the reachable target (%f, %f, %f) exactly', (x, y, z) => {
    const { upper, lower, foot } = makeLeg()
    const target = new Vector3(x, y, z)
    solveTwoBoneIK(upper, lower, foot, target)
    expect(footWorld(foot).distanceTo(target)).toBeLessThan(1e-6)
  })

  it('clamps at full extension without NaN', () => {
    const { upper, lower, foot } = makeLeg()
    solveTwoBoneIK(upper, lower, foot, new Vector3(0, -1.5, 0)) // 2.5 m away, reach is 1
    const p = footWorld(foot)
    expect(Number.isNaN(p.x) || Number.isNaN(p.y) || Number.isNaN(p.z)).toBe(false)
    // Foot sits at max reach along the hip->target direction.
    expect(p.distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(1, 3)
    expect(p.y).toBeCloseTo(0, 3)
  })

  it('clamps at full fold (target on the hip region) without NaN', () => {
    const { upper, lower, foot } = makeLeg()
    solveTwoBoneIK(upper, lower, foot, new Vector3(0, 0.999, 0))
    const p = footWorld(foot)
    expect(Number.isNaN(p.x) || Number.isNaN(p.y) || Number.isNaN(p.z)).toBe(false)
  })

  it('bends a straight leg toward the pole direction', () => {
    const { upper, lower, foot } = makeLeg()
    // Shorten the reach straight down: the knee must leave the line; with the
    // default +Z pole it must move character-forward.
    solveTwoBoneIK(upper, lower, foot, new Vector3(0, 0.2, 0))
    lower.updateWorldMatrix(true, false)
    const knee = new Vector3().setFromMatrixPosition(lower.matrixWorld)
    expect(knee.z).toBeGreaterThan(0.05)
    expect(footWorld(foot).distanceTo(new Vector3(0, 0.2, 0))).toBeLessThan(1e-6)
  })

  it('is exact from an already-bent pose (correction-style call)', () => {
    const { upper, lower, foot } = makeLeg()
    solveTwoBoneIK(upper, lower, foot, new Vector3(0, 0.3, 0.2)) // bend it first
    const target = new Vector3(0.05, 0.25, 0.22) // then a small correction
    solveTwoBoneIK(upper, lower, foot, target)
    expect(footWorld(foot).distanceTo(target)).toBeLessThan(1e-6)
  })
})

describe('createFootIK', () => {
  it('detects stance windows on a synthetic bobbing foot track', () => {
    const { root, upper, lower, foot } = makeLeg()
    const ik = createFootIK([{ upper, lower, foot }], { groundY: 0 })
    // Bob the whole leg: airborne + moving while up, planted + still while down.
    const stanceLog: boolean[] = []
    for (let i = 0; i <= 120; i++) {
      const t = i * H
      const phase = (t * 2) % 2 // 2 s cycle: [0,1) up+moving, [1,2) down+still
      root.position.y = phase < 1 ? 0.12 * Math.sin(Math.PI * phase) : 0
      root.position.z = phase < 1 ? root.position.z + 0.4 * H : root.position.z
      root.updateWorldMatrix(true, true)
      ik.update(H)
      stanceLog.push(ik.getLegDebug(0).stance)
    }
    // Mid-swing (t≈0.25 s, i≈15): high + moving -> not stance.
    expect(stanceLog[15]).toBe(false)
    // Mid-plant (t≈1.67 s, i≈100): low + still -> stance.
    expect(stanceLog[100]).toBe(true)
  })

  it('pins the planted foot to its anchor and blends in over ~80 ms', () => {
    const { root, upper, lower, foot } = makeLeg()
    const ik = createFootIK([{ upper, lower, foot }], { groundY: 0 })
    ik.update(H) // establish stance at rest
    const anchor = ik.getLegDebug(0)
    expect(anchor.stance).toBe(true)
    // Animated pose skates sideways 2 mm/frame (0.12 m/s — under the stance
    // velocity gate, exactly the failure mode IK exists for). The pin should
    // hold the foot at the anchor while the root drifts 3 cm.
    for (let i = 0; i < 15; i++) {
      rewritePose({ upper, lower, foot })
      root.position.x += 0.002
      root.updateWorldMatrix(true, true)
      ik.update(H)
    }
    expect(ik.getLegDebug(0).weight).toBe(1)
    const p = footWorld(foot)
    expect(Math.abs(p.x - (anchor.anchor?.x ?? Number.NaN))).toBeLessThan(1e-3)
  })

  it('clamps the correction to maxCorrection', () => {
    const { root, upper, lower, foot } = makeLeg()
    const ik = createFootIK([{ upper, lower, foot }], { groundY: 0, maxCorrection: 0.06 })
    ik.update(H)
    // Slow-drift the animated pose 12 cm — twice the clamp. The pin must give
    // up at 6 cm (it fixes skating, it does not invent steps).
    for (let i = 0; i < 60; i++) {
      rewritePose({ upper, lower, foot })
      root.position.x += 0.002
      root.updateWorldMatrix(true, true)
      ik.update(H)
    }
    const p = footWorld(foot)
    // Uncorrected foot would be at x=0.12; correction pulls at most 6 cm back.
    expect(p.x).toBeGreaterThanOrEqual(0.12 - 0.06 - 1e-3)
    expect(p.x).toBeLessThan(0.12)
  })

  it('preserves the animated foot orientation through the solve', () => {
    const { root, upper, lower, foot } = makeLeg()
    foot.rotation.x = 0.4 // authored foot roll
    root.updateWorldMatrix(true, true)
    const ik = createFootIK([{ upper, lower, foot }], { groundY: 0 })
    ik.update(H)
    for (let i = 0; i < 15; i++) {
      rewritePose({ upper, lower, foot }, 0.4)
      root.position.x += 0.002
      root.updateWorldMatrix(true, true)
      ik.update(H)
    }
    foot.updateWorldMatrix(true, false)
    const e = foot.getWorldQuaternion(new Quaternion())
    // World roll unchanged: reconstruct the expected pure-x rotation.
    const expected = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4)
    expect(Math.abs(e.angleTo(expected))).toBeLessThan(1e-3)
  })

  it('reset drops anchors and weights', () => {
    const { upper, lower, foot } = makeLeg()
    const ik = createFootIK([{ upper, lower, foot }], { groundY: 0 })
    ik.update(H)
    expect(ik.getLegDebug(0).anchor).not.toBe(null)
    ik.reset()
    expect(ik.getLegDebug(0).anchor).toBe(null)
    expect(ik.getLegDebug(0).weight).toBe(0)
  })
})
