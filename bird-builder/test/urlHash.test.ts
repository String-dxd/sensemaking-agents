import { describe, expect, it } from 'vitest'
import { defaultGenome, setSlotItem } from '../src/bird/genome'
import { decodeConfigFromHash, encodeConfigToHash } from '../src/editor/urlHash'

describe('urlHash', () => {
  it('encode → decode round-trips a genome', () => {
    const config = setSlotItem(defaultGenome(), 'head', 'cap')
    const hash = encodeConfigToHash(config)
    expect(hash.startsWith('#b=')).toBe(true)
    expect(decodeConfigFromHash(hash)).toEqual(config)
  })

  it('a default genome encodes well under the 8KB cap', () => {
    expect(encodeConfigToHash(defaultGenome()).length).toBeLessThan(8192)
  })

  it('returns null when the hash has no b= param', () => {
    expect(decodeConfigFromHash('')).toBeNull()
    expect(decodeConfigFromHash('#other=1')).toBeNull()
  })

  it('returns null on a malformed payload', () => {
    expect(decodeConfigFromHash('#b=not-valid-base64!!')).toBeNull()
  })
})
