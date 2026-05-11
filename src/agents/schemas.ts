import { z } from 'zod'
import { VipsClaimStrengthSchema, VipsContextTypeSchema } from '~/agents/tools/schemas'

/**
 * Output schemas for Mirror, Connector, and Cartographer.
 *
 * Mirror's output is the three-part reflection: validation, inferred_meaning,
 * story_reframe (see docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md
 * R7). The transcript is supplied at persist time, not by the agent.
 *
 * v0.2 (U7) reshape note: the v0.1 `ConnectorOutputSchema` (patterns +
 * still_unclear) is retained for the legacy manual sense-making chain that
 * U11 will phase out. The auto-Connector path introduced in U7 uses
 * `ConnectorDiffSchema` — a per-VIPS-dimension diff proposal with a
 * compiled-truth rewrite, an "Open question" line, and a list of timeline
 * entry drafts. The verifier owns `reinforces_id`, `partial_match`,
 * `aspirational`, and `parallax_cap_reason` per A5; the agent does NOT
 * emit those fields. `superseded_by` is a v0.3 schema stub and is not
 * present in the draft today.
 *
 * v0.2 rename note: the role previously called "Pathfinder" is now
 * "Cartographer". U10 performed the mechanical rename; U11 reshapes the
 * output schema to the wiki Trajectory page shape
 * `{trajectory_paragraph, pathways, open_questions, disclaimer}` where each
 * pathway is a lead-sheet (label + trait_combination + ecg_region_tags +
 * risks_tradeoffs + exploration_prompt). The v0.1 shape lives on as
 * `LegacyPathfinderOutputSchema` for the cutover passthrough chain.
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

// ── Connector v0.2 diff proposal (U7) ────────────────────────────────────
/**
 * Closed VIPS dimensions used by the Connector diff proposal. Mirrors
 * `VipsTaxonomyEntrySchema.dimension` in `tools/schemas.ts`.
 */
export const ConnectorDimensionSchema = z.enum(['values', 'interests', 'personality', 'skills'])
export type ConnectorDimension = z.infer<typeof ConnectorDimensionSchema>

/**
 * One proposed timeline entry as emitted by the Connector. Verifier-owned
 * fields (`reinforces_id`, `partial_match`, `aspirational`,
 * `parallax_cap_reason`) are NOT in the draft per A5; the verifier (U6)
 * computes them after the agent returns. `superseded_by` is a v0.3 schema
 * stub and is intentionally absent.
 *
 * `verbatim_quote` may be left empty if no evidence supports the claim; the
 * verifier will drop it with `no_quote_match` regardless, but allowing an
 * empty string lets the agent express "no quote found" rather than
 * fabricating one (R10).
 */
export const ConnectorTimelineEntryDraftSchema = z.object({
  canonical_claim_id: z.string().min(1),
  verbatim_quote: z.string(),
  reflection_id: z.number().int(),
  strength: VipsClaimStrengthSchema,
  parallax_tag: z.array(VipsContextTypeSchema),
})
export type ConnectorTimelineEntryDraft = z.infer<typeof ConnectorTimelineEntryDraftSchema>

/** Per-dimension diff: compiled-truth rewrite + open question + new entries. */
export const ConnectorDimensionDiffSchema = z.object({
  compiled_truth_rewrite: z.string(),
  open_question: z.string(),
  new_timeline_entries: z.array(ConnectorTimelineEntryDraftSchema),
})
export type ConnectorDimensionDiff = z.infer<typeof ConnectorDimensionDiffSchema>

/**
 * Full Connector diff payload. `diffs` is keyed by each of the four VIPS
 * dimensions. A dimension may legitimately have an empty
 * `new_timeline_entries` list — the verifier and review surface treat
 * "no new entries" as "this reflection did not move this dimension".
 */
export const ConnectorDiffSchema = z.object({
  diffs: z.object({
    values: ConnectorDimensionDiffSchema,
    interests: ConnectorDimensionDiffSchema,
    personality: ConnectorDimensionDiffSchema,
    skills: ConnectorDimensionDiffSchema,
  }),
})
export type ConnectorDiffDraft = z.infer<typeof ConnectorDiffSchema>

// ── Cartographer ─────────────────────────────────────────────────────────
/**
 * v0.2 (U11) reshape — Cartographer no longer reads Connector's raw patterns;
 * it reads the student's four VIPS pages + corpus and proposes lead-sheet
 * pathways. Each pathway carries a `trait_combination` (refs to canonical
 * VIPS claim IDs that exist on the student's pages), cluster-level ECG
 * region tags, risks/tradeoffs, and an exploration prompt. The 2–5 count
 * refinement is enforced at the schema boundary; the validity of the
 * claim_id and ecg_region_tags string values is checked post-hoc by the
 * handler (so the handler can drop a single invalid pathway rather than
 * rejecting the whole output — see `src/server/run-cartographer.*`).
 *
 * v0.1 `LegacyPathfinderOutputSchema` is retained below for the v0.1
 * passthrough chain (`handoff-chain.ts`, `handoff-chain-streamed.ts`,
 * `run-sensemaking.*`). U11 cuts over the manual sense-making button to
 * the new shape; the legacy schema is removed in the follow-up PR per
 * Scope Boundaries.
 */
export const CartographerClaimRefSchema = z.object({
  claim_id: z.string().min(1),
  dimension: z.enum(['values', 'interests', 'personality', 'skills']),
  timeline_entry_id: z.number().int().positive().optional(),
})
export type CartographerClaimRef = z.infer<typeof CartographerClaimRefSchema>

export const CartographerPathwaySchema = z.object({
  label: z.string().min(1),
  trait_combination: z.array(CartographerClaimRefSchema).min(1),
  ecg_region_tags: z.array(z.string()).min(1),
  risks_tradeoffs: z.string().min(1),
  exploration_prompt: z.string().min(1),
})
export type CartographerPathwayDraft = z.infer<typeof CartographerPathwaySchema>

export const CartographerOutputSchema = z.object({
  trajectory_paragraph: z.string().min(1),
  pathways: z.array(CartographerPathwaySchema).refine((arr) => arr.length >= 2 && arr.length <= 5, {
    message: 'pathways must contain 2 to 5 entries',
  }),
  open_questions: z.array(z.string().min(1)),
  disclaimer: z.string().min(1),
})

export type CartographerOutputDraft = z.infer<typeof CartographerOutputSchema>

// ── Legacy Pathfinder (v0.1) — retained for the cutover passthrough ──────
/**
 * v0.1 shape: `{trajectory, pathways: {label, reasoning, ecg_taxonomy_ids},
 * disclaimer}`. The legacy Connector → Pathfinder chain in
 * `handoff-chain.ts` + `handoff-chain-streamed.ts` (still reachable via the
 * v0.1 `run-sensemaking` server fn) parses against this schema. The
 * follow-up PR deletes both the chain and this schema after the cutover.
 */
export const LegacyPathfinderPathwaySchema = z.object({
  label: z.string().min(1),
  reasoning: z.string().min(1),
  ecg_taxonomy_ids: z.array(z.string()).min(1),
})
export const LegacyPathfinderOutputSchema = z.object({
  trajectory: z.string().min(1),
  pathways: z.array(LegacyPathfinderPathwaySchema).min(2).max(5),
  disclaimer: z.string().min(1),
})
export type LegacyPathfinderOutputDraft = z.infer<typeof LegacyPathfinderOutputSchema>
