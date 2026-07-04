// Verlet spring-bone solver — PORT of the studio's
// `src/core/motion/springSolver.ts` (plan 003) with the three namespace
// INJECTED instead of imported, so the runtime is version-agnostic.
//
// The algorithm is copied line-for-line from the studio solver; only the
// three access changes (`new Vector3()` → `new THREE.Vector3()`, module-level
// scratch → per-rig scratch). `test/solver-parity.test.ts` asserts this port
// produces the SAME settle trajectory as the studio solver for the same seed/
// config — behavioural equivalence is the sync guarantee (a byte checksum
// can't hold across the injection edit).
//
// Ordering contract (plan 000 §2.2): step() runs in the physics phase, after
// the animation phase writes the pose. Animation drives; physics follows.

import type { ColliderGroup, SpringChainDef, SpringJointParams } from './senCompanion'
import type { Mat4Like, Object3DLike, QuatLike, ThreeNamespace, Vec3Like } from './three-types'

export interface SpringRig {
  step(dt: number): void
  reset(): void
  setParams(chainName: string, jointIndex: number, params: Partial<SpringJointParams>): void
  getParticles(chainName: string): readonly Vec3Like[]
  dispose(): void
}

interface RuntimeParams {
  stiffness: number
  gravityPower: number
  gravityDir: Vec3Like
  dragForce: number
  hitRadius: number
}

interface JointState {
  bone: Object3DLike
  params: RuntimeParams
  restLocalRotation: QuatLike
  restChildLocalPos: Vec3Like
  restLength: number
  pos: Vec3Like
  prevPos: Vec3Like
  solvedWorld: Mat4Like
}

interface ResolvedCollider {
  bone: Object3DLike
  offset: Vec3Like
  radius: number
}

interface ChainState {
  name: string
  joints: JointState[]
  colliders: ResolvedCollider[]
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

export function createSpringRig(
  THREE: ThreeNamespace,
  root: Object3DLike,
  chains: SpringChainDef[],
  colliderGroups: ColliderGroup[] = [],
): SpringRig {
  root.updateWorldMatrix(true, true)

  // Per-rig scratch (no per-step allocation; module-level in the studio).
  const _mLocal = new THREE.Matrix4()
  const _identity = new THREE.Matrix4().identity()
  const _head = new THREE.Vector3()
  const _target = new THREE.Vector3()
  const _next = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _delta = new THREE.Vector3()
  const _center = new THREE.Vector3()
  const _scale = new THREE.Vector3()
  const _pTmp = new THREE.Vector3()
  const _sTmp = new THREE.Vector3()
  const _from = new THREE.Vector3()
  const _to = new THREE.Vector3()
  const _qAnim = new THREE.Quaternion()
  const _qParent = new THREE.Quaternion()
  const _qDelta = new THREE.Quaternion()
  const _qWorld = new THREE.Quaternion()

  function constrainLength(p: Vec3Like, head: Vec3Like, len: number): void {
    _dir.copy(p).sub(head)
    const d = _dir.length()
    if (d < 1e-9) {
      _dir.set(0, -1, 0)
    } else {
      _dir.divideScalar(d)
    }
    p.copy(head).addScaledVector(_dir, len)
  }

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
        return { bone, offset: new THREE.Vector3(c.offset[0], c.offset[1], c.offset[2]), radius: c.radius }
      })
    })
    const joints: JointState[] = bones.map((bone, i) => {
      const child = bones[i + 1] ?? null
      const restLocalRotation = bone.quaternion.clone()
      let restChildLocalPos: Vec3Like
      if (child) {
        restChildLocalPos = child.position.clone()
      } else {
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
          gravityDir: new THREE.Vector3(p.gravityDir[0], p.gravityDir[1], p.gravityDir[2]).normalize(),
          dragForce: clamp01(p.dragForce),
          hitRadius: p.hitRadius,
        },
        restLocalRotation,
        restChildLocalPos,
        restLength: restChildLocalPos.length(),
        pos,
        prevPos: pos.clone(),
        solvedWorld: new THREE.Matrix4(),
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
    for (const chain of chainStates) {
      for (const c of chain.colliders) c.bone.updateWorldMatrix(true, false)
    }
    for (const chain of chainStates) {
      const rootParent = chain.joints[0].bone.parent
      if (rootParent) rootParent.updateWorldMatrix(true, false)
      let parentWorld: Mat4Like = rootParent ? rootParent.matrixWorld : _identity
      for (const j of chain.joints) {
        const { params } = j
        _mLocal.compose(j.bone.position, j.restLocalRotation, j.bone.scale)
        j.solvedWorld.multiplyMatrices(parentWorld, _mLocal)
        _head.setFromMatrixPosition(j.solvedWorld)
        _target.copy(j.restChildLocalPos).applyMatrix4(j.solvedWorld)
        // 1. Verlet inertia + gravity.
        _next.copy(j.pos).sub(j.prevPos).multiplyScalar(1 - params.dragForce).add(j.pos)
        _next.addScaledVector(params.gravityDir, params.gravityPower * dt * dt)
        // 2. Constrain toward the animated target.
        const k = 1 - (1 - params.stiffness) ** (dt * 60)
        _next.lerp(_target, k)
        // 3. Bone-length constraint.
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
        // 5. Write back as a bone rotation (world delta → local via parent world rot).
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
      let parentWorld: Mat4Like = rootParent ? rootParent.matrixWorld : _identity
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
    if (params.gravityDir !== undefined) joint.params.gravityDir.set(params.gravityDir[0], params.gravityDir[1], params.gravityDir[2]).normalize()
    if (params.dragForce !== undefined) joint.params.dragForce = clamp01(params.dragForce)
    if (params.hitRadius !== undefined) joint.params.hitRadius = params.hitRadius
  }

  function getParticles(chainName: string): readonly Vec3Like[] {
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
  advance(frameDt: number): number
  reset(): void
}

/** Fixed-timestep accumulator (plan 003): step at `stepHz`, at most
 * `maxSubsteps` per frame; drop excess debt (spiral-of-death clamp). */
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
