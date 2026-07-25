# Plan 055: Bound the boot wiki snapshot and stop shipping `raw_output_json` to the client

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/server/load-wiki.handler.server.ts src/server/load-vips-pages.handler.server.ts src/db/queries.ts src/lib/student-space/backend-snapshot.ts src/components/student-space/sheets/ test/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (the boot snapshot feeds the engine's Captures slice; a wrong cap silently blanks old calendar months)
- **Depends on**: `plans/054-connector-claim-and-tx-split.md` (also edits `src/db/queries.ts`)
- **Category**: perf
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`loadWiki` is the only caller in the repo that asks for a student's mirror
entries with **no LIMIT**, and it sits on the boot critical path — one of four
calls in a `Promise.all` that gates History/Calendar first paint. Every row it
returns carries `raw_output_json`, the stringified full Mirror agent output,
which is a near-duplicate of the `validation` / `inferred_meaning` /
`story_reframe` columns already in the row and which **nothing in
`src/components`, `src/engine`, or `src/lib` reads**. At roughly one reflection
per school day a student reaches ~200 entries per year, so both the query cost
and the wire payload grow linearly and without bound — the worst case is a
student in their third or fourth year, which is exactly the cohort the product
is built for.

Two independent wins: drop the dead blob (roughly halves each row with zero UX
risk) and put a real bound on the query. The ease-of-use constraint is
non-negotiable: **History must not silently lose older entries.** A naive cap
would blank old calendar months, so the bound has to be designed around what
the UI actually reads.

## Current state

Files and their roles:

- `src/server/load-wiki.handler.server.ts` — the unbounded handler.
- `src/db/queries.ts` — `listMirrorEntries` (the `limit: null` → no-LIMIT path)
  and `rowToMirrorEntry` (the row mapper that emits `raw_output_json`).
- `src/lib/student-space/backend-bridge.ts` — puts `loadWiki` on the boot
  critical path.
- `src/lib/student-space/backend-snapshot.ts` — maps wiki entries into engine
  capture snapshots.
- `src/components/student-space/sheets/CalendarPane.tsx` — builds day chips from
  the engine's captures.
- `src/components/student-space/sheets/MirrorDetailSheet.tsx` — the reflection
  detail column; reads detail fields from the engine's captures.
- `src/server/load-vips-pages.handler.server.ts` — a second boot call that also
  ships `raw_output_json` (12 rows).

### The unbounded call

`src/server/load-wiki.handler.server.ts:17-32`:

```ts
export interface WikiSnapshot {
  entries: MirrorEntryRow[]
}
...
export async function loadWikiHandler(data: LoadWikiInput): Promise<WikiSnapshot> {
  loadWikiInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => ({
    entries: await listMirrorEntries(studentId, { ctx, limit: null }),
  }))
}
```

`src/db/queries.ts:463-497` — `limit: null` maps to `undefined`, which skips
`.limit()` entirely:

```ts
export async function listMirrorEntries(
  studentId: string,
  opts: { limit?: number | null; includeForgotten?: boolean; ctx?: TenantContext } = {},
): Promise<MirrorEntryRow[]> {
  const limit = opts.limit === null ? undefined : (opts.limit ?? 50)
  ...
}

async function listMirrorEntriesInner(
  ctx: TenantContext,
  limit: number | undefined,
  includeForgotten = false,
): Promise<MirrorEntryRow[]> {
  const baseQuery = ctx.db
    .select()
    .from(mirrorEntries)
    .where(eq(mirrorEntries.studentId, ctx.studentId))
    .orderBy(desc(mirrorEntries.createdAt))
  const rows = limit === undefined ? await baseQuery : await baseQuery.limit(limit)
```

`loadWiki` is the **only** `limit: null` caller. The other three callers are
bounded: `load-pipeline-trace.handler.server.ts:49` (`limit: 200`),
`load-vips-pages.handler.server.ts:121` (`limit: 12`).

### The dead blob on the wire

`src/db/queries.ts:56-75` and `:216-229` — the public row type and the mapper:

```ts
export interface MirrorEntryRow {
  id: number
  student_id: string
  transcript: string
  title?: string | null
  validation: string
  inferred_meaning: string
  story_reframe: string
  /** The un-edited Mirror agent output, preserved for the R20 ablation. */
  raw_output_json: string
  context_type: VipsContextType
  review_status: MirrorReviewStatus
  tags: string[]
  created_at: string
}
```

```ts
    story_reframe: row.story_reframe,
    raw_output_json: row.raw_output_json,
    context_type: row.context_type,
```

The only reader of `raw_output_json` outside `src/db/` is the fixture
`src/lib/wiki-mocks.ts:20` (`MOCK_MIRROR_ENTRY`, which is not referenced
anywhere else in `src/` or `test/`). Server-side callers that legitimately need
the blob keep it: the ablation harness (`scripts/ablate.ts`) and
`updateMirrorEntryFields`, whose contract is "edits leave `raw_output_json`
untouched" (`src/db/queries.ts:548-552`).

### Boot critical path

`src/lib/student-space/backend-bridge.ts:285-304`:

```ts
async function loadBackendSnapshot(): Promise<StudentSpaceBackendSnapshot> {
  const [vips, wiki, trajectory, authMenu] = await Promise.all([
    loadVipsPages({ data: {} }),
    loadWiki({ data: {} }),
    loadTrajectory({ data: {} }),
    loadAuthMenu().catch((err) => { ... return null }),
  ])
  return createStudentSpaceBackendSnapshot({ vips, wiki, trajectory, authMenu })
}
```

Used by both `refreshSnapshot` and the capture-time snapshot refresh
(`:323`), so this payload is re-fetched after every confirmed capture too.

### What the UI reads (this decides the design)

`src/lib/student-space/backend-snapshot.ts:280-315` turns **every** wiki entry
into an engine capture snapshot:

```ts
export function mapWikiSnapshotToStudentSpaceReflections(
  snapshot: WikiSnapshot,
): StudentSpaceReflectionCaptureSnapshot[] {
  return snapshot.entries
    .map(mapMirrorEntryToReflectionCapture)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}
```

`mapMirrorEntryToReflectionCapture` reads `id`, `created_at`, `transcript`,
`title`, `validation`, `story_reframe`, `inferred_meaning`, `tags`,
`review_status`, `context_type` — and **never** `raw_output_json`.

`src/components/student-space/sheets/CalendarPane.tsx:167-190` builds one chip
per capture across **all** entries:

```ts
  const captures = engineState?.captures?.entries ?? []
  const events = engineState?.calendar?.events ?? []
  ...
  for (const cap of captures) {
    const mood = cap.reframe?.moods?.[0]
    pushChip(cap.entryDate, {
      type: 'reflection',
      label: cap.title?.trim() || cap.reframe?.headline?.trim() || 'Reflection',
      accent: mood ? EMOTION_BY_ID[mood]?.color : undefined,
    })
  }
```

Chip fields needed: `entryDate` (from `created_at`), `title` or
`reframe.headline` (from `story_reframe`), `reframe.moods[0]` (from `tags`).

`src/components/student-space/sheets/MirrorDetailSheet.tsx:73-87` reads full
detail **from the engine's captures**, not from a lazy fetch:

```ts
export function MirrorDetailPane({ entryId, onClose }: { entryId: number; onClose: () => void }) {
  ...
        (entry) => Number(entry.backendMirrorEntryId) === entryId && entry.kind === 'ask',
    [entries, entryId],
```

`src/components/student-space/sheets/DayDetailCard.tsx:198-243` renders
`kind === 'ask'` cards with **title / headline / time only** — no transcript —
so the day-detail column is happy with a slim row. `MirrorDetailPane` is the
only consumer of the heavy prose fields.

An already-wired lazy-detail primitive exists and is currently unused by the
UI: `loadWikiEntry` (`src/server/load-wiki.functions.ts:11-15` →
`loadWikiEntryHandler`, `src/server/load-wiki.handler.server.ts:41-61`) returns
one full entry plus its connected VIPS timeline entries.

### Repo conventions

- pnpm only. `pnpm check` = Biome + `tsc --noEmit`. Vitest tests in `test/`
  mirroring `src/`. Conventional commits.
- Tenancy: every DB read goes through `withStudent`; query functions take an
  optional `opts.ctx` and open their own envelope when absent.
- **Engine seam trap**: any *new* field on a capture snapshot must be added to
  `KNOWN_CAPTURE_KEYS` in `src/engine/student-space/Game/State/schema.js:216-241`
  or the engine's validator **silently drops it** (`:344`). Prefer a design
  that needs no new capture key.
- Baseline: `pnpm check` exit 0 with 18 pre-existing warnings; `pnpm test` =
  911 passed / 128 skipped / 0 failed. The DB-backed suites skip without
  `DATABASE_URL`.

## Commands you will need

| Purpose   | Command                                                       | Expected on success                  |
|-----------|---------------------------------------------------------------|--------------------------------------|
| Install   | `pnpm install`                                                | exit 0                               |
| Check     | `pnpm check`                                                  | exit 0 (18 pre-existing warnings OK) |
| All tests | `pnpm test`                                                   | ≥911 passed, 0 failed                |
| One file  | `pnpm vitest run test/server/load-wiki-payload.test.ts`       | new tests pass                       |
| Seed a DB | `pnpm demo:reset`                                             | exit 0 (needs `DATABASE_URL`)        |

## Scope

**In scope** (the only files you should modify/create):

- `src/db/queries.ts` — the client-facing row type + mapper; a slim chip query if Branch A
- `src/server/load-wiki.handler.server.ts` — the bound + the client shape
- `src/server/load-vips-pages.handler.server.ts` — `recent_entries` uses the client shape too
- `src/lib/student-space/backend-snapshot.ts` — type adjustments only
- `src/components/student-space/sheets/MirrorDetailSheet.tsx` — **Branch A only**: lazy detail fetch
- `test/server/load-wiki-payload.test.ts` (create)
- `src/lib/wiki-mocks.ts` — only if the type change makes it fail `tsc`

**Out of scope** (do NOT touch, even though they look related):

- `src/db/queries.ts`'s `MirrorEntryRow` itself — the *server* shape keeps
  `raw_output_json`. `updateMirrorEntryFields`' "leaves `raw_output_json`
  untouched" contract (`:548-552`) and `scripts/ablate.ts` depend on it.
- `src/server/load-pipeline-trace.handler.server.ts` — dev-only route, already
  bounded at 200, and it is a debug surface where the raw blob is legitimately
  useful.
- The engine's Captures persistence / `KNOWN_CAPTURE_KEYS` — the chosen design
  must not require a new capture key.
- Pagination UI ("load older") — explicitly deferred; see Maintenance notes.
- `plans/057`'s memoization of CalendarPane / DayDetailCard — different plan,
  different files.

## Git workflow

- Branch: `advisor/055-bound-loadwiki-payload`
- Commit per step. Conventional commits, e.g.
  `perf(wiki): drop raw_output_json from the client row and bound the boot snapshot`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the state and decide the branch — record your answer

Read the six files under "Current state" and confirm the excerpts. Then run
these greps to determine which branch Step 3 takes. **Write the branch you
chose, and the grep output that decided it, into your final report.**

**Verify** (expected results, which is what the plan was written against):

- `grep -rn 'raw_output_json' src/components src/engine src/lib` → **only**
  `src/lib/wiki-mocks.ts:20`.
- `grep -n 'snapshot.entries' src/lib/student-space/backend-snapshot.ts` →
  one match at `:283` (inside `mapWikiSnapshotToStudentSpaceReflections`), with
  **no** `.slice(` and no date filter → the calendar receives *all* entries.
- `grep -n 'captures?.entries' src/components/student-space/sheets/CalendarPane.tsx`
  → one match at `:167`, consumed by an unfiltered `for (const cap of captures)`
  loop → chips are built from **all** entries.
- `grep -rn 'loadWikiEntry' src/components` → **no** matches → the detail pane
  has no lazy-fetch path yet.

Branch selection rule:

- **Branch A** — if the calendar builds chips from all entries (the expected
  outcome above). A naive cap would blank old months, so the design is: a
  **slim projection** for older entries (chips) + a **capped set of full rows**
  for detail, plus a lazy detail fetch for the slim tier.
- **Branch B** — if and only if the calendar turns out to read a bounded or
  date-windowed subset. Then a generous cap (200 newest) with a "load older"
  affordance is sufficient and no slim tier is needed.

### Step 2 (both branches): Split the row type and stop shipping the blob

In `src/db/queries.ts`, next to `MirrorEntryRow`, add the client-facing shape
and an explicit mapper:

```ts
/**
 * Client-facing projection of `MirrorEntryRow`. `raw_output_json` is the
 * stringified full Mirror agent output — a near-duplicate of the three prose
 * columns, kept server-side for the R20 ablation harness and never read by
 * any browser surface. Everything that crosses the wire uses this shape.
 */
export type ClientMirrorEntryRow = Omit<MirrorEntryRow, 'raw_output_json'>

/** Field-by-field so adding a column to MirrorEntryRow is a deliberate
 *  decision about whether it may cross the wire (tsc will flag the gap). */
export function toClientMirrorEntry(row: MirrorEntryRow): ClientMirrorEntryRow {
  return {
    id: row.id,
    student_id: row.student_id,
    transcript: row.transcript,
    title: row.title,
    validation: row.validation,
    inferred_meaning: row.inferred_meaning,
    story_reframe: row.story_reframe,
    context_type: row.context_type,
    review_status: row.review_status,
    tags: row.tags,
    created_at: row.created_at,
  }
}
```

Then:

- `src/server/load-wiki.handler.server.ts`: `WikiSnapshot.entries` becomes
  `ClientMirrorEntryRow[]`, and the handler maps through
  `toClientMirrorEntry`.
- `src/server/load-vips-pages.handler.server.ts`: `recent_entries` (`:52`,
  `:131`) becomes `ClientMirrorEntryRow[]` and maps through
  `toClientMirrorEntry`. `deriveRecentMoodsFromMirrorEntries` (`:141-144`)
  reads only `tags` / `id` / `created_at`, so widen its parameter to
  `readonly ClientMirrorEntryRow[]` (a `MirrorEntryRow` is still assignable).
- `src/lib/student-space/backend-snapshot.ts`: change
  `mapMirrorEntryToReflectionCapture(entry: MirrorEntryRow)` (`:288-289`) to
  take `ClientMirrorEntryRow`. The two indexed accesses at `:59` and `:61`
  (`MirrorEntryRow['review_status']`, `['context_type']`) still resolve — leave
  them or switch to the client type, your choice; they are equivalent.
- If `src/lib/wiki-mocks.ts` now fails `tsc` (its `MOCK_MIRROR_ENTRY` is typed
  `MirrorEntryRow` and is unreferenced elsewhere), retype it to
  `ClientMirrorEntryRow` and delete the `raw_output_json` field.

**Verify**:
- `pnpm check` → exit 0
- `grep -n 'raw_output_json' src/server/load-wiki.handler.server.ts src/server/load-vips-pages.handler.server.ts src/lib/student-space/backend-snapshot.ts` → no matches
- `pnpm test` → ≥911 passed, 0 failed

### Step 3A (Branch A): Slim tail + capped full rows + lazy detail

Add two constants and one new query, then wire them.

1. In `src/server/load-wiki.handler.server.ts`:
   ```ts
   /** Newest N entries arrive with full prose (transcript, validation,
    *  inferred_meaning) so the reflection detail column can render offline. */
   export const WIKI_FULL_ENTRY_LIMIT = 200
   /** Older entries arrive as chip-only rows so the calendar never blanks a
    *  month. Total boot rows are therefore bounded at FULL + SLIM. */
   export const WIKI_SLIM_ENTRY_LIMIT = 800
   ```

2. In `src/db/queries.ts`, add a slim projection query following the house
   `opts.ctx ?? withStudent` pattern:
   ```ts
   /** Chip-tier projection: everything the calendar + day-detail card render,
    *  without the three heavy prose columns. Used for entries older than
    *  `WIKI_FULL_ENTRY_LIMIT` so old months keep their chips at a fraction of
    *  the payload. */
   export type MirrorEntryChipRow = Pick<
     ClientMirrorEntryRow,
     'id' | 'student_id' | 'title' | 'story_reframe' | 'context_type' | 'review_status' | 'tags' | 'created_at'
   >

   export async function listMirrorEntryChips(
     studentId: string,
     opts: { offset: number; limit: number; ctx?: TenantContext },
   ): Promise<MirrorEntryChipRow[]>
   ```
   Implementation: select only those columns from `mirror_entries`, ordered
   `created_at desc`, with `.offset(opts.offset).limit(opts.limit)`, plus the
   existing batched tag load (`loadTagsForEntriesInner`, `:302-320`) so
   `review_status` and mood tags are derived exactly as `rowToMirrorEntry`
   derives them (`:210-230`). Reuse that logic — do **not** re-implement the
   confirmed/forgotten tag precedence.

3. In `loadWikiHandler`, run the two queries sequentially inside the one
   `withStudent` envelope (no `Promise.all` on a single transaction client —
   `test/server/pg-transaction-serialization.test.ts` guards that pattern) and
   concatenate: full rows first (they are the newest), then slim rows mapped
   into `ClientMirrorEntryRow` with `transcript: ''`, `validation: ''`,
   `inferred_meaning: ''`. Keep the response shape a single `entries` array so
   `mapWikiSnapshotToStudentSpaceReflections` and the engine hydration are
   untouched.

4. Lazy detail in `src/components/student-space/sheets/MirrorDetailSheet.tsx`:
   when the located capture for `entryId` has an empty `text` (i.e. it came
   from the slim tier), fetch the full entry via the existing `loadWikiEntry`
   server fn and render from that. **Do not add a new capture field** — an
   empty `text` on an `ask` capture is the signal, which keeps
   `KNOWN_CAPTURE_KEYS` untouched. Show the existing loading treatment while
   the fetch is in flight; on fetch failure, fall back to what the capture has
   (title/headline) rather than an error state — this pane must never block the
   sheet.

**Verify (Branch A)**:
- `pnpm check` → exit 0
- `grep -n 'limit: null' src/server/load-wiki.handler.server.ts` → no match
- `grep -rn 'limit: null' src/` → no matches anywhere
- `pnpm vitest run test/server/load-wiki-payload.test.ts` → all pass (Step 4)
- Manual gate with a seeded DB (`pnpm demo:reset`, `pnpm dev`, open `/history`):
  the calendar's oldest month with seeded data still shows chips, and clicking
  one of those old reflections opens the detail column with real prose. Record
  the result in your report. If `DATABASE_URL` is unavailable, say so and note
  that the manual gate was not run.

### Step 3B (Branch B only): Generous cap

Replace `limit: null` with `limit: WIKI_FULL_ENTRY_LIMIT` (200) and add the
"load older" affordance in whatever component owns the bounded read that made
this branch apply.

**Verify (Branch B)**:
- `grep -rn 'limit: null' src/` → no matches
- `pnpm check` → exit 0
- Manual gate: same as Branch A's — the oldest seeded month still renders.

### Step 4: Tests

Create `test/server/load-wiki-payload.test.ts` (`// @vitest-environment node`;
model the `vi.hoisted` mocking style on `test/auth/routes.test.ts`). Mock
`~/auth/identity` (`requireCounselorContext`), `~/db/client` (`withStudent`
invoking its callback with a stub ctx) and `~/db/queries`.

1. **Payload-shape test (the regression this plan exists for)**: build a
   `MirrorEntryRow` fixture whose `raw_output_json` contains the marker string
   `'MARKER_RAW_BLOB'`, have the mocked `listMirrorEntries` return it, call
   `loadWikiHandler({})`, and assert
   `JSON.stringify(result)` does **not** contain `'MARKER_RAW_BLOB'` and does
   not contain `'raw_output_json'`.
2. **Unit test on `toClientMirrorEntry`**: the returned object has no
   `raw_output_json` **key** (`expect('raw_output_json' in out).toBe(false)`) —
   not merely a type-level omission.
3. **Bound-respected test**: assert the mocked `listMirrorEntries` was called
   with a **numeric** limit and never with `null`:
   `expect(listMirrorEntries).toHaveBeenCalledWith('demo', expect.objectContaining({ limit: expect.any(Number) }))`.
4. **Branch A only — no-blank-months test**: with mocked queries returning 250
   full rows and 40 slim rows, assert `result.entries.length === 290`, that the
   40 oldest have `transcript === ''`, and that the 250 newest have non-empty
   transcripts. This is the mechanical stand-in for "old months keep their
   chips".
5. **Same-shape test**: assert `loadVipsPagesHandler`'s `recent_entries` also
   stringifies without `'raw_output_json'` (mock the same way).

**Verify**: `pnpm vitest run test/server/load-wiki-payload.test.ts` → all pass.

Also run the two existing suites that touch these shapes:
`pnpm vitest run test/lib/student-space/backend-snapshot.test.ts test/server/load-vips-pages.test.ts test/server/load-wiki-connected-links.test.ts`
→ all pass. `test/db.test.ts` and other DB-backed files skip without
`DATABASE_URL`; if you have one, run
`pnpm vitest run test/db/rls-concurrency.test.ts` too and report which you ran.

### Step 5: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0 (18 pre-existing warnings
OK); tests ≥911 passed + your new tests, 0 failed.

