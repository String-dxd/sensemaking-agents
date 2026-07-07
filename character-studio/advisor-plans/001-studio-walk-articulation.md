# Plan 001: Make the Studio-mode walk articulate limbs via the authored clip machine

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1fd7413..HEAD -- character-studio/src/studio/viewport/bodyMover.ts character-studio/src/studio/viewport/MotionDebugPanel.tsx character-studio/src/studio/viewport/CharacterRoot.tsx character-studio/src/studio/state/studioStores.ts character-studio/src/studio/viewport/Stage.tsx character-studio/src/core/motion/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1fd7413`, 2026-07-06

All commands in this plan run from the `character-studio/` directory (an
isolated pnpm workspace root inside the `sensemaking-agents` repo).

## Why this matters

The Studio-mode "walk circle" button (the always-visible motion-debug panel)
slides the character root around a circle **without moving a single bone** —
the character glides frozen in its rest A-pose. A fully authored, verified
walk clip with 22 channels (arms, legs, spine, head) exists in
`src/assets/clips/clips-core-v1.glb` and is correctly wired — but **only in
Play mode**. Dogfooding through the debug panel therefore looks completely
broken ("walking doesn't move the joints"), which is exactly the complaint
that triggered this audit. After this plan, the Studio walk drives the same
clip machine Play mode uses, so limbs articulate everywhere a walk can be
triggered, and the leftover root-mover can no longer fight Play mode for the
root transform.

## Current state

Files and roles:

- `src/studio/viewport/bodyMover.ts` — plan-003-era stand-in movers (hop /
  shake / walk-circle) that "excite the springs". The walk branch writes only
  `root.position.x/z` and `root.rotation.y` (lines 45–51); no bones.
- `src/studio/viewport/MotionDebugPanel.tsx` — DOM-side debug panel (renders
  OUTSIDE the r3f Canvas). Its walk button calls `mover.toggleWalk()`
  (line 173). Hidden during Play (`Shell.tsx:193`).
- `src/studio/viewport/CharacterRoot.tsx` — creates the mover and registers
  it in the `animation` phase (lines 311–314); publishes
  `character: { root, boneByName, hipsRest }` into `useMotionStudio`
  (lines 320–326). This registration stays live during Play mode.
- `src/studio/play/PlayMode.tsx` — the Play-mode driver; the reference
  implementation for the clip stack this plan reuses (mixer + machine +
  locomotion + rest-pose snapshot/restore).
- `src/studio/state/studioStores.ts` — `useMotionStudio` zustand store;
  `BodyMover` interface at line 14.
- `src/studio/viewport/Stage.tsx` — mounts `<FrameLoopDriver>`,
  `<CharacterRoot>`, `<PlayMode>` inside the Canvas.

Key excerpts as of `1fd7413`:

`bodyMover.ts:45-51` (the defect — root-only "walk"):

```ts
if (walking) {
  // Circle of radius WALK_RADIUS through the home position, facing travel.
  theta += (WALK_SPEED / WALK_RADIUS) * dt
  root.position.x = basePos.x + Math.sin(theta) * WALK_RADIUS
  root.position.z = basePos.z + (Math.cos(theta) - 1) * WALK_RADIUS
  root.rotation.y = baseRotY + theta + Math.PI / 2
}
```

`MotionDebugPanel.tsx:172-175` (the only Studio-mode walk trigger):

```tsx
style={walking ? activeButtonStyle : buttonStyle}
onClick={() => setWalking(mover.toggleWalk())}
```

`PlayMode.tsx:79-84` (the working clip stack to mirror):

```ts
const mixer = new THREE.AnimationMixer(root)
const machine = createClipMachine(mixer, animations, {
  hipsRebase: { from: [REF_HIPS[0], REF_HIPS[1], REF_HIPS[2]], to: hipsRest },
})
const locomotion = createLocomotion(root, { radius: 1.2 })
```

`PlayMode.tsx:71-75` (rest-pose snapshot pattern — reuse it):

```ts
const snapshot = [...boneByName.values()].map((bone) => ({
  bone,
  position: bone.position.clone(),
  quaternion: bone.quaternion.clone(),
}))
```

`PlayMode.tsx:37` (clips URL + preload pattern):

```ts
const clipsUrl = new URL('../../assets/clips/clips-core-v1.glb', import.meta.url).href
```

Conventions that apply:

- Motion logic that is pure three (no React) lives in `src/core/motion/` —
  see `locomotion.ts`, `clipStateMachine.ts`. React drivers that mount inside
  the Canvas live in `src/studio/viewport/` or `src/studio/play/`.
- The frame loop has fixed phases `animation → physics → procedural → render`
  (`src/core/motion/frameLoop.ts`); register/unregister via
  `registerUpdate`/`unregisterUpdate`.
- File-header comments explain each module's role and plan lineage — keep
  that style.
- Tests use synthetic `THREE.AnimationClip`s — model after
  `test/core/motion/clipStateMachine.test.ts`.

## Commands you will need

| Purpose   | Command (run in `character-studio/`) | Expected on success |
|-----------|--------------------------------------|---------------------|
| Install   | `pnpm install`                       | exit 0              |
| Typecheck | `pnpm typecheck`                     | exit 0, no output   |
| Tests     | `pnpm test`                          | 35+ files, all pass |
| Dev serve | `pnpm dev`                           | Vite on :5190       |

## Scope

**In scope** (the only files you should modify/create):

- `src/core/motion/studioWalk.ts` (create)
- `src/studio/viewport/bodyMover.ts`
- `src/studio/viewport/MotionDebugPanel.tsx`
- `src/studio/viewport/CharacterRoot.tsx`
- `src/studio/viewport/Stage.tsx`
- `src/studio/state/studioStores.ts`
- `test/core/motion/studioWalk.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `src/studio/play/PlayMode.tsx` and `src/core/motion/clipStateMachine.ts` /
  `locomotion.ts` / `footIK.ts` — Play mode works; this plan only adds a
  Studio-mode consumer of the same primitives.
