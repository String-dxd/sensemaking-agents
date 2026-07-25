/**
 * Engine mirror of src/lib/entry-date.ts.
 *
 * The TypeScript module at src/lib/entry-date.ts is the semantic source of
 * truth. This file hand-mirrors the two functions the engine substrate needs
 * ("what day is it in Singapore?") into a plain ES module so the engine can
 * stay vanilla JS per the engine-substrate doctrine
 * (docs/solutions/2026-05-18-island-progression-engine-substrate.md).
 *
 * Kept in sync by test/lib/entry-date.test.ts — cross-checks both
 * implementations across the SGT day boundary. If you edit the TS source,
 * mirror the change here (or vice versa) — CI fails on drift.
 *
 * Do NOT import this from React/TS code — TS imports from ~/lib/entry-date
 * directly. Do NOT import the TS file from engine code — keep the engine free
 * of TypeScript build coupling.
 */

const SG_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
})

/** YYYY-MM-DD in Asia/Singapore, or null when `value` is missing/invalid. */
export function sgDateKey(value)
{
    if(!value) return null
    const date = value instanceof Date ? value : new Date(value)
    if(Number.isNaN(date.getTime())) return null
    return SG_DATE.format(date)
}

/** Today's YYYY-MM-DD in Asia/Singapore. */
export function sgToday()
{
    return SG_DATE.format(new Date())
}
