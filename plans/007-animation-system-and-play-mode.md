# Plan 007: Animation clip set, blending state machine, procedural layers, and Play Mode

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.2, §4.2–4.3). Follow steps in order, verify each, honor STOP
> conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/motion character-studio/src/assets/clips`
> Confirm plans 001–006 landed: frame-loop phases, spring solver +
> procedural idle, assembled archetype characters on the canonical skeleton
> (`assemble.ts`), face rig with reserved viseme mouth cells
> (`MOUTH_CELLS.vAa/vEe/vOh/vMm`). On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (motion quality gate; clip authoring)
- **Depends on**: plans/003, 006 (002 for talk cells)
- **Category**: direction
- **Recommended executor**: Opus 4.8, Blender MCP strongly recommended for clip authoring
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

Play Mode is how a designer judges a character as a living being: idle, walk,
run, sit, stand, talk, and gestures, with every clip exciting the spring
layer and every procedural layer (blink, gaze, breath, foot IK, mouth flaps)
composing on top. This is the brief's flow step 6 and the second half of the
motion quality bar.

## Current state

- Spring solver + idle layer run in `physics`/`procedural` phases; the
  **animation → physics ordering contract** (plan 000 §2.2) means everything
  this plan does in `animation` phase is automatically followed by springs.
- Assembled characters exist on the canonical skeleton with the **rest pose
  defined in plan 006 step 2** (relaxed A-ish arms, standing). Clips must be
  authored on that exact skeleton — **no retargeting anywhere** (plan 000
  rejected it; three.js retarget utils are documented-broken).
- Spec: `motion.clipSetId` (default `core-v1`), `motion.procedural` params.
- Face: `setCell(mouth, …)` + viseme cells reserved; gaze API (`setGaze`).
- No clips exist. This plan authors `core-v1` in Blender on the canonical
  skeleton and exports one `clips-core-v1.glb` (animations only, no mesh).

**Clip set contract (`core-v1`) — names exact, all loop-safe except where noted:**

| Clip | Len (s) | Notes |
|---|---|---|
| `idle` | 4–6 loop | subtle: weight shifts, ear/hand micro-moves; procedural adds breath — don't bake breathing |
| `walk` | ~1.0 loop | 0.9 m/s reference speed, bouncy AC-style gait, root stays at origin (in-place; locomotion moves the root) |
| `run` | ~0.66 loop | 2.2 m/s, exaggerated lean + bounce |
| `sitDown` / `sitIdle` / `standUp` | 0.8 / 4 loop / 0.8 | floor sit, hands on knees |
| `talkIdle` | 3 loop | conversational body language, small head/hand motion (mouth is procedural) |
| `gestureWave` / `gestureNod` / `gestureShrug` / `gestureCheer` | 1–2 one-shot | return to idle pose at last frame |

## Suggested executor toolkit

- **Blender MCP** (`mcp__blender__execute_blender_code`,
  `get_viewport_screenshot`): keyframe the clips programmatically with
  animation principles applied deliberately — anticipation before the hop of
  `gestureCheer`, overlapping action via 1–2-frame offsets between spine/head
  keys, arcs on hand paths, ease-in/out everywhere (no linear tangents).
  Iterate with screenshots. Human polish can replace clips later; the GLB +
  naming contract is permanent.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/assets/clips/clips-core-v1.glb` + authoring notes in `ASSET-CONTRACT.md` (append a Clips section)
- `character-studio/src/core/motion/{clipStateMachine.ts, footIK.ts, talkDriver.ts, locomotion.ts}` (new)
- `character-studio/src/studio/play/{PlayMode.tsx, PlayControls.tsx}` (new)
- `character-studio/test/core/motion/{clipStateMachine,footIK,talkDriver}.test.ts`

**Out of scope**:
- Wardrobe (008), export (011), audio playback/TTS (talk driver takes a
  0–1 amplitude signal; a sine/noise synthesizer stub is fine), new skeleton
  bones, retargeting of any kind.

## Git workflow

- Branch: `advisor/007-animation-play-mode`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: Author `core-v1` clips (Blender)

Author the table above on the canonical skeleton. Quality rules (these are
the difference between robotic and alive — treat as requirements):
- Every key eased; **no two body parts start/stop moving on the same frame**
  (offset spine → head → arms by 1–3 frames — overlapping action).
- `walk`/`run`: distinct up-down bounce (AC gait is ~30% more vertical than
  realistic), slight torso counter-rotation vs hips, head stabilized.
- Loops: first/last pose + tangent identical (test will check pose delta).
- Do NOT keyframe: ear/tail chains (springs own them — keying them fights
  physics), breath scale, eyes/mouth.
Export animations-only GLB.

**Verify**: structural test — load GLB (as in plan 006 `assets.test.ts`),
assert all 11 clip names present, loop clips' first≈last quaternions
(tolerance 1e-3), no tracks target `earL/R.*`, `tail.*`.

### Step 2: Clip state machine (`clipStateMachine.ts`)

