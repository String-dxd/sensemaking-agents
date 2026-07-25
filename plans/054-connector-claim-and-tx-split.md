# Plan 054: Make Connector candidate selection atomic and SQL-bounded, and stop holding a transaction across the agent call

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/server/auto-connector.handler.server.ts src/server/run-connector.handler.server.ts src/db/queries.ts src/db/schema.ts src/db/migrations/ src/agents/context/index.ts test/server/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (restructures the write path that mutates a student's VIPS wiki; a mistake either duplicates links or silently stops creating them)
- **Depends on**: `plans/048-scrub-pii-from-server-logs.md` (also edits `auto-connector.handler.server.ts`; 048 is S — land it first)
- **Category**: bug / perf
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Three defects compound into one duplication bug, and they have to be fixed
together because fixing any one alone makes the others worse.

1. `runAutoConnectorAfterMirror` wraps its **entire** chain — including a
   120-second Anthropic Managed Agents round-trip and two memory-store HTTP
   calls — inside a `withStudent(...)` Postgres **transaction**. With
   `DATABASE_POOL_MAX` defaulting to 5, five concurrent captures leave every
   pooled connection `idle in transaction` and every other request in the app
   (History, Profile, auth) blocks on `connectionTimeoutMillis = 5000` and
   then fails.
2. Candidate selection (`listUnconnectedMirrorEntriesInner`) materialises
   **every** mirror entry the student has ever written — each with a tag join
   and the full `raw_output_json` agent blob — plus **every** proposed diff,
   builds a `Set` in JS, filters, and only then `.slice(0, limit)`. The
   caller's `limit` never reaches SQL.
3. That candidate list is read in one transaction and consumed by a
   *different* transaction per entry, with **no lock and no claim**. Two runs
   that overlap — the evening cron and the capture-time invocation the browser
   fires after every confirmed capture, or two captures in a row — both see
   the same entry as "unconnected" and both run the Connector on it. The only
   unique index on `vips_proposed_diffs` is pending-only, so both `confirmed`
   audit rows are accepted. Result: **duplicated wiki timeline links and
   duplicated `reinforces_id` chains on the student's VIPS pages**, plus double
   LLM spend, over a race window as wide as the full agent latency (up to 120 s).

After this plan: one bounded SQL query picks candidates, an atomic claim makes
overlapping runs mutually exclusive, the agent call happens outside any
transaction, and a DB-level unique index is the backstop if the claim ever
fails. Admitted/dropped verifier semantics are unchanged — this is a
correctness + latency fix, not a behaviour change.

## Current state

Files and their roles:

- `src/server/auto-connector.handler.server.ts` — the capture→Connector chain.
  The transaction, the agent call, the memory writes, and the audit insert all
  live inside one `withStudent` callback.
- `src/db/queries.ts` — `listUnconnectedMirrorEntriesInner` (candidate
  selection), the `vipsProposedDiffs` helpers.
- `src/db/schema.ts` — `vipsProposedDiffs` table + its indexes and status CHECK.
- `src/server/run-connector.handler.server.ts` — the cron + manual fan-out that
  calls candidate selection then loops `runAutoConnectorAfterMirror`.
- `src/lib/student-space/backend-bridge.ts` — the browser-side capture-time
  invocation that races the cron.
- `src/agents/context/index.ts` — `buildConnectorContext(ctx, newReflectionId)`
  builds the prompt and **requires** a `TenantContext`.

### The transaction wraps everything

`src/server/auto-connector.handler.server.ts:146-152` and `:195-197`:

```ts
export async function runAutoConnectorAfterMirror(
  studentId: string,
  mirrorEntryId: number,
  deps: AutoConnectorDeps = {},
): Promise<AutoConnectorResult> {
  return withStudent(studentId, async (ctx) => {
    const mirror = await getMirrorEntry(studentId, mirrorEntryId, { ctx })
```

```ts
    let rawDraft: unknown
    try {
      rawDraft = await raceWithTimeout(runner(), AUTO_CONNECTOR_TIMEOUT_MS, ac)
```

`AUTO_CONNECTOR_TIMEOUT_MS = 120_000` (`:71`). `withStudent` is a real
transaction — `src/db/client.ts:150-166`:

```ts
export async function withStudent<T>(
  studentId: string,
  fn: (ctx: TenantContext) => Promise<T>,
  opts: { counselorId?: string } = {},
): Promise<T> {
  if (!studentId || studentId.trim().length === 0) {
    throw new Error('withStudent: studentId is required')
  }
  const db = getDb()
  return db.transaction(async (tx) => {
    // FIRST statement: bind the tenancy GUC for the duration of this tx.
    await tx.execute(sql`select set_config('app.student_id', ${studentId}, true)`)
    return fn({ db: tx, studentId, counselorId: opts.counselorId })
  })
}
```

Pool config — `src/db/client.ts:65-71`: `max: Number(process.env.DATABASE_POOL_MAX ?? 5)`,
`connectionTimeoutMillis: 5_000`.

**Post-timeout hazard**: on soft timeout, `raceWithTimeout` rejects, the catch
at `:198-206` returns `{ status: 'timeout' }`, the `withStudent` callback
resolves, and the transaction commits — releasing the pooled client. But the
runner promise is still live. `runConnectorViaManaged` (`:574-606`) calls
`await buildConnectorContext(input.ctx, input.newReflectionId)` **on that same
`ctx`**; if the timeout fires while those queries are in flight, they continue
issuing statements against a released client.

### Memory-store HTTP writes are inside the transaction too

`src/server/auto-connector.handler.server.ts:257-263`:

```ts
      try {
        await appendStudentMemory(
          studentId,
          MEMORY_FILE_PATHS.rejectedDiffPatterns,
          appendIfNovel(summary, { source: `connector#${mirror.id}` }),
          deps.memoryTransport,
        )
