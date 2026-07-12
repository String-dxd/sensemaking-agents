# Plan 027: Island editor — swim wake ripples + smooth swim transitions

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), report in the STATUS/STEPS/FILES CHANGED/NOTES format.
>
> **Drift check (run first)** — `<BASE>` = the commit named in your dispatch
> (the feat/island-editor-v2 tip WITH plan 026 merged):
> `git diff --stat <BASE>..HEAD -- island-editor/src/scene/materials/SeaMaterial.ts island-editor/src/scene/SeaSurface.tsx island-editor/src/scene/characterPose.ts island-editor/src/scene/CharacterActor.tsx island-editor/test/materials.test.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P2 (polish on the plan-025/026 swimming behavior)
- **Effort**: S
- **Risk**: LOW (fragment-shader addition + one flag on an existing store)
- **Depends on**: plan 026 merged (it reworks CharacterActor's draught
  condition, which this plan mirrors into the pose store)
- **Category**: direction (visual polish)
- **Planned at**: 2026-07-12, written against `9dd8921` + plan 026

## Why this matters

Two maintainer reports on the swimming:

1. The sea surface doesn't react — it reads as sliding, not swimming. This
   plan adds a wake: expanding foam ripple rings centered on the bird while
   (and only while) it is swimming, in the sea shader itself.
2. **"The swimming looks patchy — sometimes the animation restarts and the
   character moves back again."** Root cause (verified in
   `characterBehavior.ts`): swim ENTRY and EXIT use the SAME threshold
   (`heightAt <= seaLevel + WATER_EPS` with `WATER_EPS = 0.02`). Right at
   the waterline the phase flip-flops swim↔walk every few ticks; each flip
   restarts the clip (the actor's crossfade effect runs
   `action.reset().fadeIn()` on every resolved-clip change) AND toggles the
   body between ground height and the swim draught (`seaLevel - SWIM_SINK`)
   — a vertical pop that reads as "moved back." Fix: **hysteresis** (enter
   at `seaLevel + 0.02`, exit only above `seaLevel + 0.07` — clearly onto
   the 0.05-high beach tier) plus a **rate-limited vertical blend** in the
   actor so the draught change never pops.

Decided mechanisms (do not re-litigate):

- **Fragment-level rings in SeaMaterial** — the shader already has the world
  position (`vWorld`) and `uTime`; a distance-based ring band modulated
  toward the existing `uFoam`/shore-white palette is a few lines and costs
  nothing measurable. No particles, no extra meshes, no render targets.
- **Live position via the existing `characterPose` singleton** (plan 025),
  which gains a `swimming: boolean`. SeaSurface's existing `useFrame`
  (it already drives `uTime`) copies pose → uniform. No React state.
- Sea `uTime` runs at 0.45× wall clock (`SeaSurface.tsx`:
  `elapsedTime * 0.45`) — ring speed constants below are tuned for that.

## Current state (verified at `9dd8921`; plan 026 does not touch these files
except CharacterActor)

Gate: `pnpm check:island-editor` from the worktree root (record your own
baseline count — 026's report says what it is).

### `src/scene/materials/SeaMaterial.ts`

Raw ShaderMaterial (house style; fragment ends with
`#include <colorspace_fragment>`; `test/materials.test.ts` asserts the
uniform set and that no TinySkies provenance signatures appear — do not add
strings matching `w3 * w5 * w7`, `spMask`, or `noiseOff) * 4.0`). Fragment
has `varying vec3 vWorld` (world position) and uniforms
`uSea/uDeep/uFoam/uShoreTex/uWorldSize/uFoamCells/uShortBubbles/uTime`.
The tail of `main()` (exact current code — the wake inserts between the
shortBubbles mix and the horizon fade):

```glsl
  col = mix(col, shoreWhite, max(contactLip * 0.46, foamLip * (0.52 + foamFlow * 0.20)));
  col = mix(col, shoreWhite, shortBubbles * 0.62);

  // Atmospheric horizon fade: …
  float rr = length(vWorld.xz);
```

### `src/scene/SeaSurface.tsx`

Builds the material once, refreshes the shore DataTexture per edit, and has
a `useFrame` at line ~50 driving `material.uniforms.uTime.value =
state.clock.elapsedTime * 0.45`.

