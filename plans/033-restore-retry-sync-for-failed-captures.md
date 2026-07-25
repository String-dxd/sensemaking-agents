# Plan 033: Restore a visible failed state + "Retry sync" for unsynced voice captures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/components/student-space/sheets/DayDetailCard.tsx test/components/student-space/sheets/history-sheet.test.tsx src/lib/student-space/backend-bridge.ts src/engine/student-space/Game/State/schema.js`
> If any of these changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

When a voice reflection fails to reach the backend (network blip, transient
5xx — plausible on venue Wi-Fi during a live demo), the capture is patched to
`syncStatus: 'failed'` with only a `console.warn`. The July 2026 history-sheet
refactor (commits `42e16752` / `8601aac5`) moved reflection actions into a new
right-column detail pane — but that pane only opens for captures with a
`backendMirrorEntryId`, which a failed local sync never has. Result: the
student's just-spoken reflection appears as a dead, unmarked card with no
error indicator and no way to retry. The pre-refactor product had a
"Retry sync" button; this plan restores that affordance in the new UI.

## Current state

Relevant files:

- `src/components/student-space/sheets/DayDetailCard.tsx` — day panel beside
  the History calendar; renders each `kind: 'ask'` capture as a card. Captures
  **without** a positive `backendMirrorEntryId` render as a plain,
  non-interactive `<div>` (the `hasBackendId ? <Link…> : <div…>` branch around
  lines 242–263). No failed-sync indicator, no retry.
- `src/components/student-space/capture/AskSheet.tsx` — sets the failed state.
  Around lines 765–770 and 816–821:
  ```ts
  console.warn('[AskSheet] prepared reflection log failed', err)
  if (captureEntry?.id)
    captures?.patch?.(captureEntry.id, { syncStatus: 'failed', syncError: message })
  ```
  (Do not modify this file — it correctly records the failure.)
- `src/components/student-space/sheets/MirrorDetailSheet.tsx` — the right-column
  detail pane. `MirrorDetailPane` finds its capture by
  `Number(entry.backendMirrorEntryId) === entryId` (line ~84), so failed local
  captures can never open it. (Out of scope — the retry lives on the card.)
- `src/lib/student-space/backend-bridge.ts` — the bridge already exposes the
  exact method the retry needs (line ~229):
  ```ts
  submitReflection: async (input) => {
    const result = (await submitStudentSpaceReflection({
      data: {
        localCaptureId: input.localCaptureId,
        ...(input.transcript ? { transcript: input.transcript } : {}),
        ...
        ...(input.contextType ? { context_type: input.contextType } : {}),
      },
    })) as SubmitStudentSpaceReflectionResult
    return {
      localCaptureId: result.local_capture_id,
      mirrorEntry: mapMirrorEntryRowToSummary(result.mirror_entry),
    }
  },
  ```
- `src/engine/student-space/Game/State/schema.js` — `KNOWN_CAPTURE_KEYS`
  (lines ~216–241) **already includes** `'syncStatus', 'syncError'` and
  `SYNC_STATES` includes `'failed'`. **No schema change is needed** — do not
  touch this file. (Background: capture fields not in this allow-list are
  silently dropped at the React↔engine seam; the fields this plan uses are all
  listed.)

**The spec is a currently-failing test.** `test/components/student-space/sheets/history-sheet.test.tsx`,
test `'can retry failed local reflection syncs from day detail'` (lines
~320–367) documents the pre-refactor contract and MUST pass when this plan is
done:

```ts
const engine = makeEngine({
  backend: { submitReflection },
  captures: [{
    id: 'local-ask-1', entryDate: TODAY, createdAt: '2026-05-22T08:00:00.000Z',
    kind: 'ask', text: 'Needs sync',
    syncStatus: 'failed', syncError: 'offline', contextType: 'home',
  }],
})
renderHistory(engine)
await userEvent.click(await screen.findByRole('button', { name: 'Retry sync' }))
await waitFor(() =>
  expect(submitReflection).toHaveBeenCalledWith({
    localCaptureId: 'local-ask-1', transcript: 'Needs sync', contextType: 'home',
  }),
)
expect(engine.state.captures.patch).toHaveBeenCalledWith('local-ask-1', {
  syncStatus: 'syncing', syncError: '',
})
expect(engine.state.captures.patch).toHaveBeenCalledWith(
  'local-ask-1',
  expect.objectContaining({
    backendMirrorEntryId: 91, text: 'Synced reflection',
    reviewStatus: 'pending', syncStatus: 'synced',
  }),
)
```

