// NOTE: downloadSpec and importSpecFromFile are browser-only (Blob, FileReader,
// document.createElement) and are intentionally not unit-tested here.
// They are exercised manually / in browser integration tests.

import { describe, expect, it } from 'vitest'
import { seedFromCurrentIsland } from '../src/terrain/islandSpec'
import { deserializeSpec, serializeSpec, validateSpecObject } from '../src/editor/exportSpec'

describe('exportSpec', () => {
  const spec = seedFromCurrentIsland()

  describe('serializeSpec → deserializeSpec round-trip', () => {
    it('produces a JSON string', () => {
      const json = serializeSpec(spec)
      expect(typeof json).toBe('string')
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('round-trips to a deep-equal spec', () => {
      const json = serializeSpec(spec)
      const restored = deserializeSpec(json)
      expect(restored).toEqual(spec)
    })

    it('round-trips with a small custom spec', () => {
      const custom = seedFromCurrentIsland(6, 4)
      const restored = deserializeSpec(serializeSpec(custom))
      expect(restored).toEqual(custom)
    })
  })

  describe('deserializeSpec — malformed JSON', () => {
    it('throws on completely invalid JSON', () => {
      expect(() => deserializeSpec('not json at all')).toThrow('Invalid island spec: malformed JSON')
    })

    it('throws on truncated JSON', () => {
      expect(() => deserializeSpec('{"version":1,')).toThrow(
        'Invalid island spec: malformed JSON',
      )
    })
  })

  describe('deserializeSpec — valid JSON, wrong shape', () => {
    it('throws when version is neither 1 nor 2', () => {
      const bad = JSON.stringify({ ...spec, version: 3 })
      expect(() => deserializeSpec(bad)).toThrow('Invalid island spec: version must be 1 or 2')
    })

    it('throws when worldSize is not finite', () => {
      const bad = JSON.stringify({ ...spec, worldSize: Infinity })
      expect(() => deserializeSpec(bad)).toThrow(
        'Invalid island spec: worldSize must be a finite number',
      )
    })

    it('throws when worldSize is missing', () => {
      const { worldSize: _ws, ...rest } = spec as unknown as { worldSize: number } & Record<string, unknown>
      expect(() => deserializeSpec(JSON.stringify(rest))).toThrow(
        'Invalid island spec: worldSize must be a finite number',
      )
    })

    it('throws when coastline has fewer than 3 points', () => {
      const bad = JSON.stringify({ ...spec, coastline: [{ x: 0, z: 0 }, { x: 1, z: 1 }] })
      expect(() => deserializeSpec(bad)).toThrow('Invalid island spec: coastline')
    })

    it('throws when a coastline point is malformed', () => {
      const bad = JSON.stringify({
        ...spec,
        coastline: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 'oops', z: 2 }],
      })
      expect(() => deserializeSpec(bad)).toThrow('Invalid island spec: coastline[2]')
    })

    it('throws when heightProfile is missing a field', () => {
      const { cliffSteepness: _cs, ...hp } = spec.heightProfile as unknown as { cliffSteepness: number } & Record<string, unknown>
      const bad = JSON.stringify({ ...spec, heightProfile: hp })
      expect(() => deserializeSpec(bad)).toThrow('Invalid island spec: heightProfile')
    })

    it('throws when relief data length does not match resolution²', () => {
      const bad = JSON.stringify({
        ...spec,
        relief: { resolution: 4, data: [0, 1, 2] },
      })
      expect(() => deserializeSpec(bad)).toThrow('Invalid island spec: relief')
    })

    it('throws when relief is missing entirely', () => {
      const { relief: _r, ...rest } = spec as unknown as { relief: unknown } & Record<string, unknown>
      expect(() => deserializeSpec(JSON.stringify(rest))).toThrow('Invalid island spec: relief')
    })
  })

  describe('v2 sparse relief encoding', () => {
    it('serializeSpec emits the sparse form for a mostly-zero grid', () => {
      // Custom seed has a small all-zero relief — sparse is the clear win.
      const sparseSeed = seedFromCurrentIsland(6, 8)
      const json = serializeSpec(sparseSeed)
      expect(json).toContain('"encoding": "sparse"')
      expect(json).toContain('"version": 2')
    })

    it('deserializeSpec(serializeSpec(seed)) deep-equals the seed dense relief', () => {
      const seed = seedFromCurrentIsland(8, 16)
      const restored = deserializeSpec(serializeSpec(seed))
      expect(restored.version).toBe(2)
      expect(restored.relief.resolution).toBe(seed.relief.resolution)
      expect(restored.relief.data).toEqual(seed.relief.data)
      expect(restored).toEqual(seed)
    })

    it('round-trips a relief with nonzero cells back to identical dense data', () => {
      const seed = seedFromCurrentIsland(8, 8)
      const withRelief = {
        ...seed,
        relief: {
          resolution: seed.relief.resolution,
          data: seed.relief.data.map((_, i) => (i === 3 ? 0.37 : i === 20 ? -0.5 : 0)),
        },
      }
      const json = serializeSpec(withRelief)
      expect(json).toContain('"encoding": "sparse"')
      const restored = deserializeSpec(json)
      expect(restored.relief.data).toEqual(withRelief.relief.data)
      expect(restored.relief.data[3]).toBe(0.37)
      expect(restored.relief.data[20]).toBe(-0.5)
    })
  })

  describe('legacy v1 (dense) input', () => {
    it('loads a v1 dense spec and normalizes it to a dense v2 spec', () => {
      const seed = seedFromCurrentIsland(8, 4)
      // A genuine legacy file: version 1, dense relief array.
      const legacy = {
        ...seed,
        version: 1,
        relief: { resolution: 4, data: new Array(16).fill(0).map((_, i) => (i === 2 ? 0.9 : 0)) },
      }
      const restored = deserializeSpec(JSON.stringify(legacy))
      expect(restored.version).toBe(2) // normalized
      expect(restored.relief.resolution).toBe(4)
      expect(restored.relief.data).toHaveLength(16)
      expect(restored.relief.data[2]).toBe(0.9)
      expect(restored.relief.data).toEqual(legacy.relief.data)
    })
  })

  describe('relief validation hardening', () => {
    it('rejects a dense relief containing non-finite values (NaN / Infinity)', () => {
      const seed = seedFromCurrentIsland(8, 4)
      // validateSpecObject sees the in-memory non-finite value directly
      // (JSON.stringify would coerce NaN/Infinity to null first).
      const withNaN = {
        ...seed,
        relief: { resolution: 4, data: new Array(16).fill(0).map((_, i) => (i === 5 ? Number.NaN : 0)) },
      }
      expect(() => validateSpecObject(withNaN)).toThrow(/relief/)
      const withInf = {
        ...seed,
        relief: {
          resolution: 4,
          data: new Array(16).fill(0).map((_, i) => (i === 5 ? Number.POSITIVE_INFINITY : 0)),
        },
      }
      expect(() => validateSpecObject(withInf)).toThrow(/relief/)
    })

    it('rejects a non-integer or < 2 relief resolution', () => {
      const seed = seedFromCurrentIsland(8, 4)
      const frac = { ...seed, relief: { resolution: 3.5, data: new Array(16).fill(0) } }
      expect(() => validateSpecObject(frac)).toThrow(/relief/)
      const tiny = { ...seed, relief: { resolution: 1, data: [0] } }
      expect(() => validateSpecObject(tiny)).toThrow(/relief/)
    })
  })
})
