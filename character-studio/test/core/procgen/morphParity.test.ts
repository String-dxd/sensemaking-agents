// Morph-parity gate (plan 013 step 2). The stated purpose is GARMENT
// COMPATIBILITY: garments bake "body-follow" morph targets, and the procedural
// bodyMorphs must displace the surface the same way or clothes float/clip.
//
// KEY FINDING (see wardrobe.py:336-364 `torso_body_keys`): garments bake their
// body-follow morphs from the RAW recipe — `radial * 0.05·u` (chubby),
// `radial * w·0.075·u + fwd·w·0.02·u` (bellyRound) — the EXACT formulas in
// bodies.py `body_shape_keys`. The shipped body GLB's morphs are weld-Laplacian
// SMOOTHED (~3× smaller: measured chubby ≈0.016 on the torso vs recipe
// 0.05·u≈0.047) — but NO garment follows the GLB body morphs; they follow the
// raw recipe. So garment compatibility requires the procedural body to match the
// RAW RECIPE (which garments bake), NOT the weld-smoothed GLB.
//
// Gate 1 (garment compatibility, hard): the procedural body's torso morph field
//   reproduces the garment body-follow recipe (an independent re-derivation) —
//   body and garment displace identically.
// Gate 2 (recipe geometry, hard): morph DIRECTION matches the authored GLB
//   (the weld preserves direction; only magnitude was smoothed).
// The raw magnitude divergence vs the (weld-smoothed) GLB is reported for
// transparency but is NOT the parity criterion.

import { NodeIO } from '@gltf-transform/core'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { type ProcBodyData, buildProceduralBody } from '../../../src/core/procgen/body'
import { ARCHETYPES_DEF } from '../../../src/core/skeleton/archetypes'
import { BODY_MORPHS, BODY_REGISTRY } from '../../../src/core/skeleton/partRegistry'
import { ARCHETYPES, type Archetype } from '../../../src/core/spec/schema'

const io = new NodeIO()

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-9), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Garment body-follow recipe (wardrobe.py torso_body_keys / bodies.py). */
function recipeTorso(morph: string, x: number, y: number, z: number, cy: number, ry: number, rx: number, u: number): [number, number, number] {
  const rl = Math.hypot(x, z) || 1e-9
  const rux = x / rl
  const ruz = z / rl
  if (morph === 'chubby') return [rux * 0.05 * u, 0, ruz * 0.05 * u]
  if (morph === 'slim') return [rux * -0.038 * u, 0, ruz * -0.038 * u]
  // bellyRound
  const du = x / (rx * 1.1)
  const dv = (y - (cy - ry * 0.18)) / (ry * 0.7)
  const w = (1 - smoothstep(0.4, 1, Math.hypot(du, dv))) * smoothstep(-0.1, 0.5, z / rx)
  return [rux * w * 0.075 * u, 0, ruz * w * 0.075 * u + w * 0.02 * u]
}

const mag = (d: [number, number, number] | number[]): number => Math.hypot(d[0], d[1], d[2])

interface Sample {
  p: [number, number, number]
  mesh: string
  delta: Record<string, [number, number, number]>
}

async function authoredSamples(archetype: Archetype): Promise<Sample[]> {
  const doc = await io.read(fileURLToPath(BODY_REGISTRY[archetype].url))
  const out: Sample[] = []
  for (const mesh of doc.getRoot().listMeshes()) {
    const meshName = mesh.getName()
    const names = (mesh.getExtras() as { targetNames?: string[] } | null)?.targetNames ?? []
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')?.getArray()
      if (!pos) continue
      const targets = prim.listTargets()
      for (let i = 0; i < pos.length / 3; i++) {
        const delta: Record<string, [number, number, number]> = {}
        for (let t = 0; t < targets.length; t++) {
          const d = targets[t].getAttribute('POSITION')?.getArray()
          if (d && names[t]) delta[names[t]] = [d[i * 3], d[i * 3 + 1], d[i * 3 + 2]]
        }
        out.push({ p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], mesh: meshName, delta })
      }
    }
  }
  return out
}

