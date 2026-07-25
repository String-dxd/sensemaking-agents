# Plan 056: Collapse the Growth tab's 15 serial statements into 6, and verify the index gap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/server/growth-summary.handler.server.ts src/server/year-entries.handler.server.ts src/db/schema.ts src/db/migrations/ test/server/growth-summary.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (the result shape drives student-facing stat tiles and narrative copy; output must be byte-identical)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Opening History → Growth costs **15 serial database round-trips** before the
first stat tile renders: 8 in `growth-summary` and 7 in `year-entries`. They all
run inside a single `withStudent` transaction, so they serialise on one pooled
connection and their latencies **add** — against a pooled Postgres endpoint
(Neon/PgBouncer) that is roughly 15 × RTT of pure network wait per year the
student expands, plus three fully redundant table scans (each list query is
followed by a `count(*)` over the *identical* predicate).

`count(*) FILTER (WHERE …)` and `count(*) OVER ()` collapse this to 6
statements — 2 for the summary, 4 for the drill-down — with no change to the
returned JSON. Separately, the index situation deserves a measurement rather
than a guess: the only btree index on `vips_timeline_entries` is
`(student_id, dimension, committed_at DESC)`, which a range predicate on
`committed_at` **without** an equality on `dimension` can only use up to the
`student_id` prefix, and there is **no index on `forgotten_at` at all** even
though `year-entries` range-scans and orders by it.

## Current state

Files and their roles:

- `src/server/growth-summary.handler.server.ts` — the 8-query summary handler
  behind `/api/growth/summary`; drives the four stat tiles and the narrative
  line in History → Growth.
- `src/server/year-entries.handler.server.ts` — the 7-query drill-down behind
  `/api/growth/year-entries`.
- `src/lib/year-buckets.ts` — `yearRangeSgt(year)` returns
  `{ startIso, endIso }` for the half-open SGT calendar-year range.
- `src/db/migrations/0000_illegal_sunset_bain.sql` — where the existing indexes
  were created.
- `src/components/student-space/sheets/HistorySheet.tsx:559-579` — the only UI
  consumer; it `fetch`es `/api/growth/summary?year=…`. (Note:
  `/api/growth/year-entries` has a route at
  `src/routes/api/growth/year-entries.tsx` but **no** component fetches it
  today — it is a staged drill-down endpoint. Optimise it anyway; do not delete
  it.)

### The 8 serial statements (`growth-summary.handler.server.ts:145-210`)

```ts
  return withStudent(studentId, async (ctx) => {
    const voiceRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from mirror_entries
      where created_at >= ${startIso} and created_at < ${endIso}
    `)
    const priorVoiceRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from mirror_entries
      where created_at >= ${prior.startIso} and created_at < ${prior.endIso}
    `)
```

…then `crystRow`, `priorCrystRow` (`:161-168`), `forgottenRow` (`:175-178`),
the empty-year short-circuit (`:182-184`), `dominantRows` +
`priorDominantRows` (`:187-196`), and finally:

```ts
    const earlierRow = await ctx.db.execute<CountRow>(sql`
      select (
        select count(*) from mirror_entries where created_at < ${startIso}
      ) + (
        select count(*) from vips_timeline_entries where committed_at < ${startIso}
      )::int as count
    `)
    const isFirstYear = readCount(earlierRow.rows[0]) === 0
```

**Note**: none of these carry an explicit `student_id` predicate — they rely
entirely on RLS. Preserve that exactly (see Out of scope).

### The result shape that must not change (`:33-45`)

```ts
export type GrowthSummaryResult =
  | {
      kind: 'ok'
      year: number
      voiceReflections: number
      claimsCrystallised: number
      claimsForgotten: number
      dominantDimension: ProfileDimension | null
      dimensionShift: { from: ProfileDimension; to: ProfileDimension } | null
      narrative: string
      isFirstYear: boolean
    }
  | { kind: 'no_data'; year: number }
```

The discriminator and the prior-period comparison logic are load-bearing.
`pickDominant` (`:64-80`) and `buildNarrative` (`:89-133`) must be reused
**unchanged**:

