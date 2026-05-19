/**
 * Year-bucket growth summary for the calling student.
 *
 * Sources counts EXCLUSIVELY from server-authoritative tables:
 *   - mirror_entries.created_at        → voice-reflection count
 *   - vips_timeline_entries.committed_at → claim crystallisations + dominant
 *                                          dimension + dimension shift
 *   - vips_timeline_entries.forgotten_at → claim forgets
 *
 * Engine-local Captures.entries[] (photo / ask / trajectory) is intentionally
 * excluded — it has no server-authoritative history, and surfacing its count
 * would produce numbers that vary by device and reset on local-storage wipe.
 * The product copy uses "voice reflections", not "captures", to match.
 *
 * Returns a discriminated union — `kind: 'ok'` with stats, or
 * `kind: 'no_data'` when the bucket is empty. The UI uses the discriminator
 * to choose between the summary card and the empty state.
 *
 * Year buckets are calendar years in Asia/Singapore (Jan 1 SGT boundary).
 * See src/lib/year-buckets.ts for the boundary math.
 */

import { sql } from 'drizzle-orm'

import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import { yearRangeSgt } from '~/lib/year-buckets'

import { type GrowthSummaryInput, growthSummaryInputSchema } from './function-schemas'

export type ProfileDimension = 'values' | 'interests' | 'personality' | 'skills'

export type GrowthSummaryResult =
  | {
      kind: 'ok'
      year: number
      voiceReflections: number
      claimsCrystallised: number
      claimsForgotten: number
      dominantDimension: ProfileDimension | null
      dimensionShift: { from: ProfileDimension; to: ProfileDimension } | null
      narrative: string
      isFirstYear: boolean
    }
  | { kind: 'no_data'; year: number }

type DimensionCountRow = {
  dimension: ProfileDimension
  count: string | number
} & Record<string, unknown>

type CountRow = { count: string | number } & Record<string, unknown>

function readCount(row: CountRow | undefined): number {
  if (!row) return 0
  const raw = row.count
  return typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
}

/**
 * Pick the highest-count dimension. Returns null on tie or empty input —
 * the UI surfaces tie as "no dominant dimension this year".
 */
function pickDominant(rows: DimensionCountRow[]): ProfileDimension | null {
  if (rows.length === 0) return null
  let topCount = -1
  let topDimension: ProfileDimension | null = null
  let tied = false
  for (const row of rows) {
    const count = typeof row.count === 'string' ? Number.parseInt(row.count, 10) : row.count
    if (count > topCount) {
      topCount = count
      topDimension = row.dimension
      tied = false
    } else if (count === topCount) {
      tied = true
    }
  }
  return tied ? null : topDimension
}

const DIMENSION_LABEL: Record<ProfileDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

function buildNarrative(input: {
  isFirstYear: boolean
  voiceReflections: number
  claimsCrystallised: number
  claimsForgotten: number
  dominantDimension: ProfileDimension | null
  dimensionShift: { from: ProfileDimension; to: ProfileDimension } | null
  priorYearReflections: number
  priorYearClaims: number
}): string {
  if (input.isFirstYear) {
    if (input.voiceReflections === 0 && input.claimsCrystallised === 0) {
      return 'A quiet first year — the island is just getting started.'
    }
    if (input.dominantDimension) {
      return `Your first year. ${DIMENSION_LABEL[input.dominantDimension]} stood out as the dimension you returned to most.`
    }
    return 'Your first year on SenseMake.'
  }

  if (input.dimensionShift) {
    return `${DIMENSION_LABEL[input.dimensionShift.from]} carried last year; ${DIMENSION_LABEL[input.dimensionShift.to]} carried this one.`
  }

  if (input.claimsForgotten > input.claimsCrystallised && input.claimsCrystallised > 0) {
    return 'A year of letting things go — more claims forgotten than crystallised.'
  }

  if (input.voiceReflections === 0 && input.claimsCrystallised === 0) {
    return 'A quiet year on the island.'
  }

  if (
    input.voiceReflections > input.priorYearReflections &&
    input.claimsCrystallised > input.priorYearClaims
  ) {
    return 'A year of acceleration — more reflections and more crystallisations than the year before.'
  }

  if (input.dominantDimension) {
    return `${DIMENSION_LABEL[input.dominantDimension]} carried the year.`
  }

  return 'Another year on the island.'
}

