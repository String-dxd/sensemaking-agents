#!/usr/bin/env tsx
/**
 * Ablation runner — `pnpm ablate:mirror` or `pnpm ablate:sensemake`.
 *
 * Extended in plan
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md` (Step 1):
 *
 *   - `--runner=openai|managed` selects which agent backend to drive. Today
 *     only `openai` is wired; `--runner=managed` errors with
 *     "managed runner not implemented" and is wired in Step 6 when
 *     `src/agents/runner.ts` lands. Holding the placeholder here lets the
 *     CLI surface stabilize before the runner exists.
 *   - Emits a structured JSON report
 *     (`test/ablation/reports/<ts>-<runner>-<surface>[-student].json`) with
 *     per-row Mirror stats + aggregate Connector + Verifier verdicts +
 *     claim-id distribution. Consumed by `.github/workflows/ablation.yml`
 *     to post a PR-comment delta vs the last `main` JSON (plan §9.3).
 *   - Markdown report (`buildAblationReportMarkdown`) is preserved alongside
 *     for human Likert scoring on the cutover-gate review (plan §9.3 step 3).
 *     The "ON variant raw output" block now carries the runner's output;
 *     "OFF" is an n/a placeholder in the runner-comparison era.
 *
 * Per-row semantics:
 *   - Mirror surface: one Mirror call per reflection in scope (cost = N
 *     Mirror invocations).
 *   - Sensemake surface: one Mirror call per reflection PLUS a single
 *     whole-corpus Connector call at the end (with the deterministic
 *     Verifier post-processing its diff). Cartographer is not invoked in
 *     ablation — its cost outweighs the signal at this scale; the cutover
 *     gate's manual review of 5 Cartographer outputs (plan §9.3 step 3)
 *     stays the right surface for that quality check.
 *
 * Live mode requires `OPENAI_API_KEY`. Without it, the script emits a
 * placeholder JSON + markdown (rows with `error: "no-api-key"`) so CI can
 * verify the script wiring without burning tokens.
 *
 * Flags:
 *   --surface=<mirror|sensemake>   required.
 *   --runner=<openai|managed>      default 'openai'. 'managed' errors today.
 *   --model=<id>                   overrides `process.env.AGENT_MODEL` before
 *                                  any agent-side import.
 *   --student=<id>                 scope to a single student in the seed
 *                                  corpus. If omitted, the run iterates the
 *                                  cross-student union.
 *   --limit=<n>                    cap the number of reflections processed.
 *                                  Default: all rows in scope.
 */
import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Agent, run } from '@openai/agents'
import {
  type AgentRunStats,
  buildAblationReportMarkdown,
  buildStructuredReport,
  type PerFixtureRow,
  type VerifierVerdictCounters,
  zeroVerdictCounters,
} from '../test/ablation/score'

// Vite's ?raw import works in the bundle but not under tsx; read prompts from disk.
const mirrorPrompt = readFileSync(resolve('src/agents/mirror.prompt.md'), 'utf8')
const connectorPrompt = readFileSync(resolve('src/agents/connector.prompt.md'), 'utf8')

interface CliArgs {
  surface: 'mirror' | 'sensemake'
  runner: 'openai' | 'managed'
  model: string | undefined
  student: string | undefined
  limit: number | undefined
}

function parseArgs(argv: string[]): CliArgs {
  const surfaceArg = argv.find((a) => a.startsWith('--surface='))
  const surface = surfaceArg?.split('=')[1]
  if (surface !== 'mirror' && surface !== 'sensemake') {
    console.error(
      'usage: tsx scripts/ablate.ts --surface=<mirror|sensemake> [--runner=<openai|managed>] [--model=<id>] [--student=<id>] [--limit=<n>]',
    )
    process.exit(2)
  }
  const runnerArg = argv.find((a) => a.startsWith('--runner='))
  const runnerRaw = runnerArg?.split('=')[1] ?? 'openai'
  if (runnerRaw !== 'openai' && runnerRaw !== 'managed') {
    console.error(`--runner=${runnerRaw} is not valid. Use 'openai' or 'managed'.`)
    process.exit(2)
  }
  const modelArg = argv.find((a) => a.startsWith('--model='))
  const model = modelArg?.split('=')[1] || undefined
  const studentArg = argv.find((a) => a.startsWith('--student='))
  const student = studentArg?.split('=')[1] || undefined
  const limitArg = argv.find((a) => a.startsWith('--limit='))
  const limitRaw = limitArg?.split('=')[1]
  const limit = limitRaw === undefined ? undefined : Number.parseInt(limitRaw, 10)
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    console.error(`--limit=${limitRaw} must be a positive integer.`)
    process.exit(2)
  }
  return { surface, runner: runnerRaw, model, student, limit }
}

