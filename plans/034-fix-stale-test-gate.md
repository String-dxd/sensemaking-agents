# Plan 034: Green the test gate — update 9 stale tests to the shipped July UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- test/components/student-space test/routes/dev.pipeline.test.tsx src/components/student-space/sheets src/components/StudentSpaceHost.tsx src/lib/student-space/camera-tuner.ts src/routes/_dev.dev.pipeline.tsx`
> If the source components changed since this plan was written, re-derive the
> expected UI from the live code; if a described root cause no longer matches,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (test-only changes)
- **Depends on**: plans/033-restore-retry-sync-for-failed-captures.md
- **Category**: tests
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

`pnpm test` fails on main: 10 failing tests across 5 files. Nine are stale —
they assert the pre-refactor UI that commits `42e16752` (Slack-style right
column for reflection details), `8601aac5` (entry-column polish), and related
July work intentionally replaced. (The tenth documents a real regression and
is fixed by plan 033.) While the gate is red, a pre-demo smoke run can't
distinguish a real regression from known noise — this plan makes `pnpm test`
exit 0 so it becomes a trustworthy demo-prep check again.

**Prime directive: tests adapt to the shipped UI, never the reverse.** Every
fix below is a test-file change. If making a test pass appears to require
changing a `src/` file, that test found a real bug — STOP and report.

## Current state

The failing tests and their verified root causes:

### A. `test/components/student-space/sheets/history-sheet.test.tsx` (4 failures; a 5th is plan 033's)

The component reality (read these before editing):
- `DayDetailCard.tsx` (~lines 196–263): `kind:'ask'` cards no longer render the
  transcript `text`. They render `<mark>{title || reframe.headline || 'Reflection'}</mark>`
  plus an optional one-line headline. Cards with a positive
  `backendMirrorEntryId` are a `<Link to="/history" search={{ entry: entryId }}>`
  with `data-testid={`mirror-card-${entryId}`}`.
- Confirm/Forget moved out of the day card into the right-column
  `MirrorDetailPane` (`MirrorDetailSheet.tsx`): `/history?entry=<id>` renders
  `<aside data-testid="history-entry-column">` containing the pane; its
  `ReviewActions` shows `Confirm` / `Forget` buttons only when
  `backendMirrorEntryId > 0 && reviewStatus === 'pending'`
  (`MirrorDetailSheet.tsx:274-356`).
- `TimelinePane` (`HistorySheet.tsx:205-258`) defaults `selectedDate` to the
  **real clock date** when no hash/filter/entry targeting applies.
- Date rendering in this environment: calendar day buttons carry aria-labels
  like `"Friday, 3 April 2026"` (day-before-month), NOT `"Friday, April 3, 2026"`.
  Verified by DOM dump of the failing run.

Per-test fixes:

1. **`selects a linked reflection day from the route hash`** (line ~211).
   Hash-driven day selection still works (verified: calendar lands on April
   2026, the day cell is present) — only the assertions are stale.
   - The fixture capture has `text: 'Linked reflection'` but no `title`;
     the card therefore renders the literal fallback `Reflection`.
     Add `title: 'Linked reflection'` to the fixture capture so the card text
     is distinctive again.
   - Replace `findByText(/Friday, April 3, 2026/)` with a locale-robust
     assertion, e.g. `await screen.findByRole('button', { name: 'Friday, 3 April 2026' })`
     (the calendar cell) — and assert `data-selected` is `'true'` on it —
     or match the day-detail header with a tolerant regex
     `/Friday.*3 April 2026|Friday, April 3, 2026/`.
   - Keep the second half: clicking the `"Wednesday, 15 April 2026"` cell
     (update the name to the actual aria-label format) hides
     `'Linked reflection'`.