- `scripts/blender/clips.py` and the clip GLB — the asset is verified correct.
- The spring solver and `proceduralIdle` — untouched bones, untouched phases.

## Git workflow

- Branch: `advisor/001-studio-walk-articulation`
- Commit style (from `git log`): `fix(character-studio): <imperative summary>`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the pure walk-session module

Create `src/core/motion/studioWalk.ts` — a pure-three (no React) session that
owns the Studio walk stack. Shape:

```ts
// Studio walk session (advisor plan 001) — drives the authored gait clips
// outside Play mode so the debug "walk circle" articulates limbs. Same
// primitives as PlayMode (mixer + clip machine + locomotion), minimal: no
// foot IK, no soak, no talk. Pure three — the React layer owns mounting.

import * as THREE from 'three'
import { createClipMachine } from './clipStateMachine'
import { createLocomotion } from './locomotion'

export interface StudioWalkSession {
  /** Advance locomotion + clips. Register in the `animation` phase. */
  update(dt: number): void
  /** Restore the captured rest pose and root transform, release the mixer. */
  dispose(): void
}

export function createStudioWalk(
  root: THREE.Object3D,
  bones: Iterable<THREE.Object3D>,
  animations: THREE.AnimationClip[],
  options: { hipsRebase: { from: [number, number, number]; to: readonly [number, number, number] }; speed?: number },
): StudioWalkSession
```

Implementation requirements:

- Snapshot every bone's `position`/`quaternion` plus the root's
  `position`/`rotation.y` at creation (copy the pattern from
  `PlayMode.tsx:71-75`); `dispose()` restores all of it and calls
  `machine.dispose()` + `mixer.stopAllAction()`.
