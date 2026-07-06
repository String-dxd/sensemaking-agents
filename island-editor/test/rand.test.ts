import { describe, expect, it } from 'vitest'
import { hashString, mulberry32 } from '../src/models/rand'

describe('mulberry32', () => {
  it('is deterministic: the same seed yields the same sequence', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('yields values in [0, 1)', () => {
    const rand = mulberry32(123)
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('diverges for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })
})

describe('hashString', () => {
  it('is stable across calls for the same input', () => {
    expect(hashString('tree-01')).toBe(hashString('tree-01'))
  })

  it('differs for different strings', () => {
    expect(hashString('tree-01')).not.toBe(hashString('tree-02'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('returns an unsigned 32-bit integer', () => {
    const h = hashString('some-object-id')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})