// ── CLI parse + env-set must happen before any agent-side import. ─────────
// `selfCritiqueTool` instantiates an Agent at module-load time using
// `SELF_CRITIQUE_MODEL`, which reads `process.env.AGENT_MODEL` once. Set the
// override here so the lazy imports below see the right value.
const args = parseArgs(process.argv.slice(2))
if (args.model !== undefined) {
  process.env.AGENT_MODEL = args.model
}

// ── Managed runner — Mirror is wired in Step 6, Connector in Step 8.
// Cartographer (the rest of sensemake) is still pending Step 9; we only
// run Mirror + Connector under `--runner=managed --surface=sensemake`
// today, matching what the prod `auto-connector.handler.server.ts` does.

// Lazy-load anything that reads AGENT_MODEL via `src/agents/config.ts`.
const [
  schemasMod,
  configMod,
  ecgToolMod,
  vipsToolMod,
  corpusToolMod,
  selfCritiqueMod,
  runnerMod,
  dbClientMod,
  queriesMod,
  seedMod,
  verifierMod,
  contextMod,
] = await Promise.all([
  import('~/agents/schemas'),
  import('~/agents/config'),
  import('~/agents/tools/lookup-ecg-taxonomy'),
  import('~/agents/tools/lookup-vips-taxonomy'),
  import('~/agents/tools/search-corpus.server'),
  import('~/agents/tools/self-critique'),
  import('~/agents/runner'),
  import('~/db/client'),
  import('~/db/queries'),
  import('~/db/seed'),
  import('~/agents/verifier'),
  import('~/agents/context'),
])
const { MirrorOutputSchema, ConnectorDiffSchema } = schemasMod
type ConnectorDiffDraft = (typeof schemasMod)['ConnectorDiffSchema']['_output']
const { MIRROR_MODEL, CONNECTOR_MODEL, getManagedAgentBinding } = configMod
const { runManagedAgent, ManagedAgentError } = runnerMod
const { lookupEcgTaxonomyTool } = ecgToolMod
const { lookupVipsTaxonomyTool } = vipsToolMod
const { searchCorpusToolFor } = corpusToolMod
const { selfCritiqueTool } = selfCritiqueMod
const { openDb } = dbClientMod
const { listMirrorEntries } = queriesMod
const { seed, loadSeedCorpus } = seedMod
const { verifyProposedDiff } = verifierMod
const { buildConnectorContext } = contextMod

function resolveStudentIds(studentFlag: string | undefined): string[] {
  const corpus = loadSeedCorpus()
  const known = corpus.students.map((s) => s.student_id)
  if (studentFlag === undefined) return known
  if (!known.includes(studentFlag)) {
    console.error(
      `--student=${studentFlag} is not in the seed corpus. Known students: ${known.join(', ')}`,
    )
    process.exit(2)
  }
  return [studentFlag]
}

interface ReflectionWithMeta {
  student_id: string
  context_type: string
  transcript: string
  created_at: string
}

function loadReflectionsInScope(studentIds: string[], limit: number | undefined): ReflectionWithMeta[] {
  const corpus = loadSeedCorpus()
  const flat: ReflectionWithMeta[] = []
  for (const s of corpus.students) {
    if (!studentIds.includes(s.student_id)) continue
    for (const r of s.reflections) {
      flat.push({
        student_id: s.student_id,
        context_type: r.context_type,
        transcript: r.transcript,
        created_at: r.created_at,
      })
    }
  }
  return limit === undefined ? flat : flat.slice(0, limit)
}

