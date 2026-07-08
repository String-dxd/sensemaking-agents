# Plan 007: AC-benchmark limb proportions — arms hang to the hips, wings drape the body

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. Skip updating `advisor-plans/README.md` — the reviewer maintains
> the index.
>
> **Drift check (run first)**: `git diff --stat 3d74ab4..HEAD -- character-studio/src/core/skeleton/ character-studio/scripts/blender/`
> Planned against local main `3d74ab4` (post plans 001–004). Any change in
> those paths since then → compare excerpts before proceeding; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED (touches the canonical skeleton's arm chain; regenerates all Blender assets)
- **Depends on**: 003 (welded bodies — DONE; the weld is what makes body-hugging arms feasible)
- **Category**: tech-debt (proportion calibration vs the AC benchmark)
- **Planned at**: commit `3d74ab4`, 2026-07-06

All commands run from `character-studio/`. Blender at
`/Applications/Blender.app/Contents/MacOS/Blender` (verified present).

## Why this matters

Dogfooding feedback: "the shape of the hands and wings are especially
abnormal. Very short." Confirmed by direct visual audit against official
AC:NH villager renders: our arms are splayed A-pose stubs ending at
upper-torso height, with a carrot taper and a tucked ball hand; our bird
wings are short flattened side-paddles. AC villagers' arms hang nearly
vertically along the torso with mitten tips at hip level, near-constant
width; AC bird wings drape straight down the body sides with tapered tips
reaching leg-root level. The proportions live in exactly three places —
the canonical skeleton's arm chain, the archetype scale table, and the
Blender body builder's arm/wing/hand styling — all regenerable from code.

## Benchmark (measured from official renders — the acceptance reference)

Reference images (downloaded official NH renders; READ these before tuning,
do NOT commit them or copy them into the repo — Nintendo assets):

- `/private/tmp/claude-501/-Users-jeongwondo-Developer-sensemaking-agents/897d4c94-6146-4474-b016-060f64e863c1/scratchpad/ac-Goldie.png` (dog — arm hang + mitten)
- `/private/tmp/claude-501/-Users-jeongwondo-Developer-sensemaking-agents/897d4c94-6146-4474-b016-060f64e863c1/scratchpad/ac-Stitches.png` (cub — plush constant-width arms)
- `/private/tmp/claude-501/-Users-jeongwondo-Developer-sensemaking-agents/897d4c94-6146-4474-b016-060f64e863c1/scratchpad/ac-Jacques.png` (bird — wing drape)
- `/private/tmp/claude-501/-Users-jeongwondo-Developer-sensemaking-agents/897d4c94-6146-4474-b016-060f64e863c1/scratchpad/ac-Lucha.png` (bird — wing drape)

Calibration targets (reference skeleton space, 1.0 tall, hips y = 0.34):

| Metric | AC target | Ours today |
|---|---|---|
| Arm rest direction | ≈ 10–15° from vertical, hugging the torso | ~30° below HORIZONTAL (≈ 60° from vertical) |
| Wrist rest height | hip level: y ≈ 0.33–0.35 | y = 0.428 |
| Wrist lateral reach | just outside the torso flank: x ≈ 0.18–0.20 | x = 0.275 |
| Arm width profile | near-constant, soft mitten end | taper 1.45→0.78 × arm_r |
| Hand | rounded mitten continuous with the arm, slightly bulged | distinct ball half-tucked into a thin wrist |
| Bird wing | drapes down the body side, root chord wide, tapered tip at torso bottom (y ≈ 0.25–0.30) | short flattened paddle ending at y ≈ 0.43, splayed outward |
| Overall | ~2–2.5 heads tall (we already match; don't touch height/legs/head) | ✓ keep |

## Current state

- `src/core/skeleton/canonical.ts` — reference WORLD joint table `W`
  (lines 36–75). Arm chain today:

```ts
shoulderL: [0.055, 0.52, 0],
upperArmL: [0.125, 0.515, 0],
foreArmL: [0.205, 0.468, 0],
handL: [0.275, 0.428, 0],
// mirrored R side; also:
'socket.handL': [0.315, 0.405, 0],
'socket.handR': [-0.315, 0.405, 0],
```

  Rest-pose comment at lines 12: "arms relaxed ~30° below horizontal" — this
  plan changes that convention to "arms hang along the torso, ~12° from
  vertical (AC benchmark)"; update the comment.
  CRITICAL invariant to preserve (lines 13–16): every bone's rest LOCAL
  ROTATION stays identity — positions carry the pose.

- `src/core/skeleton/archetypes.ts` — `arms(scale)` applied per archetype
  (biped-round `[0.9,0.9,1]`, biped-slim `[1.1,1.1,1]`, bird `[0.95,1,1]`).
  These multiply the LOCAL offsets, so they scale the new chain too — keep
  them unless tuning demands otherwise.

- `scripts/blender/bodies.py` — arm/hand/wing construction:
  - biped arm: `capsule_along(arm_root → handL, arm_r*1.45 → arm_r*0.78, fullness=0.55)`
    with `root_pull` burying the root (lines ~216–224); hand ellipsoid
    tucked into the arm end (lines ~229–240).
  - bird wing: `capsule_along(upperArmL-offset → handL+offset, arm_r*1.1 → arm_r*1.7)`,
    `verts[:,2] *= 0.42` flatten (lines ~193–212).
  - STYLE knobs per archetype (lines 125–141): `arm_r`, `hand_r`.
- `scripts/blender/weld.py` — welds limbs into the torso (plan 003); a
  body-hugging arm will overlap the torso MORE, which the weld handles —
  but watch the junction band size.
- `scripts/blender/clips.py` — gait/gesture clips author arm-swing
  ROTATIONS against the rest pose; rest direction change alters how swings
  read (an X-rotation of a vertical arm swings it forward/back — correct;
  the wave gesture lift was tuned for the old A-pose and may need its
  amplitude retuned; browser check in Step 6).
- Tests with pinned proportion-adjacent values:
  `test/core/skeleton/canonical.test.ts` (may pin joint positions),
  `assets.test.ts` (junction blended-vert counts ≥300; tri budget),
  `junction.test.ts` (shoulder-band stretch < 2×),
  `test/core/motion/gaitSoak.test.ts` (legs untouched — pins must NOT move),
  `test/core/motion/clips.test.ts` (durations/track contract — unchanged).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Skeleton JSON | `pnpm gen:skeleton-json` | exit 0 |
| Bodies + parts | `pnpm gen:assets` | exit 0, report lines, previews |
| Clips | `pnpm gen:clips` | exit 0; prints measured gait speeds |
| Wardrobe | `pnpm gen:wardrobe` | exit 0 |
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / all pass |
| Fixture | `pnpm tsx scripts/make-hero-fixture.ts` | regenerates hero-shiba |

## Scope

**In scope**:

- `src/core/skeleton/canonical.ts` (arm-chain + hand-socket entries in `W`; rest-pose comment)
- `src/core/skeleton/archetypes.ts` (only if tuning requires arm-scale changes)
- `scripts/blender/bodies.py` (arm/hand/wing construction + STYLE knobs)
- `scripts/blender/weld.py` (only junction-band parameters if the new overlap needs them)
- Regenerated artifacts: `src/assets/anatomy/body-*.glb`, `textures/body-*.mask.png`,
  `src/assets/anatomy/parts/*.glb` (regenerated as a pipeline side effect),
  `src/assets/clips/clips-core-v1.glb`, `src/assets/wardrobe/*.glb`,
  `fixtures/hero-shiba.character.json`
- `src/core/skeleton/partRegistry.ts` (meshVersion bump 2→3 for the three bodies)
- `src/core/motion/locomotion.ts` — ONLY the `WALK_CLIP_SPEED`/`RUN_CLIP_SPEED`
  constants, ONLY if `pnpm gen:clips` prints different measured speeds
  (leg chain untouched → expect unchanged; if they differ by >2%, STOP).
- Tests whose pins encode the old arm geometry: `canonical.test.ts`,
  `assets.test.ts` junction counts, `junction.test.ts` — update pins to
  newly measured values with a comment; do not weaken assertion logic.

**Out of scope** (do NOT touch):

- Legs, feet, head, torso, ears, tail — every non-arm entry in `W`.
- `clips.py` keyframe VALUES except the wave/cheer arm-lift amplitudes IF
  Step 6 shows the gesture reads wrong (then minimal retune, documented).
- `src/core/face/**`, wardrobe item DEFINITIONS (`wardrobe.py` authoring
  logic — regeneration only), sculpt runtime, export compiler.
- `test/core/motion/gaitSoak.test.ts` pins — legs are untouched; if those
  pins break, that's a STOP (something leaked into the leg chain).

## Git workflow

- Branch: `advisor/007-ac-limb-proportions` from local main.
- Conventional commits per logical unit (`feat(character-studio): ...`).
- Do NOT push or open a PR.

## Steps

### Step 1: Re-aim the canonical arm chain

In `canonical.ts` `W`, replace the arm chain (L side; mirror R exactly):

```ts
shoulderL: [0.055, 0.52, 0],          // unchanged
upperArmL: [0.115, 0.505, 0.005],
foreArmL:  [0.155, 0.42, 0.01],
handL:     [0.185, 0.34, 0.015],      // wrist at hip level, hugging the flank
'socket.handL': [0.205, 0.312, 0.018],
```

These are CALIBRATED START VALUES from the benchmark table (arm ≈ 12–17°
from vertical, wrist y = 0.34 = hip height, segment lengths ≈ 0.094 + 0.085
≈ today's 0.093 + 0.081 so clip swing amplitudes stay sensible). You may
tune ±15% during Step 5's visual iteration; the acceptance criteria in
Step 5 are the contract, not these exact numbers. Update the rest-pose
comment (line 12). Mirror R side (negate x). Update any
`canonical.test.ts` pins.

**Verify**: `pnpm typecheck` → 0; `pnpm test` → identify (and fix pins for)
every failure caused ONLY by the new arm numbers; anything else failing = STOP.

### Step 2: Restyle biped arms + hands in bodies.py

- Arm capsule: near-constant width — taper `arm_r*1.15 → arm_r*0.95`
  (from 1.45→0.78), keep `fullness=0.55`; keep `root_pull` shoulder burial
  (the weld eats the overlap).
- Hand: enlarge slightly (`hand_r` biped-round 0.052→0.058, biped-slim
  0.046→0.050) and blend it INTO the arm end (increase the tuck overlap so
  the silhouette reads as one soft mitten, not a ball on a stick).
- The arm now lies against the torso flank — confirm the weld's junction
  band still classifies the shoulder region only (not the whole arm); if
  the arm-torso contact makes the boolean union swallow the arm, adjust
  `root_pull`/junction `k` minimally and report.

**Verify**: `pnpm gen:skeleton-json && pnpm gen:assets` → exit 0, tri
budgets hold, welded report lines print; READ the biped-round +
biped-slim preview PNGs (front + three-quarter): arms hang along the body,
mitten ends at hip level.

### Step 3: Re-drape the bird wing

Rebuild the wing as a body-hugging drape: root chord at the shoulder
(wide, `arm_r*1.5`-ish), tip tapered (`arm_r*0.6`), running DOWN the torso
side to the wing tip near torso bottom (world y ≈ 0.26–0.30 reference
before archetype scale), slight outward/backward lean; keep the z-flatten
but relax it (0.42 → ~0.55) so the wing reads volumetric like Jacques'.
Use the new `handL` joint as the tip anchor (the bird archetype's arm
scale `[0.95,1,1]` applies). Keep the wing-tip accent channel
(`CH_ACCENT` smoothstep along t).

**Verify**: `pnpm gen:assets` → exit 0; READ body-bird previews (front,
three-quarter, side): wings drape the body sides, tips near leg roots, no
gap between wing and torso (the weld should merge the contact band), and
compare against `ac-Jacques.png` / `ac-Lucha.png`.

### Step 4: Regenerate the animation + wardrobe stack

1. `pnpm gen:clips` — compare printed gait speeds against
   `WALK_CLIP_SPEED = 0.89` / `RUN_CLIP_SPEED = 1.766`; expect identical
   (legs untouched). Differences ≤2%: update the constants + note it.
   More: STOP.
2. `pnpm gen:wardrobe` — sleeves rebake against the new arm joints.
3. Bump the three `BODY_REGISTRY` meshVersions 2→3.
4. `pnpm tsx scripts/make-hero-fixture.ts` — regenerate the hero-shiba.

**Verify**: `pnpm typecheck` → 0; `pnpm test` → all pass (update junction
count pins in `assets.test.ts` to newly measured values; `junction.test.ts`
stretch bound < 2 must still hold WITHOUT loosening; `gaitSoak` pins must
pass untouched).

### Step 5: Visual acceptance iteration (the actual gate)

Regenerate previews and READ them side-by-side with the four AC reference
renders. Acceptance criteria (iterate Step 1/2/3 constants until all hold):

- [ ] Biped front view: arm silhouette within ~15° of vertical; mitten tip
      at hip level ±0.02 (measure against the preview: hips = leg-root
      height); arm width visually near-constant; hand reads as a soft
      mitten continuous with the arm.
- [ ] Biped three-quarter: arm rests against the torso with no gap and no
      crease at the shoulder (welded).
- [ ] Posed-arm previews (armpose renders): junction stays smooth at 60°.
- [ ] Bird front + side: wings hug the body, tips at torso bottom, read
      volumetric-tapered like Jacques, not paddles.
- Iterate at most 4 rounds; if still failing, STOP with the renders and
  what you tried.

### Step 6: Browser smoke (automated parts)

`pnpm dev` → clean startup. Then note as DEFERRED TO REVIEWER: studio walk
arm-swing readability, wave/cheer gestures reaching high enough from the
new vertical rest, tee/hoodie sleeve fit, hand-held item (mug) placement
via `socket.handL`.

## Done criteria

- [ ] `pnpm typecheck` 0; `pnpm test` all pass; gaitSoak pins UNTOUCHED
- [ ] All four gen commands exit 0; tri budgets hold
- [ ] meshVersion 3 on all three bodies; hero fixture regenerated
- [ ] Step 5 acceptance boxes all checked, with before/after preview
      renders kept in the report
- [ ] `git status` clean; only in-scope files changed

## STOP conditions

- Measured gait speeds change >2% (implies leg-chain contamination).
- gaitSoak pins fail.
- The weld cannot handle the body-hugging arm (non-manifold or swallowed
  arm) after two parameter attempts.
- Step 5 acceptance unreachable in 4 tuning rounds.
- Any needed change lands outside the in-scope list.

## Maintenance notes

- The AC reference renders live in a session scratchpad and will vanish;
  the calibration TABLE in this plan is the durable record.
- Plan 005 (export migration) and 006 (clip contact-phase) are unaffected;
  006's clip regeneration will inherit the new rest pose — re-run the
  gesture readability check afterwards.
- Sculpt payloads invalidate again (meshVersion 3) — expected.
