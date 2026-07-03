// Wardrobe GLB structural validation (plan 008 step 2 verify) — the
// committed wardrobe assets must satisfy the ASSET-CONTRACT "Wardrobe items"
// section: registry ↔ files 1:1, tri/size budgets, skinned meshes referencing
// only canonical bones (+ the item's own declared spring bones), declared
// spring bones actually present in the GLB, rigid meshes carrying attachBone
// extras that match the registry socket, morph names matching the registry.
// Same @gltf-transform/core approach as the plan-006 anatomy assets test.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, type Document } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { BONE_NAMES } from '../../../src/core/spec/schema'
import {
  WARDROBE_ITEM_IDS,
  WARDROBE_REGISTRY,
  type WardrobeItemId,
} from '../../../src/core/wardrobe/itemRegistry'

const io = new NodeIO()
const CANONICAL = new Set<string>(BONE_NAMES)
const TRI_BUDGET = 3000
const MAX_BYTES = 2 * 1024 * 1024

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

function itemSpringBones(id: WardrobeItemId): Set<string> {
  return new Set((WARDROBE_REGISTRY[id].springChains ?? []).flatMap((c) => c.boneNames))
}

describe('wardrobe item GLBs', () => {
  const docs = new Map<WardrobeItemId, Document>()

  beforeAll(async () => {
    for (const id of WARDROBE_ITEM_IDS) {
      docs.set(id, await io.read(assetPath(WARDROBE_REGISTRY[id].url)))
    }
  })

  it('registry and asset directory match 1:1 (GLBs and masks)', () => {
    const glbDir = dirname(assetPath(WARDROBE_REGISTRY[WARDROBE_ITEM_IDS[0]].url))
    const onDisk = readdirSync(glbDir).filter((f) => f.endsWith('.glb')).sort()
    const declared = WARDROBE_ITEM_IDS.map((id) => `${id}.glb`).sort()
    expect(onDisk).toEqual(declared)

    const masksOnDisk = readdirSync(`${glbDir}/textures`).filter((f) => f.endsWith('.png')).sort()
    const masksDeclared = WARDROBE_ITEM_IDS.flatMap((id) =>
      WARDROBE_REGISTRY[id].maskUrl ? [`item-${id}.mask.png`] : [],
    ).sort()
    expect(masksOnDisk).toEqual(masksDeclared)
  })

  it.each([...WARDROBE_ITEM_IDS])('%s exists with its mask and fits the budgets', (id) => {
    const def = WARDROBE_REGISTRY[id]
    const path = assetPath(def.url)
    expect(existsSync(path), path).toBe(true)
    expect(statSync(path).size).toBeLessThanOrEqual(MAX_BYTES)
    if (def.maskUrl) expect(existsSync(assetPath(def.maskUrl))).toBe(true)
    const doc = docs.get(id)
    if (!doc) throw new Error('doc not loaded')
    const tris = triCount(doc)
    expect(tris).toBeGreaterThan(10) // sanity: not an empty export
    expect(tris).toBeLessThanOrEqual(TRI_BUDGET)
  })

  it.each([...WARDROBE_ITEM_IDS])('%s attachment structure matches its registry entry', (id) => {
    const def = WARDROBE_REGISTRY[id]
    const doc = docs.get(id)
    if (!doc) throw new Error('doc not loaded')
    const root = doc.getRoot()
    const skins = root.listSkins()
    const meshNodes = root.listNodes().filter((n) => n.getMesh())
    expect(meshNodes.length).toBeGreaterThan(0)
    const rigidNodes = meshNodes.filter((n) => !n.getSkin())
    const skinnedNodes = meshNodes.filter((n) => n.getSkin())

    if (def.attach === 'socket') {
      expect(skins).toHaveLength(0)
      expect(skinnedNodes).toHaveLength(0)
    } else if (def.attach === 'skinned') {
      expect(skinnedNodes.length).toBeGreaterThan(0)
      expect(rigidNodes).toHaveLength(0)
    } else {
      expect(skinnedNodes.length).toBeGreaterThan(0)
      expect(rigidNodes.length).toBeGreaterThan(0)
    }

    // rigid meshes: attachBone extra present and equal to the registry socket
    for (const node of rigidNodes) {
      const extras = node.getExtras() as { attachBone?: string } | null
      expect(extras?.attachBone, `${id}/${node.getName()} attachBone extra`).toBe(def.socket)
    }

    // skinned meshes: joints are canonical bones or this item's declared
    // spring bones — nothing else (no retargeting, plan 000 §2.2)
    const allowed = itemSpringBones(id)
    for (const skin of skins) {
      for (const joint of skin.listJoints()) {
        const name = joint.getName()
        expect(
          CANONICAL.has(name) || allowed.has(name),
          `${id}: skin joint "${name}" is neither canonical nor a declared spring bone`,
        ).toBe(true)
      }
    }
  })

  it.each([...WARDROBE_ITEM_IDS])('%s contains every declared spring-chain bone', (id) => {
    const doc = docs.get(id)
    if (!doc) throw new Error('doc not loaded')
    const nodeNames = new Set(doc.getRoot().listNodes().map((n) => n.getName()))
    for (const bone of itemSpringBones(id)) {
      expect(nodeNames.has(bone), `${id}: spring bone "${bone}" missing from GLB`).toBe(true)
    }
  })

  it.each([...WARDROBE_ITEM_IDS])('%s morph targets match the registry morph list', (id) => {
    const doc = docs.get(id)
    if (!doc) throw new Error('doc not loaded')
    expect(morphNames(doc).sort()).toEqual([...WARDROBE_REGISTRY[id].morphs].sort())
  })

  it.each([...WARDROBE_ITEM_IDS])('%s primitives carry positions, normals and UVs', (id) => {
    const doc = docs.get(id)
    if (!doc) throw new Error('doc not loaded')
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
          expect(prim.getAttribute(semantic), `${id} ${mesh.getName()} ${semantic}`).toBeTruthy()
        }
      }
    }
  })
})