```ts
function pickDominant(rows: DimensionCountRow[]): ProfileDimension | null {
  if (rows.length === 0) return null
  let topCount = -1
  let topDimension: ProfileDimension | null = null
  let tied = false
  for (const row of rows) {
    const count = typeof row.count === 'string' ? Number.parseInt(row.count, 10) : row.count
    if (count > topCount) {
      topCount = count
      topDimension = row.dimension
      tied = false
    } else if (count === topCount) {
      tied = true
    }
  }
  return tied ? null : topDimension
}
```

> **TRAP — read this twice.** Today `group by dimension` over a *filtered*
> predicate returns **only dimensions that have at least one row**. If you feed
> `pickDominant` per-dimension rows that include zeros, behaviour diverges:
> when the current year has no crystallisations at all but the table has rows
> in exactly one dimension from another year, the old code passes `[]` → `null`,
> while a zero-bearing row set passes `[{ dimension: 'a', count: 0 }]` →
> `0 > -1` → `'a'`. That mislabels the student's "Dominant dimension" tile.
> **You must filter zero counts out before calling `pickDominant`**, for both
> the current and the prior period.

### The 7 serial statements (`year-entries.handler.server.ts:110-152`)

Three list queries each immediately followed by a `count(*)` over the identical
predicate, plus one `GROUP BY`:

```ts
    const reflectionsResult = await ctx.db.execute<ReflectionRow>(sql`
      select id, created_at, context_type, transcript, story_reframe
      from mirror_entries
      where created_at >= ${startIso} and created_at < ${endIso}
      order by created_at desc
      limit ${LIST_CAP}
    `)
    const reflectionsCountRow = await ctx.db.execute<CountRow>(sql`
      select count(*)::int as count from mirror_entries
      where created_at >= ${startIso} and created_at < ${endIso}
    `)
```

…same pairing for `crystallised` (`committed_at` range) and `forgotten`
(`forgotten_at` range), then:

```ts
    const dimensionCountRows = await ctx.db.execute<DimensionCountRow>(sql`
      select dimension, count(*)::int as count from vips_timeline_entries
      where committed_at >= ${startIso} and committed_at < ${endIso}
      group by dimension
    `)
```

`LIST_CAP = 100` (`:68`). Result shape at `:54-66` with
`reflectionsTotal` / `crystallisedTotal` / `forgottenTotal`, the `no_data`
short-circuit at `:157-159`, and `emptyDimensionCounts()` (`:99-101`) seeding
all four dimensions to 0.

### The indexes that exist today

`src/db/migrations/0000_illegal_sunset_bain.sql:184-192`:

```sql
CREATE INDEX "idx_mirror_entries_student" ON "mirror_entries" USING btree ("student_id","created_at" DESC NULLS LAST);
...
CREATE INDEX "idx_vips_timeline_student_dim" ON "vips_timeline_entries" USING btree ("student_id","dimension","committed_at" DESC NULLS LAST);
CREATE INDEX "idx_vips_timeline_verbatim_quote_tsv" ON "vips_timeline_entries" USING gin ("verbatim_quote_tsv");
```

`grep -rn "forgotten_at" src/db/migrations/*.sql` → one hit, the **column
definition** at `0000_illegal_sunset_bain.sql:164`. No index.

`mirror_entries` is fine: `(student_id, created_at DESC)` serves both the range
scan and the ordering. `vips_timeline_entries` is the gap.

### Repo conventions

- pnpm only. `pnpm check` = Biome + `tsc --noEmit`.
- Raw SQL inside a `TenantContext` uses `ctx.db.execute<RowType>(sql\`…\`)` with
  `${}` interpolation for **bound parameters** (Drizzle binds them; this is not
  string concatenation). Match the existing style in these two files.
- Sequential awaits inside one transaction — **never** `Promise.all` on a single
  transaction client. `test/server/pg-transaction-serialization.test.ts` and the
  comment at `src/server/load-pipeline-trace.handler.server.ts:45-48` document
  why.
- Drizzle migrations are generated: `pnpm db:generate`. Head is
  `0003_concerned_robin_chapel`.