/**
 * Format a corpus block for Connector: every Mirror entry across the
 * student-in-scope set, oldest-first. Mirrors `formatCorpusForAgent` in
 * `src/agents/handoff-chain.ts` but reads from the DB after seed so it
 * sees the persisted (Mirror-reframed) entries.
 */
function formatConnectorCorpus(studentIds: string[]): string {
  openDb()
  seed()
  const blocks = studentIds.map((sid) => {
    const entries = listMirrorEntries(sid, { limit: 200 })
    const body = entries
      .slice()
      .reverse()
      .map(
        (e) =>
          `# Reflection #${e.id} — ${e.created_at}\n\nStory: ${e.story_reframe}\n\nValidation: ${e.validation}\nInferred meaning: ${e.inferred_meaning}\n\nTranscript: ${e.transcript}`,
      )
      .join('\n\n---\n\n')
    return studentIds.length === 1 ? body : `## Student ${sid}\n\n${body}`
  })
  return blocks.join('\n\n===\n\n')
}

interface RunStatsExtract {
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

/**
 * Pull usage stats from the OpenAI Agents SDK result. The run-level
 * cumulative usage lives at `result.state.context.usage` as a `Usage`
 * instance carrying `inputTokens`/`outputTokens`/`totalTokens`/`requests`.
 * We read defensively via `unknown` casts so a shape change in the SDK
 * surfaces as null tokens rather than a crash.
 */
function extractUsage(result: unknown, startedAt: number): RunStatsExtract {
  const latencyMs = Date.now() - startedAt
  const state = (result as {
    state?: { context?: { usage?: { inputTokens?: number; outputTokens?: number } } }
  }).state
  const usage = state?.context?.usage
  return {
    inputTokens: typeof usage?.inputTokens === 'number' ? usage.inputTokens : null,
    outputTokens: typeof usage?.outputTokens === 'number' ? usage.outputTokens : null,
    latencyMs,
  }
}

const MIRROR_USER_PROMPT_PREFIX =
  'The student spoke this transcript while looking into a webcam mirror. They are no longer present. Reflect what was said back in three parts.\n\nTranscript:\n\n'

/**
 * Mirror invocation under the managed-agents path. Mirrors `runMirrorForRow`
 * but dispatches via `runManagedAgent` instead of the `@openai/agents`
 * runtime. Token usage is summed across `span.model_request_end` events
 * inside the runner.
 */
async function runMirrorManagedForRow(
  row: ReflectionWithMeta,
): Promise<{ stats: AgentRunStats; rawOutput: string | null }> {
  const startedAt = Date.now()
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      stats: {
        agent: 'mirror',
        latency_ms: 0,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: 'no-api-key',
      },
      rawOutput: null,
    }
  }
  try {
    const binding = getManagedAgentBinding('mirror')
    const result = await runManagedAgent({
      agentId: binding.agentId,
      ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
      environmentId: binding.environmentId,
      prompt: `${MIRROR_USER_PROMPT_PREFIX}${row.transcript}`,
      outputSchema: MirrorOutputSchema,
      sessionTitle: `ablate:mirror:${row.student_id}`,
    })
    return {
      stats: {
        agent: 'mirror',
        latency_ms: Date.now() - startedAt,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        output_parsed: true,
        parse_error: null,
      },
      rawOutput: result.rawText,
    }
  } catch (err) {
    const message =
      err instanceof ManagedAgentError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err)
    return {
      stats: {
        agent: 'mirror',
        latency_ms: Date.now() - startedAt,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: message,
      },
      rawOutput: null,
    }
  }
}

