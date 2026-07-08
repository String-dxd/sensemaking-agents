// Procedural body builder tests (plan 013 step 2). Vanilla vitest + real three,
// modelled after test/core/skeleton/assemble.test.ts.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { type BirdBodyShape, buildProceduralBody } from '../../../src/core/procgen/body'
import { buildBodyScene } from '../../../src/core/procgen/buildBody'
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

// --- plan 017: bird body v2 (AC anatomy) --------------------------------------

function bodyPositions(scene: THREE.Object3D): Float32Array {
  return skinnedMeshes(scene)[0].geometry.getAttribute('position').array as Float32Array
}

describe('plan 017: mammal freeze', () => {
  // Snapshots computed on main @ 2532e1c (pre-017) — the bird shape seam must
  // leave both mammal lanes byte-identical.
  const FREEZE: Record<'biped-round' | 'biped-slim', { vertexCount: number; first12: number[] }> = {
    'biped-round': {
      vertexCount: 2052,
      first12: [0, 0.17277540266513824, 0, 0, 0.17549742758274078, 0.02695726975798607, 0.006573877763003111, 0.17549742758274078, 0.02643929235637188, 0.012895124964416027, 0.17549742758274078, 0.024905268102884293],
    },
    'biped-slim': {
      vertexCount: 2052,
      first12: [0, 0.18802250921726227, 0, 0, 0.19097262620925903, 0.02776050940155983, 0.006189493462443352, 0.19097262620925903, 0.027227098122239113, 0.012141128070652485, 0.19097262620925903, 0.025647366419434547],
    },
  }
  it.each(['biped-round', 'biped-slim'] as const)('%s geometry is byte-identical to main', (archetype) => {
    const pos = bodyPositions(buildProceduralBody(archetype).scene)
    expect(pos.length / 3).toBe(FREEZE[archetype].vertexCount)
    expect(Float32Array.from(pos.slice(0, 12))).toEqual(Float32Array.from(FREEZE[archetype].first12))
  })
})

describe('plan 017: bird shape variants', () => {
  const variants: Array<[string, Partial<BirdBodyShape>]> = [
    ['default', {}],
    ['flipper', { wingScallop: 0, wingLength: 0.75 }],
    ['webbed', { toeCut: 0.1 }],
    ['tall', { tarsusLength: 1.3, headSize: 1.1 }],
  ]
  it.each(variants)('%s: manifold gate holds and fits the triangle budget', (_name, shape) => {
    const data = buildProceduralBody('bird', shape)
    expect(data.manifold.boundaryEdges, 'boundary edges').toBe(0)
    expect(data.manifold.overSharedEdges, 'over-shared edges').toBe(0)
    expect(data.manifold.components, 'connected components').toBe(1)
    expect(data.triangleCount).toBeLessThanOrEqual(18000)
  })

  it('is deterministic for a non-default shape', () => {
    const a = buildProceduralBody('bird', { wingLength: 1.2 })
    const b = buildProceduralBody('bird', { wingLength: 1.2 })
    expect(Float32Array.from(bodyPositions(a.scene))).toEqual(Float32Array.from(bodyPositions(b.scene)))
  })
})

describe('plan 017: bird accent painting', () => {
  const data = buildProceduralBody('bird')

  it('feet are fully accent-painted (beak/feet color)', () => {
    for (const piece of ['footL', 'footR'] as const) {
      const [s, e] = data.meta.shellRanges[piece]
      let hit = false
      for (let i = s; i < e && !hit; i++) if (data.channels[i * 4 + 3] === 1) hit = true
      expect(hit, `${piece} has a fully-accented vertex`).toBe(true)
    }
  })

  it('bare tarsus takes accent; feathered thigh stays body-colored', () => {
    const [s] = data.meta.shellRanges.legL
    const params = data.meta.limbParams.legL
    let tarsusChecked = 0
    let thighChecked = 0
    for (let li = 0; li < params.length; li++) {
      const accent = data.channels[(s + li) * 4 + 3]
      if (params[li] > 0.6) {
        expect(accent, `tarsus vertex v01=${params[li]}`).toBeGreaterThan(0.5)
        tarsusChecked++
      } else if (params[li] < 0.3) {
        expect(accent, `thigh vertex v01=${params[li]}`).toBeLessThan(0.1)
        thighChecked++
      }
    }
    expect(tarsusChecked).toBeGreaterThan(0)
    expect(thighChecked).toBeGreaterThan(0)
  })
})

describe('plan 017: species shape seam', () => {
  it('duckling and owl produce different geometry', () => {
    const duck = bodyPositions(buildBodyScene('bird', 'duckling'))
    const owl = bodyPositions(buildBodyScene('bird', 'owl'))
    expect(duck.length).toBe(owl.length) // same topology…
    let differs = false
    for (let i = 0; i < duck.length && !differs; i++) if (duck[i] !== owl[i]) differs = true
    expect(differs, 'at least one position differs').toBe(true) // …different shape
  })

  it('no species falls back to the default bird build', () => {
    const plain = bodyPositions(buildProceduralBody('bird').scene)
    const seam = bodyPositions(buildBodyScene('bird', undefined))
    expect(Float32Array.from(seam)).toEqual(Float32Array.from(plain))
  })
})
