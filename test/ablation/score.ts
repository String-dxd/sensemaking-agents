/**
 * v0.2 ablation rubric scaffolding (U13) — extended for the Managed-Agents
 * migration (`plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`
 * Step 1).
 *
 * Two distinct report formats:
 *
 *   1. **Human-Likert markdown** — `buildAblationReportMarkdown`. The original
 *      five-dimension scoring scaffold (provenance, specificity, novelty,
 *      anti-sycophancy, parallax_discipline). Still emitted alongside the
 *      structured report so a human can hand-score on the cutover-gate
 *      review (plan §9.3 step 3). Shape is unchanged so existing tests in
 *      `test/ablation/*.test.ts` keep passing.
 *
 *   2. **Structured JSON** — `buildStructuredReport`. Per-fixture-row +
 *      per-agent token counts, latency, verifier verdicts
 *      (admitted/downgraded/dropped + reason buckets), claim-id frequency.
 *      Written to `test/ablation/reports/<ts>-<runner>-<surface>[-student].json`.
 *      Consumed by CI (`.github/workflows/ablation.yml`) to compute a
 *      delta vs the last `main` JSON and post a PR comment.
 *
 * Notes on the Likert rubric (unchanged from v0.2 U13):
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
 */

export const ABLATION_DIMENSIONS = [
  'provenance',
  'specificity',
  'novelty',
  'anti-sycophancy',
  'parallax_discipline',
] as const

export type AblationDimension = (typeof ABLATION_DIMENSIONS)[number]

// ── Markdown (human-Likert) report — unchanged signature ──────────────────

export interface AblationVariantOutput {
  /** ON | OFF (legacy axis; the runner-comparison era uses 'on' for the live
   *  runner output and 'off' for an n/a placeholder. Tests assert on the
   *  scaffold structure, not on which runner is which side.) */
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

// ── Structured JSON report (Step 1 of migration plan) ─────────────────────

/**
 * Per-agent run statistics. Captured at each individual `run()` call.
 * `input_tokens`/`output_tokens` may be `null` when the runner backend
 * does not surface usage stats (the OpenAI Agents SDK exposes them via
 * `result.state.usage` but the field is not yet typed in the public
 * surface; we capture defensively via `as any`).
 */
export interface AgentRunStats {
  agent: 'mirror' | 'connector' | 'cartographer'
  latency_ms: number
  input_tokens: number | null
  output_tokens: number | null
  output_parsed: boolean
  /** Set when output_parsed=false. Zod or transport error message. */
  parse_error: string | null
}

/**
 * Verifier verdict counters per-row. Sum over admitted, downgraded, and
 * the two drop reasons. `aspirational` is the subset of admitted+downgraded
 * that hit the parallax cap (R11). `claim_ids` is the set of
 * `canonical_claim_id` values that survived the verifier — used downstream
 * to compute claim-id frequency distribution.
 */
export interface VerifierVerdictCounters {
  admitted: number
  downgraded: number
  dropped_no_quote_match: number
  dropped_unknown_reflection: number
  aspirational: number
  claim_ids: string[]
}

export function zeroVerdictCounters(): VerifierVerdictCounters {
  return {
    admitted: 0,
    downgraded: 0,
    dropped_no_quote_match: 0,
    dropped_unknown_reflection: 0,
    aspirational: 0,
    claim_ids: [],
  }
}

/**
 * Per-fixture-row trace. One row per reflection in scope. `mirror` is
 * always populated for the `mirror` surface; `connector` and `verifier`
 * are populated for the `sensemake` surface; `cartographer` is populated
 * only when the sensemake run reached the cartographer pass (today, the
 * ablation does not always invoke Cartographer per-row to keep cost
 * bounded — `cartographer` may be null on rows that only ran Mirror+
 * Connector). `error` is set when a row aborts before completion.
 */
export interface PerFixtureRow {
  reflection_id: number | null
  student_id: string
  context_type: string
  mirror: AgentRunStats | null
  connector: AgentRunStats | null
  cartographer: AgentRunStats | null
  verifier: VerifierVerdictCounters | null
  error: string | null
}

export interface AgentTotals {
  calls: number
  parsed_calls: number
  total_input_tokens: number
  total_output_tokens: number
  latency_ms_p50: number
  latency_ms_p95: number
  latency_ms_max: number
}

export interface AblationStructuredReport {
  runner: 'openai' | 'managed'
  surface: 'mirror' | 'sensemake'
  ran_at: string
  /** Model id that Mirror/Connector/Cartographer ran against (env-resolved). */
  model: string
  /** Optional student scope; null = cross-student union. */
  student_scope: string | null
  corpus_path: string
  /** Number of reflections actually exercised (after `--limit` is applied). */
  rows_executed: number
  rows: PerFixtureRow[]
  totals: {
    mirror: AgentTotals | null
    connector: AgentTotals | null
    cartographer: AgentTotals | null
    /** Aggregated across every per-row verifier run (sensemake only). */
    verifier: VerifierVerdictCounters | null
  }
  /** `canonical_claim_id` → admit count across all rows. Empty for mirror surface. */
  claim_id_distribution: Record<string, number>
  /** Free-text note — e.g., placeholder run because no API key. */
  notes: string
}

/**
 * Aggregate per-agent stats from a list of rows into a totals block. Returns
 * null when no row carried that agent. Latency percentiles are nearest-rank
 * (no interpolation) — fine for the small N (≤24) we run today.
 */
export function computeAgentTotals(
  rows: PerFixtureRow[],
  agent: 'mirror' | 'connector' | 'cartographer',
): AgentTotals | null {
  const stats = rows.map((r) => r[agent]).filter((s): s is AgentRunStats => s !== null)
  if (stats.length === 0) return null
  const latencies = stats.map((s) => s.latency_ms).sort((a, b) => a - b)
  const nearestRank = (p: number): number => {
    if (latencies.length === 0) return 0
    const idx = Math.max(
      0,
      Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1),
    )
    return latencies[idx] ?? 0
  }
  return {
    calls: stats.length,
    parsed_calls: stats.filter((s) => s.output_parsed).length,
    total_input_tokens: stats.reduce((acc, s) => acc + (s.input_tokens ?? 0), 0),
    total_output_tokens: stats.reduce((acc, s) => acc + (s.output_tokens ?? 0), 0),
    latency_ms_p50: nearestRank(50),
    latency_ms_p95: nearestRank(95),
    latency_ms_max: latencies[latencies.length - 1] ?? 0,
  }
}

