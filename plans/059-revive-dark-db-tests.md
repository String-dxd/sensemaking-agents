# Plan 059: Revive the 128 permanently-skipped DB/handler tests — the tenancy, Connector, and review paths currently have zero executing coverage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This is an L plan built as nine independently-landable steps.** Each step
> ends green (`pnpm check` exit 0, `pnpm test` 0 failed). If you run out of
> budget, stop *between* steps, commit what is done, and report which step
> number you stopped after. Do not leave a step half-applied.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- test/setup.ts vitest.config.ts package.json test/db.test.ts test/db/ test/server/ test/agents/ test/tools/ src/db/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (Lane A is pure test work; Lane B can surface a real RLS finding)
- **Depends on**: none (plan 043 adds CI and deliberately leaves `DATABASE_URL` unset there, deferring to this plan)
- **Category**: tests
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`pnpm test` reports `911 passed | 128 skipped | 0 failed` and reads as green.
It is not. 127 of those 128 skips are gated on `DATABASE_URL`, which **is never
set under vitest** — `test/setup.ts` is a single import line and never loads
dotenv. What is dark is precisely the dangerous set: the `withStudent` RLS
tenancy envelope, the Connector auto-apply chain, verifier-gated diff
confirm/forget, Cartographer dispatch, VIPS page loading, and the counsellor
brief. Worse, **114 of those tests are broken as written** — they import
`openInMemoryDb` from `~/db/client`, an export that no longer exists, and call
now-`async` `seed()` / `insertMirrorEntry()` synchronously. Twelve of them
carry `@ts-nocheck` on line 1, so `tsc --noEmit` is blind to them too.

**The key insight this plan exists to convey: simply setting `DATABASE_URL`
would produce ~114 hard failures, not coverage.** Two different problems are
tangled together — tests written against a deleted v0.1 sqlite API, and a
gate that silently zeroes itself out. This plan separates them into two lanes,
fixes both, and adds a guard so the gate can never go quiet again.

## Current state

### The gate that never fires

`test/setup.ts` — the entire file, one line:

```ts
import '@testing-library/jest-dom/vitest'
```

`vitest.config.ts:13-19` — no `env` block, so nothing injects `DATABASE_URL`:

```ts
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/ablation/reports/**', 'node_modules/**'],
  },
```

`dotenv` is already a runtime dependency (`package.json:45`, `^16.4.5`) and
`import 'dotenv/config'` is the established repo idiom — see
`src/db/drizzle.config.ts:8`, `scripts/ablate.ts:32`,
`scripts/managed-agents/provision.ts:40`.

### Inventory: 15 gated files, two very different populations

**Lane A — broken against the current API (12 files carry `@ts-nocheck`; 11 of
them are handler/agent/tool tests that need no database at all).** Every one
opens with this identical stale header:

```ts
// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
```

| File | `describe.skipIf` gate lines | Skipped tests |
|------|------------------------------|---------------|
| `test/server/auto-connector.test.ts` | 64, 105, 130, 250 | 10 |
| `test/server/confirm-diff.test.ts` | 136, 249, 295, 414 | 11 |
| `test/server/counsellor-brief.test.ts` | 95 | 4 |
| `test/server/forget-diff.test.ts` | 100, 130, 152 | 6 |
| `test/server/forget-timeline-entry.test.ts` | 50, 89 | 6 |
| `test/server/load-pending-review.test.ts` | 61 | 4 |
| `test/server/load-vips-pages.test.ts` | 39, 123, 176 | 7 |
| `test/server/run-cartographer.test.ts` | 111, 181, 269, 325 | 9 |
| `test/agents/managed-connector.test.ts` | 86, 200, 281 | 16 |
| `test/agents/managed-cartographer.test.ts` | 74, 160, 253 | 14 |
| `test/tools/search-corpus.test.ts` | 26 | 2 |
| **Lane A total** | | **89** |

**Lane B — real-Postgres integration tests.**

| File | Gate lines | Skipped tests | State |
|------|-----------|---------------|-------|
| `test/db.test.ts` | 46, 161, 194, 259, 564 | 25 | `@ts-nocheck`, broken (rewrite) |
| `test/db/rls-concurrency.test.ts` | 20 | 3 | **already correct** — no `@ts-nocheck`, uses `withStudent` |
| `test/db/island-snapshots-rls.test.ts` | 18 | 4 | **already correct** |
| `test/agents/memory.test.ts` | 160 | 6 (of 13) | **already correct** |
| **Lane B total** | | **38** | |

