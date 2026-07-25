# Plan 043: Add a CI gate for `pnpm check` + `pnpm test`, fixing the timezone-dependent test that would flake on it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- test/components/student-space/sheets/history-sheet.test.tsx vitest.config.ts .github/workflows/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Nothing verifies this repo automatically: `.github/workflows/` contains exactly
one workflow (`lint-no-dev-bypass-leak.yml`, a grep for a single env-var
literal). `pnpm check` and `pnpm test` (1039 tests, ~8s) exist and pass at
HEAD, but they are run on the honor system — and it has already slipped once:
main carried 10 failing tests for days in July 2026 and needed a dedicated
remediation plan (plans/034). This plan adds the CI gate, and first fixes the
one known test that would flake on a non-Singapore CI runner, so the gate
lands green and stays green.

## Current state

- `.github/workflows/lint-no-dev-bypass-leak.yml` — the only workflow; greps
  for `process.env.DEV_BYPASS_AUTH` outside `src/auth/middleware.ts`. Leave it
  alone.
- `test/components/student-space/sheets/history-sheet.test.tsx:60-64` — a
  local-device-timezone "today" helper:

  ```ts
  // Real-clock day key, matching DayDetailCard's private ymd()
  function realToday(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  ```

  The comment is stale: `DayDetailCard.tsx` no longer has a private `ymd()` —
  it imports `sgToday` from `~/lib/entry-date` (line 4) and uses it at line
  360 to bucket "today" in **Asia/Singapore**. On any runner whose local zone
  is not UTC+8, `realToday()` and `sgToday()` disagree for part of every day
  (e.g. on a UTC runner, from 16:00 UTC onward). Five usages:
  `history-sheet.test.tsx:312, 335, 336, 380, 424` (line 336 builds a
  timestamp: `` `${realToday()}T08:00:00.000Z` ``).
- `src/lib/entry-date.ts` — the production day-key helpers. Exports
  `sgDateKey(value)` (line 16) and `sgToday()` (line 24), both anchored to
  `Asia/Singapore` via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', ... })`.
- `vitest.config.ts` — no `env` block and no TZ pin, so the suite inherits the
  developer's/runner's timezone:

  ```ts
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/ablation/reports/**', 'node_modules/**'],
  },
  ```

- Baseline at HEAD: `pnpm check` exits 0 (18 Biome warnings, 0 errors);
  `pnpm test` → `Tests 911 passed | 128 skipped (1039)`.
- **Critical constraint**: 128 tests skip via
  `describe.skipIf(!process.env.DATABASE_URL)` and are **broken as written**
  (they import a deleted export `openInMemoryDb` and are `@ts-nocheck`'d —
  see plans/059). Setting `DATABASE_URL` in CI would convert 128 silent skips
  into hard failures. **Do NOT set `DATABASE_URL` in the CI job.**

## Commands you will need

| Purpose        | Command                                       | Expected on success |
|----------------|-----------------------------------------------|---------------------|
| Install        | `pnpm install --frozen-lockfile`              | exit 0              |
| Lint+typecheck | `pnpm check`                                  | exit 0 (warnings OK, errors fail) |
| Tests          | `pnpm test`                                   | 911+ passed, 0 failed |
| One test file  | `pnpm test -- history-sheet`                  | all pass            |
| TZ probe       | `TZ=America/New_York pnpm test`               | 911+ passed, 0 failed (after this plan) |

## Scope

**In scope** (the only files you should modify/create):
- `test/components/student-space/sheets/history-sheet.test.tsx`
- `vitest.config.ts`
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch, even though they look related):
- `.github/workflows/lint-no-dev-bypass-leak.yml` — permanent guard, works.
- Any `describe.skipIf(!process.env.DATABASE_URL)` test — plans/059 territory.
- `src/lib/entry-date.ts` and any production source file — this plan is
  test/CI-only.
- `vercel.json` — deploys are separate from CI.

## Git workflow

- Branch: `advisor/043-ci-gate-and-tz-flake`
- Conventional commits, e.g. `test(history): share sgToday between test and component`,
  `ci: add check+test gate on PR and main`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace `realToday()` with the production `sgToday()`

In `test/components/student-space/sheets/history-sheet.test.tsx`:

