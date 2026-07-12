# Plan 025: Island editor — autonomous character behavior (wander / rest / swim / greet / talk)

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), report in the STATUS/STEPS/FILES CHANGED/NOTES format.
>
> **Drift check (run first)** — `<BASE>` is the commit named in your dispatch
> message (the feat/island-editor-v2 tip WITH plan 024 merged):
> `git diff --stat <BASE>..HEAD -- island-editor/src/scene/CharacterActor.tsx island-editor/src/scene/GrassLayer.tsx island-editor/src/ui/AnimationDock.tsx island-editor/src/App.tsx island-editor/src/models/characterAsset.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P1 (maintainer feature request)
- **Effort**: L
- **Risk**: MED-HIGH (first per-frame gameplay logic in the editor; touches
  App state, the actor, and the plan-024 grass-fade integration)
- **Depends on**: **plan 024 MERGED** (its GrassLayer character-fade uniform
  is upgraded here from spec-static to live-tracking; its maintenance note
  anticipates exactly this change)
- **Category**: direction (feature)
- **Planned at**: 2026-07-12, written against `74e9392` + plan 024

## Why this matters

The maintainer wants the placed chick to live on the island instead of
looping one clip in place:

1. **Wanders** around the island, **stops**, sometimes **sleeps**, then
   **wakes up** and walks on.
2. When it wanders into water it **swims**, but is leashed — it can't go far
   from the island's shore.
3. Cliffs: no jump animation exists yet, so walking over a cliff edge just
   snaps to the new ground height ("jumps through the cliff") — explicitly
   accepted for now, a jump clip comes later.
4. When it stops, it **says hi** (the wave clip).
5. **Clicking** the character plays a **talk** animation.
6. The AnimationDock **clip chooser stays** as a manual override.

Everything needed is already in the asset — `CHARACTER_CLIPS`
(`src/models/characterAsset.ts`, guarded by `test/characterClips.test.ts`):
`Walking`, `Running`, `Skip_Forward`, `Wave_for_Help_2` (the "hi"),
`Talk_Passionately` (+2 more talk variants), `Wake_Up_and_Look_Up`,
`Stand_To_Side_Lying` (the sleep pose), `Swim_Forward`.

Decided mechanisms (do not re-litigate):

- **Pure state machine, driven from the actor's `useFrame`.** All decision
  logic lives in a new NO-three module so it unit-tests in node (repo
  convention — grassField/shoreField/cameraOps are all pure). The actor
  only applies the result (position/yaw/clip).
- **Movement is runtime-only.** The spec still stores the placed cell (the
  character's "home"); wandering never writes to the spec, undo/redo and
  save/load are unaffected. Reload restarts the walk from home.
- **Swim leash via `shoreDistanceField`** (`src/terrain/shoreField.ts`) —
  signed world-unit distance, POSITIVE on water. Already recomputed per grid
  edit for the sea shader; the behavior env samples the same field.
- **Manual override pauses autonomy.** Dock selection `'auto'` (new, default)
  runs the behavior; picking any concrete clip freezes the character where
  it stands and loops that clip (the pre-025 behavior).
- **Grass fade follows the LIVE character** via a tiny shared mutable pose
  store written in the actor's `useFrame` and read in GrassLayer's
  `useFrame` — no React state, no per-frame re-renders (same philosophy as
  the engine's use-world-position pattern).

## Current state (verified at `74e9392`; plan 024 adds the pieces noted)

Gate: `pnpm check:island-editor` from the repo/worktree root (baseline after
024: whatever its report states — record your own baseline count first).

### `src/scene/CharacterActor.tsx` (full behavior surface today)

Props `{ spec, object, blurred, placeMode, onRemove, clip: CharacterClip }`.
`useObjectModel('character', …)` returns the scaled SkeletonUtils-clone
wrapper; drei `useAnimations(animations, groupRef)`; one effect plays
`actions[clip]` with 0.25s fade in/out; static placement:

```tsx
  const { x, y, z } = worldPositionOfObject(spec, o, blurred)
  …
    <group ref={groupRef} position={[x, y, z]} rotation={[0, o.yaw, 0]}
      onPointerDown={(e) => { if (!placeMode) return; e.stopPropagation(); onRemove(o.id) }}
