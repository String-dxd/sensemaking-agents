# Plan 004: Characterize foot-IK stance behavior during gait (measure first, fix only what measurement confirms)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1fd7413..HEAD -- character-studio/src/core/motion/footIK.ts character-studio/src/core/motion/locomotion.ts character-studio/src/core/motion/clipStateMachine.ts character-studio/test/core/motion/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (measurement) → MED only if a fix is warranted
- **Depends on**: 001 (reuses its synthetic-gait test scaffolding patterns)
- **Category**: tests (characterization; conditional bug fix)
- **Planned at**: commit `1fd7413`, 2026-07-06

All commands run from the `character-studio/` directory.

## Why this matters

An audit pass claimed the foot-IK stance gate never engages during walking:
stance requires foot world-speed < 0.4 m/s (`footIK.ts:200-202`), while
locomotion translates the root at 0.9–2.2 m/s (`locomotion.ts:104-107`) —
so, the claim goes, a planted foot always moves too fast in world space and
the anti-skate layer is inert exactly when it matters.

A second reading disputes this: the clips are authored **in place with the
stance foot traveling backward at a measured ground speed**
(`locomotion.ts:17-19`: `WALK_CLIP_SPEED = 0.89`, `RUN_CLIP_SPEED = 1.766`),
and the mixer timeScale is set to `rootSpeed / clipSpeed`
(`locomotion.ts:115-119`), so the planted foot's world velocity should be
root-motion + clip-motion ≈ **zero** — the gate would then engage correctly,
and the design comment "zero foot-skate calibration" (`locomotion.ts:5-10`)
would be accurate.

Both readings are static. Neither has been measured. This plan builds a
deterministic measurement harness, turns the answer into pinned regression
tests, and applies the root-relative-stance fix ONLY if measurement confirms
the defect. This is the honest scope: a blind gate rewrite risks
re-introducing skate or pops in a system that may already be correct.

## Current state

Files and roles:

- `src/core/motion/footIK.ts` — stance detection + two-bone-IK pinning.
  Gates: `height < restHeight * 1.35 && speed < 0.4` where `speed` is world
  foot displacement/dt (lines 200-202). Correction clamp 6 cm, blend 80 ms.
- `src/core/motion/locomotion.ts` — root translation along a circle;
  `getGaitTimeScale()` returns `speed / WALK_CLIP_SPEED` (or run) so clip
  stance-foot speed matches ground speed.
- `src/core/motion/clipStateMachine.ts` — plays the gait clips through an
  `AnimationMixer` with that timeScale.
- `src/studio/play/PlayMode.tsx` — assembles the stack; `footIK.update` runs
  in the `physics` phase after animation (lines 172-177).
- `src/assets/clips/clips-core-v1.glb` — the real authored clips (walk has
  22 channels; leg articulation verified).
- Existing test exemplars: `test/core/motion/footIK.test.ts` (synthetic
  bobbing foot), `test/core/motion/clipStateMachine.test.ts` (synthetic
  clips), `test/core/motion/clips.test.ts` (loads the REAL GLB in vitest via
  `NodeIO` from `@gltf-transform/core` — the pattern for sampling real clip
  tracks in node).

Key excerpts as of `1fd7413`:

`footIK.ts:200-202` (the contested gate):

```ts
const speed = s.hasPrev ? _delta2.copy(_p).sub(s.prev).length() / dt : 0
const height = _p.y - groundY
s.stance = s.hasPrev && height < s.restHeight * heightFactor && speed < speedThreshold
```

`locomotion.ts:17-19, 115-119` (the calibration that may already cancel
world velocity):

```ts
export const WALK_CLIP_SPEED = 0.89
export const RUN_CLIP_SPEED = 1.766
// ...
getGaitTimeScale(): number {
  if (gait === 'run') return speed / RUN_CLIP_SPEED
  if (gait === 'walk') return speed / WALK_CLIP_SPEED
  return 1
}
```

