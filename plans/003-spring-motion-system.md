# Plan 003: Build the spring-bone secondary-motion system — the "it's alive" engine

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.2 is this plan's foundation). Follow steps in order, run every
> verification, honor STOP conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/motion character-studio/src/studio/viewport`
> Confirm plan-001 layout exists: `src/core/motion/frameLoop.ts` with phases
> `animation|physics|procedural|render`, `PlaceholderBody.tsx` present. If
> plan 002's FaceRig is present, leave it working. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (the single most important quality signal of the project)
- **Depends on**: plans/001-workspace-scaffold.md (002 recommended first but not required)
- **Category**: direction
- **Recommended executor**: Fable 5 (solver math + motion-feel tuning; Opus 4.8 acceptable)
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

The brief is explicit: natural, non-robotic motion is the single most
important quality signal — "the difference between '3D model' and 'living
character' lives entirely in this motion." This plan builds the physics layer
(Verlet spring-bone chains for ears/tails/cloth/accessories) and the
procedural idle layer (breath, sway) that every later animation plan layers
under. It is Phase 1 because if follow-through and overlap don't read as
alive here, nothing downstream fixes it.

## Current state

- `character-studio/` per plan 001: placeholder capsule+sphere character,
  frame loop with ordered phases, `src/core/motion/` contains only
  `frameLoop.ts`.
- No skeleton exists yet (plan 006 builds real ones). This plan creates a
  **placeholder bone setup**: three.js `Bone` chains attached to the
  placeholder body — 2 ear chains (2 bones each) on the head, 1 tail chain
  (4 bones) on the body — with simple cone/capsule skinned or rigidly-parented
  meshes so motion is visible.

**The researched architecture you are implementing** (inline; citations in
plan 000 §2.2):

1. **Verlet-integrated bone chains** (the `naelstrof
   blender-jiggle-physics` / `UnityJigglePhysics` solver family — chosen over
   damped-rotation springs because it resists exploding, behaves correctly
   under fast reference-frame motion, and supports squash-and-stretch).
   Per-joint simulated particle at the bone tail; each frame:
   `p' = p + (p - pPrev) * (1 - dragForce) + gravityDir * gravityPower * dt²`,
   then constrain toward the animated pose target with strength `stiffness`,
   then enforce bone length (distance constraint to parent particle), then
   sphere-collider pushout (`hitRadius` vs collider radius), finally write the
   result back as a **bone rotation** (rotate the animated bone so its tail
   points at the solved particle — never translate mid-chain bones).
2. **Parameter vocabulary = VRM `VRMC_springBone-1.0`** (so plan 011 exports
   cleanly): per-joint `stiffness` (0–1), `gravityPower` (m/s²-ish scalar),
   `gravityDir` (unit vec3), `dragForce` (0–1), `hitRadius` (m); colliders are
   spheres/capsules attached to bones, grouped; a chain = ordered joint list +
   collider-group refs. Implement our own solver; do NOT depend on
   `@pixiv/three-vrm*` (their manager is VRM-loader-coupled; standalone use is
   community-inferred, not documented — plan 000 rejected the dependency).
3. **Hard ordering rule**: solver runs in the `physics` frame phase, strictly
   after `animation` writes the pose — the animated pose is the spring target;
   physics never fights keyframes (this avoids the documented
   mixed-bone-driver breakage). Fixed timestep: accumulate `dt`, step the
   solver at 60 Hz substeps (max 3 substeps/frame; clamp spiral-of-death).
