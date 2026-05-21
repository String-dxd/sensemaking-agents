/**
 * Shared self-side claim helper for the Relationships §3 column.
 *
 * Both the `/library/relationships` route and the React-into-engine bridge
 * embed RelationshipsPageView and need to render the student's top VIPS
 * claim per dimension as the left-hand "How I see myself" cards. Keeping
 * this here means the two consumers can't drift on label resolution.
 */
import { VIPS_DIMENSIONS, VIPS_TAXONOMY, type VipsDimension } from '~/data/vips-taxonomy'

export interface VipsPagesShape {
  pages: Array<{ dimension: string; compiled_truth: string }>
  timeline_by_dimension: Record<string, Array<{ canonical_claim_id: string }>>
}

export interface VipsSelfSideClaim {
  dimension: VipsDimension
  topClaimLabel: string
}

/**
 * Returns the human-facing label for the most-noticed canonical claim in
 * a single VIPS dimension. Falls back to "See VIPS page" when there is no
 * timeline yet but a compiled truth exists, and to "No signal yet" when
 * neither is present or `data` is missing.
 */
export function topClaimLabelFor(
  data: VipsPagesShape | undefined,
  dimension: VipsDimension,
): string {
  if (!data) return 'No signal yet'
  const timeline = data.timeline_by_dimension?.[dimension] ?? []
  if (timeline.length === 0) {
    const page = data.pages.find((p) => p.dimension === dimension)
    return page?.compiled_truth?.trim() ? 'See VIPS page' : 'No signal yet'
  }
  const counts = new Map<string, number>()
  for (const entry of timeline) {
    counts.set(entry.canonical_claim_id, (counts.get(entry.canonical_claim_id) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!top) return 'No signal yet'
  const canonical = VIPS_TAXONOMY.find((c) => c.id === top[0])
  return canonical?.label ?? top[0]
}

/**
 * Build the full self-side list — one card per VIPS dimension, in
 * canonical order. Callers pass the result straight to
 * `<RelationshipsPageView selfSide={...} />`.
 */
export function buildVipsSelfSide(data: VipsPagesShape | undefined): VipsSelfSideClaim[] {
  return VIPS_DIMENSIONS.map((dimension) => ({
    dimension,
    topClaimLabel: topClaimLabelFor(data, dimension),
  }))
}
