# Plan 026: Island editor — click-to-move command + stops sleep instead of waving

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), report in the STATUS/STEPS/FILES CHANGED/NOTES format.
>
> **Drift check (run first)** — `<BASE>` = the commit named in your dispatch:
> `git diff --stat <BASE>..HEAD -- island-editor/src/models/characterBehavior.ts island-editor/src/scene/CharacterActor.tsx island-editor/src/scene/IslandTerrain.tsx island-editor/src/App.tsx island-editor/test/characterBehavior.test.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P1 (maintainer feature request)
- **Effort**: M
- **Risk**: MED (reworks plan-025's machine transitions + first use of a
  click-vs-drag gesture on the terrain)
- **Depends on**: plan 025 merged (tip `9dd8921` contains it)
- **Category**: direction (feature)
- **Planned at**: commit `9dd8921`, 2026-07-12

## Why this matters

Two maintainer changes to the autonomous character (plan 025):

1. **Click-to-move**: the user clicks a spot on the island and the bird walks
   (or swims) there.
2. **Stops sleep**: when the bird stops wandering, do NOT play the hi/wave
   clip — it lies down and sleeps, then plays the wake-up clip, then walks
   on. (The `hi` phase is removed from the machine; `Wave_for_Help_2` stays
   available via the dock's manual override.)

Decided mechanisms (do not re-litigate):

- **The command gesture is a drag-free click while the camera is in orbit
  mode** (the hotbar Camera tool, or hold-Space). In those modes the terrain
  handlers currently early-return, so the click is an unclaimed gesture; in
  paint modes clicks must keep painting. Click = pointer-down + pointer-up
  with < 6 px of screen travel (a drag is an orbit).
- **Command routing via a mutable module singleton** —
  `src/scene/characterCommand.ts`, mirroring the existing
  `src/scene/characterPose.ts` pattern (per-frame data never flows through
  React state; at most one character exists). App writes it; the actor's
  `useFrame` consumes it by sequence number.
- **The goto phase lives in the pure machine** (`characterBehavior.ts`) like
  every other behavior — headless-testable, no three imports.

## Current state (verified at `9dd8921`)

Gate: `pnpm check:island-editor` from the worktree root — 23 files / 223
tests green at this commit.

### `src/models/characterBehavior.ts` (the whole machine — plan 025)

Phases `'walk' | 'hi' | 'sleep' | 'wake' | 'swim' | 'talk'`. State
`{ phase, x, z, yaw, remaining }`. Env
`{ heightAt, shoreDistanceAt, seaLevel, worldSize, rand }`. Constants:
`WALK_SPEED 0.5`, `SWIM_SPEED 0.32`, `MAX_SWIM_DIST 1.6`, `TALK_SECONDS
3.5`, private `MAX_DT 0.1`, `WANDER_TURN 1.6`, `HI_SECONDS 2.8`,
`WAKE_SECONDS 2.6`, `SWIM_STEER 2.4`, `EDGE_MARGIN 1`, `WATER_EPS 0.02`.
Movement convention `x += sin(yaw)·v·dt, z += cos(yaw)·v·dt`; center turn
`yaw = atan2(-x, -z)`. Key transitions today:

- walk: wander drift; world-edge turn; water → `swim`; expiry → `hi`
  (2.8 s).
- hi: expiry → 70 % walk (`rollWalk`, 4–9 s) / 30 % sleep (6–12 s).
- sleep → wake (2.6 s) → walk. swim: leash refuses candidate steps
  (`shoreDistanceAt(next) > MAX_SWIM_DIST` → `yaw += SWIM_STEER·dt`), exits
  ashore → walk. talk: `triggerTalk` from any phase, 3.5 s, → walk.
- `behaviorClip(phase)`: walk→Walking, hi→Wave_for_Help_2,
  sleep→Stand_To_Side_Lying, wake→Wake_Up_and_Look_Up, swim→Swim_Forward,
  talk→Talk_Passionately.

### `src/scene/CharacterActor.tsx` (the driver — plan 025)

Behavior state in `stateRef` (reset keyed `[o.id, o.c, o.r]`); env memo
(heightAt/shoreDistanceAt/seaLevel/worldSize/seeded rand); `useFrame`:
reduced-motion pins home; `clip === 'auto'` → `advanceBehavior`; y = ground
or `seaLevel - SWIM_SINK (0.12)` when `phase === 'swim'`; writes the
`characterPose` singleton; mirrors `behaviorClip(phase)` into
`resolvedClip` state on change (drives the 0.25 s crossfade effect);
pointer-down: placeMode → remove; else `stopPropagation()` + `triggerTalk`.

### `src/scene/characterPose.ts` (the pattern to mirror)

```ts
export const characterPose = { x: 0, y: 0, z: 0, active: false }
```

### `src/scene/IslandTerrain.tsx` pointer surface

Props include `cameraMode?: boolean`, `onPlaceHover/onPlaceClick/
onPaintStart/onPaint/onPaintEnd`. Handlers (exact current shape):

```tsx
  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    // Hold-Space: let the drag reach OrbitControls instead of painting/placing.
    if (cameraMode) return
    if (placeMode) { e.stopPropagation(); onPlaceClick?.(e.point.x, e.point.z); return }
    …paint path…
  }
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (cameraMode) { if (cursorRef.current) cursorRef.current.visible = false; return }
    …
  }
  …
      <mesh … onPointerDown={handleDown} onPointerMove={handleMove} onPointerOut={handleOut} />