1. Add `import { sgToday } from '~/lib/entry-date'` to the imports.
2. Delete the `realToday()` function (lines 60–64) and its stale comment.
3. Replace all five usages (`realToday()` at lines 312, 335, 336, 380, 424)
   with `sgToday()`. Line 336's timestamp becomes
   `` `${sgToday()}T08:00:00.000Z` `` — this stays on the same SGT day
   (08:00 UTC = 16:00 SGT), so the assertion semantics don't change.

The point (and the DRY rider on this plan suite): the test must share the
**same** "today" definition as the component under test, not carry a drifted
private copy.

**Verify**: `pnpm test -- history-sheet` → all tests in the file pass.
**Verify**: `grep -n 'realToday' test/components/student-space/sheets/history-sheet.test.tsx` → no matches.

### Step 2: Pin a non-SGT timezone in vitest so tz-coupling fails fast

In `vitest.config.ts`, add an `env` block to the `test` config:

```ts
test: {
  globals: true,
  environment: 'happy-dom',
  // Pin a non-Singapore zone so any test that accidentally couples the
  // device-local clock to the product's Asia/Singapore day-bucketing
  // (src/lib/entry-date.ts) fails on every machine, not just on CI.
  env: { TZ: 'America/New_York' },
  ...
}
```

Then run the full suite. If it is green, proceed. If between 1 and 3 tests
fail, inspect each: the expected failure mode is a test that (like Step 1's)
computes "today"/day-keys from the device-local clock while the production
code uses `sgToday()`/`sgDateKey()` — fix those the same way as Step 1
(import the production helper into the test). Document each such fix in the
commit message.

**Verify**: `pnpm test` → `0 failed` (same pass count as baseline or higher).
**Verify**: `TZ=Asia/Singapore pnpm test` → also `0 failed` (the pin in
config must win over the shell env; if it does not, confirm the `env` block
is under `test:` and re-run).

### Step 3: Add the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI — check + test

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      # NOTE: no DATABASE_URL on purpose. 128 DB-gated tests are skipped by
      # design until plans/059 revives them; setting DATABASE_URL here would
      # turn them into hard failures.
      - run: pnpm test
```

Notes:
- `pnpm/action-setup@v4` reads the pnpm version from `packageManager` in
  `package.json` if present; if the repo has no `packageManager` field, add
  `with: { version: 9 }` to the action (check `pnpm --version` locally and
  match the major).
- Node 22 matches the repo's stated requirement in `README.md`. The engine
  tests need no browser; happy-dom covers them.
- Do NOT add `pnpm build` — it is the slowest step and adds no verification
  the operator asked for; keep the gate fast (target < 3 min).

**Verify**: `npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "require('js-yaml')" 2>/dev/null; echo done` — if no YAML linter is
available locally, visually confirm indentation and run
`git diff --check` (no trailing whitespace errors). The real verification is
the first PR run.

### Step 4: Full local gate

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm test` → 0 failed.

## Test plan

- No new test files. Step 1 modifies an existing test to share the production
  `sgToday()` helper (this *is* the regression fix — the previous helper
  passed only on UTC+8 machines).
- Step 2's TZ pin is itself a standing test-of-tests: any future test that
  couples the local clock to SGT bucketing fails on every machine.
- Verification: `pnpm test` and `TZ=Asia/Singapore pnpm test` both green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with 0 failures; skip count unchanged (128)
- [ ] `grep -rn 'realToday' test/` returns no matches
- [ ] `grep -n 'TZ' vitest.config.ts` shows the pinned zone
- [ ] `.github/workflows/ci.yml` exists, contains `pnpm check` and
      `pnpm test` steps, and contains no `DATABASE_URL`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- More than 3 test files fail under `TZ=America/New_York` in Step 2 — that
  means tz-coupling is broader than audited and needs its own plan, not
  inline fixes.
- Any failing test under the pinned TZ is NOT explained by local-clock vs
  `sgToday()`/`sgDateKey()` drift (a different root cause means the audit
  missed something).
- `history-sheet.test.tsx` at lines 60–64 does not match the excerpt above
  (drift since planning).

## Maintenance notes

- Plans/059 (revive DB-gated tests) will later add a Postgres service +
  `DATABASE_URL` to this workflow — that is deliberate future work; until it
  lands, the comment in `ci.yml` is the guard against someone "helpfully"
  enabling the env var.
- Plan 046 (finish the SGT migration) adds more non-SGT-timezone test cases;
  the TZ pin from Step 2 is what makes those meaningful. Land 043 first.
- Reviewer should scrutinize: the pass count in CI equals the local pass
  count (a differing skip count means the runner has env vars the plan
  excluded).