```

`blurred` comes from PlacedObjects (`blurTiers(spec.grid)` memo).

### `src/ui/AnimationDock.tsx`

Bottom-center dock, props `{ clip: CharacterClip, onPrev, onNext }`, label =
`clip.replace(/_/g, ' ')`, index = `CHARACTER_CLIPS.indexOf(clip) + 1` shown
as "n / 10".

### `src/App.tsx`

```ts
  const [clip, setClip] = useState<CharacterClip>(DEFAULT_CLIP)   // line ~91
  …
  const cycleClip = … (index math over CHARACTER_CLIPS)           // line ~297
  …
  <PlacedObjects spec={spec} placeMode={placeMode} onRemove={removeObj} clip={clip} />
  {hasCharacter && <AnimationDock clip={clip} onPrev={prevClip} onNext={nextClip} />}
```

### Terrain queries available (all pure, `src/terrain/`)

- `evaluateHeight(spec, x, z, blurred)` — terrain height at any world x/z.
- `shoreDistanceField(grid, worldSize, scale=2)` → `{ res, data }`, signed
  world units, + on water, row-major lattice over the square world
  (x,z ∈ [-worldSize/2, worldSize/2]). No point-sampler exists — this plan
  adds one (Step 1).
- `spec.seaLevel` (0 in practice), `spec.worldSize` (24).

### Plan-024 pieces this plan builds on (verify they exist in your base)

- `GrassBladeMaterial` uniforms `uCharPos` (vec4, .w = on/off), fade/bend
  knobs; GrassLayer writes `uCharPos` from the spec in its spec-keyed effect.
- `grep -n "uCharPos" island-editor/src/scene/GrassLayer.tsx` must hit — if
  it doesn't, plan 024 is not in your base: STOP.

## Scope

**In scope**:

- `island-editor/src/models/characterBehavior.ts` (create — pure)
- `island-editor/src/scene/characterPose.ts` (create — shared mutable pose)
- `island-editor/src/scene/CharacterActor.tsx` (behavior driver)
- `island-editor/src/scene/GrassLayer.tsx` (fade uniform: live pose)
- `island-editor/src/ui/AnimationDock.tsx` ('Auto' entry)
- `island-editor/src/App.tsx` (clip state type + cycle order ONLY)
- `island-editor/src/models/characterAsset.ts` (add the ClipSelection type +
  behavior clip map — keep CHARACTER_CLIPS itself untouched)
- `island-editor/test/characterBehavior.test.ts` (create)
- `island-editor/test/shoreSample.test.ts` (create, or fold into the
  behavior test file)

**Out of scope**: spec/codec/persistence (movement is runtime-only),
`PlacedObjects.tsx` beyond the widened clip prop type if TS requires it,
terrain/sea/grass shaders (except the named GrassLayer uniform write),
`useObjectModel`, place/remove interactions, CameraDock/ToolPanel.

## Git workflow

Branch `advisor/025-character-behavior` off the tip named in your dispatch.
Commit: `feat(island-editor): autonomous character — wander, sleep, swim
leash, greet, click-to-talk`. Do NOT push.

## Steps

### Step 1: Shore sampler (pure)

In `src/models/characterBehavior.ts` (new file, NO three/r3f imports —
header comment in the style of `src/terrain/grassField.ts`), add and export:

```ts
import type { ShoreField } from '../terrain/shoreField'