- In `update(dt)`: `locomotion.setTargetSpeed(speed)` (default `0.9`, the
  `WALK_SPEED` constant exported by `locomotion.ts`), `locomotion.update(dt)`,
  `machine.setState(locomotion.getGaitState())`,
  `machine.setLocomotionTimeScale(locomotion.getGaitTimeScale())`,
  `machine.update(dt)` — mirroring `PlayMode.tsx:149-160`'s non-sit branch.
- Pass `options.hipsRebase` straight through to `createClipMachine` (see
  `PlayMode.tsx:80-82`; the machine rebases hips translation tracks onto the
  assembly-time rest offset — omitting this sinks the character into the
  floor for non-reference archetypes).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Remove the walk branch from bodyMover

In `src/studio/viewport/bodyMover.ts`: delete the `walking`, `theta`,
`WALK_RADIUS`, `WALK_SPEED` state and the `if (walking) {...}` block and the
`toggleWalk()` method. Keep `hop()` and `shake()` exactly as they are. In
`src/studio/state/studioStores.ts`, remove `toggleWalk` from the `BodyMover`
interface (line ~14). Update the header comment of `bodyMover.ts` to say the
walk stand-in was replaced by the clip-driven studio walk (this plan).

**Verify**: `pnpm typecheck` → FAILS mentioning `toggleWalk` in
`MotionDebugPanel.tsx` only (expected — fixed next step). If it fails
anywhere else, list those sites and fix them the same way; if a non-debug
production code path used `toggleWalk`, STOP.

### Step 3: Add the studioWalk flag to the motion store and mount a driver

1. In `src/studio/state/studioStores.ts`, add to the `useMotionStudio` state:
   `studioWalk: boolean` (initial `false`) and a
   `setStudioWalk(on: boolean): void` action, following the store's existing
   action style.
2. Create a small driver component **inside** `src/studio/viewport/Stage.tsx`
   (or a sibling file if Stage's structure makes inline awkward —
   `src/studio/viewport/StudioWalkDriver.tsx` is acceptable and preferred if
   it needs `useGLTF`):
   - Loads the clips GLB with `useGLTF` using the same URL construction as
     `PlayMode.tsx:37` (do not import from PlayMode — duplicate the one-line
     `new URL(...)` locally; add `useGLTF.preload(clipsUrl)` at module scope).
   - Reads `character` and `studioWalk` from `useMotionStudio`, and
     `usePlayStore((s) => s.mode)`.
   - When `studioWalk && mode !== 'play' && character` — in a `useEffect`:
     build `createStudioWalk(character.root, character.boneByName.values(),
     gltf.animations, { hipsRebase: { from: REF_HIPS, to: character.hipsRest } })`
     where `REF_HIPS` is derived exactly as `PlayMode.tsx:40-44` does (from
     `CANONICAL_BONES`), register its `update` in the `animation` phase, and
     on cleanup unregister + `session.dispose()`.
   - Render `null`; wrap in `<Suspense fallback={null}>`.
3. Mount the driver in `Stage.tsx` next to `<PlayMode />`.
4. Entering Play mode must force the flag off: in the driver (or Stage), an
   effect that calls `setStudioWalk(false)` whenever `mode === 'play'`.

**Verify**: `pnpm typecheck` → still fails only on `MotionDebugPanel.tsx`.

### Step 4: Rewire the debug panel button

In `src/studio/viewport/MotionDebugPanel.tsx` replace the
`mover.toggleWalk()` wiring (lines ~105, ~170-176) with the store flag:

```tsx
const walking = useMotionStudio((s) => s.studioWalk)
// button onClick:
onClick={() => useMotionStudio.getState().setStudioWalk(!walking)}
```

Keep the button label/active-style logic (`'stop walk'` / `'walk circle'`).

**Verify**: `pnpm typecheck` → exit 0. `pnpm test` → all existing tests pass.

