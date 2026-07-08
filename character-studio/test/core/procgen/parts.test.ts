// Procedural part builder tests (plan 013 step 3). Registry-driven: every
// non-null-url PART_REGISTRY id builds; attachment mode matches its def; morph
// names match; ≤2.5k tris; determinism.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildProceduralPart } from '../../../src/core/procgen/parts'
import { getPart, PART_IDS, PART_REGISTRY, type PartDef, type PartId, partsForSlot } from '../../../src/core/skeleton/partRegistry'
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

// --- plan 018: AC-scale bird part family --------------------------------------

const BIRD_PART_ADDITIONS = ['beak-chicken', 'beak-penguin', 'comb-chicken', 'crest-peacock', 'tail-sickle-rooster', 'tail-train-peacock'] as const

function extent(scene: THREE.Object3D): [number, number, number] {
  const mn = [Infinity, Infinity, Infinity]
  const mx = [-Infinity, -Infinity, -Infinity]
  for (const m of meshes(scene)) {
    const p = m.geometry.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      for (let a = 0; a < 3; a++) {
        const v = p.getComponent(i, a)
        mn[a] = Math.min(mn[a], v)
        mx[a] = Math.max(mx[a], v)
      }
    }
  }
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
}

describe('plan 018 bird part family', () => {
  it('all new bird part ids build without throwing and are deterministic', () => {
    for (const id of BIRD_PART_ADDITIONS) {
      expect(() => buildProceduralPart(id)).not.toThrow()
      const a = meshes(buildProceduralPart(id)).map((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array))
      const b = meshes(buildProceduralPart(id)).map((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array))
      expect(a).toEqual(b)
    }
  })

  it('beak-small is never-invisible: base-to-tip z-extent ≥ 0.12', () => {
    const [, , ez] = extent(buildProceduralPart('beak-small'))
    expect(ez).toBeGreaterThanOrEqual(0.12)
  })

  it('beak-chicken and beak-penguin are face-dominant: z-extents ≥ 0.09 / 0.12', () => {
    const [, , chickenZ] = extent(buildProceduralPart('beak-chicken'))
    expect(chickenZ).toBeGreaterThanOrEqual(0.09)
    const [, , penguinZ] = extent(buildProceduralPart('beak-penguin'))
    expect(penguinZ).toBeGreaterThanOrEqual(0.12)
  })

  it('bill-duck is broad: x-extent ≥ y-extent × 2.2', () => {
    const [ex, ey] = extent(buildProceduralPart('bill-duck'))
    expect(ex).toBeGreaterThanOrEqual(ey * 2.2)
  })

  it('chicken wattle paints CH_SECONDARY (max = 1) on the beak-chicken mesh', () => {
    let maxSecondary = 0
    for (const m of meshes(buildProceduralPart('beak-chicken'))) {
      const c = m.geometry.getAttribute('paletteChannels')
      for (let i = 0; i < c.count; i++) maxSecondary = Math.max(maxSecondary, c.getY(i))
    }
    expect(maxSecondary).toBeCloseTo(1, 5)
  })

  it('peacock train eyespot has CH_ACCENT>0.8 and CH_BELLY>0.8 in disjoint vertex sets', () => {
    let accHi = 0
    let belHi = 0
    let both = 0
    for (const m of meshes(buildProceduralPart('tail-train-peacock'))) {
      const c = m.geometry.getAttribute('paletteChannels')
      for (let i = 0; i < c.count; i++) {
        const acc = c.getW(i) // accentA
        const bel = c.getZ(i) // belly
        if (acc > 0.8) accHi++
        if (bel > 0.8) belHi++
        if (acc > 0.8 && bel > 0.8) both++
      }
    }
    expect(accHi).toBeGreaterThan(0)
    expect(belHi).toBeGreaterThan(0)
    expect(both).toBe(0)
  })

  it('every new id resolves via getPart with a procedural source', () => {
    for (const id of BIRD_PART_ADDITIONS) {
      const def = getPart(id)
      expect(def, id).not.toBeNull()
      expect(def?.source?.kind, id).toBe('procedural')
    }
  })

  it('pickers list the new bird beaks/crests/tails', () => {
    const beaks = partsForSlot('muzzle', 'bird')
    expect(beaks).toContain('beak-chicken')
    expect(beaks).toContain('beak-penguin')
    expect(beaks.length).toBe(6)
    const crests = partsForSlot('crest', 'bird')
    expect(crests).toContain('comb-chicken')
    expect(crests).toContain('crest-peacock')
    const tails = partsForSlot('tail', 'bird')
    expect(tails).toContain('tail-sickle-rooster')
    expect(tails).toContain('tail-train-peacock')
    expect(tails.length).toBe(3)
  })
})

// --- plan 023: wings as separate feather-fan parts ------------------------------

const WING_IDS = ['wing-round', 'wing-eagle', 'wing-flipper'] as const
const ARM_BONES = new Set(['upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR'])

describe('plan 023 wing part family', () => {
  it('every wing id is a bird-only wings-slot part skinned to the arm chains', () => {
    for (const id of WING_IDS) {
      const def = getPart(id)
      expect(def?.slot, id).toBe('wings')
      expect(def?.classes, id).toEqual(['bird'])
      expect(def?.source?.kind, id).toBe('procedural')
      expect([...(def?.skinnedTo ?? [])].sort()).toEqual([...ARM_BONES].sort())
    }
  })

  it('both sides are present (vertices on +x and −x)', () => {
    for (const id of WING_IDS) {
      let minX = Infinity
      let maxX = -Infinity
      for (const m of meshes(buildProceduralPart(id))) {
        const p = m.geometry.getAttribute('position')
        for (let i = 0; i < p.count; i++) {
          minX = Math.min(minX, p.getX(i))
          maxX = Math.max(maxX, p.getX(i))
        }
      }
      expect(minX, `${id} left of centre`).toBeLessThan(-0.05)
      expect(maxX, `${id} right of centre`).toBeGreaterThan(0.05)
    }
  })

  it('weights land only on arm-chain bones', () => {
    for (const id of WING_IDS) {
      for (const m of meshes(buildProceduralPart(id))) {
        const sm = m as THREE.SkinnedMesh
        if (!sm.isSkinnedMesh) continue
        const si = sm.geometry.getAttribute('skinIndex')
        const sw = sm.geometry.getAttribute('skinWeight')
        for (let i = 0; i < si.count; i++) {
          for (let k = 0; k < 4; k++) {
            const w = sw.getComponent(i, k)
            if (w <= 1e-6) continue
            const bone = sm.skeleton.bones[si.getComponent(i, k)]?.name ?? BONE_NAMES[si.getComponent(i, k)]
            expect(ARM_BONES.has(bone), `${id} vertex ${i} weighted to ${bone}`).toBe(true)
          }
        }
      }
    }
  })

  it('wing-eagle drops lower than wing-round; wing-flipper is the slimmest single paddle', () => {
    const low = (id: string): number => {
      let minY = Infinity
      for (const m of meshes(buildProceduralPart(id))) {
        const p = m.geometry.getAttribute('position')
        for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i))
      }
      return minY
    }
    expect(low('wing-eagle')).toBeLessThan(low('wing-round'))
    expect(triCount(buildProceduralPart('wing-flipper'))).toBeLessThan(triCount(buildProceduralPart('wing-round')))
  })

  it('pickers list the three wing variants for birds', () => {
    expect(partsForSlot('wings', 'bird')).toEqual(['wing-round', 'wing-eagle', 'wing-flipper'])
    expect(partsForSlot('wings', 'mammal')).toEqual([])
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
