import { describe, expect, it } from 'vitest'

import {
  SGT_OFFSET_MINUTES as ENGINE_SGT_OFFSET_MINUTES,
  bucketYearForTimestamp as engineBucketYearForTimestamp,
  endOfSgtYearIso as engineEndOfSgtYearIso,
  getSgYearBoundary as engineGetSgYearBoundary,
  yearRangeSgt as engineYearRangeSgt,
  yearsCoveringActivity as engineYearsCoveringActivity,
} from '~/engine/student-space/Game/year-buckets.constants.js'
import {
  bucketYearForTimestamp,
  endOfSgtYearIso,
  getSgYearBoundary,
  SGT_OFFSET_MINUTES,
  yearRangeSgt,
  yearsCoveringActivity,
} from '~/lib/year-buckets'

describe('year-buckets', () => {
  describe('getSgYearBoundary', () => {
    it('returns 00:00 SGT on Jan 1 (== 16:00 UTC on Dec 31 prior)', () => {
      // 00:00 SGT on 2026-01-01 == 16:00 UTC on 2025-12-31
      expect(getSgYearBoundary(2026)).toBe('2025-12-31T16:00:00.000Z')
      expect(getSgYearBoundary(2027)).toBe('2026-12-31T16:00:00.000Z')
    })
  })

  describe('bucketYearForTimestamp', () => {
    it('places mid-year SGT timestamps into the right calendar year', () => {
      expect(bucketYearForTimestamp('2026-06-15T03:00:00Z')).toBe(2026)
      expect(bucketYearForTimestamp('2026-06-15T11:00:00+08:00')).toBe(2026)
    })

    it('respects the SGT year boundary at Dec 31 → Jan 1 transition', () => {
      // 23:30 SGT on Dec 31, 2026 → 2026
      expect(bucketYearForTimestamp('2026-12-31T23:30:00+08:00')).toBe(2026)
      // 00:30 SGT on Jan 1, 2027 → 2027
      expect(bucketYearForTimestamp('2027-01-01T00:30:00+08:00')).toBe(2027)
    })

    it('handles UTC timestamps that straddle the SGT boundary', () => {
      // 17:00 UTC on Dec 31, 2026 == 01:00 SGT on Jan 1, 2027 → 2027
      expect(bucketYearForTimestamp('2026-12-31T17:00:00Z')).toBe(2027)
      // 15:00 UTC on Dec 31, 2026 == 23:00 SGT on Dec 31, 2026 → 2026
      expect(bucketYearForTimestamp('2026-12-31T15:00:00Z')).toBe(2026)
    })

    it('throws on invalid ISO input', () => {
      expect(() => bucketYearForTimestamp('not a date')).toThrow(TypeError)
    })
  })

  describe('yearsCoveringActivity', () => {
    it('returns sorted unique years for a mixed-year input', () => {
      const timestamps = [
        '2025-08-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
        '2026-09-15T00:00:00Z',
        '2024-11-30T00:00:00Z',
      ]
      expect(yearsCoveringActivity(timestamps)).toEqual([2024, 2025, 2026])
    })

    it('returns empty array for empty input', () => {
      expect(yearsCoveringActivity([])).toEqual([])
    })

    it('deduplicates same-year timestamps', () => {
      expect(
        yearsCoveringActivity([
          '2026-01-15T00:00:00Z',
          '2026-06-15T00:00:00Z',
          '2026-12-15T00:00:00Z',
        ]),
      ).toEqual([2026])
    })
  })

  describe('yearRangeSgt', () => {
    it('returns the half-open [start, end) range matching SGT year', () => {
      const { startIso, endIso } = yearRangeSgt(2026)
      expect(startIso).toBe('2025-12-31T16:00:00.000Z')
      expect(endIso).toBe('2026-12-31T16:00:00.000Z')
    })
  })

  describe('endOfSgtYearIso', () => {
    it('returns the last instant inside the SGT calendar year', () => {
      // One millisecond before 00:00 SGT on Jan 1, 2027 (== 16:00 UTC Dec 31, 2026)
      expect(endOfSgtYearIso(2026)).toBe('2026-12-31T15:59:59.999Z')
    })

    it('a timestamp at endOfSgtYearIso is still in that year', () => {
      const eoy = endOfSgtYearIso(2026)
      expect(bucketYearForTimestamp(eoy)).toBe(2026)
    })
  })
})

describe('year-buckets engine mirror drift detection', () => {
  it('SGT_OFFSET_MINUTES constants are identical', () => {
    expect(ENGINE_SGT_OFFSET_MINUTES).toBe(SGT_OFFSET_MINUTES)
  })

  it('getSgYearBoundary matches across surfaces for a sample of years', () => {
    for (const year of [2020, 2024, 2026, 2030, 2099]) {
      expect(engineGetSgYearBoundary(year)).toBe(getSgYearBoundary(year))
    }
  })

  it('bucketYearForTimestamp matches across surfaces for a sample of inputs', () => {
    const cases = [
      '2026-01-01T00:00:00+08:00',
      '2026-06-15T03:00:00Z',
      '2026-12-31T23:30:00+08:00',
      '2027-01-01T00:30:00+08:00',
      '2026-12-31T17:00:00Z',
    ]
    for (const iso of cases) {
      expect(engineBucketYearForTimestamp(iso)).toBe(bucketYearForTimestamp(iso))
    }
  })

  it('yearsCoveringActivity matches across surfaces', () => {
    const timestamps = ['2024-05-01T00:00:00Z', '2026-02-01T00:00:00Z', '2025-08-01T00:00:00Z']
    expect(engineYearsCoveringActivity(timestamps)).toEqual(yearsCoveringActivity(timestamps))
  })

  it('yearRangeSgt matches across surfaces', () => {
    for (const year of [2025, 2026, 2027]) {
      expect(engineYearRangeSgt(year)).toEqual(yearRangeSgt(year))
    }
  })

  it('endOfSgtYearIso matches across surfaces', () => {
    for (const year of [2025, 2026, 2030]) {
      expect(engineEndOfSgtYearIso(year)).toBe(endOfSgtYearIso(year))
    }
  })
})
