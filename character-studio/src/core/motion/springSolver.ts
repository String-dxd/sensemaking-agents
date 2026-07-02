// Verlet spring-bone solver (plan 003 step 1).
//
// Solver family: naelstrof blender-jiggle-physics / UnityJigglePhysics —
// Verlet-integrated particles at bone tails, constrained back onto the
// animated pose. Chosen over damped-rotation springs because it resists
// exploding, behaves correctly under fast reference-frame motion, and can
// support squash-and-stretch later.
//
// Per joint, per step (see plan 003 "Current state" #1):
//   1. inertia + gravity:  p' = p + (p - pPrev) * (1 - dragForce)
//                               + gravityDir * gravityPower * dt²
//   2. constrain toward the animated pose target with strength `stiffness`
//   3. enforce bone length (distance constraint to the parent particle/head)
//   4. sphere-collider pushout (hitRadius vs collider radius), re-assert length
//   5. write the result back as a BONE ROTATION (rotate the animated bone so
//      its tail points at the solved particle — never translate mid-chain bones)
//
// Ordering contract (plan 000 §2.2): `step()` must run in the `physics`
// frame phase, strictly after `animation` writes the pose. The animated pose
// is the spring target; physics never fights keyframes.
//
// Pose-target note: spring bones themselves are assumed NOT to be keyframed
// (VRM makes the same assumption). We capture each spring bone's rest local
// rotation at rig creation and reconstruct the "animated" pose each step as
// parentWorld × T(bone.position) × R(restLocalRotation). Ancestors (body
// root, head, chest, ...) ARE animated and excite the chains through
// parentWorld. If plan 007 ever keyframes a spring bone directly, the pose
// must be captured after the animation phase and before this solver runs.
//
// No allocation in step(): all intermediates use the module-level scratch
// objects below; per-joint state (particles, matrices) is preallocated at
// rig creation.

import { Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import type { ColliderGroup, SpringChainDef, SpringJointParams } from './springTypes'

export interface SpringRig {
  /** Advance the simulation by dt seconds (one solver step; see createFixedStepper for substepping). */
  step(dt: number): void
  /** Snap particles onto the current animated pose (use on teleports / spec changes). */
  reset(): void
  /** Live-update a joint's parameters. */
  setParams(chainName: string, jointIndex: number, params: Partial<SpringJointParams>): void
  /** Debug/test accessor: live particle world positions for a chain. Do not mutate. */
  getParticles(chainName: string): readonly Vector3[]
  /** Restore rest rotations and drop all chain state. */
  dispose(): void
}

interface RuntimeParams {
  stiffness: number
  gravityPower: number
  gravityDir: Vector3
  dragForce: number
  hitRadius: number
}

interface JointState {
  bone: Object3D
  params: RuntimeParams
  /** Bone's local rotation at rig creation = the assumed animated pose. */
  restLocalRotation: Quaternion
  /** Rest tail offset in this bone's local space (child bone position, or a virtual tail for the last joint). */
  restChildLocalPos: Vector3
  restLength: number
  /** Simulated particle (bone tail), world space. */
  pos: Vector3
  prevPos: Vector3
  /** Solved world matrix for this bone, rebuilt every step (parent for the next joint). */
  solvedWorld: Matrix4
}

interface ResolvedCollider {
  bone: Object3D
  offset: Vector3
  radius: number
}

interface ChainState {
  name: string
  joints: JointState[]
  colliders: ResolvedCollider[]
}

// ---- module-level scratch (step() must not allocate) ----
const _mLocal = new Matrix4()
const _identity = new Matrix4()
const _head = new Vector3()
const _target = new Vector3()
const _next = new Vector3()
const _dir = new Vector3()
const _delta = new Vector3()
const _center = new Vector3()
const _scale = new Vector3()
const _pTmp = new Vector3()
const _sTmp = new Vector3()
const _from = new Vector3()
const _to = new Vector3()
const _qAnim = new Quaternion()
const _qParent = new Quaternion()
const _qDelta = new Quaternion()
const _qWorld = new Quaternion()

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Project `p` onto the sphere of radius `len` around `head` (bone-length constraint). */
function constrainLength(p: Vector3, head: Vector3, len: number): void {
  _dir.copy(p).sub(head)
  const d = _dir.length()
  if (d < 1e-9) {
    // Degenerate: particle collapsed onto the head; push along world -Y.
    _dir.set(0, -1, 0)
  } else {
    _dir.divideScalar(d)
  }
  p.copy(head).addScaledVector(_dir, len)
}

export function createSpringRig(
  root: Object3D,
  chains: SpringChainDef[],
  colliderGroups: ColliderGroup[] = [],
): SpringRig {
  root.updateWorldMatrix(true, true)

  const groupsByName = new Map(colliderGroups.map((g) => [g.name, g]))

  const chainStates: ChainState[] = chains.map((def) => {
    if (def.joints.length !== def.boneNames.length) {
      throw new Error(`spring chain "${def.name}": joints (${def.joints.length}) must match boneNames (${def.boneNames.length})`)
    }
    const bones = def.boneNames.map((name) => {
      const bone = root.getObjectByName(name)
      if (!bone) throw new Error(`spring chain "${def.name}": bone "${name}" not found under root`)
      return bone
    })
    for (let i = 1; i < bones.length; i++) {
      if (bones[i].parent !== bones[i - 1]) {
        throw new Error(`spring chain "${def.name}": "${def.boneNames[i]}" must be a direct child of "${def.boneNames[i - 1]}"`)
      }
    }
    const colliders: ResolvedCollider[] = def.colliderGroupRefs.flatMap((ref) => {
      const group = groupsByName.get(ref)
      if (!group) throw new Error(`spring chain "${def.name}": collider group "${ref}" not found`)
      return group.colliders.map((c) => {
        const bone = root.getObjectByName(c.boneName)
        if (!bone) throw new Error(`collider group "${ref}": bone "${c.boneName}" not found under root`)
        return { bone, offset: new Vector3(...c.offset), radius: c.radius }
      })
    })
    const joints: JointState[] = bones.map((bone, i) => {
      const child = bones[i + 1] ?? null
      const restLocalRotation = bone.quaternion.clone()
      let restChildLocalPos: Vector3
      if (child) {
        restChildLocalPos = child.position.clone()
      } else {
        // Virtual tail for the tip joint: repeat this bone's own segment,
        // re-expressed in bone-local space.
        restChildLocalPos = bone.position.clone().applyQuaternion(restLocalRotation.clone().invert())
        if (restChildLocalPos.lengthSq() < 1e-12) restChildLocalPos.set(0, 0.1, 0)
      }
      const p = def.joints[i]
      const pos = restChildLocalPos.clone().applyMatrix4(bone.matrixWorld)
      return {
        bone,
        params: {
          stiffness: clamp01(p.stiffness),
          gravityPower: p.gravityPower,
          gravityDir: new Vector3(...p.gravityDir).normalize(),
          dragForce: clamp01(p.dragForce),
          hitRadius: p.hitRadius,
        },
        restLocalRotation,
        restChildLocalPos,
        restLength: restChildLocalPos.length(),
        pos,
        prevPos: pos.clone(),
        solvedWorld: new Matrix4(),
      }
    })
    return { name: def.name, joints, colliders }
  })

  function chainByName(name: string): ChainState {
    const chain = chainStates.find((c) => c.name === name)
    if (!chain) throw new Error(`spring rig: unknown chain "${name}"`)
    return chain
  }

  function step(dt: number): void {
    if (dt <= 0) return
    // Collider bones can live outside a chain's ancestor path — refresh them.
    for (const chain of chainStates) {
      for (const c of chain.colliders) c.bone.updateWorldMatrix(true, false)
    }
    for (const chain of chainStates) {
      const rootParent = chain.joints[0].bone.parent
      if (rootParent) rootParent.updateWorldMatrix(true, false)
      let parentWorld: Matrix4 = rootParent ? rootParent.matrixWorld : _identity
      for (const j of chain.joints) {
        const { params } = j
        // Animated pose frame for this bone: rest local rotation under the live (solved) parent.
        _mLocal.compose(j.bone.position, j.restLocalRotation, j.bone.scale)
        j.solvedWorld.multiplyMatrices(parentWorld, _mLocal)
        _head.setFromMatrixPosition(j.solvedWorld)
        _target.copy(j.restChildLocalPos).applyMatrix4(j.solvedWorld)
        // 1. Verlet inertia + gravity.
        _next.copy(j.pos).sub(j.prevPos).multiplyScalar(1 - params.dragForce).add(j.pos)
        _next.addScaledVector(params.gravityDir, params.gravityPower * dt * dt)
        // 2. Constrain toward the animated target (per-second-normalized so
        // behavior is stable across step sizes; at dt = 1/60, k === stiffness).
        const k = 1 - (1 - params.stiffness) ** (dt * 60)
        _next.lerp(_target, k)
        // 3. Bone-length constraint (world-space rest length; ancestor scale
        // like the breath layer's ±1.5 % chest scale folds in here).
        _scale.setFromMatrixScale(j.solvedWorld)
        const worldLen = (j.restLength * (_scale.x + _scale.y + _scale.z)) / 3
        constrainLength(_next, _head, worldLen)
        // 4. Sphere-collider pushout, then re-assert length.
        for (const c of chain.colliders) {
          _center.copy(c.offset).applyMatrix4(c.bone.matrixWorld)
          const minDist = c.radius + params.hitRadius
          _delta.copy(_next).sub(_center)
          if (_delta.lengthSq() < minDist * minDist) {
            if (_delta.lengthSq() < 1e-12) _delta.copy(_next).sub(_head)
            _delta.normalize()
            _next.copy(_center).addScaledVector(_delta, minDist)
            constrainLength(_next, _head, worldLen)
          }
        }
        // Commit the particle.
        j.prevPos.copy(j.pos)
        j.pos.copy(_next)
        // 5. Write back as a bone rotation. Classic-bug guard: the delta
        // rotation is WORLD space — convert to local via the parent's world
        // rotation (local = parentWorldRot⁻¹ × worldRot), never apply a world
        // rotation directly to the local quaternion.
        j.solvedWorld.decompose(_pTmp, _qAnim, _sTmp)
        _from.copy(j.restChildLocalPos).normalize().applyQuaternion(_qAnim)
        _to.copy(j.pos).sub(_head)
        const toLen = _to.length()
        if (toLen > 1e-9) {
          _to.divideScalar(toLen)
          _qDelta.setFromUnitVectors(_from, _to)
          _qWorld.copy(_qDelta).multiply(_qAnim)
          parentWorld.decompose(_pTmp, _qParent, _sTmp)
          j.bone.quaternion.copy(_qParent.invert()).multiply(_qWorld)
        }
        // Rebuild this bone's solved world matrix so the next joint (and the
        // next frame's renderer) sees the solved pose.
        _mLocal.compose(j.bone.position, j.bone.quaternion, j.bone.scale)
        j.solvedWorld.multiplyMatrices(parentWorld, _mLocal)
        parentWorld = j.solvedWorld
      }
    }
  }

  function reset(): void {
    for (const chain of chainStates) {
      const rootParent = chain.joints[0].bone.parent
      if (rootParent) rootParent.updateWorldMatrix(true, false)
      let parentWorld: Matrix4 = rootParent ? rootParent.matrixWorld : _identity
      for (const j of chain.joints) {
        j.bone.quaternion.copy(j.restLocalRotation)
        _mLocal.compose(j.bone.position, j.restLocalRotation, j.bone.scale)
        j.solvedWorld.multiplyMatrices(parentWorld, _mLocal)
        j.pos.copy(j.restChildLocalPos).applyMatrix4(j.solvedWorld)
        j.prevPos.copy(j.pos)
        parentWorld = j.solvedWorld
      }
    }
  }

  function setParams(chainName: string, jointIndex: number, params: Partial<SpringJointParams>): void {
    const joint = chainByName(chainName).joints[jointIndex]
    if (!joint) throw new Error(`spring rig: chain "${chainName}" has no joint ${jointIndex}`)
    if (params.stiffness !== undefined) joint.params.stiffness = clamp01(params.stiffness)
    if (params.gravityPower !== undefined) joint.params.gravityPower = params.gravityPower
    if (params.gravityDir !== undefined) joint.params.gravityDir.set(...params.gravityDir).normalize()
    if (params.dragForce !== undefined) joint.params.dragForce = clamp01(params.dragForce)
    if (params.hitRadius !== undefined) joint.params.hitRadius = params.hitRadius
  }

  function getParticles(chainName: string): readonly Vector3[] {
    return chainByName(chainName).joints.map((j) => j.pos)
  }

  function dispose(): void {
    for (const chain of chainStates) {
      for (const j of chain.joints) j.bone.quaternion.copy(j.restLocalRotation)
    }
    chainStates.length = 0
  }

  return { step, reset, setParams, getParticles, dispose }
}

export interface FixedStepper {
  /** Feed one frame's dt; runs 0..maxSubsteps fixed-size solver steps. Returns the substep count. */
  advance(frameDt: number): number
  reset(): void
}

/**
 * Fixed-timestep accumulator (plan 003 "Current state" #3): accumulate frame
 * dt and step the solver at `stepHz` substeps, at most `maxSubsteps` per
 * frame. Debt beyond what fits in one frame is dropped (spiral-of-death clamp).
 */
export function createFixedStepper(
  stepFn: (h: number) => void,
  { stepHz = 60, maxSubsteps = 3 }: { stepHz?: number; maxSubsteps?: number } = {},
): FixedStepper {
  const h = 1 / stepHz
  let acc = 0
  return {
    advance(frameDt: number): number {
      acc += Math.max(0, frameDt)
      let n = 0
      while (acc >= h && n < maxSubsteps) {
        stepFn(h)
        acc -= h
        n++
      }
      if (acc >= h) acc = 0
      return n
    },
    reset() {
      acc = 0
    },
  }
}