```

`App.tsx` passes `cameraMode={orbiting}` (true for hold-Space OR the hotbar
Camera tool) into IslandTerrain.

### `test/characterBehavior.test.ts`

223-test suite includes: walk→hi expiry; hi→walk and hi→sleep branches;
sleep→wake→walk durations; movement convention; swim entry; leash holds
position; talk from walk and sleep; world-edge; determinism; shore sampler.
The hi-related cases must be REWRITTEN by this plan (the phase disappears).

## Scope

**In scope**:

- `island-editor/src/models/characterBehavior.ts` (machine rework)
- `island-editor/src/scene/characterCommand.ts` (create)
- `island-editor/src/scene/CharacterActor.tsx` (consume commands; clip
  resolution)
- `island-editor/src/scene/IslandTerrain.tsx` (click-vs-drag command gesture)
- `island-editor/src/App.tsx` (one new IslandTerrain prop wiring ONLY)
- `island-editor/test/characterBehavior.test.ts` (rewrite hi cases + new
  goto cases)

**Out of scope**: AnimationDock (unchanged — `Wave_for_Help_2` stays
manually selectable), GrassLayer/materials, spec/codec/persistence,
place/remove/paint behavior in non-camera modes, OrbitControls config,
`characterPose.ts`.

## Git workflow

Branch `advisor/026-click-to-move` off `9dd8921`. Commit:
`feat(island-editor): click-to-move command; stops sleep instead of waving`.
Do NOT push.

## Steps

### Step 1: Machine rework (pure)

In `characterBehavior.ts`:

1. **Remove the `hi` phase** (type, transition, clip mapping, `HI_SECONDS`).
   Walk expiry now goes straight to sleep with a shorter roll:
   `s.phase = 'sleep'; s.remaining = 5 + rand() * 4` (5–9 s — every stop is
   a nap now, so it's shorter than 025's occasional 6–12 s). sleep → wake
   (`WAKE_SECONDS` 2.6) → walk stays.
2. **Add the `goto` phase.** State gains `tx: number`, `tz: number`,
   `gotoPending: boolean` (initialize `0/0/false` in
   `createBehaviorState`). New export:

```ts
/** Player command: walk/swim to (x,z). From sleep, wake first (the wake clip
 *  plays), then go; from any other phase, go immediately. */
