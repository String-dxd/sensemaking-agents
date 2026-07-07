# Plan 014: Natural animal stance (quadruped mammals) + procedural clip synthesis

> **Executor instructions**: This plan runs ONLY after plan 013 has merged
> (its README row says DONE and `src/core/procgen/` exists). If that is not
> true, STOP immediately — do not begin step 1. Follow the steps in order;
> run every verification. Read
> `advisor-plans/012-procedural-first-architecture.md` first (decisions
> D3/D4/D6 govern this plan). When done, update your row in
> `advisor-plans/README.md` (Wave 3).
>
> **Drift check (run first)**: find the 013 merge commit
> (`git log --oneline -20` — the `feat(character-studio)` commits from
> branch `advisor/013-procedural-mesh-kit`; record the SHA in your report),
> then `git diff --stat <that-SHA>..HEAD -- character-studio/src/core
> character-studio/src/studio`. If files changed after it, compare the
> "Current state" excerpts before proceeding; mismatch = STOP. Line numbers
> below are as of `a8f7c8e1` and may have shifted after 013 — match by
> content.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (rest-pose contract change + generated locomotion; feel is
  aesthetic-gated; archetype rename touches ~30 files)
- **Depends on**: 013 (hard — unexecutable without it)
- **Category**: migration / direction
- **Planned at**: commit `a8f7c8e1`, 2026-07-07
- **Recommended executor**: Fable 5 (gait feel and stance silhouette are
  judgment-gated; operator direction: quality over cost)

## Why this matters

Every character today stands upright like an Animal Crossing villager. The
operator wants Pokopia-style *natural animals*: mammals on four legs, birds
in a real bird stance. The rest pose is contractual for every clip, so this
is also the moment the Blender-authored clip set
(`src/assets/clips/clips-core-v1.glb`) is replaced by a TypeScript clip
synthesizer (plan 012, D4) — quadruped gaits could not reuse the biped clips
anyway. After this plan the studio has no GLB in bodies, parts, or
animation, and mammals walk on four legs.

## Current state

### Skeleton & archetypes

- `src/core/skeleton/canonical.ts` — world rest positions `W` (lines 37–76):
  vertical spine (`hips y0.34 → spine 0.40 → chest 0.46 → neck 0.56 → head
  0.62`), hanging arms (`handL [0.205, 0.335, 0.015]` — wrist at hip level),
  vertical legs. `BONE_PARENTS` (79–118). Invariant (lines 14–17): every
  bone's rest LOCAL ROTATION is identity — positions carry the whole pose.
  This must survive the re-pose (it keeps `boneScales` world-aligned, the
  skeleton translation-only, and — see below — it is what makes clip
  authoring axes world-aligned for every bone).
- `src/core/skeleton/archetypes.ts` — `ARCHETYPES_DEF` (line 64) rescales
  the single upright skeleton via `legs()`/`arms()`/`spineChain()`
  multipliers; `headCenter`/`headRadius` (the face-anchor + head-collider
  sphere — MOVES with the stance change); collider groups (line ~157)
  assume a vertical torso.

### Spec, migration, fixtures

- `src/core/spec/schema.ts` — `SPEC_VERSION = 2` (line 26);
  `ARCHETYPES = ['biped-round', 'biped-slim', 'bird']` (line 39);
  `MetaSchema.specVersion` is `z.literal(SPEC_VERSION)` — forgetting to
  stamp the new version in the migration fails validation, by design.
- `src/core/spec/migrate.ts` — the exact pattern to extend:

  ```ts
  // migrate.ts:15-22 — MIGRATIONS is keyed by SOURCE version, and each step
  // must advance meta.specVersion itself:
  export const MIGRATIONS: Record<number, Migration> = {
    1: (old) => {
      const spec = old as { meta: Record<string, unknown> }
      return { ...spec, meta: { ...spec.meta, species: 'custom', specVersion: 2 } }
    },
  }
  ```

  Your v2→v3 step is `MIGRATIONS[2]`, and must set `specVersion: 3`.
- `test/core/spec/migrate.test.ts` — tests identity, error paths, and a
  *synthetic* v0→v1 migration registered inside the test; there is NO
  existing real-migration test to copy. Yours will be the first — cover
  v1→v3 chains and v2→v3 directly.
