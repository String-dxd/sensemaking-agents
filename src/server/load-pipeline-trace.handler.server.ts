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
import { VIPS_DIMENSIONS } from '~/data/vips-taxonomy'
import { withStudent } from '~/db/client'
import {
  latestCartographerOutput,
  listMirrorEntries,
  listVipsPages,
  listVipsProposedDiffs,
  listVipsTimelineEntries,
  type VipsProposedDiffRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import type { PipelineMirrorRow, PipelineTraceResult } from './load-pipeline-trace.types'

export async function loadPipelineTraceHandler(): Promise<PipelineTraceResult> {
  // Defence in depth: the `/dev/pipeline` route already 404s in production,
  // but the server function is a separate seam (it could be called from
  // anywhere a server function call is reachable). Refuse to run in
  // production until a counsellor-role gate exists upstream.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('loadPipelineTrace is dev-only')
  }
  const { studentId } = await requireCounselorContext()

  return withStudent(studentId, async (ctx) => {
    // pg@9 deprecates `Promise.all(db.execute(...))` patterns inside one
    // transaction — sequential awaits match the canonical pattern in
    // `load-vips-pages.handler.server.ts` and keep this handler ready for
    // the upgrade.
    const mirrors = await listMirrorEntries(studentId, {
      ctx,
      limit: 200,
      includeForgotten: true,
    })
    // Cap diffs / per-dimension timeline volume so a student with a long
    // history doesn't slow the dev pipeline view to a crawl. Hard limits
    // are intentionally generous (500 diffs, 200 per dimension) so the
    // common case still renders complete data; the cap exists for the
    // pathological case, not the median one.
    const diffs = await listVipsProposedDiffs(studentId, { ctx, limit: 500 })
    const pages = await listVipsPages(studentId, { ctx })
    const cartographer = await latestCartographerOutput(studentId, { ctx })

    // The dimension fan-out stays parallel: it is a single-shape map of
    // independent reads, not the mixed-shape pattern pg@9 warns about.
    // `allSettled` (not `all`) so a single failing dimension query degrades
    // to an empty list for that dimension instead of aborting the whole
    // trace — this is the dev pipeline view; a partial render with one
    // dimension missing is strictly more useful than a 500.
    const timelinePerDim = await Promise.allSettled(
      VIPS_DIMENSIONS.map((d) =>
        listVipsTimelineEntries(studentId, d, { ctx, includeForgotten: true, limit: 200 }),
      ),
    )
    const timeline: VipsTimelineEntryRow[] = timelinePerDim.flatMap((result, i) => {
      if (result.status === 'fulfilled') return result.value
      console.warn(
        `[pipeline-trace] dimension "${VIPS_DIMENSIONS[i]}" query failed; rendering empty`,
        result.reason,
      )
      return []
    })

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
