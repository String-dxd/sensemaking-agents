# Plan 057: Memoize the History sheet's derived data so capture mutations don't re-render O(all history)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/components/student-space/sheets/HistorySheet.tsx src/components/student-space/sheets/CalendarPane.tsx src/components/student-space/sheets/DayDetailCard.tsx src/lib/student-space/use-engine-slice-version.ts test/components/student-space/sheets/history-sheet.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — memoization against an engine that mutates entries **in place** can freeze the UI with no error. Read the bold warning below before writing any dependency array.
- **Depends on**: `plans/046-finish-sgt-migration.md` (edits `CalendarPane.tsx`
  first and records the same file conflict) and
  `plans/047-capture-retry-idempotency.md` (edits `DayDetailCard.tsx`'s
  `RetrySyncNotice` and extends `history-sheet.test.tsx`). Land 046 → 047 →
  this, rebasing onto each.
- **Category**: perf
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`HistorySheet` holds three engine-slice subscriptions and the subscription hook
bumps a counter on **every** notification from **any** of them. So any engine
mutation — a mood pin, a capture, a calendar event — re-renders `HistorySheet`
and its entire subtree. Nothing below can bail out, because
`grep -rn "React.memo\|= memo(" src/components` returns **zero** matches across
49 component files.

Inside that subtree, three derivations are recomputed from scratch on every
render, each O(total history): `CalendarPane` rebuilds a whole `Map` of day
chips by looping every capture and every calendar event even though only 42
cells are drawn; `DayDetailCard` runs three unmemoized `.filter()` passes over
the full arrays; and `TimelinePane` re-derives its target date with a
find/filter/sort over all captures. Net effect: one capture re-renders the
Growth tab, the calendar grid, and the day-detail column, each doing
O(total history) work. The calendar gets progressively laggier across a school
year, and it is worst at exactly the wrong moment — right after a capture lands.

This plan is pure speed. Rendered output must be identical.

## Current state

Files and their roles:

- `src/components/student-space/sheets/HistorySheet.tsx` — the sheet; owns the
  three slice subscriptions, `TimelinePane`, and the `GrowthPane` component.
- `src/components/student-space/sheets/CalendarPane.tsx` — the month/week grid.
- `src/components/student-space/sheets/DayDetailCard.tsx` — the selected-day column.
- `src/lib/student-space/use-engine-slice-version.ts` — the subscription hook.
- `src/engine/student-space/Game/State/Captures.js` — the mutating slice.

### The three subscriptions (`HistorySheet.tsx:91-94`)

```ts
  const state = (engine as unknown as { state?: EngineState } | null)?.state
  useEngineSliceVersion(state?.moodPins ?? null)
  useEngineSliceVersion(state?.captures ?? null)
  useEngineSliceVersion(state?.calendar ?? null)
```

The return values are **discarded** today. `src/lib/student-space/use-engine-slice-version.ts:20-27`:

```ts
export function useEngineSliceVersion(slice: EngineSliceSubscribable | null | undefined): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!slice) return
    return slice.subscribe(() => setVersion((v) => v + 1))
  }, [slice])
  return version
}
```

### `chipsByDay` is rebuilt in the render body (`CalendarPane.tsx:152-192`)

`cells` immediately above **is** memoized — the local pattern to follow is right
there:

```ts
  const now = new Date()
  const [anchorDate, setAnchorDate] = useState<Date>(() => parseYmdToDate(selectedDate) ?? now)
  ...
  const cells = useMemo(
    () =>
      viewMode === 'week'
        ? buildWeekCells(anchorDate)
        : buildMonthCells(anchorDate.getFullYear(), anchorDate.getMonth()),
    [viewMode, anchorDate],
  )
  const captures = engineState?.captures?.entries ?? []
  const events = engineState?.calendar?.events ?? []

  // One chip list per day: reflections first (they are the content), teacher
  // events after (they are context). Reflections carry a mood-coloured spine.
  const chipsByDay = new Map<string, DayChipItem[]>()
  const pushChip = (date: string, chip: DayChipItem) => {
    const list = chipsByDay.get(date) ?? []
    list.push(chip)
    chipsByDay.set(date, list)
  }
  for (const cap of captures) {
    const mood = cap.reframe?.moods?.[0]
    pushChip(cap.entryDate, {
      type: 'reflection',
      label: cap.title?.trim() || cap.reframe?.headline?.trim() || 'Reflection',
      accent: mood ? EMOTION_BY_ID[mood]?.color : undefined,
    })
  }
  for (const ev of events) {
    const date = eventDate(ev)
    if (!date) continue
    pushChip(date, { type: 'event', label: ev.label ?? ev.title ?? 'Event' })
  }

  const todayYmd = sgToday()
```

