/**
 * Plan 036 — shared Asia/Singapore day-bucketing helper.
 *
 * SenseMake is a Singapore school product; the calendar is anchored to
 * Asia/Singapore regardless of the viewer's device timezone. These tests
 * pin the SGT boundary behavior that the naive `toISOString().slice(0, 10)`
 * (UTC) bucketing got wrong.
 */
import { describe, expect, it } from 'vitest'
import { sgDateKey, sgToday } from '~/lib/entry-date'

describe('sgDateKey', () => {
  it('buckets a UTC timestamp into the next Singapore calendar day (the demo-visible bug)', () => {
    // 2026-07-19T23:00:00Z is 2026-07-20 07:00 in Asia/Singapore (UTC+8).
    expect(sgDateKey('2026-07-19T23:00:00Z')).toBe('2026-07-20')
  })

  it('keeps a timestamp on the same Singapore day just before the boundary', () => {
    // 2026-07-19T15:59:00Z is 2026-07-19 23:59 in Asia/Singapore.
    expect(sgDateKey('2026-07-19T15:59:00Z')).toBe('2026-07-19')
  })

  it('rolls over exactly at the Singapore midnight boundary', () => {
    // 2026-07-19T16:00:00Z is 2026-07-20 00:00 in Asia/Singapore.
    expect(sgDateKey('2026-07-19T16:00:00Z')).toBe('2026-07-20')
  })

  it('returns null for invalid or missing input', () => {
    expect(sgDateKey('not-a-date')).toBeNull()
    expect(sgDateKey(undefined)).toBeNull()
    expect(sgDateKey(null)).toBeNull()
  })

  it('accepts a Date instance (a real seed-fixture timestamp that mis-bucketed before)', () => {
    // 2026-03-09T23:45:00Z is 2026-03-10 07:45 in Asia/Singapore.
    expect(sgDateKey(new Date('2026-03-09T23:45:00Z'))).toBe('2026-03-10')
  })
})

describe('sgToday', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(sgToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
