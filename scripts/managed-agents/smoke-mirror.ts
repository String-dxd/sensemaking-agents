#!/usr/bin/env tsx
/**
 * Mirror smoke test — Step 6 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * Runs ONE end-to-end Managed Agents Mirror call against a fixture
 * transcript and prints the parsed JSON to stdout. Intended as the manual
 * one-shot the dev runs after `pnpm provision:managed-agents` to confirm
 * the runner wiring is sound before touching the ablate harness.
 *
 * Env required:
 *   - `ANTHROPIC_API_KEY` (managed-agents-2026-04-01 beta access)
 *   - `MANAGED_AGENT_MIRROR_ID` (+ optional `_VERSION`) — written by provision.ts
 *   - `MANAGED_AGENT_ENV_ID`
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/smoke-mirror.ts
 *   pnpm tsx scripts/managed-agents/smoke-mirror.ts --student=demo-b
 *
 * Exit codes:
 *   0   success — Mirror output parsed against MirrorOutputSchema
 *   1   any failure path (missing env, schema parse, network, etc.)
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getManagedAgentBinding } from '~/agents/config'
import { ManagedAgentError, runManagedAgent } from '~/agents/runner'
import { MirrorOutputSchema } from '~/agents/schemas'

interface SeedCorpus {
  students: Array<{
    student_id: string
    reflections: Array<{ transcript: string; context_type: string; created_at: string }>
  }>
}

function loadFirstTranscript(studentFilter: string | undefined): {
  studentId: string
  transcript: string
} {
  const path = resolve('test/ablation/fixtures/seed-multistudent.json')
  const corpus = JSON.parse(readFileSync(path, 'utf8')) as SeedCorpus
  const student =
    studentFilter !== undefined
      ? corpus.students.find((s) => s.student_id === studentFilter)
      : corpus.students[0]
  if (!student) {
    const known = corpus.students.map((s) => s.student_id).join(', ')
    throw new Error(
      `smoke-mirror: ${studentFilter ? `student '${studentFilter}' not found in fixture (known: ${known})` : 'no students in fixture'}.`,
    )
  }
  const reflection = student.reflections[0]
  if (!reflection) {
    throw new Error(`smoke-mirror: student '${student.student_id}' has no reflections in fixture.`)
  }
  return { studentId: student.student_id, transcript: reflection.transcript }
}

function parseArgs(argv: string[]): { student: string | undefined } {
  const studentArg = argv.find((a) => a.startsWith('--student='))
  return { student: studentArg?.split('=')[1] || undefined }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      'smoke-mirror: ANTHROPIC_API_KEY is not set. Add it to .env.local and re-run.\n',
    )
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const { studentId, transcript } = loadFirstTranscript(args.student)

  let binding: ReturnType<typeof getManagedAgentBinding>
  try {
    binding = getManagedAgentBinding('mirror')
  } catch (err) {
    process.stderr.write(
      `smoke-mirror: ${err instanceof Error ? err.message : String(err)}\n` +
        'Run `pnpm provision:managed-agents` first.\n',
    )
    process.exit(1)
  }

  const versionLabel = binding.agentVersion !== undefined ? `v${binding.agentVersion}` : 'latest'
  process.stdout.write(
    `smoke-mirror: dispatching student=${studentId} agent=${binding.agentId} (${versionLabel}) env=${binding.environmentId}\n`,
  )

  const startedAt = Date.now()
  try {
    const result = await runManagedAgent({
      agentId: binding.agentId,
      ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
      environmentId: binding.environmentId,
      prompt: `The student spoke this transcript while looking into a webcam mirror. They are no longer present. Reflect what was said back in three parts.\n\nTranscript:\n\n${transcript}`,
      outputSchema: MirrorOutputSchema,
      sessionTitle: `smoke:mirror:${studentId}`,
    })
    const elapsed = Date.now() - startedAt
    process.stdout.write(
      `\nsmoke-mirror: success in ${elapsed}ms (session=${result.sessionId}).\n` +
        `  tokens: input=${result.usage.inputTokens} output=${result.usage.outputTokens} cache_read=${result.usage.cacheReadInputTokens}\n\n`,
    )
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`)
  } catch (err) {
    const elapsed = Date.now() - startedAt
    const code = err instanceof ManagedAgentError ? err.code : 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`\nsmoke-mirror: failed in ${elapsed}ms [${code}]\n${message}\n`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`smoke-mirror crashed:\n${msg}\n`)
  process.exit(1)
})
