/**
 * Plan 036 — shared Asia/Singapore day-bucketing helper.
 *
 * SenseMake is a Singapore school product; the calendar is anchored to
 * Asia/Singapore regardless of the viewer's device timezone. These tests
 * pin the SGT boundary behavior that the naive `toISOString().slice(0, 10)`
 * (UTC) bucketing got wrong.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addSgDays,
  sgDateKey,
  sgDayKeyParts,
  sgMonthGridKeys,
  sgToday,
  sgWeekKeys,
} from '~/lib/entry-date'

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

describe('sgDayKeyParts', () => {
  it('splits a day key into calendar parts plus a weekday', () => {
    // 2026-03-01 is a Sunday, so weekday === 0.
    expect(sgDayKeyParts('2026-03-01')).toEqual({ year: 2026, month0: 2, day: 1, weekday: 0 })
  })

  it('returns null for malformed or missing input', () => {
    expect(sgDayKeyParts('not-a-date')).toBeNull()
    expect(sgDayKeyParts('')).toBeNull()
    expect(sgDayKeyParts(null)).toBeNull()
    expect(sgDayKeyParts(undefined)).toBeNull()
  })

  it('rejects an impossible date instead of silently normalising it', () => {
    // Date.UTC would roll 2026-02-30 forward into March; the round-trip check
    // catches that and returns null.
    expect(sgDayKeyParts('2026-02-30')).toBeNull()
  })
})

describe('addSgDays', () => {
  it('steps back across a month boundary', () => {
    expect(addSgDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('steps forward across a year boundary', () => {
    expect(addSgDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('steps forward from a 31-day month', () => {
    expect(addSgDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('returns null on bad input', () => {
    expect(addSgDays('bad', 1)).toBeNull()
  })
})

describe('sgWeekKeys', () => {
  it('returns Sunday → Saturday of the containing week', () => {
    expect(sgWeekKeys('2026-03-18')).toEqual([
      '2026-03-15',
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
    ])
  })
})

describe('sgMonthGridKeys', () => {
  it('starts exactly on the 1st when the month begins on a Sunday', () => {
    // March 2026 starts on a Sunday, so the grid has no leading spill.
    const keys = sgMonthGridKeys(2026, 2)
    expect(keys).toHaveLength(42)
    expect(keys[0]).toBe('2026-03-01')
    expect(keys[41]).toBe('2026-04-11')
    expect(keys).toContain('2026-03-31')
  })

  it('spills back into the previous month when the 1st is mid-week', () => {
    // July 2026 starts on a Wednesday → startOffset 3.
    const keys = sgMonthGridKeys(2026, 6)
    expect(keys[0]).toBe('2026-06-28')
    expect(keys).toContain('2026-07-01')
  })
})

describe('day-key arithmetic is device-timezone independent', () => {
  // Pacific/Auckland (UTC+12) is the zone where the old device-local cell
  // construction shifted the whole grid a day: Auckland's local midnight of
  // day D is still D−1 in Singapore.
  const ORIGINAL_TZ = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'Pacific/Auckland'
  })

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it('produces the same month grid as it does under any other zone', () => {
    const keys = sgMonthGridKeys(2026, 2)
    expect(keys).toHaveLength(42)
    expect(keys[0]).toBe('2026-03-01')
    expect(keys[41]).toBe('2026-04-11')
  })

  it('produces the same week keys as it does under any other zone', () => {
    expect(sgWeekKeys('2026-03-18')).toEqual([
      '2026-03-15',
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
    ])
  })
})