Only 42 cells consume it, at `:273`: `const cellChips = chipsByDay.get(cellYmd) ?? []`.

### Three unmemoized filters (`DayDetailCard.tsx:113-119`)

```ts
  const moods = date ? (engineState?.moodPins?.pins ?? []).filter((p) => p.entryDate === date) : []
  const captures = date
    ? (engineState?.captures?.entries ?? []).filter((c) => c.entryDate === date)
    : []
  const events = date
    ? (engineState?.calendar?.events ?? []).filter((e) => eventDate(e) === date)
    : []
```

### Two more O(history) derivations in `TimelinePane` (`HistorySheet.tsx:218-229`)

```ts
  const openEntryDate = openEntryId
    ? (engineState?.captures?.entries ?? []).find(
        (cap) =>
          Number((cap as { backendMirrorEntryId?: number | string }).backendMirrorEntryId) ===
          openEntryId,
      )?.entryDate
    : undefined
  const targetDate = resolveTargetDate({
    captures: engineState?.captures?.entries ?? [],
    hash,
    filter,
  })
```

`resolveTargetDate` (`:434-465`) does a `find`, or a `filter` + `sort` when
`filter === 'need-review'`.

### The Growth tab component

`GrowthPane` — `HistorySheet.tsx:475-528` — takes `{ engine }` and reads
`engine.state.sprouts.years()`. Note it also allocates `const now = new Date()`
(`:478`) and then lists `now` in a `useMemo` dependency array (`:479-482`),
which makes that memo recompute every render. `GrowthPane` renders
`GrowthYearSummary` (`:553`, which owns a `fetch`) and `GrowthIslandPreview`
(separate file, a contained Three.js view — the expensive one).

### ⚠️ THE ENGINE MUTATES ENTRIES IN PLACE — THIS IS THE WHOLE RISK ⚠️

**`src/engine/student-space/Game/State/Captures.js:153-161`:**

```js
    patch(id, updates)
    {
        const entry = this.findById(id)
        if(!entry) return null
        Object.assign(entry, updates)
        for(const cb of this.subscribers) cb(entry, this.entries)
        this._persist()
        return entry
    }
```

`Object.assign(entry, updates)` mutates the **existing** object. The `entries`
array identity does not change; the entry object identity does not change. This
is exactly why the codebase uses a version counter instead of immutable state —
see the hook's own comment at `use-engine-slice-version.ts:3-14`.

**Therefore: every `useMemo` / `memo()` dependency you write MUST key on the
version counter, never on an array or object identity.** A dependency array
containing `captures`, `engineState`, `engineState.captures.entries`, or any
entry object will compare equal after a mutation and the memo will return stale
data. There is no error, no warning, no console message — the calendar simply
freezes and stops repainting after a capture. That is a worse bug than the
performance problem this plan fixes.

(Aside, factual: `Captures.js` defines `patch` **twice** — at `:117` and at
`:153`. The second definition wins in JavaScript. Target the `:153` one in your
mental model; the duplicate is recorded as a follow-up, not fixed here.)

### Repo conventions

- pnpm only. `pnpm check` = Biome + `tsc --noEmit`.
- React 19; DOM surfaces are React + Tailwind v4; the engine stays vanilla JS.
- Component tests live in `test/components/student-space/sheets/`. The existing
  `history-sheet.test.tsx` already builds an engine double that reproduces the
  in-place-mutation contract — `makeEngine`'s `capturePatch` does
  `Object.assign(capture, updates)` then fans to subscribers
  (`test/components/student-space/sheets/history-sheet.test.tsx:99-123`), with
  `calendar: { events, subscribe: () => () => {} }` at `:124`. **Model your new
  test on this file.**
