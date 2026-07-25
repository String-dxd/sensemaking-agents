# Plan 046: Finish the Asia/Singapore date migration — calendar cells, engine write-side stamps, and the seed anchor

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/lib/entry-date.ts src/components/student-space/sheets/CalendarPane.tsx src/engine/student-space/Game/State/ src/engine/student-space/Game/Data/calendarSeed.js src/lib/student-space/onboarding-skip.ts src/db/seed.ts scripts/ablate.ts test/lib/entry-date.test.ts test/db/seed-date-shift.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the calendar grid, three engine write paths, and the demo seed anchor)
- **Depends on**: none — but land **after** plans/043 if both are queued (043 pins a non-SGT `TZ` in `vitest.config.ts`, which makes this plan's timezone tests meaningful)
- **Category**: bug
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Commit `031d1974` moved the **read** side to Asia/Singapore day bucketing via
`src/lib/entry-date.ts`. Three write/derive sites were left on the device clock:

1. **The calendar grid shifts on eastern devices.** `CalendarPane` builds cells as
   device-local `Date`s then keys them with `sgDateKey()`. East of UTC+8 (Tokyo,
   Sydney, Auckland) local midnight of day D is still D−1 in Singapore, so the
   cell that renders "15" carries the key `…-14`: the grid is off by one, "today"
   never highlights, and clicking the 15th selects the 14th.
2. **New captures get a device-local `entryDate`**, so a capture's day bucket can
   disagree with the SGT day the read side files it under — the entry lands on the
   wrong calendar cell and its sprout/mood-pin dates disagree with it.
3. **The demo seed anchor is wrong every morning.** `shiftCorpusDates` computes its
   whole-day delta from `Date.UTC(...)` midnights, so between 00:00 and 08:00 SGT
   the "newest demo entry is *yesterday*" invariant lands it **two SGT days back**
   and yesterday's calendar cell is empty. Morning demos hit this every time.

After this plan there is exactly one definition of "which day is this" per runtime
(TS: `src/lib/entry-date.ts`; engine: a hand-mirrored constants module kept honest
by a parity test), and nothing derives a day from the device clock.

## Current state

### The canonical read-side helper

`src/lib/entry-date.ts` (whole file). `SG_DATE` pins
`timeZone: 'Asia/Singapore'` explicitly, so these two functions are already
device-timezone-independent:

```ts
const SG_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
})
/** YYYY-MM-DD in Asia/Singapore, or null when `value` is missing/invalid. */
export function sgDateKey(value: string | Date | undefined | null): string | null
/** Today's YYYY-MM-DD in Asia/Singapore. */
export function sgToday(): string
```

### Part (a) — `CalendarPane`

`src/components/student-space/sheets/CalendarPane.tsx`. Cell construction
(lines 45–51, verbatim) — every `new Date(year, month0, …)` is **device-local**:

```tsx
function buildMonthCells(year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1)
  const startOffset = first.getDay()
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month0, 1 + (i - startOffset)))
  return cells
}
```

`buildWeekCells(anchor)` (lines 53–63) does the same with `setDate`. Each cell is
then keyed in SGT while its label renders from the same local `Date` — two clocks
for one cell: line 269 is `const cellYmd = sgDateKey(cell) ?? ''` and line 305
renders `{cell.getDate()}`; line 270 is
`const isOutside = viewMode === 'month' && cell.getMonth() !== viewMonth`.

Other device-clock reads in the file: `const now = new Date()` (line 152) feeds
the initial anchor (line 153, via `parseYmdToDate`), the "Today" button
(line 233) and the month arm of `isCurrentView` (line 209:
`viewYear === now.getFullYear() && viewMonth === now.getMonth()`).
`parseYmdToDate` (lines 440–449) turns a key back into a **local** `Date`.
`dayLabel` (lines 37–43) formats a cell with
`toLocaleDateString(undefined, { weekday, month, day, year })` — no `timeZone`,
so the device zone. `formatWeekRange` (lines 80–93) and
`skeletonChipCount(cell.getDate())` (line 309) also read the local `Date`.

### Part (b) — engine write sites

The engine is **vanilla JS and must not import `src/lib` TypeScript**. The repo's
sanctioned mechanism for sharing pure date logic is a hand-mirrored constants
module plus a parity test — read **both** halves before writing the new one:
`src/lib/year-buckets.ts:1-16` (its header names the mirror and the parity test)
and `src/engine/student-space/Game/year-buckets.constants.js:1-18` (its header
carries the rule *"Do NOT import this from React/TS code … Do NOT import the TS
file from engine code"*). Copy that comment shape.

Three identical device-local stamps — `Captures.js:84-85`, `MoodPins.js:38-39`,
`Sprouts.js:582-583` (verbatim, from `Captures.js`):

```js
        const now = new Date()
        const entryDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
```

Two more of the same class:

- `src/engine/student-space/Game/Data/calendarSeed.js:10-15` — `dateOffset(n)`
  does `const d = new Date(); d.setDate(d.getDate() + n)` then the same template
  string.
- `src/lib/student-space/onboarding-skip.ts:38-43` (TypeScript, so it can import
  `~/lib/entry-date` directly) — `const today = new Date(); today.setHours(12,0,0,0)`
  then per-pin `day.setDate(...)` and the same template string.

### Part (c) — the seed anchor

`src/db/seed.ts:144-152`, verbatim:

```ts
  const anchorUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const yesterdayUtcMidnight = anchorUtcMidnight - MS_PER_DAY
  const maxUtcMidnight = Date.UTC(
    new Date(maxCreatedAtMs).getUTCFullYear(),
    new Date(maxCreatedAtMs).getUTCMonth(),
    new Date(maxCreatedAtMs).getUTCDate(),
  )
  const deltaDays = Math.round((yesterdayUtcMidnight - maxUtcMidnight) / MS_PER_DAY)
  const deltaMs = deltaDays * MS_PER_DAY
```

Fixture fact (`test/ablation/fixtures/seed-multistudent.json`): demo-a's newest
`created_at` is `2026-07-27T08:00:00Z` (= 16:00 SGT on 2026-07-27).

Worked example with `now = 2026-07-22T17:00:00Z` (= **01:00 SGT on 2026-07-23**):

| | day of `now` | "yesterday" | delta | shifted newest | SGT day of it |
|---|---|---|---|---|---|
| today | 2026-07-22 (UTC) | 07-21 | −6 | `2026-07-21T08:00:00Z` | **07-21** (two SGT days back) |
| after | 2026-07-23 (SGT) | 07-22 | −5 | `2026-07-22T08:00:00Z` | **07-22** ✅ |

At `now = 2026-07-23T10:00:00Z` (18:00 SGT) both give −5, which is why the
existing test passes today —
`test/db/seed-date-shift.test.ts:33-41` (with `const NOW = new Date('2026-07-23T10:00:00Z')`
on line 20) asserts `expect(maxCreatedAt?.slice(0, 10)).toBe('2026-07-22')`.

Absolute dates reach agent prompts — `src/agents/context/index.ts:288`:

```ts
    return `- [#${row.id}, score=${row.score.toFixed(3)}, ${row.created_at}]: ${excerpt}`
```

so ablation inputs drift day to day unless the harness reads the corpus
unshifted. `scripts/ablate.ts` calls bare `loadSeedCorpus()` at lines 87 and 110.

### Repo conventions

pnpm only; `pnpm check` = Biome + `tsc --noEmit` (scoped to `src` + `test`);
Vitest tests in `test/` mirroring `src/`; React tests use Testing Library +
happy-dom; conventional commits (e.g.
`fix(history): bucket entry dates in Asia/Singapore, not UTC`). The engine
(`src/engine/student-space/`) is canonical, edited in place, and stays vanilla JS
with brace-on-next-line style — match each file's surroundings. Baseline:
`pnpm check` exits 0 with 18 pre-existing lint warnings; `pnpm test` = 911
passed / 128 skipped / 0 failed.

## Commands you will need

| Purpose        | Command                                                                       | Expected on success                  |
|----------------|-------------------------------------------------------------------------------|--------------------------------------|
| Install        | `pnpm install`                                                                | exit 0                               |
| Check          | `pnpm check`                                                                  | exit 0 (18 pre-existing warnings OK) |
| All tests      | `pnpm test`                                                                   | ≥911 passed, 0 failed                |
| Day-key tests  | `pnpm vitest run test/lib/entry-date.test.ts`                                  | all pass                             |
| Calendar tests | `pnpm vitest run test/components/student-space/sheets/calendar-pane.test.tsx`   | all pass                             |
| History tests  | `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx`   | all pass (unchanged)                 |
| Seed tests     | `pnpm vitest run test/db/seed-date-shift.test.ts`                               | all pass                             |
| Eastern TZ     | `TZ=Pacific/Auckland pnpm test`                                                | 0 failed                             |
| SGT run        | `TZ=Asia/Singapore pnpm test`                                                  | 0 failed                             |

## Scope

**In scope** (the only files you should modify/create):

- `src/lib/entry-date.ts` — add day-key arithmetic helpers
- `src/engine/student-space/Game/entry-date.constants.js` (create) — engine mirror
- `src/components/student-space/sheets/CalendarPane.tsx`
- `src/engine/student-space/Game/State/Captures.js`, `MoodPins.js`, `Sprouts.js`
- `src/engine/student-space/Game/Data/calendarSeed.js`
- `src/lib/student-space/onboarding-skip.ts`
- `src/db/seed.ts` — `shiftCorpusDates` only
- `scripts/ablate.ts` — the two `loadSeedCorpus()` calls (lines 87, 110)
- `test/lib/entry-date.test.ts`, `test/db/seed-date-shift.test.ts` — extend
- `test/components/student-space/sheets/calendar-pane.test.tsx` (create)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/year-buckets.ts` + its engine mirror — already an SGT, parity-tested
  pair. Read them as the convention; change nothing.
- `DayDetailCard.tsx` / `HistorySheet.tsx` — the read side landed in `031d1974`.
- **Any data migration for already-persisted `entryDate` values.** Local
  `ss:v1:*` entries keep whatever day string they were stamped with. Accepted
  one-off: the population is a handful of demo/dev students, values are at worst
  one day off, and a migration would need per-entry original timestamps we do not
  reliably have. Do **not** write one.
- `scripts/managed-agents/smoke-*.ts` and `cartographer-rubric-batch.ts` — they
  also call `loadSeedCorpus()`, but they seed a live DB for smoke runs where
  "recent" dates are the point. Leave them shifted.
- `scripts/ablate.ts:361` (`await seed()`) — that populates the DB so
  `search_past_mirrors` has rows; leaving it shifted is intentional.
- `src/engine/student-space/Game/State/schema.js` — `entryDate` is already in the
  allow-lists; no new fields here.
- `vitest.config.ts` — plans/043 owns the `TZ` pin.

**File conflict**: plan 057 also edits `CalendarPane.tsx`. **046 lands first.**

## Git workflow

- Branch: `advisor/046-finish-sgt-migration`
- One commit per step. Conventional commits, e.g.
  `fix(calendar): build month cells from Asia/Singapore day keys`,
  `fix(engine): stamp entryDate in Asia/Singapore`,
  `fix(seed): compute the demo date shift from SGT day keys`
- Do NOT push or open a PR unless the operator instructed it.

## Non-regression argument (state this in the PR)

- **For a device already on Asia/Singapore, behaviour is byte-identical.** Every
  change swaps a device-local day computation for an SGT one; when the device *is*
  SGT they agree by definition.
- **Speed is unaffected or better.** The new helpers do integer arithmetic on
  `Date.UTC` values plus string padding — cheaper than constructing 42 `Date`
  objects per render, which is what `buildMonthCells` does today. `sgToday()`
  remains one `Intl.DateTimeFormat.format` call per render.
- **Cell identity and focus are preserved**: the `Toggle` `key`/`value` stay the
  SGT day key string (exactly what they are today at lines 281–282), so Base UI's
  `ToggleGroup` sees the same value space and `selectedDate` round-trips. Keep the
  PR #33 invariant named in the component's own doc comment: selection swaps the
  `data-selected` Tailwind variant, **not** a grid re-render — do not add state or
  effects that would break that.
- **No new dependency and no new abstraction layer**: one existing helper module
  is extended and mirrored once for the engine using the mechanism the repo
  already uses for `year-buckets`.

## Steps

### Step 1: Add SGT day-key arithmetic to `src/lib/entry-date.ts`

Append four pure helpers. Design constraint: a day key is manipulated as a **UTC
midnight instant** (`Date.UTC(y, m0, d)`) — calendar arithmetic on a fixed-offset
zone is identical to UTC calendar arithmetic, and Singapore has no DST. Nothing
here touches the device clock except `sgToday()`.

```ts
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface SgDayKeyParts {
  year: number
  /** 0-indexed, matching Date.prototype.getMonth(). */
  month0: number
  day: number
  /** 0 = Sunday, matching Date.prototype.getDay(). */
  weekday: number
}

/**
 * Split a YYYY-MM-DD day key into parts without consulting the device clock.
 * Use this instead of `new Date(y, m, d)` anywhere a day key must be rendered:
 * rebuilding a local Date from a key re-introduces the device timezone and makes
 * the label disagree with the key.
 */
export function sgDayKeyParts(dayKey: string | null | undefined): SgDayKeyParts | null
/** Day key `days` after `dayKey` (negative moves back). Null on bad input. */
export function addSgDays(dayKey: string, days: number): string | null
/** The 7 day keys (Sunday → Saturday) of the week containing `dayKey`. */
export function sgWeekKeys(dayKey: string): string[]
/**
 * The 42 day keys of the 6×7 month grid for `year`/`month0`, starting on the
 * Sunday at or before the 1st. Leading/trailing keys belong to adjacent months.
 */
export function sgMonthGridKeys(year: number, month0: number): string[]
```

Implementation requirements:

- `sgDayKeyParts` parses with `DAY_KEY_RE`, builds `new Date(Date.UTC(y, m0, d))`,
  and **rejects impossible dates** by round-tripping (`2026-02-30` normalises to
  March, so return `null`). `weekday` comes from `getUTCDay()`.
- A private `toDayKey(year, month0, day)` formats via
  `new Date(Date.UTC(year, month0, day))` + `getUTCFullYear/getUTCMonth/getUTCDate`
  with `padStart(2, '0')`. It relies on `Date.UTC` overflow normalisation (day 0 →
  last day of previous month), exactly as the current
  `new Date(year, month0, 1 + (i - startOffset))` relies on the local equivalent.
- `sgWeekKeys` = `toDayKey(y, m0, day - weekday + i)` for `i` in 0..6.
- `sgMonthGridKeys` = `startOffset = new Date(Date.UTC(year, month0, 1)).getUTCDay()`
  then `toDayKey(year, month0, 1 + (i - startOffset))` for `i` in 0..41.

Also add one line to the module header: these helpers are mirrored for the engine
substrate in `src/engine/student-space/Game/entry-date.constants.js` and kept in
sync by `test/lib/entry-date.test.ts` (same wording pattern as
`src/lib/year-buckets.ts:9-13`).

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/lib/entry-date.test.ts` → the existing 6 tests
still pass.

### Step 2: Cover the new helpers with tests

Extend `test/lib/entry-date.test.ts` (leave existing blocks untouched):

- `sgDayKeyParts`: `'2026-03-01'` → `{ year: 2026, month0: 2, day: 1, weekday: 0 }`
  (it is a Sunday); `'not-a-date'`, `''`, `null`, `'2026-02-30'` → `null`.
- `addSgDays`: `('2026-03-01', -1)` → `'2026-02-28'`; `('2026-12-31', 1)` →
  `'2027-01-01'`; `('2026-01-31', 1)` → `'2026-02-01'`; `('bad', 1)` → `null`.
- `sgWeekKeys('2026-03-18')` → `2026-03-15` … `2026-03-21`.
- `sgMonthGridKeys(2026, 2)` (March 2026, whose 1st **is** a Sunday) → length 42,
  `[0] === '2026-03-01'`, `[41] === '2026-04-11'`, includes `'2026-03-31'`.
- `sgMonthGridKeys(2026, 6)` (July 2026, 1st is a Wednesday → offset 3) →
  `[0] === '2026-06-28'`, includes `'2026-07-01'`.
- **Device-independence guard**: a `describe` that sets
  `process.env.TZ = 'Pacific/Auckland'` in `beforeEach` (restoring in `afterEach`)
  and asserts one `sgMonthGridKeys` + one `sgWeekKeys` output is unchanged.
  Comment it: Auckland (UTC+12) is the zone where the old local-`Date` grid
  shifted a day.

**Verify**: `pnpm vitest run test/lib/entry-date.test.ts` → all pass.

### Step 3: Create the engine mirror and its parity test

Create `src/engine/student-space/Game/entry-date.constants.js` mirroring **only**
`sgDateKey` and `sgToday` (the engine needs "what day is it in Singapore",
nothing more). Copy the header-comment shape from
`year-buckets.constants.js:1-18` — including the "Do NOT import this from
React/TS code / Do NOT import the TS file from engine code" rule — state that
`src/lib/entry-date.ts` is the semantic source of truth and that
`test/lib/entry-date.test.ts` fails on drift, and match the engine's
brace-on-next-line style. The body is the same `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', … })`
formatter plus the two functions, written as plain ES module exports.

Then add a parity `describe` to `test/lib/entry-date.test.ts`, modelled on
`test/lib/year-buckets.test.ts:1-18` (which imports both implementations with
aliased names, e.g. `sgDateKey as engineSgDateKey` from
`~/engine/student-space/Game/entry-date.constants.js` — match however that file
handles the JS import, including whether it needs `@ts-expect-error`). Assert
across boundary instants that the two agree:
`'2026-07-19T15:59:00Z'`, `'2026-07-19T16:00:00Z'`, `'2026-07-19T23:00:00Z'`,
`'2026-12-31T15:59:59Z'`, `'2026-12-31T16:00:00Z'`, `'2026-03-09T23:45:00Z'`,
`'2026-01-01T00:00:00Z'`; plus `'not-a-date'` (both `null`) and
`engineSgToday() === sgToday()`.

**Verify**: `pnpm vitest run test/lib/entry-date.test.ts` → all pass including the
parity block.
**Verify**: `pnpm check` → exit 0 (the engine JS is linted; match the
neighbouring file's style if Biome complains).

### Step 4: Switch the three engine `entryDate` stamps

In `Captures.js` (line 85), `MoodPins.js` (line 39) and `Sprouts.js` (line 583),
add `import { sgDateKey } from '../entry-date.constants.js'` beside each file's
existing imports (confirm the relative path from each file's own location) and
replace the template-string expression:

```js
        const now = new Date()
        // Asia/Singapore day bucketing — the read side (src/lib/entry-date.ts)
        // files entries by SGT day, so the write side must stamp the same day.
        const entryDate = sgDateKey(now)
```

Leave `createdAt: now.toISOString()` exactly as it is — the instant was already
correct; only the day bucket was wrong.

**Verify**: `grep -rn 'getFullYear()' src/engine/student-space/Game/State/Captures.js src/engine/student-space/Game/State/MoodPins.js src/engine/student-space/Game/State/Sprouts.js`
→ no matches.
**Verify**: `pnpm vitest run test/engine/Sprouts.integration.test.ts test/engine/Sprouts.test.ts`
→ all pass (they construct real `Captures`/`MoodPins`/`Sprouts` instances).

### Step 5: Fix `calendarSeed.js` and `onboarding-skip.ts`

`src/engine/student-space/Game/Data/calendarSeed.js` — offset in instant space
and read the SGT day (SGT has no DST, so ±24 h steps are exact):

```js
import { sgDateKey } from '../entry-date.constants.js'

const MS_PER_DAY = 86_400_000

const dateOffset = (n) => sgDateKey(new Date(Date.now() + n * MS_PER_DAY))
```

`src/lib/student-space/onboarding-skip.ts` — TypeScript, so import the canonical
helpers (`import { addSgDays, sgToday } from '~/lib/entry-date'`) and derive both
the key and the timestamp from SGT. Delete `const today = new Date()`,
`today.setHours(12, 0, 0, 0)` and the per-iteration `day` Date:

```ts
  const todayKey = sgToday()
  const pins: SeedPin[] = DEMO_MOOD_EMOTIONS.map((emotion, offset) => {
    const entryDate =
      addSgDays(todayKey, -(DEMO_MOOD_EMOTIONS.length - 1 - offset)) ?? todayKey
    // Noon SGT so the instant is unambiguously inside the day it is keyed to.
    const createdAt = new Date(`${entryDate}T12:00:00+08:00`).toISOString()
    return { id: `demo-mood-${entryDate}`, createdAt, entryDate, /* …unchanged… */ }
  })
```

**Verify**: `pnpm check` → exit 0 (no unused-variable warnings introduced).
**Verify**: `grep -rn 'getFullYear()' src/lib/student-space/onboarding-skip.ts src/engine/student-space/Game/Data/calendarSeed.js`
→ no matches.

### Step 6: Rebuild `CalendarPane` cells as SGT day keys

The rule: **cell identity is a `string` day key end to end** — no `Date` is ever
constructed from `(year, month, day)` again, and the rendered day number comes
from the same key that becomes the `Toggle` `value`.

1. Import `addSgDays, sgDayKeyParts, sgMonthGridKeys, sgToday, sgWeekKeys` from
   `~/lib/entry-date`; drop `sgDateKey` (now unused).
2. Delete `buildMonthCells`, `buildWeekCells` (lines 45–63) and `parseYmdToDate`
   (lines 440–449); delete `const now = new Date()` (line 152).
3. `dayLabel` takes a day key and formats through a UTC-anchored `Date` so the
   label can never disagree with the key:

```tsx
const dayLabel = (dayKey: string): string => {
  const parts = sgDayKeyParts(dayKey)
  if (!parts) return dayKey
  return new Date(Date.UTC(parts.year, parts.month0, parts.day)).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}
```

   **This must not change the produced string.**
   `test/components/student-space/sheets/history-sheet.test.tsx:236` and `:244`
   assert the exact accessible names `'Friday, 3 April 2026'` and
   `'Wednesday, 15 April 2026'`. Locale stays `undefined` and the components are
   the same, so the output is identical — confirmed by this step's Verify.
4. `formatWeekRange` accepts `string[]`, reading month/day/year via
   `sgDayKeyParts`. Keep the three output formats (same-month / same-year /
   cross-year) byte-identical to lines 86–92.
5. Anchor state becomes a key:

```tsx
const [anchorKey, setAnchorKey] = useState<string>(() =>
  sgDayKeyParts(selectedDate) ? (selectedDate as string) : sgToday(),
)
useEffect(() => {
  if (selectedDate && sgDayKeyParts(selectedDate)) setAnchorKey(selectedDate)
}, [selectedDate])

const todayYmd = sgToday()
const anchorParts = sgDayKeyParts(anchorKey) ?? sgDayKeyParts(todayYmd)!
const viewYear = anchorParts.year
const viewMonth = anchorParts.month0

const cells = useMemo(
  () => (viewMode === 'week' ? sgWeekKeys(anchorKey) : sgMonthGridKeys(viewYear, viewMonth)),
  [viewMode, anchorKey, viewYear, viewMonth],
)
```

6. `stepView`: week → `setAnchorKey((c) => addSgDays(c, delta * 7) ?? c)`; month →
   compute `new Date(Date.UTC(viewYear, viewMonth + delta, 1))` and set
   `` `${y}-${mm}-01` ``. Comment it: month steps anchor to the 1st because
   stepping from the 31st with a local `Date` used to overflow (Jan 31 + 1 month →
   Mar 3); month view only reads year/month, so the day is not otherwise
   observable.
7. `isCurrentView`: week → `cells.includes(todayYmd)`; month → compare
   `viewYear`/`viewMonth` against `sgDayKeyParts(todayYmd)`. "Today" button →
   `setAnchorKey(todayYmd)`.
8. The cell map iterates `cellYmd: string`: `const cellParts = sgDayKeyParts(cellYmd)`;
   `isOutside = viewMode === 'month' && cellParts?.month0 !== viewMonth`;
   `aria-label={dayLabel(cellYmd)}`; day number `{cellParts?.day}`;
   `skeletonChipCount(cellParts?.day ?? 1)`. **Keep `key={cellYmd}` and
   `value={cellYmd}` exactly as they are** (lines 281–282).

Everything else (chip building, `DayChip`, `SkeletonChip`, `CalendarLegend`,
`eventDate`, class names, `ToggleGroup` wiring) stays untouched.

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx`
→ all pass **unchanged** (the real proof that labels and click-through did not
shift).
**Verify**: `grep -n 'new Date(' src/components/student-space/sheets/CalendarPane.tsx`
→ only the two `Date.UTC(...)` forms; no `new Date(year, month…)` and no bare
`new Date()`.

### Step 7: Add the CalendarPane regression test

Create `test/components/student-space/sheets/calendar-pane.test.tsx`. Model the
harness on `test/components/student-space/sheets/settings-sheet.test.tsx`
(Testing Library + `userEvent`; happy-dom is the default environment) — but
`CalendarPane` needs no router or engine context, just props (`engineState`,
`selectedDate`, `onSelectDate`, `viewMode`).

Override the device zone for the whole file, because the bug only appears east of
UTC+8:

```tsx
const ORIGINAL_TZ = process.env.TZ
// Auckland is UTC+12: local midnight of day D is still D−1 in Singapore. Under
// the old device-local cell construction the grid shifted a day here, so labels,
// aria-current, and click payloads all disagreed with the keys.
beforeEach(() => { process.env.TZ = 'Pacific/Auckland' })
afterEach(() => { process.env.TZ = ORIGINAL_TZ })
```

Cases (March 2026's 1st is a Sunday, so its grid starts exactly at `2026-03-01`;
`2026-03-15` is a Sunday and `2026-03-21` a Saturday):

1. **Month view: clicking a labelled day emits that day's key** — with
   `selectedDate="2026-03-15"` and `viewMode="month"`, click the cell whose
   accessible name matches `/15 March 2026|March 15, 2026/` (regex covers either
   locale ordering) and assert `onSelectDate` was called once with `'2026-03-15'`.
   **This is the regression test.**
2. **42 cells, expected edges** — cells for `1 March 2026` and `11 April 2026`
   both exist.
3. **`aria-current="date"` sits on the SGT today** — render with
   `selectedDate={sgToday()}` (import `sgToday` from `~/lib/entry-date`; sharing
   the production helper with the test is this suite's DRY rule) and assert
   exactly one element carries `aria-current="date"` with that day's label.
4. **Week view** — `viewMode="week"`, `selectedDate="2026-03-18"`: 7 cells;
   clicking the `21 March 2026` cell calls `onSelectDate('2026-03-21')`.
5. **Chips land on the SGT day** — pass
   `engineState={{ captures: { entries: [{ entryDate: '2026-03-15', kind: 'ask', title: 'Chip on the fifteenth' }] } }}`
   and assert the text is `within` the 15 March 2026 cell.

**Verify**: `pnpm vitest run test/components/student-space/sheets/calendar-pane.test.tsx`
→ all 5 pass.

### Step 8: Fix the seed anchor and re-pin its test

In `src/db/seed.ts`, import `sgDateKey` from `~/lib/entry-date` and replace lines
144–151 with SGT-midnight arithmetic:

```ts
  // SGT midnights, not UTC midnights: between 00:00 and 08:00 SGT the UTC date is
  // still yesterday, so a UTC-anchored delta landed the newest demo entry two SGT
  // days back and left yesterday's calendar cell empty — a morning-demo footgun.
  // The calendar reads days in Asia/Singapore (src/lib/entry-date.ts), so the
  // anchor must too.
  const sgMidnightMs = (value: Date): number => Date.parse(`${sgDateKey(value)}T00:00:00+08:00`)
  const anchorSgMidnight = sgMidnightMs(now)
  const yesterdaySgMidnight = anchorSgMidnight - MS_PER_DAY
  const maxSgMidnight = sgMidnightMs(new Date(maxCreatedAtMs))
  const deltaDays = Math.round((yesterdaySgMidnight - maxSgMidnight) / MS_PER_DAY)
  const deltaMs = deltaDays * MS_PER_DAY
```

Everything else in `shiftCorpusDates` (demo-a reference selection, `shiftIso`,
returned shape) stays untouched.

In `test/db/seed-date-shift.test.ts`:

1. Re-pin the first test to SGT: rename it to
   `'lands the shifted demo-a max created_at on "yesterday" (Asia/Singapore day)'`,
   import `sgDateKey` from `~/lib/entry-date`, and replace
   `expect(maxCreatedAt?.slice(0, 10)).toBe('2026-07-22')` with
   `expect(sgDateKey(maxCreatedAt)).toBe('2026-07-22')`. Update the file header
   (line 8 says "(UTC date)") to say Asia/Singapore.
2. Add the morning-window regression case with
   `const NOW_EARLY_SGT_MORNING = new Date('2026-07-22T17:00:00Z')` (= 01:00 SGT
   on 2026-07-23), asserting `sgDateKey(maxCreatedAt) === '2026-07-22'` and
   commenting that the old UTC anchor gave `2026-07-21`.
3. Add a device-timezone guard: one case that sets `process.env.TZ` to
   `'Pacific/Auckland'` (restoring afterwards) and asserts the delta for `NOW` is
   unchanged — the anchor must depend on the *instant*, never on the runner zone.

The other six tests must pass **unchanged**.

**Verify**: `pnpm vitest run test/db/seed-date-shift.test.ts` → all 9 pass.

### Step 9: Make ablation inputs date-stable

In `scripts/ablate.ts`, change both corpus reads (lines 87 and 110) to
`loadSeedCorpus({ shiftDates: false })`, with a comment at the line-110 site:
absolute `created_at` values reach agent prompts
(`src/agents/context/index.ts:288`), so ablation inputs must be byte-stable
across days; the DB seed in `main()` stays shifted because it only feeds
`search_past_mirrors`. Do **not** change `await seed()` at line 361.

**Verify**: `grep -c 'shiftDates: false' scripts/ablate.ts` → 2.
**Verify**: `pnpm check` → exit 0.

### Step 10: Full gate, in three timezones

**Verify**: `pnpm check` → exit 0 (warning count still 18).
**Verify**: `pnpm test` → ≥911 passed, 0 failed, 128 skipped.
**Verify**: `TZ=Pacific/Auckland pnpm test` → 0 failed.
**Verify**: `TZ=Asia/Singapore pnpm test` → 0 failed.

(If plans/043 has landed, `vitest.config.ts` pins `TZ` and the shell overrides may
be ignored — that is fine; the per-test `process.env.TZ` overrides still exercise
both zones. Note in the PR which runs actually varied.)

## Test plan

- `test/lib/entry-date.test.ts` (extend): `sgDayKeyParts` (valid / invalid /
  impossible), `addSgDays` (month, year, leap boundaries, bad input),
  `sgWeekKeys`, `sgMonthGridKeys` (offset-0 and offset-3 months), a
  `Pacific/Auckland` device-independence block, and the **engine parity table**
  (7 boundary instants + invalid + `sgToday`), modelled on
  `test/lib/year-buckets.test.ts`.
- `test/components/student-space/sheets/calendar-pane.test.tsx` (create): the 5
  cases in Step 7, all under `TZ=Pacific/Auckland`; case 1 is the regression test.
- `test/db/seed-date-shift.test.ts`: first test re-pinned to `sgDateKey`, plus the
  01:00-SGT morning case and a device-timezone guard.
- Must stay green unchanged:
  `test/components/student-space/sheets/history-sheet.test.tsx` (asserts the exact
  calendar accessible names and the day-cell click path),
  `test/engine/Sprouts.integration.test.ts`, `test/engine/Sprouts.test.ts`.
- Verification: `pnpm test` → 0 failures; ~16 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with 0 failures; skip count still 128
- [ ] `TZ=Pacific/Auckland pnpm test` exits 0 with 0 failures
- [ ] `grep -rn "getMonth() + 1).padStart" src/engine/ src/lib/ src/components/` → no matches
- [ ] `grep -n 'new Date(' src/components/student-space/sheets/CalendarPane.tsx` → only `Date.UTC(...)` forms
- [ ] `grep -rn 'buildMonthCells\|buildWeekCells\|parseYmdToDate' src/` → no matches
- [ ] `grep -rln 'entry-date.constants' src/engine/` → 5 files (the module + its 4 importers)
- [ ] `grep -rn 'entry-date.constants' src/components src/lib src/db src/server` → no matches
- [ ] `grep -c 'shiftDates: false' scripts/ablate.ts` → 2
- [ ] `grep -n 'anchorUtcMidnight' src/db/seed.ts` → no match
- [ ] `git status` shows only the 13 in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code — in particular if
  `CalendarPane.tsx` already builds cells from day keys, or `shiftCorpusDates`
  already uses SGT.
- `history-sheet.test.tsx` fails after Step 6 with an accessible-name mismatch
  (e.g. it now expects `'Friday, April 3, 2026'`). This plan asserts the
  `dayLabel` rewrite does not change locale formatting — report the exact
  before/after strings rather than editing that test.
- More than one test file outside the in-scope list fails after any step.
- The `Toggle`/`ToggleGroup` value round-trip breaks (clicking a cell no longer
  calls `onSelectDate`) — report rather than adding state.
- `grep -rn 'entryDate' src/engine/` reveals a **fourth** engine site stamping
  from the device clock that this plan did not list.
- Setting `process.env.TZ` inside a test does not affect `new Date()`'s local
  behaviour. It was verified working at plan time (Node 26:
  `process.env.TZ='America/New_York'; new Date(2026,2,15).toISOString()` →
  `2026-03-15T04:00:00.000Z`, then `'Pacific/Auckland'` → `2026-03-14T11:00:00.000Z`
  — which is also the bug: Auckland local midnight of Mar 15 is 19:00 SGT on
  Mar 14). If it stops working, report — the alternative (a separate vitest
  project with a different `TZ`) is a config change plans/043 owns.
- Any DB schema work or `pnpm db:migrate` seems necessary. It is not.

## Maintenance notes

- **The parity test is the contract.** `src/lib/entry-date.ts` is the semantic
  source of truth; the engine module is a hand-mirror. Editing one without the
  other fails `test/lib/entry-date.test.ts` — same rule as the existing
  `year-buckets` pair.
- Reviewer should scrutinise, in order: (1) no `new Date(y, m, d)` survives in
  `CalendarPane.tsx` — that single pattern is the whole bug; (2) the `Toggle`
  `key`/`value` are still the day key, preserving the PR #33 no-re-render
  selection invariant; (3) `dayLabel`'s output string is unchanged (the
  history-sheet test is the tripwire); (4) no `createdAt` value was touched —
  only day *buckets*; (5) the engine files kept their brace style and import no
  TypeScript.
- **Accepted one-off, deliberately documented**: already-persisted local
  `entryDate` values keep their stored value. No migration. An old capture
  appearing on the "wrong" day after this lands is pre-existing data, not a new
  bug.
- Month-step behaviour changed subtly: it now anchors to the 1st, fixing a latent
  local-`Date` overflow (Jan 31 + 1 month → Mar 3). A future "keep the
  day-of-month across month steps" design needs an explicit clamp, not `setMonth`.
- **File conflict**: plan 057 also edits `CalendarPane.tsx`. 046 lands first.
- Follow-ups out of scope: a lint rule banning device-clock day derivation in
  `src/`, and per-student `ss:v1:` key prefixing (see plan 045's notes).
