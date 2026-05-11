#!/usr/bin/env tsx
/**
 * Ablation runner — `pnpm ablate:mirror` or `pnpm ablate:sensemake`.
 *
 * Loads the v0.2 multi-student corpus (U13) and runs the agent with the
 * tool surface ON and OFF, writing a Markdown report under
 * `test/ablation/reports/` for a human to score against the five v0.2
 * rubric dimensions (provenance, specificity, novelty, anti-sycophancy,
 * parallax_discipline).
 *
 * v0.2 does not auto-score quality — see plan U13 + K.T.D. #6.
 *
 * Live mode requires `OPENAI_API_KEY`. Without it, the script writes a
 * report with placeholder ON/OFF outputs so the scaffold is ready for a
 * hand-iterated session, and exits 0 (so CI can verify the script runs
 * without burning tokens).
 *
 * Flags:
 *   --surface=<mirror|sensemake>   required.
 *   --model=<id>                   overrides `process.env.AGENT_MODEL` for
 *                                  this run; honored *before* any agent-side
 *                                  import (selfCritiqueTool builds an Agent
 *                                  at module-load time).
 *   --student=<id>                 v0.2: scope the run to a single student
 *                                  in the multi-student corpus. If omitted,
 *                                  the run is over the cross-student union
 *                                  (concatenated corpus, cross-student
 *                                  isolation preserved via `withStudent`
 *                                  per query). Per-student report filename:
 *                                  `YYYY-MM-DD-<surface>-ablation-<student_id>.md`;
 *                                  union report:
 *                                  `YYYY-MM-DD-<surface>-ablation.md`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Agent, run } from '@openai/agents'
import { buildAblationReportMarkdown } from '../test/ablation/score'

// Vite's ?raw import works in the bundle but not under tsx; read prompts from disk.
const mirrorPrompt = readFileSync(resolve('src/agents/mirror.prompt.md'), 'utf8')
const connectorPrompt = readFileSync(resolve('src/agents/connector.prompt.md'), 'utf8')
const pathfinderPrompt = readFileSync(resolve('src/agents/pathfinder.prompt.md'), 'utf8')

interface CliArgs {
  surface: 'mirror' | 'sensemake'
  model: string | undefined
  student: string | undefined
}

function parseArgs(argv: string[]): CliArgs {
  const surfaceArg = argv.find((a) => a.startsWith('--surface='))
  const surface = surfaceArg?.split('=')[1]
  if (surface !== 'mirror' && surface !== 'sensemake') {
    console.error(
      'usage: tsx scripts/ablate.ts --surface=<mirror|sensemake> [--model=<id>] [--student=<id>]',
    )
    process.exit(2)
  }
  const modelArg = argv.find((a) => a.startsWith('--model='))
  const model = modelArg?.split('=')[1] || undefined
  const studentArg = argv.find((a) => a.startsWith('--student='))
  const student = studentArg?.split('=')[1] || undefined
  return { surface, model, student }
}

// ── CLI parse + env-set must happen before any agent-side import. ─────────
// `selfCritiqueTool` instantiates an Agent at module-load time using
// `SELF_CRITIQUE_MODEL`, which reads `process.env.AGENT_MODEL` once. Set the
// override here so the lazy imports below see the right value.
const args = parseArgs(process.argv.slice(2))
if (args.model !== undefined) {
  process.env.AGENT_MODEL = args.model
}

// Lazy-load anything that reads AGENT_MODEL via `src/agents/config.ts`.
const [
  { ConnectorOutputSchema, CartographerOutputSchema },
  { MIRROR_MODEL, CONNECTOR_MODEL, CARTOGRAPHER_MODEL },
  { lookupEcgTaxonomyTool },
  { searchCorpusToolFor },
  { selfCritiqueTool },
  { openDb },
  { listMirrorEntries },
  { seed, loadSeedCorpus },
] = await Promise.all([
  import('~/agents/schemas'),
  import('~/agents/config'),
  import('~/agents/tools/lookup-ecg-taxonomy'),
  import('~/agents/tools/search-corpus.server'),
  import('~/agents/tools/self-critique'),
  import('~/db/client'),
  import('~/db/queries'),
  import('~/db/seed'),
])

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

function formatCorpus(studentIds: string[]): string {
  openDb()
  // Seed if empty so the script is reproducible.
  seed()
  // `withStudent` boundary: each query is scoped per-student id, so even the
  // cross-student union here cannot leak rows between tenants.
  const blocks = studentIds.map((sid) => {
    const entries = listMirrorEntries(sid, { limit: 200 })
    const body = entries
      .slice()
      .reverse()
      .map(
        (e) =>
          `# Reflection #${e.id} — ${e.created_at}\n${e.story_reframe}\n\nValidation: ${e.validation}\nInferred meaning: ${e.inferred_meaning}`,
      )
      .join('\n\n---\n\n')
    return studentIds.length === 1 ? body : `## Student ${sid}\n\n${body}`
  })
  return blocks.join('\n\n===\n\n')
}

async function runMirrorVariant(opts: {
  tools: 'on' | 'off'
  corpus: string
  studentIds: string[]
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return placeholderOutput('mirror', opts.tools)
  // The Mirror live path is voice-WebRTC; for the ablation we approximate by
  // running a text-mode Mirror agent against the same prompt + corpus so the
  // signal-shape difference is what's compared, not the modality.
  // When scoped to a single student, search_past_mirrors is bound to that
  // student; for the union run, the first student in the list is used as the
  // tool's tenancy boundary (the union prompt body itself carries all rows).
  const tenancySid = opts.studentIds[0] ?? 'demo-a'
  const tools = opts.tools === 'on' ? [searchCorpusToolFor(tenancySid)] : []
  const agent = new Agent({
    name: 'mirror-ablation',
    model: MIRROR_MODEL,
    instructions: mirrorPrompt,
    tools,
  })
  const result = await run(
    agent,
    `You are reading a corpus of past reflections. Imagine the student just shared one new reflection. Surface signals + caution as if Mirror just listened.\n\n${opts.corpus}`,
  )
  return JSON.stringify(result.finalOutput, null, 2)
}

async function runSensemakeVariant(opts: {
  tools: 'on' | 'off'
  corpus: string
  studentIds: string[]
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return placeholderOutput('sensemake', opts.tools)
  const tenancySid = opts.studentIds[0] ?? 'demo-a'
  const tools =
    opts.tools === 'on'
      ? [searchCorpusToolFor(tenancySid), lookupEcgTaxonomyTool, selfCritiqueTool]
      : []
  const connector = new Agent({
    name: 'connector-ablation',
    model: CONNECTOR_MODEL,
    instructions: connectorPrompt,
    tools,
    outputType: ConnectorOutputSchema,
  })
  const pathfinder = new Agent({
    name: 'pathfinder-ablation',
    model: CARTOGRAPHER_MODEL,
    instructions: pathfinderPrompt,
    tools,
    outputType: CartographerOutputSchema,
  })
  const connectorResult = await run(connector, opts.corpus)
  const pathfinderResult = await run(
    pathfinder,
    `Connector handed off:\n\n${JSON.stringify(connectorResult.finalOutput, null, 2)}`,
  )
  return JSON.stringify(
    {
      connector: connectorResult.finalOutput,
      pathfinder: pathfinderResult.finalOutput,
    },
    null,
    2,
  )
}

function placeholderOutput(surface: 'mirror' | 'sensemake', variant: 'on' | 'off'): string {
  return JSON.stringify(
    {
      placeholder: true,
      reason: 'OPENAI_API_KEY not set — run live to populate. See plan U13 / K.T.D. #6.',
      surface,
      variant,
    },
    null,
    2,
  )
}

async function main() {
  const { surface, student } = args
  const studentIds = resolveStudentIds(student)
  const corpus = formatCorpus(studentIds)

  const [onOutput, offOutput] = await Promise.all([
    surface === 'mirror'
      ? runMirrorVariant({ tools: 'on', corpus, studentIds })
      : runSensemakeVariant({ tools: 'on', corpus, studentIds }),
    surface === 'mirror'
      ? runMirrorVariant({ tools: 'off', corpus, studentIds })
      : runSensemakeVariant({ tools: 'off', corpus, studentIds }),
  ])

  const ranAt = new Date().toISOString()
  const date = ranAt.slice(0, 10)
  const filenameSuffix = student ? `-${student}` : ''
  const reportPath = resolve(
    'test/ablation/reports',
    `${date}-${surface}-ablation${filenameSuffix}.md`,
  )
  mkdirSync(resolve('test/ablation/reports'), { recursive: true })
  // MIRROR_MODEL == CONNECTOR_MODEL == CARTOGRAPHER_MODEL under the current
  // env-resolution scheme; use Mirror as the canonical "this run's model".
  const modelLabel = MIRROR_MODEL
  const studentNote = student
    ? `Scoped to student \`${student}\`.`
    : `Cross-student union over: ${studentIds.map((s) => `\`${s}\``).join(', ')}.`
  writeFileSync(
    reportPath,
    buildAblationReportMarkdown({
      surface,
      ranAt,
      corpusPath: 'test/ablation/fixtures/seed-multistudent.json',
      studentId: student,
      on: { variant: 'on', rawOutput: onOutput },
      off: { variant: 'off', rawOutput: offOutput },
      notes: process.env.OPENAI_API_KEY
        ? `Live run against ${modelLabel}. ${studentNote}`
        : `Placeholder run — OPENAI_API_KEY not set; populate ON/OFF blocks before scoring. ${studentNote}`,
    }),
    'utf8',
  )
  console.log(`ablate: wrote ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