### `src/scene/characterPose.ts` (plan 025)

```ts
export const characterPose = { x: 0, y: 0, z: 0, active: false }
```

Written every frame by `CharacterActor`'s `useFrame`; read by `GrassLayer`.

### `src/scene/CharacterActor.tsx` (post-026)

The actor computes a draught condition for the swim waterline — after plan
026 it is `s.phase === 'swim' || (s.phase === 'goto' && s.wet)` (verify with
`grep -n "SWIM_SINK" island-editor/src/scene/CharacterActor.tsx` and read
the surrounding lines; if the actual expression differs, MIRROR the actual
one — the swimming flag must equal "is at the swim waterline").

## Scope

**In scope**:

- `island-editor/src/scene/materials/SeaMaterial.ts` (uSwim uniform + wake GLSL)
- `island-editor/src/scene/SeaSurface.tsx` (uniform write in the existing useFrame)
- `island-editor/src/scene/characterPose.ts` (add `swimming: false`)
- `island-editor/src/scene/CharacterActor.tsx` (write the flag; vertical blend)
- `island-editor/src/models/characterBehavior.ts` (water hysteresis ONLY)
- `island-editor/test/characterBehavior.test.ts` (hysteresis cases)
- `island-editor/test/materials.test.ts` (SeaMaterial block only)

