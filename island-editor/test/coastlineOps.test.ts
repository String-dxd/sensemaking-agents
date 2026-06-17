import { describe, expect, it } from 'vitest'
import { deletePoint, insertPointAfter, movePointTo } from '../src/terrain/coastlineOps'
import type { Vec2 } from '../src/terrain/islandSpec'

const square: Vec2[] = [
  { x: 0, z: 0 },
  { x: 2, z: 0 },
  { x: 2, z: 2 },
  { x: 0, z: 2 },
]

describe('insertPointAfter', () => {
  it('increases length by 1 and inserts the edge midpoint', () => {
    const out = insertPointAfter(square, 0)
    expect(out).toHaveLength(square.length + 1)
    // midpoint of edge 0→1: (0,0)→(2,0) = (1,0)
    expect(out[1]).toEqual({ x: 1, z: 0 })
    // original points preserved around the insertion
    expect(out[0]).toEqual(square[0])
    expect(out[2]).toEqual(square[1])
  })

  it('returns a NEW array (does not mutate input)', () => {
    const out = insertPointAfter(square, 0)
    expect(out).not.toBe(square)
    expect(square).toHaveLength(4)
  })

  it('wraps: index n-1 inserts between last and first', () => {
    const out = insertPointAfter(square, square.length - 1)
    expect(out).toHaveLength(square.length + 1)
    // midpoint of edge 3→0: (0,2)→(0,0) = (0,1), inserted after the last point
    expect(out[out.length - 1]).toEqual({ x: 0, z: 1 })
  })
})

describe('deletePoint', () => {
  it('decreases length by 1 when length > 3', () => {
    const out = deletePoint(square, 1)
    expect(out).toHaveLength(square.length - 1)
    // point at index 1 removed
    expect(out).toEqual([square[0], square[2], square[3]])
  })

  it('is a no-op at exactly 3 points (length stays 3, new ref)', () => {
    const triangle: Vec2[] = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 1, z: 2 },
    ]
    const out = deletePoint(triangle, 1)
    expect(out).toHaveLength(3)
    expect(out).not.toBe(triangle) // returns a copy, not the same reference
    expect(out).toEqual(triangle)
  })
})

describe('movePointTo', () => {
  it('changes only the target and returns a new array reference', () => {
    const out = movePointTo(square, 2, { x: 9, z: 9 })
    expect(out).not.toBe(square)
    expect(out[2]).toEqual({ x: 9, z: 9 })
    // all other points unchanged
    expect(out[0]).toEqual(square[0])
    expect(out[1]).toEqual(square[1])
    expect(out[3]).toEqual(square[3])
    // input not mutated
    expect(square[2]).toEqual({ x: 2, z: 2 })
  })
})
