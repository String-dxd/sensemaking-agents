import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildObjectModel } from '../src/models/buildObjectModel'
import { OBJECT_KINDS } from '../src/terrain/terrainGrid'

describe('buildObjectModel', () => {
  it('returns a named THREE.Group with children for every kind', () => {
    for (const kind of OBJECT_KINDS) {
      const group = buildObjectModel(kind, 7)
      expect(group).toBeInstanceOf(THREE.Group)
      expect(group.name).toBe(kind)
      expect(group.children.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic: the same seed reproduces child count + first-child position', () => {
    for (const kind of OBJECT_KINDS) {
      const a = buildObjectModel(kind, 7)
      const b = buildObjectModel(kind, 7)
      expect(a.children.length).toBe(b.children.length)
      expect(a.children[0].position.x).toBeCloseTo(b.children[0].position.x, 9)
      expect(a.children[0].position.y).toBeCloseTo(b.children[0].position.y, 9)
      expect(a.children[0].position.z).toBeCloseTo(b.children[0].position.z, 9)
    }
  })

  it('varies with the seed (at least one kind differs in count or first-child position)', () => {
    const differs = OBJECT_KINDS.some((kind) => {
      const a = buildObjectModel(kind, 7)
      const b = buildObjectModel(kind, 999)
      if (a.children.length !== b.children.length) return true
      const pa = a.children[0].position
      const pb = b.children[0].position
      return pa.x !== pb.x || pa.y !== pb.y || pa.z !== pb.z
    })
    expect(differs).toBe(true)
  })

  it('sits on the ground with real height (base ≈ y=0, positive extent up)', () => {
    for (const kind of OBJECT_KINDS) {
      const box = new THREE.Box3().setFromObject(buildObjectModel(kind, 7))
      expect(box.min.y).toBeGreaterThanOrEqual(-0.05)
      expect(box.max.y).toBeGreaterThan(0.1)
    }
  })

  it('has a bounded horizontal footprint (≈ ±0.5–1 unit)', () => {
    for (const kind of OBJECT_KINDS) {
      const box = new THREE.Box3().setFromObject(buildObjectModel(kind, 7))
      expect(Math.abs(box.min.x)).toBeLessThan(1.2)
      expect(Math.abs(box.max.x)).toBeLessThan(1.2)
      expect(Math.abs(box.min.z)).toBeLessThan(1.2)
      expect(Math.abs(box.max.z)).toBeLessThan(1.2)
    }
  })

  it('builds every material without throwing; each map is null (node) or a Texture', () => {
    // In vitest/node there is no DOM, so the texture guard resolves to a null
    // map (three warns + leaves map = null); in the browser it is a Texture.
    // Either way the guard must not throw and every material must be well-formed.
    for (const kind of OBJECT_KINDS) {
      const group = buildObjectModel(kind, 7)
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          expect(m).toBeInstanceOf(THREE.MeshStandardMaterial)
          const map = (m as THREE.MeshStandardMaterial).map
          expect(map === null || map instanceof THREE.Texture).toBe(true)
        }
      })
    }
  })

  it('is fully deterministic: every descendant position is identical across two builds (seed 7)', () => {
    // Stronger than the first-child check: serializes the whole transform tree,
    // so any non-seeded entropy (e.g. Math.random sneaking into `lumpy`) fails.
    const positions = (root: THREE.Object3D): number[][] => {
      const out: number[][] = []
      root.traverse((o) => out.push([o.position.x, o.position.y, o.position.z]))
      return out
    }
    for (const kind of OBJECT_KINDS) {
      const a = positions(buildObjectModel(kind, 7))
      const b = positions(buildObjectModel(kind, 7))
      expect(a).toEqual(b)
    }
  })

  it("fruitTree exposes a named 'canopy' group (the render-layer wind hook finds it)", () => {
    const canopy = buildObjectModel('fruitTree', 7).getObjectByName('canopy')
    expect(canopy).toBeInstanceOf(THREE.Group)
    expect((canopy as THREE.Group).children.length).toBeGreaterThan(0)
  })

  it("every tree kind carries a 'canopy' group with a per-kind windAmp (fruitTree 1, palm 0.7, pine 0.35)", () => {
    const expected: Record<string, number> = { fruitTree: 1, palm: 0.7, pine: 0.35 }
    for (const [kind, amp] of Object.entries(expected)) {
      const canopy = buildObjectModel(kind as 'fruitTree' | 'palm' | 'pine', 7).getObjectByName('canopy')
      expect(canopy).toBeInstanceOf(THREE.Group)
      expect((canopy as THREE.Group).children.length).toBeGreaterThan(0)
      expect((canopy as THREE.Group).userData.windAmp).toBe(amp)
    }
  })

  it('bush and rock have no canopy group (the wind hook must no-op on them)', () => {
    for (const kind of ['bush', 'rock'] as const) {
      expect(buildObjectModel(kind, 7).getObjectByName('canopy')).toBeUndefined()
    }
  })

  it('trunks live outside the canopy group (wind must never bend a trunk at the root)', () => {
    for (const kind of ['fruitTree', 'pine', 'palm'] as const) {
      const model = buildObjectModel(kind, 7)
      const canopy = model.getObjectByName('canopy') as THREE.Group
      // At least one cylinder (trunk segment) sits outside the canopy subtree.
      let trunkOutside = false
      model.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !(obj.geometry instanceof THREE.CylinderGeometry)) return
        let p: THREE.Object3D | null = obj
        while (p && p !== canopy) p = p.parent
        if (p !== canopy) trunkOutside = true
      })
      expect(trunkOutside).toBe(true)
      // And no cylinder inside the canopy is a tall trunk-like segment (palm's
      // canopy legitimately holds no cylinders at all today).
      canopy.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.CylinderGeometry) {
          expect((obj.geometry as THREE.CylinderGeometry).parameters.height).toBeLessThan(0.2)
        }
      })
    }
  })
})