- Baseline: `pnpm check` exit 0 with 18 pre-existing lint warnings; `pnpm test`
  = 911 passed / 128 skipped / 0 failed. This plan's tests need no
  `DATABASE_URL`.

## Commands you will need

| Purpose   | Command                                                                            | Expected on success                  |
|-----------|------------------------------------------------------------------------------------|--------------------------------------|
| Install   | `pnpm install`                                                                     | exit 0                               |
| Check     | `pnpm check`                                                                       | exit 0 (18 pre-existing warnings OK) |
| All tests | `pnpm test`                                                                        | ≥911 passed, 0 failed                |
| Sheet tests | `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx`     | all pass                             |
| New tests | `pnpm vitest run test/components/student-space/sheets/history-sheet-memo.test.tsx` | new tests pass                       |

## Suggested executor toolkit

- If a `vercel:react-best-practices` skill is available, consult it before
  writing the `memo()` wrappers — but the in-place-mutation constraint above
  **overrides** any generic advice about depending on object identity.

## Scope

**In scope** (the only files you should modify/create):

- `src/components/student-space/sheets/HistorySheet.tsx`
- `src/components/student-space/sheets/CalendarPane.tsx`
- `src/components/student-space/sheets/DayDetailCard.tsx`
- `test/components/student-space/sheets/history-sheet-memo.test.tsx` (create)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/student-space/use-engine-slice-version.ts` — the version-counter
  pattern is deliberate and documented. Do **not** convert it to
  `useSyncExternalStore`; the hook's comment records why that trips React's
  cached-snapshot warning under SES.
- `src/engine/student-space/Game/State/Captures.js` — do not make the engine
  immutable. The whole React seam is built around mutation + version bumps.
  (The duplicate `patch` method is a recorded follow-up.)
- `src/components/student-space/sheets/GrowthIslandPreview.tsx` — memoizing
  `GrowthPane` already stops re-rendering it; do not touch its Three.js effects.
- `MirrorDetailPane` / `MirrorDetailSheet.tsx` — the right-hand entry column.
  `plans/055` may touch that file; stay out.
- Any change to rendered markup, class names, `data-testid`s, or ARIA. This plan
  changes **when** things render, never **what**.

## Git workflow

- Branch: `advisor/057-history-sheet-memoization`
- Commit per step. Conventional commits, e.g.
  `perf(history): memoize calendar chips and day-detail filters on slice versions`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm state and capture the baseline

Read the four files under "Current state" and confirm the excerpts. Confirm
nothing is memoized yet.

**Verify**:
- `grep -rnc 'React.memo\|= memo(' src/components` → every file reports `0`
- `grep -n 'useEngineSliceVersion' src/components/student-space/sheets/HistorySheet.tsx` → three call sites at `:92-94`, none assigning the result
- `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → all pass (this is your regression baseline)

### Step 2: Name the version counters and thread them as props

In `HistorySheet.tsx`, assign the three hook results:

```ts
  // Version counters, not data. The engine mutates entries IN PLACE
  // (Captures.patch → Object.assign), so array/object identity never changes
  // and these counters are the ONLY safe memo dependency. See plan 057.
  const moodPinsVersion = useEngineSliceVersion(state?.moodPins ?? null)
  const capturesVersion = useEngineSliceVersion(state?.captures ?? null)
  const calendarVersion = useEngineSliceVersion(state?.calendar ?? null)
```

Pass all three into `TimelinePane`, and from `TimelinePane` into `CalendarPane`
and `DayDetailCard`. Pass `capturesVersion` into `GrowthPane`. Add the props to
each component's prop type. Copy that same three-line comment (shortened) onto
each new prop group so nobody deletes them as "unused".

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'capturesVersion' src/components/student-space/sheets/HistorySheet.tsx` → ≥ `4`
- `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → all pass

### Step 3: Memoize `CalendarPane`'s chip map (and bound it to the visible range)

