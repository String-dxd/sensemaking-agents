import * as THREE from 'three-185'
import { describe, expect, it } from 'vitest'
// The studio solver is imported HERE (test only — the no-forbidden-imports gate
// scans src/, not test/). Direct A-vs-B comparison is a stronger parity proof
// than a committed trace fixture and can't go stale.
import { createSpringRig as createStudioRig } from '../../../src/core/motion/springSolver'
import type { SpringChainDef } from '../src/senCompanion'
import { createSpringRig as createRuntimeRig } from '../src/springSolver'

// A 2-joint chain (ear-like) hanging off an animated parent.
const CHAIN: SpringChainDef[] = [
  {
    name: 'earL',
    boneNames: ['earL.1', 'earL.2'],
    joints: [
      { stiffness: 0.25, gravityPower: 30, gravityDir: [0, -1, 0], dragForce: 0.12, hitRadius: 0.02 },
      { stiffness: 0.25, gravityPower: 30, gravityDir: [0, -1, 0], dragForce: 0.12, hitRadius: 0.02 },
    ],
    colliderGroupRefs: ['head'],
  },
]
const COLLIDERS = [{ name: 'head', colliders: [{ boneName: 'head', offset: [0, 0, 0] as [number, number, number], radius: 0.12 }] }]

function makeRig() {
  const root = new THREE.Object3D()
  root.name = 'root'
  const head = new THREE.Bone()
  head.name = 'head'
  head.position.set(0, 0.6, 0)
  root.add(head)
  const e1 = new THREE.Bone()
  e1.name = 'earL.1'
  e1.position.set(0.09, 0.12, 0)
  head.add(e1)
  const e2 = new THREE.Bone()
  e2.name = 'earL.2'
  e2.position.set(0.04, 0.1, 0)
  e1.add(e2)
  root.updateWorldMatrix(true, true)
  return { root, head }
}

/** Drive the head with a deterministic shake so the chain lags/overshoots. */
function poseHead(head: THREE.Object3D, t: number): void {
  head.rotation.z = 0.5 * Math.sin(t * 6)
  head.updateWorldMatrix(true, true)
}

describe('runtime spring solver matches the studio solver', () => {
  it('produces the same settle trajectory (same seed/config)', () => {
    const a = makeRig()
    const b = makeRig()
    const studio = createStudioRig(a.root, CHAIN, COLLIDERS)
    const runtime = createRuntimeRig(THREE as never, b.root as never, CHAIN, COLLIDERS)

    const dt = 1 / 60
    let maxDiff = 0
    for (let frame = 0; frame < 180; frame++) {
      const t = frame * dt
      poseHead(a.head, t)
      poseHead(b.head, t)
      studio.step(dt)
      runtime.step(dt)
      const pa = studio.getParticles('earL')
      const pb = runtime.getParticles('earL')
      for (let i = 0; i < pa.length; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(pa[i].x - pb[i].x), Math.abs(pa[i].y - pb[i].y), Math.abs(pa[i].z - pb[i].z))
        expect(Number.isFinite(pb[i].x) && Number.isFinite(pb[i].y) && Number.isFinite(pb[i].z)).toBe(true)
      }
    }
    // Same math, same three ops → trajectories agree to floating-point noise.
    expect(maxDiff).toBeLessThan(1e-6)
  })

  it('the chain actually moves under motion, then settles when motion stops', () => {
    const { root, head } = makeRig()
    const rig = createRuntimeRig(THREE as never, root as never, CHAIN, COLLIDERS)
    const dt = 1 / 60
    const start = rig.getParticles('earL')[1].clone()

    // Shake for 1 s.
    for (let f = 0; f < 60; f++) {
      poseHead(head, f * dt)
      rig.step(dt)
    }
    const moved = rig.getParticles('earL')[1].clone()
    expect(moved.clone().sub(start).length()).toBeGreaterThan(0.005) // it lagged/overshot

    // Hold still for 2 s — it must settle (consecutive frames stop changing).
    head.rotation.z = 0
    head.updateWorldMatrix(true, true)
    let prev = rig.getParticles('earL')[1].clone()
    let lastDelta = Infinity
    for (let f = 0; f < 120; f++) {
      rig.step(dt)
      const now = rig.getParticles('earL')[1].clone()
      lastDelta = now.clone().sub(prev).length()
      prev = now
    }
    expect(lastDelta).toBeLessThan(1e-4) // settled
  })
})