Fixture-date hazard: the test fixture uses the fixed past date
`TODAY = '2026-05-22'`, but the component now defaults the selected day to the
real clock — `TimelinePane` defaults `selectedDate` to today's real date
(`HistorySheet.tsx:253-257`), and `DayDetailCard` filters captures by
`entryDate === date`. So a capture pinned to 2026-05-22 renders on a day that
is never selected, and the Retry button never appears. Fix the test fixture
(not component behavior): give the failed capture a dynamic current-date
`entryDate` using this helper, added at the top of the test file:

```ts
// Real-clock day key, matching DayDetailCard's private ymd()
function realToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
```

Name it exactly `realToday` — plan 034 (which lands after this one) adds the
same helper for the school-events test and will reuse/merge with yours.

Repo conventions that apply:

- Buttons in these sheets are hand-rolled shadcn-style: `type="button"`, pill
  classes like the Confirm button in `MirrorDetailSheet.tsx:332-339`. Match
  that visual language (smaller: this is an inline card action).
- Engine state is reached through loose optional chaining
  (`engineState?.captures?.patch?.(…)`) — match `DayDetailCard.tsx`'s existing
  `DayDetailEngineState` types (lines 57–99), which **already declare**
  `backend.submitReflection` and `captures.patch`. Those declarations are
  currently dead code left from the pre-refactor version; this plan makes them
  live again.