describe.each([...ARCHETYPES])('morph parity — %s', (archetype: Archetype) => {
  let data: ProcBodyData
  let procPos: Float32Array
  let authored: Sample[]
  const procDelta: Record<string, Float32Array> = {}
  const u = ARCHETYPES_DEF[archetype].uniformScale

  beforeAll(async () => {
    data = buildProceduralBody(archetype)
    const geo = (data.scene.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh).geometry
    procPos = geo.getAttribute('position').array as Float32Array
    BODY_MORPHS.forEach((name, i) => {
      procDelta[name] = geo.morphAttributes.position![i].array as Float32Array
    })
    authored = await authoredSamples(archetype)
  })

  it('procedural torso morphs reproduce the garment body-follow recipe (garment compatibility)', () => {
    const [lo, hi] = data.meta.shellRanges.torso
    const { cy, ry, rx } = data.meta.torso
    for (const morph of ['bellyRound', 'chubby', 'slim']) {
      let maxRel = 0
      let checked = 0
      for (let v = lo; v < hi; v++) {
        const x = procPos[v * 3]
        const y = procPos[v * 3 + 1]
        const z = procPos[v * 3 + 2]
        const expected = recipeTorso(morph, x, y, z, cy, ry, rx, u)
        const actual: [number, number, number] = [procDelta[morph][v * 3], procDelta[morph][v * 3 + 1], procDelta[morph][v * 3 + 2]]
        const em = mag(expected)
        if (em < 1e-4) continue // negligible — skip poles / off-belly
        checked++
        maxRel = Math.max(maxRel, mag([actual[0] - expected[0], actual[1] - expected[1], actual[2] - expected[2]]) / em)
      }
      expect(checked, `${archetype}/${morph} checked verts`).toBeGreaterThan(10)
      // body and garment use the identical formula → match to float precision
      expect(maxRel, `${archetype}/${morph} body↔garment field divergence`).toBeLessThan(0.02)
    }
  })

  it('torso morph DIRECTION matches the authored GLB (recipe geometry preserved through the weld)', () => {
    const torso = authored.filter((s) => s.mesh === 'body_torso' || s.mesh === 'body_hips')
    const [lo, hi] = data.meta.shellRanges.torso
    const report: Record<string, { dirDot: number; glbMagDivergence: number; n: number }> = {}
    for (const morph of ['bellyRound', 'chubby', 'slim']) {
      let maxAuth = 0
      for (const s of torso) maxAuth = Math.max(maxAuth, mag(s.delta[morph] ?? [0, 0, 0]))
      const dots: number[] = []
      const rels: number[] = []
      const stride = Math.max(1, Math.floor(torso.length / 200))
      for (let si = 0; si < torso.length; si += stride) {
        const s = torso[si]
        const dA = s.delta[morph]
        if (!dA) continue
        const aMag = mag(dA)
        if (aMag < maxAuth * 0.25 || aMag < 1e-5) continue
        let best = -1
        let bestD = Infinity
        for (let v = lo; v < hi; v++) {
          const d = (s.p[0] - procPos[v * 3]) ** 2 + (s.p[1] - procPos[v * 3 + 1]) ** 2 + (s.p[2] - procPos[v * 3 + 2]) ** 2
          if (d < bestD) {
            bestD = d
            best = v
          }
        }
        if (best < 0 || Math.sqrt(bestD) > 0.06) continue
        const dP: [number, number, number] = [procDelta[morph][best * 3], procDelta[morph][best * 3 + 1], procDelta[morph][best * 3 + 2]]
        const pMag = mag(dP)
        if (pMag > 1e-6) dots.push((dA[0] * dP[0] + dA[1] * dP[1] + dA[2] * dP[2]) / (aMag * pMag))
        rels.push(Math.abs(pMag - aMag) / aMag)
      }
      rels.sort((a, b) => a - b)
      report[morph] = {
        dirDot: dots.length ? dots.reduce((a, b) => a + b, 0) / dots.length : 1,
        glbMagDivergence: rels.length ? rels[Math.floor(rels.length / 2)] : 0,
        n: dots.length,
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[morph-parity ${archetype}] (glbMagDivergence reflects the weld-smoothed GLB, NOT garment follow)`, JSON.stringify(report))
    for (const morph of ['bellyRound', 'chubby', 'slim']) {
      if (report[morph].n < 5) continue
      expect(report[morph].dirDot, `${archetype}/${morph} direction dot vs GLB`).toBeGreaterThan(0.6)
    }
  })

  it('head morphs (headBig/headSmall) match the authored GLB within 25% (magnitude+direction)', () => {
    const hcY = data.meta.headCenter[1]
    const r = data.meta.headRadius
    const head = authored.filter((s) => s.mesh === 'body' && Math.abs(s.p[1] - hcY) < r * 0.9)
    const [lo, hi] = data.meta.shellRanges.head
    for (const morph of ['headBig', 'headSmall']) {
      let maxAuth = 0
      for (const s of head) maxAuth = Math.max(maxAuth, mag(s.delta[morph] ?? [0, 0, 0]))
      const rels: number[] = []
      const dots: number[] = []
      const stride = Math.max(1, Math.floor(head.length / 200))
      for (let si = 0; si < head.length; si += stride) {
        const s = head[si]
        const dA = s.delta[morph]
        if (!dA) continue
        const aMag = mag(dA)
        if (aMag < maxAuth * 0.25 || aMag < 1e-5) continue
        let best = -1
        let bestD = Infinity
        for (let v = lo; v < hi; v++) {
          const d = (s.p[0] - procPos[v * 3]) ** 2 + (s.p[1] - procPos[v * 3 + 1]) ** 2 + (s.p[2] - procPos[v * 3 + 2]) ** 2
          if (d < bestD) {
            bestD = d
            best = v
          }
        }
        if (best < 0 || Math.sqrt(bestD) > 0.06) continue
        const dP: [number, number, number] = [procDelta[morph][best * 3], procDelta[morph][best * 3 + 1], procDelta[morph][best * 3 + 2]]
        const pMag = mag(dP)
        rels.push(Math.abs(pMag - aMag) / aMag)
        if (pMag > 1e-6) dots.push((dA[0] * dP[0] + dA[1] * dP[1] + dA[2] * dP[2]) / (aMag * pMag))
      }
      rels.sort((a, b) => a - b)
      if (rels.length < 5) continue
      expect(rels[Math.floor(rels.length / 2)], `${archetype}/${morph} median divergence`).toBeLessThan(0.25)
      expect(dots.reduce((a, b) => a + b, 0) / dots.length, `${archetype}/${morph} direction`).toBeGreaterThan(0.6)
    }
  })
})