export function aggregateVerifierCounters(rows: PerFixtureRow[]): VerifierVerdictCounters | null {
  const verifiers = rows
    .map((r) => r.verifier)
    .filter((v): v is VerifierVerdictCounters => v !== null)
  if (verifiers.length === 0) return null
  const totals = zeroVerdictCounters()
  for (const v of verifiers) {
    totals.admitted += v.admitted
    totals.downgraded += v.downgraded
    totals.dropped_no_quote_match += v.dropped_no_quote_match
    totals.dropped_unknown_reflection += v.dropped_unknown_reflection
    totals.aspirational += v.aspirational
    totals.claim_ids.push(...v.claim_ids)
  }
  // dedupe surfaced claim_ids on totals (the per-id distribution lives on the
  // outer report; per-totals just lists which ids surfaced at all).
  totals.claim_ids = [...new Set(totals.claim_ids)].sort()
  return totals
}

export function buildClaimIdDistribution(rows: PerFixtureRow[]): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const row of rows) {
    if (row.verifier === null) continue
    for (const id of row.verifier.claim_ids) {
      dist[id] = (dist[id] ?? 0) + 1
    }
  }
  return dist
}

export interface BuildStructuredReportInput {
  runner: 'openai' | 'managed'
  surface: 'mirror' | 'sensemake'
  ran_at: string
  model: string
  student_scope: string | null
  corpus_path: string
  rows: PerFixtureRow[]
  notes?: string
}

export function buildStructuredReport(input: BuildStructuredReportInput): AblationStructuredReport {
  return {
    runner: input.runner,
    surface: input.surface,
    ran_at: input.ran_at,
    model: input.model,
    student_scope: input.student_scope,
    corpus_path: input.corpus_path,
    rows_executed: input.rows.length,
    rows: input.rows,
    totals: {
      mirror: computeAgentTotals(input.rows, 'mirror'),
      connector: computeAgentTotals(input.rows, 'connector'),
      cartographer: computeAgentTotals(input.rows, 'cartographer'),
      verifier: aggregateVerifierCounters(input.rows),
    },
    claim_id_distribution: buildClaimIdDistribution(input.rows),
    notes: input.notes ?? '',
  }
}

