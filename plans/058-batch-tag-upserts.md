# Plan 058: Batch capture tag writes into two statements

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/db/queries.ts src/db/schema.ts test/db/ test/server/persist-mirror.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW–MED (writes on the user-visible capture path; the duplicate-label trap below is the one way to break it)
- **Depends on**: `plans/047-capture-retry-idempotency.md` (it edits
  `insertMirrorEntryInner` and `InsertMirrorEntryInput` directly and records
  this same conflict) and `plans/054-connector-claim-and-tx-split.md` (also
  edits `src/db/queries.ts`). Land this **after both**.
- **Category**: perf
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Inserting a mirror entry writes its tags one at a time, sequentially, inside the
user-visible capture latency budget: for each label, a `SELECT` to look the tag
up, a conditional `INSERT` when it is new, and then an `INSERT` into the join
table. That is 2 statements per existing tag and 3 per new one — a five-tag
reflection costs **10–15 serial round-trips on one pooled connection** while the
student waits for their capture to be confirmed. Against a pooled Postgres
endpoint, round-trip latency dominates and these add up linearly.

Postgres already has the index needed to do it in two statements. This is a
small, contained change with a large constant-factor payoff on the one path
every student hits every time they speak.

## Current state

Files and their roles:

- `src/db/queries.ts` — `insertMirrorEntryInner` (the per-tag loop),
  `upsertTagInner` (the select-then-insert), `loadTagsInner` /
  `loadTagsForEntriesInner` (readers), `updateMirrorEntryReviewStatusInner`
  (the other `upsertTagInner` caller).
- `src/db/schema.ts` — the `tags` and `mirror_entry_tags` tables.

### The loop (`src/db/queries.ts:437-442`)

```ts
  const id = requireRow(inserted, 'insert').id

  for (const label of input.tags ?? []) {
    const tagId = await upsertTagInner(ctx, studentId, label)
    await ctx.db.insert(mirrorEntryTags).values({ entryId: id, tagId }).onConflictDoNothing()
  }
```

### The per-label upsert (`src/db/queries.ts:322-337`)

```ts
async function upsertTagInner(
  ctx: TenantContext,
  studentId: string,
  label: string,
): Promise<number> {
  // RLS scopes by student already, but the unique index is on
  // (student_id, label) so we must still pass student_id on the insert.
  const existing = await ctx.db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.studentId, studentId), eq(tags.label, label)))
    .limit(1)
  if (existing.length > 0) return requireRow(existing, 'select tag id').id
  const inserted = await ctx.db.insert(tags).values({ studentId, label }).returning({ id: tags.id })
  return requireRow(inserted, 'insert tags').id
}
```

### The index that makes the batch possible (`src/db/schema.ts:105-135`)

```ts
export const tags = pgTable(
  'tags',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    label: text('label').notNull(),
  },
  (t) => [
    uniqueIndex('tags_student_label_uq').on(t.studentId, t.label),
    pgPolicy('tags_rls', { ... }),
  ],
).enableRLS()

export const mirrorEntryTags = pgTable(
  'mirror_entry_tags',
  {
    entryId: bigint('entry_id', { mode: 'number' }).notNull().references(() => mirrorEntries.id, { onDelete: 'cascade' }),
    tagId: bigint('tag_id', { mode: 'number' }).notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] })],
)
```

`tags_student_label_uq` is confirmed present in the applied migration:
`src/db/migrations/0000_illegal_sunset_bain.sql:187`
(`CREATE UNIQUE INDEX "tags_student_label_uq" ON "tags" USING btree ("student_id","label");`).
`mirror_entry_tags` has a composite primary key, which is what makes
`onConflictDoNothing()` on the join insert correct today and after the change.

### Label semantics that must be preserved **exactly**

- **No normalization happens anywhere.** `insertMirrorEntryInner` iterates
  `input.tags ?? []` verbatim: no trim, no lowercase, no dedupe. Labels are
  stored byte-for-byte as supplied. Do not add normalization in this plan.
- The only production caller supplies at most one label:
  `src/server/persist-mirror.handler.server.ts:83`
  `tags: taggedMood ? [mirrorMoodTag(taggedMood)] : undefined`, where
  `mirrorMoodTag` is `` `mood:${mood}` `` (`src/server/mood-tags.ts:4-7`).
  Tests and `src/db/seed.ts` supply richer sets, and the field is public API.
- Tag **read order** is `ORDER BY label` in both readers (`loadTagsInner:289`,
  `loadTagsForEntriesInner:313`), so insertion order does not affect any
  observable output.
