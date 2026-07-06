import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/models/rand'
import { addObject, makePlacedObject, removeObject } from '../src/terrain/objectOps'
import type { PlacedObject } from '../src/terrain/terrainGrid'

function obj(id: string): PlacedObject {
  return { id, kind: 'rock', c: 0, r: 0, yaw: 0, scale: 1 }
}

describe('objectOps — addObject', () => {
  it('appends immutably (input unchanged, new array returned)', () => {
    const a = obj('a')
    const before: PlacedObject[] = [a]
    const b = obj('b')
    const after = addObject(before, b)
    expect(after).toEqual([a, b])
    expect(before).toEqual([a]) // input untouched
    expect(after).not.toBe(before)
  })
})

describe('objectOps — removeObject', () => {
  it('removes by id immutably (input unchanged)', () => {
    const before = [obj('a'), obj('b')]
    const after = removeObject(before, 'a')
    expect(after.map((o) => o.id)).toEqual(['b'])
    expect(before.map((o) => o.id)).toEqual(['a', 'b']) // input untouched
    expect(after).not.toBe(before)
  })

  it('is a no-op for an absent id', () => {
    const before = [obj('a')]
    const after = removeObject(before, 'nope')
    expect(after).toEqual(before)
  })
})

describe('objectOps — makePlacedObject', () => {
  it('carries kind/c/r and yields in-range yaw + scale', () => {
    const rand = mulberry32(1234)
    for (let i = 0; i < 200; i++) {
      const o = makePlacedObject('pine', 3, 7, rand)
      expect(o.kind).toBe('pine')
      expect(o.c).toBe(3)
      expect(o.r).toBe(7)
      expect(o.yaw).toBeGreaterThanOrEqual(0)
      expect(o.yaw).toBeLessThan(Math.PI * 2)
      expect(o.scale).toBeGreaterThanOrEqual(0.85)
      expect(o.scale).toBeLessThan(1.15)
      expect(typeof o.id).toBe('string')
      expect(o.id.startsWith('pine-')).toBe(true)
    }
  })

  it('produces unique ids across many placements', () => {
    const rand = mulberry32(42)
    const ids = new Set<string>()
    for (let i = 0; i < 500; i++) ids.add(makePlacedObject('bush', 0, 0, rand).id)
    expect(ids.size).toBe(500)
  })

  it('is deterministic given the same rand sequence', () => {
    const a = makePlacedObject('palm', 1, 2, mulberry32(7))
    const b = makePlacedObject('palm', 1, 2, mulberry32(7))
    expect(a).toEqual(b)
  })
})
