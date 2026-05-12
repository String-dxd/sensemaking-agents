#!/usr/bin/env tsx
/**
 * Cartographer smoke test — Step 9 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * Seeds the multistudent fixture, then dispatches Cartographer via the
 * Managed Agents runner with the inlined-taxonomy + pre-fetched
 * VIPS-page + FTS-corpus user message produced by `buildCartographerContext`.
 * Prints the parsed `CartographerOutputSchema` payload and the runner's
 * session id.
 *
 * Env required:
 *   - `ANTHROPIC_API_KEY` (managed-agents-2026-04-01 beta access)
 *   - `MANAGED_AGENT_CARTOGRAPHER_ID` (+ optional `_VERSION`) — written by provision.ts
 *   - `MANAGED_AGENT_ENV_ID`
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/smoke-cartographer.ts
 *   pnpm tsx scripts/managed-agents/smoke-cartographer.ts --student=demo-b
 *
 * Exit codes:
 *   0   success — Cartographer output parsed against CartographerOutputSchema
 *   1   any failure path (missing env, schema parse, network, etc.)
 */
import 'dotenv/config'
import { getManagedAgentBinding } from '~/agents/config'
import { buildCartographerContext } from '~/agents/context'
import { ManagedAgentError, runManagedAgent } from '~/agents/runner'
import { CartographerOutputSchema } from '~/agents/schemas'
import { openDb } from '~/db/client'
import { listVipsPages } from '~/db/queries'
import { loadSeedCorpus, seed } from '~/db/seed'

function parseArgs(argv: string[]): { student: string | undefined } {
  const studentArg = argv.find((a) => a.startsWith('--student='))
  return { student: studentArg?.split('=')[1] || undefined }
}

function pickStudent(filter: string | undefined): string {
  const corpus = loadSeedCorpus()
  const known = corpus.students.map((s) => s.student_id)
  if (filter !== undefined) {
    if (!known.includes(filter)) {
      throw new Error(
        `smoke-cartographer: --student=${filter} not in fixture (known: ${known.join(', ')}).`,
      )
    }
    return filter
  }
  const first = known[0]
  if (!first) throw new Error('smoke-cartographer: seed fixture has no students.')
  return first
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      'smoke-cartographer: ANTHROPIC_API_KEY is not set. Add it to .env.local and re-run.\n',
    )
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const studentId = pickStudent(args.student)

  // Seed in-process so `buildCartographerContext` has pages + timeline + corpus.
  openDb()
  seed()

  const pages = listVipsPages(studentId)
  if (pages.length === 0) {
    process.stderr.write(
      `smoke-cartographer: no VIPS pages seeded for student ${studentId}. ` +
        'The fixture must include compiled-truth pages before Cartographer can run.\n',
    )
    process.exit(1)
  }

  let binding: ReturnType<typeof getManagedAgentBinding>
  try {
    binding = getManagedAgentBinding('cartographer')
  } catch (err) {
    process.stderr.write(
      `smoke-cartographer: ${err instanceof Error ? err.message : String(err)}\n` +
        'Run `pnpm provision:managed-agents` first.\n',
    )
    process.exit(1)
  }

  const versionLabel = binding.agentVersion !== undefined ? `v${binding.agentVersion}` : 'latest'
  process.stdout.write(
    `smoke-cartographer: dispatching student=${studentId} pages=${pages.length} ` +
      `agent=${binding.agentId} (${versionLabel}) env=${binding.environmentId}\n`,
  )

  const prompt = buildCartographerContext(studentId)
  process.stdout.write(`smoke-cartographer: prompt length = ${prompt.length} chars\n`)

  const startedAt = Date.now()
  try {
    const result = await runManagedAgent({
      agentId: binding.agentId,
      ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
      environmentId: binding.environmentId,
      prompt,
      outputSchema: CartographerOutputSchema,
      sessionTitle: `smoke:cartographer:${studentId}`,
      // Cartographer is the long-running agent; bump the runner timeout
      // close to the planned route maxDuration (800s — plan §10).
      timeoutMs: 780_000,
    })
    const elapsed = Date.now() - startedAt
    process.stdout.write(
      `\nsmoke-cartographer: success in ${elapsed}ms (session=${result.sessionId}).\n` +
        `  tokens: input=${result.usage.inputTokens} output=${result.usage.outputTokens} cache_read=${result.usage.cacheReadInputTokens}\n` +
        `  pathways: ${result.output.pathways.length}\n\n`,
    )
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`)
  } catch (err) {
    const elapsed = Date.now() - startedAt
    const code = err instanceof ManagedAgentError ? err.code : 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`\nsmoke-cartographer: failed in ${elapsed}ms [${code}]\n${message}\n`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`smoke-cartographer crashed:\n${msg}\n`)
  process.exit(1)
})