### Step 5: Gate the residual bodyMover during Play

In `src/studio/viewport/CharacterRoot.tsx`, the `onAnimation` callback
(line ~312: `const onAnimation = (dt: number) => mover.update(dt)`) must
early-return while Play mode owns the root:

```ts
import { usePlayStore } from '../play/playStore'
// ...
const onAnimation = (dt: number) => {
  if (usePlayStore.getState().mode === 'play') return
  mover.update(dt)
}
```

(An in-flight hop writes `root.position.y`, which Play-mode locomotion does
not own — without this gate a hop triggered just before entering Play leaves
a vertical offset fighting the clip's hips track.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 6: Write the unit test

Create `test/core/motion/studioWalk.test.ts`, modeled structurally on
`test/core/motion/clipStateMachine.test.ts` (synthetic clips, no GLB
loading). Build a minimal bone hierarchy (`root → hips → upperLegL`, plus an
`upperArmL`) and synthetic `AnimationClip`s named exactly `idle`, `walk`,
`run` whose tracks target those bones (quaternion tracks with non-identity
values for `walk`). The clip machine requires all clips it manages — check
`createClipMachine`'s required-clip validation in
`src/core/motion/clipStateMachine.ts` (it throws on missing clips,
lines ~126-128) and provide every clip name it demands (copy the synthetic
clip-set helper from the exemplar test).

Cases to cover:

1. **Articulation**: after `createStudioWalk(...)` and ~1 s of
   `session.update(1/60)` ticks, `upperLegL.quaternion` differs from its rest
   value (`angleTo(rest) > 0.01`) — this is the regression test for the bug.
2. **Root motion**: `root.position` has moved off home (locomotion drives it).
3. **Dispose restores rest**: after `session.dispose()`, every bone's
   position/quaternion and the root transform equal the pre-session snapshot
   (within 1e-6).

**Verify**: `pnpm test -- studioWalk` → 3 new tests pass.
`pnpm test` → full suite passes.

### Step 7: Manual smoke check

Run `pnpm dev`, open `http://localhost:5190`:

1. Studio mode → motion panel → "walk circle": the character walks the circle
   **with swinging arms and stepping legs**, and stops back at rest on
   "stop walk".
2. Toggle Play mode (Space) while studio-walking: no double-motion, no stuck
   root; leaving Play restores a clean rest pose.

**Verify**: both behaviors observed; note them in the completion report.

## Test plan

- New: `test/core/motion/studioWalk.test.ts` — articulation, root motion,
  dispose-restores-rest (Step 6).
- Existing suite must stay green — especially
  `test/core/motion/clipStateMachine.test.ts` and `test/studio/*` (no store
  shape breakage).
- Verification: `pnpm test` → all pass including 3 new tests.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; `test/core/motion/studioWalk.test.ts` exists with the 3 cases
- [ ] `grep -rn "toggleWalk" src/` returns no matches
- [ ] `grep -n "walking" src/studio/viewport/bodyMover.ts` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `createClipMachine` requires runtime inputs beyond
  `(mixer, animations, { hipsRebase })` that a Studio session cannot supply.
- Removing `toggleWalk` breaks a caller other than `MotionDebugPanel.tsx`.
- The synthetic-clip test cannot satisfy the machine's required-clip list
  with reasonable effort (i.e. the machine hard-requires GLB-only data).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Plan 004 (foot-IK characterization) instruments the Play-mode stack; if it
  later adds foot IK knobs, consider whether the Studio walk session should
  adopt them (deliberately omitted here for simplicity).
- Reviewer should scrutinize: the dispose path (rest-pose restore must be
  exact — springs snap onto whatever pose remains), and that the driver
  re-creates cleanly when `character` changes (reassembly mid-walk).
- Deferred: driving hop/shake through gesture clips (`gestureCheer` etc.) so
  bodyMover can be deleted entirely — worth doing when the debug panel is
  next touched.