In `CalendarPane.tsx`:

1. Wrap `chipsByDay` in `useMemo`. Dependencies: **`capturesVersion`,
   `calendarVersion`, `cells`, `engineState`** — and nothing else. `cells` is
   already a memoized value with stable identity per (viewMode, anchorDate), so
   it is safe as a dep; `engineState` is the stable engine `state` object,
   included only so the memo re-runs if the whole engine is swapped (boot).
   **Do not** add `captures`, `events`, or `.entries` to the dep array.
2. Bound the buckets to what is drawn. Derive the visible day keys from the
   already-memoized `cells` and skip anything outside them — output is identical
   because only `chipsByDay.get(cellYmd)` for `cellYmd ∈ cells` is ever read:
   ```ts
   const chipsByDay = useMemo(() => {
     const visible = new Set(cells.map((c) => sgDateKey(c) ?? ''))
     if (selectedDate) visible.add(selectedDate) // defensive: selection is always in range today
     const byDay = new Map<string, DayChipItem[]>()
     const pushChip = (date: string, chip: DayChipItem) => { ... }
     for (const cap of engineState?.captures?.entries ?? []) {
       if (!visible.has(cap.entryDate)) continue
       ...same body as today...
     }
     for (const ev of engineState?.calendar?.events ?? []) {
       const date = eventDate(ev)
       if (!date || !visible.has(date)) continue
       ...same body as today...
     }
     return byDay
   }, [capturesVersion, calendarVersion, cells, selectedDate, engineState])
   ```
   Keep the reflections-before-events ordering exactly — it determines which
   chips survive the `MAX_CHIPS` truncation at `:274-277`.
3. Stabilise the two per-render clock allocations: `const now = new Date()`
   (`:152`) and `const todayYmd = sgToday()` (`:192`) become
   `useMemo(() => new Date(), [])` and `useMemo(() => sgToday(), [])`.
   **Accepted consequence**: the "today" reference freezes for the lifetime of
   the mounted sheet (it no longer rolls over at midnight while the sheet stays
   open). Add a one-line comment saying so. If any existing test asserts
   midnight rollover, revert this sub-step only and report it.
4. Wrap the export in `memo()`:
   ```ts
   export const CalendarPane = memo(function CalendarPane({ ... }) { ... })
   ```
   Keep the exported name `CalendarPane` — `HistorySheet.tsx:20` imports it by
   name and `HistorySheet.tsx:200` references `Parameters<typeof CalendarPane>[0]`,
   which still resolves through `memo`. If it does not, replace that
   `Parameters<...>` indirection with the explicit exported prop interface
   rather than un-memoizing.

`onSelectDate` arrives as `handleSelectDate`, already a `useCallback` with
stable deps (`HistorySheet.tsx:270-292`) — so `memo()` will actually bail out.
Verify that by reading it; if it is not stable, make it stable rather than
dropping `memo()`.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'new Map<string, DayChipItem\[\]>()' src/components/student-space/sheets/CalendarPane.tsx` → `1`, and it is inside the `useMemo` callback
- `grep -n 'memo(' src/components/student-space/sheets/CalendarPane.tsx` → ≥1
- `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → all pass, unchanged

### Step 4: Memoize `DayDetailCard`

In `DayDetailCard.tsx`:

1. Accept the three version props.
2. Wrap the three filters in `useMemo`s (or one `useMemo` returning
   `{ moods, captures, events }`), keyed on `[date, moodPinsVersion, capturesVersion, calendarVersion, engineState]`.
   Preserve the `date ? … : []` guards exactly — an unselected day must still
   yield empty arrays and the "Pick a day to see its detail." branch at
   `:121-130` must be reachable.
3. Wrap the export in `memo()`, keeping the exported name `DayDetailCard`.

Note `HistorySheet.tsx:315` passes `engineState={engineState as never}` — leave
that cast alone; widening the types is out of scope.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'useMemo' src/components/student-space/sheets/DayDetailCard.tsx` → ≥ `1`
- `grep -n 'memo(' src/components/student-space/sheets/DayDetailCard.tsx` → ≥1
- `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → all pass