/** Nearest-lattice sample of the signed shore distance (+ = water) at world (x,z). */
export function sampleShoreDistance(field: ShoreField, worldSize: number, x: number, z: number): number {
  const half = worldSize / 2
  const step = worldSize / field.res
  const i = Math.min(field.res - 1, Math.max(0, Math.floor((x + half) / step)))
  const j = Math.min(field.res - 1, Math.max(0, Math.floor((z + half) / step)))
  return field.data[j * field.res + i]
}
```

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 2: The behavior machine (pure)

Same file. Public surface:

```ts
export type BehaviorPhase = 'walk' | 'hi' | 'sleep' | 'wake' | 'swim' | 'talk'

export interface BehaviorState {
  phase: BehaviorPhase
  x: number
  z: number
  yaw: number
  /** Seconds remaining in the current phase. */
  remaining: number
}

export interface BehaviorEnv {
  heightAt(x: number, z: number): number
  shoreDistanceAt(x: number, z: number): number
  seaLevel: number
  worldSize: number
  /** Seeded stream (mulberry32) — NO Math.random (repo rule). */
  rand(): number
}

export const WALK_SPEED = 0.5      // world units/s (world is 24 wide)
export const SWIM_SPEED = 0.32
export const MAX_SWIM_DIST = 1.6   // leash: max signed shore distance while swimming
export const TALK_SECONDS = 3.5

export function createBehaviorState(x: number, z: number, yaw: number, rand: () => number): BehaviorState
export function advanceBehavior(s: BehaviorState, dt: number, env: BehaviorEnv): void  // mutates s
export function triggerTalk(s: BehaviorState): void
export function behaviorClip(phase: BehaviorPhase): CharacterClip
```

Machine rules (implement exactly; keep each transition commented):

- **walk**: move forward `WALK_SPEED * dt` along yaw; wander by
  `yaw += (rand()-0.5) * 1.6 * dt`. Phase lasts 4–9 s (`4 + rand()*5`).
  On expiry → **hi** for 2.8 s. World-edge leash: if `|x|` or `|z|` would
  exceed `worldSize/2 - 1`, turn toward the center (`yaw = atan2(-z, -x)`
  … use `Math.atan2(-x, -z)` matched to the movement convention below).
- **Movement convention** (use consistently everywhere):
  `x += Math.sin(yaw) * speed * dt; z += Math.cos(yaw) * speed * dt` —
  matches three.js group `rotation.y = yaw` facing +Z at yaw 0.
- **hi** (stopped, waving): no movement. On expiry → 70 % **walk**, 30 %
  **sleep** (6–12 s).
- **sleep**: no movement. On expiry → **wake** (2.6 s) → **walk**.
- **swim**: entered from ANY moving phase when
  `heightAt(x,z) <= seaLevel + 0.02` after a move. Moves at `SWIM_SPEED`.
  Leash: if `shoreDistanceAt` at the CANDIDATE next position `>
  MAX_SWIM_DIST`, do not take the step — instead steer home:
  `yaw += 2.4 * dt` (keep turning until a step becomes legal). Exits to
  **walk** when `heightAt(x,z) > seaLevel + 0.02` (walked back ashore).
  Never transitions to hi/sleep while in water; re-roll walk duration on
  exit.
- **talk**: `triggerTalk` puts the machine in talk for `TALK_SECONDS` from
  ANY phase (including sleep — it's fine to be woken by a click); no
  movement; on expiry → **walk**.
- Clamp `dt` to ≤ 0.1 s at the top of `advanceBehavior` (tab-switch guard).
- `behaviorClip` map: walk→`Walking`, hi→`Wave_for_Help_2`,
  sleep→`Stand_To_Side_Lying`, wake→`Wake_Up_and_Look_Up`,
  swim→`Swim_Forward`, talk→`Talk_Passionately`.

In `src/models/characterAsset.ts` add (keep everything else byte-identical):

```ts
/** Dock selection: 'auto' = behavior machine drives the clip (plan 025). */
export type ClipSelection = CharacterClip | 'auto'
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Shared live pose store