- Errors shown to users get `role="alert"` (see `MirrorDetailSheet.tsx:349-353`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint + typecheck | `pnpm check` | exit 0 (pre-existing lint warnings are OK; 0 errors) |
| Target test | `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx -t "can retry failed local reflection syncs"` | 1 passed |
| Full file | `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` | see note below |

Note: at planning time this file has **4 other failing tests** (stale
assertions, fixed separately by plan 034). Your gate is: the retry test
passes, and the file's pass/fail count is otherwise no worse than before your
change (5 pass / 5 fail → 6 pass / 4 fail).

## Scope

**In scope** (the only files you should modify):

- `src/components/student-space/sheets/DayDetailCard.tsx`
- `test/components/student-space/sheets/history-sheet.test.tsx` — ONLY the
  `'can retry failed local reflection syncs from day detail'` test (fixture
  date fix and/or markup-level assertion adjustments that keep the contract:
  button named "Retry sync", the two `patch` calls, the `submitReflection`
  payload).

**Out of scope** (do NOT touch, even though they look related):

- `src/components/student-space/capture/AskSheet.tsx` — already records
  failures correctly.
- `src/components/student-space/sheets/MirrorDetailSheet.tsx` — detail pane is
  for synced entries only.
- `src/engine/student-space/Game/State/schema.js` — fields already allow-listed.
- `src/lib/student-space/backend-bridge.ts` — `submitReflection` already exists.
- The other 4 failing tests in `history-sheet.test.tsx` — plan 034's job.

## Git workflow

- Branch: `advisor/033-retry-sync-failed-captures`
- Conventional commits, e.g. `fix(history): restore Retry sync for failed local captures`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Render a failed-sync state on the day-detail card

In `DayDetailCard.tsx`, inside the `kind === 'ask'` card rendering (the
`hasBackendId ? <Link…> : <div…>` branch, ~lines 242–263): when
`cap.syncStatus === 'failed'`, render (inside the non-link `<div>` card, after
`{body}`):

1. An error line with `role="alert"`, e.g. `Couldn't save this reflection.`
   plus the `cap.syncError` text in a softer tone — small text, matching the
   card's existing `text-(--color-sheet-ink-soft)` styling.
2. A `Retry sync` button: `type="button"`, accessible name exactly
   `Retry sync` (the test queries `getByRole('button', { name: 'Retry sync' })`),
   pill styling consistent with the sheet's small buttons.
3. While `cap.syncStatus === 'syncing'`, show a non-interactive "Syncing…"
   text instead of the button (prevents double-submit).

**Verify**: `pnpm check` → exit 0.

### Step 2: Wire the retry action

Add a handler (inside `DayDetailCard` or a small child component) that, given
the capture:

1. Guards: `engineState?.backend?.submitReflection` and
   `engineState?.captures?.patch` must both exist; no-op otherwise.
2. Patches `patch(cap.id, { syncStatus: 'syncing', syncError: '' })`.
3. Calls `await backend.submitReflection({ localCaptureId: cap.id, transcript: cap.text, contextType: cap.contextType })`
   — include `transcript`/`contextType` only when truthy, but note the test
   asserts the exact object `{ localCaptureId, transcript, contextType }` when
   all are present.
4. On success, patches the capture with
   `{ backendMirrorEntryId: mirrorEntry.id, text: mirrorEntry.transcript || cap.text, reviewStatus: mirrorEntry.reviewStatus || 'pending', syncStatus: 'synced', syncError: '' }`
   (mirror the success-patch shape in `AskSheet.tsx:797-814` where sensible).
5. On failure, patches `{ syncStatus: 'failed', syncError: message }` so the
   button reappears.

Re-render comes from the engine slice subscription HistorySheet already holds
(`useEngineSliceVersion(state?.captures …)`) — the test's `makeEngine` notifies
subscribers on every `patch`, so no extra local state is required for the
status flip; but a local `busy` state to disable the button during the await
is fine.

**Verify**: `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx -t "can retry failed local reflection syncs"` → 1 passed.
If it fails because the card never renders (day not selected), apply the
fixture date fix described in "Current state" (set the failed capture's
`entryDate`/`createdAt` from `new Date()` in the test) and re-run.

### Step 3: Full gates

**Verify**:
- `pnpm check` → exit 0.
- `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx`
  → 6 passed / 4 failed (the 4 known-stale tests from plan 034; if any test
  that passed before your change now fails, that's a regression — fix or STOP).

## Test plan

- The restored test `'can retry failed local reflection syncs from day detail'`
  is the primary regression test (happy path: failed → syncing → synced).
- Add ONE new test in the same file, modeled on the retry test: retry
  **failure** path — `submitReflection` rejects; assert the capture is patched
  back to `syncStatus: 'failed'` with the new error message and the
  `Retry sync` button is queryable again. Name it exactly
  `'shows retry again when a retry sync fails'` — the done criterion below
  filters with `-t "retry"`, so the name MUST contain the substring `retry`.
- Verification: the target-test command above → 2 passed (retry success +
  retry failure).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx -t "retry"` → 2 passed, 0 failed
- [ ] `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx` → exactly 4 failures, all in the plan-034 list: "selects a linked reflection day", "selects the newest pending reflection", "renders school events", "can confirm pending backend reflections"
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `submitReflection` is absent from `backend-bridge.ts` or its input/return
  shape differs from the excerpt (drift).
- Making the retry test pass seems to require modifying `HistorySheet.tsx`,
  `MirrorDetailSheet.tsx`, or the engine — the affordance belongs on the card.
- The capture card for the failed sync never renders even with a current-date
  fixture (would mean captures filtering changed — report, don't patch around).
- A previously-passing test in the file breaks and one fix attempt doesn't
  restore it.

## Maintenance notes

- Plan 034 rewrites the other 4 stale tests in this file; land this plan
  first so 034 can assert a fully green file.
- If the detail pane (`MirrorDetailPane`) later learns to open local captures
  by `cap.id`, the retry affordance could move there — until then the card is
  the only surface a failed capture has.
- Reviewer should scrutinize: the exact `submitReflection` payload (test pins
  it), and that the syncing state can't fire a second submit.
