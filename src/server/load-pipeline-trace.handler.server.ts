/**
 * Developer-only pipeline trace. Joins the full agent pipeline for a
 * single student across:
 *
 *   mirror_entries  → vips_proposed_diffs (verifier audit) → vips_timeline_entries (committed claims)
 *                                       ↓
 *                              vips_pages (current compiled truth, per dimension)
 *                                       ↓
 *                              cartographer_outputs (latest Trajectory)
 *
 * One row per mirror entry; diffs and committed timeline rows nested
 * inside. Rendered by `/dev/pipeline`. Uses the same `requireCounselorContext`
 * + `withStudent` envelope as the production handlers so RLS still applies.
 */

import { requireCounselorContext } from '~/auth/identity'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { withStudent } from '~/db/client'
import {
  type CartographerOutputRow,
  latestCartographerOutput,
  listMirrorEntries,
  listVipsPages,
  listVipsProposedDiffs,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsProposedDiffRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'

export interface PipelineMirrorRow {
  id: number
  created_at: string
  context_type: string
  review_status: string
  transcript: string
  validation: string
  inferred_meaning: string
  story_reframe: string
  diffs: VipsProposedDiffRow[]
  committed_timeline: VipsTimelineEntryRow[]
}

export interface PipelineTraceResult {
  activeStudentId: string
  mirrors: PipelineMirrorRow[]
  pages: VipsPageRow[]
  cartographer: CartographerOutputRow | null
  totals: {
    mirrors: number
    diffs: number
    committed_timeline: number
  }
}

export async function loadPipelineTraceHandler(): Promise<PipelineTraceResult> {
  const { studentId } = await requireCounselorContext()

  return withStudent(studentId, async (ctx) => {
    const [mirrors, diffs, pages, cartographer, ...timelinePerDim] = await Promise.all([
      listMirrorEntries(studentId, { ctx, limit: 200, includeForgotten: true }),
      listVipsProposedDiffs(studentId, { ctx }),
      listVipsPages(studentId, { ctx }),
      latestCartographerOutput(studentId, { ctx }),
      ...VIPS_DIMENSIONS.map((d) =>
        listVipsTimelineEntries(studentId, d, { ctx, includeForgotten: true }),
      ),
    ])

    const timeline = timelinePerDim.flat() as VipsTimelineEntryRow[]

    const diffsByMirror = new Map<number, VipsProposedDiffRow[]>()
    for (const d of diffs) {
      const list = diffsByMirror.get(d.mirror_entry_id) ?? []
      list.push(d)
      diffsByMirror.set(d.mirror_entry_id, list)
    }

    const timelineByReflection = new Map<number, VipsTimelineEntryRow[]>()
    for (const t of timeline) {
      if (t.reflection_id == null) continue
      const list = timelineByReflection.get(t.reflection_id) ?? []
      list.push(t)
      timelineByReflection.set(t.reflection_id, list)
    }

    const trace: PipelineMirrorRow[] = mirrors.map((m) => ({
      id: m.id,
      created_at: m.created_at,
      context_type: m.context_type,
      review_status: m.review_status,
      transcript: m.transcript,
      validation: m.validation,
      inferred_meaning: m.inferred_meaning,
      story_reframe: m.story_reframe,
      diffs: diffsByMirror.get(m.id) ?? [],
      committed_timeline: timelineByReflection.get(m.id) ?? [],
    }))

    const result: PipelineTraceResult = {
      activeStudentId: studentId,
      mirrors: trace,
      pages,
      cartographer,
      totals: {
        mirrors: mirrors.length,
        diffs: diffs.length,
        committed_timeline: timeline.length,
      },
    }
    return result
  })
}

// Re-export VipsDimension so route consumers don't have to know about taxonomy
// internals.
export type { VipsDimension }
