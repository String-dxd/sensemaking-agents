// Pose-integrity test (plan 003 step 6): rotate upperArmL 60° about Z on the
// REAL welded biped-round body GLB and verify the shoulder junction deforms
// continuously — no edge in the blended junction region stretches past 2× its
// rest length (the "tearing" signature of the old weight-island shells, where
// arm verts moved rigidly away from torso verts).
//
// Route taken: manual linear-blend skinning over NodeIO-parsed accessors
// (joints are translation-only at rest, so posed joint globals are
// T_pivot · R · T_pivot⁻¹ · G_rest for the rotated subtree). The
// "swallowed geometry" half of the plan's check (torso SDF penetration) is
// covered visually by the posed-arm preview render in gen_assets.py instead
// of duplicating the torso SDF constants here.

import { fileURLToPath } from 'node:url'
import { NodeIO, type Node } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { BODY_REGISTRY } from '../../../src/core/skeleton/partRegistry'

type Mat4 = Float32Array | number[]

/** column-major 4x4 multiply: out = a · b */
function mul(a: Mat4, b: Mat4): number[] {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += (a[k * 4 + r] as number) * (b[c * 4 + k] as number)
      out[c * 4 + r] = s
    }
  }
  return out
}

function transformPoint(m: Mat4, p: [number, number, number]): [number, number, number] {
  return [
    (m[0] as number) * p[0] + (m[4] as number) * p[1] + (m[8] as number) * p[2] + (m[12] as number),
    (m[1] as number) * p[0] + (m[5] as number) * p[1] + (m[9] as number) * p[2] + (m[13] as number),
    (m[2] as number) * p[0] + (m[6] as number) * p[1] + (m[10] as number) * p[2] + (m[14] as number),
  ]
}

function rotationAboutZAround(pivot: [number, number, number], radians: number): number[] {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  // T(pivot) · Rz · T(-pivot), column-major
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, pivot[0] - c * pivot[0] + s * pivot[1], pivot[1] - s * pivot[0] - c * pivot[1], 0, 1]
}

describe('welded body pose integrity (biped-round)', () => {
  const io = new NodeIO()
  let skinnedRest: Map<string, [number, number, number]>
  let skinnedPosed: Map<string, [number, number, number]>
  let junctionKeys: Set<string>
  let edges: [string, string][]

  beforeAll(async () => {
    const doc = await io.read(fileURLToPath(BODY_REGISTRY['biped-round'].url))
    const root = doc.getRoot()
    const skin = root.listSkins()[0]
    const joints = skin.listJoints()
    const jointNames = joints.map((j) => j.getName())
    const ibm = skin.getInverseBindMatrices()?.getArray()
    if (!ibm) throw new Error('missing inverse bind matrices')

    // rotated subtree: upperArmL and all descendants
    const armRoot = joints.find((j) => j.getName() === 'upperArmL')
    if (!armRoot) throw new Error('upperArmL joint missing')
    const subtree = new Set<Node>()
    const walk = (n: Node) => {
      subtree.add(n)
      for (const ch of n.listChildren()) walk(ch)
    }
    walk(armRoot)

    const pivotM = armRoot.getWorldMatrix()
    const pivot: [number, number, number] = [pivotM[12], pivotM[13], pivotM[14]]
    const pose = rotationAboutZAround(pivot, (60 * Math.PI) / 180)

    // per-joint skinning matrices: G(·IBM) at rest and posed
    const restSkin: number[][] = []
    const posedSkin: number[][] = []
    for (let j = 0; j < joints.length; j++) {
      const g = joints[j].getWorldMatrix()
      const bind = Array.from(ibm.slice(j * 16, j * 16 + 16)) as number[]
      restSkin.push(mul(g, bind))
      posedSkin.push(subtree.has(joints[j]) ? mul(pose, mul(g, bind)) : mul(g, bind))
    }

    const armBones = new Set(['upperArmL', 'foreArmL'].map((n) => jointNames.indexOf(n)))
    const torsoBones = new Set(['chest', 'spine', 'hips'].map((n) => jointNames.indexOf(n)))

    skinnedRest = new Map()
    skinnedPosed = new Map()
    junctionKeys = new Set()
    edges = []
    const posKey = (p: ArrayLike<number>, i: number) =>
      `${Math.round((p[i * 3] as number) * 1e5)},${Math.round((p[i * 3 + 1] as number) * 1e5)},${Math.round((p[i * 3 + 2] as number) * 1e5)}`

    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')?.getArray()
        const jix = prim.getAttribute('JOINTS_0')?.getArray()
        const wts = prim.getAttribute('WEIGHTS_0')?.getArray()
        const idx = prim.getIndices()?.getArray()
        if (!pos || !jix || !wts || !idx) throw new Error('missing skinning attributes')
        const nv = pos.length / 3
        for (let v = 0; v < nv; v++) {
          const p: [number, number, number] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]
          const rest: [number, number, number] = [0, 0, 0]
          const posed: [number, number, number] = [0, 0, 0]
          let armW = 0
          let torsoW = 0
          for (let s = 0; s < 4; s++) {
            const j = jix[v * 4 + s]
            const w = wts[v * 4 + s]
            if (w === 0) continue
            if (armBones.has(j)) armW += w
            if (torsoBones.has(j)) torsoW += w
            const tr = transformPoint(restSkin[j], p)
            const tp = transformPoint(posedSkin[j], p)
            for (let ax = 0; ax < 3; ax++) {
              rest[ax] += w * tr[ax]
              posed[ax] += w * tp[ax]
            }
          }
          const key = posKey(pos, v)
          skinnedRest.set(key, rest)
          skinnedPosed.set(key, posed)
          if (armW > 0.05 && torsoW > 0.05) junctionKeys.add(key)
        }
        for (let t = 0; t < idx.length; t += 3) {
          edges.push([posKey(pos, idx[t]), posKey(pos, idx[t + 1])])
          edges.push([posKey(pos, idx[t + 1]), posKey(pos, idx[t + 2])])
          edges.push([posKey(pos, idx[t + 2]), posKey(pos, idx[t])])
        }
      }
    }
  })

  it('rotating upperArmL 60° actually moves junction vertices', () => {
    expect(junctionKeys.size).toBeGreaterThan(50)
    let moved = 0
    for (const key of junctionKeys) {
      const r = skinnedRest.get(key)
      const p = skinnedPosed.get(key)
      if (!r || !p) continue
      if (Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) > 1e-4) moved++
    }
    expect(moved).toBeGreaterThan(20) // the pose reaches the junction band
  })

  it('no junction edge stretches past 2x its rest length (no tearing)', () => {
    const dist = (a: [number, number, number], b: [number, number, number]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    let checked = 0
    let worst = 0
    for (const [ka, kb] of edges) {
      if (!junctionKeys.has(ka) && !junctionKeys.has(kb)) continue
      const ra = skinnedRest.get(ka)
      const rb = skinnedRest.get(kb)
      const pa = skinnedPosed.get(ka)
      const pb = skinnedPosed.get(kb)
      if (!ra || !rb || !pa || !pb) continue
      const rest = dist(ra, rb)
      if (rest < 1e-6) continue
      const ratio = dist(pa, pb) / rest
      if (ratio > worst) worst = ratio
      checked++
    }
    expect(checked).toBeGreaterThan(100)
    expect(worst, `worst junction edge stretch ratio ${worst.toFixed(3)}`).toBeLessThan(2)
  })
})