async function runMirrorForRow(
  row: ReflectionWithMeta,
): Promise<{ stats: AgentRunStats; rawOutput: string | null }> {
  const startedAt = Date.now()
  if (!process.env.OPENAI_API_KEY) {
    return {
      stats: {
        agent: 'mirror',
        latency_ms: 0,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: 'no-api-key',
      },
      rawOutput: null,
    }
  }
  try {
    const agent = new Agent({
      name: 'mirror-ablation',
      model: MIRROR_MODEL,
      instructions: mirrorPrompt,
      tools: [searchCorpusToolFor(row.student_id)],
      outputType: MirrorOutputSchema,
    })
    const result = await run(
      agent,
      `The student spoke this transcript while looking into a webcam mirror. They are no longer present. Reflect what was said back in three parts.\n\nTranscript:\n\n${row.transcript}`,
    )
    const usage = extractUsage(result, startedAt)
    const parsed = MirrorOutputSchema.safeParse(result.finalOutput)
    return {
      stats: {
        agent: 'mirror',
        latency_ms: usage.latencyMs,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        output_parsed: parsed.success,
        parse_error: parsed.success ? null : parsed.error.message,
      },
      rawOutput: JSON.stringify(result.finalOutput),
    }
  } catch (err) {
    return {
      stats: {
        agent: 'mirror',
        latency_ms: Date.now() - startedAt,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: err instanceof Error ? err.message : String(err),
      },
      rawOutput: null,
    }
  }
}

interface ConnectorRunResult {
  stats: AgentRunStats
  draft: ConnectorDiffDraft | null
  rawOutput: string | null
}

/**
 * Managed-runner Connector pass. Mirrors `runAutoConnectorAfterMirror`'s
 * shape: one `buildConnectorContext` + `runManagedAgent` invocation per
 * student in scope, against THAT student's most recent seeded reflection.
 * We pick the first student's draft as the "sample" the markdown report
 * surfaces; the per-student drafts are returned so the verifier counters
 * cover the full scope.
 *
 * The whole-corpus shape `runConnectorWholeCorpus` uses is OpenAI-runtime-
 * specific (v0.1 chain heritage). For the managed path we honor prod's
 * per-reflection contract — Connector never sees a multi-student blob in
 * production.
 */
async function runConnectorManagedPerStudent(
  studentIds: string[],
): Promise<{
  stats: AgentRunStats
  draftsByStudent: Map<string, ConnectorDiffDraft>
  rawSampleOutput: string | null
}> {
  const startedAt = Date.now()
  const draftsByStudent = new Map<string, ConnectorDiffDraft>()
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      stats: {
        agent: 'connector',
        latency_ms: 0,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: 'no-api-key',
      },
      draftsByStudent,
      rawSampleOutput: null,
    }
  }
  let binding: ReturnType<typeof getManagedAgentBinding>
  try {
    binding = getManagedAgentBinding('connector')
  } catch (err) {
    return {
      stats: {
        agent: 'connector',
        latency_ms: 0,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: err instanceof Error ? err.message : String(err),
      },
      draftsByStudent,
      rawSampleOutput: null,
    }
  }

  let aggInput = 0
  let aggOutput = 0
  let rawSampleOutput: string | null = null
  const parseErrors: string[] = []
  for (const sid of studentIds) {
    const entries = listMirrorEntries(sid, { limit: 1 })
    const latest = entries[0]
    if (!latest) {
      parseErrors.push(`${sid}: no seeded mirror entries`)
      continue
    }
    try {
      const prompt = buildConnectorContext(sid, latest.id)
      const result = await runManagedAgent({
        agentId: binding.agentId,
        ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
        environmentId: binding.environmentId,
        prompt,
        outputSchema: ConnectorDiffSchema,
        sessionTitle: `ablate:connector:${sid}`,
      })
      aggInput += result.usage.inputTokens
      aggOutput += result.usage.outputTokens
      draftsByStudent.set(sid, result.output)
      if (rawSampleOutput === null) rawSampleOutput = result.rawText
    } catch (err) {
      const code = err instanceof ManagedAgentError ? `${err.code}` : 'UNKNOWN'
      const message = err instanceof Error ? err.message : String(err)
      parseErrors.push(`${sid}: [${code}] ${message}`)
    }
  }

  return {
    stats: {
      agent: 'connector',
      latency_ms: Date.now() - startedAt,
      input_tokens: aggInput,
      output_tokens: aggOutput,
      output_parsed: parseErrors.length === 0 && draftsByStudent.size > 0,
      parse_error: parseErrors.length === 0 ? null : parseErrors.join(' | '),
    },
    draftsByStudent,
    rawSampleOutput,
  }
}