**Out of scope**: GrassLayer/GrassBladeMaterial, IslandGroundMaterial,
terrain core, the goto/talk/sleep transitions (026's machine logic stays),
everything else. Do NOT touch the TinySkies-provenance assertions.

## Git workflow

Branch `advisor/027-swim-wake` off the tip named in your dispatch. Commit:
`feat(island-editor): swim wake ripples around the swimming bird`.
Do NOT push.

## Steps

### Step 0: Water hysteresis (pure machine)

In `characterBehavior.ts`:

1. Replace the single `WATER_EPS = 0.02` with TWO constants and a helper:

```ts
const WATER_ENTER = 0.02 // heightAt <= seaLevel + this → start swimming
const WATER_EXIT = 0.07  // heightAt >  seaLevel + this → back ashore (above the 0.05 beach top)
```

2. Every ENTRY check (`walk`/`goto` deciding the ground turned to water, and
   the `wet` field update) keeps `<= seaLevel + WATER_ENTER`. Every EXIT
   check (swim → walk, and goto's wet turning false) becomes
   `> seaLevel + WATER_EXIT`. The `wet` field itself needs the hysteresis
   too: `s.wet = s.wet ? h <= env.seaLevel + WATER_EXIT : h <= env.seaLevel + WATER_ENTER`
   (once wet, stays wet until clearly ashore).
3. Tests (`test/characterBehavior.test.ts`, new cases): an env whose
   `heightAt` returns `seaLevel + 0.04` (between the thresholds) —
   (a) a walking bird does NOT enter swim; (b) a swimming bird does NOT
   exit swim (no flip-flop zone); (c) exit happens once `heightAt` returns
   `seaLevel + 0.1`.

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0;
`npx vitest run test/characterBehavior.test.ts` → all pass.

### Step 1: The flag

1. `characterPose.ts`: the object becomes
   `{ x: 0, y: 0, z: 0, active: false, swimming: false }` (doc comment: set
   while the bird is at the swim waterline; drives the sea shader's wake —
   plan 027).
2. `CharacterActor.tsx`: where the pose is written each frame, add
   `characterPose.swimming = <the same boolean the y-draught uses>` (see
   "Current state" — after 026 that is
   `s.phase === 'swim' || (s.phase === 'goto' && s.wet)`; hoist it into a
   `const swimming = …` used by both the y computation and the pose write
   rather than duplicating the expression). In the reduced-motion branch and
   the unmount cleanup, set `swimming = false`.
3. **Vertical blend** (kills the shore pop): instead of assigning the target
   y directly, keep a `smoothY = useRef<number | null>(null)` and blend:

```ts
    const targetY = swimming ? spec.seaLevel - SWIM_SINK : ground
    smoothY.current = smoothY.current === null
      ? targetY
      : smoothY.current + (targetY - smoothY.current) * Math.min(1, 10 * dt)
    group.position.set(s.x, smoothY.current, s.z)
```

   Reset `smoothY.current = null` in the same effect that resets the
   behavior state (re-place snaps, no glide across the island). The pose
   store keeps writing the BLENDED y (the grass fade should follow the
   visible body).

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 2: The wake in SeaMaterial

1. Add uniform `uSwim` — `vec4`: `.xy` = bird world x/z, `.w` = 1 while
   swimming else 0 (`.z` unused). Default `new THREE.Vector4(0, 0, 0, 0)`.
   Declare in the fragment shader; add to the uniforms object (no
   constructor option needed — it is runtime-driven only).
2. Insert between the `shortBubbles` mix and the horizon-fade block:

```glsl
  /* ----- SWIM WAKE (plan 027) --------------------------------------------
   * Expanding foam rings around the swimming bird. uTime runs at 0.45x wall
   * clock (SeaSurface), so ring phase uses a higher multiplier. Rings fade
   * in from the body (not under it) and out by ~1.2 world units. */
  float swimD = distance(vWorld.xz, uSwim.xy);
  float swimRing = smoothstep(0.62, 0.95, 0.5 + 0.5 * sin(swimD * 12.0 - uTime * 11.0));
  float swimWake = uSwim.w * swimRing
                 * smoothstep(0.08, 0.28, swimD)
                 * (1.0 - smoothstep(0.45, 1.2, swimD));
  col = mix(col, shoreWhite, swimWake * 0.7);
```

   (`shoreWhite` is already in scope at that point.)

**Verify**: `npx tsc --noEmit` → exit 0;
`grep -n "uSwim" island-editor/src/scene/materials/SeaMaterial.ts` →
declaration + uniforms entry + wake use.

### Step 3: Drive the uniform

`SeaSurface.tsx`: import `characterPose` from `./characterPose`; in the
existing `useFrame`, after the uTime line:

```ts
    const swim = material.uniforms.uSwim.value as THREE.Vector4
    swim.set(characterPose.x, characterPose.z, 0, characterPose.active && characterPose.swimming ? 1 : 0)
```

(Adapt the material variable name to what the file actually uses.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Tests

`test/materials.test.ts`, SeaMaterial describe block ONLY:

- Add `uSwim` to the expected-uniforms list; assert
  `mat.uniforms.uSwim.value.w === 0` (no wake by default).
- New case: fragment contains `uSwim.w` and the ring band
  (`sin(swimD * 12.0 - uTime * 11.0`) — the wake contract.
- Do NOT touch the provenance assertions; confirm the new GLSL contains
  none of the banned substrings (it doesn't by construction).

**Verify**: `cd island-editor && pnpm test` → all pass; report exact count.

### Step 5: Gate

`pnpm check:island-editor` (worktree root) → exit 0. Reviewer does the
browser pass: rings appear around the bird only while swimming, travel with
it, vanish ashore; no rings when no character.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "swimming" island-editor/src/scene/characterPose.ts island-editor/src/scene/CharacterActor.tsx island-editor/src/scene/SeaSurface.tsx` → all three hit
- [ ] `grep -n "uSwim" island-editor/src/scene/materials/SeaMaterial.ts` → hits
- [ ] `grep -n "WATER_ENTER\|WATER_EXIT" island-editor/src/models/characterBehavior.ts` → both defined and used
- [ ] `git status` — only the seven in-scope files

## STOP conditions

- The post-026 draught expression in CharacterActor is materially different
  from the documented one and you cannot identify the equivalent boolean —
  report rather than guessing.
- You find yourself adding meshes/particles/render targets — the decided
  mechanism is fragment-only.

## Maintenance notes

- Knobs: ring frequency (12.0), speed (11.0 — remember the 0.45× clock),
  fade radii (0.28 / 0.45–1.2), intensity (0.7).
- If the bird ever gets a walk-splash or landing effect, extend `uSwim.z`
  (currently unused) as an intensity channel rather than adding uniforms.
- Reviewer focus: the wake must be OFF when idle/ashore (w=0 path), and the
  provenance test must remain untouched.
