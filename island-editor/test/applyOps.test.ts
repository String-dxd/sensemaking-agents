import { describe, expect, it } from 'vitest'
import { applyOps } from '../src/agent/applyOps'
import type { Op } from '../src/agent/ops'
import { reliefAt, seedFromCurrentIsland, type IslandSpec } from '../src/terrain/islandSpec'
import { validateSpecObject } from '../src/editor/exportSpec'

// A tiny valid spec (3-point coastline, small relief) for delete-below-3 cases.
function triangleSpec(resolution = 4): IslandSpec {
  return {
    version: 1,
    worldSize: 24,
    coastline: [
      { x: 5, z: 0 },
      { x: -5, z: 4 },
      { x: -5, z: -4 },
    ],
    heightProfile: { seaLevel: 0, plateauHeight: 1, coastFalloff: 2, cliffSteepness: 0.45, seafloorDepth: -1.2 },
    relief: { resolution, data: new Array(resolution * resolution).fill(0) },
  }
}

describe('applyOps', () => {
  describe('movePoint', () => {
    it('updates one point and leaves the input spec untouched', () => {
      const spec = seedFromCurrentIsland()
      const originalPoint = { ...spec.coastline[2] }
      const { spec: next, errors } = applyOps(spec, [{ op: 'movePoint', index: 2, x: 9, z: 9 }])
      expect(errors).toHaveLength(0)
      expect(next.coastline[2]).toEqual({ x: 9, z: 9 })
      // all other points unchanged
      expect(next.coastline[0]).toEqual(spec.coastline[0])
      expect(next.coastline[1]).toEqual(spec.coastline[1])
      // immutability: input spec's point is unchanged, and a new spec object is returned
      expect(spec.coastline[2]).toEqual(originalPoint)
      expect(next).not.toBe(spec)
      expect(next.coastline).not.toBe(spec.coastline)
    })
  })

  describe('insertPointAfter / deletePoint', () => {
    it('insertPointAfter grows the coastline by 1', () => {
      const spec = seedFromCurrentIsland()
      const { spec: next, errors } = applyOps(spec, [{ op: 'insertPointAfter', index: 0 }])
      expect(errors).toHaveLength(0)
      expect(next.coastline).toHaveLength(spec.coastline.length + 1)
      expect(spec.coastline).toHaveLength(24) // input untouched
    })

    it('deletePoint shrinks the coastline by 1', () => {
      const spec = seedFromCurrentIsland()
      const { spec: next, errors } = applyOps(spec, [{ op: 'deletePoint', index: 0 }])
      expect(errors).toHaveLength(0)
      expect(next.coastline).toHaveLength(spec.coastline.length - 1)
      expect(spec.coastline).toHaveLength(24) // input untouched
    })

    it('deletePoint at 3 points records an OpError, leaves the spec unchanged, and continues the batch', () => {
      const spec = triangleSpec()
      const ops: Op[] = [
        { op: 'deletePoint', index: 0 }, // illegal — would drop below 3
        { op: 'movePoint', index: 1, x: 7, z: 7 }, // good — must still apply
      ]
      const { spec: next, errors } = applyOps(spec, ops)
      expect(errors).toHaveLength(1)
      expect(errors[0].index).toBe(0)
      expect(errors[0].op).toBe('deletePoint')
      expect(errors[0].message).toMatch(/3 points/)
      // coastline length unchanged by the failed delete
      expect(next.coastline).toHaveLength(3)
      // the following good op still applied (batch continued)
      expect(next.coastline[1]).toEqual({ x: 7, z: 7 })
    })
  })

  describe('setHeightProfile', () => {
    it('merges partial fields and leaves the others intact', () => {
      const spec = seedFromCurrentIsland()
      const { spec: next, errors } = applyOps(spec, [
        { op: 'setHeightProfile', profile: { plateauHeight: 3.5, seaLevel: 0.25 } },
      ])
      expect(errors).toHaveLength(0)
      expect(next.heightProfile.plateauHeight).toBe(3.5)
      expect(next.heightProfile.seaLevel).toBe(0.25)
      // untouched fields preserved
      expect(next.heightProfile.coastFalloff).toBe(spec.heightProfile.coastFalloff)
      expect(next.heightProfile.cliffSteepness).toBe(spec.heightProfile.cliffSteepness)
      expect(next.heightProfile.seafloorDepth).toBe(spec.heightProfile.seafloorDepth)
      // input untouched
      expect(spec.heightProfile.plateauHeight).toBe(1.0)
    })
  })

  describe('raiseRegion', () => {
    it('raises relief at the center while the input spec relief stays all-zero (clone-before-brush)', () => {
      const spec = seedFromCurrentIsland(24, 64)
      const op: Op = { op: 'raiseRegion', x: 0, z: 0, radius: 4, strength: 0.5 }
      const { spec: next, errors } = applyOps(spec, [op])
      expect(errors).toHaveLength(0)
      // relief is higher at the brushed center
      expect(reliefAt(next, 0, 0)).toBeGreaterThan(0)
      // immutability: the input grid is a different array, still all zero
      expect(next.relief.data).not.toBe(spec.relief.data)
      expect(spec.relief.data.every((v) => v === 0)).toBe(true)
      expect(reliefAt(spec, 0, 0)).toBe(0)
    })
  })

  describe('clearRelief', () => {
    it('zeroes the grid (and keeps resolution + length)', () => {
      // start from a raised spec so there is something to clear
      const seeded = seedFromCurrentIsland(24, 64)
      const { spec: raised } = applyOps(seeded, [{ op: 'raiseRegion', x: 0, z: 0, radius: 5, strength: 0.8 }])
      expect(raised.relief.data.some((v) => v !== 0)).toBe(true)

      const { spec: cleared, errors } = applyOps(raised, [{ op: 'clearRelief' }])
      expect(errors).toHaveLength(0)
      expect(cleared.relief.resolution).toBe(raised.relief.resolution)
      expect(cleared.relief.data).toHaveLength(raised.relief.data.length)
      expect(cleared.relief.data.every((v) => v === 0)).toBe(true)
      // immutability: the raised input is not mutated
      expect(raised.relief.data.some((v) => v !== 0)).toBe(true)
    })
  })

  describe('batch with a bad op among good ops', () => {
    it('applies the good ops, collects the error, and the final spec validates', () => {
      const spec = triangleSpec(8)
      const ops: Op[] = [
        { op: 'insertPointAfter', index: 0 }, // 3 → 4 points
        { op: 'deletePoint', index: 0 }, // 4 → 3 points (legal now)
        { op: 'deletePoint', index: 0 }, // 3 → illegal, records an error
        { op: 'raiseRegion', x: 0, z: 0, radius: 4, strength: 0.5 }, // good
        { op: 'setHeightProfile', profile: { plateauHeight: 2 } }, // good
      ]
      const { spec: next, errors } = applyOps(spec, ops)
      expect(errors).toHaveLength(1)
      expect(errors[0].index).toBe(2)
      expect(errors[0].op).toBe('deletePoint')
      // good ops applied
      expect(next.coastline).toHaveLength(3)
      expect(next.heightProfile.plateauHeight).toBe(2)
      expect(reliefAt(next, 0, 0)).toBeGreaterThan(0)
      // final spec is valid (no validate error in the list)
      expect(errors.some((e) => e.op === 'validate')).toBe(false)
      expect(() => validateSpecObject(next)).not.toThrow()
    })
  })

  describe('returned spec validity', () => {
    it('a normal batch returns a spec that passes validateSpecObject with no errors', () => {
      const spec = seedFromCurrentIsland(24, 32)
      const { spec: next, errors } = applyOps(spec, [
        { op: 'movePoint', index: 0, x: 6, z: 0 },
        { op: 'insertPointAfter', index: 1 },
        { op: 'raiseRegion', x: 1, z: 1, radius: 3, strength: 0.4 },
        { op: 'smoothRegion', x: 1, z: 1, radius: 3, strength: 0.3 },
      ])
      expect(errors).toHaveLength(0)
      expect(() => validateSpecObject(next)).not.toThrow()
    })

    it('never throws even when every op is bad', () => {
      const spec = triangleSpec()
      const ops: Op[] = [
        { op: 'deletePoint', index: 0 },
        { op: 'deletePoint', index: 1 },
      ]
      expect(() => applyOps(spec, ops)).not.toThrow()
      const { errors } = applyOps(spec, ops)
      expect(errors).toHaveLength(2)
    })
  })
})
