# Plan 036: Bucket all calendar dates in Singapore time via one shared helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/lib/student-space/backend-snapshot.ts src/lib/student-space/demo-shell-data.server.ts src/components/student-space/sheets/MirrorDetailSheet.tsx src/components/student-space/sheets/DayDetailCard.tsx src/components/student-space/sheets/HistorySheet.tsx src/components/student-space/sheets/CalendarPane.tsx src/lib/counsellor-brief-renderer.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none (see maintenance notes for interactions with 034/035)
- **Category**: bug
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

SenseMake is a Singapore school product (UTC+8), but every server-side
mapper buckets timestamps into calendar days with
`date.toISOString().slice(0, 10)` — the **UTC** date. Anything a student
captures between 00:00 and 08:00 Singapore time files onto the *previous*
calendar day in the History sheet, while the client computes "today" in
local time, so the two disagree about what day it is. Seed data already
trips this (e.g. a `23:45:00Z` reflection renders one day early). After this
plan, one shared helper anchors every day-bucketing decision to
`Asia/Singapore`, and the product decision "the calendar is Singapore-time"
is written down where the next contributor will find it.

## Current state

Three copies of the same UTC bucketing function, one UTC "today", and two
local-time "today" builders:

- `src/lib/student-space/backend-snapshot.ts:438-442` — the main mapper;
  its `toEntryDate` feeds `entryDate` for reflections, timeline rows, and
  moods (call sites at lines 293, 334, 383):

  ```ts
  function toEntryDate(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '1970-01-01'
    return date.toISOString().slice(0, 10)
  }
  ```

- `src/lib/student-space/demo-shell-data.server.ts:155-159` — identical
  logic, fallback `'1970-01-01'`.
- `src/components/student-space/sheets/MirrorDetailSheet.tsx:372-377` —
  same UTC slice, but fallback `''` and an `undefined`-tolerant signature:

  ```ts
  function toEntryDate(iso: string | undefined): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }
  ```

- `src/lib/counsellor-brief-renderer.ts:67-68` — the brief header's default
  "today" is the UTC date: `input.today ?? new Date().toISOString().slice(0, 10)`.
  (Tests pin `today` explicitly, per the doc comment at lines 59-64.)
- Client-side "today" is **local time**, disagreeing with all of the above
  when the browser isn't in UTC:
  - `src/components/student-space/sheets/DayDetailCard.tsx:319-321`:

    ```ts
    function ymd(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    ```

    used at line 289 (`const today = ymd(new Date())`) to pick the
    empty-state copy.
  - `src/components/student-space/sheets/HistorySheet.tsx:254-257` — the
    sheet's default selected day, built inline the same way:

    ```ts
    const now = new Date()
    setSelectedDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    )
    ```

Convention pointers: shared non-component helpers live in `src/lib/`
(e.g. `src/lib/counsellor-brief-renderer.ts`, `src/lib/profile-tokens.ts`);
unit tests mirror the path under `test/lib/`
(e.g. `test/lib/student-space/backend-snapshot.test.ts`).

**Product decision this plan encodes** (state it in the helper's doc
comment): the SenseMake calendar is anchored to `Asia/Singapore` regardless
of the viewer's device timezone — a reflection belongs to the school day it
happened on in Singapore.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint + typecheck | `pnpm check` | exit 0 (warnings OK, 0 errors) |
| New helper tests | `pnpm vitest run test/lib/entry-date.test.ts` | all pass |
| Affected mappers | `pnpm vitest run test/lib/student-space/backend-snapshot.test.ts test/lib/counsellor-brief-renderer.test.ts` | all pass |
| Full suite | `pnpm test` | no NEW failures vs baseline (10 pre-existing failures in 5 files are known at `a9e1364e`; plans 033/034 fix them) |

## Scope

**In scope** (the only files you should modify):

- `src/lib/entry-date.ts` — create (the shared helper)
- `test/lib/entry-date.test.ts` — create
- `src/lib/student-space/backend-snapshot.ts`
- `src/lib/student-space/demo-shell-data.server.ts`
- `src/components/student-space/sheets/MirrorDetailSheet.tsx`
- `src/components/student-space/sheets/DayDetailCard.tsx`
- `src/components/student-space/sheets/HistorySheet.tsx`
- `src/components/student-space/sheets/CalendarPane.tsx` — has its OWN
  local-time `ymd` helper (lines 36-37) and computes the calendar's "today"
  ring via `todayYmd = ymd(now)` (line 186); it must move to the shared
  helper too, or the today-marker disagrees with the SGT-selected day in the
  same grid
