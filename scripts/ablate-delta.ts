#!/usr/bin/env tsx
/**
 * Compute a markdown delta between two ablation JSON reports — used by
 * `.github/workflows/ablation.yml` to post a PR comment summarizing how
 * the runner's behavior shifted vs the `main` baseline (plan §9.3).
 *
 * Usage:
 *   tsx scripts/ablate-delta.ts <baseline.json> <candidate.json> [--out=<path>]
 *
 * Exit codes:
 *   0  success — markdown written to stdout (or `--out=<path>` if provided)
 *   1  unreadable file / shape mismatch / write error
 *   2  usage error
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  type AblationStructuredReport,
  buildDeltaMarkdown,
} from '../test/ablation/score'

function parseArgs(argv: string[]): { baseline: string; candidate: string; out: string | null } {
  if (argv.length < 2) {
    console.error(
      'usage: tsx scripts/ablate-delta.ts <baseline.json> <candidate.json> [--out=<path>]',
    )
    process.exit(2)
  }
  const baseline = argv[0]!
  const candidate = argv[1]!
  const outArg = argv.find((a) => a.startsWith('--out='))
  const out = outArg?.split('=')[1] ?? null
  return { baseline, candidate, out }
}

function readReport(path: string): AblationStructuredReport {
  const raw = readFileSync(resolve(path), 'utf8')
  const parsed = JSON.parse(raw) as AblationStructuredReport
  if (!parsed.surface || !parsed.runner) {
    console.error(`error: ${path} is not a valid ablation report (missing surface/runner)`)
    process.exit(1)
  }
  return parsed
}

function main() {
  const { baseline, candidate, out } = parseArgs(process.argv.slice(2))
  const b = readReport(baseline)
  const c = readReport(candidate)
  if (b.surface !== c.surface) {
    console.error(`error: surface mismatch — baseline=${b.surface} candidate=${c.surface}`)
    process.exit(1)
  }
  const md = buildDeltaMarkdown(b, c)
  if (out !== null) {
    writeFileSync(resolve(out), md, 'utf8')
    console.log(`ablate-delta: wrote ${out}`)
  } else {
    process.stdout.write(`${md}\n`)
  }
}

main()