- `review_status` is derived from two reserved labels —
  `system:mirror-confirmed` / `system:mirror-forgotten` (`:131-133`) — written
  through the *other* `upsertTagInner` caller, not through this loop.

### The other `upsertTagInner` caller

`src/db/queries.ts:615-626`:

```ts
async function updateMirrorEntryReviewStatusInner(
  ctx: TenantContext,
  studentId: string,
  id: number,
  status: Exclude<MirrorReviewStatus, 'pending'>,
): Promise<MirrorEntryRow | null> {
  await clearMirrorReviewTagsInner(ctx, id)
  const label = status === 'confirmed' ? MIRROR_CONFIRMED_TAG : MIRROR_FORGOTTEN_TAG
  const tagId = await upsertTagInner(ctx, studentId, label)
  await ctx.db.insert(mirrorEntryTags).values({ entryId: id, tagId }).onConflictDoNothing()
  return getMirrorEntryInner(ctx, id)
}
```

`grep -rn 'upsertTagInner' src/` → exactly three hits: the definition (`:322`),
the loop (`:440`), and this call (`:623`). Nothing outside `src/db/queries.ts`.

### ⚠️ The one trap: duplicate labels in a single `VALUES` list

`INSERT … ON CONFLICT … DO UPDATE` **errors** with
`ON CONFLICT DO UPDATE command cannot affect row a second time` if the same
conflict target appears twice in one statement. Today's loop tolerates duplicate
labels (the second iteration just finds the row the first created). Your batched
statement must **dedupe the label list first**, preserving first-occurrence
order. Deduping is behaviour-preserving: with the composite primary key on
`mirror_entry_tags`, a repeated label is already a no-op today.

### Dead tests — do not rely on them

`test/db.test.ts:47-61` covers this exact behaviour
(`insertMirrorEntry … tags: ['physics', 'sec-4']` then asserting
`hits[0]?.tags`), but the whole file is `describe.skipIf(!process.env.DATABASE_URL)`
**and** imports `openInMemoryDb` from `~/db/client`, **which no longer exists**.
It cannot pass even with a database. `test/server/persist-mirror.test.ts` mocks
`insertMirrorEntry` entirely, so it does not exercise tag writes either. You are
adding the first live coverage.

### Repo conventions

- pnpm only. `pnpm check` = Biome + `tsc --noEmit`.
- Tenancy: every DB read/write goes through the `withStudent` envelope;
  `*Inner` helpers take an open `TenantContext` and RLS scopes the tenant, but
  the file still passes explicit `student_id` predicates on purpose — see the
  header comment at `src/db/queries.ts:278-281`. Keep doing that.
- Sequential awaits inside a transaction; **no `Promise.all`** on one
  transaction client (`test/server/pg-transaction-serialization.test.ts` guards
  `src/db/queries.ts` specifically, at `:34-36`).
- Conventional commits. Baseline: `pnpm check` exit 0 with 18 pre-existing lint
  warnings; `pnpm test` = 911 passed / 128 skipped / 0 failed.

## Commands you will need

| Purpose         | Command                                              | Expected on success                     |
|-----------------|------------------------------------------------------|-----------------------------------------|
| Install         | `pnpm install`                                       | exit 0                                  |
| Check           | `pnpm check`                                         | exit 0 (18 pre-existing warnings OK)    |
| All tests       | `pnpm test`                                          | ≥911 passed, 0 failed                   |
| Mocked test     | `pnpm vitest run test/db/tag-batch.test.ts`          | new tests pass                          |
| Integration     | `pnpm vitest run test/db/tag-batch-integration.test.ts` | passes, or skips without `DATABASE_URL` |
| Seed a local DB | `pnpm demo:reset`                                    | exit 0 (needs `DATABASE_URL`)           |

## Scope

**In scope** (the only files you should modify/create):

- `src/db/queries.ts` — the new batched helper, the loop replacement, and
  `upsertTagInner` delegating to it
- `test/db/tag-batch.test.ts` (create) — mocked statement-count + tag-set test
- `test/db/tag-batch-integration.test.ts` (create) — `DATABASE_URL`-gated round-trip

**Out of scope** (do NOT touch, even though they look related):

- `src/db/schema.ts` — the required unique index already exists. No migration.
- Any label normalization (trim / lowercase / prefix validation). Adding it
  would silently change stored data and break the `mood:` / `system:` prefix
  readers.
- `src/db/seed.ts:420-433` — it carries a **third** copy of the select-then-insert
  tag upsert, deliberately using the pool-level `db` rather than a
  `TenantContext`. Record it as a DRY follow-up; do not migrate it here.
