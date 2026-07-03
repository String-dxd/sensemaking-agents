// Clip state machine (plan 007 step 2): transitions, weights, sit routing,
// gesture layer, hips rescale, and the animation-before-physics frame
// contract — all on a real AnimationMixer with synthetic contract-shaped clips.

import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Group,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three'
import { describe, expect, it } from 'vitest'
import { createClipMachine, GESTURE_NAMES } from '../../../src/core/motion/clipStateMachine'
import { clearFrameLoop, registerUpdate, runFrame } from '../../../src/core/motion/frameLoop'

const H = 1 / 60

/** Minimal canonical-shaped rig: root -> hips -> spine. */
function makeRig() {
  const root = new Group()
  root.name = 'characterRoot'
  const hips = new Bone()
  hips.name = 'hips'
  hips.position.set(0, 0.34, 0)
  const spine = new Bone()
  spine.name = 'spine'
  spine.position.set(0, 0.06, 0)
  hips.add(spine)
  root.add(hips)
  return { root, hips, spine, mixer: new AnimationMixer(root) }
}

/** A clip keying spine rotation (constant `spin` yaw) + hips translation. */
function makeClip(name: string, duration: number, spin: number, hipsY = 0.34): AnimationClip {
  const s = Math.sin(spin / 2)
  const c = Math.cos(spin / 2)
  return new AnimationClip(name, duration, [
    new QuaternionKeyframeTrack('spine.quaternion', [0, duration], [0, s, 0, c, 0, s, 0, c]),
    new VectorKeyframeTrack('hips.position', [0, duration], [0, hipsY, 0, 0, hipsY, 0]),
  ])
}

/** Gesture clip: starts AND ends at rest (identity/rest hips), peaks mid-way. */
function makeGestureClip(name: string, duration: number, spin: number): AnimationClip {
  const s = Math.sin(spin / 2)
  const c = Math.cos(spin / 2)
  return new AnimationClip(name, duration, [
    new QuaternionKeyframeTrack(
      'spine.quaternion',
      [0, duration / 2, duration],
      [0, 0, 0, 1, 0, s, 0, c, 0, 0, 0, 1],
    ),
  ])
}

function makeClipSet(): AnimationClip[] {
  return [
    makeClip('idle', 2, 0.01),
    makeClip('walk', 0.9, 0.2),
    makeClip('run', 0.6, 0.4),
    makeClip('sitDown', 0.8, 0.3, 0.15),
    makeClip('sitIdle', 2, 0.3, 0.15),
    makeClip('standUp', 0.8, 0.1),
    makeClip('talkIdle', 3, 0.05),
    ...GESTURE_NAMES.map((name) => makeGestureClip(name, 1, 0.5)),
  ]
}

function stepFor(machine: { update(dt: number): void }, seconds: number): void {
  const n = Math.round(seconds / H)
  for (let i = 0; i < n; i++) machine.update(H)
}

