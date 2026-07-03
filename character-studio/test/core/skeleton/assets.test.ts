// GLB structural validation (plan 006 step 2/3 verify): the committed
// anatomy assets must satisfy the code contract — canonical bone names
// byte-identical, identity rest rotations (translation-only skeleton),
// morph names, tri/file-size budgets. Validated with @gltf-transform/core
// (GLTFLoader-in-node is not needed for structure checks).

import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NodeIO, type Document } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildArchetypeSkeleton } from '../../../src/core/skeleton/archetypes'
import { BODY_REGISTRY, PART_IDS, PART_REGISTRY } from '../../../src/core/skeleton/partRegistry'
import { ARCHETYPES, BONE_NAMES, type Archetype } from '../../../src/core/spec/schema'

const io = new NodeIO()

function assetPath(url: string): string {
  return fileURLToPath(url)
}

function triCount(doc: Document): number {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      tris += indices ? indices.getCount() / 3 : (prim.getAttribute('POSITION')?.getCount() ?? 0) / 3
    }
  }
  return tris
}

function morphNames(doc: Document): string[] {
  const names = new Set<string>()
  for (const mesh of doc.getRoot().listMeshes()) {
    const extras = mesh.getExtras() as { targetNames?: string[] } | null
    for (const n of extras?.targetNames ?? []) names.add(n)
  }
  return [...names]
}

const MAX_GLB_BYTES = 5 * 1024 * 1024

describe('archetype body GLBs', () => {
  const docs = new Map<Archetype, Document>()

  beforeAll(async () => {
    for (const archetype of ARCHETYPES) {
      docs.set(archetype, await io.read(assetPath(BODY_REGISTRY[archetype].url)))
    }
  })

  it.each([...ARCHETYPES])('%s exists and is within the size budget', (archetype) => {
    const path = assetPath(BODY_REGISTRY[archetype].url)
    expect(existsSync(path)).toBe(true)
    expect(statSync(path).size).toBeLessThanOrEqual(MAX_GLB_BYTES)
    expect(existsSync(assetPath(BODY_REGISTRY[archetype].maskUrl))).toBe(true)
  })

  it.each([...ARCHETYPES])('%s skeleton matches canonical.ts byte-identically', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')
    const skins = doc.getRoot().listSkins()
    expect(skins).toHaveLength(1)
    const joints = skins[0].listJoints()
    // exact bone SET (order is exporter traversal order — irrelevant to skinning)
    expect(joints.map((j) => j.getName()).sort()).toEqual([...BONE_NAMES].sort())

    // translation-only rest pose (identity rotations, unit scales), positions
    // matching the TS-built archetype skeleton
    const built = buildArchetypeSkeleton(archetype)
    for (const joint of joints) {
      const [rx, ry, rz, rw] = joint.getRotation()
      expect(Math.abs(rx) + Math.abs(ry) + Math.abs(rz) + Math.abs(1 - rw), `${joint.getName()} rotation`).toBeLessThan(1e-4)
      const [sx, sy, sz] = joint.getScale()
      expect(Math.abs(sx - 1) + Math.abs(sy - 1) + Math.abs(sz - 1), `${joint.getName()} scale`).toBeLessThan(1e-4)
      const bone = built.boneByName.get(joint.getName() as (typeof BONE_NAMES)[number])
      expect(bone, joint.getName()).toBeDefined()
      const t = joint.getTranslation()
      for (let axis = 0; axis < 3; axis++) {
        const expected = [bone?.position.x ?? 0, bone?.position.y ?? 0, bone?.position.z ?? 0][axis]
        expect(Math.abs(t[axis] - expected), `${joint.getName()} translation[${axis}]`).toBeLessThan(1e-4)
      }
    }
  })

  it.each([...ARCHETYPES])('%s has the five body morphs, skin attributes and UVs', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')
    expect(morphNames(doc).sort()).toEqual([...BODY_REGISTRY[archetype].morphs].sort())
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
          expect(prim.getAttribute(semantic), `${archetype} ${semantic}`).toBeTruthy()
        }
        expect(prim.listTargets().length).toBe(5)
      }
    }
  })

  it.each([...ARCHETYPES])('%s is within the 18k tri budget', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')
    const tris = triCount(doc)
    expect(tris).toBeGreaterThan(500) // sanity: not an empty export
    expect(tris).toBeLessThanOrEqual(18000)
  })
})

describe('anatomy part GLBs', () => {
  const authored = PART_IDS.filter((id) => PART_REGISTRY[id].url !== null)

  it.each(authored)('%s exists with its mask and fits the budgets', async (id) => {
    const def = PART_REGISTRY[id]
    const path = assetPath(def.url as string)
    expect(existsSync(path), path).toBe(true)
    expect(statSync(path).size).toBeLessThanOrEqual(MAX_GLB_BYTES)
    if (def.maskUrl) expect(existsSync(assetPath(def.maskUrl))).toBe(true)
    const doc = await io.read(path)
    expect(triCount(doc)).toBeLessThanOrEqual(2500)
  })

  it.each(authored)('%s attachment structure matches its registry entry', async (id) => {
    const def = PART_REGISTRY[id]
    const doc = await io.read(assetPath(def.url as string))
    const root = doc.getRoot()
    if (def.skinnedTo) {
      const skins = root.listSkins()
      expect(skins.length).toBeGreaterThan(0)
      const jointNames = new Set(skins.flatMap((s) => s.listJoints().map((j) => j.getName())))
      for (const bone of def.skinnedTo) expect(jointNames, `${id} missing joint ${bone}`).toContain(bone)
    } else {
      // rigid: every mesh node must carry an attachBone extra targeting a
      // bone from the registry's attachTo list
      const meshNodes = root.listNodes().filter((n) => n.getMesh())
      expect(meshNodes.length).toBeGreaterThan(0)
      for (const node of meshNodes) {
        const extras = node.getExtras() as { attachBone?: string } | null
        expect(extras?.attachBone, `${id}/${node.getName()} attachBone extra`).toBeTruthy()
        expect(def.attachTo, `${id}/${node.getName()}`).toContain(extras?.attachBone)
      }
    }
  })

  it.each(authored)('%s morph targets match the registry morph list', async (id) => {
    const def = PART_REGISTRY[id]
    const doc = await io.read(assetPath(def.url as string))
    expect(morphNames(doc).sort()).toEqual([...def.morphs].sort())
  })
})
