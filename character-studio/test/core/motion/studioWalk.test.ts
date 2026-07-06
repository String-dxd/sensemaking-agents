// Studio walk session (advisor plan 001): regression test for the debug
// "walk circle" button — it must articulate limbs via the authored clip
// machine, not just slide the root. Synthetic contract-shaped clips, no GLB
// loading (modeled on clipStateMachine.test.ts).

import { AnimationClip, Bone, Group, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { GESTURE_NAMES } from '../../../src/core/motion/clipStateMachine'
import { createStudioWalk } from '../../../src/core/motion/studioWalk'

const H = 1 / 60

/** Minimal canonical-shaped rig: root -> hips -> upperLegL, plus upperArmL on hips. */
function makeRig() {
  const root = new Group()
  root.name = 'characterRoot'
  const hips = new Bone()
  hips.name = 'hips'
  hips.position.set(0, 0.34, 0)
  const upperLegL = new Bone()
  upperLegL.name = 'upperLegL'
  upperLegL.position.set(-0.1, -0.05, 0)
  const upperArmL = new Bone()
  upperArmL.name = 'upperArmL'
  upperArmL.position.set(-0.2, 0.1, 0)
  hips.add(upperLegL)
  hips.add(upperArmL)
  root.add(hips)
  return { root, hips, upperLegL, upperArmL }
}

/** A clip keying upperLegL + upperArmL rotation (constant `spin` yaw) + hips translation. */
function makeClip(name: string, duration: number, spin: number, hipsY = 0.34): AnimationClip {
  const s = Math.sin(spin / 2)
  const c = Math.cos(spin / 2)
  return new AnimationClip(name, duration, [
    new QuaternionKeyframeTrack('upperLegL.quaternion', [0, duration], [0, s, 0, c, 0, s, 0, c]),
    new QuaternionKeyframeTrack('upperArmL.quaternion', [0, duration], [0, s, 0, c, 0, s, 0, c]),
    new VectorKeyframeTrack('hips.position', [0, duration], [0, hipsY, 0, 0, hipsY, 0]),
  ])
}

/** Gesture clip: starts AND ends at rest, peaks mid-way (clip-machine contract). */
function makeGestureClip(name: string, duration: number, spin: number): AnimationClip {
  const s = Math.sin(spin / 2)
  const c = Math.cos(spin / 2)
  return new AnimationClip(name, duration, [
    new QuaternionKeyframeTrack(
      'upperLegL.quaternion',
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

function stepFor(session: { update(dt: number): void }, seconds: number): void {
  const n = Math.round(seconds / H)
  for (let i = 0; i < n; i++) session.update(H)
}

describe('createStudioWalk', () => {
  it('articulates the legs after ~1s of ticks (the walk-circle regression)', () => {
    const { root, hips, upperLegL } = makeRig()
    const restQuaternion = upperLegL.quaternion.clone()
    const session = createStudioWalk(root, [hips, upperLegL], makeClipSet(), {
      hipsRebase: { from: [0, 0.34, 0], to: [0, 0.34, 0] },
    })
    stepFor(session, 1)
    expect(upperLegL.quaternion.angleTo(restQuaternion)).toBeGreaterThan(0.01)
  })

  it('moves the root off home (locomotion drives it)', () => {
    const { root, hips, upperLegL } = makeRig()
    const homePosition = root.position.clone()
    const session = createStudioWalk(root, [hips, upperLegL], makeClipSet(), {
      hipsRebase: { from: [0, 0.34, 0], to: [0, 0.34, 0] },
    })
    stepFor(session, 1)
    expect(root.position.distanceTo(homePosition)).toBeGreaterThan(0.01)
  })

  it('dispose() restores the exact pre-session rest pose and root transform', () => {
    const { root, hips, upperLegL, upperArmL } = makeRig()
    const restHipsPos = hips.position.clone()
    const restHipsQuat = hips.quaternion.clone()
    const restLegQuat = upperLegL.quaternion.clone()
    const restArmQuat = upperArmL.quaternion.clone()
    const restRootPos = root.position.clone()
    const restRootRotY = root.rotation.y

    const session = createStudioWalk(root, [hips, upperLegL, upperArmL], makeClipSet(), {
      hipsRebase: { from: [0, 0.34, 0], to: [0, 0.34, 0] },
    })
    stepFor(session, 1.5)
    session.dispose()

    expect(hips.position.distanceTo(restHipsPos)).toBeLessThan(1e-6)
    expect(hips.quaternion.angleTo(restHipsQuat)).toBeLessThan(1e-6)
    expect(upperLegL.quaternion.angleTo(restLegQuat)).toBeLessThan(1e-6)
    expect(upperArmL.quaternion.angleTo(restArmQuat)).toBeLessThan(1e-6)
    expect(root.position.distanceTo(restRootPos)).toBeLessThan(1e-6)
    expect(Math.abs(root.rotation.y - restRootRotY)).toBeLessThan(1e-6)
  })
})
