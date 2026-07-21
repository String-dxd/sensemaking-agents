/**
 * U9 — Load the four VIPS pages + non-forgotten timeline entries for a
 * student. Powers both the `/wiki` overview (4-card grid + run-sensemaking
 * gate logic) and `/library/$dimension` (per-dimension page body).
 *
 * Wrapped in `withStudent` (from `~/db/client`) so every read shares one
 * Postgres transaction with `app.student_id` bound for RLS.
 *
 * R20 boundary: the response intentionally does NOT include
 * `vips_forget_count`. The counter is incremented server-side by
 * `forgetVipsTimelineEntry` but is recorded-not-surfaced in v0.2 — agents
 * and clients learn about it through neither this fn nor the library UI.
 */

import type { Mood } from '~/agents/tools/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { withStudent } from '~/db/client'
import {
  listMirrorEntries,
  listVipsPages,
  listVipsTimelineEntries,
  type MirrorEntryRow,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import {
  loadStudentSpaceShellData,
  type StudentSpaceShellData,
} from '~/lib/student-space/demo-shell-data.server'
import { loadCounsellorBriefStatusForStudent } from './counsellor-brief.handler.server'
import { type LoadVipsPagesInput, loadVipsPagesInputSchema } from './function-schemas'
import { moodFromMirrorTags } from './mood-tags'

// Re-export for backward compatibility with any in-repo consumers; the
// canonical home is now `~/data/vips-taxonomy`.
export { VIPS_DIMENSIONS }

export interface LoadVipsPagesResult {
  /** Demo seed profile identity when the active student came from the fixture corpus. */
  student_profile: { name: string; detail: string | null } | null
  /**
   * Four rows in canonical dimension order (values, interests, personality,
   * skills). Dimensions without an upserted `vips_pages` row are returned
   * as a stub with empty `compiled_truth` + `open_question` so the overview
   * can render four cards uniformly.
   */
  pages: VipsPageRow[]
  /** Non-forgotten timeline entries, keyed by dimension (newest first). */
  timeline_by_dimension: Record<VipsDimension, VipsTimelineEntryRow[]>
  /** Recent non-forgotten Mirror entries for transient home-world butterflies. */
  recent_entries: MirrorEntryRow[]
  /** Recent user-tagged emotions, adapted into Student Space-style mood pins. */
  recent_moods: LoadVipsPagesRecentMood[]
  /** Counsellor brief status, adapted into the Student Space-style mailbox. */
  world_mailbox: {
    unreadBriefCount: number
    lastBriefId: number | null
  }
  /** Serialized Student Space shell data resolved server-side for the active student. */
  student_space_shell: StudentSpaceShellData | null
  /** Count of non-forgotten timeline entries per dimension. */
  claim_count_by_dimension: Record<VipsDimension, number>
  /** Sum of `claim_count_by_dimension` — drives the 3-entry gate replacement (R24). */
  total_claim_count: number
}

export interface LoadVipsPagesRecentMood {
  id: number
  emotion: Mood
  intensity: number
  created_at: string
}

export async function loadVipsPagesHandler(data: LoadVipsPagesInput): Promise<LoadVipsPagesResult> {
  loadVipsPagesInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => {
    const rawPages = await listVipsPages(studentId, { ctx })
    const pagesByDimension = new Map<string, VipsPageRow>(rawPages.map((p) => [p.dimension, p]))

    // Render the four dimensions in canonical order. A dimension without an
    // upserted page row returns a stub so the overview grid is always 4
    // cards; the empty-state copy lives in the view (R3: read-only).
    // `updated_at: null` (rather than the previous empty-string sentinel)
    // signals "no upsert yet" — the view-side `page.updated_at ?` guard
    // already handled this falsy case, but `null` is the honest shape.
    const pages: VipsPageRow[] = VIPS_DIMENSIONS.map(
      (dim): VipsPageRow =>
        pagesByDimension.get(dim) ?? {
          student_id: studentId,
          dimension: dim,
          compiled_truth: '',
          open_question: '',
          updated_at: null,
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
      const entries = await listVipsTimelineEntries(studentId, dim, { ctx })
      timeline_by_dimension[dim] = entries
      claim_count_by_dimension[dim] = entries.length
      total += entries.length
    }

    const recentEntries = await listMirrorEntries(studentId, { ctx, limit: 12 })
    const worldMailbox = await loadCounsellorBriefStatusForStudent(studentId, { ctx })
    const shellData = loadStudentSpaceShellData(studentId)

    return {
      student_profile: shellData
        ? { name: shellData.identity.name, detail: shellData.identity.className || null }
        : null,
      pages,
      timeline_by_dimension,
      recent_entries: recentEntries,
      recent_moods: deriveRecentMoodsFromMirrorEntries(recentEntries),
      world_mailbox: worldMailbox,
      student_space_shell: shellData,
      claim_count_by_dimension,
      total_claim_count: total,
    }
  })
}

export function deriveRecentMoodsFromMirrorEntries(
  entries: readonly MirrorEntryRow[],
  limit = 6,
): LoadVipsPagesRecentMood[] {
  return entries
    .flatMap((entry): LoadVipsPagesRecentMood[] => {
      const mood = moodFromMirrorTags(entry.tags)
      if (!mood) return []
      return [
        {
          id: entry.id,
          emotion: mood,
          intensity: 0.72,
          created_at: entry.created_at,
        },
      ]
    })
    .slice(0, Math.max(0, limit))
}
