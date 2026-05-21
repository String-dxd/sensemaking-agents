/**
 * Engine mirror of src/lib/year-buckets.ts.
 *
 * The TypeScript module at src/lib/year-buckets.ts is the semantic source of
 * truth. This file hand-mirrors the constants and the pure functions the
 * engine substrate needs (year-bucket math) into a plain ES module so the
 * engine can stay vanilla JS per the engine-substrate doctrine
 * (docs/solutions/2026-05-18-island-progression-engine-substrate.md).
 *
 * Kept in sync by test/lib/year-buckets.test.ts — deep-equals the exported
 * constants and spot-checks a handful of outputs across the two
 * implementations. If you edit the TS source, mirror the change here (or vice
 * versa) — CI fails on drift.
 *
 * Do NOT import this from React/TS code — TS imports from ~/lib/year-buckets
 * directly. Do NOT import the TS file from engine code — keep the engine free
 * of TypeScript build coupling.
 */

export const SGT_OFFSET_MINUTES = 8 * 60

export function getSgYearBoundary(year)
{
    const sgtMs = Date.UTC(year, 0, 1, 0, 0, 0, 0)
    const utcMs = sgtMs - SGT_OFFSET_MINUTES * 60 * 1000
    return new Date(utcMs).toISOString()
}

export function bucketYearForTimestamp(iso)
{
    const ms = Date.parse(iso)
    if(Number.isNaN(ms))
    {
        throw new TypeError(`bucketYearForTimestamp: invalid ISO timestamp "${iso}"`)
    }
    const sgtMs = ms + SGT_OFFSET_MINUTES * 60 * 1000
    return new Date(sgtMs).getUTCFullYear()
}

export function yearsCoveringActivity(timestamps)
{
    const years = new Set()
    for(const ts of timestamps)
    {
        years.add(bucketYearForTimestamp(ts))
    }
    return Array.from(years).sort((a, b) => a - b)
}

export function yearRangeSgt(year)
{
    return {
        startIso: getSgYearBoundary(year),
        endIso:   getSgYearBoundary(year + 1),
    }
}

export function endOfSgtYearIso(year)
{
    const nextStartMs = Date.parse(getSgYearBoundary(year + 1))
    return new Date(nextStartMs - 1).toISOString()
}
