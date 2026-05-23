import { z } from 'zod'

/**
 * Single source of truth for all four tool I/O schemas (locked at plan time
 * by K.T.D. #4 of `docs/plans/_archive/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md`).
 *
 * Mirror exposes only `search_past_mirrors`. Connector and Cartographer used
 * to share the broader sensemaking tool surface; current managed-agent prompts
 * inline most context directly. Wording in the
 * `.describe()` strings is implementation-time and may iterate without
 * changing the boundary.
 */

// ── search_past_mirrors ──────────────────────────────────────────────────
export const SearchPastMirrorsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Free-text query — student-scoped FTS5 over reflection story_reframe text.'),
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
  story_reframe: z.string(),
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

// ── lookup_vips_taxonomy ─────────────────────────────────────────────────
// Closed VIPS vocabulary (A9 / R4): canonical Values, Interests, Personality
// (Big5 E+N only), Skills. Every field has a concrete type per the typed-
// schema rule from commit 665e07c — no z.unknown() / z.any() in the
// parameter schema reaches the OpenAI tool-parameter validator.
export const VipsTaxonomyInputSchema = z.object({
  query: z
    .string()
    .describe(
      'Free-text query — case-insensitive substring match over label, definition, and id. Empty string returns all entries within the dimension.',
    ),
  dimension: z.enum(['values', 'interests', 'personality', 'skills']).optional(),
})

export const VipsTaxonomyEntrySchema = z.object({
  id: z.string(),
  dimension: z.enum(['values', 'interests', 'personality', 'skills']),
  label: z.string(),
  definition: z.string(),
  behavioral_indicators: z.array(z.string()),
})

export const VipsTaxonomyOutputSchema = z.object({
  entries: z.array(VipsTaxonomyEntrySchema),
})

export type VipsTaxonomyInput = z.infer<typeof VipsTaxonomyInputSchema>
export type VipsTaxonomyEntry = z.infer<typeof VipsTaxonomyEntrySchema>
export type VipsTaxonomyOutput = z.infer<typeof VipsTaxonomyOutputSchema>

// ── self_critique / eval-safety reviewer ─────────────────────────────────
// `draft` is a JSON-serialized blob of arbitrary shape (Mirror, Connector,
// or Cartographer output). Tool-parameter schema validators require every
// property to have a concrete `type`, so callers fill this with
// `JSON.stringify(draft)` instead of passing unknown JSON directly.
export const SelfCritiqueInputSchema = z.object({
  draft: z
    .string()
    .min(1)
    .describe('JSON-serialized output from another agent. Re-parsed inside the eval runner.'),
  agent: z.enum(['mirror', 'connector', 'cartographer']).optional(),
  focus: z
    .array(
      z.enum([
        'evidence_grounding',
        'taxonomy_fit',
        'safety',
        'student_agency',
        'specificity',
        'sycophancy',
        'actionability',
      ]),
    )
    .optional(),
  // Legacy single-focus field retained so older callers can still ask for a
  // narrow critique; the eval agent treats it as a focus hint.
  dimension: z.enum(['evidence', 'sycophancy', 'specificity']).optional(),
  source_context: z.string().optional(),
})

