/**
 * Lightweight chronological feed of the student's voice reflections, used
 * by the History sheet's Timeline tab.
 *
 * Same auth + RLS posture as growth-summary: `withStudent` enforces scope,
 * counselor + demo / dev-bypass sessions are accepted as readers (writes
 * are the only thing gated). Reads `mirror_entries` directly — no other
 * tables touched.
 */

import { sql } from 'drizzle-orm'

import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'

export type GrowthTimelineEntry = {
  id: number
  storyReframe: string
  contextType: string | null
  createdAt: string
}

export type GrowthTimelineResult =
  | { kind: 'ok'; entries: GrowthTimelineEntry[] }
  | { kind: 'empty' }

type TimelineRow = {
  id: number
  story_reframe: string | null
  context_type: string | null
  created_at: string
} & Record<string, unknown>

export async function getGrowthTimelineHandler(): Promise<GrowthTimelineResult> {
  const { studentId } = await requireCounselorContext()
  if (!studentId) return { kind: 'empty' }

  return withStudent(studentId, async (ctx) => {
    const result = await ctx.db.execute<TimelineRow>(sql`
      select id, story_reframe, context_type, created_at
      from mirror_entries
      order by created_at desc
      limit 50
    `)
    if (result.rows.length === 0) return { kind: 'empty' as const }
    const entries: GrowthTimelineEntry[] = result.rows.map((row) => ({
      id: row.id,
      storyReframe: row.story_reframe ?? '',
      contextType: row.context_type,
      createdAt: row.created_at,
    }))
    return { kind: 'ok' as const, entries }
  })
}
