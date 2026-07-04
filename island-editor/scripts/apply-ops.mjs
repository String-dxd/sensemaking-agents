// CLI: apply a batch of agent ops to a v3 island spec (binding option (a)).
// Reuses the real pure core via tsx — deserializeSpec/serializeSpec from
// specIO.ts (which migrates v1/v2 files to v3 on read) and the applyOps runner
// from src/agent/applyOps.ts. No core logic is inlined here (unlike the
// throwaway poc-apply-op.mjs).
//
//   pnpm --filter island-editor apply-ops <spec.json> <ops.json> [out.json]
//
// Reads <spec.json> (a serialized IslandSpec; v1/v2 files migrate to v3) and
// <ops.json> (an Op[] in the v3 grid vocabulary: fillRect / adjustRect /
// paintRect / reset), folds the ops, writes the resulting spec to <out.json> if
// given else stdout, prints any op errors to stderr, and exits 1 if any error
// occurred (else 0).

import { readFileSync, writeFileSync } from 'node:fs'
import { applyOps } from '../src/agent/applyOps'
import { deserializeSpec, serializeSpec } from '../src/editor/specIO'

const specPath = process.argv[2]
const opsPath = process.argv[3]
const outPath = process.argv[4]

if (!specPath || !opsPath) {
  process.stderr.write('Usage: apply-ops <spec.json> <ops.json> [out.json]\n')
  process.exit(1)
}

let spec
try {
  spec = deserializeSpec(readFileSync(specPath, 'utf8'))
} catch (e) {
  process.stderr.write(`Failed to read spec "${specPath}": ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
}

let ops
try {
  ops = JSON.parse(readFileSync(opsPath, 'utf8'))
} catch (e) {
  process.stderr.write(`Failed to read ops "${opsPath}": ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
}

if (!Array.isArray(ops)) {
  process.stderr.write(`Invalid ops "${opsPath}": expected a JSON array of ops\n`)
  process.exit(1)
}

const { spec: nextSpec, errors } = applyOps(spec, ops)

if (errors.length) {
  process.stderr.write(`${errors.length} op error(s):\n`)
  for (const err of errors) {
    process.stderr.write(`  [${err.index}] ${err.op}: ${err.message}\n`)
  }
}

// A validate-level error (index -1) means the folded spec is structurally
// invalid — never emit a corrupt artifact in that case.
if (errors.some((err) => err.index === -1)) {
  process.stderr.write('Resulting spec failed validation; not writing output.\n')
  process.exit(1)
}

try {
  const out = serializeSpec(nextSpec)
  if (outPath) {
    writeFileSync(outPath, out)
  } else {
    process.stdout.write(`${out}\n`)
  }
} catch (e) {
  process.stderr.write(`Failed to write output: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
}

process.exit(errors.length ? 1 : 0)
