import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NodeIO, type Document } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { PART_REGISTRY, type PartDef, type PartId } from '../../../src/core/skeleton/partRegistry'
import { BONE_NAMES } from '../../../src/core/spec/schema'

const WING_IDS = [
  'wing-robin',
  'wing-owl',
  'wing-duck',
  'wing-eagle',
  'wing-flipper',
  'wing-chicken',
  'wing-peacock',
  'wing-bowerbird',
] as const satisfies readonly PartId[]

const ARM_BONES = new Set(['upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR'])
const ARTICULATED_WINGS = new Set<PartId>(['wing-eagle', 'wing-owl'])
// U16/V14 + one Catmull-Clark level preserves the three explicit raptor
// terminal lobes and remains inexpensive relative to the full character.
const MAX_WING_PAIR_TRIS = 9_000
const io = new NodeIO()

function glbDef(id: PartId): PartDef & { source: { kind: 'glb'; url: string } } {
  const def = PART_REGISTRY[id] as PartDef
  if (def.source?.kind !== 'glb') throw new Error(`${id} is not a GLB part`)
  return def as PartDef & { source: { kind: 'glb'; url: string } }
}

function triangleCount(doc: Document): number {
  let count = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      count += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3
    }
  }
  return count
}

describe('authored species wing GLBs', () => {
  const docs = new Map<PartId, Document>()

  beforeAll(async () => {
    for (const id of WING_IDS) docs.set(id, await io.read(fileURLToPath(glbDef(id).source.url)))
  })

  it.each(WING_IDS)('%s exists and stays inside the anatomy budget', (id) => {
    const path = fileURLToPath(glbDef(id).source.url)
    expect(existsSync(path), path).toBe(true)
    expect(statSync(path).size).toBeLessThanOrEqual(5 * 1024 * 1024)
    const tris = triangleCount(docs.get(id)!)
    expect(tris).toBeGreaterThan(100)
    expect(tris).toBeLessThanOrEqual(MAX_WING_PAIR_TRIS)
  })

  it.each(WING_IDS)('%s contains the canonical skin and required attributes', (id) => {
    const doc = docs.get(id)!
    const root = doc.getRoot()
    expect(root.listSkins()).toHaveLength(1)
    expect(root.listSkins()[0].listJoints().map((joint) => joint.getName()).sort()).toEqual([...BONE_NAMES].sort())
    const meshNodes = root.listNodes().filter((node) => node.getMesh())
    expect(meshNodes).toHaveLength(2)
    for (const node of meshNodes) {
      expect(node.getSkin()).toBe(root.listSkins()[0])
      for (const primitive of node.getMesh()!.listPrimitives()) {
        for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']) {
          expect(primitive.getAttribute(semantic), `${id}/${node.getName()} ${semantic}`).toBeTruthy()
        }
      }
    }
  })

  it.each(WING_IDS)('%s uses normalized species-appropriate arm weights', (id) => {
    const doc = docs.get(id)!
    for (const node of doc.getRoot().listNodes().filter((candidate) => candidate.getMesh())) {
      const joints = node.getSkin()!.listJoints()
      const activeBones = new Set<string>()
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const jointIndices = primitive.getAttribute('JOINTS_0')!.getArray()!
        const weights = primitive.getAttribute('WEIGHTS_0')!.getArray()!
        for (let vertex = 0; vertex < weights.length / 4; vertex++) {
          let sum = 0
          for (let lane = 0; lane < 4; lane++) {
            const index = vertex * 4 + lane
            const weight = Number(weights[index])
            expect(Number.isFinite(weight), `${id}/${node.getName()} weight ${index}`).toBe(true)
            expect(weight).toBeGreaterThanOrEqual(0)
            expect(weight).toBeLessThanOrEqual(1)
            sum += weight
            if (weight <= 1e-5) continue
            const bone = joints[Number(jointIndices[index])].getName()
            expect(ARM_BONES.has(bone), `${id}/${node.getName()} weight ${index}`).toBe(true)
            activeBones.add(bone)
          }
          expect(sum, `${id}/${node.getName()} vertex ${vertex}`).toBeCloseTo(1, 5)
        }
      }
      const side = node.getName().endsWith('L') ? 'L' : 'R'
      expect([...activeBones].sort()).toEqual(
        ARTICULATED_WINGS.has(id)
          ? [`foreArm${side}`, `hand${side}`, `upperArm${side}`].sort()
          : [`upperArm${side}`],
      )
    }
  })

  it.each(WING_IDS)('%s carries valid mirrored RGBA feather-band weights', (id) => {
    const nodes = docs.get(id)!.getRoot().listNodes().filter((node) => node.getMesh())
    const histograms: number[][] = []
    for (const node of nodes) {
      const histogram = [0, 0, 0, 0]
      const occupied = new Set<number>()
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const color = primitive.getAttribute('COLOR_0')!
        expect(color.getElementSize(), `${id}/${node.getName()} COLOR_0`).toBe(4)
        const element = [0, 0, 0, 0]
        for (let vertex = 0; vertex < color.getCount(); vertex++) {
          color.getElement(vertex, element)
          let sum = 0
          for (let channel = 0; channel < 4; channel++) {
            const value = element[channel]
            expect(Number.isFinite(value)).toBe(true)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(1)
            histogram[channel] += value
            sum += value
            if (value > 0.5) occupied.add(channel)
          }
          // Blender stores COLOR_0 as normalized uint16, so allow one-channel
          // quantization on either side of the ideal unit sum.
          expect(Math.abs(sum - 1), `${id}/${node.getName()} palette vertex ${vertex}`).toBeLessThanOrEqual(4 / 65_535)
        }
      }
      expect(occupied.size, `${id}/${node.getName()} occupied channels`).toBeGreaterThanOrEqual(2)
      histograms.push(histogram)
    }
    expect(histograms).toHaveLength(2)
    for (let channel = 0; channel < 4; channel++) {
      expect(histograms[0][channel]).toBeCloseTo(histograms[1][channel], 4)
    }
  })

  it.each(WING_IDS)('%s has no degenerate 3D or UV triangles', (id) => {
    let minArea3d = Infinity
    let minAreaUv = Infinity
    for (const mesh of docs.get(id)!.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const positions = primitive.getAttribute('POSITION')!.getArray()!
        const uvs = primitive.getAttribute('TEXCOORD_0')!.getArray()!
        const indices = primitive.getIndices()!.getArray()!
        for (let triangle = 0; triangle < indices.length; triangle += 3) {
          const a = Number(indices[triangle])
          const b = Number(indices[triangle + 1])
          const c = Number(indices[triangle + 2])
          const abx = Number(positions[b * 3]) - Number(positions[a * 3])
          const aby = Number(positions[b * 3 + 1]) - Number(positions[a * 3 + 1])
          const abz = Number(positions[b * 3 + 2]) - Number(positions[a * 3 + 2])
          const acx = Number(positions[c * 3]) - Number(positions[a * 3])
          const acy = Number(positions[c * 3 + 1]) - Number(positions[a * 3 + 1])
          const acz = Number(positions[c * 3 + 2]) - Number(positions[a * 3 + 2])
          const crossX = aby * acz - abz * acy
          const crossY = abz * acx - abx * acz
          const crossZ = abx * acy - aby * acx
          minArea3d = Math.min(minArea3d, Math.hypot(crossX, crossY, crossZ) * 0.5)

          const abu = Number(uvs[b * 2]) - Number(uvs[a * 2])
          const abv = Number(uvs[b * 2 + 1]) - Number(uvs[a * 2 + 1])
          const acu = Number(uvs[c * 2]) - Number(uvs[a * 2])
          const acv = Number(uvs[c * 2 + 1]) - Number(uvs[a * 2 + 1])
          minAreaUv = Math.min(minAreaUv, Math.abs(abu * acv - abv * acu) * 0.5)
        }
      }
    }
    expect(minArea3d, `${id} 3D triangle area`).toBeGreaterThan(1e-10)
    expect(minAreaUv, `${id} UV triangle area`).toBeGreaterThan(1e-10)
  })

  it.each(WING_IDS)('%s contains distinct left and right silhouettes', (id) => {
    const doc = docs.get(id)!
    let minX = Infinity
    let maxX = -Infinity
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const positions = primitive.getAttribute('POSITION')!.getArray()!
        for (let index = 0; index < positions.length; index += 3) {
          minX = Math.min(minX, positions[index])
          maxX = Math.max(maxX, positions[index])
        }
      }
    }
    expect(minX).toBeLessThan(-0.08)
    expect(maxX).toBeGreaterThan(0.08)
  })

  it.each(WING_IDS)('%s stays on the lateral flanks instead of the belly front', (id) => {
    const doc = docs.get(id)!
    for (const node of doc.getRoot().listNodes().filter((candidate) => candidate.getMesh())) {
      let xTotal = 0
      let vertexCount = 0
      let maxForward = -Infinity
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const positions = primitive.getAttribute('POSITION')!.getArray()!
        for (let index = 0; index < positions.length; index += 3) {
          xTotal += positions[index]
          maxForward = Math.max(maxForward, positions[index + 2])
          vertexCount++
        }
      }
      expect(Math.abs(xTotal / vertexCount), `${id}/${node.getName()} lateral center`).toBeGreaterThan(0.14)
      expect(maxForward, `${id}/${node.getName()} forward depth`).toBeLessThanOrEqual(0.075)
    }
  })
})