- `test/server/growth-summary.test.ts` covers **only** `growthSummaryInputSchema`
  and the narrative branching — it does **not** exercise the SQL. There is no
  existing integration test for these handlers. Baseline: `pnpm check` exit 0
  with 18 pre-existing warnings; `pnpm test` = 911 passed / 128 skipped / 0
  failed; DB-backed suites skip without `DATABASE_URL`.

## Commands you will need

| Purpose         | Command                                                              | Expected on success                  |
|-----------------|----------------------------------------------------------------------|--------------------------------------|
| Install         | `pnpm install`                                                       | exit 0                               |
| Check           | `pnpm check`                                                         | exit 0 (18 pre-existing warnings OK) |
| All tests       | `pnpm test`                                                          | ≥911 passed, 0 failed                |
| One file        | `pnpm vitest run test/server/growth-sql.test.ts`                     | new tests pass                       |
| Parity harness  | `pnpm vitest run test/server/growth-summary-parity.test.ts`           | passes, or skips without `DATABASE_URL` |
| Seed a local DB | `pnpm demo:reset`                                                    | exit 0 (needs `DATABASE_URL`)        |
| Migration       | `pnpm db:generate` then `pnpm db:migrate`                             | exit 0                               |

## Scope

**In scope** (the only files you should modify/create):

- `src/server/growth-summary.handler.server.ts` — 8 statements → 2
- `src/server/year-entries.handler.server.ts` — 7 statements → 4
- `src/db/schema.ts` + the next sequential generated `src/db/migrations/NNNN_*.sql`
  (plans 047 and 054 also generate one — take whatever number drizzle-kit
  assigns after rebasing) — **only if**
  Step 5's `EXPLAIN ANALYZE` justifies it
- `test/server/growth-sql.test.ts` (create) — statement-count + SQL-shape guard
- `test/server/growth-summary-parity.test.ts` (create) — the before/after diff harness

**Out of scope** (do NOT touch, even though they look related):

- `pickDominant`, `buildNarrative`, `readCount`, `DIMENSION_LABEL`,
  `emptyDimensionCounts`, `toId`, `toCount` — reuse verbatim. Rewriting the
  narrative branching is how you silently change a student's year summary.
- `LIST_CAP` (100) and the `no_data` short-circuit conditions.
- Adding explicit `student_id = …` predicates to these queries. They rely on
  RLS today; adding a predicate would change results on an owner-role local
  database (where RLS is bypassed) and the parity harness would flag it. It is a
  latent tenancy smell — record it as a follow-up, do not fix it here.
- `src/lib/year-buckets.ts` and its SGT boundary math.
- `src/components/student-space/sheets/HistorySheet.tsx` — the fetch and the
  stat tiles stay as they are. (`plans/057` memoizes that file; keep out of it.)
- `src/routes/api/growth/*.tsx` — the route wrappers are unchanged.

## Git workflow

- Branch: `advisor/056-growth-tab-sql-consolidation`
- Commit per step. Conventional commits, e.g.
  `perf(growth): collapse the year summary into two aggregate statements`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm state and freeze the oracle

Read both handler files in full and confirm the excerpts. Then create
`test/server/growth-summary-parity.test.ts` and **copy the current 8-query
body verbatim** into a local helper inside that test file:

```ts
// Frozen oracle: the pre-plan-056 implementation, copied verbatim from
// src/server/growth-summary.handler.server.ts at commit 031d1974. It exists
// only to prove the consolidated implementation returns byte-identical
// results. Do not "improve" it — its whole value is that it is the old code.
async function legacyGrowthSummary(ctx: TenantContext, year: number): Promise<GrowthSummaryResult>
```

Do the same for `year-entries`' 7-query body as `legacyYearEntries(ctx, year)`.
Import the real `pickDominant` / `buildNarrative` behaviour by copying those
helpers too if they are not exported (they are module-private today) — the
oracle must be self-contained.

Gate the file `describe.skipIf(!process.env.DATABASE_URL)` and model the
two-envelope real-Postgres style on `test/db/rls-concurrency.test.ts`.

