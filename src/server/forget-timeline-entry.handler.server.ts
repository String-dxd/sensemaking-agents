/**
 * U9 — Soft-forget one already-committed `vips_timeline_entries` row.
 * Used by the library-side per-entry forget button (the forget-on-review-
 * surface path is `forget-diff`, which is a different beast — see U8).
 *
 * Delegates to `forgetVipsTimelineEntry` (U1) which atomically:
 *   - stamps `forgotten_at = current_timestamp`
 *   - excludes the row from future FTS retrieval via the `forgotten_at IS NULL`
 *     predicate (the tsvector column persists; the search predicate gates it)
 *   - bumps `vips_forget_count.count` for the dimension (R20: recorded,
 *     not surfaced — see `load-vips-pages.handler.server.ts` for the
 *     response-shape boundary)
 *
 * Returns the entry's dimension so the client can invalidate the right
 * `['vips-pages', studentId]` (single key for the whole overview) plus
 * the dimension-scoped page query without an extra round-trip to learn
 * which dimension the entry belonged to.
 *
 * Single-query handler — `forgetVipsTimelineEntry` opens its own
 * `withStudent` envelope.
 */
import { z } from 'zod'
import type { VipsDimension } from '~/data/vips-taxonomy'
import { forgetVipsTimelineEntry } from '~/db/queries'

export const forgetTimelineEntryInputSchema = z.object({
  studentId: z.string().min(1),
  entryId: z.number().int().positive(),
})

export type ForgetTimelineEntryInput = z.output<typeof forgetTimelineEntryInputSchema>

export class ForgetTimelineEntryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForgetTimelineEntryError'
  }
}

export interface ForgetTimelineEntryResult {
  /** The original entry id — echoed so callers can disambiguate when multiple forgets are in flight. */
  entry_id: number
  /** The dimension the forgotten entry belonged to — for query invalidation. */
  dimension: VipsDimension
  /** ISO timestamp the row was forgotten at (driven by the DB clock). */
  forgotten_at: string
}

export async function forgetTimelineEntryHandler(
  data: ForgetTimelineEntryInput,
): Promise<ForgetTimelineEntryResult> {
  const parsed = forgetTimelineEntryInputSchema.parse(data)
  const row = await forgetVipsTimelineEntry(parsed.studentId, parsed.entryId)
  // Cross-student isolation: `forgetVipsTimelineEntry` returns null when
  // the row doesn't belong to this student. Surface that as an error so
  // the client gets a deterministic failure instead of a silent no-op.
  if (!row) {
    throw new ForgetTimelineEntryError(
      `Timeline entry ${parsed.entryId} not found for student ${parsed.studentId}`,
    )
  }
  if (!row.forgotten_at) {
    // Defensive: the helper should have stamped forgotten_at within the
    // same transaction. If it returned a row without it, something is
    // off — fail loud rather than lying to the client.
    throw new ForgetTimelineEntryError(
      `Timeline entry ${parsed.entryId} did not record forgotten_at`,
    )
  }
  return {
    entry_id: parsed.entryId,
    dimension: row.dimension as VipsDimension,
    forgotten_at: row.forgotten_at,
  }
}
