# Plan 045: Wipe local engine state when the demo persona switcher changes identity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/components/student-space/sheets/SettingsSheet.tsx src/lib/sign-out-engine.ts src/lib/clear-student-space-local-state.ts src/components/DevPalette.tsx test/components/student-space/sheets/settings-sheet.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Switching demo personas in Settings changes the server-side identity but leaves
the previous student's engine state in `localStorage`. The engine persists
captures, mood pins, sprouts, profile, letters and island layout under
`ss:v1:*` keys with **no per-student prefix**, so after switching demo-a → demo-b
the world renders demo-b's backend rows blended with demo-a's local slices:
demo-a's sprouts on the island, demo-a's mood pins on the calendar, demo-a's
profile in the header. Every other identity transition already wipes this state
(`DevPalette` sign-out, `ProfileSheet` sign-out); the persona switcher — the
surface most likely to be used in a live demo — is the one that does not. The fix
is four lines, mirroring the existing exemplar.

## Current state

- `src/components/student-space/sheets/SettingsSheet.tsx` — routed `/settings`;
  `switchDemoStudent()` is the buggy path.
- `src/lib/sign-out-engine.ts` — `signOutEngine()`: synchronously disposes the
  live engine (draining Persistence's debounced writes) via
  `window.__studentSpaceGame`, then `resetProfileTabBoot()`. Safe when no engine
  is mounted and safe under SSR.
- `src/lib/clear-student-space-local-state.ts` — `clearStudentSpaceLocalState()`:
  removes every `ss:v1:*` key. Its doc comment states the contract: *"Call this
  from any sign-out surface … so the next signed-in student does not inherit the
  previous student's persisted engine state."*
- `src/components/DevPalette.tsx` — the **exemplar**.
- `src/components/student-space/sheets/ProfileSheet.tsx:437-450` — the second
  correct site (inline `dispose()` + a private `clearStudentSpaceLocalStateInline()`).

The bug — `src/components/student-space/sheets/SettingsSheet.tsx:80-89`, verbatim:

```tsx
  const switchDemoStudent = (id: DemoStudentId) => {
    if (typeof document === 'undefined') return
    const search = new URLSearchParams({ demo: '1', student: id, returnPathname: '/' })
    const form = document.createElement('form')
    form.method = 'post'
    form.action = `/api/auth/sign-in?${search.toString()}`
    form.style.display = 'none'
    document.body.appendChild(form)
    form.submit()
  }
```

The exemplar — `src/components/DevPalette.tsx:168-188`, verbatim (the comment is
why the ordering is load-bearing):

```tsx
        run: () => {
          setOpen(false)
          // Tear the engine down BEFORE wiping its localStorage keys.
          // Persistence's debounced writes (250ms) would otherwise race the
          // clear: a save scheduled at t=0 lands at t=250ms and re-creates
          // the `ss:v1:*` keys we just deleted, defeating the per-session
          // cleanup. dispose() drains the pending writes synchronously
          // (via Persistence.dispose → flush) and removes the rAF loop so
          // no further saves can fire during the sign-out POST flight.
          signOutEngine()
          clearStudentSpaceLocalState()
          // POST via a hidden form mirrors the profile sheet's sign-out
          // pattern. …
          const form = document.createElement('form')
          form.method = 'post'
          form.action = '/api/auth/sign-out'
          document.body.appendChild(form)
          form.submit()
        },
```

Its import paths — `src/components/DevPalette.tsx:7-8`, verbatim:

```tsx
import { clearStudentSpaceLocalState } from '~/lib/clear-student-space-local-state'
import { signOutEngine } from '~/lib/sign-out-engine'
```

`SettingsSheet.tsx`'s import block is lines 1–23; both new imports sort before
`~/lib/student-space/use-engine` (line 21) under Biome's `~/` ordering.

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`; Vitest tests
in `test/` mirroring `src/`; React tests use Testing Library + happy-dom;
conventional commits (e.g.
`fix(history): bucket entry dates in Asia/Singapore, not UTC`). Baseline:
`pnpm check` exits 0 with 18 pre-existing lint warnings; `pnpm test` = 911
passed / 128 skipped / 0 failed.

## Commands you will need

| Purpose   | Command                                                                        | Expected on success                  |
|-----------|--------------------------------------------------------------------------------|--------------------------------------|
| Install   | `pnpm install`                                                                 | exit 0                               |
| Check     | `pnpm check`                                                                   | exit 0 (18 pre-existing warnings OK) |
| All tests | `pnpm test`                                                                    | ≥911 passed, 0 failed                |
| Targeted  | `pnpm vitest run test/components/student-space/sheets/settings-sheet.test.tsx`   | all pass                             |

## Scope

**In scope** (the only files you should modify):

- `src/components/student-space/sheets/SettingsSheet.tsx` — `switchDemoStudent`
- `test/components/student-space/sheets/settings-sheet.test.tsx` — new assertions

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/sign-out-engine.ts` / `src/lib/clear-student-space-local-state.ts` —
  reuse as-is. Do **not** fork a variant or add parameters; the whole point is
  that the switcher uses the *same* helpers as every other identity transition.
- `src/components/DevPalette.tsx` — the exemplar; already correct.
- `src/components/student-space/sheets/ProfileSheet.tsx` — it carries a private
  `clearStudentSpaceLocalStateInline()` (line 1634) instead of the shared helper.
  A real DRY wart, but consolidating touches a 1600-line file and a different
  test; leave it.
- `handleRestart` in the same file (Restart onboarding) — it deliberately resets
  only the onboarding slice.
- Per-student `localStorage` key prefixing — the real architectural fix named in
  `clear-student-space-local-state.ts`'s doc comment. This plan only makes the
  switcher consistent with the existing mitigation.

## Git workflow

- Branch: `advisor/045-persona-switch-state-wipe`
- Conventional commit, e.g.
  `fix(settings): wipe local engine state when switching demo persona`
- Do NOT push or open a PR unless the operator instructed it.

## Non-regression argument (state this in the PR)

- **Speed / perceived performance**: both helpers are synchronous and local.
  `signOutEngine()` disposes an engine the browser is about to tear down anyway
  (the form POST is a full page navigation), and
  `clearStudentSpaceLocalState()` is a dozen `removeItem` calls. The added work
  is invisible; the next boot is *faster* because it hydrates fewer stale slices.
- **Ease of use**: same button, same click, same destination. What changes is
  that demo-b now looks like demo-b.
- **Intended data semantics**: switching persona discards *unsynced* local
  captures for the outgoing persona. This is deliberate and **identical to
  sign-out**, which has always behaved this way. Synced reflections live in
  Postgres and return via the backend snapshot; only never-synced local state is
  dropped. Say this explicitly so a reviewer does not read it as data loss.

## Steps

### Step 1: Wipe engine state before submitting the switch form

In `src/components/student-space/sheets/SettingsSheet.tsx`:

1. Add the two imports, matching `DevPalette.tsx:7-8` exactly, positioned so
   Biome's import sort is satisfied:

```tsx
import { clearStudentSpaceLocalState } from '~/lib/clear-student-space-local-state'
import { signOutEngine } from '~/lib/sign-out-engine'
```

2. Change `switchDemoStudent` to this shape. The order is load-bearing: dispose
   **before** clearing, then submit. Leave the form construction
   (`style.display`, `appendChild`) byte-identical — the existing test asserts
   `submitted.parentElement === document.body` and the action query string.

```tsx
  const switchDemoStudent = (id: DemoStudentId) => {
    if (typeof document === 'undefined') return
    // A persona switch is an identity change, exactly like sign-out: the engine
    // persists to unprefixed `ss:v1:*` keys, so without this wipe the next
    // persona's world renders a blend of two students' captures, mood pins,
    // sprouts and profile. Tear the engine down BEFORE wiping the keys —
    // Persistence's debounced writes (250ms) would otherwise land after the
    // clear and re-create them; dispose() drains them synchronously. Same
    // sequence as DevPalette's sign-out command.
    signOutEngine()
    clearStudentSpaceLocalState()
    const search = new URLSearchParams({ demo: '1', student: id, returnPathname: '/' })
    const form = document.createElement('form')
    form.method = 'post'
    form.action = `/api/auth/sign-in?${search.toString()}`
    form.style.display = 'none'
    document.body.appendChild(form)
    form.submit()
  }
```

**Verify**: `pnpm check` → exit 0.
**Verify**:
`grep -c 'signOutEngine\|clearStudentSpaceLocalState' src/components/student-space/sheets/SettingsSheet.tsx`
→ 4 (2 imports, 2 calls).

### Step 2: Assert the wipe happens before the POST

In `test/components/student-space/sheets/settings-sheet.test.tsx`:

1. Add hoisted mocks beside the existing `loadAuthMenuMock` (lines 26–30),
   matching its style, and reset both in the existing `afterEach` (lines 91–94):

```tsx
const signOutEngineMock = vi.hoisted(() => vi.fn())
const clearLocalStateMock = vi.hoisted(() => vi.fn())

vi.mock('~/lib/sign-out-engine', () => ({ signOutEngine: signOutEngineMock }))
vi.mock('~/lib/clear-student-space-local-state', () => ({
  clearStudentSpaceLocalState: clearLocalStateMock,
}))
```

2. Add one test inside the existing `describe('Demo student switcher', …)`,
   modelled on
   `'clicking a non-active persona submits a body-scoped form to the switch endpoint'`
   (lines 188–208) — same `loadAuthMenuMock.mockResolvedValue({ status: 'signed-in', detail: 'demo-a', kind: 'demo' })`
   setup and the same `vi.spyOn(HTMLFormElement.prototype, 'submit')` spy:

```tsx
    it('tears down the engine and wipes ss:v1:* state before submitting the switch', async () => {
      // …loadAuthMenuMock demo session setup…
      const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
      renderSettings()

      await userEvent.click(await screen.findByTestId('settings-demo-student-demo-b'))

      expect(signOutEngineMock).toHaveBeenCalledTimes(1)
      expect(clearLocalStateMock).toHaveBeenCalledTimes(1)
      expect(submitSpy).toHaveBeenCalledTimes(1)
      // Order is the bug: a debounced engine save landing after the clear would
      // re-create the previous persona's keys, and a POST that beats the wipe
      // would let the new persona boot on stale state.
      const disposeOrder = signOutEngineMock.mock.invocationCallOrder[0] as number
      const clearOrder = clearLocalStateMock.mock.invocationCallOrder[0] as number
      const submitOrder = submitSpy.mock.invocationCallOrder[0] as number
      expect(disposeOrder).toBeLessThan(clearOrder)
      expect(clearOrder).toBeLessThan(submitOrder)
    })
```

**Verify**:
`pnpm vitest run test/components/student-space/sheets/settings-sheet.test.tsx`
→ all pass; the file goes from 7 to 8 tests.

### Step 3: Full gate

**Verify**: `pnpm check` → exit 0 (warning count still 18).
**Verify**: `pnpm test` → ≥912 passed, 0 failed, 128 skipped.

## Test plan

- New case in `test/components/student-space/sheets/settings-sheet.test.tsx`:
  clicking a non-active persona calls `signOutEngine()`, then
  `clearStudentSpaceLocalState()`, then `form.submit()` — asserted via
  `mock.invocationCallOrder`. This *is* the regression test; the ordering is
  exactly what the DevPalette comment warns about.
- Must stay green unchanged: the three existing tests in
  `describe('Demo student switcher', …)`, plus
  `'Restart Onboarding wipes the slice and navigates to /onboarding'` (proves
  `handleRestart` was not collaterally changed).
- Structural pattern: the existing
  `'clicking a non-active persona submits a body-scoped form…'` test in the same
  file.
- Verification: `pnpm test` → 0 failures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed, 0 failed
- [ ] `grep -c 'signOutEngine' src/components/student-space/sheets/SettingsSheet.tsx` → 2
- [ ] `grep -c 'clearStudentSpaceLocalState' src/components/student-space/sheets/SettingsSheet.tsx` → 2
- [ ] `grep -c 'invocationCallOrder' test/components/student-space/sheets/settings-sheet.test.tsx` → ≥2
- [ ] `grep -rn 'function clearStudentSpaceLocalState' src/lib/` → exactly 1 match
      (no forked copy introduced)
- [ ] `git status` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `switchDemoStudent` does not match the "Current state" excerpt (drift) — in
  particular if it already calls either helper.
- Mocking `~/lib/sign-out-engine` breaks other tests in the same file (that
  module imports `~/lib/student-space/profile-tab-state`, and a wholesale
  `vi.mock` replaces the module for the whole file). If any of the other seven
  tests start failing, report rather than loosening assertions.
- `pnpm check` reports a Biome import-order error you cannot resolve by placing
  the two imports in alphabetical `~/` order.
- `grep -rn 'demo=1&student\|student: id' src/` reveals a **second** component
  that switches persona — it needs the same treatment; report before editing it.
- The fix appears to require touching `ProfileSheet.tsx` or the engine.

## Maintenance notes

- Reviewer should scrutinise: (1) `signOutEngine()` is called **before**
  `clearStudentSpaceLocalState()` — reversed, the bug silently returns and only
  the ordering assertion catches it; (2) both calls precede `form.submit()`;
  (3) the shared helpers are imported, not re-implemented.
- Any **future** surface that changes the active student (a counsellor
  "view as student" picker, a roster, deep-linking into another persona) must run
  the same two helpers. Until per-student `ss:v1:` key prefixing lands, the rule
  "identity change ⇒ dispose + clear" is enforced only by review.
- Deliberately deferred: consolidating `ProfileSheet.tsx`'s private
  `clearStudentSpaceLocalStateInline()` onto the shared helper — it would widen
  the diff into a 1600-line component and its test for no behavioural gain.
- Related: plan 044 gates the demo-persona mint behind `ENABLE_DEMO_PERSONAS`.
  Different files, either order; this plan's test runs under `NODE_ENV=test`, so
  044 does not affect it.
