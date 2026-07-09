// Foot IK (plan 007 step 3) — correction-only ground contact, plan 000 §4.3:
// authored clips own locomotion; this layer pins the planted foot to the
// ground plane during its stance window and never invents steps.
//
// Runs AFTER the animation phase has written the pose (register in `physics`;
// leg bones are disjoint from the spring chains so ordering against the
// spring solver is irrelevant). Stance is detected from the foot bone itself
// (height + world-velocity thresholds) — no authoring metadata. The
// correction blends in/out over ~80 ms and is clamped to ≤ 6 cm so a bad
// detection can only ever nudge, never yank.
//
// Pure three math — no React, no randomness.

import { Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

// ---- analytic two-bone solver ------------------------------------------------

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _t = new Vector3()
const _v0 = new Vector3()
const _v1 = new Vector3()
const _dir = new Vector3()
const _bend = new Vector3()
const _knee = new Vector3()
const _qDelta = new Quaternion()
const _qParent = new Quaternion()
const _qWorld = new Quaternion()
const _qSaved = new Quaternion()

function worldPos(bone: Object3D, out: Vector3): Vector3 {
  return out.setFromMatrixPosition(bone.matrixWorld)
}

/** Apply a WORLD-space delta rotation to a bone's local quaternion. */
function rotateWorld(bone: Object3D, delta: Quaternion): void {
  bone.parent?.getWorldQuaternion(_qParent) ?? _qParent.identity()
  bone.getWorldQuaternion(_qWorld)
  _qWorld.premultiply(delta)
  bone.quaternion.copy(_qParent.invert()).multiply(_qWorld)
  bone.updateWorldMatrix(false, false)
}

/**
 * Analytic two-bone IK: rotate `upper` and `lower` so `end` reaches `target`
 * (world space). Closed form — compute where the knee must sit (law of
 * cosines in the bend plane), aim the upper bone at it, then aim the lower
 * bone at the (clamped) target. Exact for reachable targets; clamps at full
 * extension / full fold without NaN. The bend plane is taken from the
 * current knee offset (correction calls preserve the animated bend);
 * `poleDir` (world, default +Z = knees bend character-forward) picks the
 * side when the chain is perfectly straight.
 *
 * `end`'s own rotation is untouched (callers that care about foot roll
 * capture and restore its world orientation around the solve).
 */
export function solveTwoBoneIK(
  upper: Object3D,
  lower: Object3D,
  end: Object3D,
  target: Vector3,
  poleDir?: Vector3,
): void {
  end.updateWorldMatrix(true, false)
  worldPos(upper, _a)
  worldPos(lower, _b)
  worldPos(end, _c)

  const l1 = _b.distanceTo(_a)
  const l2 = _c.distanceTo(_b)
  if (l1 < 1e-9 || l2 < 1e-9) return

  const eps = 1e-6
  const rawD = target.distanceTo(_a)
  if (rawD < 1e-9) return // target on the hip: direction undefined, bail
  const d = Math.min(l1 + l2 - eps, Math.max(Math.abs(l1 - l2) + eps, rawD))
  _dir.copy(target).sub(_a).divideScalar(rawD)

  // Bend direction: the current knee offset from the hip->target line, or
  // the pole (projected off that line) when the chain is straight on it.
  _bend.copy(_b).sub(_a).addScaledVector(_dir, -_dir.dot(_v0.copy(_b).sub(_a)))
  if (_bend.lengthSq() < 1e-10) {
    _bend.copy(poleDir ?? _v0.set(0, 0, 1))
    _bend.addScaledVector(_dir, -_dir.dot(_bend))
  }
  if (_bend.lengthSq() < 1e-10) {
    // Pole parallel to the reach direction too: any perpendicular will do.
    _bend.set(1, 0, 0).addScaledVector(_dir, -_dir.x)
    if (_bend.lengthSq() < 1e-10) _bend.set(0, 1, 0).addScaledVector(_dir, -_dir.y)
  }
  _bend.normalize()

  // Knee position from the law of cosines (angle at the hip).
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  _knee.copy(_a).addScaledVector(_dir, l1 * cosA).addScaledVector(_bend, l1 * sinA)

  // 1. Aim the upper bone: (hip -> knee) onto the computed knee.
  _v0.copy(_b).sub(_a).normalize()
  _v1.copy(_knee).sub(_a).normalize()
  _qDelta.setFromUnitVectors(_v0, _v1)
  rotateWorld(upper, _qDelta)

  // 2. Aim the lower bone: (knee -> foot) onto the clamped target point.
  end.updateWorldMatrix(true, false)
  worldPos(lower, _b) // == _knee up to float error
  worldPos(end, _c)
  _t.copy(_a).addScaledVector(_dir, d) // clamped target position
  _v0.copy(_c).sub(_b).normalize()
  _v1.copy(_t).sub(_b).normalize()
  _qDelta.setFromUnitVectors(_v0, _v1)
  rotateWorld(lower, _qDelta)
  end.updateWorldMatrix(true, false)
}

// ---- stance detection + pinning ------------------------------------------------

export interface FootIkLeg {
  upper: Object3D
  lower: Object3D
  foot: Object3D
}

export interface FootIkOptions {
  /** Ground plane height (m). Default 0. */
  groundY?: number
  /** Max correction distance (m). Default 0.06 (plan 007: fixes skating, never invents steps). */
  maxCorrection?: number
  /** Blend in/out time (s). Default 0.08. */
  blendTime?: number
  /** Stance height gate: ankle below rest-height × this factor. Default 1.35. */
  heightFactor?: number
  /** Stance velocity gate: world speed below this (m/s). Default 0.4. */
  speedThreshold?: number
  /**
   * World bend-plane hint for perfectly straight legs (knee side). Read
   * live each solve so callers can keep it aligned with a turning root.
   */
  poleDir?: Vector3
}

export interface FootIkLegDebug {
  stance: boolean
  weight: number
  anchor: { x: number; y: number; z: number } | null
}

export interface FootIk {
  /** Detect stance, blend, and pin. Register in the `physics` phase. */
  update(dt: number): void
  /** Drop anchors and blend state (teleports / state machine resets). */
  reset(): void
  getLegDebug(index: number): FootIkLegDebug
}

interface LegState {
  leg: FootIkLeg
  restHeight: number
  prev: Vector3
  hasPrev: boolean
  stance: boolean
  weight: number
  anchor: Vector3 | null
}

const _p = new Vector3()
const _delta2 = new Vector3()
const _target2 = new Vector3()

export function createFootIK(legs: FootIkLeg[], options: FootIkOptions = {}): FootIk {
  const groundY = options.groundY ?? 0
  const maxCorrection = options.maxCorrection ?? 0.06
  const blendTime = options.blendTime ?? 0.08
  const heightFactor = options.heightFactor ?? 1.35
  const speedThreshold = options.speedThreshold ?? 0.4
  const poleDir = options.poleDir

  const states: LegState[] = legs.map((leg) => {
    leg.foot.updateWorldMatrix(true, false)
    const rest = worldPos(leg.foot, new Vector3())
    return {
      leg,
      restHeight: Math.max(1e-3, rest.y - groundY),
      prev: rest.clone(),
      hasPrev: true,
      stance: false,
      weight: 0,
      anchor: null,
    }
  })

  function update(dt: number): void {
    if (dt <= 0) return
    for (const s of states) {
      s.leg.foot.updateWorldMatrix(true, false)
      worldPos(s.leg.foot, _p)

      const speed = s.hasPrev ? _delta2.copy(_p).sub(s.prev).length() / dt : 0
      const height = _p.y - groundY
      s.stance = s.hasPrev && height < s.restHeight * heightFactor && speed < speedThreshold
      s.prev.copy(_p)
      s.hasPrev = true

      // Blend weight chases the stance flag over blendTime.
      const step = dt / blendTime
      s.weight = s.stance ? Math.min(1, s.weight + step) : Math.max(0, s.weight - step)

      if (s.stance && !s.anchor) {
        // Plant where the foot is now, at flat-contact ankle height.
        s.anchor = new Vector3(_p.x, groundY + s.restHeight, _p.z)
      }
      if (!s.stance && s.weight <= 0) s.anchor = null

      if (s.anchor && s.weight > 0) {
        _delta2.copy(s.anchor).sub(_p)
        const len = _delta2.length()
        if (len > maxCorrection) _delta2.multiplyScalar(maxCorrection / len)
        _target2.copy(_p).addScaledVector(_delta2, s.weight)
        // Preserve the animated foot roll: the solve moves the ankle, the
        // foot keeps its world orientation.
        s.leg.foot.getWorldQuaternion(_qSaved)
        solveTwoBoneIK(s.leg.upper, s.leg.lower, s.leg.foot, _target2, poleDir)
        s.leg.foot.parent?.getWorldQuaternion(_qParent)
        s.leg.foot.quaternion.copy(_qParent.invert()).multiply(_qSaved)
        // Velocity must be measured on the ANIMATED pose, not the corrected
        // one, or the pin would hide the motion it needs to detect — keep
        // s.prev as the pre-IK sample (already stored above).
      }

      // Hard ground collision (unconditional): the ankle never dips below its
      // rest clearance. Stance pinning is a blended heuristic — at touchdown
      // the descending foot can bottom out below rest before the anchor
      // catches (clips are authored on reference proportions; on short-legged
      // archetypes the plant drives the foot mesh through the floor). This
      // clamp only ever pushes UP, so airborne swing poses are untouched.
      s.leg.foot.updateWorldMatrix(true, false)
      worldPos(s.leg.foot, _p)
      const sink = groundY + s.restHeight - _p.y
      if (sink > 1e-4) {
        _target2.set(_p.x, groundY + s.restHeight, _p.z)
        s.leg.foot.getWorldQuaternion(_qSaved)
        solveTwoBoneIK(s.leg.upper, s.leg.lower, s.leg.foot, _target2, poleDir)
        s.leg.foot.parent?.getWorldQuaternion(_qParent)
        s.leg.foot.quaternion.copy(_qParent.invert()).multiply(_qSaved)
      }
    }
  }

  return {
    update,
    reset(): void {
      for (const s of states) {
        s.hasPrev = false
        s.stance = false
        s.weight = 0
        s.anchor = null
      }
    },
    getLegDebug(index: number): FootIkLegDebug {
      const s = states[index]
      if (!s) throw new Error(`footIK: no leg ${index}`)
      return {
        stance: s.stance,
        weight: s.weight,
        anchor: s.anchor ? { x: s.anchor.x, y: s.anchor.y, z: s.anchor.z } : null,
      }
    },
  }
}
