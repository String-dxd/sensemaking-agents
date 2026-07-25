# Plan 035: Re-anchor the demo seed corpus to relative dates so it never rots

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/db/seed.ts test/ablation/fixtures/seed-multistudent.json scripts/ablate.ts src/lib/student-space/demo-shell-data.server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (demo data)
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

The demo database is seeded from a fixture whose timestamps are absolute.
As of 2026-07-23, the primary demo persona (`demo-a`, "Alice") has
reflections dated **in the future** (through `2026-07-27T08:00:00Z`), so a
demo viewer sees activity dated after "now". Worse, the moment the calendar
passes the fixture's last date, the History sheet — which boots onto the
real-clock "today" (`src/components/student-space/sheets/HistorySheet.tsx:254-257`)
— opens on an empty "Nothing logged today" cell, and the whole corpus reads
as progressively more stale with every passing week. After this plan, the
seed re-anchors the corpus at load time so Alice's newest reflection always
lands on "yesterday", with every relative gap preserved, and the fixture file
itself stays curated and untouched.

## Current state

Relevant files:

- `test/ablation/fixtures/seed-multistudent.json` — the curated 4-student
  demo corpus (604 lines). Date-bearing fields, verified by enumeration:
  **33× `reflections[].created_at`** (required) and **17×
  `vips_timeline_entries[].committed_at`** (optional, only on `demo-a`).
  No other date fields exist in the fixture. Per-student ranges today:
  - `demo-a`: reflections `2026-07-19T01:30:00Z` → `2026-07-27T08:00:00Z`;
    committed_at `2026-01-20T10:30:00Z` → `2026-07-09T12:30:00Z`
  - `demo-b`: reflections `2026-03-09T23:45:00Z` → `2026-05-03T18:00:00Z`
  - `demo-c`: reflections `2026-02-13T07:00:00Z` → `2026-04-11T18:00:00Z`
  - `demo-d`: reflections `2026-01-10T17:30:00Z` → `2026-03-08T19:00:00Z`
- `src/db/seed.ts` — fixture loader + DB seeder. The loader is:

  ```ts
  // src/db/seed.ts:121-126
  const SEED_PATH = resolve(process.cwd(), 'test/ablation/fixtures/seed-multistudent.json')

  export function loadSeedCorpus(): MultiStudentSeedCorpus {
    const raw = readFileSync(SEED_PATH, 'utf8')
    return JSON.parse(raw) as MultiStudentSeedCorpus
  }
  ```

  Dates are inserted verbatim: `createdAt: r.created_at` (`src/db/seed.ts:201`)
  and `committedAt: entry.committed_at ?? new Date().toISOString()`
  (`src/db/seed.ts:248`).

- **Constraint to honor** — the doc comment at `src/db/seed.ts:144-147`:

  > Reflections insert with explicit `created_at` from the fixture (the v0.2
  > ablation harness sorts by this column, so it must match the curated
  > timeline).

  A *uniform* shift of every date by one shared day-delta preserves the sort
  order and all relative gaps, so it satisfies this constraint. Anything
  non-uniform (per-student anchors, clamping, compressing) does NOT — do not
  do that.

- Consumers of `loadSeedCorpus()` / the fixture (verified by grep):
  - `src/db/seed.ts` (the DB seeder — the primary target)
  - `scripts/ablate.ts` — imports `loadSeedCorpus` (line 47), calls it at
    lines 87/110, and copies `created_at: r.created_at` into run inputs at
    line 119; only relies on ordering, not absolute values
  - `src/lib/student-space/demo-shell-data.server.ts` — a **runtime**
    consumer that derives demo-shell entry dates from `created_at`; shifting
    benefits it (it currently shows the same rotting dates)
  - `scripts/managed-agents/smoke-mirror.ts`, `smoke-connector.ts`,
    `smoke-cartographer.ts`, `cartographer-rubric-batch.ts` — pick
    transcripts; date-insensitive
  - `test/ablation/sensemake-tools-off.test.ts`,
    `test/ablation/mirror-tools-off.test.ts` — the only absolute dates they
    contain are their own `ranAt: '2026-05-11T20:00:00Z'` constants
    (sensemake-tools-off lines 25/49; mirror-tools-off line 24), which are
    NOT fixture dates. Verified: no test asserts a
    specific fixture `created_at` value.

