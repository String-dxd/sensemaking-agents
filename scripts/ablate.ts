#!/usr/bin/env tsx
/**
 * Ablation runner — `pnpm ablate:mirror` or `pnpm ablate:cron`.
 *
 * Loads the canonical 8-reflection corpus, runs the agent with the
 * tool surface ON and OFF, and writes a Markdown report under
 * `test/ablation/reports/` for a human to score against the four
 * dimensions (provenance, specificity, novelty, anti-sycophancy).
 *
 * v0.1 does not auto-score quality — see K.T.D. #6 of the plan.
 *
 * Live mode requires `OPENAI_API_KEY`. Without it, the script writes a
 * report with placeholder ON/OFF outputs so the scaffold is ready for
 * a hand-iterated session, and exits 0 (so CI can verify the script
 * runs without burning tokens).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Agent, run } from '@openai/agents'
import { ConnectorOutputSchema, PathfinderOutputSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'
import { openDb } from '~/db/client'
import { listMirrorEntries } from '~/db/queries'
import { seed } from '~/db/seed'
import { buildAblationReportMarkdown } from '../test/ablation/score'

// Vite's ?raw import works in the bundle but not under tsx; read prompts from disk.
const mirrorPrompt = readFileSync(resolve('src/agents/mirror.prompt.md'), 'utf8')
const connectorPrompt = readFileSync(resolve('src/agents/connector.prompt.md'), 'utf8')
const pathfinderPrompt = readFileSync(resolve('src/agents/pathfinder.prompt.md'), 'utf8')

interface CliArgs {
  surface: 'mirror' | 'sensemake'
}

function parseArgs(argv: string[]): CliArgs {
  const surfaceArg = argv.find((a) => a.startsWith('--surface='))
  const surface = surfaceArg?.split('=')[1]
  if (surface !== 'mirror' && surface !== 'sensemake') {
    console.error('usage: tsx scripts/ablate.ts --surface=<mirror|sensemake>')
    process.exit(2)
  }
  return { surface }
}

function formatCorpus(): string {
  openDb()
  // Seed if empty so the script is reproducible.
  seed()
  const entries = listMirrorEntries('demo', { limit: 200 })
  return entries
    .slice()
    .reverse()
    .map(
      (e) =>
        `# Reflection #${e.id} — ${e.created_at}\n${e.story_reframe}\n\nValidation: ${e.validation}\nInferred meaning: ${e.inferred_meaning}`,
    )
    .join('\n\n---\n\n')
}

async function runMirrorVariant(opts: { tools: 'on' | 'off'; corpus: string }): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return placeholderOutput('mirror', opts.tools)
  // The Mirror live path is voice-WebRTC; for the ablation we approximate by
  // running a text-mode `gpt-4.1` against the same prompt + corpus so the
  // signal-shape difference is what's compared, not the modality.
  const tools = opts.tools === 'on' ? [searchCorpusToolFor('demo')] : []
  const agent = new Agent({
    name: 'mirror-ablation',
    model: 'gpt-4.1',
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
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return placeholderOutput('sensemake', opts.tools)
  const tools =
    opts.tools === 'on'
      ? [searchCorpusToolFor('demo'), lookupEcgTaxonomyTool, selfCritiqueTool]
      : []
  const connector = new Agent({
    name: 'connector-ablation',
    model: 'gpt-4.1',
    instructions: connectorPrompt,
    tools,
    outputType: ConnectorOutputSchema,
  })
  const pathfinder = new Agent({
    name: 'pathfinder-ablation',
    model: 'gpt-4.1',
    instructions: pathfinderPrompt,
    tools,
    outputType: PathfinderOutputSchema,
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
      reason: 'OPENAI_API_KEY not set — run live to populate. See plans K.T.D. #6.',
      surface,
      variant,
    },
    null,
    2,
  )
}

async function main() {
  const { surface } = parseArgs(process.argv.slice(2))
  const corpus = formatCorpus()

  const [onOutput, offOutput] = await Promise.all([
    surface === 'mirror'
      ? runMirrorVariant({ tools: 'on', corpus })
      : runSensemakeVariant({ tools: 'on', corpus }),
    surface === 'mirror'
      ? runMirrorVariant({ tools: 'off', corpus })
      : runSensemakeVariant({ tools: 'off', corpus }),
  ])

  const ranAt = new Date().toISOString()
  const date = ranAt.slice(0, 10)
  const reportPath = resolve('test/ablation/reports', `${date}-${surface}-ablation.md`)
  mkdirSync(resolve('test/ablation/reports'), { recursive: true })
  writeFileSync(
    reportPath,
    buildAblationReportMarkdown({
      surface,
      ranAt,
      corpusPath: 'test/ablation/fixtures/seed-corpus.json',
      on: { variant: 'on', rawOutput: onOutput },
      off: { variant: 'off', rawOutput: offOutput },
      notes: process.env.OPENAI_API_KEY
        ? 'Live run against gpt-4.1.'
        : 'Placeholder run — OPENAI_API_KEY not set; populate ON/OFF blocks before scoring.',
    }),
    'utf8',
  )
  console.log(`ablate: wrote ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