**Verify**: `pnpm check` → exit 0. `pnpm vitest run test/server/growth-summary-parity.test.ts`
→ either the assertions pass (with `DATABASE_URL`) or the suite reports as
skipped. Either outcome is acceptable at this step; the file must compile.

### Step 2: Consolidate `growth-summary` into two statements

Replace the eight `ctx.db.execute` calls with exactly two, keeping every
subsequent line of JS (short-circuit, `pickDominant`, `dimensionShift`,
`buildNarrative`, the returned object) intact.

Statement 1 — one scan of `mirror_entries`:

```sql
select
  count(*) filter (where created_at >= ${startIso} and created_at < ${endIso})::int as voice,
  count(*) filter (where created_at >= ${prior.startIso} and created_at < ${prior.endIso})::int as prior_voice,
  count(*) filter (where created_at < ${startIso})::int as earlier_mirrors
from mirror_entries
where created_at < ${endIso}
```

Statement 2 — one scan of `vips_timeline_entries`, grouped so the dominant-
dimension rows and the scalar totals come from the same pass:

```sql
select
  dimension,
  count(*) filter (where committed_at >= ${startIso} and committed_at < ${endIso})::int as cryst,
  count(*) filter (where committed_at >= ${prior.startIso} and committed_at < ${prior.endIso})::int as prior_cryst,
  count(*) filter (where forgotten_at >= ${startIso} and forgotten_at < ${endIso})::int as forgotten,
  count(*) filter (where committed_at < ${startIso})::int as earlier_claims
from vips_timeline_entries
group by dimension
```

Then in JS:

- `voiceReflections` / `priorYearReflections` from statement 1.
- `claimsCrystallised` = sum of `cryst` across rows; `priorYearClaims` = sum of
  `prior_cryst`; `claimsForgotten` = sum of `forgotten`.
- `isFirstYear` = `(earlier_mirrors + Σ earlier_claims) === 0` — this reproduces
  the old `earlierRow` sum exactly.
- **Apply the TRAP fix**: build the `pickDominant` inputs as
  `rows.filter(r => cryst > 0).map(r => ({ dimension: r.dimension, count: r.cryst }))`
  and the prior set as `rows.filter(r => prior_cryst > 0).map(...)`. Add a
  comment naming the divergence this filter prevents.
- Keep the empty-year short-circuit in the same position and with the same
  condition (`voiceReflections === 0 && claimsCrystallised === 0 && claimsForgotten === 0`).
  It now runs after both statements instead of after five — accept that: two
  round-trips unconditionally is still 4× fewer than the old best case.
- Row types: extend/replace the local `CountRow` / `DimensionCountRow` types to
  match the new column lists. Keep `readCount`'s `string | number` tolerance —
  `pg` returns `bigint`-derived columns as strings and the `::int` casts are the
  only reason these arrive as numbers.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'ctx.db.execute' src/server/growth-summary.handler.server.ts` → `2`
- `grep -c 'count(\*) filter' src/server/growth-summary.handler.server.ts` → ≥ `1`
- `pnpm vitest run test/server/growth-summary.test.ts` → all pass (schema +
  narrative tests are untouched)

### Step 3: Consolidate `year-entries` into four statements

Replace the seven calls with four:

1. Reflections list + total in one statement — add
   `count(*) over ()::int as total_count` to the existing select list, keeping
   `order by created_at desc limit ${LIST_CAP}` unchanged.
2. Crystallised list + total — same treatment.
3. Forgotten list + total — same treatment.
4. The `group by dimension` statement, unchanged. It must stay separate: the
   `GROUP BY` covers **all** rows in the year while the lists are capped at 100,
   so folding it into a list query would under-count.

Read the totals off the first row of each result:
`result.rows[0]?.total_count ?? 0` via the existing `toCount` helper. An empty
result set means zero rows in the year, which is exactly what the old
`count(*)` returned — verify this is the case in the parity harness rather than
reasoning about it.

Keep the `no_data` short-circuit condition, the `dimensionCounts` seeding, and
all three row mappers (`:173-195`) byte-identical.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'ctx.db.execute' src/server/year-entries.handler.server.ts` → `4`
- `grep -c 'count(\*) over ()' src/server/year-entries.handler.server.ts` → `3`