2. **`selects the newest pending reflection from the need-review filter and advances after confirm`** (line ~236).
   `findByText('Newest pending')` fails (cards don't render `text`), and
   `Confirm` is no longer on the card. Fix:
   - Add `title: 'Older pending'` / `title: 'Newest pending'` to the two
     fixture captures.
   - After `Newest pending` is visible, open its detail column by clicking the
     card link (`screen.getByTestId('mirror-card-24')`), then click `Confirm`
     inside `within(screen.getByTestId('history-entry-column'))`.
   - `makeEngine`'s `patch` mutates the capture and notifies subscribers, so
     after confirm the need-review target recomputes to the older pending
     entry (`resolveTargetDate`, `HistorySheet.tsx:427-458` sorts pending by
     `createdAt` desc). Keep the closing assertions:
     `waitFor(() => Older pending visible)`; `Newest pending` no longer in the
     document (it's confirmed, and the selected day switches to `2026-04-03`).
   - Note: `ReviewActions` optionally calls `backend.refreshSnapshot` —
     absent on the fake backend is fine (optional-chained).

3. **`renders school events from the engine date/label shape`** (line ~274).
   The event is dated `TODAY = '2026-05-22'`, but the component now defaults
   the selected day to the real clock date, so the event's day is never
   selected. Fix: date the event dynamically — add a test helper
   `const realToday = () => { const d = new Date(); return \`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}\` }`
   and use it for this event's `date`. Do NOT change the global `TODAY`
   constant (other tests use it for filter-targeted days, which still work
   with past dates).

4. **`can confirm pending backend reflections from day detail`** (line ~284).
   Same root cause as #2: the capture's day (TODAY, in the past) is never
   auto-selected AND Confirm moved to the detail pane. Fix: date the capture
   with `realToday()` (both `entryDate` and a same-day `createdAt`), add a
   `title`, click `mirror-card-24` to open the column, click `Confirm` within
   `history-entry-column`. Keep the existing `updateReflectionReview` and
   `patch` assertions — they match the live `ReviewActions` code
   (`MirrorDetailSheet.tsx:293-310`, patch target `mirror:24`).

### B. `test/components/student-space/sheets/trajectory-sheet.test.tsx` (1 failure)

**`searching tabs render bearings; clicking a tab switches the panel`**
(line ~242): pathways changed from a tabbed panel to a static ordered list —
`<ol aria-label="Pathway options">` rendering ALL bearings at once
(`TrajectorySheet.tsx:670-671`); there are no `tab` roles. Fix: rename the
test (e.g. `searching pathways render all bearings as a list`), assert
`'A through-line'`, `'prompt A'` AND `'prompt B'` are all in the document,
and assert the list via `getByRole('list', { name: 'Pathway options' })`.
Delete the tab click.

### C. `test/components/student-space/student-space-host.test.tsx` (1 failure)

**`mounts the world-route composition once the engine is ready`**: the host
now gates chrome behind the onboarding ceremony (`StudentSpaceHost.tsx:41-55`):

```tsx
const ceremonyDone = onboarding?.isDone === true || onboarding?.stage === 'done'
const showWorldChrome = ceremonyDone && !isOnboarding
return (
  <>
    <WorldInteractions game={game} onboardingMode={!ceremonyDone || isOnboarding} />
    {showWorldChrome ? (<><IslandProgressionOverlay …/><StudentSpaceHud …/><CaptureFab /></>) : null}
  </>
)
```

The test's `fakeGame = { dispose: vi.fn() }` has no onboarding state, so
chrome is (correctly) not mounted. Fix:
- Extend `fakeGame` with `state: { onboarding: { isDone: true, subscribe: () => () => {} } }`.
- The host also renders `WorldInteractions`, `StudentSpaceHud`, and
  `CaptureFab`, which the file does not currently mock and which will likely
  throw on a minimal fake game in happy-dom. Mock all three the same way
  `IslandProgressionOverlay` is already mocked (top of the file, `vi.mock`
  returning a stub `div` with a testid), and assert the overlay stub AND (new)
  the hud/fab stubs render.
- Consider adding one more case: `ceremonyDone === false` renders
  WorldInteractions but NOT the chrome (this pins the intentional gating).

### D. `test/components/student-space/onboarding/edupass-login.test.tsx` (1 failure)

**`toggles landing body class and camera orbit for the lifecycle`**
(line ~124): asserts `startLandingOrbit` called with
`{ azimuthDegPerSec: 1, distance: 33.9, pitchDeg: 35 }`, but the `login-orbit`
preset was retuned (`camera-tuner.ts:138-145`) to
`{ azimuthDegPerSec: 3, distance: 32, pitchDeg: 28 }`. The component calls
`camera?.startLandingOrbit?.(getPreset('login-orbit'))`
(`EdupassLogin.tsx:96`). Fix: import `getPreset` from
`~/lib/student-space/camera-tuner` in the test and assert
`toHaveBeenCalledWith(getPreset('login-orbit'))` so future retunes don't
re-break it. (If `getPreset` is not exported, fall back to the literal
`{ azimuthDegPerSec: 3, distance: 32, pitchDeg: 28 }`.)

### E. `test/routes/dev.pipeline.test.tsx` (2 failures)

Both failures query `getByRole('button', { name: 'Stop Realtime transcript' })`
(lines ~111 and ~170). The button was renamed to just `Stop`
(`src/routes/_dev.dev.pipeline.tsx:529-539`, sibling of
`Start Realtime transcript`). Fix: update both queries to
`{ name: 'Stop' }`. If more than one button named "Stop" exists on the page
(check with `getAllByRole`), scope the query with `within(...)` on the
transcript controls container rather than renaming the product button.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint + typecheck | `pnpm check` | exit 0 (18 pre-existing lint warnings OK; 0 errors) |
| One file | `pnpm vitest run <test file>` | all pass in that file |
| Full suite | `pnpm test` | exit 0; 0 failed (≈880 passed, 128 skipped) |

## Scope

**In scope** (the only files you should modify):

- `test/components/student-space/sheets/history-sheet.test.tsx`
- `test/components/student-space/sheets/trajectory-sheet.test.tsx`
- `test/components/student-space/student-space-host.test.tsx`
- `test/components/student-space/onboarding/edupass-login.test.tsx`
- `test/routes/dev.pipeline.test.tsx`

**Out of scope** (do NOT touch):

- Any file under `src/` — if a test can only pass via a src change, STOP.
- The retry-sync test in `history-sheet.test.tsx` — owned by plan 033 (which
  must land first; its fixture-date fix pattern is the one reused here).
- The 14 pre-existing skipped test files — leave skips alone.

## Git workflow

- Branch: `advisor/034-fix-stale-test-gate`
- Conventional commits, e.g. `test(history): update day-card assertions to the entry-column UI`
  — one commit per test file is a good granularity.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: history-sheet tests (A1–A4)

Apply the four fixes above.

**Verify**: `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → 0 failed (10–11 passed depending on plan 033's added test).

### Step 2: trajectory-sheet test (B)

**Verify**: `pnpm vitest run test/components/student-space/sheets/trajectory-sheet.test.tsx` → 0 failed (13 passed).

### Step 3: student-space-host test (C)

**Verify**: `pnpm vitest run test/components/student-space/student-space-host.test.tsx` → 0 failed.

### Step 4: edupass-login test (D)

**Verify**: `pnpm vitest run test/components/student-space/onboarding/edupass-login.test.tsx` → 0 failed (6 passed). (A Base UI `nativeButton` console warning appears in this file's output — pre-existing noise, ignore it.)

### Step 5: dev.pipeline test (E)

**Verify**: `pnpm vitest run test/routes/dev.pipeline.test.tsx` → 0 failed (6 passed).

### Step 6: full gates

**Verify**: `pnpm test` → exit 0, `Tests … 0 failed`. Then `pnpm check` → exit 0.

## Test plan

This plan IS test work. Beyond the fixes: the one new gating case suggested in
step C (`ceremonyDone === false` → no chrome) is the only net-new coverage;
model it on the existing two cases in the same file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 with 0 failed tests
- [ ] `pnpm check` exits 0
- [ ] `git status` shows changes ONLY in the five in-scope test files
- [ ] No test was deleted or `.skip`ped to get green: `git diff main -- <the five files> | grep -c "^+.*\(\.skip\|xit(\)"` → `0`, and the per-file test counts reported by vitest are ≥ the pre-change counts (history 10, trajectory 13, host 2, edupass 6, dev.pipeline — count before starting)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 033 has not landed (the retry test still fails for product reasons) —
  this plan cannot reach a green suite without it.
- Any fix requires editing a file under `src/` — that test found a real
  regression; report which behavior is actually broken.
- After fixture-date fixes, day-detail cards still don't render for
  current-date captures (would indicate a real capture-filtering bug).
- The full suite has failures OUTSIDE the five files listed (new breakage on
  main since planning — report, don't chase).

## Maintenance notes

- Root cause of this whole batch: UI refactors landed on main without their
  test updates. Reviewer takeaway for the repo: `pnpm test` (or at least the
  touched files) belongs in the pre-merge routine for sheet refactors.
- The `realToday()` fixture helper makes two tests clock-dependent by design
  (they follow the component's "default to today" behavior). If TimelinePane
  ever gains an injectable clock, migrate these to fixed dates.
- The edupass assertion now tracks `getPreset('login-orbit')` — camera preset
  retunes will no longer break tests, which is intended; visual review is the
  gate for those.
