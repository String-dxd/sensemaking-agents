// GLB structural validation (plan 006 step 2/3 verify): the committed
// anatomy assets must satisfy the code contract — canonical bone names
// byte-identical, identity rest rotations (translation-only skeleton),
// morph names, tri/file-size budgets. Validated with @gltf-transform/core
// (GLTFLoader-in-node is not needed for structure checks).

import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NodeIO, type Document, type Mesh, type Primitive } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildArchetypeSkeleton } from '../../../src/core/skeleton/archetypes'
import { BODY_REGISTRY, PART_IDS, PART_REGISTRY, type PartDef } from '../../../src/core/skeleton/partRegistry'
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

/** All primitives across all meshes of a body doc, with their parent mesh. */
function bodyPrimitives(doc: Document): { prim: Primitive; mesh: Mesh }[] {
  const out: { prim: Primitive; mesh: Mesh }[] = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) out.push({ prim, mesh })
  }
  return out
}

/** Vertex position key at 1e-5 m resolution (region-split boundary verts merge). */
function posKey(pos: ArrayLike<number>, i: number): string {
  return `${Math.round((pos[i * 3] as number) * 1e5)},${Math.round((pos[i * 3 + 1] as number) * 1e5)},${Math.round((pos[i * 3 + 2] as number) * 1e5)}`
}

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

  // --- plan 003 weld assertions ----------------------------------------------
  // The body is ONE welded manifold, split into hide-region submeshes for
  // plan 008 (body + body_torso/body_hips/body_upperLegs). Edges are keyed by
  // rounded vertex POSITION across all primitives so the region-split boundary
  // rings (duplicated verts) still read as shared edges.

  it.each([...ARCHETYPES])('%s body is the documented post-weld mesh set', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')
    const names = doc
      .getRoot()
      .listMeshes()
      .map((m) => m.getName())
      .sort()
    expect(names).toEqual(['body', 'body_hips', 'body_torso', 'body_upperLegs'])
  })

  it.each([...ARCHETYPES])('%s body is a closed manifold and a single connected component', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')

    const edgeCount = new Map<string, number>()
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r) as string
      let c = x
      while (parent.get(c) !== c) {
        const next = parent.get(c) as string
        parent.set(c, r)
        c = next
      }
      return r
    }
    const union = (a: string, b: string) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    for (const prims of bodyPrimitives(doc)) {
      const idx = prims.prim.getIndices()?.getArray()
      const pos = prims.prim.getAttribute('POSITION')?.getArray()
      if (!idx || !pos) throw new Error('missing indices/positions')
      for (let t = 0; t < idx.length; t += 3) {
        const k = [posKey(pos, idx[t]), posKey(pos, idx[t + 1]), posKey(pos, idx[t + 2])]
        for (const key of k) if (!parent.has(key)) parent.set(key, key)
        union(k[0], k[1])
        union(k[1], k[2])
        for (const [a, b] of [
          [k[0], k[1]],
          [k[1], k[2]],
          [k[2], k[0]],
        ]) {
          const e = a < b ? `${a}|${b}` : `${b}|${a}`
          edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1)
        }
      }
    }

    // closed manifold: every edge shared by exactly 2 triangles
    let boundary = 0
    let overShared = 0
    for (const c of edgeCount.values()) {
      if (c === 1) boundary++
      else if (c > 2) overShared++
    }
    expect(boundary, 'boundary edges').toBe(0)
    expect(overShared, 'over-shared edges').toBe(0)

    // single connected component (the weld guarantee: no floating shells)
    const roots = new Set<string>()
    for (const k of parent.keys()) roots.add(find(k))
    expect(roots.size, 'connected components').toBe(1)
  })

  it.each([...ARCHETYPES])('%s blends arm and torso bone weights across the shoulder junction', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')
    const jointNames = doc
      .getRoot()
      .listSkins()[0]
      .listJoints()
      .map((j) => j.getName())
    const armBones = new Set(['upperArmL', 'upperArmR', 'foreArmL', 'foreArmR'].map((n) => jointNames.indexOf(n)))
    const torsoBones = new Set(['chest', 'spine', 'hips'].map((n) => jointNames.indexOf(n)))

    let blended = 0
    for (const { prim } of bodyPrimitives(doc)) {
      const joints = prim.getAttribute('JOINTS_0')?.getArray()
      const weights = prim.getAttribute('WEIGHTS_0')?.getArray()
      const pos = prim.getAttribute('POSITION')?.getArray()
      if (!joints || !weights || !pos) throw new Error('missing skin attributes')
      const nv = pos.length / 3
      for (let v = 0; v < nv; v++) {
        let armW = 0
        let torsoW = 0
        for (let s = 0; s < 4; s++) {
          const j = joints[v * 4 + s]
          const w = weights[v * 4 + s]
          if (armBones.has(j)) armW += w
          if (torsoBones.has(j)) torsoW += w
        }
        if (armW > 0.05 && torsoW > 0.05) blended++
      }
    }
    // pinned from the Step 3 weld report (698 / 472 / 437 blended verts per
    // archetype) — regression bar for the weight-island defect (was 0 pre-weld)
    expect(blended).toBeGreaterThanOrEqual(300)
  })

  it.each([...ARCHETYPES])('%s chubby morph is continuous across the welded junctions', (archetype) => {
    const doc = docs.get(archetype)
    if (!doc) throw new Error('doc not loaded')
    let maxDelta = 0
    for (const { prim, mesh } of bodyPrimitives(doc)) {
      const targetNames = (mesh.getExtras() as { targetNames?: string[] } | null)?.targetNames ?? []
      const ci = targetNames.indexOf('chubby')
      if (ci < 0) continue
      const disp = prim.listTargets()[ci].getAttribute('POSITION')?.getArray()
      const idx = prim.getIndices()?.getArray()
      if (!disp || !idx) throw new Error('missing morph target/indices')
      for (let t = 0; t < idx.length; t += 3) {
        for (const [a, b] of [
          [idx[t], idx[t + 1]],
          [idx[t + 1], idx[t + 2]],
          [idx[t + 2], idx[t]],
        ]) {
          const d = Math.hypot(disp[a * 3] - disp[b * 3], disp[a * 3 + 1] - disp[b * 3 + 1], disp[a * 3 + 2] - disp[b * 3 + 2])
          if (d > maxDelta) maxDelta = d
        }
      }
    }
    // seam-tearing regression: pre-weld the arm/torso morph rules diverged at
    // the junction boundary; post-weld smoothing keeps adjacent displacement
    // deltas small (observed max 0.0145 across all three archetypes)
    expect(maxDelta).toBeGreaterThan(0) // sanity: morph target present
    expect(maxDelta).toBeLessThan(0.02)
  })
})

describe('anatomy part GLBs', () => {
  const authored = PART_IDS.filter((id) => PART_REGISTRY[id].url !== null)

  it.each(authored)('%s exists with its mask and fits the budgets', async (id) => {
    const def: PartDef = PART_REGISTRY[id]
    const path = assetPath(def.url as string)
    expect(existsSync(path), path).toBe(true)
    expect(statSync(path).size).toBeLessThanOrEqual(MAX_GLB_BYTES)
    if (def.maskUrl) expect(existsSync(assetPath(def.maskUrl))).toBe(true)
    const doc = await io.read(path)
    expect(triCount(doc)).toBeLessThanOrEqual(2500)
  })

  it.each(authored)('%s attachment structure matches its registry entry', async (id) => {
    const def: PartDef = PART_REGISTRY[id]
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
    const def: PartDef = PART_REGISTRY[id]
    const doc = await io.read(assetPath(def.url as string))
    expect(morphNames(doc).sort()).toEqual([...def.morphs].sort())
  })
})