- `src/lib/counsellor-brief-renderer.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/engine/student-space/**` — the engine's calendar/letters seeds
  (`calendarSeed.js` `dateOffset`, `lettersSeed.js` `isoDaysAgo`) build
  local-time dates in vanilla JS; they are demo scaffolding and the engine
  is deliberately untyped vanilla JS. Leave them.
- `test/ablation/fixtures/seed-multistudent.json` and `src/db/seed.ts` —
  seed dates are plan 035's business.
- Display-time formatting (e.g. `formatTime`, weekday labels) — this plan
  changes day *bucketing* only, not how times are rendered.
- Any DB schema or stored value — `created_at` stays a full timestamp;
  only the derived YYYY-MM-DD keys change.

## Git workflow

- Branch: `advisor/036-singapore-timezone-date-bucketing`
- Conventional commits, e.g. `fix(history): bucket entry dates in Asia/Singapore, not UTC`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared helper `src/lib/entry-date.ts`

```ts
/**
 * Calendar-day bucketing for SenseMake.
 *
 * Product decision: the calendar is anchored to Asia/Singapore (the school
 * timezone), regardless of the viewer's device timezone. A reflection
 * belongs to the school day it happened on in Singapore.
 */
const SG_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD in Asia/Singapore, or null when `value` is missing/invalid. */
export function sgDateKey(value: string | Date | undefined | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return SG_DATE.format(date)
}

/** Today's YYYY-MM-DD in Asia/Singapore. */
export function sgToday(): string {
  return SG_DATE.format(new Date())
}
```

Notes: `en-CA` formats as `YYYY-MM-DD` natively. The formatter is built once
at module scope (Intl construction is expensive; `format` is cheap). Returns
`null` on invalid input so each call site keeps its own fallback.

**Verify**: `pnpm check` → exit 0.

### Step 2: Switch the three `toEntryDate` copies to the helper

- `backend-snapshot.ts` — replace the body of `toEntryDate` (lines 438-442)
  with `return sgDateKey(value) ?? '1970-01-01'` (keep the function so the
  three call sites at 293/334/383 are untouched), importing from
  `~/lib/entry-date`.
- `demo-shell-data.server.ts` — same replacement for its `toEntryDate`
  (lines 155-159), fallback `'1970-01-01'`.
- `MirrorDetailSheet.tsx` — replace its `toEntryDate` body (lines 372-377)
  with `return sgDateKey(iso) ?? ''` (fallback `''`, preserving the
  `undefined`-tolerant behavior).

**Verify**:
`grep -rn "toISOString().slice(0, 10)" src/` → only
`src/lib/counsellor-brief-renderer.ts:68` remains (handled next step).

### Step 3: Align the "today" computations

- `counsellor-brief-renderer.ts:68` → `const today = input.today ?? sgToday()`.
  Update the doc comment at lines 59-64 ("Defaults to today (UTC date
  portion...)") to say Asia/Singapore. Existing tests pin `today` so none
  should change.
- `DayDetailCard.tsx` — replace `ymd(new Date())` at line 289 with
  `sgToday()`; delete the now-unused `ymd` helper (lines 319-321) **only if**
  nothing else in the file calls it (check first — if another call site
  passes a non-now date, convert it with `sgDateKey` instead).
- `HistorySheet.tsx:254-257` — replace the inline local-time template string
  with `setSelectedDate(sgToday())`.
- `CalendarPane.tsx` — its private `ymd` (lines 36-37) is used for the
  "today" marker (`todayYmd = ymd(now)`, line 186) and possibly other day
  keys (grep the file for `ymd(`). Replace now-based calls with `sgToday()`
  and any non-now `ymd(date)` day-key calls with `sgDateKey(date)`; keep
  pure calendar-grid *layout* math (month/weekday arithmetic) as-is — only
  YYYY-MM-DD key construction changes.

**Verify**: `pnpm check` → exit 0, and
`grep -rn "toISOString().slice(0, 10)" src/` → no matches.

### Step 4: Tests

Create `test/lib/entry-date.test.ts` (model on
`test/lib/counsellor-brief-renderer.test.ts` — plain vitest unit tests):

1. `sgDateKey('2026-07-19T23:00:00Z')` → `'2026-07-20'` (the demo-visible
   bug: 7 am next day in Singapore).
