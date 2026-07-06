import { describe, expect, it } from 'vitest'
import { applyOps } from '../src/agent/applyOps'
import type { Op } from '../src/agent/ops'
import { validateSpecObject } from '../src/editor/specIO'
import { seedIsland } from '../src/terrain/seed'
import { cellIndex, createOceanGrid, DEFAULT_TIER_HEIGHTS, type IslandSpec, SURFACE_PATH } from '../src/terrain/terrainGrid'

// A tiny all-ocean v3 spec for isolated op cases.
function oceanSpec(): IslandSpec {
  return { version: 4, worldSize: 24, seaLevel: 0, tierHeights: DEFAULT_TIER_HEIGHTS.slice(), grid: createOceanGrid(), objects: [] }
}

describe('applyOps (v3 grid vocabulary)', () => {
  describe('fillRect', () => {
    it('sets the rect tier and nothing else, leaving the input spec untouched', () => {
      const spec = oceanSpec()
      const { spec: next, errors } = applyOps(spec, [{ op: 'fillRect', c0: 30, r0: 30, c1: 33, r1: 33, tier: 4 }])
      expect(errors).toHaveLength(0)
      // 4×4 = 16 cells set to tier 4
      expect(next.grid.tiers.filter((t) => t === 4)).toHaveLength(16)
      expect(next.grid.tiers[cellIndex(next.grid, 30, 30)]).toBe(4)
      expect(next.grid.tiers[cellIndex(next.grid, 33, 33)]).toBe(4)
      expect(next.grid.tiers[cellIndex(next.grid, 34, 33)]).toBe(0) // just outside
      // immutability
      expect(next).not.toBe(spec)
      expect(next.grid).not.toBe(spec.grid)
      expect(spec.grid.tiers.every((t) => t === 0)).toBe(true)
    })
  })

  describe('adjustRect', () => {
    it('raises by delta and clamps at MAX_TIER', () => {
      let spec = oceanSpec()
      for (let n = 0; n < 6; n++) {
        spec = applyOps(spec, [{ op: 'adjustRect', c0: 10, r0: 10, c1: 11, r1: 11, delta: 1 }]).spec
      }
      expect(spec.grid.tiers[cellIndex(spec.grid, 10, 10)]).toBe(4)
    })

    it('rejects a delta outside {-1, 1}', () => {
      const spec = oceanSpec()
      const { errors } = applyOps(spec, [{ op: 'adjustRect', c0: 0, r0: 0, c1: 1, r1: 1, delta: 2 } as unknown as Op])
      expect(errors).toHaveLength(1)
      expect(errors[0].op).toBe('adjustRect')
      expect(errors[0].message).toMatch(/delta/)
    })
  })

  describe('paintRect', () => {
    it('sets the surface code over the rect', () => {
      const spec = oceanSpec()
      const { spec: next, errors } = applyOps(spec, [
        { op: 'paintRect', c0: 5, r0: 5, c1: 6, r1: 6, surface: SURFACE_PATH },
      ])
      expect(errors).toHaveLength(0)
      expect(next.grid.surface.filter((s) => s === SURFACE_PATH)).toHaveLength(4)
    })
  })

  describe('out-of-bounds op among good ops', () => {
    it('records an OpError and later ops still apply', () => {
      const spec = oceanSpec()
      const ops: Op[] = [
        { op: 'fillRect', c0: 60, r0: 60, c1: 70, r1: 70, tier: 2 }, // out of bounds
        { op: 'fillRect', c0: 0, r0: 0, c1: 1, r1: 1, tier: 3 }, // good
      ]
      const { spec: next, errors } = applyOps(spec, ops)
      expect(errors).toHaveLength(1)
      expect(errors[0].index).toBe(0)
      expect(errors[0].op).toBe('fillRect')
      expect(errors[0].message).toMatch(/out of bounds/)
      expect(next.grid.tiers[cellIndex(next.grid, 0, 0)]).toBe(3)
    })

    it('rejects c0 > c1', () => {
      const { errors } = applyOps(oceanSpec(), [{ op: 'fillRect', c0: 5, r0: 0, c1: 2, r1: 3, tier: 1 }])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toMatch(/c0 .* must not exceed c1/)
    })
  })

  describe('reset', () => {
    it('returns the seed island', () => {
      const spec = oceanSpec()
      const { spec: next, errors } = applyOps(spec, [{ op: 'reset' }])
      expect(errors).toHaveLength(0)
      expect(next.grid.tiers).toEqual(seedIsland().grid.tiers)
    })
  })

  describe('batch validity', () => {
    it('a valid batch passes the final validate gate with no errors', () => {
      const spec = seedIsland()
      const { spec: next, errors } = applyOps(spec, [
        { op: 'fillRect', c0: 20, r0: 20, c1: 25, r1: 25, tier: 3 },
        { op: 'adjustRect', c0: 22, r0: 22, c1: 23, r1: 23, delta: 1 },
        { op: 'paintRect', c0: 30, r0: 30, c1: 32, r1: 32, surface: SURFACE_PATH },
      ])
      expect(errors).toHaveLength(0)
      expect(errors.some((e) => e.op === 'validate')).toBe(false)
      expect(() => validateSpecObject(next)).not.toThrow()
    })

    it('never throws even when every op is malformed, and keeps the spec valid', () => {
      const spec = seedIsland()
      const ops = [null, 42, { op: 'notARealOp' }] as unknown as Op[]
      expect(() => applyOps(spec, ops)).not.toThrow()
      const { spec: next, errors } = applyOps(spec, ops)
      expect(errors).toHaveLength(3)
      expect(() => validateSpecObject(next)).not.toThrow()
    })
  })
})
