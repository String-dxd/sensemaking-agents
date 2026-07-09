import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'

// Contract tests against the CHECKED-IN tree assets (public/models/*.glb,
// authored by scripts/build-tree-glbs.mjs). The runtime hook, wind spring, and
// placement all rely on this contract — if an asset regresses (say a re-export
// loses the canopy extras), these fail before the editor ever loads it.

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')

const TREE_KINDS = ['fruitTree', 'pine', 'palm'] as const
const WIND_AMPS: Record<(typeof TREE_KINDS)[number], number> = { fruitTree: 1, pine: 0.35, palm: 0.7 }

/** Parse a .glb from disk (no DOM needed — the assets embed no images). */
function parseGlb(file: string): Promise<THREE.Group> {
  const buf = readFileSync(file)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab, '', (gltf) => resolve(gltf.scene), reject)
  })
}

const scenes = new Map<string, THREE.Group>()

beforeAll(async () => {
  for (const kind of TREE_KINDS) {
    scenes.set(kind, await parseGlb(join(MODELS_DIR, `${kind}.glb`)))
  }
})

describe('tree GLB assets', () => {
  it('every tree parses and has mesh content', () => {
    for (const kind of TREE_KINDS) {
      const scene = scenes.get(kind)
      expect(scene).toBeDefined()
      let meshes = 0
      scene?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++
      })
      expect(meshes).toBeGreaterThan(3)
    }
  })

  it("every tree carries a named 'canopy' group with the per-kind windAmp in extras", () => {
    for (const kind of TREE_KINDS) {
      const canopy = scenes.get(kind)?.getObjectByName('canopy')
      expect(canopy, `${kind} canopy`).toBeDefined()
      expect(canopy?.userData.windAmp, `${kind} windAmp`).toBe(WIND_AMPS[kind])
      expect((canopy as THREE.Group).children.length).toBeGreaterThan(0)
    }
  })

  it('sits on the ground with real height (base ≈ y=0, positive extent up)', () => {
    for (const kind of TREE_KINDS) {
      const scene = scenes.get(kind)
      if (!scene) throw new Error(`missing ${kind}`)
      const box = new THREE.Box3().setFromObject(scene)
      expect(box.min.y, `${kind} grounded`).toBeGreaterThanOrEqual(-0.01)
      expect(box.min.y, `${kind} not floating`).toBeLessThanOrEqual(0.01)
      expect(box.max.y, `${kind} height`).toBeGreaterThan(0.8)
    }
  })

  it('has a bounded horizontal footprint (|x|,|z| < 1.2)', () => {
    for (const kind of TREE_KINDS) {
      const scene = scenes.get(kind)
      if (!scene) throw new Error(`missing ${kind}`)
      const box = new THREE.Box3().setFromObject(scene)
      for (const k of ['x', 'z'] as const) {
        expect(Math.abs(box.min[k]), `${kind} ${k}`).toBeLessThan(1.2)
        expect(Math.abs(box.max[k]), `${kind} ${k}`).toBeLessThan(1.2)
      }
    }
  })

  it('trunks live outside the canopy group (wind must never bend a trunk at the root)', () => {
    for (const kind of TREE_KINDS) {
      const scene = scenes.get(kind)
      const canopy = scene?.getObjectByName('canopy')
      const trunk = scene?.getObjectByName('trunk')
      expect(trunk, `${kind} trunk`).toBeDefined()
      let p = trunk ?? null
      while (p && p !== canopy) p = p.parent
      expect(p, `${kind} trunk outside canopy`).not.toBe(canopy)
    }
  })

  it('fruitTree is the simplified AC stack: 4 vertex-colored crown masses (3 lobes + dome), no fruit', () => {
    const scene = scenes.get('fruitTree')
    const canopy = scene?.getObjectByName('canopy') as THREE.Group
    const masses = canopy.children.filter(
      (c) => c instanceof THREE.Mesh && (c.material as THREE.MeshStandardMaterial).vertexColors,
    )
    expect(masses.length).toBe(4) // the simplified stack — not a pile of puffs
    const fruit: THREE.Object3D[] = []
    canopy.traverse((o) => {
      if (o.name.startsWith('fruit_')) fruit.push(o)
    })
    expect(fruit.length).toBe(0) // fruits removed (user request 2026-07-09)
  })

  it('crown masses ship SMOOTH shading (Pokopia look: faces do not all share one flat normal) plus colors + UVs', () => {
    const canopy = scenes.get('fruitTree')?.getObjectByName('canopy') as THREE.Group
    const mass = canopy.children.find(
      (c) => c instanceof THREE.Mesh && (c.material as THREE.MeshStandardMaterial).vertexColors,
    ) as THREE.Mesh
    const geo = mass.geometry
    expect(geo.attributes.color).toBeDefined() // baked gradient/crevice shading
    expect(geo.attributes.uv).toBeDefined() // the simple foliage map needs UVs
    // Smooth normals: at least one face's vertices carry differing normals
    // (flat-shaded geometry would have all three identical on every face).
    const nrm = geo.attributes.normal as THREE.BufferAttribute
    let smooth = false
    for (let f = 0; f < 20 && !smooth; f++) {
      const i = f * 3
      if (Math.abs(nrm.getX(i) - nrm.getX(i + 1)) > 1e-4 || Math.abs(nrm.getY(i) - nrm.getY(i + 2)) > 1e-4)
        smooth = true
    }
    expect(smooth).toBe(true)
  })

  it("materials keep their authoring names ('foliage'/'bark'/'fruit' …) so the runtime can attach painted maps", () => {
    for (const kind of TREE_KINDS) {
      const names = new Set<string>()
      scenes.get(kind)?.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return
        const mat = (o as THREE.Mesh).material
        for (const m of Array.isArray(mat) ? mat : [mat]) names.add(m.name)
      })
      if (kind === 'fruitTree') {
        expect(names.has('bark')).toBe(true)
        expect(names.has('foliage')).toBe(true)
      }
      if (kind === 'pine') {
        expect(names.has('bark-cedar')).toBe(true)
        expect(names.has('foliage-cedar')).toBe(true)
      }
      if (kind === 'palm') {
        expect(names.has('bark-palm')).toBe(true)
        expect(names.has('frond')).toBe(true)
      }
    }
  })
})