2. `sgDateKey('2026-07-19T15:59:00Z')` → `'2026-07-19'` (23:59 SGT, same day).
3. `sgDateKey('2026-07-19T16:00:00Z')` → `'2026-07-20'` (midnight SGT boundary).
4. `sgDateKey('not-a-date')` → `null`; `sgDateKey(undefined)` → `null`;
   `sgDateKey(null)` → `null`.
5. `sgDateKey(new Date('2026-03-09T23:45:00Z'))` → `'2026-03-10'` (Date
   input; a real seed-fixture timestamp that mis-bucketed before).
6. `sgToday()` matches `/^\d{4}-\d{2}-\d{2}$/`.

Then run the existing mapper tests — `backend-snapshot.test.ts`'s *bucketed*
timestamps are at `08:00:00Z` (16:00 SGT, same calendar day in both zones),
so its expectations should pass unchanged. (The file also contains
`2025-11-23T17:15:00Z`, which does cross the SGT boundary — that one is a
teacher-letter `sentAt` passed through verbatim, not bucketed, so it is
unaffected; don't be alarmed when you see it.) If any assertion there fails,
the fixture time crosses the SGT boundary on a bucketed path — update the
expected *date* string, never the helper. Note that `backend-snapshot.test.ts`
asserts nothing about `entryDate` values directly; the SGT behavior itself is
covered only by the new `entry-date.test.ts`.

**Verify**: `pnpm vitest run test/lib/entry-date.test.ts test/lib/student-space/backend-snapshot.test.ts test/lib/counsellor-brief-renderer.test.ts` → all pass.

## Test plan

- New: `test/lib/entry-date.test.ts` — the 6 cases above (boundary times,
  invalid input, Date vs string input, `sgToday` shape).
- Existing coverage exercised: `test/lib/student-space/backend-snapshot.test.ts`
  (entryDate mapping), `test/lib/counsellor-brief-renderer.test.ts` (pinned
  `today` override).
- Verification: commands in Step 4.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/lib/entry-date.test.ts` → all pass
- [ ] `grep -rn "toISOString().slice(0, 10)" src/` → no matches
- [ ] `grep -n "padStart(2, '0')" src/components/student-space/sheets/HistorySheet.tsx src/components/student-space/sheets/DayDetailCard.tsx src/components/student-space/sheets/CalendarPane.tsx` → no matches (every hand-built YYYY-MM-DD key uses that padding idiom; year-label math like `getFullYear()` at HistorySheet.tsx:474/478/531 legitimately remains and is NOT checked by this criterion)
- [ ] `pnpm test` shows no NEW failing files beyond the 5 known-failing at
      `a9e1364e` (`history-sheet`, `trajectory-sheet`, `dev.pipeline`,
      `student-space-host`, `edupass-login`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift — plan
  034 rewrites `history-sheet.test.tsx` and may have landed around the same
  files; re-read before editing).
- `DayDetailCard`'s `ymd` turns out to have call sites beyond line 289 that
  pass *selected-day* dates rather than "now" — converting those blindly
  could double-shift; report instead.
- `CalendarPane.tsx`'s `ymd` turns out to feed day-cell *keys* from raw
  timestamps in a way Step 3's conversion doesn't cleanly cover (mixed keying
  = entries vanish from the grid). If after Step 3 any grid cell key is
  built by a path that still uses device-local time, STOP and report the
  call site rather than patching around it.
- Caution when deleting `DayDetailCard.tsx`'s private `ymd`: `formatLongDate`
  (line 12) has a *parameter* also named `ymd`, so a bare `grep ymd` shows
  false hits — check actual call sites of the helper function, not the name.
- More than 2 assertions in existing tests need date changes (suggests a
  broader keying assumption this plan missed).

## Maintenance notes

- **Interaction with plan 035** (relative seed dates): once both land,
  seeded timestamps near UTC midnight will render one day later than the
  raw UTC date — that is the fix working, not a regression.
- **Interaction with plan 034** (stale-test rewrite): the failing
  `history-sheet.test.tsx` case `renders school events` hardcodes
  `TODAY='2026-05-22'`; when 034 rewrites it, it should compute expected
  day keys via `sgDateKey`/`sgToday` rather than literals where possible.
- Anything that later formats *times* (not days) for display should stay in
  the viewer's locale; only day-bucketing is SGT-pinned. A future
  multi-school deployment outside Singapore would turn the constant into a
  per-tenant setting — the single-helper design makes that a one-file change.
- Reviewer scrutiny: confirm no call site silently changed its fallback
  (`'1970-01-01'` vs `''`), and that `Intl.DateTimeFormat` is constructed
  once, not per call.