4. **Procedural idle layer** (`procedural` phase, after physics targets are
   set for next frame — order within frame: animation → physics → procedural
   writes *next-frame* intent like breath scale and gaze; document this in
   code): breath = chest scale `1 + 0.015 * sin(t * 2π / 3.8s)` with slight
   head bob; weight-shift sway = hips lateral offset `± 4 mm` over ~6 s noise
   (use a seeded value-noise helper, injected RNG); micro head turns every
   5–12 s.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/motion/{springSolver.ts, springTypes.ts, proceduralIdle.ts, noise.ts}` (new)
- `character-studio/src/studio/viewport/{PlaceholderBody.tsx (add bone chains), MotionDebugPanel.tsx (new)}`
- `character-studio/test/core/motion/**`

**Out of scope**:
- Real skeletons/archetypes (006), AnimationMixer clips & state machine (007),
  wardrobe springs (008 — but the chain API must accept arbitrary bone lists,
  which it does by design), foot IK (007), any React in `src/core/**`.

## Git workflow

- Branch: `advisor/003-spring-motion`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: Types + solver core (pure, deterministic, tested)

`springTypes.ts`: `SpringJointParams { stiffness, gravityPower, gravityDir,
dragForce, hitRadius }`, `SpringChainDef { name, boneNames: string[], joints:
SpringJointParams[], colliderGroupRefs: string[] }`, `SphereCollider { boneName,
offset, radius }` — mirroring VRMC_springBone field names exactly (document
the mapping in a comment block).

`springSolver.ts`: `createSpringRig(root: Object3D, chains: SpringChainDef[],
colliders: ColliderGroup[])` → `{ step(dt), reset(), setParams(chain, idx,
params), dispose() }`. Implementation per "Current state" #1 & #3. Key
correctness details:
- Work in **world space** for particles; convert to local bone rotation via
  parent world matrix inverse when writing back.
- Capture the animated pose's per-joint target *after* animation phase each
  frame (read bone world positions before solving).
- `reset()` snaps particles to current pose (used on teleports/spec changes).
- No allocation in `step()` (preallocate Vector3 scratch; this runs per frame
  per joint).

Tests (`test/core/motion/springSolver.test.ts`) — the solver is pure enough
to test headlessly with a hand-built bone hierarchy:
- **Settles**: with gravity only, a 2-bone chain converges to hanging rest
  within 2 s simulated; no NaN.
- **Follow-through**: teleport the root 0.3 m sideways in one step → chain tip
  lags behind root on that frame, then converges; max overshoot bounded.
- **Never stretches**: bone lengths preserved within 1e-4 after 10 s of random
  root motion (seeded).
- **Stability**: 10k random steps with dt jitter (4–50 ms) → all positions finite.
- **Collider pushout**: particle inside a sphere collider gets projected out.

**Verify**: `pnpm test` → all solver tests pass.

### Step 2: Placeholder chains on the body

Extend `PlaceholderBody.tsx`: add `Bone` hierarchies — `earL.1→earL.2`,
`earR.1→earR.2` on the head (long rabbit-like ears: two stacked capsule
meshes rigidly parented per bone — skinning not required for the placeholder),
`tail.1→…→tail.4` on the body rear (cone segments). Register a spring rig:
ears `{stiffness: 0.65, gravityPower: 0.15, dragForce: 0.35, hitRadius: 0.02}`,
tail `{stiffness: 0.45, gravityPower: 0.3, dragForce: 0.25}` (starting values —
step 5 tunes). Add one sphere collider on the head so ears don't clip the skull.
Wire `step(dt)` into the `physics` phase with the fixed-timestep accumulator.

**Verify**: `pnpm dev` → drag-orbit the camera: nothing moves (springs are
body-relative, camera must not excite them). Then use the debug panel
(step 4) to shove the body: ears/tail lag, overshoot, settle.

### Step 3: Procedural idle layer

`proceduralIdle.ts`: `createIdleLayer(targets: { chest, head, hips }, rng)` →
`{ update(dt, t), setParams(...) }` implementing breath/sway/micro-turns from
"Current state" #4. Register in `procedural` phase. The breath motion must
**excite the spring chains** (that's the point — a breathing body makes ears
micro-move); verify visually that ear tips drift subtly with breath.

Tests: breath period and amplitude measurable from simulated `update` calls;
sway bounded; deterministic under seeded RNG; zero motion when amplitudes set
to 0.

**Verify**: `pnpm test` → pass; `pnpm dev` → at rest, the character visibly
breathes; ears carry a barely-visible live micro-motion.

### Step 4: Motion debug panel + body mover

`MotionDebugPanel.tsx`: sliders for each chain's four params (live via
`setParams`), a "wind" toggle (adds a noise impulse to gravityDir — cheap wind),
and **body motion buttons**: `hop` (0.15 m vertical impulse curve over 400 ms),
`shake` (head yaw ±25° over 600 ms), `walk-in-circle` (root moves along a 1 m
circle at 0.6 m/s). These drive the body transform directly in the `animation`
phase (temporary stand-ins for plan-007 clips) purely to excite the springs.

**Verify**: `pnpm dev` → `hop` produces visible ear/tail follow-through and
settle; `shake` makes ears whip and recover; walking makes the tail trail.

### Step 5: The motion-feel gate (do not skip)

Tune params until ALL hold while watching the dev scene:
- At idle, the character is **never** perfectly still (breath + micro-sway +
  spring micro-motion), yet nothing distracts.
- `hop`: ears compress/lag on rise, float at apex, overshoot and settle on
  landing within ~1 s — no jitter, no residual vibration.
- `shake`: no chain explodes, self-intersects the head, or aliases at 60fps.
- Params written back into `PlaceholderBody.tsx` as the new defaults with a
  comment naming what each was tuned for.

If you cannot view the scene, report DONE-pending-visual with exact
operator verification steps.

## Test plan

`test/core/motion/`: `springSolver.test.ts` (5 cases in step 1),
`proceduralIdle.test.ts` (4 cases in step 3), plus `fixedStep.test.ts`
(accumulator: 16.6 ms×N frames → N solver steps; 200 ms frame → clamped to 3
substeps). Seeded RNG injected everywhere — `grep Math.random` must stay clean
in core. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0 (≥ 3 new test files, ≥ 10 new cases)
- [ ] `grep -rn "Math.random" character-studio/src/core/motion/` → no matches
- [ ] `grep -rn "from 'react'" character-studio/src/core/motion/` → no matches
- [ ] Dev scene passes the step-5 motion-feel gate (or reported pending-visual)
- [ ] Solver `step()` allocates nothing (verify: no `new Vector3` inside the per-joint loop — grep the loop body)
- [ ] `plans/README.md` updated

## STOP conditions

- Frame-loop phase contract from plan 001 is missing/renamed.
- Solver instability that survives substep clamping + parameter floors
  (document the failing config; do not silently cap chain lengths).
- You find yourself wanting to add `@pixiv/three-vrm*` as a dependency — that
  is a rejected alternative (plan 000 §3); STOP and report why you think it's
  needed.

## Maintenance notes

- Plan 007 layers AnimationMixer under this solver — the ordering contract
  (animation → physics) is what makes that safe; never reorder phases.
- Plan 008 registers wardrobe chains through the same `SpringChainDef` API;
  plan 011 serializes these types 1:1 into the `SEN_companion` export
  extension — renaming fields breaks the export contract.
- Reviewer: scrutinize world/local conversion on write-back (the classic bug
  is applying world rotation to a local quaternion — visible as chains
  drifting when the character rotates), and the no-allocation claim.