`src/scene/characterPose.ts` (new, tiny):

```ts
// Live world pose of the (single) placed character, written by
// CharacterActor's useFrame and read by GrassLayer's useFrame (plan-024 fade
// disc follows the roaming chick). A mutable module singleton on purpose:
// per-frame data must not flow through React state (no re-renders), and the
// editor has at most one character (withSingleCharacter, plan 017).
export const characterPose = { x: 0, y: 0, z: 0, active: false }
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Drive it from CharacterActor

Rework `CharacterActor.tsx` (keep the model/mixer/hover/remove scaffolding):

1. Props: `clip` becomes `ClipSelection`.
2. Build the env per spec change:
   `const shore = useMemo(() => shoreDistanceField(spec.grid, spec.worldSize), [spec])`
   and an env memo wrapping `evaluateHeight(spec, x, z, blurred)`,
   `sampleShoreDistance(shore, spec.worldSize, x, z)`, `spec.seaLevel`,
   `spec.worldSize`, and `mulberry32(hashString(o.id) ^ 0x9e3779b9)`.
3. Behavior state in a ref, created from the placed home
   (`worldPositionOfObject`) + `o.yaw`; RESET it when `o.id` or the spec's
   home cell changes (keyed effect), so re-placing restarts the walk.
4. `useFrame((_, dt) => …)`:
   - if `prefers-reduced-motion` (copy the matchMedia-once memo from
     `GrassLayer.tsx`): no movement, hold the Walking pose paused at t=0 —
     set position to home; skip the rest.
   - if `clip !== 'auto'` (manual override): freeze in place (do not
     advance), current position stays wherever the walk left it.
   - else `advanceBehavior(state, dt, env)`.
   - Resolve `y`: `const ground = heightAt(x,z)`; on land `y = ground`;
     when `phase === 'swim'` → `y = seaLevel - SWIM_SINK` with
     `const SWIM_SINK = 0.12` (waterline at the chick's belly — a look
     knob; the clip is horizontal so the group needs no pitch).
   - Apply to the group: `position.set(x, y, z)`, `rotation.y = yaw`.
   - Write `characterPose`: `{x, y, z, active: true}` (and an unmount
     cleanup effect sets `active = false`).
5. Clip resolution: `const resolved = clip === 'auto' ? behaviorClip(phase) : clip`.
   Feed the existing fade-in/out effect with `resolved` instead of `clip`
   (dependency array `[actions, resolved]`) — crossfades already work.
   For `sleep`, additionally set `action.clampWhenFinished = true` and
   `action.setLoop(THREE.LoopOnce, 1)` is NOT needed — `Stand_To_Side_Lying`
   loops acceptably; keep default looping for every clip (simplest; the
   reviewer judges the look).
6. Click-to-talk: extend `onPointerDown` — in placeMode keep the remove
   behavior EXACTLY as-is; when NOT in placeMode: `e.stopPropagation()`
   (prevents painting under the chick) and `triggerTalk(stateRef.current)`
   (only meaningful in 'auto'; harmless otherwise).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Live grass fade (plan-024 integration)

`GrassLayer.tsx`: keep the spec-keyed effect's `uCharPos` write as the
fallback, and ADD in the existing `useFrame` (after the uTime line):

```ts
    if (characterPose.active) {
      ;(material.uniforms.uCharPos.value as THREE.Vector4).set(
        characterPose.x, characterPose.y, characterPose.z, 1)
    }