export function commandMoveTo(s: BehaviorState, x: number, z: number): void {
  s.tx = x
  s.tz = z
  if (s.phase === 'sleep') {
    s.phase = 'wake'
    s.remaining = WAKE_SECONDS
    s.gotoPending = true
  } else {
    s.phase = 'goto'
    s.gotoPending = false
  }
}
```

   - `wake` expiry: `if (s.gotoPending) { s.gotoPending = false; s.phase = 'goto' } else rollWalk(…)`.
   - **goto tick**: steer the yaw toward the target with a bounded turn:
     compute `want = Math.atan2(s.tx - s.x, s.tz - s.z)`, take the shortest
     angular difference into [-π, π], clamp its magnitude to
     `GOTO_TURN * dt` (`const GOTO_TURN = 3.5` rad/s), apply. Determine
     footing: `wet = env.heightAt(s.x, s.z) <= env.seaLevel + WATER_EPS`;
     speed = wet ? `SWIM_SPEED` : `WALK_SPEED`. Candidate step along yaw;
     if the candidate is in water AND
     `env.shoreDistanceAt(nx, nz) > MAX_SWIM_DIST` → the leash blocks the
     route: **abandon the target** (`s.phase = wet ? 'swim' : 'walk'`,
     re-roll walk duration via `rollWalk` when dry) — deterministic, no
     endless circling. Otherwise take the step. **Arrival**: when
     `(tx-x)² + (tz-z)² < 0.04` (0.2 u) → it stopped → per rule 2 sleep:
     `s.phase = 'sleep'; s.remaining = 5 + rand() * 4`.
   - `triggerTalk` still wins from any phase (including goto — the target is
     simply dropped; do NOT resume it after talk).
3. **Water-aware clip for goto**: add a `wet: boolean` field to
   `BehaviorState` (maintained at the END of every `advanceBehavior` call:
   `s.wet = env.heightAt(s.x, s.z) <= env.seaLevel + WATER_EPS`) and change
   the mapper signature to take the state:

```ts
export function behaviorClip(s: Pick<BehaviorState, 'phase' | 'wet'>): CharacterClip
```

   goto → `s.wet ? 'Swim_Forward' : 'Walking'`; swim → `Swim_Forward`; the
   rest map as before (minus hi). Keep the swim-draught decision OUT of the
   mapper (the actor uses `s.wet || s.phase === 'swim'` for y — Step 3).

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0 (expect actor
errors until Step 3 — run again after it; report both).

### Step 2: The command singleton + terrain gesture

1. `src/scene/characterCommand.ts` (new, mirrors characterPose.ts):

```ts
// Click-to-move command channel (plan 026): IslandTerrain (via App) bumps
// `seq` with a target; CharacterActor's useFrame consumes it when the seq
// changes. Mutable module singleton on purpose — same rationale as
// characterPose.ts (per-frame data, single character).
export const characterCommand = { seq: 0, x: 0, z: 0 }
export function issueMoveCommand(x: number, z: number): void {
  characterCommand.x = x
  characterCommand.z = z
  characterCommand.seq++
}
```

2. `IslandTerrain.tsx`: add prop `onCommandMove?: (x: number, z: number) => void`.
   Track the camera-mode click gesture with a ref
   `const camDown = useRef<{ sx: number; sy: number } | null>(null)`:
   - In `handleDown`'s `if (cameraMode)` branch (currently a bare
     `return`): `camDown.current = { sx: e.nativeEvent.clientX, sy: e.nativeEvent.clientY }`
     then return (do NOT stopPropagation — the drag must still reach
     OrbitControls).
   - New `handleUp = (e: ThreeEvent<PointerEvent>)`: if `cameraMode` and
     `camDown.current` and
     `Math.hypot(e.nativeEvent.clientX - sx, e.nativeEvent.clientY - sy) < 6`
     → `onCommandMove?.(e.point.x, e.point.z)`. Always clear
     `camDown.current`. Attach `onPointerUp={handleUp}` on the SAME mesh.
   - Non-camera modes: `handleUp` does nothing except clearing the ref.
3. `App.tsx`: import `issueMoveCommand` and pass
   `onCommandMove={issueMoveCommand}` to `<IslandTerrain …>` — nothing else
   changes in App.

**Verify**: `npx tsc --noEmit` → exit 0 (post-Step-3);
`grep -n "onPointerUp" island-editor/src/scene/IslandTerrain.tsx` → hit.

### Step 3: Actor consumes commands + new clip resolution

`CharacterActor.tsx`:

1. Track `const lastSeq = useRef(characterCommand.seq)` — initialize to the
   CURRENT seq at mount (stale pre-mount clicks must not fire).
2. In `useFrame`, before advancing: if `clip === 'auto'` and
   `characterCommand.seq !== lastSeq.current`, set
   `lastSeq.current = characterCommand.seq` and
   `commandMoveTo(stateRef.current, characterCommand.x, characterCommand.z)`.
   When `clip !== 'auto'`, still sync `lastSeq.current` (swallow commands —
   manual override ignores them rather than queueing).
3. Clip resolution: `behaviorClip(s)` (new signature).
4. Swim draught: y uses `s.phase === 'swim' || (s.phase === 'goto' && s.wet)`
   → `seaLevel - SWIM_SINK`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Tests

`test/characterBehavior.test.ts` (rewrite + extend; keep the fake-env
style):

- REWRITE: walk expiry → `sleep` (not hi); sleep 5–9 s → wake → walk (the
  70/30 branch test disappears with the phase).
- KEEP (unchanged semantics): movement convention, swim entry, leash
  holds position, talk from walk and sleep, world-edge, determinism, shore
  sampler.
- NEW goto cases:
  1. `commandMoveTo` from walk → phase `goto`; repeated ticks converge on
     the target (distance strictly decreases over a second of ticks) and
     arrival within 0.2 u → phase `sleep`.
  2. `commandMoveTo` from sleep → phase `wake` with `gotoPending`; after
     `WAKE_SECONDS` → `goto` (not walk).
  3. Steering bound: a target directly behind (yaw off by π) never turns
     more than `3.5 * dt` per tick (assert yaw delta per tick).
  4. Water crossing: env with a wet strip between start and target → clip
     mapping flips to `Swim_Forward` (via `behaviorClip({phase:'goto',
     wet:true})`) and back.
  5. Leash abandon: env whose `shoreDistanceAt` blocks every step toward
     the target → target abandoned (phase returns to walk/swim), and the
     bird does NOT sit in goto forever.
  6. `triggerTalk` during goto → talk, then walk (target dropped).
- `behaviorClip` no longer accepts `'hi'` (type-level; just don't test it).

**Verify**: `cd island-editor && pnpm test` → all pass; report exact count.

### Step 5: Gate

`pnpm check:island-editor` (worktree root) → exit 0. Reviewer runs the
browser pass: Camera-tool click sends the bird (walk/swim) to the point;
orbit drags do NOT send it; paint clicks still paint; stops now nap and
wake; clicking the bird still talks.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "'hi'" island-editor/src/models/characterBehavior.ts` → no hits
- [ ] `grep -n "commandMoveTo" island-editor/src/models/characterBehavior.ts island-editor/src/scene/CharacterActor.tsx` → defined + consumed
- [ ] `grep -n "issueMoveCommand" island-editor/src/App.tsx island-editor/src/scene/characterCommand.ts` → wired + defined
- [ ] `grep -n "onCommandMove" island-editor/src/scene/IslandTerrain.tsx` → prop + call
- [ ] `git status` — only the six in-scope files

## STOP conditions

- `e.nativeEvent.clientX` is not available on the r3f `ThreeEvent` in this
  three/r3f version — check the actual event shape first; if truly absent,
  report rather than switching to a different event system.
- The gesture can't be made to coexist with OrbitControls (e.g. pointer-up
  never fires on the mesh after a drag) — report with evidence; do not
  reach for global window listeners.
- You find yourself modifying paint/place behavior in non-camera modes.

## Maintenance notes

- Knobs: `GOTO_TURN` (responsiveness), arrival radius (0.2), stop-nap
  duration (5–9 s).
- A click target on WATER is legal: the bird swims as close as the leash
  allows, then abandons — consider a "reachable preview" marker later.
- `Wave_for_Help_2` is now machine-unused; if a future "greet" trigger
  returns (e.g. proximity greeting), re-add a phase rather than overloading
  talk.
- Reviewer focus: the click-vs-drag threshold on a real orbit gesture (a
  sloppy click that moves 7 px does nothing — acceptable?); command while
  manual override (swallowed, by design); the leash-abandon determinism.
