import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HISTORY_TAB,
  DEFAULT_PROFILE_TAB,
  pathnameForSurface,
  surfaceFromPathname,
} from '~/lib/student-space/route-sync'

describe('surfaceFromPathname', () => {
  it('returns null for the home route', () => {
    expect(surfaceFromPathname('/')).toBeNull()
  })

  it('handles trailing slashes the same as a clean pathname', () => {
    expect(surfaceFromPathname('/profile/')).toEqual({
      surface: 'profile',
      tab: DEFAULT_PROFILE_TAB,
    })
  })

  it('parses bare /profile with the default tab', () => {
    expect(surfaceFromPathname('/profile')).toEqual({
      surface: 'profile',
      tab: DEFAULT_PROFILE_TAB,
    })
  })

  it('parses every known profile tab', () => {
    for (const tab of [
      'values',
      'interests',
      'personality',
      'skills',
      'relationships',
      'choices',
    ] as const) {
      expect(surfaceFromPathname(`/profile/${tab}`)).toEqual({ surface: 'profile', tab })
    }
  })

  it('falls back to the default profile tab on unknown segments', () => {
    expect(surfaceFromPathname('/profile/bogus')).toEqual({
      surface: 'profile',
      tab: DEFAULT_PROFILE_TAB,
    })
  })

  it('parses bare /history with the default tab', () => {
    expect(surfaceFromPathname('/history')).toEqual({
      surface: 'history',
      tab: DEFAULT_HISTORY_TAB,
    })
  })

  it('parses /history/timeline and /history/growth', () => {
    expect(surfaceFromPathname('/history/timeline')).toEqual({
      surface: 'history',
      tab: 'timeline',
    })
    expect(surfaceFromPathname('/history/growth')).toEqual({
      surface: 'history',
      tab: 'growth',
    })
  })

  it('parses /letters and /trajectory without tabs', () => {
    expect(surfaceFromPathname('/letters')).toEqual({ surface: 'letters' })
    expect(surfaceFromPathname('/trajectory')).toEqual({ surface: 'trajectory' })
  })

  it('returns null for unknown top-level paths', () => {
    expect(surfaceFromPathname('/dashboard')).toBeNull()
    expect(surfaceFromPathname('/share/abc')).toBeNull()
  })
})

describe('pathnameForSurface', () => {
  it('returns /profile for the default tab', () => {
    expect(pathnameForSurface({ surface: 'profile' })).toBe('/profile')
    expect(pathnameForSurface({ surface: 'profile', tab: DEFAULT_PROFILE_TAB })).toBe('/profile')
  })

  it('appends the tab segment for non-default profile tabs', () => {
    expect(pathnameForSurface({ surface: 'profile', tab: 'relationships' })).toBe(
      '/profile/relationships',
    )
    expect(pathnameForSurface({ surface: 'profile', tab: 'choices' })).toBe('/profile/choices')
  })

  it('accepts a legacy tab-as-surface input and normalises it', () => {
    expect(pathnameForSurface({ surface: 'relationships' })).toBe('/profile/relationships')
    expect(pathnameForSurface({ surface: 'values' })).toBe('/profile')
  })

  it('returns /history for the default tab', () => {
    expect(pathnameForSurface({ surface: 'history' })).toBe('/history')
    expect(pathnameForSurface({ surface: 'history', tab: DEFAULT_HISTORY_TAB })).toBe('/history')
  })

  it('appends /growth for the growth tab', () => {
    expect(pathnameForSurface({ surface: 'history', tab: 'growth' })).toBe('/history/growth')
    expect(pathnameForSurface({ surface: 'growth' })).toBe('/history/growth')
  })

  it('aliases reflections back to /history', () => {
    expect(pathnameForSurface({ surface: 'reflections' })).toBe('/history')
  })

  it('appends the reflection hash when entryId is supplied', () => {
    expect(
      pathnameForSurface({ surface: 'history', tab: 'timeline', entryId: 42 }),
    ).toBe('/history#reflection-42')
  })

  it('round-trips through surfaceFromPathname for every known surface', () => {
    const cases: Array<{ surface: 'profile' | 'history' | 'letters' | 'trajectory'; tab?: string }> = [
      { surface: 'profile' },
      { surface: 'profile', tab: 'relationships' },
      { surface: 'history' },
      { surface: 'history', tab: 'growth' },
      { surface: 'letters' },
      { surface: 'trajectory' },
    ]
    for (const input of cases) {
      const path = pathnameForSurface(input)
      const parsed = surfaceFromPathname(path)
      expect(parsed).toMatchObject(input)
    }
  })
})
