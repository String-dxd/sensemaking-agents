import { describe, expect, it } from 'vitest'
import { defaultBirdConfig } from '../src/bird/birdConfig'
import { deserializeConfig, serializeConfig } from '../src/editor/exportConfig'

describe('exportConfig', () => {
  it('serialize → deserialize round-trips', () => {
    const config = defaultBirdConfig()
    expect(deserializeConfig(serializeConfig(config))).toEqual(config)
  })

  it('throws a descriptive error on malformed JSON', () => {
    expect(() => deserializeConfig('{nope')).toThrow(/malformed JSON/)
  })

  it('throws on wrong version', () => {
    expect(() => deserializeConfig(JSON.stringify({ ...defaultBirdConfig(), version: 9 }))).toThrow(
      /version/,
    )
  })

  it('throws on an invalid palette', () => {
    const bad = defaultBirdConfig()
    bad.featherPalette = { body: '#fff', accent: 'not-a-color' }
    expect(() => deserializeConfig(JSON.stringify(bad))).toThrow(/featherPalette\.accent/)
  })
})
