/**
 * CI guard: verify the vendored Student Space engine still carries every
 * patch listed in `src/engine/student-space/PATCHES.md`.
 *
 * The engine is vendored from `wondopamine/student-space` and resynced
 * periodically. Each resync replays the upstream tree on top of our copy
 * and silently drops local modifications unless someone re-applies them.
 * This script greps the freshly-synced tree for a known-distinct fragment
 * of each patch and fails the build when any patch is missing.
 *
 * Run via `pnpm verify-patches`. Add the check to CI alongside `pnpm check`
 * so a forgotten patch can never reach `main` quietly.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface PatchCheck {
  id: string
  file: string
  /** Distinct substring that proves the patched form is present. */
  expected: string
  /**
   * Substring that proves the upstream (unpatched) form is *absent*. Optional
   * — only present when the upstream literal would clearly mean the patch
   * was dropped.
   */
  forbidden?: string
  /** One-line reminder of what the patch does. */
  purpose: string
}

const CHECKS: PatchCheck[] = [
  {
    id: 'patch-1-draco-decoder-path',
    file: 'src/engine/student-space/Game/View/Tree.js',
    expected: "dracoLoader.setDecoderPath('/draco/')",
    // The upstream form is the *active* call — not the URL anywhere in the
    // file (the patch comment still references it for historical context).
    forbidden: "setDecoderPath('https://www.gstatic.com",
    purpose:
      'DRACO decoder fetched from host (default /draco/) — never from gstatic.com (MOE network policy).',
  },
]

function check(c: PatchCheck): string | null {
  let source: string
  try {
    source = readFileSync(resolve(process.cwd(), c.file), 'utf8')
  } catch (err) {
    return `[${c.id}] failed to read ${c.file}: ${(err as Error).message}`
  }
  if (!source.includes(c.expected)) {
    return `[${c.id}] expected substring missing in ${c.file}: ${JSON.stringify(c.expected)}\n  purpose: ${c.purpose}`
  }
  if (c.forbidden && source.includes(c.forbidden)) {
    return `[${c.id}] forbidden upstream form present in ${c.file}: ${JSON.stringify(c.forbidden)}\n  purpose: ${c.purpose}`
  }
  return null
}

const failures = CHECKS.map(check).filter((m): m is string => m !== null)
if (failures.length > 0) {
  console.error('verify-patches: FAILED')
  for (const f of failures) console.error('  - ' + f)
  console.error(
    '\nFix: re-apply the missing patch from src/engine/student-space/PATCHES.md and re-run.',
  )
  process.exit(1)
}

console.log(`verify-patches: OK (${CHECKS.length} patch${CHECKS.length === 1 ? '' : 'es'} verified)`)
