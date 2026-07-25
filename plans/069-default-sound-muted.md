# Plan 069: Default the world's sound to muted

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/engine/student-space/Game/View/Sound.js src/components/student-space/hud/StudentSpaceHud.tsx test/components/student-space/hud/student-space-hud.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (demo)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

The world autoplays ambient music (streamed from `incompetech.com`) as soon as
the audio context unlocks. Operator direction: the demo should start silent —
unmuted audio is hostile in a classroom, a meeting room, or on a shared
screen-share, and the presenter currently has to find and hit the mute button
on every fresh load. The mute **button** already works correctly (verified in
a live browser: `aria-pressed` flips, the preference persists, and
`master.gain` actually goes to 0). Only the *default* is wrong.

## Current state

`src/engine/student-space/Game/View/Sound.js:878-882`, verbatim:

```js
    _loadMutePref()
    {
        try { return localStorage.getItem('ss.sound.muted') === '1' }
        catch(_) { return false }
    }
```

Because a missing key compares unequal to `'1'`, a first-time visitor (and any
browser with cleared storage) starts **unmuted**. It is read once at
construction — `Sound.js:116`: `this._muted = this._loadMutePref()`.

The paired writer, `Sound.js:883-887`, already persists both states explicitly,
so an unmuted user is recorded as `'0'` rather than as an absent key:

```js
    _savePref()
    {
        try { localStorage.setItem('ss.sound.muted', this._muted ? '1' : '0') }
        catch(_) {}
    }
```

That is what makes this change safe: `'0'` and "never chosen" are already
distinguishable, so defaulting to muted does **not** override a user who has
deliberately turned sound on.

Verified live in the browser before this plan was written, on `demo-a`:

| state | `aria-pressed` | `localStorage['ss.sound.muted']` | `sound.muted` | `master.gain.value` |
|---|---|---|---|---|
| fresh load | `true` | `null` | `false` | — |
| after 1 click | `false` | `'1'` | `true` | `0` |
| after 2 clicks | `true` | `'0'` | `false` | — |

Engine conventions: `src/engine/student-space/` is vanilla JS (no TypeScript,
no React imports) and is the canonical source — edit in place. Match the
surrounding brace-on-next-line style and 4-space indent exactly.

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`; Vitest in
`test/` mirroring `src/`; conventional commits (e.g.
`fix(history): bucket entry dates in Asia/Singapore, not UTC`). Baseline:
`pnpm check` exits 0 with 18 pre-existing lint warnings; `pnpm test` = 911
passed / 128 skipped / 0 failed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Route tree (fresh worktree only) | `pnpm build` | exit 0, ~5 s — see Environment |
| Check | `pnpm check` | exit 0, 18 warnings |
| Targeted | `pnpm exec vitest run test/components/student-space/hud/student-space-hud.test.tsx` | all pass |
| All tests | `pnpm test` | ≥911 passed, 0 failed |

## Environment

Your worktree shares git history but not `node_modules`: run `pnpm install`
first. Also `src/routeTree.gen.ts` is gitignored and generated only by the
`tanstackStart()` vite plugin, so a fresh worktree fails `tsc` with
`TS2307: Cannot find module '~/routeTree.gen'` until you run `pnpm build`
once (~5 s). Neither is a deviation.

## Scope

**In scope**:
- `src/engine/student-space/Game/View/Sound.js` — `_loadMutePref` only
- `test/components/student-space/hud/student-space-hud.test.tsx` — only if it
  asserts the old default (see Step 2)
- A new or extended test asserting the default (Step 3)

**Out of scope** (do NOT touch):
- `_savePref`, `_loadTrackPref`, `_saveTrackPref`, and every other method in
  `Sound.js`. Only the default changes.
- `src/components/student-space/hud/StudentSpaceHud.tsx` — the button derives
  its `aria-pressed` from engine state and needs no change. If you think it
  does, that is a STOP condition.
- The Mirror voice transport (`src/lib/student-space/realtime-mirror-client.ts`).
  It is WebRTC audio and does not route through this `Sound` engine — verified
  by grep. Muting ambient music must NOT silence the Mirror's replies.
- The `ss.sound.muted` storage key name, and the `'1'`/`'0'` encoding.
- Onboarding audio beats.

## Git workflow

- Branch: `advisor/069-default-sound-muted`
- Commit: `fix(sound): default the world to muted until the user opts in`
- Do NOT push or open a PR.

## Steps

### Step 1: Flip the default

In `src/engine/student-space/Game/View/Sound.js`, replace `_loadMutePref` with:

```js
    _loadMutePref()
    {
        // Default to MUTED. The world autoplays streamed ambient music, which
        // is hostile in a classroom, a meeting room, or a screen-share, so a
        // first-time visitor starts silent and opts in via the HUD toggle.
        // `_savePref` always writes an explicit '1'/'0', so a stored '0' means
        // "the user deliberately turned sound on" and must win over this
        // default; only an absent key falls through to muted.
        try
        {
            const stored = localStorage.getItem('ss.sound.muted')
            return stored === null ? true : stored === '1'
        }
        catch(_) { return true }
    }