- `clearMirrorReviewTagsInner` (`:652-664`) — it deletes rather than upserts, and
  its own loop is over a 2-element constant.
- `loadTagsInner` / `loadTagsForEntriesInner` — readers, already batched.
- `test/db.test.ts` — dead (see above). Do not attempt to revive it.

## Git workflow

- Branch: `advisor/058-batch-tag-upserts`
- Commit per step. Conventional commits, e.g.
  `perf(db): batch capture tag upserts into two statements`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the state and the caller inventory

Read `src/db/queries.ts:283-342` and `:411-461`, plus `src/db/schema.ts:105-135`,
and confirm the excerpts.

**Verify**:
- `grep -c 'upsertTagInner' src/db/queries.ts` → `3`
- `grep -rn 'upsertTagInner' src/ test/ scripts/` → no hits outside `src/db/queries.ts`
- `grep -n "uniqueIndex('tags_student_label_uq')" src/db/schema.ts` → 1 match
- `grep -n 'tags_student_label_uq' src/db/migrations/0000_illegal_sunset_bain.sql` → 1 match

If `upsertTagInner` has a caller outside `src/db/queries.ts`, **STOP and report**.

### Step 2: Add the batched helper

In `src/db/queries.ts`, next to `upsertTagInner`, add:

```ts
/**
 * Batched sibling of `upsertTagInner`: resolve every label to a tag id in ONE
 * statement. The per-label version cost 2 statements when the tag existed and
 * 3 when it did not, so a five-tag reflection spent 10–15 serial round-trips
 * on one pooled connection inside the user-visible capture latency budget.
 *
 * `DO UPDATE SET label = EXCLUDED.label` (rather than `DO NOTHING`) is
 * deliberate: `DO NOTHING` suppresses `RETURNING` for rows that already
 * existed, so we would not learn their ids. The update is a no-op write.
 *
 * Labels MUST be deduped before they reach the VALUES list — Postgres raises
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" when one
 * statement targets the same conflict key twice. Deduping is
 * behaviour-preserving: `mirror_entry_tags`' composite primary key already
 * made a repeated label a no-op.
 *
 * No normalization: labels are stored byte-for-byte as supplied, matching the
 * previous loop exactly. The `mood:` and `system:` prefix readers depend on it.
 */
async function upsertTagsInner(
  ctx: TenantContext,
  studentId: string,
  labels: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(labels)] // first-occurrence order preserved
  if (unique.length === 0) return new Map()
  const rows = await ctx.db
    .insert(tags)
    .values(unique.map((label) => ({ studentId, label })))
    .onConflictDoUpdate({
      target: [tags.studentId, tags.label],
      set: { label: sql`excluded.label` },
    })
    .returning({ id: tags.id, label: tags.label })
  const byLabel = new Map<string, number>()
  for (const row of rows as Array<{ id: number; label: string }>) byLabel.set(row.label, row.id)
  if (byLabel.size !== unique.length) {
    throw new Error(
      `upsertTagsInner: expected ${unique.length} tag ids, got ${byLabel.size}`,
    )
  }
  return byLabel
}
```

Then make `upsertTagInner` delegate, so there is exactly one implementation of
the upsert (this also drops the review-status path from 2–3 statements to 1):

```ts
async function upsertTagInner(
  ctx: TenantContext,
  studentId: string,
  label: string,
): Promise<number> {
  const byLabel = await upsertTagsInner(ctx, studentId, [label])
  const id = byLabel.get(label)
  if (id === undefined) throw new Error('upsertTagInner: upsert returned no id')
  return id
}
```

`sql` and `eq`/`and` are already imported in this file; no new imports beyond
what you use.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'from(tags)' src/db/queries.ts` — should **decrease by one** versus
  before the change (the `SELECT` inside `upsertTagInner` is gone); record the
  before/after numbers in your report

### Step 3: Replace the loop with two statements

In `insertMirrorEntryInner`, replace `:439-442` with:

```ts
  const labels = input.tags ?? []
  if (labels.length > 0) {
    const tagIdsByLabel = await upsertTagsInner(ctx, studentId, labels)
    await ctx.db
      .insert(mirrorEntryTags)
      .values([...tagIdsByLabel.values()].map((tagId) => ({ entryId: id, tagId })))
      .onConflictDoNothing()
  }
