import { describe, expect, it } from 'vitest'
import { defaultBirdConfig, setSlotItem } from '../src/bird/birdConfig'
import { decodeConfigFromHash, encodeConfigToHash } from '../src/editor/urlHash'

describe('urlHash', () => {
  it('encode → decode round-trips a config', () => {
    const config = setSlotItem(defaultBirdConfig(), 'head', 'cap')
    const hash = encodeConfigToHash(config)
    expect(hash.startsWith('#b=')).toBe(true)
    expect(decodeConfigFromHash(hash)).toEqual(config)
  })

  it('returns null when the hash has no b= param', () => {
    expect(decodeConfigFromHash('')).toBeNull()
    expect(decodeConfigFromHash('#other=1')).toBeNull()
  })

  it('returns null on a malformed payload', () => {
    expect(decodeConfigFromHash('#b=not-valid-base64!!')).toBeNull()
  })
})
