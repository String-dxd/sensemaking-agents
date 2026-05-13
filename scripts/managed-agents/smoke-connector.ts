#!/usr/bin/env tsx
/**
 * Connector smoke test — Step 8 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * Seeds the multistudent fixture, runs Mirror via the OpenAI path (because
 * the fixture transcripts have not been processed yet — only the seeded
 * mirror_entries carry a story_reframe), then dispatches Connector via
 * the Managed Agents runner with the inlined-taxonomy + pre-fetched corpus
 * user message produced by `buildConnectorContext`. Prints the parsed
 * `ConnectorDiffSchema` payload and the runner's session id.
 *
 * Env required:
 *   - `ANTHROPIC_API_KEY` (managed-agents-2026-04-01 beta access)
 *   - `MANAGED_AGENT_CONNECTOR_ID` (+ optional `_VERSION`) — written by provision.ts
 *   - `MANAGED_AGENT_ENV_ID`
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/smoke-connector.ts
 *   pnpm tsx scripts/managed-agents/smoke-connector.ts --student=demo-b
 *
 * Exit codes:
 *   0   success — Connector output parsed against ConnectorDiffSchema
 *   1   any failure path (missing env, schema parse, network, etc.)
 */
import 'dotenv/config'
import { getManagedAgentBinding } from '~/agents/config'
import { buildConnectorContext } from '~/agents/context'
import { ManagedAgentError, runManagedAgent } from '~/agents/runner'
import { ConnectorDiffSchema } from '~/agents/schemas'
import { withStudent } from '~/db/client'
import { listMirrorEntries } from '~/db/queries'
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
        `smoke-connector: --student=${filter} not in fixture (known: ${known.join(', ')}).`,
      )
    }
    return filter
  }
  const first = known[0]
  if (!first) throw new Error('smoke-connector: seed fixture has no students.')
  return first
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      'smoke-connector: ANTHROPIC_API_KEY is not set. Add it to .env and re-run.\n',
    )
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const studentId = pickStudent(args.student)

  // Seed in-process so `buildConnectorContext` has rows to FTS-match against.
  await seed()
  const entries = await listMirrorEntries(studentId, { limit: 1 })
  const newest = entries[0]
  if (!newest) {
    process.stderr.write(`smoke-connector: no mirror entries seeded for student ${studentId}.\n`)
    process.exit(1)
  }

  let binding: ReturnType<typeof getManagedAgentBinding>
  try {
    binding = getManagedAgentBinding('connector')
  } catch (err) {
    process.stderr.write(
      `smoke-connector: ${err instanceof Error ? err.message : String(err)}\n` +
        'Run `pnpm provision:managed-agents` first.\n',
    )
    process.exit(1)
  }

  const versionLabel = binding.agentVersion !== undefined ? `v${binding.agentVersion}` : 'latest'
  process.stdout.write(
    `smoke-connector: dispatching student=${studentId} new_reflection=#${newest.id} ` +
      `agent=${binding.agentId} (${versionLabel}) env=${binding.environmentId}\n`,
  )

  // buildConnectorContext requires a TenantContext; open one and pull the
  // prompt out of the transaction (read-only — discarded on commit).
  const prompt = await withStudent(studentId, (ctx) => buildConnectorContext(ctx, newest.id))
  process.stdout.write(`smoke-connector: prompt length = ${prompt.length} chars\n`)

  const startedAt = Date.now()
  try {
    const result = await runManagedAgent({
      agentId: binding.agentId,
      ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
      environmentId: binding.environmentId,
      prompt,
      outputSchema: ConnectorDiffSchema,
      sessionTitle: `smoke:connector:${studentId}`,
    })
    const elapsed = Date.now() - startedAt
    process.stdout.write(
      `\nsmoke-connector: success in ${elapsed}ms (session=${result.sessionId}).\n` +
        `  tokens: input=${result.usage.inputTokens} output=${result.usage.outputTokens} cache_read=${result.usage.cacheReadInputTokens}\n\n`,
    )
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`)
  } catch (err) {
    const elapsed = Date.now() - startedAt
    const code = err instanceof ManagedAgentError ? err.code : 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`\nsmoke-connector: failed in ${elapsed}ms [${code}]\n${message}\n`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`smoke-connector crashed:\n${msg}\n`)
  process.exit(1)
})