## Test plan

- New `test/server/load-wiki-payload.test.ts`: payload-shape guard (marker
  string never crosses the wire), `toClientMirrorEntry` key-absence unit,
  bound-respected assertion, Branch-A slim/full composition, and the same
  payload guard on `load-vips-pages`.
- Pattern exemplar: `test/auth/routes.test.ts` (node env, `vi.hoisted` mocks,
  handlers called directly).
- Existing suites that must stay green:
  `test/lib/student-space/backend-snapshot.test.ts`,
  `test/server/load-vips-pages.test.ts`,
  `test/server/load-wiki-connected-links.test.ts`.
- `DATABASE_URL`-gated suites (`test/db.test.ts`, `test/db/*`) will skip without
  a local database; state in your report whether you ran them.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn 'limit: null' src/` → no matches
- [ ] `grep -rn 'raw_output_json' src/server/ src/lib/ src/components/ src/engine/` → no matches (`src/db/queries.ts` and `scripts/` keep it — they are server-side)
- [ ] `grep -c 'ClientMirrorEntryRow' src/db/queries.ts src/server/load-wiki.handler.server.ts src/server/load-vips-pages.handler.server.ts` → ≥1 in each
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed + new tests
- [ ] The branch chosen (A or B) and the deciding grep output are stated in the report
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's `raw_output_json` grep finds a **real** consumer in
  `src/components`, `src/engine`, or `src/lib` (anything other than
  `wiki-mocks.ts`) — then the field is load-bearing and the split needs a
  different cut.
- Branch A's lazy detail fetch in `MirrorDetailSheet.tsx` cannot be added
  without a new capture field (i.e. an empty `text` turns out to be a legitimate
  state for a full-tier `ask` capture) — a `KNOWN_CAPTURE_KEYS` change is out of
  scope. Report it; Step 2 alone is independently valuable and can ship without
  Step 3A.
- Branch A's step 4 grows past the M budget (e.g. `MirrorDetailPane`'s state
  machine needs restructuring): **stop after Step 2**, report that the blob is
  gone but the bound is deferred, and propose the bound as a follow-up plan.
  Never ship a bare cap without the slim tier — that silently blanks old months.
- Removing `raw_output_json` from `WikiSnapshot` breaks `tsc` in a file outside
  the in-scope list.
- The manual gate shows any month with seeded reflections rendering zero chips.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer must scrutinise**: (1) that `toClientMirrorEntry` is used on
  **every** path that returns mirror rows to a browser — grep the handlers, do
  not trust the type; (2) Branch A's slim-row placeholders (`transcript: ''`)
  and the detail pane's empty-`text` signal, which is the one piece of implicit
  coupling this design introduces — it deserves a comment on both sides;
  (3) that the two queries in `loadWikiHandler` are sequential, not
  `Promise.all`, inside the single transaction.
- **Explicitly deferred**: a real "load older" pagination affordance in History.
  Branch A bounds the boot payload at `WIKI_FULL_ENTRY_LIMIT +
  WIKI_SLIM_ENTRY_LIMIT` = 1000 rows, which is roughly five school years at one
  reflection per school day. A student past that loses their oldest chips.
  Revisit before the product has multi-year-cohort users at that volume.
- **Interaction warning**: if a new column is added to `MirrorEntryRow`, `tsc`
  will flag `toClientMirrorEntry` — that error is the design working. Decide
  deliberately whether the field may cross the wire.
- **Interaction warning**: `plans/054` and `plans/058` also edit
  `src/db/queries.ts`. Land 054 first, then 055, then 058.
- The same "unbounded read on the boot path" smell should be re-checked if
  `loadTrajectory` or `loadVipsPages` ever drops its own limits.
