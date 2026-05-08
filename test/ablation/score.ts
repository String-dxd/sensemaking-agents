/**
 * v0.1 ablation rubric scaffolding (K.T.D. #6).
 *
 * Two ablations (R19), each scored on the same four dimensions:
 *   1. provenance — does the agent reference prior reflections by content?
 *   2. specificity — concrete signals vs. generic listening / advice?
 *   3. novelty — does ON surface patterns OFF doesn't?
 *   4. anti-sycophancy — does the agent avoid uncritical agreement?
 *
 * v0.1 bar: 1–2 humans score each dimension 0–3 (Likert). ON beats OFF
 * by ≥2 points across ≥3 dimensions to "pass." This module *does not*
 * auto-score quality — it produces a Markdown scaffold the human fills
 * in. Auto-scoring the four dimensions is a v1 concern.
 */

export const ABLATION_DIMENSIONS = [
  'provenance',
  'specificity',
  'novelty',
  'anti-sycophancy',
] as const

export type AblationDimension = (typeof ABLATION_DIMENSIONS)[number]

export interface AblationVariantOutput {
  /** ON | OFF */
  variant: 'on' | 'off'
  /** Whatever the agent emitted, JSON-stringified for the report. */
  rawOutput: string
}

export interface AblationReportInput {
  surface: 'mirror' | 'cron'
  /** ISO date for the report header. */
  ranAt: string
  /** Path to the seed corpus used. */
  corpusPath: string
  on: AblationVariantOutput
  off: AblationVariantOutput
  /** Optional notes — e.g., model used, retry counts, error notes. */
  notes?: string
}

/**
 * Build the Markdown report scaffold. Each dimension renders an empty
 * scoring row the human fills in. The verdict line at the end is what
 * the v0.1 commit decision per surface relies on.
 */
export function buildAblationReportMarkdown(input: AblationReportInput): string {
  const title = `# Ablation report — ${input.surface} surface — ${input.ranAt}`

  const header = `${title}

> **Surface:** ${input.surface}
> **Corpus:** \`${input.corpusPath}\`
> **Bar (v0.1):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
${input.notes ? `> **Notes:** ${input.notes}\n` : ''}`

  const dimsTable =
    [
      '## Scoring (0–3 Likert per dimension; fill in by hand)',
      '',
      '| Dimension | ON score | OFF score | Δ (ON − OFF) | Pass on this dimension? |',
      '|-----------|---------:|----------:|-------------:|:------------------------|',
      ...ABLATION_DIMENSIONS.map((d) => `| ${d} |   |   |   |   |`),
    ].join('\n') + '\n'

  const verdict = `## Verdict per dimension (≥2 to "pass" individually)

- provenance: <pass | fail>
- specificity: <pass | fail>
- novelty: <pass | fail>
- anti-sycophancy: <pass | fail>

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