```

Import `characterPose` from `./characterPose`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: 'Auto' in the dock + App state

1. `App.tsx`: `useState<ClipSelection>('auto')`; cycle order becomes
   `['auto', ...CHARACTER_CLIPS]` (update the index math in `cycleClip`);
   prop threading (`PlacedObjects` → `CharacterActor`) types widen to
   `ClipSelection` — do not change anything else in App.
2. `AnimationDock.tsx`: props take `ClipSelection`; label `'Auto'` when
   `'auto'`; index over the 11-entry cycle ("1 / 11" for Auto).

**Verify**: `npx tsc --noEmit` → exit 0; `cd island-editor && pnpm test` →
all pass (no behavior tests yet).

### Step 7: Tests

`test/characterBehavior.test.ts` (node; style of `test/grassField.test.ts`;
build a fake env — plain functions, seeded `mulberry32`):

1. walk → hi on phase expiry; hi → walk or sleep (drive rand to hit both
   branches); sleep → wake → walk with the documented durations.
2. Movement convention: after advancing a walk with yaw 0, `z` increased and
   `x` unchanged (within float eps); with yaw π/2, `x` increased.
3. Swim entry: env whose `heightAt` returns below-sea for the walked-into
   region → phase becomes `swim` and `behaviorClip` maps it to
   `Swim_Forward`.
4. Leash: env with `shoreDistanceAt` returning `> MAX_SWIM_DIST` for any
   forward step → repeated `advanceBehavior` calls do NOT increase the
   shore distance at (x,z) (position stays put while yaw turns), i.e. the
   chick never exceeds the leash.
5. `triggerTalk` from walk AND from sleep → phase `talk`, no movement during
   talk, resumes `walk` after `TALK_SECONDS`.
6. World-edge: start near `worldSize/2 - 1` heading outward → after a few
   seconds of ticks the position stays inside the world bounds.
7. Determinism: same seed + same env + same dt sequence → identical state.
8. `sampleShoreDistance`: build a real `shoreDistanceField` from a small
   grid with one land cell; assert sign flips between the land-cell center
   and a far-ocean point.

**Verify**: `cd island-editor && pnpm test` → all pass; report exact count.

### Step 8: Gate

`pnpm check:island-editor` (worktree root) → exit 0. Note for the reviewer:
in-browser checks are theirs (wander gait, cliff snap, swim + leash, hi wave
on stops, sleep/wake cycle, click-to-talk, grass fade following, dock
override freezing movement, Auto resuming).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "advanceBehavior\|behaviorClip" island-editor/src/scene/CharacterActor.tsx` → hits
- [ ] `grep -n "'auto'" island-editor/src/App.tsx island-editor/src/ui/AnimationDock.tsx` → hits in both
- [ ] `grep -n "characterPose" island-editor/src/scene/GrassLayer.tsx` → hit
- [ ] `grep -rn "Math.random" island-editor/src/models/characterBehavior.ts` → no hits
- [ ] `git status` — only in-scope files
- [ ] Spec/persistence untouched: `git diff --stat` shows no
      terrain/editor-core files

## STOP conditions

- Plan 024's `uCharPos` is absent from your base (grep in "Current state") —
  ordering violation; report.
- You find yourself persisting the roaming position into the spec or codec —
  out of scope by design; report.
- The mixer fights the override (e.g. drei action fades stack up when
  cycling fast) in a way visible in code review — note it, don't redesign;
  the 0.25s fade pattern is the house standard.
- You want `Math.random` anywhere — forbidden repo-wide; use the seeded
  stream from the env.

## Maintenance notes

- Tuning knobs: speeds, phase durations, `MAX_SWIM_DIST`, `SWIM_SINK`,
  wander turn rate — all constants in `characterBehavior.ts`.
- The jump clip, when authored, slots in as a new phase triggered by a
  height DROP > one tier between consecutive frames (the snap is currently
  silent by design).
- If multiple characters ever become allowed, `characterPose` must become a
  registry and the grass shader's single fade disc a small array.
- Reviewer focus: leash test realism (does the fake env actually exercise
  the candidate-step rejection?), dt clamp, no per-frame allocations in
  `advanceBehavior` (it mutates), the pointer-down precedence (remove in
  place mode must still win), and that manual-override → Auto resumes
  cleanly.
