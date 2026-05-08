import { z } from 'zod'

/**
 * Single source of truth for all four tool I/O schemas (locked at plan time
 * by K.T.D. #4 of `plans/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md`).
 *
 * Mirror exposes only `search_past_mirrors`. Connector and Pathfinder share
 * the full three-tool surface (R11 — identical surface). Wording in the
 * `.describe()` strings is implementation-time and may iterate without
 * changing the boundary.
 */

// ── search_past_mirrors ──────────────────────────────────────────────────
export const SearchPastMirrorsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Free-text query — student-scoped FTS5 over reflection summaries.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Max results. Defaults to 5 when omitted.'),
})

export const SearchPastMirrorResultSchema = z.object({
  id: z.number().int(),
  summary: z.string(),
  tags: z.array(z.string()),
  created_at: z.string(),
  score: z.number(),
})

export const SearchPastMirrorsOutputSchema = z.object({
  results: z.array(SearchPastMirrorResultSchema),
})

export type SearchPastMirrorsInput = z.infer<typeof SearchPastMirrorsInputSchema>
export type SearchPastMirrorsOutput = z.infer<typeof SearchPastMirrorsOutputSchema>

// ── lookup_ecg_taxonomy ─────────────────────────────────────────────────
export const LookupEcgTaxonomyInputSchema = z.object({
  query: z.string().min(1),
  category: z.enum(['subject', 'cca', 'pathway', 'cluster']).optional(),
})

export const LookupEcgTaxonomyEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(['subject', 'cca', 'pathway', 'cluster']),
  description: z.string(),
  links: z.array(z.string()).optional(),
})

export const LookupEcgTaxonomyOutputSchema = z.object({
  entries: z.array(LookupEcgTaxonomyEntrySchema),
})

export type LookupEcgTaxonomyInput = z.infer<typeof LookupEcgTaxonomyInputSchema>
export type LookupEcgTaxonomyOutput = z.infer<typeof LookupEcgTaxonomyOutputSchema>

// ── self_critique ────────────────────────────────────────────────────────
export const SelfCritiqueInputSchema = z.object({
  draft: z.unknown().describe('The agent draft to critique. Pass through as JSON.'),
  dimension: z.enum(['evidence', 'sycophancy', 'specificity']),
})

export const SelfCritiqueOutputSchema = z.object({
  critique: z.string(),
  suggestions: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']),
})

export type SelfCritiqueInput = z.infer<typeof SelfCritiqueInputSchema>
export type SelfCritiqueOutput = z.infer<typeof SelfCritiqueOutputSchema>
