# Plan 060: Make the client/server import-boundary guard cover every server function automatically

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- test/server/import-boundary.test.ts src/server/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`test/server/import-boundary.test.ts` is the only thing standing between a
careless `import` and shipping server-only code into the browser bundle — the
`.functions.ts` wrappers are the client's entry points, so a static
`import 'openai'` or `import { withStudent } from '~/db/client'` in one of them
pulls the OpenAI SDK, the Anthropic SDK, WorkOS, or the tenancy envelope across
the network boundary. The guard iterates a **hardcoded 16-entry list**. The repo
has **24** `src/server/*.functions.ts` files, so **8 are entirely unchecked** —
including `submit-student-space-reflection.functions.ts` and
`prepare-student-space-reflection.functions.ts` (the client's entry points for
the whole capture pipeline) and `run-connector.functions.ts` (which reaches the
agent runner). A forbidden import added to any of those eight passes CI with the
guard still green. Replacing the literal list with a directory glob makes the
guard cover new files the moment they are created, which is the only version of
this test that stays true.

## Current state

`test/server/import-boundary.test.ts` — the whole file, 47 lines. The
hardcoded array is lines 5-22:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientFacingServerFunctionFiles = [
  'confirm-diff.functions.ts',
  'counsellor-brief.functions.ts',
  'edit-wiki.functions.ts',
  'forget-diff.functions.ts',
  'forget-timeline-entry.functions.ts',
  'load-pending-review.functions.ts',
  'load-trajectory.functions.ts',
  'load-vips-pages.functions.ts',
  'load-wiki.functions.ts',
  'persist-mirror.functions.ts',
  'run-cartographer.functions.ts',
  'run-mirror.functions.ts',
  'search-past-mirrors.functions.ts',
  'transcribe-mirror.functions.ts',
  'update-mirror-review.functions.ts',
  'update-review-context.functions.ts',
]
```

The forbidden list (lines 24-31) is **correct — do not change it**:

```ts
const forbiddenImports = [
  /\.handler\.server['"]/,
  /['"]~\/db\/client['"]/,
  /['"]openai['"]/,
  /['"]@anthropic-ai\/sdk['"]/,
  /['"]@workos\/authkit-tanstack-react-start['"]/,
  /['"]@tanstack\/react-start\/server['"]/,
]
```

And the assertion loop (lines 33-47):

```ts
describe('client-facing server function import boundary', () => {
  it('keeps wrappers free of server-only static imports', () => {
    for (const file of clientFacingServerFunctionFiles) {
      const source = readFileSync(join(process.cwd(), 'src/server', file), 'utf8')
      for (const forbidden of forbiddenImports) {
        const hasForbiddenStaticImport = source
          .split('\n')
          .some((line) => line.startsWith('import ') && forbidden.test(line))
        expect(hasForbiddenStaticImport, `${file} must not statically import ${forbidden}`).toBe(
          false,
        )
      }
    }
  })
})
```

Note the check is deliberately **static-import-only**: it requires
`line.startsWith('import ')`, so a *dynamic* `await import('./x.handler.server')`
is allowed. That is the whole design of the wrapper pattern — see
`src/server/submit-student-space-reflection.functions.ts` (the complete file):

```ts
import { createServerFn } from '@tanstack/react-start'
import { submitStudentSpaceReflectionInputSchema } from './mirror-function-schemas'

export const submitStudentSpaceReflection = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => submitStudentSpaceReflectionInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { submitStudentSpaceReflectionHandler } = await import(
      './submit-student-space-reflection.handler.server'
    )
    return submitStudentSpaceReflectionHandler(data)
  })
```

### The 8 files the guard does not cover

`ls src/server/*.functions.ts` returns 24 files. Diffed against the array
above, these 8 are absent:

| Unguarded file | Why it matters |
|---|---|
| `auth-menu.functions.ts` | sign-in/out menu resolution |
| `growth-summary.functions.ts` | History Growth tab data |
| `island-state-at.functions.ts` | island time-travel reads |
| `load-pipeline-trace.functions.ts` | dev pipeline trace reads |
| `load-public-profile.functions.ts` | public share-link profile |
| `prepare-student-space-reflection.functions.ts` | **capture pipeline entry point** |
| `run-connector.functions.ts` | **reaches the agent runner** |
| `submit-student-space-reflection.functions.ts` | **capture pipeline entry point** |

**All 8 are clean at HEAD** — verified by running the guard's own logic over
every `*.functions.ts` file. Each imports only `@tanstack/react-start`
(`createServerFn`), a schema module (`./function-schemas`,
`./mirror-function-schemas`), and in one case a local `.types` module. So the
glob is expected to go green immediately; the value here is that it *stays*
green for the right reason. (See STOP conditions for what to do if it does not.)

### Repo conventions

pnpm only, one root lockfile; `island-editor` is a workspace member.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings**. `pnpm test` = `vitest run`; baseline **911
passed / 128 skipped / 0 failed** (the 128 skips are plan 059's subject, not a
regression). Tests live in `test/` mirroring `src/`. Conventional commits.
Per `CLAUDE.md`: never add `three` to `overrides` — the 0.149-app /
0.171-editor split is deliberate. (This plan touches no dependencies.)

## Scope

**In scope** (the only file you should modify):

- `test/server/import-boundary.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- Every file under `src/server/` — this plan changes the *guard*, not the code
  it guards. If the widened guard finds a real violation, that is a STOP-and-
  report, not a fix to make here (see STOP conditions).
- The `forbiddenImports` regex list — it is correct and complete for the
  documented boundary. Adding entries widens the plan's blast radius for no
  audited reason.
- `src/server/*.handler.server.ts` files — they are *supposed* to import
  server-only modules; they are not client-facing and are not globbed.
- `.github/workflows/` — plan 043 owns CI.

## Git workflow

- Branch: `advisor/060-import-boundary-glob`
- Conventional commit, e.g.
  `test(server): glob every *.functions.ts in the import-boundary guard`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the current coverage gap (evidence for the commit message)

```bash
ls src/server/*.functions.ts | wc -l
grep -c "\.functions\.ts'," test/server/import-boundary.test.ts
```

**Verify**: the first command prints `24`; the second prints `16`. If either
number differs, the repo drifted — check the diff against the file list in
"Current state" before continuing (a *larger* first number is fine and expected
over time; a different second number means someone edited the array).

### Step 2: Replace the literal array with a directory glob plus a commented opt-out list

Rewrite `test/server/import-boundary.test.ts`. Keep `forbiddenImports` and the
assertion loop byte-identical; change only how the file list is produced, and
add the two new guard assertions. Target shape:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SERVER_DIR = join(process.cwd(), 'src/server')

/**
 * Wrappers that are genuinely server-only and are therefore exempt from the
 * client-bundle boundary.
 *
 * ADDING AN ENTRY HERE IS A SECURITY DECISION, NOT A TEST FIX. A
 * `*.functions.ts` file exists to be called from the browser; if one of them
 * needs a server-only static import, the correct fix is almost always to move
 * that import behind the `await import('./x.handler.server')` boundary the
 * other 24 wrappers use (see submit-student-space-reflection.functions.ts).
 * Only exempt a file after confirming no client code imports it, and say so in
 * the comment next to the entry.
 */
const serverOnlyExemptions: readonly string[] = [
  // (empty at time of writing — every *.functions.ts wrapper is client-facing)
]

const forbiddenImports = [
  /\.handler\.server['"]/,
  /['"]~\/db\/client['"]/,
  /['"]openai['"]/,
  /['"]@anthropic-ai\/sdk['"]/,
  /['"]@workos\/authkit-tanstack-react-start['"]/,
  /['"]@tanstack\/react-start\/server['"]/,
]

const clientFacingServerFunctionFiles = readdirSync(SERVER_DIR)
  .filter((name) => name.endsWith('.functions.ts'))
  .filter((name) => !serverOnlyExemptions.includes(name))
  .sort()

describe('client-facing server function import boundary', () => {
  it('discovers the server-function wrappers (guards against path rot)', () => {
    // A zero-length list would make the boundary assertion below vacuously
    // pass — e.g. after a directory rename or a change in naming convention.
    expect(clientFacingServerFunctionFiles.length).toBeGreaterThan(0)
  })

  it('exempts nothing that no longer exists (guards against stale exemptions)', () => {
    const present = new Set(
      readdirSync(SERVER_DIR).filter((name) => name.endsWith('.functions.ts')),
    )
    for (const exempt of serverOnlyExemptions) {
      expect(present.has(exempt), `stale exemption: ${exempt} no longer exists`).toBe(true)
    }
  })

  it('keeps wrappers free of server-only static imports', () => {
    for (const file of clientFacingServerFunctionFiles) {
      const source = readFileSync(join(SERVER_DIR, file), 'utf8')
      for (const forbidden of forbiddenImports) {
        const hasForbiddenStaticImport = source
          .split('\n')
          .some((line) => line.startsWith('import ') && forbidden.test(line))
        expect(hasForbiddenStaticImport, `${file} must not statically import ${forbidden}`).toBe(
          false,
        )
      }
    }
  })
})
```

**Verify**: `pnpm vitest run test/server/import-boundary.test.ts` → 3 tests,
all pass.
**Verify**: `pnpm check` → exit 0 (18 warnings OK, 0 errors).

### Step 3: Prove the glob actually widened coverage

Temporarily assert the discovered count, run, then remove the temporary
assertion. Simplest form — run this one-off script (it does not modify the
repo):

```bash
node -e "
const {readdirSync}=require('node:fs');
const files=readdirSync('src/server').filter(f=>f.endsWith('.functions.ts')).sort();
console.log('discovered', files.length);
for (const f of ['submit-student-space-reflection.functions.ts','prepare-student-space-reflection.functions.ts','run-connector.functions.ts']) {
  if (!files.includes(f)) { console.error('MISSING', f); process.exit(1) }
}
console.log('the three previously-unguarded capture/agent wrappers are now in scope');
"
```

**Verify**: prints `discovered 24` and the confirmation line, exit 0.

### Step 4: Prove the guard actually fails on a violation (negative test, do not commit)

Confidence check that the widened guard bites. In a scratch working copy:

```bash
# 1. Inject a violation into a previously-UNGUARDED file.
printf "\nimport { withStudent } from '~/db/client'\n" >> src/server/submit-student-space-reflection.functions.ts
# 2. The guard must now fail.
pnpm vitest run test/server/import-boundary.test.ts
# 3. Revert. MANDATORY.
git checkout -- src/server/submit-student-space-reflection.functions.ts
```

**Verify**: step 2 **fails** with the message
`submit-student-space-reflection.functions.ts must not statically import …`.
**Verify**: after step 3, `git status` shows `src/server/` clean and
`pnpm vitest run test/server/import-boundary.test.ts` passes again.

### Step 5: Full gate

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm test` → 0 failed; total test count is baseline + 2 (the two
new guard assertions).
**Verify**: `git status` → only `test/server/import-boundary.test.ts` modified.

## Test plan

- No new test *file*. `test/server/import-boundary.test.ts` gains two
  assertions: non-zero discovery (path-rot guard) and no-stale-exemptions.
- The existing boundary assertion now runs over 24 files instead of 16 — the
  8 newly-covered files are listed in "Current state".
- Step 4 is a manual negative test proving the guard fails on a real
  violation; it must be reverted and must not appear in the diff.
- Verification: `pnpm vitest run test/server/import-boundary.test.ts` → 3
  tests pass; `pnpm test` → 0 failed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'readdirSync' test/server/import-boundary.test.ts` → ≥1 match
- [ ] `grep -c "\.functions\.ts'," test/server/import-boundary.test.ts` → `0`
      (no hardcoded file list remains; the exemption array is empty)
- [ ] `grep -n 'serverOnlyExemptions' test/server/import-boundary.test.ts` → ≥1 match
- [ ] `pnpm vitest run test/server/import-boundary.test.ts` → 3 tests, 0 failed
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with 0 failed and skip count still 128
- [ ] `git status` shows exactly one modified file:
      `test/server/import-boundary.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **The widened glob fails on any file.** Investigate every failure
  individually. If a client-facing `*.functions.ts` file genuinely contains a
  static import of a forbidden module, **that is a REAL BUG — a server-only
  module is being pulled into the browser bundle and, for `~/db/client`, past
  the tenancy boundary.** STOP and report: the file name, the exact import
  line, the matched forbidden pattern, and whether any client code imports that
  wrapper (`grep -rn "<exported-fn-name>" src/components/ src/routes/`).
  **Never** add it to `serverOnlyExemptions` to make the test pass — the
  exemption list exists for wrappers no client calls, and silencing a live
  violation is the exact failure this plan set out to prevent.
- `ls src/server/*.functions.ts | wc -l` returns fewer than 24 — files were
  deleted since planning; confirm the deletions were intentional before
  proceeding.
- The `forbiddenImports` array at lines 24-31 does not match the excerpt above
  (someone changed the boundary definition; re-verify the audit's premise).
- Step 4's negative test does **not** fail — the glob is not wired into the
  assertion loop; fix that before continuing.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**: that `serverOnlyExemptions` is still
  empty, and that the assertion loop reads its file list from the glob rather
  than from any residual literal. A PR that adds an exemption entry needs the
  justification comment the array's docblock demands — reviewers should treat
  a new exemption as a security review, not a test fix.
- The check remains **static-only** by design: a dynamic
  `await import('./x.handler.server')` is the sanctioned pattern and must keep
  passing. If someone later wants to catch dynamic leaks, that is a different
  (bundler-level) check, not a widening of this regex list.
- The check is also **line-prefix based** (`line.startsWith('import ')`), so a
  multi-line import statement whose module specifier lands on a later line
  would evade it. No wrapper uses that style today (all 24 have single-line
  imports), and the wrappers are short enough that it is easy to keep that
  way. Deliberately not fixed here: switching to a real AST/regex-over-whole-
  file check would also match the *dynamic* imports the pattern requires,
  which means rewriting the rule rather than the file list. Worth doing only
  if a multi-line import ever appears.
- If a new `src/server/*.functions.ts` file is added, it is covered
  automatically — that is the point. If someone adds a client-facing server
  function under a *different* naming convention (say `*.serverfn.ts`), the
  non-zero discovery assertion will not catch it; the naming convention is the
  contract the glob depends on.
