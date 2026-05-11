import { z } from 'zod'

/**
 * Output schemas for Mirror, Connector, and Cartographer.
 *
 * Mirror's output is the three-part reflection: validation, inferred_meaning,
 * story_reframe (see docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md
 * R7). The transcript is supplied at persist time, not by the agent.
 *
 * Connector and Cartographer shapes are unchanged from the prior brainstorm.
 *
 * v0.2 rename note: the role previously called "Pathfinder" is now
 * "Cartographer". U10 performed the mechanical rename only — the schema body
 * here is the v0.1 shape `{trajectory, pathways, disclaimer}`. U11 reshapes
 * the Cartographer output to the v0.2 wiki shape
 * `{trajectory_text, pathways, open_questions, disclaimer}` and rewrites the
 * prompt body accordingly.
 */

// ── Mirror ───────────────────────────────────────────────────────────────
/** What the Mirror agent produces from a transcript. */
export const MirrorOutputSchema = z.object({
  validation: z.string().min(1),
  inferred_meaning: z.string().min(1),
  story_reframe: z.string().min(1),
})

export type MirrorOutputDraft = z.infer<typeof MirrorOutputSchema>

/** What gets persisted to mirror_entries. Transcript is supplied alongside the agent output. */
export const MirrorEntrySchema = MirrorOutputSchema.extend({
  transcript: z.string().min(1),
})

export type MirrorEntryDraft = z.infer<typeof MirrorEntrySchema>

/** Editable field discriminator used by the wiki edit-and-confirm primitives. */
export const MirrorEditableField = z.enum(['validation', 'inferred_meaning', 'story_reframe'])
export type MirrorEditableFieldName = z.infer<typeof MirrorEditableField>

// ── Connector ────────────────────────────────────────────────────────────
export const ConnectorPatternSchema = z.object({
  text: z.string().min(1),
  strength: z.enum(['low', 'medium', 'high']),
  evidence_reflection_ids: z.array(z.number().int()).min(1),
})

export const ConnectorOutputSchema = z.object({
  patterns: z.array(ConnectorPatternSchema).min(1),
  still_unclear: z.string().nullable(),
})

export type ConnectorOutputDraft = z.infer<typeof ConnectorOutputSchema>

// ── Cartographer ─────────────────────────────────────────────────────────
export const CartographerPathwaySchema = z.object({
  label: z.string().min(1),
  reasoning: z.string().min(1),
  ecg_taxonomy_ids: z.array(z.string()).min(1),
})

export const CartographerOutputSchema = z.object({
  trajectory: z.string().min(1),
  pathways: z.array(CartographerPathwaySchema).min(2).max(5),
  disclaimer: z.string().min(1),
})

export type CartographerOutputDraft = z.infer<typeof CartographerOutputSchema>
