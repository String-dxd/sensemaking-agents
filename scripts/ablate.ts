#!/usr/bin/env tsx
/**
 * Ablation runner — `pnpm ablate:mirror` or `pnpm ablate:sensemake`.
 *
 * Drives the OpenAI Realtime Mirror + Claude managed-agent Connector path against the seeded
 * multi-student fixture corpus and emits a structured JSON report plus a
 * markdown scaffold under `test/ablation/reports/<date>-realtime-<surface>.json`
 * for human Likert scoring.
 *
 * Per-row semantics:
 *   - Mirror surface: one Mirror call per reflection in scope.
 *   - Sensemake surface: one Mirror call per reflection PLUS one Connector
 *     call per student against that student's most recent reflection (matches
 *     prod's `auto-connector.handler.server.ts`). The deterministic verifier
 *     post-processes Connector output. Cartographer is not invoked — its
 *     cost outweighs the signal at this scale.
 *
 * Live Mirror mode requires `OPENAI_API_KEY`. Sensemake mode also requires
 * `ANTHROPIC_API_KEY` plus the Connector managed-agent binding
 * (`MANAGED_AGENT_CONNECTOR_ID`, `MANAGED_AGENT_ENV_ID`). Without them, the script emits a placeholder
 * JSON + markdown (rows with `error: "no-api-key"`) so CI can verify wiring
 * without burning tokens.
 *
 * Flags:
 *   --surface=<mirror|sensemake>   required.
 *   --student=<id>                 scope to a single student in the seed
 *                                  corpus. If omitted, the run iterates the
 *                                  cross-student union.
 *   --limit=<n>                    cap the number of reflections processed.
 *                                  Default: all rows in scope.
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getManagedAgentBinding } from '~/agents/config'
import { buildConnectorContext } from '~/agents/context'
import {
  getOpenAIRealtimeMirrorConfig,
  OPENAI_REALTIME_MIRROR_DEFAULT_MODEL,
} from '~/agents/openai-realtime/config'
import { runOpenAIRealtimeMirror } from '~/agents/openai-realtime/mirror-runner'
import { ManagedAgentError, runManagedAgent } from '~/agents/runner'
import { type ConnectorDiffDraft, ConnectorDiffSchema } from '~/agents/schemas'
import { verifyProposedDiff } from '~/agents/verifier'
import { withStudent as withStudentDb } from '~/db/client'
import { listMirrorEntries } from '~/db/queries'
import { loadSeedCorpus, seed } from '~/db/seed'
import {
  type AgentRunStats,
  buildAblationReportMarkdown,
  buildStructuredReport,
  type PerFixtureRow,
  type VerifierVerdictCounters,
  zeroVerdictCounters,
} from '../test/ablation/score'

interface CliArgs {
  surface: 'mirror' | 'sensemake'
  student: string | undefined
  limit: number | undefined
}

function parseArgs(argv: string[]): CliArgs {
  const surfaceArg = argv.find((a) => a.startsWith('--surface='))
  const surface = surfaceArg?.split('=')[1]
  if (surface !== 'mirror' && surface !== 'sensemake') {
    console.error(
      'usage: tsx scripts/ablate.ts --surface=<mirror|sensemake> [--student=<id>] [--limit=<n>]',
    )
    process.exit(2)
  }
  const studentArg = argv.find((a) => a.startsWith('--student='))
  const student = studentArg?.split('=')[1] || undefined
  const limitArg = argv.find((a) => a.startsWith('--limit='))
  const limitRaw = limitArg?.split('=')[1]
  const limit = limitRaw === undefined ? undefined : Number.parseInt(limitRaw, 10)
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    console.error(`--limit=${limitRaw} must be a positive integer.`)
    process.exit(2)
  }
  return { surface, student, limit }
}

const args = parseArgs(process.argv.slice(2))

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

function loadReflectionsInScope(
  studentIds: string[],
  limit: number | undefined,
): ReflectionWithMeta[] {
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
    const output = await runOpenAIRealtimeMirror({
      studentId: row.student_id,
      transcript: row.transcript,
    })
    return {
      stats: {
        agent: 'mirror',
        latency_ms: Date.now() - startedAt,
        input_tokens: null,
        output_tokens: null,
        output_parsed: true,
        parse_error: null,
      },
      rawOutput: JSON.stringify(output),
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

/**
 * Connector pass: one `buildConnectorContext` + `runManagedAgent` invocation
 * per student in scope, against THAT student's most recent seeded
 * reflection. We pick the first student's draft as the "sample" the markdown
 * report surfaces; the per-student drafts are returned so the verifier
 * counters cover the full scope.
 */