89 + 38 = 127. The 128th skip is unrelated —
`test/engine/IslandLayout.export.test.ts` skips 1 test for its own reasons.
**Do not touch it.**

### Why Lane A is broken: the deleted export

`src/db/client.ts` exports (grep `^export` yourself to confirm):
`DbSchema`, `AppDatabase`, `AppTransaction`, `TenantContext`,
`getDbForMemoryModule`, `withStudent`, `assertCounselorHasStudent`,
`findFirstAttachedStudent`, `personalStudentIdForCounselor`,
`attachCounselorToPersonalStudent`, `attachCounselorToDemoStudents`,
`CounselorAccessDeniedError`, `setDbForTests`, `resetDbForTests`.

**There is no `openInMemoryDb`.** `src/db/client.ts:1` records the removal:
`// Postgres client + tenancy envelope. Replaces the v0.1 better-sqlite3 path.`

Every Lane A file still does, e.g. `test/server/load-pending-review.test.ts:13-26`:

```ts
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry, insertVipsProposedDiff, updateVipsProposedDiffStatus } from '~/db/queries'
import { seed } from '~/db/seed'
import { loadPendingReviewHandler } from '~/server/load-pending-review.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})
```

Three separate failures there: `openInMemoryDb` does not exist; `seed()` is
`async` (`src/db/seed.ts:196` — `export async function seed(): Promise<SeedResult>`)
and is called without `await`; and `insertMirrorEntry` is `async`
(`src/db/queries.ts:411-418`) and its result is used synchronously.

### The current tenancy contract Lane A must mock

`src/db/client.ts:42-51`:

```ts
export interface TenantContext {
  /** Transaction-bound Drizzle handle. */
  db: AppTransaction
  /** The student whose tenancy is bound on this transaction. */
  studentId: string
  /** WorkOS counselor id (when running under authkitMiddleware). */
  counselorId?: string
}
```

`src/db/client.ts:150-166`:

```ts
export async function withStudent<T>(
  studentId: string,
  fn: (ctx: TenantContext) => Promise<T>,
  opts: { counselorId?: string } = {},
): Promise<T> {
```

### The exemplar to copy for Lane A

**`test/server/island-state-at.test.ts:11-34` is the pattern. Read it in full
before writing any Lane A test.** It already does exactly what Lane A needs —
`vi.hoisted` mocks over `~/auth/identity` and `~/db/client`, no database:

```ts
const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))
```

…and drives the tenancy seam by handing the handler a stub context
(`island-state-at.test.ts:73`):

```ts
withStudentMock.mockImplementation(async (_studentId, fn) => fn({ db: { execute } }))
```

The Lane A handlers import from exactly three mockable surfaces —
`~/auth/identity` (`requireCounselorContext`), `~/db/client` (`withStudent`),
and `~/db/queries` (named query functions). Confirmed by reading their imports:
`load-pending-review.handler.server.ts:9-10`, `confirm-diff.handler.server.ts:13-22`,
`forget-diff.handler.server.ts:23-30`, `forget-timeline-entry.handler.server.ts:22-24`,
`load-vips-pages.handler.server.ts:16-26`, `counsellor-brief.handler.server.ts:25-34`.
`auto-connector` and `run-cartographer` additionally import `~/agents/*`
(`runner`, `context`, `memory`, `verifier`, `self-critique-eval`).

### The misleadingly-named file

`test/tenancy.test.ts` sounds like it covers tenancy. It does not. It tests
`withStudentLegacy` from `src/server/tenancy.server.ts:13-20` — a **sync
passthrough that touches no database**:

```ts
export function withStudentLegacy<T>(studentId: string, fn: (sid: string) => T): T {
  if (typeof studentId !== 'string' || studentId.trim().length === 0) {
    throw new Error(...)
  }
  return fn(studentId)
}
```

So the *real* tenancy envelope (`~/db/client.withStudent` + Postgres RLS) has
its only coverage in the two skipped `test/db/*rls*` files. That is the single
most important thing this plan restores.

### CRITICAL caveat before you interpret any RLS failure

`src/db/migrations/README.md` (section "FORCE ROW LEVEL SECURITY (deferred)"):

> `ALTER TABLE … FORCE ROW LEVEL SECURITY` is **not** emitted today. Without
> `FORCE`, the table owner bypasses RLS, which is fine for our runtime role (a
> Neon database user without ownership) but means migration scripts running as
> the owner could read cross-tenant rows by accident.

