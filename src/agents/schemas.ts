import { z } from 'zod'

/**
 * Output schemas for Mirror, Connector, and Pathfinder.
 *
 * Constraints from K.T.D. #4 and #5: every signal is labeled by epistemic
 * kind, every Connector pattern cites at least one reflection ID, every
 * Pathfinder pathway names ≥1 ECG taxonomy ID. The schemas are the
 * *enforcement* point — uncited patterns fail Zod and the SDK retries.
 */

// ── Mirror ───────────────────────────────────────────────────────────────
export const MirrorSignalSchema = z.object({
  kind: z.enum(['observed', 'inferred', 'uncertain']),
  text: z.string().min(1),
  evidence_excerpts: z.array(z.string()).optional(),
})

export const MirrorEntrySchema = z.object({
  summary: z.string().min(1),
  transcript: z.string().min(1),
  signals: z.array(MirrorSignalSchema).min(1),
  caution: z.string().min(1),
  tags: z.array(z.string()).default([]),
})

export type MirrorEntryDraft = z.infer<typeof MirrorEntrySchema>

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