## Commands you will need

| Purpose | Command (in `character-studio/`) | Expected on success |
|---------|----------------------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Focused | `pnpm test -- gaitSoak` | new suite passes |

## Scope

**In scope**:

- `test/core/motion/gaitSoak.test.ts` (create — the measurement harness)
- `test/helpers/` (create a helper if the harness needs shared scaffolding)
- `src/core/motion/footIK.ts` — ONLY if Step 3's decision gate says fix
- `test/core/motion/footIK.test.ts` — ONLY alongside a Step 3 fix

**Out of scope** (do NOT touch):

- `src/core/motion/locomotion.ts`, `clipStateMachine.ts` — the calibration
  design is documented and intentional; if measurement implicates THEM, stop
  and report instead.
- `src/studio/play/PlayMode.tsx`, the clip GLB, `scripts/blender/clips.py`.

## Git workflow

- Branch: `advisor/004-foot-ik-characterization`
- Style `test(character-studio): ...` / `fix(character-studio): ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the deterministic gait harness

Create `test/core/motion/gaitSoak.test.ts`:

1. Build the canonical skeleton as live `THREE.Bone`s — reuse how
   `test/core/skeleton/assemble.test.ts` or the canonical-skeleton tests
   construct bone hierarchies from `CANONICAL_BONES`
   (`src/core/skeleton/canonical.ts`); parent them under a root
   `THREE.Group`.
2. Load the REAL clips: parse `src/assets/clips/clips-core-v1.glb` with
   `NodeIO` (copy the loading pattern from `test/core/motion/clips.test.ts`)
   and convert its animations to `THREE.AnimationClip`s. If gltf-transform →
   three clip conversion is nontrivial, build `THREE.QuaternionKeyframeTrack`
   / `VectorKeyframeTrack` arrays directly from the sampler accessors (times
   + values are plain float arrays) — target names come from
   `channel.getTargetNode().getName()` as `<bone>.quaternion` /
   `<bone>.position`.
3. Assemble the real runtime stack, no React: `createLocomotion(root,
   { radius: 1.2 })`, `createClipMachine(new AnimationMixer(root), clips,
   { hipsRebase: ... })` (mirror `PlayMode.tsx:79-84`), `createFootIK` on
   the leg bones with default options and `poleDir` updated per frame like
   `PlayMode.tsx:172-177`.
4. Drive it exactly like `PlayMode.tsx:149-160`'s onAnimation +
   onPhysics: fixed `dt = 1/60`, `setTargetSpeed(0.9)`, 600 ticks (10 s),
   recording per tick per foot: world position, `getLegDebug(i)`
   (`stance`, `weight`, `anchor`).

**Verify**: the harness runs (`pnpm test -- gaitSoak`) and prints (via the
test's expect messages or a temporary `console.info` you keep behind a
`DEBUG_GAIT` env guard) three measurements per gait {walk 0.9, run 2.2}:

- `stanceEngagementRatio`: fraction of ticks (after 2 s warmup) where at
  least one foot is in stance,
- `plantedFootDriftMax`: for each contiguous stance window ≥ 5 ticks, the
  max world-XZ drift of that foot within the window (this IS the skate
  metric),
- `minWorldFootSpeedP10`: 10th percentile of per-tick world foot speed of
  the slower foot.

### Step 2: Pin the truth as regression tests

Whatever Step 1 measures becomes the pinned expectations:

- **If the calibration reading is right** (expected: `stanceEngagementRatio`
  > 0.5, `plantedFootDriftMax` < ~2 cm at walk speed): pin those bounds as
  assertions with a comment crediting the timeScale calibration; the audit
  claim is refuted and Step 3 is SKIPPED. Also pin the idle case
  (`setTargetSpeed(0)`, expect both feet stance, zero correction beyond
  1 mm — guards the "over-pinning at idle is benign" assumption).
- **If the audit reading is right** (`stanceEngagementRatio` ≈ 0 during
  gait, or `plantedFootDriftMax` > 5 cm): pin the CURRENT broken numbers as
  `it.fails(...)` or a `// defect measured:` comment, and proceed to Step 3.

