import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../src/core/motion/noise'
import { createSpringRig } from '../../../src/core/motion/springSolver'
import type { ColliderGroup, SpringChainDef, SpringJointParams } from '../../../src/core/motion/springTypes'

const H = 1 / 60

function params(over: Partial<SpringJointParams> = {}): SpringJointParams {
  return {
    stiffness: 0,
    gravityPower: 0,
    gravityDir: [0, -1, 0],
    dragForce: 0.3,
    hitRadius: 0.01,
    ...over,
  }
}

/**
 * Build a bone chain under `root`: first bone at `attach`, each subsequent
 * bone offset by `segment` from its parent. Returns the ordered bone names.
 * The tip joint's virtual tail repeats `segment` (derived by the solver).
 */
function buildChain(
  root: Object3D,
  name: string,
  count: number,
  attach: [number, number, number],
  segment: [number, number, number],
): string[] {
  let parent: Object3D = root
  const names: string[] = []
  for (let i = 1; i <= count; i++) {
    const bone = new Object3D()
    bone.name = `${name}.${i}`
    bone.position.set(...(i === 1 ? attach : segment))
    parent.add(bone)
    parent = bone
    names.push(bone.name)
  }
  return names
}

function makeRig(
  chainName: string,
  count: number,
  attach: [number, number, number],
  segment: [number, number, number],
  jointParams: SpringJointParams,
  colliderGroups: ColliderGroup[] = [],
  colliderGroupRefs: string[] = [],
) {
  const root = new Object3D()
  root.name = 'root'
  const boneNames = buildChain(root, chainName, count, attach, segment)
  const def: SpringChainDef = {
    name: chainName,
    boneNames,
    joints: boneNames.map(() => ({ ...jointParams })),
    colliderGroupRefs,
  }
  const rig = createSpringRig(root, [def], colliderGroups)
  return { root, rig }
}

function expectFinite(v: Vector3) {
  expect(Number.isFinite(v.x)).toBe(true)
  expect(Number.isFinite(v.y)).toBe(true)
  expect(Number.isFinite(v.z)).toBe(true)
}

