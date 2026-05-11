/**
 * v0.2 ablation rubric scaffolding (U13).
 *
 * Two ablations (R20), each scored on the same five dimensions:
 *   1. provenance          — does the agent reference prior reflections by content?
 *   2. specificity         — concrete signals vs. generic listening / advice?
 *   3. novelty             — does ON surface patterns OFF doesn't?
 *   4. anti-sycophancy     — does the agent avoid uncritical agreement?
 *   5. parallax_discipline — are single-context claims correctly capped at low
 *                            strength, and only multi-context claims admitted
 *                            at high? (New in v0.2 per plan A6 / U13.)
 *
 * v0.2 bar: 1–2 humans score each dimension 0–3 (Likert). ON beats OFF by
 * ≥2 points across ≥3 dimensions to "pass." This module *does not*
 * auto-score quality — it produces a Markdown scaffold the human fills in.
 * Auto-scoring the five dimensions is a v1 concern.
 *
 * ── Parallax discipline rubric (0–3 sub-checks, U13) ───────────────────────
 *
 * The fifth dimension is novel in v0.2 because the parallax model requires the
 * agent to distinguish claims grounded in ≥2 distinct `context_type` values
 * from claims grounded in a single context. The Connector emits a strength
 * (`low`/`medium`/`high`) for each proposed diff; Cartographer cites timeline
 * entries by `canonical_claim_id` and inherits the strength implicitly through
 * the claims it reaches for.
 *
 *   0 — single-context claims marked high (parallax violated outright).
 *   1 — some capping but inconsistent: a few single-context claims slip
 *       through at medium or high; multi-context claims occasionally
 *       under-strengthened.
 *   2 — consistent capping with occasional miss: at most one single-context
 *       claim above low; multi-context claims appropriately at medium or high.
 *   3 — all single-context claims correctly capped at low; multi-context
 *       claims correctly admitted at medium/high based on the count and
 *       distinctness of supporting contexts.
 *
 * Sub-checks (the human scorer ticks each as a quick mechanical proxy):
 *   (a) every "high"-strength claim references ≥2 distinct context_type values
 *       across its supporting evidence;
 *   (b) every claim sourced from a single reflection (or a single context) is
 *       capped at "low";
 *   (c) "medium" claims sit in the gap — same context across multiple
 *       reflections, or two reflections in two contexts where the
 *       cross-context echo is light;
 *   (d) the Cartographer's trajectory paragraph does not promote any
 *       single-context claim to a "consistent" or "across-the-board" framing.
 */

export const ABLATION_DIMENSIONS = [
  'provenance',
  'specificity',
  'novelty',
  'anti-sycophancy',
  'parallax_discipline',
] as const

export type AblationDimension = (typeof ABLATION_DIMENSIONS)[number]

export interface AblationVariantOutput {
  /** ON | OFF */
  variant: 'on' | 'off'
  /** Whatever the agent emitted, JSON-stringified for the report. */
  rawOutput: string
}

export interface AblationReportInput {
  surface: 'mirror' | 'sensemake'
  /** ISO date for the report header. */
  ranAt: string
  /** Path to the seed corpus used. */
  corpusPath: string
  /** Optional student scope (v0.2). When omitted, the run is over the cross-student union. */
  studentId?: string
  on: AblationVariantOutput
  off: AblationVariantOutput
  /** Optional notes — e.g., model used, retry counts, error notes. */
  notes?: string
}

/**
 * Build the Markdown report scaffold. Each dimension renders an empty
 * scoring row the human fills in. The verdict line at the end is what
 * the commit decision per surface relies on.
 */
export function buildAblationReportMarkdown(input: AblationReportInput): string {
  const studentSuffix = input.studentId ? ` — student \`${input.studentId}\`` : ''
  const title = `# Ablation report — ${input.surface} surface — ${input.ranAt}${studentSuffix}`

  const header = `${title}

> **Surface:** ${input.surface}
> **Corpus:** \`${input.corpusPath}\`
${input.studentId ? `> **Student:** \`${input.studentId}\`\n` : '> **Student scope:** cross-student union (no `--student=` flag passed)\n'}> **Bar (v0.2):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
${input.notes ? `> **Notes:** ${input.notes}\n` : ''}`

  const dimsTable =
    [
      '## Scoring (0–3 Likert per dimension; fill in by hand)',
      '',
      '| Dimension | ON score | OFF score | Δ (ON − OFF) | Pass on this dimension? |',
      '|-----------|---------:|----------:|-------------:|:------------------------|',
      ...ABLATION_DIMENSIONS.map((d) => `| ${d} |   |   |   |   |`),
    ].join('\n') + '\n'

  const verdict = `## Verdict per dimension (Δ ≥2 to "pass" individually)

- provenance: <pass | fail>
- specificity: <pass | fail>
- novelty: <pass | fail>
- anti-sycophancy: <pass | fail>
- parallax_discipline: <pass | fail>

## Overall verdict

- Dimensions passed: <count>
- Surface verdict: <KEEP | DROP | NARROW>
`

  const onBlock = `## ON variant raw output

\`\`\`json
${input.on.rawOutput}
\`\`\`
`

  const offBlock = `## OFF variant raw output

\`\`\`json
${input.off.rawOutput}
\`\`\`
`

  return [header, dimsTable, verdict, onBlock, offBlock].join('\n')
}
