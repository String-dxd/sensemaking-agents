// Procedural part builder tests (plan 013 step 3). Registry-driven: every
// non-null-url PART_REGISTRY id builds; attachment mode matches its def; morph
// names match; ≤2.5k tris; determinism.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildProceduralPart } from '../../../src/core/procgen/parts'
import { PART_IDS, PART_REGISTRY, type PartDef, type PartId } from '../../../src/core/skeleton/partRegistry'
import { BONE_NAMES } from '../../../src/core/spec/schema'

const authored = PART_IDS.filter((id) => PART_REGISTRY[id].url !== null)

function meshes(scene: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  })
  return out
}

function triCount(scene: THREE.Object3D): number {
  let tris = 0
  for (const m of meshes(scene)) {
    const idx = m.geometry.getIndex()
    tris += idx ? idx.count / 3 : (m.geometry.getAttribute('position')?.count ?? 0) / 3
  }
  return tris
}

describe.each(authored)('buildProceduralPart(%s)', (id: PartId) => {
  const def: PartDef = PART_REGISTRY[id]
  const scene = buildProceduralPart(id)

  it('builds at least one mesh', () => {
    expect(meshes(scene).length).toBeGreaterThan(0)
  })

  it('attachment mode matches the registry entry', () => {
    if (def.skinnedTo) {
      // skinned: SkinnedMesh(es) bound to a skeleton containing the chain bones
      const skinned = meshes(scene).filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[]
      expect(skinned.length).toBeGreaterThan(0)
      const jointNames = new Set(skinned[0].skeleton.bones.map((b) => b.name))
      for (const bone of def.skinnedTo) expect(jointNames.has(bone), `${id} missing joint ${bone}`).toBe(true)
    } else {
      // rigid: every mesh carries a userData.attachBone from the def's attachTo
      for (const m of meshes(scene)) {
        const attach = m.userData.attachBone as string | undefined
        expect(attach, `${id}/${m.name} attachBone`).toBeTruthy()
        expect(def.attachTo, `${id}/${m.name}`).toContain(attach)
      }
    }
  })

  it('morph target names match the registry morph list', () => {
    const names = new Set<string>()
    for (const m of meshes(scene)) {
      for (const n of (m.geometry.userData.targetNames as string[] | undefined) ?? []) names.add(n)
    }
    expect([...names].sort()).toEqual([...def.morphs].sort())
  })

  it('fits the 2.5k triangle budget', () => {
    expect(triCount(scene)).toBeLessThanOrEqual(2500)
  })

  it('skinned parts weight only to canonical bones with a normalized skin', () => {
    for (const m of meshes(scene)) {
      const sm = m as THREE.SkinnedMesh
      if (!sm.isSkinnedMesh) continue
      const sw = sm.geometry.getAttribute('skinWeight')
      let anyNonZero = false
      for (let i = 0; i < sw.count; i++) {
        const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i)
        if (s > 1e-6) {
          anyNonZero = true
          expect(s).toBeCloseTo(1, 4)
        }
      }
      expect(anyNonZero).toBe(true)
      for (const b of sm.skeleton.bones) expect(BONE_NAMES as readonly string[]).toContain(b.name)
    }
  })

  it('is deterministic (two builds → byte-equal positions)', () => {
    const a = buildProceduralPart(id)
    const b = buildProceduralPart(id)
    const pa = meshes(a).map((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array))
    const pb = meshes(b).map((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array))
    expect(pa).toEqual(pb)
  })
})

describe('claws multi-attach', () => {
  it('builds one mesh per hand/foot bone with matching attachBone', () => {
    const scene = buildProceduralPart('stub-claws')
    const attachBones = meshes(scene)
      .map((m) => m.userData.attachBone as string)
      .sort()
    expect(attachBones).toEqual(['footL', 'footR', 'handL', 'handR'])
  })
})