describe('createSpringRig', () => {
  it('settles: gravity-only 2-bone chain converges to hanging rest within 2 s, no NaN', () => {
    // Chain sticks out horizontally (+X) from (0, 1, 0); gravity should pull
    // it straight down below the attach point.
    const { rig } = makeRig('c', 2, [0, 1, 0], [0.1, 0, 0], params({ gravityPower: 9.8, dragForce: 0.2 }))
    for (let i = 0; i < 120; i++) rig.step(H)
    const [p0, p1] = rig.getParticles('c')
    expectFinite(p0)
    expectFinite(p1)
    expect(p0.distanceTo(new Vector3(0, 0.9, 0))).toBeLessThan(0.03)
    expect(p1.distanceTo(new Vector3(0, 0.8, 0))).toBeLessThan(0.03)
  })

  it('settled pose is written back into bone rotations (world positions match particles)', () => {
    const { root, rig } = makeRig('c', 2, [0, 1, 0], [0.1, 0, 0], params({ gravityPower: 9.8, dragForce: 0.2 }))
    for (let i = 0; i < 120; i++) rig.step(H)
    root.updateMatrixWorld(true)
    const b2 = root.getObjectByName('c.2')
    if (!b2) throw new Error('missing bone')
    const [p0] = rig.getParticles('c')
    // Particle 0 is the tail of bone c.1 = head of bone c.2.
    expect(b2.getWorldPosition(new Vector3()).distanceTo(p0)).toBeLessThan(1e-6)
  })

  it('follow-through: root teleport makes the tip lag, then converge with bounded overshoot', () => {
    const { root, rig } = makeRig(
      'c',
      2,
      [0, 1, 0],
      [0, -0.1, 0], // rest pose already hanging
      params({ stiffness: 0.35, gravityPower: 2, dragForce: 0.35 }),
    )
    for (let i = 0; i < 60; i++) rig.step(H)
    const tipBefore = rig.getParticles('c')[1].clone()
    root.position.x += 0.3
    rig.step(H)
    const tipAfterOne = rig.getParticles('c')[1].clone()
    // The tip lags the 0.3 m teleport on that frame...
    const firstFrameMove = tipAfterOne.x - tipBefore.x
    expect(firstFrameMove).toBeGreaterThanOrEqual(0)
    expect(firstFrameMove).toBeLessThan(0.25)
    // ...then converges, with bounded overshoot.
    let maxX = tipAfterOne.x
    for (let i = 0; i < 180; i++) {
      rig.step(H)
      maxX = Math.max(maxX, rig.getParticles('c')[1].x)
    }
    const tipFinal = rig.getParticles('c')[1]
    expect(Math.abs(tipFinal.x - (tipBefore.x + 0.3))).toBeLessThan(0.02)
    // Whip-like overshoot is expected and desirable; it just must stay
    // bounded (well under the 0.3 m teleport itself — no explosion).
    expect(maxX).toBeLessThan(tipBefore.x + 0.3 + 0.25)
  })

  it('never stretches: bone lengths preserved within 1e-4 under 10 s of seeded random root motion', () => {
    const { root, rig } = makeRig(
      'c',
      3,
      [0, 1, 0],
      [0, -0.1, 0],
      params({ stiffness: 0.5, gravityPower: 5, dragForce: 0.2 }),
    )
    const rng = mulberry32(42)
    const b1 = root.getObjectByName('c.1')
    if (!b1) throw new Error('missing bone')
    let maxErr = 0
    for (let i = 0; i < 600; i++) {
      root.position.set(0.3 * (rng() - 0.5), 0.3 * (rng() - 0.5), 0.3 * (rng() - 0.5))
      rig.step(H)
      root.updateMatrixWorld(true)
      const head = b1.getWorldPosition(new Vector3())
      const particles = rig.getParticles('c')
      let prev = head
      for (const p of particles) {
        maxErr = Math.max(maxErr, Math.abs(p.distanceTo(prev) - 0.1))
        prev = p
      }
    }
    expect(maxErr).toBeLessThan(1e-4)
  })

  it('stability: 10k steps with dt jitter (4–50 ms) keep every position finite', () => {
    const { root, rig } = makeRig(
      'c',
      2,
      [0, 1, 0],
      [0, -0.1, 0],
      params({ stiffness: 0.7, gravityPower: 9.8, dragForce: 0.1 }),
    )
    const rng = mulberry32(7)
    for (let i = 0; i < 10_000; i++) {
      root.position.set(0.5 * (rng() - 0.5), 0.5 * (rng() - 0.5), 0.5 * (rng() - 0.5))
      rig.step(0.004 + rng() * 0.046)
    }
    for (const p of rig.getParticles('c')) expectFinite(p)
  })

  it('collider pushout: particles inside a sphere collider get projected out', () => {
    // Collider center is offset in +x so the pushout direction is not
    // collinear with the bone axis (a perfectly symmetric setup is a
    // degenerate equilibrium the length constraint cannot escape — and one
    // that never occurs off-axis in practice).
    const colliderGroups: ColliderGroup[] = [
      { name: 'g', colliders: [{ boneName: 'root', offset: [0.05, 0.85, 0], radius: 0.1 }] },
    ]
    const { rig } = makeRig(
      'c',
      2,
      [0, 1, 0],
      [0, -0.1, 0],
      params({ gravityPower: 9.8, dragForce: 0.4, hitRadius: 0.01 }),
      colliderGroups,
      ['g'],
    )
    // Hanging rest would put particles at (0, 0.9, 0) and (0, 0.8, 0) — both
    // inside the collider shell around (0.05, 0.85, 0).
    for (let i = 0; i < 240; i++) rig.step(H)
    const center = new Vector3(0.05, 0.85, 0)
    for (const p of rig.getParticles('c')) {
      expectFinite(p)
      expect(p.distanceTo(center)).toBeGreaterThan(0.1 + 0.01 - 5e-3)
    }
  })

  it('reset snaps particles back onto the animated pose', () => {
    const { root, rig } = makeRig('c', 2, [0, 1, 0], [0, -0.1, 0], params({ gravityPower: 9.8 }))
    root.position.x = 1
    rig.reset()
    const [p0, p1] = rig.getParticles('c')
    expect(p0.distanceTo(new Vector3(1, 0.9, 0))).toBeLessThan(1e-6)
    expect(p1.distanceTo(new Vector3(1, 0.8, 0))).toBeLessThan(1e-6)
  })
})
