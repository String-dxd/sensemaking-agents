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
  // production unless `ENABLE_DEV_PIPELINE=1` is explicitly set — the
  // Vercel staging deploy sets the flag so QA can audit traces; real
  // production builds without the flag keep the gate closed until a proper
  // counsellor-role gate exists upstream. `requireCounselorContext` still
  // enforces an authenticated session in either case.
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_PIPELINE !== '1') {
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

    const timeline: VipsTimelineEntryRow[] = []
    for (const dim of VIPS_DIMENSIONS) {
      try {
        timeline.push(
          ...(await listVipsTimelineEntries(studentId, dim, {
            ctx,
            includeForgotten: true,
            limit: 200,
          })),
        )
      } catch (err) {
        console.warn(`[pipeline-trace] dimension "${dim}" query failed; rendering empty`, err)
      }
    }

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