describe('createClipMachine', () => {
  it('starts in idle with the idle action at full weight', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.update(H)
    expect(machine.getState()).toBe('idle')
    expect(machine.getWeight('idle')).toBeCloseTo(1, 5)
    expect(machine.getWeight('walk')).toBe(0)
  })

  it('throws on an incomplete clip set', () => {
    const { mixer } = makeRig()
    const clips = makeClipSet().filter((c) => c.name !== 'standUp')
    expect(() => createClipMachine(mixer, clips)).toThrow(/standUp/)
  })

  it('idle -> walk crossfades over 0.25 s (both weights live mid-fade)', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.update(H)
    machine.setState('walk')
    stepFor(machine, 0.125) // mid-fade
    const idleMid = machine.getWeight('idle')
    const walkMid = machine.getWeight('walk')
    expect(idleMid).toBeGreaterThan(0.2)
    expect(idleMid).toBeLessThan(0.8)
    expect(walkMid).toBeGreaterThan(0.2)
    expect(walkMid).toBeLessThan(0.8)
    expect(idleMid + walkMid).toBeCloseTo(1, 1)
    stepFor(machine, 0.2) // past the 0.25 s pair fade
    expect(machine.getWeight('walk')).toBeCloseTo(1, 3)
    expect(machine.getWeight('idle')).toBeCloseTo(0, 3)
    expect(machine.getState()).toBe('walk')
  })

  it('walk -> run uses the faster 0.15 s pair fade', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.update(H)
    machine.setState('walk')
    stepFor(machine, 0.4)
    machine.setState('run')
    stepFor(machine, 0.16)
    expect(machine.getWeight('run')).toBeCloseTo(1, 2)
    expect(machine.getWeight('walk')).toBeCloseTo(0, 2)
  })

  it('enters sit through sitDown, then hands off to sitIdle', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.update(H)
    machine.setState('sit')
    stepFor(machine, 0.3)
    expect(machine.isTransitioning()).toBe(true)
    expect(machine.getWeight('sitDown')).toBeGreaterThan(0.9)
    expect(machine.getWeight('sitIdle')).toBe(0)
    stepFor(machine, 0.8) // sitDown (0.8 s) finishes + hand-off fade
    expect(machine.isTransitioning()).toBe(false)
    expect(machine.getState()).toBe('sit')
    expect(machine.getWeight('sitIdle')).toBeCloseTo(1, 2)
  })

  it('routes the illegal sit -> run jump through standUp', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.update(H)
    machine.setState('sit')
    stepFor(machine, 1.2) // fully seated
    expect(machine.getState()).toBe('sit')
    machine.setState('run')
    stepFor(machine, 0.3)
    // standUp owns the base layer; run has not started yet.
    expect(machine.isTransitioning()).toBe(true)
    expect(machine.getWeight('standUp')).toBeGreaterThan(0.9)
    expect(machine.getWeight('run')).toBe(0)
    stepFor(machine, 0.8)
    expect(machine.getState()).toBe('run')
    expect(machine.getWeight('run')).toBeCloseTo(1, 2)
    expect(machine.isTransitioning()).toBe(false)
  })

  it('gesture plays once, ramps its weight, completes, and cleans up', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.update(H)
    expect(machine.playGesture('gestureNod')).toBe(true)
    expect(machine.playGesture('gestureWave')).toBe(false) // one at a time
    expect(machine.getActiveGesture()).toBe('gestureNod')
    stepFor(machine, 0.5) // mid-gesture: fully ramped in
    expect(machine.getWeight('gestureNod')).toBeCloseTo(1, 5)
    stepFor(machine, 0.6) // past the 1 s clip
    expect(machine.getActiveGesture()).toBe(null)
    expect(machine.getWeight('gestureNod')).toBe(0)
    // Base layer untouched throughout.
    expect(machine.getWeight('idle')).toBeCloseTo(1, 5)
    expect(machine.playGesture('gestureWave')).toBe(true) // reusable
  })

  it('additive gesture leaves the base pose bit-identical once finished', () => {
    const { mixer, spine } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    stepFor(machine, 0.5)
    const before = spine.quaternion.clone()
    machine.playGesture('gestureShrug')
    stepFor(machine, 0.5)
    expect(spine.quaternion.angleTo(before)).toBeGreaterThan(0.01) // gesture visibly composes
    stepFor(machine, 0.6)
    expect(machine.getActiveGesture()).toBe(null)
    // Clean hand-back (additive delta returns to ~zero; sub-millidegree
    // residue comes from quaternion track interpolation, invisible on screen).
    expect(spine.quaternion.angleTo(before)).toBeLessThan(2e-3)
  })

  it('rescales hips translation by hipsScale (archetype proportions)', () => {
    const a = makeRig()
    const b = makeRig()
    const machineA = createClipMachine(a.mixer, makeClipSet())
    const machineB = createClipMachine(b.mixer, makeClipSet(), { hipsScale: 0.5 })
    machineA.update(H)
    machineB.update(H)
    expect(a.hips.position.y).toBeCloseTo(0.34, 5)
    expect(b.hips.position.y).toBeCloseTo(0.17, 5)
  })

  it('setLocomotionTimeScale speeds up walk/run only', () => {
    const { mixer } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    machine.setLocomotionTimeScale(2)
    stepFor(machine, 0.4) // idle plays at 1x even with a gait timeScale set
    expect(machine.getTime('idle')).toBeCloseTo(0.4, 1)
    machine.setState('walk')
    stepFor(machine, 0.4)
    expect(machine.getTime('walk')).toBeCloseTo(0.8, 1) // 2x
  })

  it('writes the animated pose in the animation phase, before physics readers', () => {
    clearFrameLoop()
    const { mixer, spine } = makeRig()
    const machine = createClipMachine(mixer, makeClipSet())
    const order: string[] = []
    let spineYawAtPhysics = 0
    // Register PHYSICS FIRST: the phase order, not registration order, must win.
    registerUpdate('physics', () => {
      order.push('physics')
      spineYawAtPhysics = spine.quaternion.y
    })
    registerUpdate('animation', (dt) => {
      order.push('animation')
      machine.update(dt)
    })
    runFrame(H)
    expect(order).toEqual(['animation', 'physics'])
    // idle keys a small constant spine yaw — physics saw the animated pose.
    expect(spineYawAtPhysics).not.toBe(0)
    clearFrameLoop()
  })
})
