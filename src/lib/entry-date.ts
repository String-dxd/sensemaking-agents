/**
 * Calendar-day bucketing for SenseMake.
 *
 * Product decision: the calendar is anchored to Asia/Singapore (the school
 * timezone), regardless of the viewer's device timezone. A reflection
 * belongs to the school day it happened on in Singapore.
 */
const SG_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD in Asia/Singapore, or null when `value` is missing/invalid. */
export function sgDateKey(value: string | Date | undefined | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return SG_DATE.format(date)
}

/** Today's YYYY-MM-DD in Asia/Singapore. */
export function sgToday(): string {
  return SG_DATE.format(new Date())
}
