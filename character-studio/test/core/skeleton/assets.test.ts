// Builder-output validation (plan 013 step 5.2 — was GLB structural validation).
// The procedural bodies/parts must satisfy the same code contract the shipped
// GLBs used to: canonical bone SET, a translation-only rest pose matching the
// TS-built archetype skeleton within 1e-4, the five body morphs, skin/UV
// attributes, and the part attachment/morph conventions.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildProceduralBody, DEFAULT_BIRD_SHAPE } from '../../../src/core/procgen/body'
import { buildProceduralPart } from '../../../src/core/procgen/parts'
import { ARCHETYPES_DEF, buildArchetypeSkeleton } from '../../../src/core/skeleton/archetypes'
import { BODY_REGISTRY, PART_IDS, PART_REGISTRY, type PartDef } from '../../../src/core/skeleton/partRegistry'
import { ARCHETYPES, BONE_NAMES, type Archetype } from '../../../src/core/spec/schema'

function bonesOf(scene: THREE.Object3D): Map<string, THREE.Bone> {
  const out = new Map<string, THREE.Bone>()
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) out.set(o.name, o as THREE.Bone)
  })
  return out
}

function meshesOf(scene: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  })
  return out
}

describe('procedural archetype bodies', () => {
  it.each([...ARCHETYPES])('%s carries the full canonical bone set', (archetype: Archetype) => {
    const bones = bonesOf(buildProceduralBody(archetype).scene)
    expect([...bones.keys()].sort()).toEqual([...BONE_NAMES].sort())
  })

  it.each([...ARCHETYPES])('%s rest pose is translation-only and matches buildArchetypeSkeleton within 1e-4', (archetype: Archetype) => {
    const bones = bonesOf(buildProceduralBody(archetype).scene)
    const built = buildArchetypeSkeleton(archetype)
    for (const name of BONE_NAMES) {
      const bone = bones.get(name)
      expect(bone, name).toBeDefined()
      if (!bone) continue
      // identity local rotation, unit local scale
      const q = bone.quaternion
      expect(Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) + Math.abs(1 - q.w), `${name} rotation`).toBeLessThan(1e-4)
      expect(Math.abs(bone.scale.x - 1) + Math.abs(bone.scale.y - 1) + Math.abs(bone.scale.z - 1), `${name} scale`).toBeLessThan(1e-4)
      const ref = built.boneByName.get(name)
      expect(ref, name).toBeDefined()
      if (!ref) continue
      // anatomy round 3: the bird body raises the head bone by the species
      // neck lift (DEFAULT_BIRD_SHAPE.neckLength · headRadius) — every other
      // bone still matches the plain archetype skeleton exactly.
      const neckLift =
        archetype === 'bird' && name === 'head'
          ? DEFAULT_BIRD_SHAPE.neckLength * ARCHETYPES_DEF.bird.headRadius * ARCHETYPES_DEF.bird.uniformScale
          : 0
      expect(Math.abs(bone.position.x - ref.position.x), `${name} x`).toBeLessThan(1e-4)
      expect(Math.abs(bone.position.y - (ref.position.y + neckLift)), `${name} y`).toBeLessThan(1e-4)
      expect(Math.abs(bone.position.z - ref.position.z), `${name} z`).toBeLessThan(1e-4)
    }
  })

  it.each([...ARCHETYPES])('%s has the five body morphs and skin/UV attributes on every region mesh', (archetype: Archetype) => {
    const { scene } = buildProceduralBody(archetype)
    for (const mesh of meshesOf(scene)) {
      expect(Object.keys(mesh.morphTargetDictionary ?? {}).sort()).toEqual([...BODY_REGISTRY[archetype].morphs].sort())
      for (const attr of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
        expect(mesh.geometry.getAttribute(attr), `${archetype} ${attr}`).toBeTruthy()
      }
      expect(mesh.geometry.morphAttributes.position).toHaveLength(5)
    }
  })

  it.each([...ARCHETYPES])('%s is within the 18k triangle budget (and not empty)', (archetype: Archetype) => {
    const tris = buildProceduralBody(archetype).triangleCount
    expect(tris).toBeGreaterThan(500)
    expect(tris).toBeLessThanOrEqual(18000)
  })
})

describe('procedural anatomy parts', () => {
  const authored = PART_IDS.filter((id) => (PART_REGISTRY[id] as PartDef).source?.kind === 'procedural')

  it.each(authored)('%s attachment structure matches its registry entry', (id) => {
    const def: PartDef = PART_REGISTRY[id]
    const scene = buildProceduralPart(id)
    if (def.skinnedTo) {
      const skinned = meshesOf(scene).filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[]
      expect(skinned.length).toBeGreaterThan(0)
      const jointNames = new Set(skinned[0].skeleton.bones.map((b) => b.name))
      for (const bone of def.skinnedTo) expect(jointNames.has(bone), `${id} missing joint ${bone}`).toBe(true)
    } else {
      for (const mesh of meshesOf(scene)) {
        const attach = mesh.userData.attachBone as string | undefined
        expect(attach, `${id}/${mesh.name} attachBone`).toBeTruthy()
        expect(def.attachTo, `${id}/${mesh.name}`).toContain(attach)
      }
    }
  })

  it.each(authored)('%s morph targets match the registry morph list', (id) => {
    const def: PartDef = PART_REGISTRY[id]
    const names = new Set<string>()
    for (const mesh of meshesOf(buildProceduralPart(id))) {
      for (const n of (mesh.geometry.userData.targetNames as string[] | undefined) ?? []) names.add(n)
    }
    expect([...names].sort()).toEqual([...def.morphs].sort())
  })
})