`createClipMachine(mixer, clips)` → states `idle | walk | run | sit | talk`
+ one-shot gesture layer. Transitions: crossfade with per-pair durations
(idle↔walk 0.25 s, walk↔run 0.15 s, sit enter/exit play `sitDown`/`standUp`
as transitions — a tiny built-in transition-clip concept). Gestures play on
an **additive-ish upper-body layer**: implement as a second action with
`setEffectiveWeight` ramp in/out, since true additive blending needs
`AnimationUtils.makeClipAdditive` — use it if clips behave (it's stable for
same-rig clips), else full-body gesture with return-to-idle. `update(dt)`
runs in `animation` phase **before** springs (register order does this —
assert it in a test using the frame loop).

Tests: state transitions produce expected active actions/weights over
simulated time; gesture completes and cleans up; illegal transition (sit →
run directly) routes through standUp.

### Step 3: Locomotion + foot IK (`locomotion.ts`, `footIK.ts`)

Locomotion: in play mode the character walks/runs along a designer-chosen
path (default: 1.2 m-radius circle) — root transform driven at the clip's
reference speed with turning; speed→state mapping (0 → idle, ≤1.4 → walk,
else run) with hysteresis.

Foot IK (correction-only, plan 000 §4.3): after animation phase, two-bone IK
(analytic, upperLeg-lowerLeg-foot) pins the planted foot to the ground plane
during its stance window (detect stance by foot-bone height+velocity
threshold from the clip itself — no authoring metadata needed for flat
ground), blends in/out over 80 ms. Ground is the flat pedestal (y=0) for v1.
Keep the correction ≤ 6 cm — it fixes skating, it does not invent steps.

Tests: analytic two-bone solver reaches reachable targets exactly (three
hand-computed cases), clamps at full extension without NaN; stance detection
on a synthetic bobbing foot track.

### Step 4: Talk driver (`talkDriver.ts`)

`createTalkDriver(faceRig, rng)` → `start(amplitudeSource)`, `stop()`,
`update(dt)`: maps amplitude (0–1 callable) to viseme mouth cells —
`<0.1 → vMm`, then thresholds through `vEe/vAa/vOh` with 60–90 ms minimum
cell hold (prevents flicker), occasional `neutral` micro-closes at word-ish
boundaries (amplitude dips). Include `makeSpeechSynthAmplitude(rng)` stub:
syllabic noise (4–6 Hz envelope) so Play Mode demos talk without audio.
During talk: gaze mode `camera`, gestureNod sprinkled by rng at low rate.

Tests: cell hold time enforced; silence → `vMm`/`neutral` within 150 ms;
deterministic under seeded rng.

### Step 5: Play Mode UI (`PlayMode.tsx`, `PlayControls.tsx`)

A mode toggle in the viewport (Studio ⇄ Play). Play Mode: hides editing
panels, shows a control strip — state buttons (idle/walk/run/sit/talk),
gesture buttons, speed slider, camera presets (orbit / follow / face
close-up), and a **"soak test" toggle** that randomly varies states every
5–15 s (designers judge liveliness by watching it drift, like a screensaver).
All secondary motion (springs, breath, blink, gaze, IK, talk) active
throughout.

**Verify** (the motion gate, do not skip): watch soak mode for 3 minutes —
no transition pops, no foot skating at walk speeds, no spring blowups on
run→idle stops (the settle after a stop is the money shot: ears/tail
overshoot and calm), talk reads as chatting at a glance from 2 m camera
distance. Fix until true; report pending-visual if you cannot view.

## Test plan

Three new test files (steps 2–4), ≥ 10 cases total, plus the clip-GLB
structural test (step 1). All seeded-RNG, no `Math.random` in core (grep
gate). `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0
- [ ] `clips-core-v1.glb` contains all 11 contract clips, loop-validated, no spring-bone tracks (test-enforced)
- [ ] Play Mode: all states + gestures reachable from UI; soak toggle works
- [ ] Springs visibly settle after run→idle (the step-5 gate) or pending-visual reported
- [ ] `grep -rn "retarget" character-studio/src/` → no matches
- [ ] `plans/README.md` updated

## STOP conditions

- Canonical-skeleton clip playback shows bind-pose corruption on any
  archetype (that means plan 006's per-archetype proportion scaling broke a
  shared-clip assumption — a real architectural finding; report it with the
  failing bone, don't hack per-archetype clip copies).
- `makeClipAdditive` produces broken gesture poses after one debugging pass —
  fall back to full-body gestures (documented above) and note it.
- Blender MCP unavailable — author programmatic placeholder clips in code
  (keyframe tracks built in TS honoring the same contract), mark row
  `BLOCKED (authored clips pending)`.

## Maintenance notes

- The clip contract table + "don't keyframe spring bones/breath" rule must
  hold for all future clip sets (`clipSetId` exists in the spec so rosters can
  pin sets). Plan 011 embeds these clips in the export GLB.
- Reviewer: crossfade during sitDown transitions (classic pop source), IK
  blend windows (watch the knee during blend-in), talk-driver hold logic.
- Deferred deliberately: real lip-sync (viseme cells already reserved),
  uneven-terrain IK, root-motion extraction.
