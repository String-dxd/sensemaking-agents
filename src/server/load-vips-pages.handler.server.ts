/**
 * U9 — Load the four VIPS pages + non-forgotten timeline entries for a
 * student. Powers both the `/wiki` overview (4-card grid + run-sensemaking
 * gate logic) and `/wiki/$dimension` (per-dimension page body).
 *
 * Wrapped in `withStudent` so all reads are tenant-scoped.
 *
 * R20 boundary: the response intentionally does NOT include
 * `vips_forget_count`. The counter is incremented server-side by
 * `forgetVipsTimelineEntry` but is recorded-not-surfaced in v0.2 — agents
 * and clients learn about it through neither this fn nor the wiki UI.
 */
import { z } from 'zod'
import type { VipsDimension } from '~/data/vips-taxonomy'
import {
  listVipsPages,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

export const loadVipsPagesInputSchema = z.object({
  studentId: z.string().min(1),
})

export type LoadVipsPagesInput = z.output<typeof loadVipsPagesInputSchema>

export const VIPS_DIMENSIONS: readonly VipsDimension[] = [
  'values',
  'interests',
  'personality',
  'skills',
] as const

export interface LoadVipsPagesResult {
  /**
   * Four rows in canonical dimension order (values, interests, personality,
   * skills). Dimensions without an upserted `vips_pages` row are returned
   * as a stub with empty `compiled_truth` + `open_question` so the overview
   * can render four cards uniformly.
   */
  pages: VipsPageRow[]
  /** Non-forgotten timeline entries, keyed by dimension (newest first). */
  timeline_by_dimension: Record<VipsDimension, VipsTimelineEntryRow[]>
  /** Count of non-forgotten timeline entries per dimension. */
  claim_count_by_dimension: Record<VipsDimension, number>
  /** Sum of `claim_count_by_dimension` — drives the 3-entry gate replacement (R24). */
  total_claim_count: number
}

export function loadVipsPagesHandler(data: LoadVipsPagesInput): LoadVipsPagesResult {
  const parsed = loadVipsPagesInputSchema.parse(data)
  return withStudent(parsed.studentId, (sid) => {
    const rawPages = listVipsPages(sid)
    const pagesByDimension = new Map<string, VipsPageRow>(rawPages.map((p) => [p.dimension, p]))

    // Render the four dimensions in canonical order. A dimension without an
    // upserted page row returns a stub so the overview grid is always 4
    // cards; the empty-state copy lives in the view (R3: read-only).
    const pages: VipsPageRow[] = VIPS_DIMENSIONS.map(
      (dim): VipsPageRow =>
        pagesByDimension.get(dim) ?? {
          student_id: sid,
          dimension: dim,
          compiled_truth: '',
          open_question: '',
          updated_at: '',
        },
    )

    const timeline_by_dimension = {} as Record<VipsDimension, VipsTimelineEntryRow[]>
    const claim_count_by_dimension = {} as Record<VipsDimension, number>
    let total = 0
    for (const dim of VIPS_DIMENSIONS) {
      // `listVipsTimelineEntries` excludes forgotten rows by default — this
      // is the R19 "forgotten entries excluded from sense-making context"
      // boundary on the read side. The compatible call site for an admin
      // view would pass `{includeForgotten: true}`; we never do that here.
      const entries = listVipsTimelineEntries(sid, dim)
      timeline_by_dimension[dim] = entries
      claim_count_by_dimension[dim] = entries.length
      total += entries.length
    }

    return {
      pages,
      timeline_by_dimension,
      claim_count_by_dimension,
      total_claim_count: total,
    }
  })
}
