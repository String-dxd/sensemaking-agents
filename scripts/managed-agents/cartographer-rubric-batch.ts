#!/usr/bin/env tsx
/**
 * Cartographer rubric-batch — produces the 5 Cartographer outputs the Step 11
 * cutover gate requires for the manual rubric review (plan §9.3).
 *
 * Runs Cartographer once per student in the multistudent fixture (4 runs),
 * then a 5th run against the first student to give a one-shot non-determinism
 * signal. Each output is saved as its own JSON file under
 * `test/ablation/reports/cartographer-rubric/<date>-<student>-<n>.json`,
 * and a single combined `cartographer-rubric.md` with empty rubric cells is
 * written alongside for grading.
 *
 * Env required: same as `smoke-cartographer.ts`.
 *
 * Usage:
 *   pnpm rubric:managed-cartographer
 *   pnpm rubric:managed-cartographer --students=demo-a,demo-b
 *
 * Each Cartographer run takes 60–180s and may stretch toward the runner's
 * 780s timeout under load. Budget ~10–15 minutes for the full 5-run pass.
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getManagedAgentBinding } from '~/agents/config'
import { buildCartographerContext } from '~/agents/context'
import { ManagedAgentError, runManagedAgent } from '~/agents/runner'
import { type CartographerOutputDraft, CartographerOutputSchema } from '~/agents/schemas'
import { withStudent } from '~/db/client'
import { listVipsPages } from '~/db/queries'
import { loadSeedCorpus, seed } from '~/db/seed'

interface PlannedRun {
  /** Sequence index in the batch — 1-based. */
  index: number
  /** Multistudent fixture student id. */
  studentId: string
  /** Filename-safe label: e.g. `demo-a` or `demo-a-2` for the repeat. */
  label: string
}

interface RunRecord {
  index: number
  studentId: string
  label: string
  outcome: 'ok' | 'failed'
  latencyMs: number
  sessionId: string | null
  jsonPath: string | null
  error: { code: string; message: string } | null
  /** Subset surfaced into the rubric markdown so the reviewer sees the trajectory line at a glance. */
  trajectoryPreview: string | null
  pathwayCount: number | null
}