### Step 4: Run the parity harness and the statement-count guard

Fill in the assertions in `test/server/growth-summary-parity.test.ts`: inside
one `withStudent` envelope per case, run the frozen oracle and the new handler
for the **same** student and year and `expect(newResult).toEqual(legacyResult)`.
Cover, at minimum:

- A year with reflections **and** claims (the seeded demo students have this).
- A year with reflections but **zero** claims — the TRAP case. Assert
  `dominantDimension` is `null` in both.
- A completely empty year → both `{ kind: 'no_data', year }`.
- The student's **first** active year → `isFirstYear: true` in both.
- A year where the prior year's dominant dimension differs → identical
  `dimensionShift` in both.
- The same five for `legacyYearEntries` vs `getYearEntriesHandler`.

Use `pnpm demo:reset` to seed. The demo students are `demo-a`…`demo-d`
(`src/db/client.ts:51`); pick whichever has multi-year data and say which in
your report.

Also create `test/server/growth-sql.test.ts` — **not** `DATABASE_URL`-gated —
which proves the collapse mechanically without a database: mock `~/db/client`'s
`withStudent` to invoke its callback with a stub `ctx` whose `db.execute` is a
`vi.fn()` that records the SQL text and returns canned rows. Assert:

- `getGrowthSummaryHandler` calls `execute` **exactly twice**.
- `getYearEntriesHandler` calls `execute` **exactly four times**.
- The recorded summary SQL contains `filter (where` and no longer contains
  `group by dimension` as a standalone statement pair.
- The recorded year-entries SQL contains `count(*) over ()` three times.
- Feed the stub a canned row set where one dimension has `cryst: 0` and assert
  the returned `dominantDimension` matches what the old code produced (the TRAP
  regression, verified without a database).

**Verify**:
- `pnpm vitest run test/server/growth-sql.test.ts` → all pass
- With `DATABASE_URL`: `pnpm demo:reset && pnpm vitest run test/server/growth-summary-parity.test.ts`
  → all pass. **Paste the diff-free result into your report.**
- Without `DATABASE_URL`: the parity file skips. Say so explicitly in your
  report and state that `growth-sql.test.ts` is then the only non-regression
  evidence.

### Step 5: Measure before touching indexes

**Do not add an index on a hunch.** With `DATABASE_URL` and a seeded student
(`pnpm demo:reset`), run `EXPLAIN ANALYZE` on the two new statements and on
year-entries' forgotten-list statement, inside a session with the tenancy GUC
set so RLS applies:

```sql
select set_config('app.student_id', 'demo-a', false);
explain analyze <statement 2 from Step 2>;
explain analyze select id, dimension, verbatim_quote, strength, committed_at, forgotten_at,
                       count(*) over ()::int as total_count
                from vips_timeline_entries
                where forgotten_at >= '<startIso>' and forgotten_at < '<endIso>'
                order by forgotten_at desc limit 100;
```

Decision rule:

- If a plan shows a **Seq Scan** on `vips_timeline_entries` whose actual time is
  a material share of the statement (say > 5 ms at seeded volume), add the two
  indexes to `src/db/schema.ts`:
  ```ts
    index('idx_vips_timeline_student_committed').on(t.studentId, t.committedAt.desc()),
    index('idx_vips_timeline_student_forgotten')
      .on(t.studentId, t.forgottenAt.desc())
      .where(sql`forgotten_at is not null`),
  ```
  then `pnpm db:generate`, read the generated SQL, and `pnpm db:migrate`.
  Re-run the `EXPLAIN ANALYZE` and paste before/after into your report.
- Otherwise **add no index** and write a short status note at the bottom of
  *this plan file* under a `## Status note (filled by executor)` heading:
  `"Index not needed at current scale — EXPLAIN on <student>/<year> showed
  <plan node> at <N> ms; revisit above ~<M> timeline rows."` Include the raw
  plan output.
- If `DATABASE_URL` is unavailable: add **no** index, and write the status note
  as `"Not measured — no DATABASE_URL available; index decision deferred."`
  Guessing at an index you cannot measure is worse than leaving the gap.

