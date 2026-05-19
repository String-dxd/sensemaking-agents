/**
 * Profile tab vocabulary — covers U1 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 *
 * Guards the VIPS-vs-ProfileTab split: VIPS canonical taxonomy stays four,
 * Profile tabs widen to six.
 */
import { describe, expect, it } from 'vitest'
import {
  isNonVipsProfileTab,
  isProfileTab,
  NON_VIPS_PROFILE_TABS,
  PROFILE_TAB_HEADERS,
  PROFILE_TAB_LABEL,
  PROFILE_TAB_THEMES,
  PROFILE_TABS,
} from '~/data/profile-tabs'
import { VIPS_DIMENSIONS } from '~/data/vips-taxonomy'

describe('profile-tabs vocabulary', () => {
  it('PROFILE_TABS is canonical VIPS order followed by relationships then choices', () => {
    expect(PROFILE_TABS).toEqual([
      'values',
      'interests',
      'personality',
      'skills',
      'relationships',
      'choices',
    ])
  })

  it('VIPS_DIMENSIONS is unchanged after the ProfileTab widening (R6 regression guard)', () => {
    expect(VIPS_DIMENSIONS).toEqual(['values', 'interests', 'personality', 'skills'])
  })

  it('isProfileTab recognises VIPS dimensions and the two non-VIPS tabs', () => {
    expect(isProfileTab('values')).toBe(true)
    expect(isProfileTab('relationships')).toBe(true)
    expect(isProfileTab('choices')).toBe(true)
    expect(isProfileTab('made-up')).toBe(false)
  })

  it('isNonVipsProfileTab is false for VIPS dimensions and true for the two new tabs', () => {
    expect(isNonVipsProfileTab('values')).toBe(false)
    expect(isNonVipsProfileTab('skills')).toBe(false)
    expect(isNonVipsProfileTab('relationships')).toBe(true)
    expect(isNonVipsProfileTab('choices')).toBe(true)
  })

  it('PROFILE_TAB_LABEL has an entry for every ProfileTab', () => {
    for (const tab of PROFILE_TABS) {
      expect(PROFILE_TAB_LABEL[tab]).toBeTruthy()
      expect(PROFILE_TAB_LABEL[tab].length).toBeGreaterThan(0)
    }
  })

  it('PROFILE_TAB_HEADERS and PROFILE_TAB_THEMES are defined for each non-VIPS tab', () => {
    for (const tab of NON_VIPS_PROFILE_TABS) {
      expect(PROFILE_TAB_HEADERS[tab].title).toBeTruthy()
      expect(PROFILE_TAB_HEADERS[tab].subtitle).toBeTruthy()
      expect(PROFILE_TAB_THEMES[tab].tab).toContain('border-')
      expect(PROFILE_TAB_THEMES[tab].callout).toContain('bg-')
    }
  })
})
