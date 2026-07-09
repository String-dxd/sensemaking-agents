// Bird villager proportion pins (AC-style humanoid bird remodel, 2026-07-09).
// The bird must read as a STACKED chibi villager — big head (~49 % of height)
// ON a clearly visible egg torso (~88 % of the head's width incl. the pear
// bulge), on thin stick legs, with wing-arms hanging near-vertically at the
// flank to hip level — not a squat blob. These world-space targets are
// asserted from the built skeleton + procedural mesh meta so a proportion
// regression in ARCHETYPES_DEF / STYLE fails loudly. (The runtime renders the
// authored GLB lane, which scripts/blender/bodies.py keeps in visual lockstep
// with this procedural builder — same skeleton.json, same STYLE numbers.)

import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildProceduralBody, type ProcBodyData } from '../../../src/core/procgen/body'
import { archetypeHead, buildArchetypeSkeleton } from '../../../src/core/skeleton/archetypes'
import { restWorldPositions } from '../../../src/core/skeleton/canonical'
import type { BoneName } from '../../../src/core/spec/schema'

describe('bird villager proportions (world space)', () => {
  let world: Record<BoneName, [number, number, number]>
  let head: ReturnType<typeof archetypeHead>
  let data: ProcBodyData
  let pos: THREE.BufferAttribute
  let height: number

  beforeAll(() => {
    world = restWorldPositions(buildArchetypeSkeleton('bird'))
    head = archetypeHead('bird')
    data = buildProceduralBody('bird')
    const mesh = data.scene.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh
    pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    height = world.head[1] + head.center[1] + head.radius
  })

  it('total height (skull top) ≈ 0.8', () => {
    expect(height).toBeGreaterThan(0.77)
    expect(height).toBeLessThan(0.83)
  })

  it('big head: diameter ≈ 0.45–0.55×height, centre ≈ 0.72–0.76×height', () => {
    expect(head.radius * 2).toBeGreaterThanOrEqual(0.45 * height)
    expect(head.radius * 2).toBeLessThanOrEqual(0.55 * height)
    const headCenterY = world.head[1] + head.center[1]
    expect(headCenterY / height).toBeGreaterThan(0.7)
    expect(headCenterY / height).toBeLessThan(0.76)
  })

  it('egg torso narrower than the head but clearly present: rx ≤ 0.78×headR, full silhouette ≤ 0.92×headR', () => {
    expect(data.meta.torso.rx).toBeLessThanOrEqual(0.78 * head.radius)
    // the pear profile widens the lower torso past rx — the FULL silhouette
    // must stay under the head's width so the head reads as sitting ON it,
    // but not so skinny the body vanishes under the head (AC villager egg)
    const [ts, te] = data.meta.shellRanges.torso
    let maxHalfWidth = 0
    for (let i = ts; i < te; i++) maxHalfWidth = Math.max(maxHalfWidth, Math.abs(pos.getX(i)))
    expect(maxHalfWidth).toBeLessThanOrEqual(0.92 * head.radius)
    expect(maxHalfWidth).toBeGreaterThanOrEqual(0.72 * head.radius)
  })

  it('head sits ON the body: torso top stays below the head centre', () => {
    const { cy, ry } = data.meta.torso
    const headCenterY = world.head[1] + head.center[1]
    expect(cy + ry).toBeLessThan(headCenterY)
  })

  it('visible legs: hips ≥ 0.22×height, feet grounded (bottom ≈ 0 ± 0.01)', () => {
    expect(world.hips[1]).toBeGreaterThanOrEqual(0.22 * height)
    for (const foot of ['footL', 'footR'] as const) {
      const [fs, fe] = data.meta.shellRanges[foot]
      let minY = Infinity
      for (let i = fs; i < fe; i++) minY = Math.min(minY, pos.getY(i))
      expect(Math.abs(minY), `${foot} bottom`).toBeLessThanOrEqual(0.01)
    }
  })

  it('T-pose wing-arms: horizontal at shoulder height, in the flank z-plane, extending past the head silhouette', () => {
    for (const [arm, sign] of [
      ['armL', 1],
      ['armR', -1],
    ] as const) {
      const [as, ae] = data.meta.shellRanges[arm]
      const t = data.meta.limbParams[arm]
      // pointy feather tip = the max-arclength vertex of the wing loft
      let tip = as
      for (let i = as; i < ae; i++) if (t[i - as] > t[tip - as]) tip = i
      const tipY = pos.getY(tip)
      const tipX = pos.getX(tip) * sign
      const tipZ = pos.getZ(tip)
      // horizontal wing: tip stays at shoulder height (AC catalogue T-pose)
      expect(tipY, `${arm} tip y`).toBeGreaterThan(world.shoulderL[1] - 0.05)
      expect(tipY, `${arm} tip y`).toBeLessThan(world.shoulderL[1] + 0.05)
      // tip stays in the flank plane — no forward drift over the belly
      const shoulderZ = (arm === 'armL' ? world.upperArmL : world.upperArmR)[2]
      expect(Math.abs(tipZ - shoulderZ), `${arm} tip z`).toBeLessThanOrEqual(0.02)
      // the wing extends past the cranium's silhouette (like the reference
      // catalogue T-pose) but stays inside a head-and-a-half — wider reads
      // as aeroplane arms
      expect(tipX, `${arm} tip x`).toBeGreaterThan(head.radius)
      expect(tipX, `${arm} tip x`).toBeLessThan(head.radius * 1.45)
    }
  })

  it('stays a closed single-component manifold', () => {
    expect(data.manifold.boundaryEdges).toBe(0)
    expect(data.manifold.overSharedEdges).toBe(0)
    expect(data.manifold.components).toBe(1)
  })
})