- Repo precedent for relative demo dates — the engine's calendar seed,
  `src/engine/student-space/Game/Data/calendarSeed.js:10-15`:

  ```js
  const dateOffset = (n) =>
  {
      const d = new Date()
      d.setDate(d.getDate() + n)
      return `${d.getFullYear()}-...`
  }
  ```

  and the letters seed (`src/engine/student-space/Game/Data/lettersSeed.js:24,33`)
  uses `isoDaysAgo(0)` / `isoDaysAgo(1)`. Those engine-side seeds are already
  relative — they are **out of scope**; this plan brings the DB fixture in
  line with the same philosophy.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint + typecheck | `pnpm check` | exit 0 (warnings OK, 0 errors) |
| New unit tests | `pnpm vitest run test/db/seed-date-shift.test.ts` | all pass |
| Ablation tests untouched | `pnpm vitest run test/ablation` | pass or skip (some ablation tests skip without API keys — skips are fine, failures are not) |
| Full suite | `pnpm test` | no NEW failures vs baseline (10 pre-existing failures in 5 files are known at `a9e1364e`; plans 033/034 fix them) |
| Re-seed DB (only if `DATABASE_URL` is configured) | `SEED_REPLACE_EXISTING=1 pnpm seed` | prints `seed: inserted 33 reflection(s), 17 timeline entry row(s), and 4 trajectory row(s) across 4 student(s): ...` |

## Scope

**In scope** (the only files you should modify):

- `src/db/seed.ts` — add the shift function and apply it in `loadSeedCorpus`
- `test/db/seed-date-shift.test.ts` — create

**Out of scope** (do NOT touch, even though they look related):

- `test/ablation/fixtures/seed-multistudent.json` — the fixture stays
  curated and verbatim; the shift happens at load time, never by rewriting
  the file.
- `scripts/ablate.ts`, `scripts/managed-agents/*` — they consume the shifted
  corpus transparently; no changes needed.
- `src/engine/student-space/Game/Data/calendarSeed.js`, `lettersSeed.js` —
  already relative.
- `src/lib/student-space/demo-shell-data.server.ts` — inherits the shift via
  `loadSeedCorpus`; do not modify it here (its UTC `toEntryDate` is plan
  036's business).
- `src/components/student-space/sheets/HistorySheet.tsx` — the "today"
  default is correct; the data was wrong.

## Git workflow

- Branch: `advisor/035-relative-demo-seed-dates`
- Conventional commits, e.g. `feat(seed): re-anchor demo corpus dates relative to now`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a pure, exported `shiftCorpusDates` function to `src/db/seed.ts`

Signature and behavior:

```ts
/**
 * Uniformly shift every date in the corpus by a whole number of days so the
 * NEWEST demo-a reflection lands on "yesterday" relative to `now`. A single
 * shared day-delta preserves intra-corpus ordering and all relative gaps —
 * required by the v0.2 ablation harness, which sorts by created_at and
 * expects the curated timeline (see the seed() doc comment).
 */
export function shiftCorpusDates(
  corpus: MultiStudentSeedCorpus,
  now: Date = new Date(),
): MultiStudentSeedCorpus
```

Rules:

- Compute the anchor: `yesterday` = the UTC date of `now` minus 1 day.
- Find the maximum `created_at` among **demo-a's** reflections (the student
  with `student_id === 'demo-a'`; if absent, use the corpus-wide max).
- `deltaDays` = whole days from that max date (UTC date portion) to the
  anchor date. May be negative (it is, at planning time: 2026-07-27 → -5).
- Add `deltaDays * 86_400_000` ms to **every** `reflections[].created_at`
  and every present `vips_timeline_entries[].committed_at`, across **all**
  students, re-serializing with `.toISOString()`. Shifting by whole days
  preserves each entry's time-of-day (important: times encode intra-day
  ordering and, post-plan-036, the Singapore-local day).
- Return a new corpus object; do not mutate the input.
- No other fields change. (Verified enumeration: `created_at` and
  `committed_at` are the only date-bearing fixture fields.)

**Verify**: `pnpm check` → exit 0.

### Step 2: Apply the shift in `loadSeedCorpus`, with an explicit opt-out

Change the loader to:

```ts
export function loadSeedCorpus(options?: { shiftDates?: boolean }): MultiStudentSeedCorpus {
  const raw = readFileSync(SEED_PATH, 'utf8')
  const corpus = JSON.parse(raw) as MultiStudentSeedCorpus
  return options?.shiftDates === false ? corpus : shiftCorpusDates(corpus)
}
```

Shifting by default is intentional: `seed.ts`, `scripts/ablate.ts`, the
smoke scripts, and `demo-shell-data.server.ts` all want a fresh-looking,
order-preserved corpus. Do NOT add `shiftDates: false` at any existing call
site — the opt-out exists only for future callers that need the verbatim
fixture.

**Verify**: `pnpm check` → exit 0, and
`grep -rn "loadSeedCorpus(" src scripts test --include='*.ts'` → every call
site still compiles with zero arguments (the options parameter is optional).