### Step 5: Memoize `TimelinePane`'s derivations and `GrowthPane`

In `HistorySheet.tsx`:

1. Wrap `openEntryDate` (`:218-224`) and `targetDate` (`:225-229`) in `useMemo`s
   keyed on `[capturesVersion, engineState, openEntryId]` and
   `[capturesVersion, engineState, hash, filter]` respectively. The existing
   `useEffect` at `:231-264` lists both in its dep array — memoizing them makes
   that effect *stop* re-running on unrelated renders, which is the desired
   behaviour. Confirm the effect's dep array still lists the same identifiers.
2. Wrap `GrowthPane` in `memo()`. It must receive `capturesVersion` as a prop
   (Step 2) — **this is not optional**: `GrowthPane` reads
   `engine.state.sprouts.years()`, and `sprouts` is **not** one of the three
   subscribed slices. Today it picks up new sprout years incidentally, because
   any capture mutation re-renders the whole sheet. Once `GrowthPane` is
   memoized on a stable `engine` reference, only the `capturesVersion` prop can
   still wake it. Add a comment saying exactly that.
3. Inside `GrowthPane`, hoist `const now = new Date()` (`:478`) into
   `useMemo(() => new Date(), [])` so the `year` memo at `:479-482` has a stable
   dep set instead of recomputing every render.

**Verify**:
- `pnpm check` → exit 0
- `grep -c 'memo(' src/components/student-space/sheets/HistorySheet.tsx` → ≥ `1`
- `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → all pass, including the Growth-tab tests

### Step 6: The mandatory in-place-mutation regression test

Create `test/components/student-space/sheets/history-sheet-memo.test.tsx`.
Reuse the `makeEngine` / `renderHistory` scaffolding from
`history-sheet.test.tsx` (copy it into the new file, or export it — copying is
acceptable and keeps the existing suite untouched). Required cases:

1. **A `captures.patch()` mutation still repaints the calendar chip.** Render
   with one capture on a visible day whose `title` is `'Before'`. Assert the
   chip labelled `Before` is on screen. Then call
   `engine.state.captures.patch('mirror:1', { title: 'After' })` inside
   `act(...)`. Assert `await screen.findByText('After')` resolves and `'Before'`
   is gone. **This is the test that catches a memo keyed on array identity** —
   if you got a dep array wrong, this test fails and nothing else will.
2. **A `captures.patch()` mutation still repaints the day-detail card.** Same
   shape, but assert against the `day-detail-card` testid's contents (e.g. the
   reflection card title), and use a capture with
   `backendMirrorEntryId` set so the `kind === 'ask'` branch renders.
3. **A newly added capture appears in both surfaces.** Push a capture onto
   `entries` and fan the subscribers (mirroring what `Captures.add` does), then
   assert its chip and its detail row appear.
4. **A calendar-event mutation still repaints.** The existing engine double's
   `calendar.subscribe` is a no-op (`history-sheet.test.tsx:124`); give your
   double a real subscriber set (mirror the `captures` one) and assert an added
   event's chip appears.
5. **Bail-out proof (the performance claim).** Give `CalendarPane` a render
   counter — e.g. wrap it via `vi.mock` of the module, or simpler: assert that a
   `moodPins`-only notification does **not** change the calendar DOM. The
   cheapest robust form: spy on `EMOTION_BY_ID` accesses is brittle, so instead
   render with 3 captures, fan **only** the `moodPins` subscribers, and assert
   the day-detail "Moods" section updated while the calendar's chip nodes are
   the **same DOM elements** (capture the element references before and compare
   with `toBe`). If you cannot make this assertion stable after two attempts,
   drop case 5 and say so in your report — cases 1–4 are the mandatory ones.

**Verify**: `pnpm vitest run test/components/student-space/sheets/history-sheet-memo.test.tsx`
→ all cases pass (or 1–4 pass with case 5 documented as dropped).

### Step 7: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0 (18 pre-existing warnings
OK); tests ≥911 passed + your new tests, 0 failed.

## Test plan

- New `test/components/student-space/sheets/history-sheet-memo.test.tsx`:
  patch→chip repaint, patch→detail repaint, add→both surfaces, calendar-event
  repaint, and (best-effort) a bail-out proof that a moodPins-only bump leaves
  the calendar DOM untouched.
- Existing `test/components/student-space/sheets/history-sheet.test.tsx` must
  stay green **unmodified** — it is the rendered-output-identical gate.
- Also run `pnpm vitest run test/lib/route-sheets-history.test.ts` (route wiring
  for this sheet) → all pass.
- No `DATABASE_URL` needed for anything in this plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn 'memo(' src/components/student-space/sheets/CalendarPane.tsx src/components/student-space/sheets/DayDetailCard.tsx src/components/student-space/sheets/HistorySheet.tsx` → ≥1 match in each
- [ ] `grep -c 'capturesVersion' src/components/student-space/sheets/HistorySheet.tsx` → ≥ `4`
- [ ] No memo/useMemo dependency array in the three files contains `entries`, `captures`, `events`, `pins`, or `.reframe` (read each dep array and confirm; `engineState`, `cells`, `selectedDate`, `date`, `hash`, `filter`, `openEntryId` and the three `*Version` counters are the allowed deps)
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed + new tests
- [ ] `test/components/student-space/sheets/history-sheet.test.tsx` is **untouched by this branch** (`git diff --stat <this branch's base>..HEAD` does not list it)
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any case in Step 6 fails and the fix is not "add the version counter to the
  dep array". A failing repaint test means the memoization is wrong; **never**
  weaken the test to make it pass.