- `fixtures/hero-shiba.character.json` and `fixtures/default-dog.character.json`
  are **specVersion 1** (`"archetype": "biped-round"`). No v2 fixture exists
  anywhere — synthesize one in the test (take a fixture, run it through
  `MIGRATIONS[1]`) rather than hunting for saved data.

### Archetype-rename blast radius (measured at plan time)

`biped-round`/`biped-slim` appear in ~129 occurrences across ~30 files.
Typed `Record<Archetype, …>` tables that MUST be updated or typecheck fails:
`src/core/skeleton/partRegistry.ts` (`BODY_REGISTRY`),
`src/core/skeleton/archetypes.ts` (`ARCHETYPES_DEF`),
`src/core/materials/patternRegistry.ts` (pattern `masks` keys),
`src/core/spec/defaults.ts`, `src/core/species/registry.ts`. Literals also
live in `src/studio/state/characterStore.ts`, `src/studio/roster/
rosterStore.ts` + `RosterView.tsx`, `src/studio/shell/Shell.tsx`, and tests
(`test/core/export/conformance.test.ts` hardcodes `body-biped-round` /
`BODY_REGISTRY['biped-round']`, `senCompanion.test.ts`, `dress.test.ts`,
`assemble.test.ts`, `schema.test.ts`, `migrate.test.ts`, …). Sculpt asset
ids are derived: `` `body-${spec.meta.archetype}` ``
(`CharacterRoot.tsx:215`) — renaming archetypes renames sculpt assetIds,
which (with 013's meshVersion bump) is another reason saved sculpts drop in
migration. Budget a dedicated step for this sweep; don't discover it
mid-clip-work.

### Motion stack

- `src/core/motion/clipStateMachine.ts` — states + required clips:

  ```ts
  // clipStateMachine.ts:41-55 (GestureName type + comment elided)
  export type MachineState = 'idle' | 'walk' | 'run' | 'sit' | 'talk'
  export const GESTURE_NAMES = ['gestureWave', 'gestureNod', 'gestureShrug', 'gestureCheer'] as const
  const BASE_CLIP: Record<MachineState, string> = {
    idle: 'idle', walk: 'walk', run: 'run', sit: 'sitIdle', talk: 'talkIdle',
  }
  const REQUIRED_CLIPS = [...Object.values(BASE_CLIP), 'sitDown', 'standUp', ...GESTURE_NAMES]
  ```

  Gestures play ADDITIVELY via `AnimationUtils.makeClipAdditive` — which is
  why gestures must end exactly on the rest pose (below). `hipsRebase`
  rewrites hips translation tracks for archetype proportions.
- `src/core/motion/locomotion.ts` — calibration constants tied to the
  authored clips: `WALK_CLIP_SPEED = 0.89`, `RUN_CLIP_SPEED = 1.766` (lines
  18–19), measured offline by `clips.py::measure_gait_speed`. Your
  synthesizer computes these (step 4) — no more hand measurement.
- `src/core/motion/footIK.ts` — `solveTwoBoneIK(upper, lower, end, target,
  poleDir?)` (line 59), correction-only, ≤6 cm clamp, ~80 ms blend; stance
  detected from foot height+velocity. PlayMode wires exactly two legs.
- `src/core/motion/proceduralIdle.ts` — weight-shift sway writes
  `hips.position.x` and head bob writes `head.position.y` (lines ~123–129):
  tuned-for-upright channels that still run in the *studio* idle preview
  (PlayMode gates them during play). Step 3 must re-tune amplitudes per
  stance or quadruped idle will read as a side-slide.
- `src/studio/viewport/bodyMover.ts` — debug mover (root hop, neck shake);
  stance-agnostic enough to keep, but check it doesn't clip the quadruped.
- **Reference-hips value is supplied in FOUR places** and must change in
  lockstep per stance: `compile.ts:116` (`REFERENCE_HIPS_LOCAL = [0, 0.34,
  0]`, feeding `buildAnimations`' hips-rebase), `PlayMode.tsx:40-44`
  (derives `REF_HIPS` from `CANONICAL_BONES`), `studioWalk.ts` (takes
  `from` as an option), `test/core/motion/gaitSoak.test.ts:61-65` (same
  derivation). Grep `0.34` and `REF_HIPS` before declaring step 6 done.

### The clip contract (`test/core/motion/clips.test.ts` — the authoritative encoding; this test currently loads the GLB and MUST be retargeted to your synthesizer, keeping every invariant)

- **Durations are contractual** (FPS = 30): idle 150f (5.0 s), walk 27f,
  run 18f, sitDown 24f, sitIdle 120f, standUp 24f, talkIdle 90f,
  gestureWave 45f, gestureNod 30f, gestureShrug 36f, gestureCheer ~40f.
- **Never keyed**: spring-chain bones (`earL/R.*`, `tail.*`), sockets,
  `root`, `jaw`. **No scale tracks at all. Translation only on `hips`.**
- **One-shot gestures end on the rest pose** (rotations ≈ identity; hips end
  at `[0, rest-y, 0]` within ~1.5e-3) — required for `makeClipAdditive`.
- **`sitDown`'s last frame equals `sitIdle`'s first frame** (shared pose) —
  the sit crossfade depends on it; `standUp` starts from the same pose.
- Loop clips close exactly: sampled frame N == frame 0 with tangent
  continuity.

### The choreography recipe (port source: `scripts/blender/clips.py` — inlined; the file dies in plan 016)

**Pose-space conventions** (clips.py:25-32; hold because rest rotations are
identity): pose-bone axes align with world axes for EVERY bone. `rotX+` =
pitch forward/down (nod); `rotY+` = yaw; `rotZ+` = roll. Character faces
+Z. Angles authored in degrees; hips `loc` values are DELTAS from rest (a
three.js `VectorKeyframeTrack` on `.position` is absolute local position =
rest + delta — your synthesizer adds the rest local back in).

**Authoring rules**: overlapping action — no two body parts start/stop on
the same frame; spine leads, chest +1..2, neck/head +2..4, arms +1..3.
Loops: repeat each channel's first key one loop-length later. Interpolation:
smooth (Bezier auto-clamped in Blender; use `InterpolateSmooth` or dense
sampling in three).

**Biped gait parameters** (shared two-step builder `_walk_like`,
clips.py:181-288 — reuse for the bird, adapt for quadrupeds): L contact at
frame 0, R at frames/2; walk = 27 frames with `swing 42° knee 70° bounce
0.022 m sway 0.010 m yaw 8° lean 6° armSwing 24° elbow 18° footRoll 36°`;
run = 18 frames with `swing 58 knee 104 bounce 0.042 sway 0.007 yaw 11
lean 15 armSwing 38 elbow 56 footRoll 42`. Leg phases: contact → loading →
mid-stance → toe-off (foot roll heel-strike −55%·roll → flat → heel-lift →
toe-off +100%·roll) → swing tuck (knee 100%) → reach overshoot (swing
−112%). Hips: double bounce per step (down at loading, up at passing),
lateral sway onto the stance leg, yaw with the stepping leg. Chest
counter-rotates hips; neck/head cancel most chest yaw (head stabilization).
Arms opposite-phase to legs.

**Sit** (clips.py:293-316): a shared `SIT_POSE` dict — hips
`rot(−8,0,0) loc(0,−0.245,−0.035)`, legs folded (`upperLeg −76°, lowerLeg
+58°, foot +16°`), hands toward knees. sitDown = anticipation (breath up +
look down) → descent with forward balance lean → settle 0.006 m past → ease
back. standUp mirrors with rock-forward anticipation and an overshoot above
rest at frame 17.

**Talk/gestures**: talkIdle = head nod-beats at irregular intervals + chest
emphasis + one gesticulating arm; wave = anticipation dip → arm up-out
(−76° roll on upperArm) → decaying forearm oscillation `[26, −24, 22, −16,
10]` with the hand lagging 1 frame → drop-through overshoot → rest; nod =
tip up −5° → down 15° → second smaller nod 11° → rest.

**Gait-speed measurement** (clips.py:696-719, port to TS): sample each foot
bone's world position per frame on a built skeleton playing the clip; a
frame is "stance" when foot height ≤ min + 25% of (max−min); average the
backward Z-speed over stance frames with negative dz. That average IS the
clip's ground speed — export it as the locomotion constant.

### Export seam

- `src/core/export/compile.ts` — `CompileAssets.clipsDocument: Document`
  ("The 11-clip set as a gltf-transform Document", lines 82–83);
  `REFERENCE_HIPS_LOCAL` (line 116); `buildAnimations` (line 498)
  hips-rebases while copying. The clips Document is loaded in
  `src/studio/roster/companionExport.ts` (WebIO) — note the path
  (`src/studio/roster/`, NOT `src/core/export/`).
- `src/studio/play/PlayMode.tsx` — loads the clip GLB via drei `useGLTF`,
  builds mixer + machine + locomotion + foot IK + talk driver; snapshots and
  restores the rest pose on exit.
- Track-name rule for the EXPORTED document (plan 000 §5): dotted bone
  names need subscript form — but your synthesizer never keys dotted bones
  (springs/sockets are forbidden), so this is a non-issue for generated
  tracks; don't burn time on it.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck && pnpm test` | exit 0 |
| One file | `pnpm test -- test/core/motion/clipSynth.test.ts` | pass |
| Gait soak | `pnpm test -- test/core/motion/gaitSoak.test.ts` | pass |
| Dev | `pnpm dev` | studio on :5190 |
| Runtime pkg | `pnpm --filter @sensemaking/companion-runtime test` | pass |

## Scope

**In scope**:
- `src/core/skeleton/canonical.ts` (stance rest tables), `archetypes.ts`
  (archetype v2 defs incl. `stance`, headCenter/colliders per stance)
- `src/core/spec/schema.ts` + `migrate.ts` (SPEC_VERSION 3; rename
  `biped-round → quad-round`, `biped-slim → quad-slim`)
- The full rename sweep (all files listed in "blast radius" above,
  including test updates)
- `src/core/species/registry.ts` (preset archetype ids; NO new species)
- `src/core/procgen/**` (stance re-parameterization of 013's kit)
- `src/core/motion/clipSynth/**` (new), `locomotion.ts` (computed speed
  constants), `footIK.ts` + `src/studio/play/PlayMode.tsx` (4-leg wiring),
  `proceduralIdle.ts` (per-stance amplitude tuning), `studioWalk.ts`
- `src/core/export/compile.ts` + `src/studio/roster/companionExport.ts`
  (clips source seam), new `src/core/export/clipsToDocument.ts`
- `test/core/**` mirrors incl. retargeted `clips.test.ts` and recalibrated
  `gaitSoak.test.ts`; `fixtures/*.character.json` (via migration)
- Final step: delete `src/assets/clips/clips-core-v1.glb` only. **No
  `scripts/blender/*.py` deletion** (016 sweeps — `clips.py` imports
  `bodies`, deleting pieces leaves orphans).

**Out of scope**:
- `assemble.ts`, `dress.ts`, face system, sculpt algorithms, wardrobe
  geometry (016), masks/grain (015), roster/shell UI beyond what the rename
  forces.
- Adding bones or renaming `BONE_NAMES` entries — the 38 names are fixed
  (D3). Front legs ride the arm chain.
- New species, ostrich archetype, reptiles (operator-deferred).

## Git workflow

Branch `advisor/014-natural-stance` off post-013 main; per-step commits,
`feat(character-studio): <step>`; no push/PR without operator.

## Steps

### Step 1: Stance vocabulary + quadruped rest tables

In `canonical.ts`, keep the biped table as `W_BIPED` (bird uses it) and add
`W_QUADRUPED`: horizontal spine along Z (head end +Z), the shoulder/arm
chain repurposed as front legs reaching the ground (`handL/R` = front feet,
y ≈ hind-foot height), hind legs under the hips, neck rising to a forward
head, tail exiting horizontally, `socket.torso` on the back (saddle),
`socket.back` behind it, `socket.hat` on the head. All rest rotations stay
identity. Keep overall body LENGTH ≈ the old height (≈1.0 reference) so
uniformScale math stays sane; document the chosen reference dimensions in
the file header (the reviewer checks them against real quadruped
proportions — a shiba is roughly as long as tall-at-head).

`archetypes.ts`: `ArchetypeDef` gains `stance: 'quadruped' | 'biped'`;
define `quad-round` (shiba/bear-cub/rabbit: compact, big head) and
`quad-slim` (cat/fox: longer, leaner) on `W_QUADRUPED`; keep `bird` on
`W_BIPED` re-proportioned toward a natural bird (body axis tilted forward,
head carried ahead — offsetScales + a recomputed `headCenter`). Rebuild
collider groups per stance (horizontal torso capsule for quadrupeds; the
head collider follows the new `headCenter`).

**Verify**: `pnpm test -- test/core/skeleton` → updated canonical tests
pass (translation-only rest; front AND hind feet at ground height within
1e-3 for quadruped archetypes; parents unchanged).

### Step 2: Spec v3 migration + the rename sweep

`schema.ts`: `ARCHETYPES = ['quad-round', 'quad-slim', 'bird']`,
`SPEC_VERSION = 3`. `migrate.ts`: add `MIGRATIONS[2]` — renames archetypes,
drops `sculptDelta` with a `console.warn` naming the character (013 bumped
meshVersions AND this step renames sculpt assetIds, so old deltas are
doubly dead), passes everything else through, sets `specVersion: 3`. Then
the full sweep from the blast-radius list — every `Record<Archetype, …>`
table, store default, and test literal. Update `species/registry.ts` preset
archetype fields (presets keep partIds/palettes/patternIds/faces). Update
fixtures by running them through the migration and re-serializing.

**Verify**: `pnpm typecheck` → 0 (the compiler finds stragglers for you);
`pnpm test -- test/core/spec` → migration tests cover v1→v3 and a
synthesized v2→v3 (build the v2 input by running a v1 fixture through
`MIGRATIONS[1]` in the test); loading a v1 fixture in dev succeeds with the
sculpt warn.

### Step 3: Re-parameterize procedural bodies/parts per stance

Using 013's skeleton-driven kit, generate quadruped bodies (horizontal
torso barrel + four stitched legs + neck/head mass) for `quad-round`/
`quad-slim`; re-proportion the bird body; adjust rigid-part attach origins
(muzzle on the forward head — `socket.muzzle` moved in step 1; ears/tail
unchanged by name). Keep the five `BODY_MORPHS` semantics working on the
new anatomy at comparable magnitudes. Keep hide-region submeshes
(`userData.bodyRegion`: torso/hips/upperLegs — on a quadruped, `torso` is
the back/barrel wrap that a jacket covers). Bump body meshVersions again
(topology changes). Retune `proceduralIdle.ts` amplitudes per stance
(quadruped weight shift is fore-aft `hips.position.z`, not lateral x-sway;
head bob stays y but smaller).

**Screenshot gate**: all 8 species applied, orbit shots; mammals must read
as four-legged animals of their species (Pokopia/AC-adjacent softness), the
bird as a bird; include the drawn face in at least two shots (the head-UV
contract from 013 must survive the re-proportion).

**Verify**: `pnpm test` → procgen + assemble + species tests green.

### Step 4: Clip synthesizer

New `src/core/motion/clipSynth/`: pure TS generators returning
`THREE.AnimationClip[]` for a given archetype (stance + proportions from
`ARCHETYPES_DEF`). Build a small `ClipAuthor` helper mirroring clips.py's
`Clip` class: `key(bone, frame, {rotDeg?, locDelta?})` writing quaternion/
vector tracks at FPS 30, `finish()` closing loops (repeat first key at
frame N) or asserting one-shots end at rest. Author in the inlined
pose-space conventions (identity rest → world-aligned axes; hips loc =
rest + delta).

Produce EXACTLY the `REQUIRED_CLIPS` names, honoring the FULL clip
contract from Current state — contract durations, no scale tracks,
translation only on hips, never key springs/sockets/root/jaw, gestures end
at rest, **sitDown's final pose === sitIdle's first pose** (share a
`SIT_POSE` constant like clips.py does).

- Biped (bird): port `_walk_like` with the walk/run parameter sets above
  (they are the proven AC-feel numbers), waddle-flavored (more sway, less
  armSwing — wings mostly still), perch-sit, existing gesture adaptations.
- Quadruped: extend the gait builder to four legs — walk = 4-beat lateral
  sequence (phases LH 0, LF 0.25, RH 0.5, RF 0.75 of the cycle), run = trot
  (diagonal pairs: LF+RH at 0, RF+LH at 0.5); front legs drive the
  shoulder/arm chain with the same contact→load→toe-off→swing envelope;
  spine bounce becomes pitch (rotX) rather than yaw-dominant; head
  stabilization unchanged in spirit. Sit = haunch sit (hips drop + pitch
  back, hind legs fold, front legs straight), gestures mapped naturally
  (wave = front-paw lift, nod = head, shrug = body shake, cheer =
  front-legs rear-up hop — check torso/ground clearance).
- **Computed gait speeds**: port `measure_gait_speed` to TS (algorithm in
  Current state) running against a built skeleton + generated clip;
  replace the `WALK_CLIP_SPEED`/`RUN_CLIP_SPEED` constants in
  `locomotion.ts` with per-archetype values exported by clipSynth. Keep the
  zero-skate contract `timeScale = rootSpeed / clipRefSpeed`.
- Contact discipline: during a foot's stance window its world speed must be
  ≈ constant (the wave-1 plan-004 finding: cycle-average-only calibration
  leaves the anti-skate gate inert at run — synthesis can and must hold the
  contact-phase speed flat).
- Determinism: seeded params only; clips built once per archetype and
  memoized.

Wire PlayMode + StudioWalk to clipSynth clips (drop `useGLTF(clipsUrl)`).
Retarget `test/core/motion/clips.test.ts` from the GLB to clipSynth output,
keeping every invariant it encodes.

**Verify**: `pnpm test -- test/core/motion` → retargeted clips.test.ts
green (durations, no-scale, hips-only translation, gesture rest-pose end,
sit continuity) + new clipSynth tests (names complete, determinism, no
spring-bone tracks, contact-phase speed variance under threshold).

### Step 5: Foot IK on four legs

Extend PlayMode's IK wiring: quadruped archetypes get four chains — hind =
(`upperLeg`, `lowerLeg`, `foot`), front = (`upperArm`, `foreArm`, `hand`)
via the same `solveTwoBoneIK`, with per-chain pole directions (hind knees
bend forward +Z; front "elbows" bend backward −Z). Bird keeps two. Keep the
correction-only philosophy (≤6 cm clamp, ~80 ms blend).

Recalibrate `gaitSoak.test.ts`: update its `REF_HIPS` derivation for the
stance, extend to front feet, and re-pin baselines honestly — the wave-1
plan-004 measured numbers (walk engagement 0.246, run 0.000) were for the
authored clips and are obsolete; the synthesizer should hit the plan-006
target bounds at BOTH gaits: engagement ratio > 0.5, drift < 0.02 (same
units as the existing pins). Document the new measured numbers in the test
header.

**Verify**: gait soak green on all archetypes, front and hind; visual
walk/run on `quad-slim` shows no front-foot skate.

### Step 6: Export + runtime parity

Add `src/core/export/clipsToDocument.ts`: bake clipSynth output into a
gltf-transform `Document` with the node/track conventions `buildAnimations`
expects. Update the reference-hips value **in all four places** (compile.ts
`REFERENCE_HIPS_LOCAL`, PlayMode `REF_HIPS`, studioWalk option call sites,
gaitSoak) — per stance, sourced from one new exported constant rather than
four literals. Update `src/studio/roster/companionExport.ts` to build the
clips Document from clipSynth instead of WebIO-reading the GLB. Export one
quadruped + the bird; load both in `packages/companion-runtime` tests
(three 0.149 and 0.185) — clips play, springs live, talk works. Also update
`test/core/export/conformance.test.ts`/`senCompanion.test.ts` expectations
(they hardcode old archetype ids — the step-2 sweep should already have
caught them; confirm).

**Verify**: `pnpm --filter @sensemaking/companion-runtime test` → pass;
exported GLB `overBudget: false`; a generic three GLTFLoader (no
SEN_companion) still shows a sane animated character.

### Step 7: Delete the clip GLB (gated)

After reviewer/operator approval of steps 3–6 visuals: delete
`src/assets/clips/clips-core-v1.glb` and dead loading branches. `clips.py`
and the `gen:clips` entry STAY (016 sweeps).

**Verify**: `pnpm typecheck && pnpm test` green;
`git grep -rn "clips-core-v1" -- src` → no matches.

## Test plan

- Retargeted `test/core/motion/clips.test.ts` — the full contract against
  clipSynth output (durations, forbidden bones, no scale, hips-only
  translation, gesture rest end within 1.5e-3, sitDown→sitIdle continuity).
- `test/core/motion/clipSynth.test.ts` — determinism, per-stance clip sets,
  contact-phase foot-speed flatness, computed gait speeds > 0 and
  plausible (walk 0.5–1.2 m/s, run 1.4–2.5 m/s).
- Updated `test/core/skeleton/canonical.test.ts` — both stance tables.
- `test/core/spec/migrate.test.ts` — v1→v3 chain + synthesized v2→v3
  (archetype rename, sculpt drop warns, wardrobe/palette/face preserved).
- Recalibrated `test/core/motion/gaitSoak.test.ts` — new pinned baselines,
  4 feet, numbers documented in the header.
- Export round-trip in `test/core/export/` — clipsToDocument survives
  compile + companion-runtime load.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0; companion-runtime tests exit 0
- [ ] All 5 mammal species render and animate as quadrupeds; robin/owl/
      duckling as natural birds (screenshots + Play-Mode walk/run webm per
      stance — operator reviews on mobile, webm only)
- [ ] Gait soak: engagement ratio > 0.5 and drift < 0.02 for walk AND run,
      all archetypes, front and hind feet
- [ ] `ls src/assets/clips/` → no GLB; `git grep clips-core-v1 -- src` →
      none; `scripts/blender/` untouched (`git status`)
- [ ] `git grep -n "biped-round\|biped-slim" -- src test fixtures` → no
      matches (rename sweep complete; scripts/ and docs may still match)
- [ ] Species apply + ⌘Z undo still one-step; wardrobe still dresses
      (garments may fit imperfectly until 016 — note, don't fix)
- [ ] `advisor-plans/README.md` wave-3 row updated

## STOP conditions

- Plan 013 is not merged (no `src/core/procgen/`), or its kit hardcodes
  upright assumptions you cannot re-parameterize without rewriting it.
- Preserving identity rest rotations makes the quadruped pose unreachable
  for some chain (i.e., you believe you must introduce rest rotations or
  new bones) — that is a plan-000-level contract change; report, don't do it.
- The rename sweep cascades into `assemble.ts`/`dress.ts` beyond type-name
  flow-through (they should only see the type change via imports).
- Synthesized clips cannot satisfy the retargeted clips.test.ts contract
  (especially sit continuity or gesture rest-end) after two tuning rounds.
- The quadruped gait cannot pass the contact-flatness/soak gates after two
  tuning rounds.
- `hipsRebase`/export produces broken root motion for the horizontal spine
  after one fix attempt.
- Any pressure to add/rename `BONE_NAMES` entries or add new species.

## Maintenance notes

- The stance tables + clipSynth parameters are now the animation source of
  truth; gait tuning is TS constants; locomotion speeds are computed by the
  ported `measure_gait_speed` — never hand-measure again.
- The reference-hips constant is exported from ONE place after step 6 —
  keep it that way; the four-literal situation this plan fixes was a landmine.
- Gesture names now have stance-dependent meanings; if a future UI labels
  gestures, label per stance.
- When this lands: mark wave-1 plan 006 (contact-phase clip flattening)
  REJECTED in the wave-1 table — synthesized clips make it moot. Wave-1
  plan 005 (on-mesh face export) remains open and is NOT part of wave 3.
- Reviewer scrutiny: quadruped silhouette quality (highest "dog-shaped
  table" risk — reject early); rear-up cheer clearance; sit ground
  penetration; bird re-proportion not regressing wave-1 plan 007's
  wing-drape; the rename diff being mechanical (no logic smuggled in).
