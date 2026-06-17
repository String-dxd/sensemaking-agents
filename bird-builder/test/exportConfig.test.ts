import { describe, expect, it } from 'vitest'
import { defaultBirdConfig } from '../src/bird/birdConfig'
import { defaultGenome } from '../src/bird/genome'
import { deserializeConfig, serializeConfig } from '../src/editor/exportConfig'

describe('exportConfig', () => {
  it('serialize → deserialize round-trips', () => {
    const config = defaultGenome()
    expect(deserializeConfig(serializeConfig(config))).toEqual(config)
  })

  it('imports (upgrades) a v1 export', () => {
    const v2 = deserializeConfig(JSON.stringify(defaultBirdConfig()))
    expect(v2.version).toBe(2)
    expect(v2.base.kind).toBe('glb')
  })

  it('throws a descriptive error on malformed JSON', () => {
    expect(() => deserializeConfig('{nope')).toThrow(/malformed JSON/)
  })

  it('throws on an unknown version', () => {
    expect(() => deserializeConfig(JSON.stringify({ ...defaultGenome(), version: 9 }))).toThrow(/version/)
  })

  it('throws on an invalid palette', () => {
    const bad = defaultGenome()
    bad.base.palette.back = 'not-a-color'
    expect(() => deserializeConfig(JSON.stringify(bad))).toThrow(/palette\.back/)
  })
})