```

Two statements regardless of tag count, with an explicit empty-tags
short-circuit (an empty `VALUES` list is a SQL syntax error, so the guard is
required, not cosmetic). Keep it sequential — do not wrap in `Promise.all`.

Everything after the loop (`:444-460`: the optional `agentTraces` insert, the
re-select, `rowToMirrorEntry(row, await loadTagsInner(ctx, id))`) stays
untouched.

**Verify**:
- `pnpm check` → exit 0
- `grep -n 'for (const label of input.tags' src/db/queries.ts` → no match
- `grep -c 'upsertTagsInner' src/db/queries.ts` → `3` (definition + two callers)
- `pnpm vitest run test/server/pg-transaction-serialization.test.ts` → all pass

### Step 4: Mocked test — tag set and statement count

Create `test/db/tag-batch.test.ts` (`// @vitest-environment node`). Build a
chainable `ctx.db` double so no database is needed. The double must record every
statement so the count is assertable. Concretely:

```ts
function makeDbDouble() {
  const calls: Array<{ op: string; table: string; values?: unknown }> = []
  const chain = (op: string, table: string, values?: unknown) => {
    calls.push({ op, table, values })
    const self: Record<string, unknown> = {}
    // Every builder method returns the same chainable object; the terminal
    // `returning` / awaited value resolves to the canned rows.
    for (const m of ['values', 'onConflictDoUpdate', 'onConflictDoNothing', 'where', 'limit', 'orderBy', 'from', 'set']) {
      self[m] = (arg?: unknown) => { if (m === 'values') calls[calls.length - 1].values = arg; return self }
    }
    self.returning = () => Promise.resolve(cannedRowsFor(op, table, calls[calls.length - 1].values))
    self.then = (res: (v: unknown) => unknown) => Promise.resolve(cannedRowsFor(op, table, calls[calls.length - 1].values)).then(res)
    return self
  }
  return { calls, db: { insert: (t: unknown) => chain('insert', nameOf(t)), select: () => chain('select', ''), update: () => chain('update', ''), execute: () => Promise.resolve({ rows: [] }) } }
}
```

Adapt the shape to whatever `insertMirrorEntryInner` actually chains — read the
function and make the double satisfy exactly those calls. If Drizzle's builder
turns out to be too awkward to double after two attempts, drop to a narrower
target: export `upsertTagsInner` for tests and unit-test **it** alone with the
double, then rely on Step 5's integration test for `insertMirrorEntry`. Say
which you did in your report.

Cases to cover:

1. **Statement count.** Insert an entry with 5 distinct labels; assert exactly
   **two** tag-related statements were recorded (one `insert` into `tags`, one
   `insert` into `mirror_entry_tags`). Assert it is still two with 1 label and
   with 12 labels.
2. **Empty tags short-circuit.** With `tags: undefined` and with `tags: []`,
   assert **zero** tag-related statements were recorded.
3. **Duplicate labels are deduped.** With `tags: ['a', 'b', 'a']`, assert the
   `tags` insert's `VALUES` list has **2** rows (this is the trap guard — a
   3-row list would raise the `ON CONFLICT DO UPDATE` error against real
   Postgres) and the join insert has 2 rows.
4. **No normalization.** With `tags: ['  Mood:Joy  ']`, assert the recorded
   `VALUES` row's `label` is that exact string, untrimmed and unchanged.
5. **`upsertTagInner` still returns the single id** (the review-status path).

**Verify**: `pnpm vitest run test/db/tag-batch.test.ts` → all cases pass.

### Step 5: Integration test — the tag set actually round-trips

Create `test/db/tag-batch-integration.test.ts`, gated
`describe.skipIf(!process.env.DATABASE_URL)` and modelled on
`test/db/rls-concurrency.test.ts` (which drives real `withStudent` envelopes).
Cases:

1. `insertMirrorEntry(student, { …, tags: ['physics', 'sec-4'] })` then
   `listMirrorEntries(student, { limit: 1 })` → `entry.tags` equals
   `['physics', 'sec-4']` (sorted by label, per the readers).
2. A second entry reusing one existing label plus one new label → both entries
   resolve their full tag sets, and
   `select count(*) from tags where student_id = $1` shows **3** rows (no
   duplicate `tags` row was created).
3. `tags: ['a', 'b', 'a']` → the entry's tags are `['a', 'b']` and **no error**
   is raised (the real ON CONFLICT trap, proven against real Postgres).
4. `updateMirrorEntryReviewStatus(student, id, 'confirmed')` then
   `'forgotten'` → `review_status` transitions correctly (proves the
   `upsertTagInner` delegation did not break the reserved-label path).