async function runConnectorPerStudent(studentIds: string[]): Promise<{
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
  console.log(`ablate: starting connector loop — ${studentIds.length} student(s)`)
  let connectorIdx = 0
  for (const sid of studentIds) {
    connectorIdx++
    const callStart = Date.now()
    const entries = await listMirrorEntries(sid, { limit: 1 })
    const latest = entries[0]
    if (!latest) {
      parseErrors.push(`${sid}: no seeded mirror entries`)
      console.log(
        `ablate: [connector ${connectorIdx}/${studentIds.length}] ${sid} ` +
          `(skipped — no seeded mirror entries)`,
      )
      continue
    }
    try {
      const prompt = await withStudentDb(sid, (ctx) => buildConnectorContext(ctx, latest.id))
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
      console.log(
        `ablate: [connector ${connectorIdx}/${studentIds.length}] ${sid} ` +
          `(${Date.now() - callStart}ms, ok)`,
      )
    } catch (err) {
      const code = err instanceof ManagedAgentError ? `${err.code}` : 'UNKNOWN'
      const message = err instanceof Error ? err.message : String(err)
      parseErrors.push(`${sid}: [${code}] ${message}`)
      console.log(
        `ablate: [connector ${connectorIdx}/${studentIds.length}] ${sid} ` +
          `(${Date.now() - callStart}ms, ERR [${code}] ${message.slice(0, 60)})`,
      )
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

/**
 * Run the deterministic verifier over the Connector's flattened diff once
 * per student in scope. For ablation we treat each student's slice
 * independently: their reflection is the "new" mirror entry for the
 * verifier's R10 quote-match, and their existing timeline is empty.
 *
 * Returns the aggregate counters AND a list of canonical_claim_id values
 * that landed in admitted (used downstream for claim_id_distribution).
 */
async function verifyConnectorDraft(
  studentIds: string[],
  reflections: ReflectionWithMeta[],
  draft: ConnectorDiffDraft,
): Promise<VerifierVerdictCounters> {
  const counters = zeroVerdictCounters()
  for (const sid of studentIds) {
    const studentRows = reflections.filter((r) => r.student_id === sid)
    if (studentRows.length === 0) continue
    const dbEntries = await listMirrorEntries(sid, { limit: 1 })
    const mirrorEntry = dbEntries[0]
    if (!mirrorEntry) continue
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
      else if (dropped.reason === 'unknown_canonical_claim_id')
        counters.dropped_unknown_canonical_claim_id += 1
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
  const { surface, student, limit } = args
  const studentIds = resolveStudentIds(student)
  // Seed once so per-row Mirror calls can use search_past_mirrors against
  // a populated DB.
  await seed()
  const reflections = loadReflectionsInScope(studentIds, limit)

  const rows: PerFixtureRow[] = []
  let sampleMirrorOutput: string | null = null

  console.log(
    `ablate: starting mirror loop — ${reflections.length} reflection(s), surface=${surface}`,
  )
  let mirrorIdx = 0
  for (const reflection of reflections) {
    mirrorIdx++
    const { stats, rawOutput } = await runMirrorForRow(reflection)
    if (sampleMirrorOutput === null && rawOutput !== null) sampleMirrorOutput = rawOutput
    const tag = stats.parse_error ? `ERR ${stats.parse_error.slice(0, 60)}` : 'ok'
    console.log(
      `ablate: [mirror ${mirrorIdx}/${reflections.length}] ${reflection.student_id} ` +
        `(${stats.latency_ms}ms, ${tag})`,
    )
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
  let connectorStats: AgentRunStats | null = null
  let aggregateVerifier: VerifierVerdictCounters | null = null
  let sampleConnectorOutput: string | null = null

  if (surface === 'sensemake') {
    const cr = await runConnectorPerStudent(studentIds)
    connectorStats = cr.stats
    sampleConnectorOutput = cr.rawSampleOutput
    if (cr.draftsByStudent.size > 0) {
      aggregateVerifier = zeroVerdictCounters()
      for (const [sid, draft] of cr.draftsByStudent) {
        const partial = await verifyConnectorDraft([sid], reflections, draft)
        aggregateVerifier.admitted += partial.admitted
        aggregateVerifier.downgraded += partial.downgraded
        aggregateVerifier.dropped_no_quote_match += partial.dropped_no_quote_match
        aggregateVerifier.dropped_unknown_reflection += partial.dropped_unknown_reflection
        aggregateVerifier.dropped_unknown_canonical_claim_id +=
          partial.dropped_unknown_canonical_claim_id
        aggregateVerifier.aspirational += partial.aspirational
        aggregateVerifier.claim_ids.push(...partial.claim_ids)
      }
      aggregateVerifier.claim_ids = [...new Set(aggregateVerifier.claim_ids)].sort()
    }
  }

  // Attach connector + verifier to the LAST row in the list so the per-row
  // table is non-empty for the sensemake totals derivation.
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
    `${date}-realtime-${surface}${filenameSuffix}.json`,
  )
  const mdPath = resolve('test/ablation/reports', `${date}-realtime-${surface}${filenameSuffix}.md`)
  mkdirSync(resolve('test/ablation/reports'), { recursive: true })

  // Connector's runtime model is pinned by the agent version on Anthropic's side;
  // Mirror records the configured Realtime model id.
  function managedIdentity(name: 'connector'): string {
    try {
      const b = getManagedAgentBinding(name)
      return b.agentVersion !== undefined ? `${b.agentId}:v${b.agentVersion}` : b.agentId
    } catch {
      return `managed-${name}:unprovisioned`
    }
  }
  function openAIRealtimeMirrorIdentity(): string {
    try {
      return getOpenAIRealtimeMirrorConfig().model
    } catch {
      return process.env.OPENAI_REALTIME_MIRROR_MODEL || OPENAI_REALTIME_MIRROR_DEFAULT_MODEL
    }
  }
  const mirrorIdentity = openAIRealtimeMirrorIdentity()
  const connectorIdentity = surface === 'sensemake' ? managedIdentity('connector') : null
  const hasMirrorKey = process.env.OPENAI_API_KEY !== undefined && process.env.OPENAI_API_KEY !== ''
  const hasConnectorKey =
    process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== ''
  const hasKey = surface === 'sensemake' ? hasMirrorKey && hasConnectorKey : hasMirrorKey
  const liveModelLabel =
    surface === 'sensemake'
      ? `${mirrorIdentity} (OpenAI Realtime Mirror) / ${connectorIdentity ?? 'managed'} (Claude Connector)`
      : `${mirrorIdentity} (OpenAI Realtime Mirror)`
  const structuredNote = hasKey
    ? `Live run against ${liveModelLabel}. Cartographer skipped — see plan §9.3 step 3 for the manual review surface.`
    : `Placeholder run — required provider keys not set; rows carry error="no-api-key". Set OPENAI_API_KEY for Mirror and ANTHROPIC_API_KEY for Connector sensemake runs.`

  const structured = buildStructuredReport({
    runner: 'openai-realtime',
    surface,
    ran_at: ranAt,
    model: mirrorIdentity,
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
      ? (sampleMirrorOutput ?? '{"placeholder":true,"reason":"no rows ran"}')
      : (sampleConnectorOutput ?? '{"placeholder":true,"reason":"no Connector pass"}')
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
          '{"placeholder":true,"reason":"runner-comparison era retired; see JSON for per-row metrics"}',
      },
      notes: hasKey
        ? `Live run against ${liveModelLabel}. ${studentNote}`
        : `Placeholder run — required provider keys not set. ${studentNote}`,
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