- `Parameters<typeof CalendarPane>[0]` (`HistorySheet.tsx:200`) stops resolving
  after wrapping in `memo()` and replacing it with an explicit exported prop
  interface would change any other file's types.
- You find that `handleSelectDate` (or another callback prop) is **not** stable,
  such that `memo()` never bails out — report it rather than dropping `memo()`;
  a non-bailing memo is dead weight that a future reader will trust.
- `CalendarPane` turns out to read `moodPins` somewhere you did not expect (the
  prop is declared in `CalendarPaneEngineState:96` but the render body does not
  use it at plan time) — then `moodPinsVersion` must join its dep array.
- Freezing `sgToday()` / `new Date()` breaks any existing test.
- The change would require touching `use-engine-slice-version.ts` or
  `Captures.js` to work.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer must scrutinise, line by line: every dependency array.**
  The engine mutates in place, so a dep array containing an array or object
  reference is a silent freeze, not a compile error. The rule to enforce in
  review: *derived data from an engine slice keys on that slice's version
  counter, full stop.* Anything else is a bug even if the tests happen to pass.
- **Second thing to scrutinise**: `GrowthPane`'s `capturesVersion` prop. It
  looks unused inside the component (it only feeds `memo`'s comparison), so it
  is exactly the kind of prop someone deletes as dead code — and deleting it
  freezes the Growth tab's year list. The comment added in Step 5 is
  load-bearing.
- **Interaction warning**: if a fourth engine slice is subscribed in
  `HistorySheet`, its version counter must be threaded to whichever memoized
  child reads it, or that child will go stale.
- **Interaction warning**: `plans/046-finish-sgt-migration.md` also edits
  `CalendarPane.tsx` (land it first); `plans/047-capture-retry-idempotency.md`
  edits `DayDetailCard.tsx`'s `RetrySyncNotice` and
  `test/components/student-space/sheets/history-sheet.test.tsx`, so land 047
  first too and keep your new test in its own file as this plan specifies.
  `plans/055` may edit `MirrorDetailSheet.tsx` — no overlap with this plan.
- **Follow-up recorded, deliberately not fixed here**:
  `src/engine/student-space/Game/State/Captures.js` defines `patch` twice
  (`:117-125` and `:153-161`) — the first is dead. Removing the duplicate is an
  engine change with its own review surface; `plans/047` records it too.
- **Follow-up recorded**: `memo()` now exists in three files out of 49. If the
  codebase adopts it more widely, consider a short note in `CLAUDE.md`'s
  "Engine ↔ React seam" section stating the version-counter dependency rule, so
  the next person does not learn it from a frozen calendar.