**Verify**:
- With `DATABASE_URL`: `pnpm db:migrate && pnpm vitest run test/db/tag-batch-integration.test.ts` → all pass
- Without `DATABASE_URL`: the file **skips**. State this explicitly in your
  report — the mocked test from Step 4 is then the only net, and case 3's real
  ON CONFLICT behaviour is unverified.

### Step 6: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0 (18 pre-existing warnings
OK); tests ≥911 passed + your new tests, 0 failed.

## Test plan

- New `test/db/tag-batch.test.ts` (no DB): statement count is 2 for 1/5/12
  labels, 0 for empty, duplicate labels deduped to a 2-row `VALUES` list, labels
  stored verbatim, `upsertTagInner` still returns one id.
- New `test/db/tag-batch-integration.test.ts` (DB-gated): tag set round-trips,
  no duplicate `tags` rows across entries, duplicate labels raise no error,
  review-status transitions still work.
- Existing `test/server/persist-mirror.test.ts` (mocks `insertMirrorEntry`) and
  `test/server/pg-transaction-serialization.test.ts` must stay green.
- `test/db.test.ts` is dead (`@ts-nocheck`, imports the removed
  `openInMemoryDb`) — out of scope.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'for (const label of input.tags' src/db/queries.ts` → no match
- [ ] `grep -c 'upsertTagsInner' src/db/queries.ts` → `3`
- [ ] `grep -n 'onConflictDoUpdate' src/db/queries.ts` → ≥1 match on the `tags` insert
- [ ] `grep -rn 'Promise.all' src/db/queries.ts` → no new matches versus baseline
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed + new tests
- [ ] `pnpm vitest run test/db/tag-batch.test.ts` passes
- [ ] Whether the integration test ran or skipped is stated in the report
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds an `upsertTagInner` caller outside `src/db/queries.ts`.
- The integration test raises
  `ON CONFLICT DO UPDATE command cannot affect row a second time` — the dedupe
  is missing or ineffective. Report the exact label list that triggered it.
- `onConflictDoUpdate({ target: [tags.studentId, tags.label], … })` does not
  compile or Postgres cannot infer `tags_student_label_uq` as the arbiter after
  two fix attempts. Report the emitted SQL and the SQLSTATE. (Do **not** fall
  back to `DO NOTHING` — it suppresses `RETURNING` for pre-existing rows, which
  silently drops those tags from the join insert.)
- Any test shows a tag label stored with different bytes than supplied
  (trimmed, lowercased, prefixed) — normalization is out of scope and a
  behaviour change.
- Delegating `upsertTagInner` to the batched helper changes `review_status`
  behaviour in any way.
- Doubling Drizzle's builder in Step 4 proves intractable after two attempts
  *and* no `DATABASE_URL` is available — then this change ships with no
  verification, which is not acceptable; report and stop.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer must scrutinise**: (1) the `[...new Set(labels)]` dedupe —
  removing it looks harmless and is a production error waiting for the first
  multi-tag reflection with a repeat; (2) `DO UPDATE SET label = EXCLUDED.label`
  rather than `DO NOTHING`, and the comment explaining why (a future "simplify"
  pass will want to change it); (3) the empty-tags guard, since an empty
  `VALUES` list is a syntax error, not an empty write; (4) that no normalization
  crept in.
- **Follow-up recorded, deliberately not done here**: `src/db/seed.ts:420-433`
  (`attachMirrorTag`) is a **third** copy of the select-then-insert tag upsert,
  using the pool-level `db` instead of a `TenantContext`. Folding it onto
  `upsertTagsInner` would need the helper to accept either handle — a small
  refactor with its own review surface.
- **Follow-up already owned elsewhere**: `test/db.test.ts` is dead code
  (`@ts-nocheck`, imports the removed `openInMemoryDb`) yet holds the only
  written coverage for several `queries.ts` behaviours, which makes the suite
  look better covered than it is. That is
  `plans/059-revive-dark-db-tests.md`'s job — if 059 lands first, extend its
  revived `insertMirrorEntry` coverage instead of creating
  `test/db/tag-batch-integration.test.ts`, and say so in your report.
- **Interaction warning**: if tag labels ever gain normalization, it must land
  in **one** place (this helper) and be paired with a data migration — the
  `mood:` and `system:mirror-*` prefix readers (`src/server/mood-tags.ts:9-16`,
  `src/db/queries.ts:210-234`) match on exact prefixes.
- **Interaction warning**: `plans/054` and `plans/055` also edit
  `src/db/queries.ts`. Land order: 047 → 054 → 055 → 058.
