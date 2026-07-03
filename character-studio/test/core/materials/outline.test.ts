import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  addOutline,
  computeSmoothedNormals,
  getOutline,
  OUTLINE_NAME,
  removeOutline,
  SMOOTHED_NORMAL_ATTRIBUTE,
} from '../../../src/core/materials/outline'

describe('computeSmoothedNormals', () => {
  it('produces one unit normal per vertex (same vertex count)', () => {
    const geometry = new THREE.SphereGeometry(0.28, 24, 16)
    const attr = computeSmoothedNormals(geometry)
    expect(attr.itemSize).toBe(3)
    expect(attr.count).toBe(geometry.getAttribute('position').count)
    const v = new THREE.Vector3()
    for (let i = 0; i < attr.count; i++) {
      v.fromBufferAttribute(attr, i)
      expect(v.length()).toBeCloseTo(1, 5)
    }
  })

  it('gives position-duplicate seam vertices identical smoothed normals', () => {
    // SphereGeometry duplicates vertices along the UV seam (u=0 vs u=1):
    // same position, different UV. Smoothed normals must merge them or the
    // hull tears at the seam.
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const attr = computeSmoothedNormals(geometry)

    const byKey = new Map<string, number>()
    let duplicatePairs = 0
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
      const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
      const other = byKey.get(key)
      if (other !== undefined) {
        duplicatePairs++
        a.fromBufferAttribute(attr, i)
        b.fromBufferAttribute(attr, other)
        expect(a.distanceTo(b)).toBeLessThan(1e-6)
      } else {
        byKey.set(key, i)
      }
    }
    expect(duplicatePairs).toBeGreaterThan(0) // the seam actually exists
  })

  it('smoothed normals on a sphere point radially outward', () => {
    const geometry = new THREE.SphereGeometry(1, 12, 8)
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const attr = computeSmoothedNormals(geometry)
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).normalize()
      n.fromBufferAttribute(attr, i)
      expect(p.dot(n)).toBeGreaterThan(0.95)
    }
  })
})

describe('addOutline / removeOutline', () => {
  function makeMesh() {
    return new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 16), new THREE.MeshToonMaterial())
  }

  it('attaches a BackSide shell with the smoothed-normal attribute and same vertex count', () => {
    const mesh = makeMesh()
    const shell = addOutline(mesh)
    expect(shell.name).toBe(OUTLINE_NAME)
    expect(shell.parent).toBe(mesh)
    expect((shell.material as THREE.ShaderMaterial).side).toBe(THREE.BackSide)
    expect(shell.geometry.getAttribute(SMOOTHED_NORMAL_ATTRIBUTE)).toBeDefined()
    expect(shell.geometry.getAttribute('position').count).toBe(mesh.geometry.getAttribute('position').count)
    expect(shell.castShadow).toBe(false)
  })

  it('renders before the body (renderOrder) and honors thickness/color options', () => {
    const mesh = makeMesh()
    const shell = addOutline(mesh, { thickness: 0.005, color: '#000000' })
    expect(shell.renderOrder).toBeLessThan(mesh.renderOrder)
    const material = shell.material as THREE.ShaderMaterial
    expect(material.uniforms.uThickness.value).toBe(0.005)
    expect(material.uniforms.uColor.value.getHex()).toBe(0x000000)
  })

  it('is idempotent and removable', () => {
    const mesh = makeMesh()
    addOutline(mesh)
    addOutline(mesh)
    expect(mesh.children.filter((c) => c.name === OUTLINE_NAME)).toHaveLength(1)
    expect(getOutline(mesh)).not.toBeNull()
    removeOutline(mesh)
    expect(getOutline(mesh)).toBeNull()
    removeOutline(mesh) // no-op, no throw
  })
})
