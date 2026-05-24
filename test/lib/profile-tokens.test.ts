import { describe, expect, it } from 'vitest'

import {
  DIMENSION_LABEL as ENGINE_DIMENSION_LABEL,
  PROFILE_COLORS as ENGINE_PROFILE_COLORS,
  PROFILE_DIMENSIONS as ENGINE_PROFILE_DIMENSIONS,
  PROFILE_HEADERS as ENGINE_PROFILE_HEADERS,
} from '~/engine/student-space/Game/View/profile-tokens.constants.js'
import {
  DIMENSION_LABEL,
  PROFILE_COLORS,
  PROFILE_DIMENSIONS,
  PROFILE_HEADERS,
  PROFILE_THEMES,
  TYPOGRAPHY,
} from '~/lib/profile-tokens'

describe('profile-tokens', () => {
  it('PROFILE_THEMES has all dimensions populated with non-empty color + Tailwind class fields', () => {
    for (const dimension of PROFILE_DIMENSIONS) {
      const theme = PROFILE_THEMES[dimension]
      expect(theme.accent).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.soft).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.ink).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.tab).toBeTruthy()
      expect(theme.callout).toBeTruthy()
      expect(theme.border).toBeTruthy()
      expect(theme.text).toBeTruthy()
    }
  })

  it('PROFILE_HEADERS has all dimensions populated with non-empty student-voice fields', () => {
    for (const dimension of PROFILE_DIMENSIONS) {
      const header = PROFILE_HEADERS[dimension]
      expect(header.eyebrow).toBeTruthy()
      expect(header.tag).toBeTruthy()
      expect(header.title).toBeTruthy()
      expect(header.subtitle).toBeTruthy()
    }
  })

  it('TYPOGRAPHY exposes the sans font family and a numeric weight ramp', () => {
    expect(TYPOGRAPHY.fontFamily.sans).toBeTruthy()
    expect(TYPOGRAPHY.weight.regular).toBe(400)
    expect(TYPOGRAPHY.weight.bold).toBe(700)
  })
})

describe('profile-tokens engine mirror drift detection', () => {
  it('engine PROFILE_DIMENSIONS matches the TS source', () => {
    expect(ENGINE_PROFILE_DIMENSIONS).toEqual([...PROFILE_DIMENSIONS])
  })

  it('engine PROFILE_COLORS matches the TS source byte-for-byte', () => {
    expect(ENGINE_PROFILE_COLORS).toEqual(PROFILE_COLORS)
  })

  it('engine PROFILE_HEADERS matches the TS source byte-for-byte', () => {
    expect(ENGINE_PROFILE_HEADERS).toEqual(PROFILE_HEADERS)
  })

  it('engine DIMENSION_LABEL matches the TS source byte-for-byte', () => {
    expect(ENGINE_DIMENSION_LABEL).toEqual(DIMENSION_LABEL)
  })
})