**Therefore**: if you point `DATABASE_URL` at a local Postgres where your
connection user *owns* the tables (the default for `createdb` +
`pnpm db:migrate` as the same user), the RLS tests will fail **for role
reasons, not because RLS is broken**. Before escalating an RLS failure as a
security finding, confirm the connecting role is a non-owner. See STOP
conditions.

### Cleanup targets

`package.json` devDependencies (lines 67 and 74):

```json
    "@types/better-sqlite3": "^7.6.12",
    "better-sqlite3": "^12.0.0",
```

The only remaining *code* reference is `test/db.test.ts:589` inside the dead
SCHEMA_VERSION describe (`test/db.test.ts:564-599`, the end of the 599-line
file), which tests `openDb({ path })` — a sqlite-file API that no longer
exists:

```ts
    const Database = require('better-sqlite3')
    const probe = new Database(dbPath)
    probe.prepare(`UPDATE _meta SET value = '999' WHERE key = 'schema_version'`).run()
```

`package.json` has **no** `engines` field. `README.md:103` states the
requirement: "Requires Node 22+, pnpm, Postgres/Neon connection details, …".

### Local Postgres runbook (from `README.md:103-131`)

```bash
# 1. Put DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct) in .env.
#    .env.example carries the variable names; copy it first.
cp .env.example .env
# 2. Apply migrations + seed the demo corpus.
pnpm demo:bootstrap      # = pnpm db:migrate && pnpm seed
# Re-seed from scratch later:
pnpm demo:reset          # = pnpm db:migrate && SEED_REPLACE_EXISTING=1 pnpm seed
```

`src/db/drizzle.config.ts:11` — migrations use
`DATABASE_URL_UNPOOLED ?? DATABASE_URL`; the app/tests use `DATABASE_URL`.
Any Postgres 15+ works (Neon dev branch, Docker `postgres:16`, or
`embedded-postgres`) as long as the connecting role does **not** own the tables
(see the caveat above).

### Repo conventions

pnpm only, one root lockfile; `island-editor` is a workspace member.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings** (warnings are fine, errors are not).
`pnpm test` = `vitest run`; baseline **911 passed / 128 skipped / 0 failed**.
Tests live in `test/` mirroring `src/`. Conventional commits.
Per `CLAUDE.md`: **never** add `three` to `overrides` — the 0.149-app /
0.171-editor runtime split is deliberate. (This plan touches no `three`.)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 warnings OK, 0 errors) |
| All tests | `pnpm test` | 0 failed |
| One file | `pnpm vitest run test/server/confirm-diff.test.ts` | all pass |
| Skip census | `pnpm test 2>&1 \| grep -E 'skipped\)'` | per-file skip counts |
| DB lane (after step 1) | `pnpm test:db` | 0 failed, Lane B executing |
| Migrate | `pnpm db:migrate` | exit 0 |
| Seed | `pnpm demo:reset` | exit 0 |
| Grep gate | `grep -rn 'openInMemoryDb' test/` | no matches (after step 8) |

## Scope

**In scope** (the only files you should modify/create):

