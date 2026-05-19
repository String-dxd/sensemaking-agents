/**
 * Year-bucketing helpers for the year-over-year growth monitoring feature.
 *
 * Year buckets are calendar years in Asia/Singapore (UTC+8). The boundary is
 * 00:00 SGT on January 1. This matches the Singapore Primary 1/2/3... cohort
 * convention used in schools — Year N in the growth UI maps cleanly to a
 * student's Primary N year when they are in school during that calendar year.
 *
 * Mirrored by src/engine/student-space/Game/year-buckets.constants.js for use
 * from the engine substrate (which stays vanilla JS per the engine-substrate
 * doctrine: docs/solutions/2026-05-18-island-progression-engine-substrate.md).
 * Kept in sync by test/lib/year-buckets.test.ts which deep-equals exported
 * constants and spot-checks a few outputs across the two implementations.
 */

export const SGT_OFFSET_MINUTES = 8 * 60

/**
 * Returns the start-of-year-boundary as an ISO string (UTC representation of
 * `00:00 SGT on January 1 of `year`). This is the moment the year *begins*;
 * the year *ends* at the same moment for `year + 1`.
 *
 * Use for `created_at >= start AND created_at < nextYearStart` SQL ranges.
 */
export function getSgYearBoundary(year: number): string {
  // 00:00 SGT == 16:00 UTC on Dec 31 of the prior day.
  // We construct the moment in UTC by subtracting the SGT offset from the
  // SGT clock face, then format as ISO.
  const sgtMs = Date.UTC(year, 0, 1, 0, 0, 0, 0)
  const utcMs = sgtMs - SGT_OFFSET_MINUTES * 60 * 1000
  return new Date(utcMs).toISOString()
}

/**
 * Returns the year *containing* the given timestamp in Asia/Singapore.
 *
 * Examples:
 *   bucketYearForTimestamp('2026-12-31T23:30:00+08:00') → 2026
 *   bucketYearForTimestamp('2027-01-01T00:30:00+08:00') → 2027
 *   bucketYearForTimestamp('2026-12-31T17:00:00Z')     → 2027  (= 01:00 SGT on Jan 1)
 */
export function bucketYearForTimestamp(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    throw new TypeError(`bucketYearForTimestamp: invalid ISO timestamp "${iso}"`)
  }
  // Shift to SGT clock face, then read the year off the UTC slots of the
  // shifted timestamp. (Date.UTC + getUTCFullYear avoids host-timezone leak.)
  const sgtMs = ms + SGT_OFFSET_MINUTES * 60 * 1000
  return new Date(sgtMs).getUTCFullYear()
}

/**
 * Given an array of ISO timestamps, return the sorted-ascending list of unique
 * SGT calendar years that contain at least one timestamp. Empty input returns
 * an empty array. Useful for "which years should the scrubber show pills for?"
 */
export function yearsCoveringActivity(timestamps: readonly string[]): number[] {
  const years = new Set<number>()
  for (const ts of timestamps) {
    years.add(bucketYearForTimestamp(ts))
  }
  return Array.from(years).sort((a, b) => a - b)
}

/**
 * Returns `{ startIso, endIso }` for the half-open SGT-year range
 * `[Jan 1 SGT year, Jan 1 SGT (year+1))`. Use in SQL: `created_at >= startIso
 * AND created_at < endIso`.
 */
export function yearRangeSgt(year: number): { startIso: string; endIso: string } {
  return {
    startIso: getSgYearBoundary(year),
    endIso: getSgYearBoundary(year + 1),
  }
}

/**
 * Returns the last instant inside the SGT calendar year (Dec 31 23:59:59.999 SGT)
 * as an ISO UTC string. Use this as the `at` parameter for "what did the island
 * look like at the end of year N?" queries — it's the rightmost moment that
 * still falls in the year's bucket.
 */
export function endOfSgtYearIso(year: number): string {
  const nextStartMs = Date.parse(getSgYearBoundary(year + 1))
  return new Date(nextStartMs - 1).toISOString()
}
