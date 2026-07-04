import { describe, expect, it } from 'vitest'
import {
  type SparseRelief,
  decodeRelief,
  encodeRelief,
  isSparseRelief,
} from '../src/editor/reliefCodec'
import type { ReliefGrid } from '../src/terrain/islandSpec'

function denseGrid(resolution: number, fill: (i: number) => number): ReliefGrid {
  const data = new Array(resolution * resolution)
  for (let i = 0; i < data.length; i++) data[i] = fill(i)
  return { resolution, data }
}

describe('reliefCodec', () => {
  describe('encodeRelief — branch selection', () => {
    it('chooses sparse when few nonzeros', () => {
      // 8×8 = 64 cells; two nonzeros → 2*3 = 6 < 64 → sparse.
      const grid = denseGrid(8, (i) => (i === 5 ? 0.3 : i === 40 ? -0.7 : 0))
      const result = encodeRelief(grid)
      expect(isSparseRelief(result)).toBe(true)
      const sparse = result as SparseRelief
      expect(sparse.encoding).toBe('sparse')
      expect(sparse.resolution).toBe(8)
      expect(sparse.entries).toHaveLength(2)
      expect(sparse.entries).toContainEqual({ i: 5, h: 0.3 })
      expect(sparse.entries).toContainEqual({ i: 40, h: -0.7 })
    })

    it('chooses dense when more than a third is filled', () => {
      // 6×6 = 36 cells; 30 nonzeros → 30*3 = 90 >= 36 → dense.
      const grid = denseGrid(6, (i) => (i < 30 ? 1 : 0))
      const result = encodeRelief(grid)
      expect(isSparseRelief(result)).toBe(false)
      expect('data' in result).toBe(true)
      expect((result as ReliefGrid).data).toEqual(grid.data)
    })

    it('chooses dense for a fully-dense grid (no zeros)', () => {
      const grid = denseGrid(4, (i) => i + 1)
      const result = encodeRelief(grid)
      expect(isSparseRelief(result)).toBe(false)
      expect('data' in result).toBe(true)
    })
  })

  describe('round-trip identity', () => {
    it('mostly-zero grid → decode(encode(g)) deep-equals original data', () => {
      const grid = denseGrid(16, (i) => (i % 50 === 0 ? 0.42 : 0))
      const restored = decodeRelief(encodeRelief(grid))
      expect(restored.resolution).toBe(grid.resolution)
      expect(restored.data).toEqual(grid.data)
    })

    it('fully-dense grid → encode returns dense branch, decode restores it', () => {
      const grid = denseGrid(5, (i) => (i % 2 === 0 ? 0.1 : -0.2))
      const encoded = encodeRelief(grid)
      expect('data' in encoded).toBe(true)
      const restored = decodeRelief(encoded)
      expect(restored.data).toEqual(grid.data)
    })

    it('preserves float identity exactly (h = 0.37 survives round-trip)', () => {
      const grid = denseGrid(8, (i) => (i === 12 ? 0.37 : 0))
      const restored = decodeRelief(encodeRelief(grid))
      expect(restored.data[12]).toBe(0.37)
    })
  })

  describe('decodeRelief — robustness', () => {
    it('clamps/ignores out-of-range indices without throwing', () => {
      const sparse: SparseRelief = {
        resolution: 4,
        encoding: 'sparse',
        entries: [
          { i: -1, h: 9 },
          { i: 0, h: 0.5 },
          { i: 15, h: 0.6 },
          { i: 16, h: 9 },
          { i: 9999, h: 9 },
        ],
      }
      let restored: ReliefGrid | undefined
      expect(() => {
        restored = decodeRelief(sparse)
      }).not.toThrow()
      expect(restored?.data).toHaveLength(16)
      expect(restored?.data[0]).toBe(0.5)
      expect(restored?.data[15]).toBe(0.6)
      // out-of-range writes were dropped; all other cells are zero
      expect(restored?.data.filter((v) => v !== 0)).toEqual([0.5, 0.6])
    })

    it('clones a dense serialized grid through (new array, equal contents)', () => {
      const grid = denseGrid(4, (i) => i)
      const restored = decodeRelief(grid)
      expect(restored.data).toEqual(grid.data)
      expect(restored.data).not.toBe(grid.data)
    })
  })

  describe('immutability — never mutates input', () => {
    it('encodeRelief does not mutate the source grid', () => {
      const grid = denseGrid(8, (i) => (i === 3 ? 0.9 : 0))
      const snapshot = grid.data.slice()
      const result = encodeRelief(grid)
      expect(grid.data).toEqual(snapshot)
      // dense branch must return a fresh array, not the same reference
      const denseGridFull = denseGrid(4, (i) => i + 1)
      const denseResult = encodeRelief(denseGridFull) as ReliefGrid
      expect(denseResult.data).not.toBe(denseGridFull.data)
      // touch result to keep it referenced
      expect(result).toBeDefined()
    })

    it('decodeRelief does not mutate the source sparse entries', () => {
      const sparse: SparseRelief = {
        resolution: 4,
        encoding: 'sparse',
        entries: [{ i: 2, h: 0.5 }],
      }
      decodeRelief(sparse)
      expect(sparse.entries).toEqual([{ i: 2, h: 0.5 }])
    })
  })
})
