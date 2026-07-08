// Procedural body builder tests (plan 013 step 2). Vanilla vitest + real three,
// modelled after test/core/skeleton/assemble.test.ts.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildProceduralBody } from '../../../src/core/procgen/body'
import { ARCHETYPES_DEF } from '../../../src/core/skeleton/archetypes'
import { BODY_MORPHS } from '../../../src/core/skeleton/partRegistry'
import { ARCHETYPES, BONE_NAMES, type Archetype } from '../../../src/core/spec/schema'

function skinnedMeshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh)
  })
  return out
}

describe.each([...ARCHETYPES])('buildProceduralBody(%s)', (archetype: Archetype) => {
  const data = buildProceduralBody(archetype)

  it('is a closed manifold, single connected component', () => {
    expect(data.manifold.boundaryEdges, 'boundary edges').toBe(0)
    expect(data.manifold.overSharedEdges, 'over-shared edges').toBe(0)
    expect(data.manifold.components, 'connected components').toBe(1)
  })

  it('carries the full 38-bone canonical skeleton', () => {
    const meshes = skinnedMeshes(data.scene)
    expect(meshes.length).toBeGreaterThan(0)
    const bones = new Set<string>()
    data.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.add(o.name)
    })
    for (const name of BONE_NAMES) expect(bones.has(name), name).toBe(true)
    expect(bones.size).toBe(BONE_NAMES.length)
  })

  it('is the documented region-split mesh set (body + 3 hide regions)', () => {
    const names = skinnedMeshes(data.scene)
      .map((m) => m.name)
      .sort()
    expect(names).toEqual(['body', 'body_hips', 'body_torso', 'body_upperLegs'])
  })

  it('tags hide-region submeshes with userData.bodyRegion', () => {
    const byName = new Map(skinnedMeshes(data.scene).map((m) => [m.name, m]))
    expect(byName.get('body')?.userData.bodyRegion).toBeUndefined()
    expect(byName.get('body_torso')?.userData.bodyRegion).toBe('torso')
    expect(byName.get('body_hips')?.userData.bodyRegion).toBe('hips')
    expect(byName.get('body_upperLegs')?.userData.bodyRegion).toBe('upperLegs')
  })

  it('has the five body morphs with a normalized ≤4-influence skin', () => {
    for (const mesh of skinnedMeshes(data.scene)) {
      expect(Object.keys(mesh.morphTargetDictionary ?? {}).sort()).toEqual([...BODY_MORPHS].sort())
      expect(mesh.geometry.morphAttributes.position).toHaveLength(5)
      expect(mesh.geometry.morphTargetsRelative).toBe(true)
      const sw = mesh.geometry.getAttribute('skinWeight')
      for (let i = 0; i < sw.count; i++) {
        const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i)
        expect(s).toBeCloseTo(1, 4)
      }
    }
  })

  it('carries POSITION/NORMAL/UV/JOINTS/WEIGHTS on every region mesh', () => {
    for (const mesh of skinnedMeshes(data.scene)) {
      for (const attr of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
        expect(mesh.geometry.getAttribute(attr), `${mesh.name} ${attr}`).toBeTruthy()
      }
    }
  })

  it('fits the 18k triangle budget (and is not empty)', () => {
    expect(data.triangleCount).toBeGreaterThan(500)
    expect(data.triangleCount).toBeLessThanOrEqual(18000)
  })

  it('exposes a complete ProcBodyData.meta', () => {
    const vcount = skinnedMeshes(data.scene)[0].geometry.getAttribute('position').count
    expect(data.channels.length).toBe(4 * vcount)
    expect(data.meta.torso.ry).toBeGreaterThan(0)
    expect(data.meta.headRadius).toBeGreaterThan(0)
    expect(Object.keys(data.meta.shellRanges)).toContain('torso')
    expect(Object.keys(data.meta.shellRanges)).toContain('head')
    // limb params present for all four limbs
    for (const limb of ['armL', 'armR', 'legL', 'legR']) {
      expect(data.meta.limbParams[limb]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('head UV: a front vertex maps near the head-island u-center (face contract)', () => {
    // find the head mesh's front-most (max +Z) vertex, read its UV.u
    const [u0, , u1] = [0.0, 0.45, 0.55, 1.0]
    const uCenter = (u0 + u1) / 2
    const mesh = skinnedMeshes(data.scene)[0]
    const pos = mesh.geometry.getAttribute('position')
    const uv = mesh.geometry.getAttribute('uv')
    const headStart = data.meta.shellRanges.head[0]
    const headEnd = data.meta.shellRanges.head[1]
    let frontIdx = headStart
    let maxZ = -Infinity
    let topIdx = headStart
    let maxY = -Infinity
    for (let i = headStart; i < headEnd; i++) {
      if (Math.abs(pos.getX(i)) < 0.02 && pos.getY(i) > maxY) {
        maxY = pos.getY(i)
        topIdx = i
      }
      // near the head vertical centre so we sample the equator, not a pole
      if (Math.abs(pos.getY(i) - data.meta.headCenter[1]) > data.meta.headRadius * 0.3) continue
      if (pos.getZ(i) > maxZ) {
        maxZ = pos.getZ(i)
        frontIdx = i
      }
    }
    expect(uv.getX(frontIdx)).toBeCloseTo(uCenter, 2)
    // glTF V-flip (matches shipped GLBs): top-of-head sits at the small-v edge
    // of the island and v grows toward the neck — the orientation faceComposite
    // draws for. A front equator vertex lands mid-island in the flipped band.
    expect(uv.getY(topIdx)).toBeLessThan(uv.getY(frontIdx))
    expect(uv.getY(frontIdx)).toBeCloseTo(0.275, 1)
    expect(uv.getY(topIdx)).toBeLessThan(0.1)
  })

  it('bellyRound pushes a front-lower-torso vertex outward by ≈0.075·u', () => {
    const u = ARCHETYPES_DEF[archetype].uniformScale
    const mesh = skinnedMeshes(data.scene)[0]
    const belly = mesh.geometry.morphAttributes.position![BODY_MORPHS.indexOf('bellyRound')]
    // probe: torso vertex on the front (+Z), below torso centre
    const [ts, te] = data.meta.shellRanges.torso
    const pos = mesh.geometry.getAttribute('position')
    let probe = -1
    let bestScore = -Infinity
    for (let i = ts; i < te; i++) {
      const z = pos.getZ(i)
      const y = pos.getY(i)
      const score = z - Math.abs(y - (data.meta.torso.cy - data.meta.torso.ry * 0.3))
      if (z > 0 && y < data.meta.torso.cy && score > bestScore) {
        bestScore = score
        probe = i
      }
    }
    expect(probe).toBeGreaterThanOrEqual(0)
    const dx = belly.getX(probe)
    const dz = belly.getZ(probe)
    const mag = Math.hypot(dx, dz)
    // magnitude is the recipe's radial 0.075·u (+ forward 0.02·u); expect the
    // probe near the belly centre to move a meaningful fraction of 0.075·u
    expect(mag).toBeGreaterThan(0.02 * u)
    expect(mag).toBeLessThan(0.12 * u)
    expect(dz).toBeGreaterThan(0) // pushed forward/out on the +Z front
  })

  it('is deterministic (two builds → byte-equal positions & channels)', () => {
    const a = buildProceduralBody(archetype)
    const b = buildProceduralBody(archetype)
    const posA = skinnedMeshes(a.scene)[0].geometry.getAttribute('position').array as Float32Array
    const posB = skinnedMeshes(b.scene)[0].geometry.getAttribute('position').array as Float32Array
    expect(Float32Array.from(posA)).toEqual(Float32Array.from(posB))
    expect(a.channels).toEqual(b.channels)
    expect(a.triangleCount).toBe(b.triangleCount)
  })
})