### Step 3: Write the unit tests

Create `test/db/seed-date-shift.test.ts` (pure unit tests, no DB — model the
file structure on `test/lib/counsellor-brief-renderer.test.ts`: plain
`describe`/`it` with `vitest`, fixture objects built inline). Cases:

1. **Anchor**: with a fixed `now` (e.g. `new Date('2026-07-23T10:00:00Z')`),
   the shifted demo-a max `created_at` falls on `2026-07-22` (UTC date).
2. **Order preserved**: the sorted order of all `created_at` values (across
   all students) is identical before and after the shift.
3. **Uniform delta**: for every reflection, `shifted - original` equals the
   same number of milliseconds, and that number is a whole-day multiple.
4. **committed_at shifted too**: demo-a's `vips_timeline_entries` committed
   dates move by the same delta; entries without `committed_at` stay absent.
5. **Time-of-day preserved**: an entry at `T01:30:00Z` still ends at
   `T01:30:00Z` after shifting.
6. **Opt-out**: `loadSeedCorpus({ shiftDates: false })` returns the verbatim
   fixture (spot-check one known literal, e.g. demo-a contains
   `2026-07-19T01:30:00Z`). Note: if the curators later edit fixture dates,
   this literal must be updated — keep the assertion on ONE value only.
7. **No mutation**: the input corpus object passed to `shiftCorpusDates` is
   unchanged afterward.

Use the real fixture via `loadSeedCorpus({ shiftDates: false })` as test
input where convenient — it keeps the test honest about field names.

**Verify**: `pnpm vitest run test/db/seed-date-shift.test.ts` → 7 tests pass.

### Step 4: Confirm the consumers still behave

**Verify**: `pnpm vitest run test/ablation` → passes or skips, no failures.
**Verify**: `pnpm check` → exit 0.
**Verify** (only if `DATABASE_URL` is set in your environment):
`SEED_REPLACE_EXISTING=1 pnpm seed` → prints the inserted-counts line for 4
students, then a manual spot check is optional:
`psql "$DATABASE_URL" -c "select max(created_at) from mirror_entries where student_id='demo-a'"`
→ a timestamp on yesterday's date.

## Test plan

- New file: `test/db/seed-date-shift.test.ts` with the 7 cases in Step 3.
- Pattern exemplar: `test/lib/counsellor-brief-renderer.test.ts` (pure unit
  test, no DB, no React).
- Verification: `pnpm vitest run test/db/seed-date-shift.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/db/seed-date-shift.test.ts` → 7/7 pass
- [ ] `pnpm vitest run test/ablation` → no failures (skips allowed)
- [ ] `pnpm test` shows no NEW failing files beyond the 5 known-failing at
      `a9e1364e` (`history-sheet`, `trajectory-sheet`, `dev.pipeline`,
      `student-space-host`, `edupass-login`)
- [ ] `git diff --stat` touches only `src/db/seed.ts` and
      `test/db/seed-date-shift.test.ts`
- [ ] The fixture file is byte-identical:
      `git diff --exit-code test/ablation/fixtures/seed-multistudent.json` → exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- You find any test, script, or golden file that asserts a **specific
  absolute fixture date** (a `created_at`/`committed_at` literal from
  `seed-multistudent.json`) and would break under a uniform shift. At
  planning time none exists; if one appeared since, the shift-by-default
  decision needs a human call.
- You find a date-bearing fixture field other than `created_at` and
  `committed_at` (the enumeration in "Current state" would be wrong —
  re-plan rather than guess).
- `scripts/ablate.ts` turns out to depend on absolute dates (not just
  ordering) anywhere — report the line; do not special-case it.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **After every deploy/demo-prep**, re-seeding with
  `SEED_REPLACE_EXISTING=1 pnpm seed` refreshes the anchored dates; a stale
  DB seeded weeks ago will still drift. Plan 037 (demo operator kit) wraps
  this in a `demo:reset` script — if 037 has landed, mention the shift there.
- **Interaction with plan 036** (Singapore-timezone bucketing): fixture
  times near UTC midnight (e.g. demo-b's `23:45:00Z`) will render on the
  *next* calendar day once bucketing is SGT-anchored. That is correct
  behavior; do not "fix" it here.
- Reviewers should scrutinize: the delta is computed **once** from demo-a's
  max and applied corpus-wide (not per-student), and `shiftCorpusDates` is
  pure (no mutation of the parsed fixture).
- Deferred: making the fixture itself offset-based (`days_ago`) was
  considered and rejected — it would churn 50 curated lines and break the
  "fixture is the reviewable curated artifact" property for zero additional
  benefit over load-time shifting.
