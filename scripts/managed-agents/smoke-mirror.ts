#!/usr/bin/env tsx
/**
 * Mirror smoke test.
 *
 * Runs ONE OpenAI Realtime Mirror call against a fixture transcript and
 * prints the parsed JSON to stdout.
 *
 * Env required:
 *   - `OPENAI_API_KEY`
 *   - optional `OPENAI_REALTIME_MIRROR_MODEL`
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
import { getOpenAIRealtimeMirrorConfig } from '~/agents/openai-realtime/config'
import {
  OpenAIRealtimeMirrorError,
  runOpenAIRealtimeMirror,
} from '~/agents/openai-realtime/mirror-runner'

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
  if (!process.env.OPENAI_API_KEY) {
    process.stderr.write(
      'smoke-mirror: OPENAI_API_KEY is not set. Add it to .env and re-run.\n',
    )
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const { studentId, transcript } = loadFirstTranscript(args.student)
  const config = getOpenAIRealtimeMirrorConfig()
  process.stdout.write(
    `smoke-mirror: dispatching student=${studentId} provider=openai_realtime model=${config.model}\n`,
  )

  const startedAt = Date.now()
  try {
    const output = await runOpenAIRealtimeMirror({ studentId, transcript }, { config })
    const elapsed = Date.now() - startedAt
    process.stdout.write(`\nsmoke-mirror: success in ${elapsed}ms.\n\n`)
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  } catch (err) {
    const elapsed = Date.now() - startedAt
    const code = err instanceof OpenAIRealtimeMirrorError ? 'OPENAI_REALTIME' : 'UNKNOWN'
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