async function runConnectorWholeCorpus(
  studentIds: string[],
  corpus: string,
): Promise<ConnectorRunResult> {
  const startedAt = Date.now()
  if (!process.env.OPENAI_API_KEY) {
    return {
      stats: {
        agent: 'connector',
        latency_ms: 0,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: 'no-api-key',
      },
      draft: null,
      rawOutput: null,
    }
  }
  // Tools are bound to the first in-scope student for ablation; the corpus
  // body itself carries all students' rows when --student is omitted.
  const tenancySid = studentIds[0] ?? 'demo-a'
  try {
    const agent = new Agent({
      name: 'connector-ablation',
      model: CONNECTOR_MODEL,
      instructions: connectorPrompt,
      tools: [
        searchCorpusToolFor(tenancySid),
        lookupEcgTaxonomyTool,
        lookupVipsTaxonomyTool,
        selfCritiqueTool,
      ],
      outputType: ConnectorDiffSchema,
    })
    const result = await run(agent, corpus)
    const usage = extractUsage(result, startedAt)
    const parsed = ConnectorDiffSchema.safeParse(result.finalOutput)
    return {
      stats: {
        agent: 'connector',
        latency_ms: usage.latencyMs,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        output_parsed: parsed.success,
        parse_error: parsed.success ? null : parsed.error.message,
      },
      draft: parsed.success ? parsed.data : null,
      rawOutput: JSON.stringify(result.finalOutput),
    }
  } catch (err) {
    return {
      stats: {
        agent: 'connector',
        latency_ms: Date.now() - startedAt,
        input_tokens: null,
        output_tokens: null,
        output_parsed: false,
        parse_error: err instanceof Error ? err.message : String(err),
      },
      draft: null,
      rawOutput: null,
    }
  }
}

/**
 * Run the deterministic verifier over the Connector's flattened diff once
 * per student in scope. For ablation we treat each student's slice
 * independently: their reflection is the "new" mirror entry for the
 * verifier's R10 quote-match, and their existing timeline is empty
 * (cumulative state across rows is a v0.3 concern — see plan §9.2).
 *
 * Returns the aggregate counters AND a list of canonical_claim_id values
 * that landed in admitted (used downstream for claim_id_distribution).
 */
function verifyConnectorDraft(
  studentIds: string[],
  reflections: ReflectionWithMeta[],
  draft: ConnectorDiffDraft,
): VerifierVerdictCounters {
  const counters = zeroVerdictCounters()
  for (const sid of studentIds) {
    const studentRows = reflections.filter((r) => r.student_id === sid)
    if (studentRows.length === 0) continue
    // Most recent reflection's id (DB-side after seed; we pull from listMirrorEntries
    // for the true id, since the verifier checks `reflection_id` equality).
    const dbEntries = listMirrorEntries(sid, { limit: 1 })
    const mirrorEntry = dbEntries[0]
    if (!mirrorEntry) continue
    // Flatten ConnectorDiff per-dimension entries into a single list with
    // `dimension` attached for the verifier's `ProposedTimelineEntryDraft`.
    const flat: Array<{
      dimension: string
      canonical_claim_id: string
      verbatim_quote: string
      reflection_id: number
      strength: 'low' | 'medium' | 'high'
      parallax_tag: Array<'school' | 'family' | 'peer' | 'hobby' | 'civic'>
    }> = []
    for (const dim of ['values', 'interests', 'personality', 'skills'] as const) {
      const dimDiff = draft.diffs[dim]
      for (const entry of dimDiff.new_timeline_entries) {
        flat.push({
          dimension: dim,
          canonical_claim_id: entry.canonical_claim_id,
          verbatim_quote: entry.verbatim_quote,
          reflection_id: entry.reflection_id,
          strength: entry.strength,
          parallax_tag: entry.parallax_tag,
        })
      }
    }
    const result = verifyProposedDiff({
      diff: { timeline_entries: flat },
      mirrorEntry: {
        id: mirrorEntry.id,
        transcript: mirrorEntry.transcript,
        context_type: mirrorEntry.context_type,
      },
      existingTimelineEntries: [],
    })
    counters.admitted += result.admitted.length
    counters.downgraded += result.downgraded.length
    for (const dropped of result.dropped) {
      if (dropped.reason === 'no_quote_match') counters.dropped_no_quote_match += 1
      else if (dropped.reason === 'unknown_reflection') counters.dropped_unknown_reflection += 1
    }
    for (const ann of [...result.admitted, ...result.downgraded]) {
      if (ann.aspirational) counters.aspirational += 1
      counters.claim_ids.push(ann.canonical_claim_id)
    }
  }
  counters.claim_ids = [...new Set(counters.claim_ids)].sort()
  return counters
}