**Verify**: `pnpm test -- gaitSoak` → assertions pass and encode the
measured reality; the test file's header comment states which hypothesis won
with the numbers.

### Step 3 (CONDITIONAL — only if Step 2 measured the defect): root-relative stance

Change `footIK.ts` stance detection to measure foot velocity **relative to
the root's frame** (subtract the root's world displacement over the same
tick before computing speed), keeping the world-space height gate and all
clamps/blends unchanged. Root handle: extend `FootIkOptions` with
`root?: Object3D`; `PlayMode.tsx` passes `character.root` (one-line change —
allowed as the exception to the out-of-scope list, confined to the
`createFootIK(...)` call site).

Wait — root-relative velocity of a *planted* foot equals −rootVelocity (the
foot stays put while the root moves), so a naive root-relative gate inverts
the problem. The correct root-relative signal for "planted" is
**world-frame near-zero velocity**, which is what the current gate already
measures. Therefore, if Step 2 found the gate failing, the actual culprit is
most likely the **timeScale calibration not holding in practice** (e.g.
during gait transitions/crossfades where blended clips break the speed
match) — in that case do NOT rewrite the gate; instead: widen
`speedThreshold` only during crossfade windows, or anchor-drop on gait-state
change (`footIK.reset()` on transitions — `PlayMode` already resets on state
exit). Choose based on WHERE the measurements show stance dropping
(steady-state vs transitions), and record the reasoning in the commit
message. If the measurements show steady-state failure (not transitions),
STOP and report with the recorded traces — that would implicate the
clip-speed constants themselves (out of scope by design).

Update `test/core/motion/footIK.test.ts` with a unit case for whichever
mechanism changed, and flip the Step 2 pins to the healthy bounds.

**Verify**: `pnpm test` → all pass; `gaitSoak` now pins
`plantedFootDriftMax < 2 cm` at walk and run.

## Test plan

- New: `test/core/motion/gaitSoak.test.ts` — real-clip, real-stack gait
  measurement with pinned stance-engagement, skate-drift, and idle bounds
  (walk 0.9, run 2.2, idle 0).
- Conditional: `footIK.test.ts` unit case for a Step 3 change.
- `pnpm test` green throughout.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `gaitSoak.test.ts` exists, loads the real GLB, and pins measured
      stance/skate bounds for walk, run, and idle
- [ ] The test header documents which hypothesis measurement confirmed,
      with numbers
- [ ] If the defect was confirmed: fix landed per Step 3's decision tree and
      `plantedFootDriftMax < 2 cm` is pinned; if refuted: no `src/` change
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated (include the verdict)

## STOP conditions

Stop and report back (do not improvise) if:

- gltf-transform accessor → three KeyframeTrack conversion produces clips
  whose sampled poses are visibly wrong (sanity: hips Y should oscillate
  during walk; if all bones stay at rest, the conversion is broken — report
  rather than debug past one attempt).
- Step 2 measures steady-state stance failure (not transition-limited) —
  the fix would implicate locomotion's clip-speed constants, which are out
  of scope.
- Any fix attempt makes `plantedFootDriftMax` or visual walking worse than
  the measured baseline.

## Maintenance notes

- The gaitSoak harness is the template for future motion-quality metrics
  (head-bob amplitude, gesture hand-back cleanliness) — keep it fast
  (< 2 s) so it stays in the default suite.
- If `WALK_CLIP_SPEED` / `RUN_CLIP_SPEED` are ever re-measured
  (`pnpm gen:clips` prints them), the pinned skate bounds here are the tests
  that will catch a stale constant.
- Reviewer scrutiny: determinism (fixed dt, no RNG in the harness) and that
  pins have honest tolerances, not tautologies.
