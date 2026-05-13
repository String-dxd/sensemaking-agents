/**
 * U8 — Zod schema for the staged-diff payload as the review surface needs
 * to read and mutate it.
 *
 * The staged-diff row's `payload_json` column is written by the auto-
 * Connector handler (U7) as:
 *
 *   {
 *     diffs:      ConnectorDiffSchema['diffs'],   // per-dimension rewrites
 *     admitted:   VerifierAnnotatedEntry[],       // verifier-passed
 *     downgraded: VerifierAnnotatedEntry[],       // verifier-capped
 *     dropped:    VerifierDroppedEntry[],         // verifier-rejected
 *   }
 *
 * U8 extends each `admitted` / `downgraded` entry with a `resolved` field so
 * confirm/forget mutations can mark per-entry resolution without adding a
 * new column. Absence of `resolved` is treated as `'pending'` for backward
 * compatibility with rows written before this version landed.
 *
 * The `_review_entry_id` field is a stable per-entry identifier we synth-
 * esize at *read time* from `canonical_claim_id`. The plan's review surface
 * needs a stable handle to pass back to confirm/forget; the upstream
 * Connector schema does not currently include a UUID, so we derive one
 * deterministically from `canonical_claim_id` (which is unique within an
 * admitted / downgraded list per dimension; collisions across dimensions
 * are disambiguated by appending the dimension prefix).
 */
import { z } from 'zod'
import { ConnectorDimensionDiffSchema } from '~/agents/schemas'
import { VerifierAnnotatedEntrySchema, VerifierDroppedEntrySchema } from '~/agents/tools/schemas'

/** Per-entry review state, persisted inside the staged diff's payload. */
export const ReviewResolutionSchema = z.enum(['pending', 'confirmed', 'forgotten'])
export type ReviewResolution = z.infer<typeof ReviewResolutionSchema>

/**
 * Admitted or downgraded entry, extended with the review-surface
 * resolution flag. `resolved` defaults to `'pending'` on read so rows
 * written by U7 (which never set it) still parse cleanly.
 */
export const ReviewableAnnotatedEntrySchema = VerifierAnnotatedEntrySchema.extend({
  resolved: ReviewResolutionSchema.default('pending'),
})
export type ReviewableAnnotatedEntry = z.infer<typeof ReviewableAnnotatedEntrySchema>

/**
 * Full review-surface payload shape. Same top-level keys as U7 writes,
 * but admitted/downgraded entries now carry `resolved`. Dropped entries
 * are read-only on the review surface (verifier already rejected them),
 * so no `resolved` flag is added — they're "pre-resolved".
 */
export const ReviewPayloadSchema = z.object({
  diffs: z.object({
    values: ConnectorDimensionDiffSchema,
    interests: ConnectorDimensionDiffSchema,
    personality: ConnectorDimensionDiffSchema,
    skills: ConnectorDimensionDiffSchema,
  }),
  admitted: z.array(ReviewableAnnotatedEntrySchema),
  downgraded: z.array(ReviewableAnnotatedEntrySchema),
  dropped: z.array(VerifierDroppedEntrySchema),
})
export type ReviewPayload = z.infer<typeof ReviewPayloadSchema>

/**
 * Build the stable per-entry handle the review surface uses to confirm /
 * forget. Combining dimension + canonical_claim_id is stable across reads
 * and survives JSON round-tripping. The agent guarantees
 * `canonical_claim_id` uniqueness within a dimension; the dimension prefix
 * disambiguates across dimensions.
 */
export function buildReviewEntryId(entry: {
  dimension: string
  canonical_claim_id: string
}): string {
  return `${entry.dimension}::${entry.canonical_claim_id}`
}

/**
 * Parse a `JsonValue` payload (as stored on `VipsProposedDiffRow.payload`)
 * into the strict review shape. Throws if the payload is missing required
 * keys — the auto-Connector handler is the only writer and always emits
 * the full shape, so a missing key is a programmer error and surfaces
 * loudly.
 */
export function parseReviewPayload(raw: unknown): ReviewPayload {
  return ReviewPayloadSchema.parse(raw)
}

/**
 * Are all admitted+downgraded entries in `payload` resolved (confirmed or
 * forgotten)? Used by confirm-diff / forget-diff handlers to decide
 * whether to flip the staged row's status. Dropped entries are pre-
 * resolved by the verifier and do not count toward the gate.
 */
export function allEntriesResolved(payload: ReviewPayload): boolean {
  const all = [...payload.admitted, ...payload.downgraded]
  if (all.length === 0) return true
  return all.every((e) => e.resolved !== 'pending')
}

/**
 * Find a reviewable entry (`admitted` or `downgraded`) by its
 * `buildReviewEntryId` handle. Returns the entry and the list it lives in,
 * or `null` if no match. Shared by confirm-diff / forget-diff handlers.
 */
export function locateEntry(
  payload: ReviewPayload,
  entryId: string,
): { entry: ReviewableAnnotatedEntry; list: 'admitted' | 'downgraded' } | null {
  for (const list of ['admitted', 'downgraded'] as const) {
    const found = payload[list].find((e) => buildReviewEntryId(e) === entryId)
    if (found) return { entry: found, list }
  }
  return null
}
