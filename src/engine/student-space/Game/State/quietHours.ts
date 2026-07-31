export const STUDENT_QUIET_HOUR_START = 22
export const STUDENT_QUIET_HOUR_END = 6

/**
 * My World uses the browser's local hour. The interval crosses midnight:
 * 22:00 is quiet, 06:00 is daytime again.
 */
export function isStudentQuietHour(hour: number): boolean {
  if (!Number.isFinite(hour)) return false
  const normalisedHour = ((hour % 24) + 24) % 24
  return normalisedHour >= STUDENT_QUIET_HOUR_START || normalisedHour < STUDENT_QUIET_HOUR_END
}
