/**
 * Calendar-day bucketing for SenseMake.
 *
 * Product decision: the calendar is anchored to Asia/Singapore (the school
 * timezone), regardless of the viewer's device timezone. A reflection
 * belongs to the school day it happened on in Singapore.
 *
 * `sgDateKey` and `sgToday` are mirrored by
 * src/engine/student-space/Game/entry-date.constants.js for use from the
 * engine substrate (which stays vanilla JS per the engine-substrate doctrine:
 * docs/solutions/2026-05-18-island-progression-engine-substrate.md). This
 * module is the semantic source of truth; the two are kept in sync by
 * test/lib/entry-date.test.ts, which cross-checks both implementations across
 * the SGT day boundary and fails on drift.
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

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface SgDayKeyParts {
  year: number
  /** 0-indexed, matching Date.prototype.getMonth(). */
  month0: number
  day: number
  /** 0 = Sunday, matching Date.prototype.getDay(). */
  weekday: number
}

/**
 * Format a Y/M/D triple as a day key via UTC slots.
 *
 * Day-key arithmetic is done as UTC-midnight instants: Singapore is a
 * fixed-offset zone with no DST, so calendar arithmetic on SGT days is
 * identical to UTC calendar arithmetic. This relies on `Date.UTC` overflow
 * normalisation (day 0 → last day of the previous month) exactly as the old
 * `new Date(year, month0, 1 + (i - startOffset))` relied on the local
 * equivalent — but without ever consulting the device clock.
 */
function toDayKey(year: number, month0: number, day: number): string {
  const date = new Date(Date.UTC(year, month0, day))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Split a YYYY-MM-DD day key into parts without consulting the device clock.
 * Use this instead of `new Date(y, m, d)` anywhere a day key must be rendered:
 * rebuilding a local Date from a key re-introduces the device timezone and makes
 * the label disagree with the key.
 */
export function sgDayKeyParts(dayKey: string | null | undefined): SgDayKeyParts | null {
  if (!dayKey) return null
  const match = DAY_KEY_RE.exec(dayKey)
  if (!match) return null
  const year = Number(match[1])
  const month0 = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month0, day))
  // Round-trip so impossible dates (2026-02-30 normalises into March) are
  // rejected rather than silently shifted.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month0 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month0, day, weekday: date.getUTCDay() }
}

/** Day key `days` after `dayKey` (negative moves back). Null on bad input. */
export function addSgDays(dayKey: string, days: number): string | null {
  const parts = sgDayKeyParts(dayKey)
  if (!parts) return null
  return toDayKey(parts.year, parts.month0, parts.day + days)
}

/** The 7 day keys (Sunday → Saturday) of the week containing `dayKey`. */
export function sgWeekKeys(dayKey: string): string[] {
  const parts = sgDayKeyParts(dayKey)
  if (!parts) return []
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    keys.push(toDayKey(parts.year, parts.month0, parts.day - parts.weekday + i))
  }
  return keys
}

/**
 * The 42 day keys of the 6×7 month grid for `year`/`month0`, starting on the
 * Sunday at or before the 1st. Leading/trailing keys belong to adjacent months.
 */
export function sgMonthGridKeys(year: number, month0: number): string[] {
  const startOffset = new Date(Date.UTC(year, month0, 1)).getUTCDay()
  const keys: string[] = []
  for (let i = 0; i < 42; i++) {
    keys.push(toDayKey(year, month0, 1 + (i - startOffset)))
  }
  return keys
}
