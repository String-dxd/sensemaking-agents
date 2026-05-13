/**
 * U12 — Counsellor brief markdown side-export (server handler).
 *
 * Reads the four VIPS pages, per-dimension non-forgotten timeline entries,
 * and the most-recent `cartographer_outputs` row for a student, then defers
 * to the pure `renderCounsellorBrief` for markdown assembly. Wrapped in
 * `withStudent` (from `~/db/client`) so every read shares one transaction
 * with `app.student_id` bound.
 *
 * R22 boundary: the handler does NOT write the markdown to disk and does NOT
 * transmit it anywhere — it returns `{ markdown }` to the client, which
 * triggers a `Blob`-based download. The brief is on-demand, student-initiated,
 * and not auto-persisted. No row is appended to any table by this call.
 *
 * Cartographer schema note: `latestCartographerOutput` returns a
 * `CartographerOutputRow` whose `pathways` field is typed against the v0.1
 * `CartographerPathway` shape (legacy field names). The actual JSON in
 * `pathways_json` is the v0.2 lead-sheet shape persisted by U11's
 * `run-cartographer` handler. We cast through `unknown` to
 * `CartographerOutputDraft` (the source-of-truth Zod-inferred shape) before
 * handing the data to the renderer; the same pattern is used by
 * `/wiki/trajectory` in `src/routes/wiki.trajectory.tsx`.
 */
import type { CartographerOutputDraft } from '~/agents/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { withStudent } from '~/db/client'
import {
  latestCartographerOutput,
  listVipsPages,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import { renderCounsellorBrief } from '~/lib/counsellor-brief-renderer'
import { type CounsellorBriefInput, counsellorBriefInputSchema } from './function-schemas'

export interface CounsellorBriefResult {
  markdown: string
}

export class CounsellorBriefError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CounsellorBriefError'
  }
}

export async function counsellorBriefHandler(
  data: CounsellorBriefInput,
): Promise<CounsellorBriefResult> {
  counsellorBriefInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => {
    const rawPages = await listVipsPages(studentId, { ctx })
    const pagesByDimension = new Map<string, VipsPageRow>(rawPages.map((p) => [p.dimension, p]))

    // Render four pages in canonical order — a missing dimension becomes a
    // stub so the markdown always carries four `## ` headings. `updated_at`
    // is `null` (rather than empty string) so the brief renderer can omit
    // the "last refined" suffix cleanly.
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

    // Per-dimension non-forgotten timeline (R19 — `listVipsTimelineEntries`
    // excludes forgotten by default; no `includeForgotten: true` here).
    const timelineByDimension = {} as Record<VipsDimension, VipsTimelineEntryRow[]>
    for (const dim of VIPS_DIMENSIONS) {
      timelineByDimension[dim] = await listVipsTimelineEntries(studentId, dim, { ctx })
    }

    const cartographerRow = await latestCartographerOutput(studentId, { ctx })
    const trajectory: CartographerOutputDraft | null = cartographerRow
      ? {
          // The DB row's `CartographerPathway` shape now mirrors the v0.2
          // draft (Finding #8), so this assembly is a direct field copy.
          trajectory_paragraph: cartographerRow.trajectory_text,
          pathways: cartographerRow.pathways,
          open_questions: cartographerRow.open_questions,
          disclaimer: cartographerRow.disclaimer,
        }
      : null

    const markdown = renderCounsellorBrief({
      studentId: studentId,
      pages,
      timelineByDimension,
      trajectory,
    })
    return { markdown }
  })
}