```

Note the `catch` also becomes `true`: if storage is unavailable we cannot know
the user's choice, and silence is the safe failure.

**Verify**: `pnpm check` → exit 0, 18 warnings.
**Verify**: `grep -c "stored === null ? true" src/engine/student-space/Game/View/Sound.js` → `1`.

### Step 2: Check the existing HUD test for a baked-in assumption

`test/components/student-space/hud/student-space-hud.test.tsx` is the one test
file referencing the sound toggle. Read it. If any case asserts an initial
unmuted/`aria-pressed="true"` state derived from a real `Sound` instance, update
that case to the new default and say so in your report. If it uses a stubbed
sound object with an explicit `muted` value, it needs no change — do not touch it.

**Verify**: `pnpm exec vitest run test/components/student-space/hud/student-space-hud.test.tsx` → all pass.

### Step 3: Add a regression test for the default

Add a test that pins all three cases against `_loadMutePref`'s contract —
absent key → muted, `'0'` → unmuted, `'1'` → muted. The third case is the one
that proves you did not simply hardcode `true`.

Put it wherever it runs cleanly with the least ceremony: extend the HUD test
file if a `Sound` instance is already constructible there, otherwise create
`test/engine/Sound.mutePref.test.ts` and import the class directly
(`src/engine/student-space/Game/View/Sound.js`). If constructing `Sound`
requires a full WebAudio context that happy-dom cannot provide, do NOT build an
elaborate mock — instead test the pure decision by extracting nothing and
asserting via a small stub of `localStorage` around a direct
`Sound.prototype._loadMutePref.call({})` invocation, which needs no audio
context. State in your report which approach you used and why.

**Verify**: the new test fails if you temporarily revert Step 1 (run it, observe
the failure, restore). Report the observed failure message — a default test that
passes both before and after proves nothing.
**Verify**: `pnpm test` → ≥911 passed, 0 failed, skip count still 128.

### Step 4: Full gate

**Verify**: `pnpm check` → exit 0, 18 warnings.
**Verify**: `pnpm test` → 0 failed.
**Verify**: `git status` → only in-scope files modified.

## Done criteria

- [ ] `pnpm check` exits 0 with 18 warnings
- [ ] `pnpm test` exits 0, ≥911 passed, 0 failed, 128 skipped
- [ ] `grep -n "stored === null" src/engine/student-space/Game/View/Sound.js` → 1 match
- [ ] `grep -c "'ss.sound.muted'" src/engine/student-space/Game/View/Sound.js` → `2` (loader + saver, key unchanged)
- [ ] A test asserts all three cases (absent → muted, `'0'` → unmuted, `'1'` → muted)
- [ ] The negative control was run and its failure message is in the report
- [ ] `git status` shows only in-scope files

## STOP conditions

Stop and report if:

- `_loadMutePref` does not match the "Current state" excerpt (drift).
- The HUD button's `aria-pressed` no longer reflects the engine default, i.e.
  you find yourself needing to edit `StudentSpaceHud.tsx`.
- More than the one HUD test file fails after the change.
- You cannot construct a `Sound` instance and cannot test the decision without
  building a large WebAudio mock — report rather than mocking half of WebAudio.

## Maintenance notes

- Reviewer should scrutinise: a stored `'0'` still yields **unmuted** (a user
  who opted in is not re-muted on their next visit), and the storage key and
  encoding are unchanged so existing users' preferences survive.
- Anyone adding an "unmute" prompt or a first-run audio affordance later should
  key it off the absent-key case, which now means "never chosen" rather than
  "chose unmuted".
- The Mirror voice reply path is deliberately unaffected; if a future change
  routes Mirror audio through this `Sound` master gain, this default would
  silence the agent's voice and must be revisited.