export const SelfCritiqueFindingSchema = z.object({
  category: z.enum([
    'evidence_grounding',
    'taxonomy_fit',
    'safety',
    'student_agency',
    'specificity',
    'sycophancy',
    'actionability',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  issue: z.string(),
  recommendation: z.string(),
})

export const SelfCritiqueOutputSchema = z.object({
  verdict: z.enum(['pass', 'pass_with_warnings', 'fail']).optional(),
  risk_level: z.enum(['low', 'medium', 'high']).optional(),
  critique: z.string(),
  findings: z.array(SelfCritiqueFindingSchema).optional(),
  suggestions: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']),
})

export type SelfCritiqueInput = z.infer<typeof SelfCritiqueInputSchema>
export type SelfCritiqueOutput = z.infer<typeof SelfCritiqueOutputSchema>

// ── verifier I/O (U6) ───────────────────────────────────────────────────
// The deterministic verifier (`src/agents/verifier.ts`) is plain code, not a
// tool the LLM calls — but its I/O shapes belong here so U7 (auto-Connector
// caller) and U8 (review-surface consumer) share one source of truth.
//
// Typed-schema rule from commit 665e07c applies: no z.unknown() / z.any();
// every field has a concrete type. The verifier never reaches the OpenAI
// tool-parameter validator, but using concrete types keeps the shape
// auditable and keeps downstream Zod parses in U7/U8 honest.

/** Closed VIPS parallax context tags (R4 / A9). */
export const VipsContextTypeSchema = z.enum(['school', 'family', 'peer', 'hobby', 'civic'])
export type VipsContextType = z.infer<typeof VipsContextTypeSchema>

/**
 * Inside-Out-flavored closed emotion enum. The UI imports the 9 labels from
 * here so PostMirrorReview and any future mood surfaces share one source of
 * truth. User-selected moods persist as `mood:*` mirror-entry tags; Mirror's
 * model-inferred emotion remains a review-surface field.
 */
export const MoodSchema = z.enum([
  'joy',
  'sadness',
  'anger',
  'fear',
  'disgust',
  'anxiety',
  'envy',
  'embarrassed',
  'ennui',
])
export type Mood = z.infer<typeof MoodSchema>

export const VipsClaimStrengthSchema = z.enum(['low', 'medium', 'high'])
export type VipsClaimStrength = z.infer<typeof VipsClaimStrengthSchema>

/**
 * Proposed timeline entry shape emitted by the Connector (U7) and consumed
 * by the verifier. `reflection_id` cites the mirror entry the quote came
 * from; verifier drops with `unknown_reflection` if it does not match.
 */
export const ProposedTimelineEntryDraftSchema = z.object({
  dimension: z.string().min(1),
  canonical_claim_id: z.string().min(1),
  verbatim_quote: z.string().min(1),
  // Mirrors the Connector emit schema in `src/agents/schemas.ts`. Coerces
  // string integers and catches uncoercible values (placeholders, NaN,
  // missing) to a -1 sentinel. The verifier compares this to `mirror.id`
  // and drops mismatches as `unknown_reflection`, so the signal lands in
  // the verifier counters rather than as a hard parse failure.
  reflection_id: z.coerce.number().int().catch(-1),
  strength: VipsClaimStrengthSchema,
  parallax_tag: z.array(VipsContextTypeSchema),
})
export type ProposedTimelineEntryDraft = z.infer<typeof ProposedTimelineEntryDraftSchema>

/** The minimal mirror-entry projection the verifier needs. */
export const VerifierMirrorEntrySchema = z.object({
  id: z.number().int(),
  transcript: z.string().min(1),
  context_type: VipsContextTypeSchema,
})
export type VerifierMirrorEntry = z.infer<typeof VerifierMirrorEntrySchema>

/**
 * The minimal existing-timeline-entry projection the verifier needs. The
 * full row shape lives in `src/db/queries.ts` (`VipsTimelineEntryRow`);
 * verifier callers (U7) pass either the full row or a projection — the
 * extra fields are simply ignored by Zod's default object behavior.
 */
export const VerifierExistingTimelineEntrySchema = z.object({
  id: z.number().int(),
  dimension: z.string().min(1),
  canonical_claim_id: z.string().min(1),
  parallax_tag: z.array(VipsContextTypeSchema),
  forgotten_at: z.string().nullable(),
  committed_at: z.string().min(1),
})
export type VerifierExistingTimelineEntry = z.infer<typeof VerifierExistingTimelineEntrySchema>

/**
 * The reasons the verifier may drop or annotate a proposed entry. Kept as
 * a closed enum so the U8 review surface can render specific copy per
 * reason without string-comparing magic literals.
 */
export const VerifierDropReasonSchema = z.enum([
  'no_quote_match',
  'unknown_reflection',
  'unknown_canonical_claim_id',
])
export type VerifierDropReason = z.infer<typeof VerifierDropReasonSchema>

export const VerifierCapReasonSchema = z.enum(['single_context_parallax_cap'])
export type VerifierCapReason = z.infer<typeof VerifierCapReasonSchema>

/**
 * An admitted or downgraded entry — the input draft plus the verifier-
 * owned structural fields (`reinforces_id`, `partial_match`,
 * `aspirational`, `parallax_cap_reason`). The agent does NOT emit any of
 * these — verifier owns them per A5.
 */
export const VerifierAnnotatedEntrySchema = ProposedTimelineEntryDraftSchema.extend({
  reinforces_id: z.number().int().nullable(),
  partial_match: z.boolean(),
  aspirational: z.boolean(),
  parallax_cap_reason: VerifierCapReasonSchema.nullable(),
})
export type VerifierAnnotatedEntry = z.infer<typeof VerifierAnnotatedEntrySchema>

export const VerifierDroppedEntrySchema = z.object({
  entry: ProposedTimelineEntryDraftSchema,
  reason: VerifierDropReasonSchema,
})
export type VerifierDroppedEntry = z.infer<typeof VerifierDroppedEntrySchema>

export const VerifierResultSchema = z.object({
  admitted: z.array(VerifierAnnotatedEntrySchema),
  downgraded: z.array(VerifierAnnotatedEntrySchema),
  dropped: z.array(VerifierDroppedEntrySchema),
})
export type VerifierResult = z.infer<typeof VerifierResultSchema>

/** Diff payload shape consumed by the verifier (the bit it cares about). */
export const VerifierProposedDiffSchema = z.object({
  timeline_entries: z.array(ProposedTimelineEntryDraftSchema),
})
export type VerifierProposedDiff = z.infer<typeof VerifierProposedDiffSchema>
