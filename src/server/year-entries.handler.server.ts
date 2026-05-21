/**
 * Per-year drill-down feed for the History → Growth tab.
 *
 * Returns the underlying entries behind the four summary stats so the UI can
 * expand each stat row into a list of items. Single round-trip per year:
 *
 *   - `reflections`   — mirror_entries rows whose created_at lies in the year
 *   - `crystallised`  — vips_timeline_entries with committed_at in the year
 *   - `forgotten`     — vips_timeline_entries with forgotten_at in the year
 *   - `dimensionCounts` — { values, interests, personality, skills } counts
 *                         (crystallised this year), powering the dominant-
 *                         dimension mini-chart.
 *
 * Each list is hard-capped at 100 rows server-side to bound payload size; the
 * UI shows a "View N more" anchor when truncated (anchor itself is a stub for
 * now). Year buckets are SGT calendar years — same boundary helper the
 * summary handler uses (yearRangeSgt).
 *
 * Returns a discriminated union — `kind: 'ok'` with entries, or
 * `kind: 'no_data'` when all three lists are empty.
 */

import { sql } from 'drizzle-orm'

import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import { yearRangeSgt } from '~/lib/year-buckets'

import { type YearEntriesInput, yearEntriesInputSchema } from './function-schemas'

export type ProfileDimension = 'values' | 'interests' | 'personality' | 'skills'
export type ClaimStrength = 'low' | 'medium' | 'high'
export type ReflectionContext = 'school' | 'family' | 'peer' | 'hobby' | 'civic'

export type ReflectionEntry = {
  id: number
  createdAt: string
  contextType: ReflectionContext
  transcript: string
  storyReframe: string
}

export type ClaimEntry = {
  id: number
  dimension: ProfileDimension
  verbatimQuote: string
  strength: ClaimStrength
  committedAt: string
  forgottenAt: string | null
}

export type DimensionCounts = Record<ProfileDimension, number>

export type YearEntriesResult =
  | {
      kind: 'ok'
      year: number
      reflections: ReflectionEntry[]
      crystallised: ClaimEntry[]
      forgotten: ClaimEntry[]
      dimensionCounts: DimensionCounts
      reflectionsTotal: number
      crystallisedTotal: number
      forgottenTotal: number
    }
  | { kind: 'no_data'; year: number }

const LIST_CAP = 100

type ReflectionRow = {
  id: number | string
  created_at: string
  context_type: string
  transcript: string
  story_reframe: string
}

type ClaimRow = {
  id: number | string
  dimension: string
  verbatim_quote: string
  strength: string
  committed_at: string
  forgotten_at: string | null
}

type CountRow = { count: string | number }
type DimensionCountRow = { dimension: string; count: string | number }

function toId(raw: number | string): number {
  return typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
}

function toCount(row: CountRow | undefined): number {
  if (!row) return 0
  return typeof row.count === 'string' ? Number.parseInt(row.count, 10) : row.count
}

function emptyDimensionCounts(): DimensionCounts {
  return { values: 0, interests: 0, personality: 0, skills: 0 }
}

export async function getYearEntriesHandler(data: YearEntriesInput): Promise<YearEntriesResult> {
  yearEntriesInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  if (!studentId) return { kind: 'no_data', year: data.year }

  const { startIso, endIso } = yearRangeSgt(data.year)

  return withStudent(studentId, async (ctx) => {
    const reflectionsResult = await ctx.db.execute<ReflectionRow>(sql`
      select id, created_at, context_type, transcript, story_reframe
      from mirror_entries
      where created_at >= ${startIso} and created_at < ${endIso}
      order by created_at desc
      limit ${LIST_CAP}
    `)
    const reflectionsCountRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from mirror_entries
      where created_at >= ${startIso} and created_at < ${endIso}
    `)

    const crystallisedResult = await ctx.db.execute<ClaimRow>(sql`
      select id, dimension, verbatim_quote, strength, committed_at, forgotten_at
      from vips_timeline_entries
      where committed_at >= ${startIso} and committed_at < ${endIso}
      order by committed_at desc
      limit ${LIST_CAP}
    `)
    const crystallisedCountRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from vips_timeline_entries
      where committed_at >= ${startIso} and committed_at < ${endIso}
    `)

    const forgottenResult = await ctx.db.execute<ClaimRow>(sql`
      select id, dimension, verbatim_quote, strength, committed_at, forgotten_at
      from vips_timeline_entries
      where forgotten_at >= ${startIso} and forgotten_at < ${endIso}
      order by forgotten_at desc
      limit ${LIST_CAP}
    `)
    const forgottenCountRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from vips_timeline_entries
      where forgotten_at >= ${startIso} and forgotten_at < ${endIso}
    `)

    const dimensionCountRows = await ctx.db.execute<DimensionCountRow>(sql`
      select dimension, count(*)::int as count from vips_timeline_entries
      where committed_at >= ${startIso} and committed_at < ${endIso}
      group by dimension
    `)

    const reflectionsTotal = toCount(reflectionsCountRow.rows[0])
    const crystallisedTotal = toCount(crystallisedCountRow.rows[0])
    const forgottenTotal = toCount(forgottenCountRow.rows[0])

    if (reflectionsTotal === 0 && crystallisedTotal === 0 && forgottenTotal === 0) {
      return { kind: 'no_data' as const, year: data.year }
    }

    const dimensionCounts = emptyDimensionCounts()
    for (const row of dimensionCountRows.rows as DimensionCountRow[]) {
      const dim = row.dimension as ProfileDimension
      if (dim in dimensionCounts) {
        dimensionCounts[dim] =
          typeof row.count === 'string' ? Number.parseInt(row.count, 10) : row.count
      }
    }

    return {
      kind: 'ok' as const,
      year: data.year,
      reflections: (reflectionsResult.rows as ReflectionRow[]).map((r) => ({
        id: toId(r.id),
        createdAt: r.created_at,
        contextType: r.context_type as ReflectionContext,
        transcript: r.transcript,
        storyReframe: r.story_reframe,
      })),
      crystallised: (crystallisedResult.rows as ClaimRow[]).map((r) => ({
        id: toId(r.id),
        dimension: r.dimension as ProfileDimension,
        verbatimQuote: r.verbatim_quote,
        strength: r.strength as ClaimStrength,
        committedAt: r.committed_at,
        forgottenAt: r.forgotten_at,
      })),
      forgotten: (forgottenResult.rows as ClaimRow[]).map((r) => ({
        id: toId(r.id),
        dimension: r.dimension as ProfileDimension,
        verbatimQuote: r.verbatim_quote,
        strength: r.strength as ClaimStrength,
        committedAt: r.committed_at,
        forgottenAt: r.forgotten_at,
      })),
      dimensionCounts,
      reflectionsTotal,
      crystallisedTotal,
      forgottenTotal,
    }
  })
}