```

and `:585-594` inside `runConnectorViaManaged`:

```ts
  let memoryStoreId: string | null = null
  try {
    memoryStoreId = await getOrCreateMemoryStoreId(input.studentId, input.memoryTransport)
  } catch (err) {
```

Both go through `src/agents/memory/index.ts`, which uses
`getDbForMemoryModule()` (the **pool-level** handle) and opens its *own*
transaction — documented at `src/agents/memory/index.ts:13-18`. So each of
these checks out a **second** pooled connection while the outer transaction
still holds the first: 2 connections per in-flight capture against a pool of 5.

### Candidate selection materialises everything

`src/db/queries.ts:508-527`:

```ts
export async function listUnconnectedMirrorEntries(
  studentId: string,
  opts: { limit?: number; ctx?: TenantContext } = {},
): Promise<MirrorEntryRow[]> {
  if (opts.ctx) return listUnconnectedMirrorEntriesInner(opts.ctx, opts.limit)
  return withStudent(studentId, (ctx) => listUnconnectedMirrorEntriesInner(ctx, opts.limit))
}

async function listUnconnectedMirrorEntriesInner(
  ctx: TenantContext,
  limit: number | undefined,
): Promise<MirrorEntryRow[]> {
  const entries = await listMirrorEntriesInner(ctx, undefined, false)
  const proposedDiffs = await listVipsProposedDiffsInner(ctx, undefined)
  const attemptedMirrorIds = new Set(proposedDiffs.map((diff) => diff.mirror_entry_id))
  const unconnected = entries.filter(
    (entry) => entry.review_status === 'confirmed' && !attemptedMirrorIds.has(entry.id),
  )
  return limit === undefined ? unconnected : unconnected.slice(0, limit)
}
```

`listMirrorEntriesInner(ctx, undefined, false)` runs `SELECT *` with **no
LIMIT** (`:472-497`) and then a batched tag join. `review_status` is derived
from the `system:mirror-confirmed` / `system:mirror-forgotten` tag labels — see
`rowToMirrorEntry` at `:210-230` and the constants at `:131-133`:

```ts
const MIRROR_CONFIRMED_TAG = 'system:mirror-confirmed'
const MIRROR_FORGOTTEN_TAG = 'system:mirror-forgotten'
```

So "confirmed" in SQL means: has a `system:mirror-confirmed` tag AND does not
have a `system:mirror-forgotten` tag.

### Two uncoordinated callers

`src/server/run-connector.handler.server.ts:66-97` (cron + manual):

```ts
  const limit = input.limit ?? DEFAULT_CONNECTOR_BATCH_LIMIT
  const listEntries = deps.listUnconnectedMirrorEntries ?? listUnconnectedMirrorEntries
  const candidates = await listEntries(studentId, { limit: limit + 1 })
  const confirmedCandidates = candidates.filter((entry) => entry.review_status === 'confirmed')
  const entriesToProcess = confirmedCandidates.slice(0, limit)
```

...then `:90-91` loops `await runOne(studentId, mirrorEntry.id, deps.autoConnector)`.
`runConnectorCronHandler` (`:127-170`) fans this across **every** attached
student. `DEFAULT_CONNECTOR_BATCH_LIMIT = 5` (`:11`).

`src/lib/student-space/backend-bridge.ts:317-336` — the browser fires a second,
uncoordinated run after every confirmed capture:

```ts
function maybeRunDemoConnectorAfterCapture(): void {
  if (import.meta.env.VITE_DEMO_CONNECTOR_AT_CAPTURE !== '1') return
  void (async () => {
    const startedAt = performance.now()
    try {
      const run = await runConnector({ data: { limit: 3 } })
```

### The missing constraint

`src/db/schema.ts:333-341`:

```ts
  (t) => [
    check(
      'vips_proposed_diffs_status_check',
      sql.raw("status IN ('pending','confirmed','forgotten')"),
    ),
    index('idx_vips_proposed_diffs_student_status').on(t.studentId, t.status, t.createdAt.desc()),
    uniqueIndex('vips_proposed_diffs_pending_per_student')
      .on(t.studentId)
      .where(sql`status = 'pending'`),
```

The only unique index is **pending-only**. Two `confirmed` rows for the same
`mirror_entry_id` are permitted. Status type — `src/db/queries.ts:908`:

```ts
export type VipsProposedDiffStatus = 'pending' | 'confirmed' | 'forgotten'
```

### The claim-mechanism decision (already made — do not re-litigate)

Two candidate mechanisms were considered:

- **`SELECT … FOR UPDATE SKIP LOCKED` in a short claim transaction** —
  **REJECTED**. A row lock lives only as long as its transaction. The whole
  point of this plan is that the claim must survive across the agent call,
  after the claim transaction has committed. Keeping the claim transaction open
  for the agent round-trip is the bug we are fixing.
- **A durable claim row** — **CHOSEN**. It survives the claim transaction, is
  visible to every other run, and can be released by a timeout sweep.

Where the claim row lives: reuse `vips_proposed_diffs` with a **new status
value `'running'`**, so the claim row *is* the audit row (insert `'running'`
in tx #1, update the same row to `'confirmed'` in tx #2). This is the DRY
choice — one new partial unique index,
`UNIQUE (student_id, mirror_entry_id) WHERE status <> 'forgotten'`, does two
jobs at once: it is the atomic-claim arbiter *and* the duplicate-diff backstop
this plan needs anyway.

The **existing** `vips_proposed_diffs_pending_per_student` index is *not* the
right arbiter, because it is keyed on `student_id` only (not the entry) and
because `'pending'` rows are user-visible: `loadPendingReviewHandler`
(`src/server/load-pending-review.handler.server.ts:34`) does
`listVipsProposedDiffs(studentId, { status: 'pending' })` and renders the first
row in the student's review surface. A transient `'pending'` claim would flash
a payload-less diff at the student. `'running'` is invisible to that query.
Leave the pending index alone.

**Stale-claim release**: a `'running'` row whose process died (function
timeout, deploy mid-run) would block that entry forever. Every claim attempt
therefore first deletes `'running'` rows older than a timeout constant
(`CONNECTOR_CLAIM_STALE_MS`, set to `AUTO_CONNECTOR_TIMEOUT_MS * 2` = 240 s —
comfortably longer than the soft budget so a live run is never reaped).

### Repo conventions

- Package manager is **pnpm only**. `pnpm check` = Biome + `tsc --noEmit`.
- Tenancy: **every** DB read/write goes through the `withStudent` envelope
  (`src/db/client.ts`). Bypassing it is a tenancy bug. Query functions take an
  optional `opts.ctx` and open their own envelope when it is absent — match
  that pattern exactly (see `insertVipsProposedDiff` at
  `src/db/queries.ts:1434-1441`).
- Drizzle migrations are generated, never hand-written from scratch:
  `pnpm db:generate`. Current head is `0003_concerned_robin_chapel`
  (`src/db/migrations/meta/_journal.json`).
- Conventional commits (`git log` example: `fix(history): bucket entry dates in
  Asia/Singapore, not UTC (#100)`).
- Baseline at plan time: `pnpm check` exit 0 with 18 pre-existing lint
  warnings; `pnpm test` = 911 passed / 128 skipped / 0 failed.
- `test/server/pg-transaction-serialization.test.ts` is a **source-level guard**
  that asserts `src/db/queries.ts` and `src/server/auto-connector.handler.server.ts`
  do not fan out queries with `Promise.all` on one transaction client. Keep
  your new code sequential inside a transaction or that test fails.

### Dead tests — do not rely on them

`test/server/auto-connector.test.ts` and `test/db.test.ts` are `@ts-nocheck`
legacy better-sqlite3 tests gated on `DATABASE_URL` and they import
`openInMemoryDb`, **which no longer exists** in `src/db/client.ts`. They cannot
pass even with a database. Write fresh mocked tests instead (Step 7).

## Commands you will need

| Purpose            | Command                                                          | Expected on success                          |
|--------------------|------------------------------------------------------------------|----------------------------------------------|
| Install            | `pnpm install`                                                   | exit 0                                       |
| Check              | `pnpm check`                                                     | exit 0 (18 pre-existing warnings OK)         |
| All tests          | `pnpm test`                                                      | ≥911 passed, 0 failed                        |
| One file           | `pnpm vitest run test/server/connector-claim.test.ts`            | new tests pass                               |
| Migration          | `pnpm db:generate`                                               | writes the next `src/db/migrations/NNNN_*.sql` |
| Apply migration    | `pnpm db:migrate`                                                | exit 0 (needs `DATABASE_URL`)                |
| Seed a local DB    | `pnpm demo:reset`                                                | exit 0 (needs `DATABASE_URL`)                |

## Scope

**In scope** (the only files you should modify/create):

- `src/db/schema.ts` — new status value in the CHECK + the new partial unique index
- the next sequential `src/db/migrations/NNNN_*.sql` + `src/db/migrations/meta/*`
  (generated by `pnpm db:generate`; head at plan time is `0003_concerned_robin_chapel`,
  but `plans/047-capture-retry-idempotency.md` also generates one — use whatever
  number drizzle-kit assigns after rebasing, and refer to it as `$MIG` below)
- `src/db/queries.ts` — SQL candidate selection; claim/release/finalize helpers; widen `VipsProposedDiffStatus`
- `src/server/auto-connector.handler.server.ts` — the tx #1 / agent / tx #2 split
- `test/server/connector-claim.test.ts` (create)
- `test/db/connector-claim-concurrency.test.ts` (create; `DATABASE_URL`-gated)

**Out of scope** (do NOT touch, even though they look related):

- `src/server/run-cartographer.handler.server.ts` — it has the **same**
  transaction-across-agent-call shape (`withStudent` at `:141`, agent call at
  `:155-161`, 780 s runner timeout at `:414`) but shares **no** helper with the
  Connector path: it uses `buildCartographerContext`, not
  `buildConnectorContext`, and never touches `listUnconnectedMirrorEntries` or
  `vips_proposed_diffs`. Step 1 makes you verify this. Record it as a follow-up
  (Maintenance notes); do not expand this plan into it.
- `src/lib/student-space/backend-bridge.ts` — the capture-time invocation stays
  as-is; the claim is what makes it safe. Productionizing that spike is
  `plans/066-connector-at-capture-productionize.md`.
- `src/server/confirm-diff.handler.server.ts` / `forget-diff.handler.server.ts` —
  they transition existing rows; the new `'running'` status never reaches them.
- `src/server/load-pending-review.handler.server.ts` — its `status: 'pending'`
  filter already excludes `'running'`. No change needed; do not "improve" it.
- `buildConnectorContext`'s internal re-fetch of mirror/pages/timeline (it
  duplicates reads the handler already did). Real DRY win, but a separate
  change — record it as a follow-up.
- `AUTO_CONNECTOR_TIMEOUT_MS` value, the `AutoConnectorStatus` enum, and the
  `deps` test-seam shapes — all unchanged.

## Git workflow

- Branch: `advisor/054-connector-claim-and-tx-split`
- One commit per step. Conventional commits, e.g.
  `fix(connector): claim candidates atomically and bound the agent call outside the tx`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm current state and the no-shared-helper assumption

Read all five files listed under "Current state" and confirm the excerpts match.
Then prove Cartographer shares nothing that would force the same split.

**Verify**:
- `grep -c 'listUnconnectedMirrorEntries\|buildConnectorContext\|vipsProposedDiffs\|insertVipsProposedDiff' src/server/run-cartographer.handler.server.ts` → `0`
- `grep -n 'withStudent(studentId, async (ctx)' src/server/run-cartographer.handler.server.ts` → exactly one match (line ~141). This confirms the same *anti-pattern* exists there but with no shared code — record the follow-up, do not fix it.
- `grep -n "uniqueIndex('vips_proposed_diffs_pending_per_student')" src/db/schema.ts` → exactly one match.

If the first grep returns anything non-zero, **STOP and report** — the split
would then have to cover Cartographer and this plan's scope is wrong.

### Step 2: Pre-flight duplicate check on any database you will migrate

The new unique index cannot be created if duplicates already exist. Run this
against every database you intend to migrate (local dev, and report for any
shared branch). Requires `DATABASE_URL`.

```sql
select student_id, mirror_entry_id, count(*)
from vips_proposed_diffs
where status <> 'forgotten'
group by student_id, mirror_entry_id
having count(*) > 1;
```

**Verify**: query returns **0 rows**.

If it returns rows: **STOP and report** the exact `(student_id,
mirror_entry_id, count)` tuples. Do not write a dedup migration on your own —
deleting a `confirmed` audit row is a data-loss decision the operator must make
(the duplicated *timeline entries* those rows created also need reconciling,
which is beyond this plan).

If `DATABASE_URL` is unavailable, say so explicitly in your report and note
that the migration is unverified against real data.

### Step 3: Add the `'running'` status and the backstop unique index

In `src/db/schema.ts`, in the `vipsProposedDiffs` table config:

1. Widen the CHECK to admit `'running'`:
   ```ts
    check(
      'vips_proposed_diffs_status_check',
      sql.raw("status IN ('pending','running','confirmed','forgotten')"),
    ),
   ```
2. Add the new partial unique index next to the existing one, with a comment
   explaining its dual role:
   ```ts
    // Dual-purpose (plan 054): the atomic-claim arbiter for in-flight
    // Connector runs (`status = 'running'`) AND the backstop that makes a
    // second `confirmed` diff for the same reflection impossible. Forgotten
    // rows are excluded so a re-run after a forget is still allowed.
    uniqueIndex('vips_proposed_diffs_live_per_entry')
      .on(t.studentId, t.mirrorEntryId)
      .where(sql`status <> 'forgotten'`),
   ```

In `src/db/queries.ts:908`, widen the status union and keep the transition
helper narrow:

```ts
export type VipsProposedDiffStatus = 'pending' | 'running' | 'confirmed' | 'forgotten'
```

`updateVipsProposedDiffStatus` (`:1615-1618`) is typed
`Exclude<VipsProposedDiffStatus, 'pending'>` — that would now admit
`'running'`, which no caller should ever pass. Narrow it explicitly to
`'confirmed' | 'forgotten'`.

Then generate the migration and **read the generated SQL**. Drizzle-kit does
not always diff `check` constraints cleanly; the file must contain both a
DROP+ADD of `vips_proposed_diffs_status_check` (or an equivalent alter) and the
`CREATE UNIQUE INDEX … WHERE status <> 'forgotten'`. If the CHECK change is
missing, add it by hand to the generated file (generated migration files are
editable; `src/db/schema.ts` stays the source of truth).

**Verify**:
- `pnpm db:generate` → exit 0 and a new `src/db/migrations/*.sql` exists (call it `$MIG`; it is the highest-numbered file in that directory)
- `grep -c "vips_proposed_diffs_live_per_entry" "$MIG"` → `1`
- `grep -c "running" "$MIG"` → ≥ `1`
- `pnpm check` → exit 0

### Step 4: Rewrite candidate selection as one bounded SQL query

Replace `listUnconnectedMirrorEntriesInner` (`src/db/queries.ts:516-527`) with a
single statement. Requirements:

- `NOT EXISTS (select 1 from vips_proposed_diffs d where d.student_id = m.student_id and d.mirror_entry_id = m.id and d.status <> 'forgotten')`
  — this is what makes a `'running'` claim exclude the entry from every other
  run.
- Confirmed-only, expressed in SQL from the review tags: an `EXISTS` for
  `system:mirror-confirmed` and a `NOT EXISTS` for `system:mirror-forgotten`,
  joined through `mirror_entry_tags` → `tags` and scoped by
  `tags.student_id = ctx.studentId`.
- `order by m.created_at desc`
- `limit` pushed into SQL. Keep the current contract: `limit === undefined`
  means no limit.
- Select **only** the columns the caller needs. Callers use `entry.id` and
  `entry.review_status` (`run-connector.handler.server.ts:69-91`). Return
  `id` and `created_at`; do **not** select `raw_output_json`, `transcript`, or
  join tags for the payload.

Because the return type narrows, introduce a dedicated exported type rather
than lying about `MirrorEntryRow`:

```ts
/** Bounded projection for Connector candidate selection (plan 054). */
export interface UnconnectedMirrorEntryRef {
  id: number
  created_at: string
}
```

Change `listUnconnectedMirrorEntries`' return type to
`Promise<UnconnectedMirrorEntryRef[]>`. In
`src/server/run-connector.handler.server.ts`, the
`confirmedCandidates = candidates.filter(... review_status === 'confirmed')`
line at `:69` becomes redundant (SQL now guarantees it) — **keep the variable
name and the slice logic**, but source it directly from `candidates` so
`entriesToProcess`, `remainingFromInitialBatch` and the `limit + 1` probe
behave byte-identically. Update the `RunConnectorDeps.listUnconnectedMirrorEntries`
seam type accordingly.

Write it with `ctx.db.execute<...>(sql\`…\`)` (see
`growth-summary.handler.server.ts:148-151` for the house style of raw SQL
inside a `TenantContext`), or with the Drizzle query builder — either is fine,
but keep it **one** statement and keep it sequential (no `Promise.all`).

**Verify**:
- `pnpm check` → exit 0
- `grep -n 'listMirrorEntriesInner(ctx, undefined, false)' src/db/queries.ts` → no match inside `listUnconnectedMirrorEntriesInner` (it may still appear in `updatePendingMirrorEntriesReviewStatusInner` at `:644` — that is fine and out of scope)
- `pnpm vitest run test/server/run-connector.test.ts` → all pass (this file mocks the seam, so it should be unaffected apart from types; if it asserts on `MirrorEntryRow` fields the mock builder no longer needs, trim the mock — never widen the production type back)
- `pnpm vitest run test/server/pg-transaction-serialization.test.ts` → all pass

### Step 5: Add the claim / release / finalize helpers

In `src/db/queries.ts`, next to the other `vipsProposedDiffs` helpers, add
three functions following the house `opts.ctx ?? withStudent` pattern:

```ts
/**
 * Plan 054: how long a `'running'` claim may live before another run may
 * reap it. Deliberately longer than AUTO_CONNECTOR_TIMEOUT_MS (120 s) so a
 * live run is never reaped out from under itself.
 */
export const CONNECTOR_CLAIM_STALE_MS = 240_000

/**
 * Atomically claim one mirror entry for a Connector run. Inserts a
 * `status = 'running'` row; the partial unique index
 * `vips_proposed_diffs_live_per_entry` makes a second claim (or a claim on an
 * entry that already has a confirmed diff) a no-op. Returns the claim row id
 * on success, `null` when another run owns it.
 *
 * Stale claims (crashed run, function timeout, deploy mid-run) are reaped
 * first so a dead claim cannot block an entry forever.
 */
export async function claimMirrorEntryForConnector(
  studentId: string,
  mirrorEntryId: number,
  opts: { ctx?: TenantContext } = {},
): Promise<number | null>

/** Release a claim (failure / timeout path). Deletes the `'running'` row so
 *  today's semantics are preserved exactly: a failed run leaves NO audit row. */
export async function releaseConnectorClaim(
  studentId: string,
  claimId: number,
  opts: { ctx?: TenantContext } = {},
): Promise<void>

/** Promote a claim to the real audit row: writes payload + verifier_result,
 *  sets status `'confirmed'` and stamps `reviewed_at`. Returns the row in the
 *  same `VipsProposedDiffRow` shape `insertVipsProposedDiff` returned. */
export async function finalizeConnectorClaim(
  studentId: string,
  claimId: number,
  input: { payload: unknown; verifier_result: unknown },
  opts: { ctx?: TenantContext } = {},
): Promise<VipsProposedDiffRow>
```

Implementation notes that are load-bearing:

- The claim insert must use `onConflictDoNothing` with the **index predicate**
  so Postgres picks the right arbiter — copy the shape already proven at
  `src/db/queries.ts:1514-1520`:
  ```ts
    .onConflictDoNothing({
      target: [vipsProposedDiffs.studentId, vipsProposedDiffs.mirrorEntryId],
      where: sql`status <> 'forgotten'`,
    })
    .returning({ id: vipsProposedDiffs.id })
  ```
  A bare insert that raises a unique violation would abort the whole
  transaction (SQLSTATE `25P02`) — the comment at `:1479-1483` explains why
  `onConflictDoNothing` is the only workable primitive here.
- `payloadJson` / `verifierResultJson` are `NOT NULL`. The claim row writes
  the placeholders `'{}'` for both; `finalizeConnectorClaim` overwrites them.
- The stale reap is a `DELETE … where status = 'running' and created_at < now() - interval`
  scoped by `student_id`; run it as the statement immediately before the insert,
  in the same transaction.
- `finalizeConnectorClaim` reuses `getVipsProposedDiffInner` for its return
  value (same as `insertVipsProposedDiffInner` at `:1461-1463`) and throws if
  the row is missing.

**Verify**: `pnpm check` → exit 0.

### Step 6: Split `runAutoConnectorAfterMirror` into tx #1 → agent → tx #2

Restructure `src/server/auto-connector.handler.server.ts` so that **no**
`withStudent` callback is open while an LLM call or an HTTP call is in flight.
Target shape (names are load-bearing for Step 7's tests):

```
runAutoConnectorAfterMirror(studentId, mirrorEntryId, deps):

  // ── tx #1: claim + read every input the agent and verifier need ──
  const prep = await withStudent(studentId, async (ctx) => {
    const mirror = await getMirrorEntry(studentId, mirrorEntryId, { ctx })
    if (!mirror) return null                       // → status 'missing_mirror'
    const claimId = await claimMirrorEntryForConnector(studentId, mirror.id, { ctx })
    if (claimId === null) return 'claimed_elsewhere'   // → see below
    const pages = await listVipsPages(studentId, { ctx })
    const timeline = [...]                          // same VIPS_DIMENSIONS loop, sequential
    // Prompt is built INSIDE the tx because buildConnectorContext requires a
    // TenantContext. Nothing after this line touches ctx.
    const prompt = deps.runConnector ? null : await buildConnectorContext(ctx, mirror.id)
    return { claimId, mirror, mirrorProjection, pages, timeline, prompt }
  })

  // ── outside any transaction ──
  //   • getOrCreateMemoryStoreId  (HTTP + its own tx)
  //   • runManagedAgent / deps.runConnector, raced against
  //     raceWithTimeout(..., AUTO_CONNECTOR_TIMEOUT_MS, ac)
  //   • ConnectorDiffSchema.safeParse
  //   • runSelfCritiqueReviewBestEffort   (second LLM call — must NOT be in a tx)
  //   • flattenDiff + verifyProposedDiff  (pure)
  //   • appendStudentMemory rejected-diff append (HTTP)
  //   Every failure/early-return path in this section MUST
  //   `await releaseConnectorClaim(studentId, prep.claimId)` before returning.

  // ── tx #2: apply + finalize ──
  const auditRow = await withStudent(studentId, async (ctx) => {
    await applyVerifiedConnectorDiff(studentId, draft, verifierResult, ctx)
    return finalizeConnectorClaim(studentId, prep.claimId, { payload, verifier_result: verifierResult }, { ctx })
  })
  return { status: 'ok', staged_diff: auditRow }
```

Rules:

- **`runConnectorViaManaged` splits in two.** The prompt build moves into tx #1;
  what remains outside is the memory-store resolve + `runManagedAgent` call.
  Keep the `AbortController` and pass `signal` exactly as today (`:602`). After
  the split, an abort can no longer touch a released `tx` — that is the point.
- **`claimed_elsewhere`**: do NOT add a new `AutoConnectorStatus` value. Return
  the existing `{ status: 'queued', staged_diff: null }` — the enum documents
  `queued` as "another run owns this" and `run-connector.handler.server.ts`'s
  `aggregateStatus` (`:172-183`) already maps `queued` to `partial`. Add a
  one-line comment saying plan 054 revived `queued` for exactly this case.
- **Every** early return between the claim and tx #2 releases the claim:
  timeout, `mapConnectorErrorToStatus`, `schema_reject`. A `try { … } catch`
  or `finally` around the middle section is the cleanest way; make sure the
  release itself never throws out of the handler (wrap it and `console.warn` on
  failure — the stale reap in Step 5 is the backstop).
- Keep `AUTO_CONNECTOR_TIMEOUT_MS`, `raceWithTimeout`, `flattenDiff`,
  `toVerifierExisting`, `summarizeRejection`, `mapConnectorErrorToStatus`,
  `applyVerifiedConnectorDiff` and `checkCompiledTruthForDimension` exactly as
  they are. This step **moves** code; it does not rewrite the verifier or the
  payload.
- The `payload` object literal (`:291-297`) is unchanged, including
  `eval_review: evalReview`.
- **Accepted semantic difference to record in the PR description**: the audit
  row's `created_at` is now the claim time (before the agent call) rather than
  after it — up to 120 s earlier. Nothing reads `created_at` for correctness;
  `load-pipeline-trace` and the review surface only display it.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'withStudent(' src/server/auto-connector.handler.server.ts` → `2`
- No agent or HTTP call inside a transaction:
  `grep -n 'raceWithTimeout\|runManagedAgent\|appendStudentMemory\|getOrCreateMemoryStoreId\|runSelfCritiqueReviewBestEffort' src/server/auto-connector.handler.server.ts`
  → every hit must sit **outside** both `withStudent` callbacks; confirm by reading
- `pnpm vitest run test/server/pg-transaction-serialization.test.ts` → all pass

### Step 7: Write the tests

Create `test/server/connector-claim.test.ts` (`// @vitest-environment node`;
model the mocking style on `test/server/run-connector.test.ts`, which uses
`vi.fn` dependency injection and never touches a database). Cover:

1. **The LIMIT reaches SQL.** Spy on `ctx.db.execute` (or the Drizzle builder)
   with a fake `TenantContext` and assert the emitted statement carries the
   caller's limit — e.g. call `listUnconnectedMirrorEntries('demo', { limit: 3, ctx: fakeCtx })`
   and assert the captured SQL string matches `/limit/i` and that the bound
   parameters include `3`. Also assert the statement contains `not exists` and
   does **not** contain `raw_output_json`.
2. **Claim is exclusive (unit level).** With a fake ctx whose insert returns
   `[]` (conflict), `claimMirrorEntryForConnector` returns `null`; when it
   returns `[{ id: 7 }]`, it returns `7`.
3. **Timeout releases the claim.** Call `runAutoConnectorAfterMirror` with
   `deps.runConnector` returning a promise that never resolves, and fake
   timers advanced past `AUTO_CONNECTOR_TIMEOUT_MS`. Assert the result is
   `{ status: 'timeout' }` **and** that the release path ran. Mock
   `~/db/queries` with `vi.mock` so `claimMirrorEntryForConnector` /
   `releaseConnectorClaim` are spies and `withStudent` is mocked (via
   `vi.mock('~/db/client')`) to invoke its callback with a stub ctx — the same
   technique `test/server/run-connector.test.ts` uses for the handler seams.
4. **`schema_reject` releases the claim.** `deps.runConnector` resolves with
   `{ nope: true }`; assert `status === 'schema_reject'` and the release spy
   fired.
5. **Happy path finalizes rather than inserting.** `deps.runConnector` +
   `deps.verify` stubs; assert `finalizeConnectorClaim` was called with the
   claim id and that `insertVipsProposedDiff` was **not** called.

Create `test/db/connector-claim-concurrency.test.ts` — the real concurrency
proof, gated exactly like the existing DB suites
(`describe.skipIf(!process.env.DATABASE_URL)`; model on
`test/db/rls-concurrency.test.ts`, which already drives two real `withStudent`
envelopes in parallel). Cover:

6. **Two overlapping runs over the same entries produce one diff set.** Seed a
   student with N confirmed mirror entries, then
   `await Promise.all([runConnectorForStudent(s), runConnectorForStudent(s)])`
   with a `deps.autoConnector.runConnector` stub that (a) sleeps ~50 ms so the
   runs genuinely overlap and (b) counts its invocations. Assert:
   `select count(*) from vips_proposed_diffs where status = 'confirmed'` equals
   N (not 2N), the stub was invoked exactly N times, and
   `select count(*) from vips_timeline_entries` equals the single-run count.
7. **No `'running'` rows survive.** After both runs settle,
   `select count(*) from vips_proposed_diffs where status = 'running'` → 0.

**Verify**:
- `pnpm vitest run test/server/connector-claim.test.ts` → all pass
- With `DATABASE_URL` set: `pnpm db:migrate && pnpm demo:reset && pnpm vitest run test/db/connector-claim-concurrency.test.ts` → all pass
- Without `DATABASE_URL`: the concurrency file **skips**. Say so explicitly in
  your report — the mocked tests are then the only net and the concurrency
  claim is unverified against a real Postgres.

### Step 8: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0 (18 pre-existing warnings
OK); tests ≥911 passed + your new tests, 0 failed. The 128 pre-existing skips
(plus your new `DATABASE_URL`-gated file when unset) are expected.

## Test plan

- New `test/server/connector-claim.test.ts` — 5 mocked cases: LIMIT-in-SQL,
  claim conflict → `null`, timeout → claim released, `schema_reject` → claim
  released, happy path → finalize (not insert).
- New `test/db/connector-claim-concurrency.test.ts` — 2 real-Postgres cases:
  overlapping runs produce one diff set + one timeline-entry set; no `'running'`
  rows left behind. Pattern exemplar: `test/db/rls-concurrency.test.ts`.
- Existing `test/server/run-connector.test.ts` must keep passing (it mocks
  `listUnconnectedMirrorEntries`; adjust only its fixture builder if the
  narrowed return type makes fields unnecessary).
- Existing `test/server/pg-transaction-serialization.test.ts` must keep passing.
- `test/server/auto-connector.test.ts` and `test/db.test.ts` are **dead**
  (`@ts-nocheck`, import the removed `openInMemoryDb`) — do not repair them here.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed + new tests, 0 failed
- [ ] `grep -c 'withStudent(' src/server/auto-connector.handler.server.ts` → `2`
- [ ] `grep -rc 'vips_proposed_diffs_live_per_entry' src/db/schema.ts` → ≥1, and the same string appears in the migration you generated
- [ ] `grep -n "status IN ('pending','running','confirmed','forgotten')" src/db/schema.ts` → 1 match
- [ ] `grep -n 'listMirrorEntriesInner(ctx, undefined, false)' src/db/queries.ts` → no match inside `listUnconnectedMirrorEntriesInner`
- [ ] `grep -n 'insertVipsProposedDiff(' src/server/auto-connector.handler.server.ts` → no match (replaced by `finalizeConnectorClaim`)
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 2's duplicate query returns any rows. Deleting a `confirmed` audit row —
  and reconciling the duplicated `vips_timeline_entries` it created — is an
  operator decision, not yours.
- Step 1's Cartographer grep is non-zero: a shared helper means the split has
  to cover `run-cartographer.handler.server.ts` too, and this plan's scope is
  wrong.
- `pnpm db:generate` produces a migration that drops or recreates
  `vips_proposed_diffs` (rather than altering it), or that touches any table
  other than `vips_proposed_diffs`.
- The `onConflictDoNothing` claim insert raises a unique-violation error at
  runtime instead of returning `[]` — that means Postgres did not infer the
  partial index as arbiter, and the `where` predicate needs to match the index
  predicate exactly. Report the exact SQLSTATE and the emitted SQL after two
  fix attempts.
- The concurrency test shows **fewer** diffs than entries (i.e. the claim is
  too aggressive and entries are being silently skipped) — that is worse than
  the bug being fixed. Report the counts.
- You find a caller of `listUnconnectedMirrorEntries` outside
  `src/server/run-connector.handler.server.ts` that reads a field the narrowed
  projection no longer returns.
- Widening `VipsProposedDiffStatus` produces `tsc` errors in a **user-facing**
  surface that cannot simply ignore `'running'` (expected: none — there is no
  exhaustive switch on this union today).

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer must scrutinise**: (1) that *no* `await` on an LLM or HTTP
  call sits inside either `withStudent` callback — read the whole handler, do
  not trust the grep; (2) that every early-return path between the claim and
  tx #2 releases the claim (walk each `return` statement); (3) that the
  `payload` object literal is byte-identical to the pre-change version, since
  the review surface parses it; (4) that the new SQL's confirmed-only predicate
  matches `rowToMirrorEntry`'s tag logic exactly — an inverted `NOT EXISTS`
  would silently start feeding *forgotten* reflections to the Connector.
- **Follow-up recorded, deliberately not done here**:
  `src/server/run-cartographer.handler.server.ts` holds a `withStudent`
  transaction across a **780 s** managed-agent call (`:141`, `:414`) — a worse
  version of the same pool-starvation defect, with no shared code. It needs its
  own plan (same tx #1 / agent / tx #2 shape; it has no claim problem because
  it is user-triggered and writes to `cartographer_outputs`).
- **Follow-up recorded**: `buildConnectorContext` re-fetches the mirror entry,
  the VIPS pages, and the timeline that tx #1 already read. Threading the
  already-loaded values in would remove ~6 queries per run.
- **Interaction warning**: if a future change makes the Connector emit
  `'pending'` diffs again (user-confirmed review flow), the
  `vips_proposed_diffs_live_per_entry` index will make a `'pending'` row and a
  later `'confirmed'` row for the same entry mutually exclusive. That is
  correct for one-diff-per-reflection, but revisit the predicate if the product
  ever wants a diff history per reflection.
- **Interaction warning**: `plans/055-bound-loadwiki-payload.md` and
  `plans/058-batch-tag-upserts.md` also edit `src/db/queries.ts`. Land 054
  before both.
- `CONNECTOR_CLAIM_STALE_MS` is coupled to `AUTO_CONNECTOR_TIMEOUT_MS`. If the
  soft budget grows, the stale window must grow with it or live runs will be
  reaped mid-flight.
