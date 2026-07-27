# Plan 073: Complete the route-change freeze — suspend audio with the render loop and stop the elapsed-time jump on resume

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d1ba3cc9..HEAD -- src/engine/student-space/Game/Game.js src/engine/student-space/Game/State/Time.js src/engine/student-space/Game/View/Sound.js test/engine/Game.setRenderActive.test.ts test/engine/Sound.mutePref.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / perf

- **Planned at**: commit `d1ba3cc9`, 2026-07-27

## Why this matters

The product intent is: navigating from the world (`/`) to any routed sheet
(`/profile`, `/history`, `/letters`, `/trajectory`, `/settings`) freezes the
3D scene, and returning resumes it. The **rendering** half already works —
`EngineHost` calls `game.setRenderActive(pathname === '/' || '/onboarding')`
and `Game.setRenderActive(false)` cancels the rAF loop, so state and view
stop ticking. Two gaps remain:

1. **Audio keeps playing on sheet routes.** `setRenderActive(false)` never
   suspends the AudioContext or pauses the streamed music `<audio>` element
   (`el.loop = true`), so ambience/music continues behind the sheet. A
   comment in `Game.js` even documents the *intended* behavior ("music …
   paused by `setRenderActive(false)`") that was never implemented. The
   hidden-tab path has the sibling bug: it suspends the AudioContext but
   not the stream element, which bypasses the Web Audio graph — so a
   streamed track keeps playing into a hidden tab.
2. **`Time.elapsed` leaps by the whole pause on resume.** `Time.update()`
   adds the raw delta into `elapsed` *before* clamping, so after a 2-minute
   stay on `/history` every `elapsed`-driven animation (wind, grass shader
   `uTime`, butterflies, fireflies) jumps discontinuously, and — worse —
   every deadline computed as `elapsed + duration` (weather phase ends,
   `Character.js:300` arrival deadlines) expires instantly on return to
   the world.

## Current state

- `src/engine/student-space/Game/Game.js` — engine composition root; owns
  the rAF loop.
  - `setRenderActive(active)` (lines 281–296): flips `_renderActive`,
    cancels/reschedules rAF. Does nothing about audio.
  - `_handleVisibilityChange()` (lines 121–147): on hidden, cancels rAF and
    `this.view?.sound?.ctx?.suspend?.()`; on visible (when `_running &&
    _renderActive`), `ctx?.resume?.()` and restarts the loop. The comment
    at lines 140–143:

```js
// Gate on `_renderActive` so audio doesn't resume while a routed
// sheet covers the world — otherwise music plays into a tab the
// user expects to be quiet (paused by `setRenderActive(false)`).
```

- `src/engine/student-space/Game/State/Time.js` — the whole file is 32
  lines. `update()` (lines 18–31):

```js
update()
{
    const current = Date.now() / 1000

    this.rawDelta = current - this.current
    this.delta = this.rawDelta
    this.elapsed += this.delta      // ← unclamped: jumps by the whole pause
    this.current = current

    if(this.delta > 60 / 1000)
    {
        this.delta = 60 / 1000      // ← clamp lands only after elapsed moved
    }
}
```

- `src/engine/student-space/Game/View/Sound.js` — audio system. Facts the
  new methods must respect:
  - `this.ctx` is **null until first user gesture** (`_unlock` at line 151,
    listeners for pointerdown/keydown/touchstart).
  - `this._muted` persists via `_loadMutePref` (there is a dedicated test,
    `test/engine/Sound.mutePref.test.ts`).
  - Streamed tracks live in `this._streamEls` (Map id → HTMLAudioElement,
    `el.loop = true`, created in `_ensureStream`, lines 257–283) and
    **bypass the Web Audio graph** — muting pauses them directly
    (`setMuted`, lines 162–183, which also shows the resume idiom:
    `el.play().catch(() => {})` only for the element whose id matches
    `this._trackId` and only when not muted).
  - The procedural music scheduler advances from `update()` (called from
    `View.update()` each frame), so it halts automatically when rAF stops;
    only already-scheduled Web Audio nodes and the stream element keep
    sounding — which is exactly what `suspend()` must silence.
- `test/engine/Game.setRenderActive.test.ts` — existing coverage of the
  rAF gating; use it as the structural pattern for new Game-level tests.
- `test/engine/Sound.mutePref.test.ts` — existing Sound test; use its
  setup/stub pattern (note: it stubs storage because `localStorage` is
  undefined under happy-dom).

Engine convention notes: the engine is vanilla JS (Allman braces, 4-space
indent, `try { … } catch(_) {}` guards around cross-subsystem calls — match
it exactly; this is deliberately different from the React/TS side). Per
`CLAUDE.md`, the engine is canonical and edited in place.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck + lint | `pnpm check`                  | exit 0 (18 pre-existing warnings are normal) |
| All tests | `pnpm test`                          | all pass            |
| Focused   | `pnpm test -- setRenderActive`       | all pass            |
| Focused   | `pnpm test -- Sound`                 | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/engine/student-space/Game/Game.js`
- `src/engine/student-space/Game/State/Time.js`
- `src/engine/student-space/Game/View/Sound.js`
- `test/engine/Game.setRenderActive.test.ts`
- `test/engine/Sound.mutePref.test.ts` (or a new sibling `test/engine/Sound.suspend.test.ts`)
- `test/engine/Time.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `src/components/student-space/EngineHost.tsx` — the host-side gating
  (`setRenderActive(isWorldRoute)`) is correct as-is.
- The mute default / HUD sound toggle — plan 069 owns mute-pref behavior
  (branch `advisor/069-default-sound-muted`, unmerged); do not change what
  `_loadMutePref` returns or you'll collide with it.
- Every consumer of `time.elapsed` (Wind, Weather, Grass, Butterflies,
  Character, …) — the clamp fix is deliberately made at the source so
  consumers stay untouched.

## Git workflow

- Branch: `advisor/073-route-freeze-audio-and-elapsed`
- Conventional commits, e.g. `fix(engine): suspend audio when the route pauses the render loop`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `suspend()` / `resume()` to Sound

In `Sound.js`, add two public methods (near `setMuted`):

- `suspend()`: `try { this.ctx?.suspend?.() } catch(_) {}`; then pause
  every element in `this._streamEls` (`el.pause()` in a try/catch). Track
  the suspension with a `this._suspended = true` flag so `resume()` and
  `setMuted()` can coordinate.
- `resume()`: set `this._suspended = false`; no-op the rest if `_muted`.
  Otherwise `try { this.ctx?.resume?.() } catch(_) {}` and re-play only the
  current track's element, mirroring the `setMuted(false)` idiom:
  the element for `TRACKS_BY_ID[this._trackId]` when that track is a
  stream, `el.play().catch(() => {})`.
- Guard `setMuted(false)`'s stream-resume so unmuting **while suspended**
  does not start playback (check `this._suspended` before `el.play()`), and
  initialize `this._suspended = false` in the constructor.

**Verify**: `pnpm check` → exit 0.

### Step 2: Wire suspend/resume into both pause paths in Game.js

1. `setRenderActive(false)` branch: after cancelling the rAF, add
   `try { this.view?.sound?.suspend?.() } catch(_) {}`.
2. `setRenderActive(true)` branch: alongside the existing resume condition
   (`this._running && !this._hidden && this._rafId == null`), call
   `try { this.view?.sound?.resume?.() } catch(_) {}` — only when that
   same condition holds, so flipping render-active while the tab is hidden
   doesn't resume audio into a hidden tab.
3. `_handleVisibilityChange()`: replace the raw
   `this.view?.sound?.ctx?.suspend?.()` / `ctx?.resume?.()` calls with
   `sound?.suspend?.()` / `sound?.resume?.()` (fixes the hidden-tab
   streamed-track leak). The resume call already sits behind
   `this._running && this._renderActive` — keep that.
4. Update the now-accurate comment at lines 140–143 if its wording no
   longer matches (it becomes true after this step).

**Verify**: `pnpm test -- setRenderActive` → existing tests still pass
(new ones come in Step 4).

### Step 3: Clamp delta before accumulating elapsed in Time.js

Rewrite `update()`:

```js
update()
{
    const current = Date.now() / 1000

    this.rawDelta = current - this.current
    this.delta = Math.min(this.rawDelta, 60 / 1000)
    this.elapsed += this.delta
    this.current = current
}
```

`rawDelta` keeps the true wall-clock delta (nothing currently reads it for
animation, but preserve it), `delta` and `elapsed` both become pause-proof.
At a normal 60 fps frame (≈16 ms < 60 ms) behavior is bit-identical.

**Verify**: `pnpm check` → exit 0.

### Step 4: Tests

1. `test/engine/Time.test.ts` (new; plain unit test, no engine boot):
   construct `Time`, tick once, then monkeypatch/advance `Date.now` (use
   `vi.spyOn(Date, 'now')` or `vi.useFakeTimers`) by 120 000 ms and tick
   again → assert `delta === 60/1000` AND `elapsed` grew by exactly
   `60/1000` (not 120), and `rawDelta ≈ 120`.
2. Extend `test/engine/Game.setRenderActive.test.ts` (follow its existing
   stub pattern): a fake `view.sound` with `suspend`/`resume` spies →
   `setRenderActive(false)` calls `suspend` once; `setRenderActive(true)`
   calls `resume` once; `setRenderActive(true)` while `_hidden` is true
   does NOT call `resume`.
3. Sound tests (extend `Sound.mutePref.test.ts` or create
   `test/engine/Sound.suspend.test.ts` following its storage-stub setup):
   - `suspend()` with a stubbed `ctx` calls `ctx.suspend` and pauses every
     stream element;
   - `resume()` when muted does not call `ctx.resume` and plays nothing;
   - `setMuted(false)` while suspended does not call `el.play`; after
     `resume()` it does.

**Verify**: `pnpm test -- Time` → pass. `pnpm test -- setRenderActive` →
pass. `pnpm test -- Sound` → pass.

### Step 5: Full gates

**Verify**: `pnpm check` → exit 0. `pnpm test` → all pass.

## Test plan

Covered in Step 4: three new/extended test files — Time clamp-order,
Game suspend/resume wiring (both route and visibility paths), Sound
suspend/resume semantics incl. the muted and suspended-unmute edges.
Pattern files: `test/engine/Game.setRenderActive.test.ts`,
`test/engine/Sound.mutePref.test.ts`.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, including the new Time/Sound/Game cases
- [ ] `grep -n "ctx?.suspend" src/engine/student-space/Game/Game.js` → no matches (Game talks to `sound.suspend()/resume()`, never to the ctx directly)
- [ ] `grep -n "elapsed += this.delta" src/engine/student-space/Game/State/Time.js` shows the clamped-delta accumulation (clamp happens before the `+=` line)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- You find a consumer that genuinely needs wall-clock `elapsed` across
  pauses (search first: `grep -rn "time.elapsed" src/engine`) — none was
  found when this plan was written; if one appeared, report it.
- Plan 069's branch has merged and changed `Sound.js`'s mute-pref area in a
  way that conflicts with Step 1 — reconcile is a reviewer decision, not
  yours.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any future audio source added to Sound (new stream map, one-shot SFX
  buffers) must be covered by `suspend()`; reviewers of audio PRs should
  ask "does this stop when suspended?".
- `elapsed` is now a *pause-aware animation clock*, not wall time. Anything
  needing real elapsed wall time must use `Date.now()` or `rawDelta`
  accumulation — note this in review if a consumer starts misusing it.
- Deferred: whether to also `renderer.setAnimationLoop(null)` / free GPU
  resources on long dwells — out of scope; the canvas stays warm for cheap
  resume by design (`EngineHost.tsx` comment, lines 127–129).