export async function getGrowthSummaryHandler(
  data: GrowthSummaryInput,
): Promise<GrowthSummaryResult> {
  growthSummaryInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  if (!studentId) return { kind: 'no_data', year: data.year }

  const { startIso, endIso } = yearRangeSgt(data.year)
  const prior = yearRangeSgt(data.year - 1)

  return withStudent(studentId, async (ctx) => {
    // Voice-reflection counts — current and prior year (prior used by the
    // dimension-shift compare and the "year of acceleration" narrative).
    const voiceRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from mirror_entries
      where created_at >= ${startIso} and created_at < ${endIso}
    `)
    const priorVoiceRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from mirror_entries
      where created_at >= ${prior.startIso} and created_at < ${prior.endIso}
    `)
    const voiceReflections = readCount(voiceRow.rows[0])
    const priorYearReflections = readCount(priorVoiceRow.rows[0])

    // Claim crystallisations — committed_at in current bucket, regardless
    // of forgotten state (forgets are counted separately below).
    const crystRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from vips_timeline_entries
      where committed_at >= ${startIso} and committed_at < ${endIso}
    `)
    const priorCrystRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from vips_timeline_entries
      where committed_at >= ${prior.startIso} and committed_at < ${prior.endIso}
    `)
    const claimsCrystallised = readCount(crystRow.rows[0])
    const priorYearClaims = readCount(priorCrystRow.rows[0])

    // Claim forgets — forgotten_at in current bucket. A claim can be
    // crystallised one year and forgotten in a later year; both events
    // count toward their respective buckets.
    const forgottenRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from vips_timeline_entries
      where forgotten_at >= ${startIso} and forgotten_at < ${endIso}
    `)
    const claimsForgotten = readCount(forgottenRow.rows[0])

    // Empty-year short-circuit.
    if (voiceReflections === 0 && claimsCrystallised === 0 && claimsForgotten === 0) {
      return { kind: 'no_data' as const, year: data.year }
    }

    // Dominant-dimension counts (by claim crystallisation, current year).
    const dominantRows = await ctx.db.execute<DimensionCountRow>(sql`
      select dimension, count(*)::int as count from vips_timeline_entries
      where committed_at >= ${startIso} and committed_at < ${endIso}
      group by dimension
    `)
    const priorDominantRows = await ctx.db.execute<DimensionCountRow>(sql`
      select dimension, count(*)::int as count from vips_timeline_entries
      where committed_at >= ${prior.startIso} and committed_at < ${prior.endIso}
      group by dimension
    `)
    const dominantDimension = pickDominant(dominantRows.rows as DimensionCountRow[])
    const priorDominant = pickDominant(priorDominantRows.rows as DimensionCountRow[])

    // Is this the student's first year of activity? Look back for any
    // mirror_entries or vips_timeline_entries before the current year's
    // start; if none, this is their first year on the platform.
    const earlierRow = await ctx.db.execute<CountRow>(sql`
      select (
        select count(*) from mirror_entries where created_at < ${startIso}
      ) + (
        select count(*) from vips_timeline_entries where committed_at < ${startIso}
      )::int as count
    `)
    const isFirstYear = readCount(earlierRow.rows[0]) === 0

    const dimensionShift =
      !isFirstYear && priorDominant && dominantDimension && priorDominant !== dominantDimension
        ? { from: priorDominant, to: dominantDimension }
        : null

    const narrative = buildNarrative({
      isFirstYear,
      voiceReflections,
      claimsCrystallised,
      claimsForgotten,
      dominantDimension,
      dimensionShift,
      priorYearReflections,
      priorYearClaims,
    })

    return {
      kind: 'ok' as const,
      year: data.year,
      voiceReflections,
      claimsCrystallised,
      claimsForgotten,
      dominantDimension,
      dimensionShift,
      narrative,
      isFirstYear,
    }
  })
}