- `test/setup.ts`
- `vitest.config.ts` (only if step 1's dotenv placement needs it)
- `package.json` (`scripts.test:db`, remove two devDependencies, add `engines`)
- `test/db/db-gate-canary.test.ts` (create)
- All 11 Lane A files listed in the table above
- `test/db.test.ts`
- `test/db/rls-concurrency.test.ts`, `test/db/island-snapshots-rls.test.ts`,
  `test/agents/memory.test.ts` — **gates only**, do not rewrite the bodies
- `pnpm-lock.yaml` (regenerated by `pnpm install` after the devDep removal)

**Out of scope** (do NOT touch, even though they look related):

- Any file under `src/` — this plan is test/config only. The one exception is
  a one-line handler fix explicitly permitted in STOP conditions.
- `test/engine/IslandLayout.export.test.ts` — its 1 skip is unrelated to
  `DATABASE_URL`.
- `test/tenancy.test.ts` — it tests `withStudentLegacy` correctly; renaming it
  or repointing it at `withStudent` is a separate change.
- `.github/workflows/` — plan 043 owns CI. Do not add `DATABASE_URL` there.
- `src/db/migrations/` — no new migrations. The `FORCE ROW LEVEL SECURITY`
  decision is deliberately deferred (see its README section).
- `island-editor/` and `bird-builder/` — isolated workspace roots, untouched by
  root tooling.

## Git workflow

- Branch: `advisor/059-revive-dark-db-tests`
- One commit per step (they are designed to be independently landable), e.g.
  `test(setup): load .env so DATABASE_URL-gated tests can run`,
  `test(server): rewrite confirm-diff against mocked queries`,
  `chore(deps): drop better-sqlite3 now that nothing imports it`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `DATABASE_URL` reachable, add `test:db`, and add the loudness canary

Three small changes that end the silence. **No database needed for this step.**

1. `test/setup.ts` — load `.env` before anything else:

```ts
// Load `.env` so DATABASE_URL-gated integration tests (test/db/*, the RLS
// suites, test/agents/memory.test.ts) actually see a connection string when
// the developer has one configured. Without this, `describe.skipIf(!process.env.DATABASE_URL)`
// was permanently true under vitest and 127 tests silently vanished — see
// plans/059. `dotenv/config` is a no-op when `.env` is absent.
import 'dotenv/config'
import '@testing-library/jest-dom/vitest'
```

2. `package.json` — add a script next to `"test"`:

```json
    "test:db": "vitest run test/db test/agents/memory.test.ts",
```

3. Create `test/db/db-gate-canary.test.ts`:

```ts
/**
 * Loudness guard for the DATABASE_URL test gate.
 *
 * Fifteen test files gate whole describes on
 * `describe.skipIf(!process.env.DATABASE_URL)`. When that variable is unset
 * the suite still reports "0 failed", which is how 127 tests stayed dark for
 * months (plans/059). This canary makes the state visible, and lets any
 * caller *demand* the DB lane by exporting REQUIRE_DB_TESTS=1.
 *
 * Deliberately NOT keyed on `CI` alone: plan 043's CI workflow runs without
 * DATABASE_URL on purpose, so an unconditional CI failure would break it.
 */
import { describe, expect, it } from 'vitest'

const hasDb = Boolean(process.env.DATABASE_URL)

describe('DATABASE_URL test gate', () => {
  it('is either satisfied, or explicitly acknowledged as skipped', () => {
    if (process.env.REQUIRE_DB_TESTS === '1') {
      expect(
        hasDb,
        'REQUIRE_DB_TESTS=1 was set but DATABASE_URL is unset — the DB-gated suites would silently skip.',
      ).toBe(true)
      return
    }
    if (!hasDb) {
      console.warn(
        '[db-gate] DATABASE_URL is unset — DB-gated suites are SKIPPED. ' +
          'Set DATABASE_URL (see README "Setup") and re-run, or export REQUIRE_DB_TESTS=1 to make this a hard failure.',
      )
    }
    expect(true).toBe(true)
  })
})
```

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm test` → 0 failed; total test count is baseline + 1 (the new
canary passes).
**Verify**: `REQUIRE_DB_TESTS=1 pnpm vitest run test/db/db-gate-canary.test.ts`
→ **fails** with the "REQUIRE_DB_TESTS=1 was set but DATABASE_URL is unset"
message when you have no `.env` DB, or passes when you do. Either outcome is
correct; confirm the message appears in the failing case.

### Step 2 (needs Postgres — skippable): confirm Lane B's three ready files execute

These three files are already written against the current `withStudent` +
Drizzle surface and carry **no** `@ts-nocheck`. With step 1 landed and a
`DATABASE_URL` in `.env`, they should simply run.

```bash
pnpm db:migrate
pnpm test:db
```

Expected: `test/db/rls-concurrency.test.ts` (3), `test/db/island-snapshots-rls.test.ts`
(4) and `test/agents/memory.test.ts` (6 previously-skipped) all **execute**.
`test/db.test.ts` will fail loudly — that is expected and is step 7's job; run
`pnpm vitest run test/db/rls-concurrency.test.ts test/db/island-snapshots-rls.test.ts test/agents/memory.test.ts`
to isolate the three.

**If you have no Postgres available**, record "Step 2 deferred — no local
Postgres" in your report and continue to step 3. Do **not** fabricate a
result.

**Verify (with DB)**: `pnpm vitest run test/db/rls-concurrency.test.ts test/db/island-snapshots-rls.test.ts test/agents/memory.test.ts`
→ 13 tests, 0 skipped, 0 failed.
**Verify (with DB)**: an RLS failure here is a **STOP condition** — read the
FORCE-RLS caveat in "Current state" first, then follow STOP conditions.

### Step 3: Lane A — the four small single-handler files

Rewrite these four first; they are the smallest and establish the pattern for
the rest:

- `test/server/load-pending-review.test.ts` (gate line 61, 4 tests)
- `test/server/forget-timeline-entry.test.ts` (gate lines 50, 89, 6 tests)
- `test/server/counsellor-brief.test.ts` (gate line 95, 4 tests)
- `test/tools/search-corpus.test.ts` (gate line 26, 2 tests)

For each file:

1. **Delete the 5-line `@ts-nocheck` header block.**
2. **Delete the `describe.skipIf(!process.env.DATABASE_URL)` gate** — make it a
   plain `describe(...)`.
3. **Delete** `import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'`
   and the `beforeEach`/`afterEach` that call them, plus `import { seed } from '~/db/seed'`.
4. **Add `vi.hoisted` + `vi.mock` blocks** over `~/auth/identity` and, as the
   handler requires, `~/db/client` and/or `~/db/queries`. Mock **only the
   functions the handler under test actually imports** — read the handler's
   import list first. Follow `test/server/island-state-at.test.ts:11-34`
   exactly.
5. **Keep the test names and the documented intent** (each file's JSDoc block
   states what it is asserting — e.g. `load-pending-review.test.ts:6-12`
   "Returns null when no pending row exists / Returns the most-recent pending
   row / Ignores non-pending rows"). Preserve those cases; re-express the
   *arrangement* as mock return values instead of seeded rows.
6. `search-corpus.test.ts` is the simplest: `executeSearchPastMirrors`
   (`src/agents/tools/search-corpus.server.ts:18-24`) only calls `searchMirrors`
   from `~/db/queries`. Mock that one function; keep both cases (ranked rows
   scoped to the student; empty corpus returns `{ results: [] }`).

Do **not** invent new assertions. If a case cannot be expressed without a real
database (e.g. it asserts FTS ranking semantics), move that single `it` into
`test/db.test.ts`'s Lane B territory with a `describe.skipIf(!process.env.DATABASE_URL)`
gate and a comment naming why, rather than weakening it.

**Verify**: `pnpm vitest run test/server/load-pending-review.test.ts test/server/forget-timeline-entry.test.ts test/server/counsellor-brief.test.ts test/tools/search-corpus.test.ts`
→ 16 tests, **0 skipped**, 0 failed.
**Verify**: `grep -n '@ts-nocheck' test/server/load-pending-review.test.ts test/server/forget-timeline-entry.test.ts test/server/counsellor-brief.test.ts test/tools/search-corpus.test.ts`
→ no matches.
**Verify**: `pnpm check` → exit 0 (these four files are now type-checked for
the first time).

### Step 4: Lane A — the review chain (`confirm-diff`, `forget-diff`)

- `test/server/confirm-diff.test.ts` (gate lines 136, 249, 295, 414, 11 tests)
- `test/server/forget-diff.test.ts` (gate lines 100, 130, 152, 6 tests)

Same transformation as step 3. These two are the verifier-gated review path
and are the highest-value coverage in Lane A, so preserve the documented cases
from `confirm-diff.test.ts:6-16` verbatim in spirit:

- happy path: confirm 3 admitted entries across 2 dimensions → 3 rows in
  `vips_timeline_entries`, 2 `vips_pages` updated
- partial batch: confirm 2, forget 1 → only 2 timeline rows, status flips to
  `'confirmed'` on the last resolution, `vips_forget_count` unchanged (R20)
- last-entry finalization: diff status flips to `'confirmed'`, `reviewed_at`
  non-null

With mocked `~/db/queries`, "3 rows written" becomes "`insertVipsTimelineEntry`
called 3 times with these arguments" and "2 pages updated" becomes
"`upsertVipsPage` called twice". Assert on the **calls**, which is a stronger
statement about the handler's orchestration than asserting on rows anyway.

`confirm-diff.test.ts` also imports `buildReviewEntryId` from
`~/server/review-payload-shape` — that is a pure helper, keep it real (do not
mock it).

**Verify**: `pnpm vitest run test/server/confirm-diff.test.ts test/server/forget-diff.test.ts`
→ 17 tests, 0 skipped, 0 failed.
**Verify**: `pnpm check` → exit 0.

### Step 5: Lane A — `load-vips-pages`

- `test/server/load-vips-pages.test.ts` (gate lines 39, 123, 176, 7 tests)

Same transformation. Note this handler imports more surfaces
(`load-vips-pages.handler.server.ts:15-33`): `~/db/client` (`withStudent`),
`~/db/queries`, `~/lib/student-space/demo-shell-data.server`,
`./counsellor-brief.handler.server`, `./mood-tags`. Mock the DB surfaces; keep
`mood-tags` and the input schema real (pure). The `R19 / R20 boundaries` and
`input validation` describes are the load-bearing ones — the validation cases
need no mocking at all and should become plain, always-running tests.

**Verify**: `pnpm vitest run test/server/load-vips-pages.test.ts` → 7 tests,
0 skipped, 0 failed.
**Verify**: `pnpm check` → exit 0.

### Step 6: Lane A — the agent dispatch files

- `test/server/auto-connector.test.ts` (gate lines 64, 105, 130, 250, 10 tests)
- `test/server/run-cartographer.test.ts` (gate lines 111, 181, 269, 325, 9 tests)
- `test/agents/managed-connector.test.ts` (gate lines 86, 200, 281, 16 tests)
- `test/agents/managed-cartographer.test.ts` (gate lines 74, 160, 253, 14 tests)

Same transformation, plus: these mock the agent layer as well as the DB layer.
`auto-connector.handler.server.ts:23-51` imports `~/agents/config`,
`~/agents/context`, `~/agents/memory`, `~/agents/runner`, `~/agents/schemas`,
`~/agents/self-critique-eval`, `~/agents/verifier`.

**Keep `~/agents/verifier` real** — `verifyProposedDiff` is the deterministic
hard gate before any Connector link persists, and testing the handler against
the *real* verifier is the point. Mock `runManagedAgent` (return canned agent
output) and the DB queries. The already-passing
`test/agents/managed-mirror.test.ts` shows the fake-transport style for the
runner if you prefer injecting a transport over mocking the module.

For the two `managed-*` files, their `Step 8 / Step 9 buildConnectorContext —
DB pre-fetch` describes exist to prove the context builder reads the right
rows. With `~/db/queries` mocked, assert the builder calls the expected query
functions with the expected student id and shapes the prompt from their
results.

**Verify**: `pnpm vitest run test/server/auto-connector.test.ts test/server/run-cartographer.test.ts test/agents/managed-connector.test.ts test/agents/managed-cartographer.test.ts`
→ 49 tests, 0 skipped, 0 failed.
**Verify**: `pnpm check` → exit 0.
**Verify**: `grep -rn 'openInMemoryDb' test/server/ test/agents/ test/tools/` →
no matches.

### Step 7a: Delete the dead SCHEMA_VERSION / better-sqlite3 block (no DB needed)

In `test/db.test.ts`, delete the entire final describe —
`describe.skipIf(!process.env.DATABASE_URL)('SCHEMA_VERSION mismatch drop-and-reseed', …)`
at **lines 564-599** (to end of file). It tests `openDb({ path })` against an
on-disk sqlite file and a `_meta.schema_version` row; neither exists in the
Postgres client. Also remove the now-unused imports it required from the top of
the file: `existsSync, mkdtempSync, rmSync` from `node:fs`, `tmpdir` from
`node:os`, `join` from `node:path`, and `openDb` from the `~/db/client` import
(lines 6-11).

Leave the other four describes alone for now (they still have `@ts-nocheck`
covering them; step 7b handles them).

**Verify**: `grep -n 'better-sqlite3\|SCHEMA_VERSION\|openDb' test/db.test.ts`
→ no matches.
**Verify**: `pnpm test` → 0 failed; skip count drops by 1 (the deleted
describe's single test).

### Step 7b (needs Postgres): rewrite `test/db.test.ts` against the current Drizzle surface

The remaining four describes (`schema + queries` :46, `seed loader` :161,
`ECG taxonomy fixture` :194, `VIPS schema (U1)` :259) are written against
`openInMemoryDb()` + sync query calls. **Rewrite, do not force-fix.**

Rules:

- **Re-derive assertions from current behavior**, not from the old
  expectations. Run each query function against a seeded local Postgres, look
  at what it actually returns, and assert that. The old expectations encode a
  sqlite/FTS5 world (e.g. `searchMirrors` "round-trips through FTS5") that no
  longer applies.
- Keep `describe.skipIf(!process.env.DATABASE_URL)` on every describe here —
  this file is Lane B, it needs a real database.
- Replace `openInMemoryDb()` + `{ ctx: { db } }` with real `withStudent`
  envelopes, or simply omit the `ctx` option (the query functions open their
  own `withStudent` when `opts.ctx` is absent — see
  `src/db/queries.ts:411-418`).
- `await` everything. `seed()` is async; every query function is async.
- Use unique per-run student ids so re-runs do not accumulate state — copy the
  idiom from `test/db/rls-concurrency.test.ts:17-18`:
  `const STUDENT_A = \`rls-test-a-${process.pid}-${Date.now()}\`` — and clean
  up in `afterEach` the way `test/agents/memory.test.ts:163-175` does.
- **Splitting is encouraged.** 599 lines covering four unrelated concerns is
  itself the problem. Prefer `test/db/queries.test.ts`,
  `test/db/seed.test.ts`, `test/db/vips-schema.test.ts` and keep
  `test/data/ecg-taxonomy.test.ts` (the ECG fixture describe imports only
  `~/data/ecg-taxonomy` — read it; if it needs no database at all, move it out
  of the gate entirely so it runs everywhere). Update the `test:db` script's
  paths if you split into new directories.
- **Remove the `@ts-nocheck`** from every file you produce here.

**Verify**: `pnpm check` → exit 0 (the rewritten file(s) are now type-checked).
**Verify**: `pnpm test:db` → 0 failed, and the previously-25 skipped tests now
execute (or the split equivalents do).
**Verify**: `pnpm test` (no `DATABASE_URL`) → 0 failed; these tests skip
cleanly.

**If you have no Postgres**, stop after 7a, report "Step 7b deferred — needs
local Postgres", and note that `test/db.test.ts` still carries `@ts-nocheck`
and its four gated describes.

### Step 8: Drop `better-sqlite3` and pin the Node engine

Only after step 7a (which removes the last code reference).

1. Confirm nothing imports it:
   `grep -rn "better-sqlite3" src/ test/ scripts/ island-editor/src bird-builder/src`
   → the only acceptable remaining hits are prose comments. Delete any stale
   comment mentions inside `test/` files you already rewrote (the `@ts-nocheck`
   headers referenced it; those headers are gone by now).
2. Remove both devDependencies from `package.json` (lines 67 and 74):
   `"@types/better-sqlite3"` and `"better-sqlite3"`.
3. Add an `engines` block matching `README.md:103` ("Requires Node 22+"). Put
   it after `"type": "module"`:

```json
  "engines": {
    "node": ">=22"
  },
```

4. `pnpm install` to regenerate the lockfile.

**Verify**: `grep -n 'better-sqlite3' package.json` → no matches.
**Verify**: `grep -rn "better-sqlite3" src/ test/ scripts/` → no matches.
**Verify**: `node -e "const p=require('./package.json'); if(p.engines?.node!=='>=22') throw new Error('engines.node not set'); console.log('ok')"` → `ok`.
**Verify**: `pnpm install` → exit 0; `pnpm check && pnpm test` → check exit 0,
0 failed.

### Step 9: Final gate and skip census

**Verify**: `pnpm check` → exit 0, ≤18 warnings, 0 errors.
**Verify**: `pnpm test` → 0 failed. Record the new skip count. Expected: **38
or fewer** (Lane B only), down from 128 — plus the 1 unrelated
`IslandLayout.export` skip. If step 7b landed and split the file, the Lane B
count changes; report the exact number.
**Verify**: `grep -rn 'openInMemoryDb' test/` → no matches.
**Verify**: `grep -rln '@ts-nocheck' test/` → no matches (or, if step 7b was
deferred, exactly `test/db.test.ts`).
**Verify**: `pnpm test 2>&1 | grep -E 'skipped\)'` → every remaining skipped
file is one of `test/db/*`, `test/agents/memory.test.ts`, or
`test/engine/IslandLayout.export.test.ts`.

## Test plan

- **No net-new features under test.** This plan converts 89 dark tests into
  executing tests (Lane A) and makes 38 more reachable (Lane B).
- New file: `test/db/db-gate-canary.test.ts` — one test, two branches
  (`REQUIRE_DB_TESTS=1` demands a URL; otherwise warns loudly).
- Structural pattern for every Lane A rewrite:
  `test/server/island-state-at.test.ts` (mock-based, no DB).
- Structural pattern for every Lane B file: `test/db/rls-concurrency.test.ts`
  (unique per-run student ids, real `withStudent`, `describe.skipIf` retained).
- Runner-fake pattern if you inject transports instead of mocking modules:
  `test/agents/managed-mirror.test.ts:26-55`.
- Verification: `pnpm test` → 0 failed with the skip count down from 128 to
  ≤39; `pnpm test:db` → 0 failed against a real Postgres.

## Done criteria

Machine-checkable. ALL must hold (mark the DB-dependent ones N/A with a
written reason if step 2/7b were deferred):

- [ ] `pnpm check` exits 0, 0 errors
- [ ] `pnpm test` exits 0 with **0 failed**
- [ ] `grep -rn 'openInMemoryDb' test/` returns no matches
- [ ] `grep -rln '@ts-nocheck' test/` returns no matches (or only `test/db.test.ts` if 7b deferred)
- [ ] `grep -n 'better-sqlite3' package.json` returns no matches
- [ ] `node -e "if(require('./package.json').engines?.node!=='>=22')process.exit(1)"` exits 0
- [ ] `grep -n 'test:db' package.json` shows the new script
- [ ] `test/db/db-gate-canary.test.ts` exists; `REQUIRE_DB_TESTS=1 pnpm vitest run test/db/db-gate-canary.test.ts` fails when `DATABASE_URL` is unset
- [ ] `pnpm test` skip count ≤ 39 (was 128)
- [ ] `grep -n 'DATABASE_URL' .github/workflows/*.yml` returns no matches (plan 043's CI stays DB-free)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, including which steps were deferred

## STOP conditions

Stop and report back (do not improvise) if:

- **An RLS test fails against a real database.** This is potentially a critical
  tenancy security finding — but first check the FORCE-RLS caveat in "Current
  state": confirm your connecting role does **not** own the tables
  (`select tableowner from pg_tables where tablename = 'vips_timeline_entries';`
  compared against `select current_user;`). If the role *is* the owner, the
  failure is a local-setup artifact — say so and move on. If the role is a
  non-owner and cross-tenant rows are still visible, **STOP immediately** and
  report it as a security finding with the exact query and output.
- **A rewritten Lane A test exposes a real handler regression.** Fix it only if
  it is a genuine one-liner in `src/` (a missing `await`, an inverted
  condition) — commit it separately with a `fix(...)` message and call it out.
  Anything larger: report the finding with the failing assertion and leave the
  test failing behind a `it.todo` or a clearly-commented `it.fails`, then STOP.
- More than **3** Lane A files cannot be expressed against mocks without
  inventing new behavior — that means the audit's two-lane split is wrong for
  those files and needs re-planning, not improvisation.
- `pnpm install` after step 8 changes any version other than removing
  `better-sqlite3` / `@types/better-sqlite3` — report the diff.
- The code at any "Current state" location does not match the excerpts above.
- You are tempted to add `DATABASE_URL` to `.github/workflows/` — do not. Plan
  043 owns CI and deliberately excludes it; wiring a Postgres service into CI
  is deferred follow-up work, not part of this plan.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**: (1) that Lane A's mocked assertions
  actually assert *orchestration* (which query was called, with what student
  id, how many times) and not merely "the handler returned without throwing" —
  a mock-based test that only checks the happy return is worse than no test
  because it looks like coverage; (2) that `~/agents/verifier` is **not**
  mocked in `auto-connector.test.ts` — the deterministic verifier is the hard
  gate and must run for real; (3) that every `describe.skipIf` removed in
  Lane A really needed no database.
- **The canary is the ratchet.** Anyone who adds a new
  `describe.skipIf(!process.env.DATABASE_URL)` gate should also be adding
  `REQUIRE_DB_TESTS=1` to whatever job is supposed to run it. If the skip
  count ever climbs back above the Lane B baseline without a corresponding
  runner, that is the same failure mode returning.
- **Deliberately deferred**: a Postgres service container in
  `.github/workflows/ci.yml` plus `REQUIRE_DB_TESTS=1` on that job. That is
  the natural follow-up once Lane B is trustworthy, and it is the moment plan
  043's `ci.yml` comment stops applying. It needs a decision about the
  non-owner role (see the FORCE-RLS section of `src/db/migrations/README.md`)
  before it is safe, which is why it is not here.
- **Also deliberately deferred**: repointing `test/tenancy.test.ts` at the real
  async `withStudent` (or renaming it to `withStudentLegacy.test.ts` so its
  name stops implying tenancy coverage it does not provide). One-line rename,
  but it churns a file this plan otherwise never touches.
- Plan 063 explicitly waits on this plan before bumping `drizzle-orm`
  0.36 → 0.45 (a high-severity advisory fix). Once 059 is DONE, that bump
  becomes verifiable via `pnpm test:db`; note it in your completion report so
  063's executor knows the gate is open.
- Plan 056 (Growth tab query collapse) lists 059 as a soft dependency for the
  same reason — its performance rewrite is only verifiable against executing
  DB tests.
