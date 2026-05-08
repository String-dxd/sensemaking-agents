import { z } from 'zod'

/**
 * Output schemas for Mirror, Connector, and Pathfinder.
 *
 * Mirror's output is the three-part reflection: validation, inferred_meaning,
 * story_reframe (see docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md
 * R7). The transcript is supplied at persist time, not by the agent.
 *
 * Connector and Pathfinder shapes are unchanged from the prior brainstorm.
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

// ── Pathfinder ───────────────────────────────────────────────────────────
export const PathfinderPathwaySchema = z.object({
  label: z.string().min(1),
  reasoning: z.string().min(1),
  ecg_taxonomy_ids: z.array(z.string()).min(1),
})

export const PathfinderOutputSchema = z.object({
  trajectory: z.string().min(1),
  pathways: z.array(PathfinderPathwaySchema).min(2).max(5),
  disclaimer: z.string().min(1),
})

export type PathfinderOutputDraft = z.infer<typeof PathfinderOutputSchema>