function parseStudentsArg(argv: string[], fallback: string[]): string[] {
  const arg = argv.find((a) => a.startsWith('--students='))
  if (!arg) return fallback
  const raw = arg.split('=')[1] ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function planRuns(students: string[]): PlannedRun[] {
  const runs: PlannedRun[] = students.map((studentId, i) => ({
    index: i + 1,
    studentId,
    label: studentId,
  }))
  // Append a 5th repeat-of-first run for non-determinism signal.
  // Skip the repeat if the caller passed a single student via --students=.
  if (students.length >= 2) {
    const first = students[0]
    if (first !== undefined) {
      runs.push({ index: runs.length + 1, studentId: first, label: `${first}-2` })
    }
  }
  return runs
}

async function runOne(plan: PlannedRun, reportDir: string, dateStr: string): Promise<RunRecord> {
  const binding = getManagedAgentBinding('cartographer')
  const versionLabel = binding.agentVersion !== undefined ? `v${binding.agentVersion}` : 'latest'
  process.stdout.write(
    `rubric: [cartographer ${plan.index}] dispatching student=${plan.studentId} ` +
      `agent=${binding.agentId} (${versionLabel}) env=${binding.environmentId}\n`,
  )

  const startedAt = Date.now()
  try {
    const prompt = await withStudent(plan.studentId, (ctx) => buildCartographerContext(ctx))
    const result = await runManagedAgent({
      agentId: binding.agentId,
      ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
      environmentId: binding.environmentId,
      prompt,
      outputSchema: CartographerOutputSchema,
      sessionTitle: `rubric:cartographer:${plan.label}`,
      // Plan §10: Cartographer route budget is 800s. Stay just under so the
      // runner gives up before the route would.
      timeoutMs: 780_000,
    })
    const elapsed = Date.now() - startedAt
    const filename = `${dateStr}-${plan.label}.json`
    const jsonPath = resolve(reportDir, filename)
    writeFileSync(
      jsonPath,
      `${JSON.stringify(
        {
          student_id: plan.studentId,
          label: plan.label,
          ran_at: new Date().toISOString(),
          session_id: result.sessionId,
          agent: { id: binding.agentId, version: binding.agentVersion ?? null },
          usage: result.usage,
          latency_ms: elapsed,
          output: result.output,
        },
        null,
        2,
      )}\n`,
    )
    process.stdout.write(
      `rubric: [cartographer ${plan.index}] ${plan.label} ` +
        `(${elapsed}ms, ok, pathways=${result.output.pathways.length}) → ${filename}\n`,
    )
    return {
      index: plan.index,
      studentId: plan.studentId,
      label: plan.label,
      outcome: 'ok',
      latencyMs: elapsed,
      sessionId: result.sessionId,
      jsonPath,
      error: null,
      trajectoryPreview: truncate(result.output.trajectory_paragraph, 280),
      pathwayCount: result.output.pathways.length,
    }
  } catch (err) {
    const elapsed = Date.now() - startedAt
    const code = err instanceof ManagedAgentError ? err.code : 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    process.stdout.write(
      `rubric: [cartographer ${plan.index}] ${plan.label} ` +
        `(${elapsed}ms, ERR [${code}] ${message.slice(0, 60)})\n`,
    )
    return {
      index: plan.index,
      studentId: plan.studentId,
      label: plan.label,
      outcome: 'failed',
      latencyMs: elapsed,
      sessionId: null,
      jsonPath: null,
      error: { code, message },
      trajectoryPreview: null,
      pathwayCount: null,
    }
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, n - 1)}…`
}

function buildRubricMarkdown(records: RunRecord[], reportDir: string, dateStr: string): string {
  const dimensions = [
    'provenance',
    'specificity',
    'novelty',
    'anti-sycophancy',
    'parallax_discipline',
  ] as const
  const lines: string[] = []
  lines.push(`# Cartographer rubric — ${dateStr}`)
  lines.push('')
  lines.push(
    '> Step 11 cutover gate (plan §9.3): grade each Cartographer output below.',
  )
  lines.push(
    '> Fill in the score cells (0–3 Likert per dimension). Mark each output ' +
      '`pass | fail | concern` in the verdict column with a one-line note. ' +
      'Summary lines like "spot-checked, no regressions" are not acceptable — ' +
      'the structured capture is what makes the gate auditable post-hoc.',
  )
  lines.push('')
  for (const r of records) {
    lines.push(`## ${r.index}. ${r.label} (student=${r.studentId})`)
    lines.push('')
    if (r.outcome === 'failed') {
      lines.push(`**Status:** FAILED — \`${r.error?.code ?? 'UNKNOWN'}\``)
      lines.push('')
      lines.push(`> ${r.error?.message ?? '(no message)'}`)
      lines.push('')
      continue
    }
    lines.push(
      `**Latency:** ${r.latencyMs}ms · **Pathways:** ${r.pathwayCount ?? '?'} · ` +
        `**Session:** \`${r.sessionId ?? 'n/a'}\` · **JSON:** \`${
          r.jsonPath ? r.jsonPath.split('/').slice(-2).join('/') : 'n/a'
        }\``,
    )
    lines.push('')
    lines.push('**Trajectory preview:**')
    lines.push('')
    lines.push(`> ${r.trajectoryPreview ?? '(empty)'}`)
    lines.push('')
    lines.push('| Dimension | Score (0–3) | Note |')
    lines.push('|-----------|------------:|------|')
    for (const d of dimensions) lines.push(`| ${d} | | |`)
    lines.push('')
    lines.push('**Verdict:** `pass | fail | concern` — _(replace one + add note)_')
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  lines.push('## Roll-up')
  lines.push('')
  lines.push(`- Successful outputs: ${records.filter((r) => r.outcome === 'ok').length}/${records.length}`)
  lines.push('- Pass count: <fill in after grading>')
  lines.push('- Fail count: <fill in after grading>')
  lines.push('- Concern count: <fill in after grading>')
  lines.push('- Gate verdict (plan §9.3): <PASS | HOLD>')
  lines.push('')
  void reportDir
  return lines.join('\n')
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      'rubric: ANTHROPIC_API_KEY is not set. Add it to .env and re-run.\n',
    )
    process.exit(1)
  }
  const corpus = loadSeedCorpus()
  const fixtureStudents = corpus.students.map((s) => s.student_id)
  const students = parseStudentsArg(process.argv.slice(2), fixtureStudents)
  if (students.length === 0) {
    process.stderr.write('rubric: --students= empty and fixture has no students.\n')
    process.exit(1)
  }
  const unknown = students.filter((s) => !fixtureStudents.includes(s))
  if (unknown.length > 0) {
    process.stderr.write(
      `rubric: unknown student id(s): ${unknown.join(', ')}. Known: ${fixtureStudents.join(', ')}\n`,
    )
    process.exit(1)
  }

  // Seed once so every run reads the same baseline VIPS state.
  await seed()

  const dateStr = new Date().toISOString().slice(0, 10)
  const reportDir = resolve('test/ablation/reports/cartographer-rubric')
  mkdirSync(reportDir, { recursive: true })

  const plan = planRuns(students)
  process.stdout.write(
    `rubric: starting cartographer batch — ${plan.length} run(s) over ` +
      `${students.length} student(s)\n`,
  )

  const records: RunRecord[] = []
  for (const p of plan) {
    records.push(await runOne(p, reportDir, dateStr))
  }

  const mdPath = resolve(reportDir, `${dateStr}-cartographer-rubric.md`)
  writeFileSync(mdPath, `${buildRubricMarkdown(records, reportDir, dateStr)}\n`)
  process.stdout.write(`rubric: wrote ${mdPath}\n`)

  const failed = records.filter((r) => r.outcome === 'failed').length
  if (failed > 0) {
    process.stderr.write(
      `rubric: ${failed} of ${records.length} runs failed — see markdown for details.\n`,
    )
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`rubric-cartographer crashed:\n${msg}\n`)
  process.exit(1)
})

// `tsx` invokes this file directly; if it's ever imported, the `main()` call
// above still runs at module-load (top-level await would be cleaner but the
// existing smoke scripts use this same pattern for consistency).