**Verify**: `pnpm check` → exit 0, and the plan file contains a
`## Status note (filled by executor)` section with either the measurement or the
explicit "not measured" line.

### Step 6: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0 (18 pre-existing warnings
OK); tests ≥911 passed + your new tests, 0 failed.

## Test plan

- New `test/server/growth-sql.test.ts` (**not** DB-gated): statement counts
  (2 and 4), SQL-shape assertions (`filter (where`, `count(*) over ()` ×3), and
  the zero-count `pickDominant` regression driven from canned rows.
- New `test/server/growth-summary-parity.test.ts` (DB-gated): frozen-oracle vs
  new implementation, `toEqual` across the five named year scenarios, for both
  handlers. Pattern exemplar: `test/db/rls-concurrency.test.ts` for real-DB
  envelope handling.
- Existing `test/server/growth-summary.test.ts` (schema + narrative) must stay
  green untouched.
- Because the parity harness is `DATABASE_URL`-gated, state in your report
  which of the two harnesses actually ran.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c 'ctx.db.execute' src/server/growth-summary.handler.server.ts` → `2`
- [ ] `grep -c 'ctx.db.execute' src/server/year-entries.handler.server.ts` → `4`
- [ ] `grep -c 'count(\*) over ()' src/server/year-entries.handler.server.ts` → `3`
- [ ] `grep -rn 'Promise.all' src/server/growth-summary.handler.server.ts src/server/year-entries.handler.server.ts` → no matches
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed + new tests
- [ ] `pnpm vitest run test/server/growth-sql.test.ts` passes
- [ ] Parity harness result (passed / skipped-without-DB) stated in the report
- [ ] This plan file has a `## Status note (filled by executor)` section recording the index decision
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The parity harness reports **any** difference. Paste both JSON blobs. Do not
  "fix" the oracle — the oracle is right by definition; your new SQL is wrong.
- `pg` returns the `count(*) filter` columns as strings despite the `::int`
  cast and `readCount`'s tolerance is not enough to reproduce the old values
  (e.g. a total lands as `"12"` where the old path gave `12` and a strict
  `toEqual` fails).
- The `count(*) over ()` totals disagree with the old `count(*)` for any year —
  most likely a `LIMIT`-interaction misunderstanding; report the year and both
  numbers.
- `pnpm db:generate` produces a migration that touches any table other than
  `vips_timeline_entries`, or that drops/recreates a table.
- You cannot make `growth-sql.test.ts`'s `ctx.db.execute` stub satisfy both
  handlers after two attempts — report the exact type error rather than
  loosening the handler's types.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer must scrutinise**: (1) the zero-count filter feeding
  `pickDominant` — this is the single behavioural trap in the change and it is
  invisible unless you think about the empty-current-year case; (2) that
  `isFirstYear` still sums *both* tables' earlier counts; (3) that the
  `no_data` short-circuit conditions are unchanged; (4) that no
  `student_id` predicate was added to any statement.
- **Follow-up recorded, deliberately not done here**: these handlers scope
  purely by RLS with no explicit `student_id` predicate, unlike
  `src/db/queries.ts`, which adds one deliberately (see its header comment at
  `:278-281`: "explicit student predicates below protect owner-role local/dev
  databases too"). On an owner-role local database RLS is bypassed, so Growth
  counts could include other students' rows locally. Fixing it changes results
  and therefore cannot ride along with a byte-identical-output refactor.
- **Follow-up recorded**: `/api/growth/year-entries` has no UI consumer today.
  If it stays unused for another cycle, consider deleting the route rather than
  maintaining two aggregate paths.
- **Interaction warning**: if `LIST_CAP` ever changes, the `count(*) over ()`
  totals are unaffected (the window runs before the limit) — that is the point
  of the construct, and it is easy to "optimise" away by mistake.
- If a future change adds a `dimension` equality filter to the summary queries,
  the existing `(student_id, dimension, committed_at DESC)` index becomes fully
  usable again and any index added in Step 5 may become redundant.
