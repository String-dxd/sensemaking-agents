import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BONE_PARENTS, buildSkeleton, CANONICAL_BONES, restWorldPositions, SOCKETS } from '../../../src/core/skeleton/canonical'
import { BONE_NAMES } from '../../../src/core/spec/schema'

// Plan 000 §5 bone contract, mechanically enforced. The tree below is the
// prose hierarchy from the architecture doc, restated as data — if this test
// and canonical.ts ever disagree, the plan-000 doc wins.

const PLAN_000_TREE: Record<string, string | null> = {
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  'earL.1': 'head',
  'earL.2': 'earL.1',
  'earR.1': 'head',
  'earR.2': 'earR.1',
  jaw: 'head',
  'socket.hat': 'head',
  'socket.face': 'head',
  'socket.muzzle': 'head',
  shoulderL: 'chest',
  upperArmL: 'shoulderL',
  foreArmL: 'upperArmL',
  handL: 'foreArmL',
  'socket.handL': 'handL',
  shoulderR: 'chest',
  upperArmR: 'shoulderR',
  foreArmR: 'upperArmR',
  handR: 'foreArmR',
  'socket.handR': 'handR',
  upperLegL: 'hips',
  lowerLegL: 'upperLegL',
  footL: 'lowerLegL',
  toesL: 'footL',
  upperLegR: 'hips',
  lowerLegR: 'upperLegR',
  footR: 'lowerLegR',
  toesR: 'footR',
  'tail.1': 'hips',
  'tail.2': 'tail.1',
  'tail.3': 'tail.2',
  'tail.4': 'tail.3',
  'socket.torso': 'chest',
  'socket.back': 'hips',
}

describe('canonical skeleton definition', () => {
  it('contains every plan-000 bone, no extras, in BONE_NAMES order', () => {
    expect(CANONICAL_BONES.map((b) => b.name)).toEqual([...BONE_NAMES])
    expect(Object.keys(PLAN_000_TREE).sort()).toEqual([...BONE_NAMES].sort())
  })

  it('parents match the plan-000 tree exactly', () => {
    for (const def of CANONICAL_BONES) {
      expect({ bone: def.name, parent: def.parent }).toEqual({ bone: def.name, parent: PLAN_000_TREE[def.name] })
    }
    expect(BONE_PARENTS).toEqual(PLAN_000_TREE)
  })

  it('exports all sockets and only sockets', () => {
    expect([...SOCKETS].sort()).toEqual(
      ['socket.hat', 'socket.face', 'socket.muzzle', 'socket.torso', 'socket.back', 'socket.handL', 'socket.handR'].sort(),
    )
  })
})

describe('buildSkeleton', () => {
  it('builds a live hierarchy with exact names and identity rest rotations', () => {
    const { bones, skeleton, boneByName } = buildSkeleton()
    expect(bones).toHaveLength(BONE_NAMES.length)
    expect(skeleton.bones).toHaveLength(BONE_NAMES.length)
    const identity = new Quaternion()
    for (const def of CANONICAL_BONES) {
      const bone = boneByName.get(def.name)
      expect(bone, def.name).toBeDefined()
      expect(bone?.name).toBe(def.name)
      expect(bone?.quaternion.angleTo(identity), `${def.name} rest rotation`).toBeCloseTo(0, 6)
      if (def.parent) expect(bone?.parent?.name).toBe(def.parent)
      else expect(bone?.parent).toBeNull()
    }
  })

  it('reference character is 1.0 tall with mirrored L/R joints', () => {
    const built = buildSkeleton()
    const world = restWorldPositions(built)
    // skull top = head bone + reference cranium (centre 0.18, radius 0.20)
    expect(world.head[1] + 0.18 + 0.2).toBeCloseTo(1.0, 5)
    expect(world.root).toEqual([0, 0, 0])
    for (const [l, r] of [
      ['shoulderL', 'shoulderR'],
      ['handL', 'handR'],
      ['upperLegL', 'upperLegR'],
      ['footL', 'footR'],
      ['toesL', 'toesR'],
      ['earL.2', 'earR.2'],
      ['socket.handL', 'socket.handR'],
    ] as const) {
      expect(world[l][0]).toBeCloseTo(-world[r][0], 6)
      expect(world[l][1]).toBeCloseTo(world[r][1], 6)
      expect(world[l][2]).toBeCloseTo(world[r][2], 6)
    }
  })

  it('rest pose is A-pose-like: arms ~30° below horizontal, feet at ground', () => {
    const world = restWorldPositions(buildSkeleton())
    const dx = world.handL[0] - world.upperArmL[0]
    const dy = world.handL[1] - world.upperArmL[1]
    const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI
    expect(angleDeg).toBeGreaterThan(20)
    expect(angleDeg).toBeLessThan(40)
    expect(world.toesL[1]).toBeGreaterThan(0)
    expect(world.toesL[1]).toBeLessThan(0.05)
    expect(world.toesL[2]).toBeGreaterThan(world.footL[2]) // toes point forward (+Z)
  })

  it('spring chains satisfy the solver direct-parent requirement', () => {
    const { boneByName } = buildSkeleton()
    for (const chain of [
      ['earL.1', 'earL.2'],
      ['earR.1', 'earR.2'],
      ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
    ] as const) {
      for (let i = 1; i < chain.length; i++) {
        expect(boneByName.get(chain[i])?.parent).toBe(boneByName.get(chain[i - 1]))
      }
    }
  })

  it('applies offset scales to the bone subtree', () => {
    const scaled = buildSkeleton({ offsetScales: { hips: [1, 0.5, 1] }, uniformScale: 2 })
    const world = restWorldPositions(scaled)
    expect(world.hips[1]).toBeCloseTo(0.34 * 0.5 * 2, 6)
    // children ride along: head offset chain unscaled except the uniform 2×
    expect(world.head[1]).toBeCloseTo((0.34 * 0.5 + 0.28) * 2, 6)
    const v = new Vector3()
    v.setFromMatrixPosition(scaled.boneByName.get('head')!.matrixWorld)
    expect(v.y).toBeCloseTo(world.head[1], 6)
  })
})