async function main() {
  const { surface, runner, student, limit } = args
  const studentIds = resolveStudentIds(student)
  // Seed once so per-row Mirror calls can use search_past_mirrors against
  // a populated DB.
  openDb()
  seed()
  const reflections = loadReflectionsInScope(studentIds, limit)

  // ── per-row Mirror loop ──
  const rows: PerFixtureRow[] = []
  // We also keep one full Mirror output to surface in the markdown's ON block
  // (informational; the structured JSON carries the per-row detail).
  let sampleMirrorOutput: string | null = null

  for (const reflection of reflections) {
    const { stats, rawOutput } =
      args.runner === 'managed'
        ? await runMirrorManagedForRow(reflection)
        : await runMirrorForRow(reflection)
    if (sampleMirrorOutput === null && rawOutput !== null) sampleMirrorOutput = rawOutput
    rows.push({
      reflection_id: null,
      student_id: reflection.student_id,
      context_type: reflection.context_type,
      mirror: stats,
      connector: null,
      cartographer: null,
      verifier: null,
      error: stats.parse_error,
    })
  }

  // ── Connector + Verifier pass for sensemake ──
  // OpenAI runner: one whole-corpus Connector call (v0.1 chain heritage).
  // Managed runner: one Connector call per student against their latest
  // reflection (matches prod's `auto-connector.handler.server.ts`).
  let connectorStats: AgentRunStats | null = null
  let aggregateVerifier: VerifierVerdictCounters | null = null
  let sampleConnectorOutput: string | null = null

  if (surface === 'sensemake') {
    if (runner === 'managed') {
      const cr = await runConnectorManagedPerStudent(studentIds)
      connectorStats = cr.stats
      sampleConnectorOutput = cr.rawSampleOutput
      if (cr.draftsByStudent.size > 0) {
        aggregateVerifier = zeroVerdictCounters()
        for (const [sid, draft] of cr.draftsByStudent) {
          const partial = verifyConnectorDraft([sid], reflections, draft)
          aggregateVerifier.admitted += partial.admitted
          aggregateVerifier.downgraded += partial.downgraded
          aggregateVerifier.dropped_no_quote_match += partial.dropped_no_quote_match
          aggregateVerifier.dropped_unknown_reflection += partial.dropped_unknown_reflection
          aggregateVerifier.aspirational += partial.aspirational
          aggregateVerifier.claim_ids.push(...partial.claim_ids)
        }
        aggregateVerifier.claim_ids = [...new Set(aggregateVerifier.claim_ids)].sort()
      }
    } else {
      const corpusBlock = formatConnectorCorpus(studentIds)
      const cr = await runConnectorWholeCorpus(studentIds, corpusBlock)
      connectorStats = cr.stats
      sampleConnectorOutput = cr.rawOutput
      if (cr.draft) {
        aggregateVerifier = verifyConnectorDraft(studentIds, reflections, cr.draft)
      }
    }
  }

  // Attach connector + verifier to the LAST row in the list so the per-row
  // table is non-empty for the sensemake totals derivation. Per-row Connector
  // would require per-row cumulative state in the DB — deferred (see plan §9.2).
  if (surface === 'sensemake' && rows.length > 0) {
    const lastIdx = rows.length - 1
    const lastRow = rows[lastIdx]
    if (lastRow) {
      lastRow.connector = connectorStats
      lastRow.verifier = aggregateVerifier
    }
  }

  // ── emit JSON ──
  const ranAt = new Date().toISOString()
  const date = ranAt.slice(0, 10)
  const filenameSuffix = student ? `-${student}` : ''
  const jsonPath = resolve(
    'test/ablation/reports',
    `${date}-${runner}-${surface}${filenameSuffix}.json`,
  )
  const mdPath = resolve(
    'test/ablation/reports',
    `${date}-${runner}-${surface}${filenameSuffix}.md`,
  )
  mkdirSync(resolve('test/ablation/reports'), { recursive: true })

  // Note + report-model identity differ per runner. For the managed runner
  // the runtime model is pinned by the agent version on Anthropic's side, so
  // the report records the agent id/version rather than a local model id.
  function managedIdentity(name: 'mirror' | 'connector'): string {
    try {
      const b = getManagedAgentBinding(name)
      return b.agentVersion !== undefined ? `${b.agentId}:v${b.agentVersion}` : b.agentId
    } catch {
      return `managed-${name}:unprovisioned`
    }
  }
  const managedMirrorIdentity = runner === 'managed' ? managedIdentity('mirror') : null
  const managedConnectorIdentity =
    runner === 'managed' && surface === 'sensemake' ? managedIdentity('connector') : null
  const requiredKey = runner === 'managed' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const hasKey = process.env[requiredKey] !== undefined && process.env[requiredKey] !== ''
  const liveModelLabel =
    runner === 'managed'
      ? surface === 'sensemake'
        ? `${managedMirrorIdentity ?? 'managed'} (Mirror) / ${managedConnectorIdentity ?? 'managed'} (Connector)`
        : (managedMirrorIdentity ?? 'managed')
      : `${MIRROR_MODEL} (Mirror) / ${CONNECTOR_MODEL} (Connector)`
  const structuredNote = hasKey
    ? `Live run via runner=\`${runner}\` against ${liveModelLabel}. Cartographer skipped — see plan §9.3 step 3 for the manual review surface.`
    : `Placeholder run — ${requiredKey} not set; every row carries error="no-api-key". Set the key to populate real metrics.`

  const structured = buildStructuredReport({
    runner,
    surface,
    ran_at: ranAt,
    model: runner === 'managed' ? (managedMirrorIdentity ?? 'managed') : MIRROR_MODEL,
    student_scope: student ?? null,
    corpus_path: 'test/ablation/fixtures/seed-multistudent.json',
    rows,
    notes: structuredNote,
  })
  writeFileSync(jsonPath, `${JSON.stringify(structured, null, 2)}\n`, 'utf8')

  const studentNote = student
    ? `Scoped to student \`${student}\`.`
    : `Cross-student union over: ${studentIds.map((s) => `\`${s}\``).join(', ')}.`
  const onBlock =
    surface === 'mirror'
      ? sampleMirrorOutput ?? '{"placeholder":true,"reason":"no rows ran"}'
      : sampleConnectorOutput ?? '{"placeholder":true,"reason":"no Connector pass"}'
  writeFileSync(
    mdPath,
    buildAblationReportMarkdown({
      surface,
      ranAt,
      corpusPath: 'test/ablation/fixtures/seed-multistudent.json',
      studentId: student,
      on: { variant: 'on', rawOutput: onBlock },
      off: {
        variant: 'off',
        rawOutput:
          '{"placeholder":true,"reason":"runner-comparison era: OFF retired; see JSON for per-row metrics"}',
      },
      notes: hasKey
        ? `Live run via runner=\`${runner}\` against ${liveModelLabel}. ${studentNote}`
        : `Placeholder run — ${requiredKey} not set. ${studentNote}`,
    }),
    'utf8',
  )

  console.log(`ablate: wrote ${jsonPath}`)
  console.log(`ablate: wrote ${mdPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
