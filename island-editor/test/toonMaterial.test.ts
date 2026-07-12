import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyToonMaterials, objectGradientMap } from '../src/models/toonMaterial'

// Node-only contract for the plan-019 toon conversion: applyToonMaterials
// mutates drei's useGLTF CACHED scenes in place, so the shared ramp and the
// idempotence guarantee are what keep clones sharing materials (and the
// never-dispose-shared rule honest) — see src/models/toonMaterial.ts.

describe('objectGradientMap', () => {
  it('returns the same shared 3×1 NearestFilter ramp on repeat calls', () => {
    const a = objectGradientMap()
    const b = objectGradientMap()
    expect(b).toBe(a) // one ramp for the whole scene — the look's single tuning knob
    expect(a.image.width).toBe(3)
    expect(a.image.height).toBe(1)
    expect(a.minFilter).toBe(THREE.NearestFilter)
    expect(a.magFilter).toBe(THREE.NearestFilter)
  })
})

describe('applyToonMaterials', () => {
  it('converts a MeshStandardMaterial mesh to MeshToonMaterial, preserving map + vertexColors', () => {
    const map = new THREE.Texture()
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ map, vertexColors: true }),
    )
    group.add(mesh)

    applyToonMaterials(group)

    const mat = mesh.material as unknown as THREE.MeshToonMaterial
    expect(mat).toBeInstanceOf(THREE.MeshToonMaterial)
    expect(mat.map).toBe(map) // same instance — the GLB's base map survives
    expect(mat.vertexColors).toBe(true)
    expect(mat.gradientMap).toBe(objectGradientMap())
  })

  it('is idempotent: a second pass leaves the same material instance', () => {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())
    group.add(mesh)

    applyToonMaterials(group)
    const first = mesh.material
    applyToonMaterials(group)

    expect(mesh.material).toBe(first) // no double-conversion on the shared cache
  })

  it('converts every entry of a material array', () => {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    ])
    group.add(mesh)

    applyToonMaterials(group)

    const mats = mesh.material as unknown as THREE.MeshToonMaterial[]
    expect(mats).toHaveLength(2)
    for (const m of mats) expect(m).toBeInstanceOf(THREE.MeshToonMaterial)
    // Transparency and side survive the conversion (PlaceGhost relies on this
    // baseline before it applies its own ghosting on clones).
    expect(mats[1].transparent).toBe(true)
    expect(mats[1].opacity).toBe(0.5)
    expect(mats[1].side).toBe(THREE.DoubleSide)
  })
})
