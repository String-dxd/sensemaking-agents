// NOTE: downloadSpec and importSpecFromFile are browser-only (Blob, FileReader,
// document.createElement) and are intentionally not unit-tested here.
// They are exercised manually / in browser integration tests.

import { describe, expect, it } from 'vitest'
import { seedFromCurrentIsland } from '../src/terrain/islandSpec'
import { deserializeSpec, serializeSpec } from '../src/editor/exportSpec'

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
    it('throws when version !== 1', () => {
      const bad = JSON.stringify({ ...spec, version: 2 })
      expect(() => deserializeSpec(bad)).toThrow('Invalid island spec: version must be 1')
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
})
