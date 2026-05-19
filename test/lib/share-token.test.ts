import { describe, expect, it } from 'vitest'

import {
  asciiSlugForFilename,
  buildShareUrl,
  buildShareUrlPath,
  generateShareToken,
  sanitizeNameSnapshot,
} from '~/lib/share-token'

describe('generateShareToken', () => {
  it('produces 22 base64url characters', () => {
    const token = generateShareToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('produces a different token each call (collision-unlikely)', () => {
    const a = generateShareToken()
    const b = generateShareToken()
    expect(a).not.toEqual(b)
  })
})

describe('buildShareUrlPath / buildShareUrl', () => {
  it('builds a path with the token in the slug', () => {
    expect(buildShareUrlPath('AAAA')).toBe('/share/AAAA')
  })

  it('falls back to the path-only form when no origin is provided', () => {
    delete process.env.PUBLIC_SHARE_ORIGIN
    expect(buildShareUrl('AAAA')).toBe('/share/AAAA')
  })

  it('uses the request origin when no PUBLIC_SHARE_ORIGIN is set', () => {
    delete process.env.PUBLIC_SHARE_ORIGIN
    expect(buildShareUrl('AAAA', 'http://example.test')).toBe('http://example.test/share/AAAA')
  })

  it('prefers PUBLIC_SHARE_ORIGIN over the request origin', () => {
    process.env.PUBLIC_SHARE_ORIGIN = 'https://share.example.test'
    expect(buildShareUrl('AAAA', 'http://localhost:3001')).toBe(
      'https://share.example.test/share/AAAA',
    )
    delete process.env.PUBLIC_SHARE_ORIGIN
  })
})

describe('sanitizeNameSnapshot', () => {
  it('returns null for empty input', () => {
    expect(sanitizeNameSnapshot(null)).toBeNull()
    expect(sanitizeNameSnapshot(undefined)).toBeNull()
    expect(sanitizeNameSnapshot('')).toBeNull()
    expect(sanitizeNameSnapshot('   ')).toBeNull()
  })

  it('preserves UTF-8 letters and trims whitespace', () => {
    expect(sanitizeNameSnapshot('  Mei Lin  ')).toBe('Mei Lin')
    expect(sanitizeNameSnapshot('林美')).toBe('林美')
    expect(sanitizeNameSnapshot('Aishah Tan')).toBe('Aishah Tan')
  })

  it('collapses runs of whitespace into single spaces', () => {
    expect(sanitizeNameSnapshot('Mei   Lin\t Tan')).toBe('Mei Lin Tan')
  })

  it('strips ASCII control characters', () => {
    expect(sanitizeNameSnapshot('MeiLin')).toBe('MeiLin')
    expect(sanitizeNameSnapshot('MeiLin')).toBe('MeiLin')
  })

  it('strips zero-width spoof characters', () => {
    expect(sanitizeNameSnapshot('Mei​Lin')).toBe('MeiLin')
    expect(sanitizeNameSnapshot('Mei‌Lin')).toBe('MeiLin')
    expect(sanitizeNameSnapshot('Mei‍Lin')).toBe('MeiLin')
    expect(sanitizeNameSnapshot('Mei﻿Lin')).toBe('MeiLin')
  })

  it('caps the result at 80 characters', () => {
    const long = 'A'.repeat(120)
    const result = sanitizeNameSnapshot(long)
    expect(result?.length).toBe(80)
  })
})

describe('asciiSlugForFilename', () => {
  it('returns "student" for empty input', () => {
    expect(asciiSlugForFilename(null)).toBe('student')
    expect(asciiSlugForFilename(undefined)).toBe('student')
    expect(asciiSlugForFilename('')).toBe('student')
  })

  it('produces lowercase hyphenated ASCII', () => {
    expect(asciiSlugForFilename('Mei Lin Tan')).toBe('mei-lin-tan')
  })

  it('strips accented diacritics via NFKD normalization', () => {
    expect(asciiSlugForFilename('José García')).toBe('jose-garcia')
    expect(asciiSlugForFilename('Renée')).toBe('renee')
  })

  it('falls back to "student" when no ASCII letters survive', () => {
    expect(asciiSlugForFilename('林美')).toBe('student')
    expect(asciiSlugForFilename('!!!')).toBe('student')
  })

  it('caps the slug at 40 characters with no trailing hyphen', () => {
    const long = `${'A'.repeat(50)} Tan`
    const result = asciiSlugForFilename(long)
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result.endsWith('-')).toBe(false)
  })
})
