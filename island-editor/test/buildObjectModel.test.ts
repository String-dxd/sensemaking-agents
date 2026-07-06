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
})
