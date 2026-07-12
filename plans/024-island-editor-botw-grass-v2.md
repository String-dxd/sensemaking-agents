# Plan 024: Island editor — BOTW grass v2 (sharp soft-edged blades, per-blade wind, character reaction + fade)

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), report in the STATUS/STEPS/FILES CHANGED/NOTES format.
>
> **Drift check (run first)**:
> `git diff --stat 74e9392..HEAD -- island-editor/src/scene/GrassLayer.tsx island-editor/src/scene/materials/GrassBladeMaterial.ts island-editor/src/terrain/grassField.ts island-editor/test/materials.test.ts island-editor/test/grassField.test.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P1 (maintainer direction, with reference video)
- **Effort**: M
- **Risk**: MED (shader math + first use of alpha-to-coverage in this app)
- **Depends on**: everything through commit `74e9392` (merged on
  `feat/island-editor-v2`)
- **Category**: direction (visual style)
- **Planned at**: commit `74e9392`, 2026-07-12

## Why this matters

The maintainer wants the meadow upgraded to the technique shown in
"All Zelda BOTW grass techniques revealed" (Epic Dragonfly,
youtube.com/watch?v=3eN3h6hV45s), summarized by the maintainer as:

1. very sharp, thin blades **with a transparency effect** (soft edges);
2. blades **close to each other** (denser);
3. blades **move randomly** — and the wind moves some blades **toward each
   other** (per-blade direction variation, not one global push);
4. **different heights** per blade;
5. blades **react to the character** placed on top of grass;
6. the **area around the character fades** out so the character isn't buried.

The current implementation (see "Current state") already has the right
foundation — one instanced draw of tapered cards, a rotation-bend wind with a
traveling gust front, per-blade phase/shade attributes, terrain-following
scatter with cliff/sea clipping, and zoom-out hiding. This plan UPGRADES that
material and scatter in place. It is NOT a rewrite: the
InstancedBufferGeometry pipeline, the hide/widen distance behavior, the gust
front, and all grassField clipping rules survive unchanged.

Decided mechanisms (do not re-litigate):

- **Transparency = alpha-to-coverage, not alpha blending.** Up to ~260k
  blades render in ONE mesh; per-instance sorting is impossible, so
  `transparent: true` would z-artifact against itself. The app's r3f Canvas
  uses the default renderer with antialias (MSAA) on, so
  `material.alphaToCoverage = true` gives order-independent soft alpha
  (edge feather + the character fade disc) with `transparent` staying
  `false`. On non-MSAA contexts it degrades to a hard threshold — acceptable.
- **Character reaction reuses the existing rotation-bend.** The bend is
  generalized from "angle along uWindDir" to "2-D bend vector" so wind and
  character push compose in one sin/cos rotation.
- **Per-blade wind direction** comes from rotating `uWindDir` by a per-blade
  angle offset derived from the existing `aShadePhase.y` — no new attribute
  needed.
- The character is placed at a fixed cell (at most ONE character exists —
  enforced by `withSingleCharacter` since plan 017). Its world position is a
  pure function of the spec (`worldPositionOfObject`), so GrassLayer updates
  the uniform per spec change — no per-frame tracking needed.

## Current state (verified at `74e9392`)

Gate: `pnpm check:island-editor` from the repo root — 22 files / 212 tests
green at this commit. The editor is a pnpm workspace member; run file-scoped
commands from `island-editor/`.

### `island-editor/src/scene/materials/GrassBladeMaterial.ts`

Raw `THREE.ShaderMaterial` (house convention: fragment ends with
`#include <colorspace_fragment>`; `test/materials.test.ts` asserts it).
Uniforms: `uTime`, `uWindDir` (vec2 normalized, default (0.8,0.6)),
`uWindStrength` (0.12 rad), `uGustBend` (1.25 rad), `uBaseColor` 0x2e6b2a,
`uTipColor` 0xa8d84f, `uWidenStart/End/Max` (8/20/1.5), `uHideStart/End`
(22/32). `side: DoubleSide`, `transparent: false`. Vertex shader core:

```glsl
  vec3 p = position * vec3(1.0, aYawScale.y, 1.0);

  float dist = distance(cameraPosition, aOffset);
  p.x *= 1.0 + uWidenMax * smoothstep(uWidenStart, uWidenEnd, dist);
  p *= 1.0 - smoothstep(uHideStart, uHideEnd, dist);

  float s = sin(aYawScale.x);
  float c = cos(aYawScale.x);
  vec3 world = aOffset + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);

  float sway = sin(uTime * 1.4 + aShadePhase.y + world.x * 0.9 + world.z * 0.7)
             + 0.5 * sin(uTime * 2.3 + aShadePhase.y * 1.7 + world.x * 1.6);
  float along = world.x * uWindDir.x + world.z * uWindDir.y;
  float gust = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(uTime * 0.7 - along * 0.35 + aShadePhase.y * 0.4));
  float suscept = 0.15 + 0.85 * aShadePhase.x;
  float bend = (uWindStrength * sway + uGustBend * gust * suscept) * uv.y;
  world.xz += uWindDir * sin(bend) * p.y;
  world.y -= (1.0 - cos(bend)) * p.y; // tip sinks as it bends — the near-flat look
```

Fragment: `mix(uBaseColor, uTipColor, vUv.y) * mix(0.82, 1.0, vShade)`,
alpha 1.0, then the colorspace include.

### `island-editor/src/scene/GrassLayer.tsx`

Module-level blade card (5 verts / 3 tris, `BLADE_W = 0.018`, positions
`(-w/2,0,0) (w/2,0,0) (-w/3,.55,0) (w/3,.55,0) (0,1,0)`, uv.y = height
fraction); per-mount `InstancedBufferGeometry` with `aOffset`(3) /
`aYawScale`(2) / `aShadePhase`(2) instanced attributes at
`cols*rows*BLADES_PER_CELL` capacity; a spec-keyed effect refills attributes
and `instanceCount`; `useFrame` drives `uTime` (frozen under
prefers-reduced-motion); plain `<mesh>`, `frustumCulled={false}`,
`raycast={() => null}`, no shadows; geometry+material disposed on unmount.

### `island-editor/src/terrain/grassField.ts`

Pure (NO three imports). `BLADES_PER_CELL = 48`. `grassBlades(spec, perCell)`
scatters per painted LAND cell: jitter ±0.575×cellSize, per-blade
`evaluateHeight`, sea clip (`y <= seaLevel + 0.01`), cliff clip
(`|y - yCell| > CLIFF_DROP` where `CLIFF_DROP = 0.05`), draws pulled from
`mulberry32(cellIndex + 1)` in order dx,dz,yaw,height,shade,phase (draws
happen BEFORE clip checks — stream stability), `height: 0.10 + rand()*0.14`.
Deterministic; row-major.

### Character position (for the reaction)

`island-editor/src/terrain/terrainGrid.ts:293` —
`worldPositionOfObject(spec, obj, blurred)` returns the terrain-top world
{x,y,z} of a placed object. `spec.objects` holds at most one
`kind === 'character'` entry. `PlacedObjects.tsx` shows the usage pattern
(`blurTiers(spec.grid)` memo → `worldPositionOfObject(spec, o, blurred)`).

### Renderer

`App.tsx` uses r3f `<Canvas>` with default WebGL2 + antialias (MSAA) —
alpha-to-coverage is available. Do NOT change Canvas props.

## Scope

**In scope**:

- `island-editor/src/scene/materials/GrassBladeMaterial.ts`
- `island-editor/src/scene/GrassLayer.tsx`
- `island-editor/src/terrain/grassField.ts`
- `island-editor/test/materials.test.ts` (GrassBladeMaterial block only)
- `island-editor/test/grassField.test.ts`

**Out of scope** (do NOT touch): App.tsx, Canvas/renderer props,
CharacterActor/PlacedObjects, terrain/sea shaders, spec/codec, the hide/widen
distance behavior and its defaults, `useCanopyWind`, everything else.

## Git workflow

Branch `advisor/024-botw-grass-v2` off `feat/island-editor-v2` (@ `74e9392`).
Commit: `feat(island-editor): BOTW grass v2 — soft-edged blades, per-blade
wind, character bend + fade`. Do NOT push.

## Steps

### Step 1: Sharper card + more height variety + density

1. `GrassLayer.tsx` — sharpen the silhouette: keep `BLADE_W = 0.018` but pull
   the mid vertices in and up so the blade reads as a sharp spike:
   positions `(-w/2,0,0) (w/2,0,0) (-w/4,0.6,0) (w/4,0.6,0) (0,1,0)`, uvs
   `(0,0) (1,0) (0.25,0.6) (0.75,0.6) (0.5,1)`. Add `uv.x` meaning: 0..1
   across the blade (the fragment edge-feather in Step 3 uses it).
2. `grassField.ts` — `BLADES_PER_CELL` 48 → **64** ("closer to each other");
   update the worst-case comment (~262k blades full grid). Height range
   `0.10 + rand() * 0.14` → **`0.08 + rand() * 0.20`** (more visible height
   variety, 0.08–0.28).
3. `test/grassField.test.ts` — update the height-range assertions to
   [0.08, 0.28).

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0;
`npx vitest run test/grassField.test.ts` → all pass.

### Step 2: Per-blade wind direction + character bend (one composed rotation)

In `GrassBladeMaterial.ts`'s vertex shader, replace the block from
`float sway = ...` through `world.y -= ...` with a 2-D bend-vector version:

```glsl
  // Per-blade wind direction: each blade's push rotates away from the global
  // uWindDir by up to ±uDirSpread radians (seeded by its phase), so
  // neighboring blades sway toward/away from EACH OTHER instead of moving as
  // one sheet (BOTW look — maintainer reference video).
  float dirOff = (fract(aShadePhase.y * 2.61803) - 0.5) * 2.0 * uDirSpread;
  float ds = sin(dirOff);
  float dc = cos(dirOff);
  vec2 bladeWindDir = vec2(dc * uWindDir.x - ds * uWindDir.y,
                           ds * uWindDir.x + dc * uWindDir.y);

  float sway = sin(uTime * 1.4 + aShadePhase.y + world.x * 0.9 + world.z * 0.7)
             + 0.5 * sin(uTime * 2.3 + aShadePhase.y * 1.7 + world.x * 1.6);
  float along = world.x * uWindDir.x + world.z * uWindDir.y;
  float gust = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(uTime * 0.7 - along * 0.35 + aShadePhase.y * 0.4));
  float suscept = 0.15 + 0.85 * aShadePhase.x;

  // Bend is now a 2-D VECTOR (radians): wind + character push compose, then
  // one sin/cos rotation about the base applies the total.
  vec2 bendVec = bladeWindDir * (uWindStrength * sway + uGustBend * gust * suscept);

  // Character reaction: blades inside uCharRadius bend AWAY from the
  // character, hardest at its feet. uCharPos.w is 1 when a character exists,
  // 0 otherwise (branchless off-switch).
  vec2 fromChar = world.xz - uCharPos.xz;
  float charDist = length(fromChar) + 1e-5;
  float push = uCharPos.w * uCharBend * (1.0 - smoothstep(0.0, uCharRadius, charDist));
  bendVec += (fromChar / charDist) * push;

  float bend = length(bendVec) * uv.y;
  vec2 bendDir = bendVec / max(length(bendVec), 1e-5);
  world.xz += bendDir * sin(bend) * p.y;
  world.y -= (1.0 - cos(bend)) * p.y; // tip sinks as it bends — the near-flat look

  // Character fade disc: alpha drops toward 0 near the character so it never
  // stands buried in blades (BOTW). Passed to the fragment via a varying.
  vFade = 1.0 - uCharPos.w * (1.0 - smoothstep(uCharFadeInner, uCharFadeOuter, charDist));
```

New uniforms (+ matching `GrassBladeOptions` entries and defaults):
`uDirSpread` 0.6 (rad, ≈±34°), `uCharPos` vec4 (0,0,0,0), `uCharRadius` 1.4,
`uCharBend` 0.9 (rad at the feet), `uCharFadeInner` 0.35, `uCharFadeOuter`
0.9. Add `varying float vFade;` to both shaders. Keep every existing
uniform, the widen/hide block, and the gust-front math byte-identical.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Soft-edge transparency (alpha-to-coverage)

1. Fragment shader:

```glsl
  // Sharp blade with soft alpha edges (uv.x 0..1 across the card) + the
  // character fade disc. Rendered with alphaToCoverage (MSAA), NOT alpha
  // blending — ~262k instances in one mesh cannot be depth-sorted.
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float alpha = edge * vFade;
  if (alpha < 0.02) discard;
  vec3 col = mix(uBaseColor, uTipColor, vUv.y) * mix(0.82, 1.0, vShade);
  gl_FragColor = vec4(col, alpha);
```

   (keep `#include <colorspace_fragment>` as the last line).
2. Material flags: add `alphaToCoverage: true`; `transparent` STAYS `false`,
   `side: DoubleSide` stays.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Feed the character uniform from GrassLayer

In `GrassLayer.tsx`, inside the existing spec-keyed `useEffect` (after the
attribute refill), compute and set the character uniform:

```ts
    const char = spec.objects.find((o) => o.kind === 'character')
    const u = material.uniforms.uCharPos.value as THREE.Vector4
    if (char) {
      const { x, y, z } = worldPositionOfObject(spec, char, blurTiers(spec.grid))
      u.set(x, y, z, 1)
    } else {
      u.set(0, 0, 0, 0)
    }
```

Import `blurTiers` and `worldPositionOfObject` from `../terrain/terrainGrid`.
(One `blurTiers` per edit is the same cost PlacedObjects already pays; do not
cache across specs.)

**Verify**: `npx tsc --noEmit` → exit 0;
`grep -n "worldPositionOfObject" island-editor/src/scene/GrassLayer.tsx` → hit.

### Step 5: Tests

- `test/materials.test.ts` (GrassBladeMaterial block only):
  - extend the uniform list with `uDirSpread`, `uCharPos`, `uCharRadius`,
    `uCharBend`, `uCharFadeInner`, `uCharFadeOuter` and assert the defaults
    above; assert `uCharPos.value.w === 0` (no character by default);
  - assert `mat.alphaToCoverage === true` and `mat.transparent === false`;
  - update/extend the shader-contract tests: vertex contains
    `bendDir * sin(bend) * p.y` and `uCharBend`, fragment contains
    `smoothstep(0.0, 0.18, vUv.x)` (edge feather) and still ends with the
    colorspace include. Drop assertions that no longer match (e.g. the old
    `sin(bend) * p.y` along-uWindDir line is replaced — keep whichever
    strings still exist, verify with grep before writing).
- `test/grassField.test.ts`: Step 1's range updates (already done there).

**Verify**: `cd island-editor && pnpm test` → all pass; report exact count.

### Step 6: Gate

`pnpm check:island-editor` (repo root / worktree root) → exit 0. State in the
report that the reviewer runs the in-browser pass (wind variety, character
bend + fade disc, soft edges, density, performance).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "alphaToCoverage" island-editor/src/scene/materials/GrassBladeMaterial.ts` → set true
- [ ] `grep -n "uCharPos" island-editor/src/scene/materials/GrassBladeMaterial.ts island-editor/src/scene/GrassLayer.tsx` → uniform + writer
- [ ] `grep -n "BLADES_PER_CELL = 64" island-editor/src/terrain/grassField.ts` → hit
- [ ] `git status` — only the five in-scope files
- [ ] Widen/hide block and gust-front math unchanged (diff shows no edits to
      those lines beyond context)

## STOP conditions

- You need to change Canvas/renderer props to make alpha-to-coverage work —
  report instead (it must be a material-only flag).
- You find yourself adding per-frame character tracking (useFrame reading
  scene graph) — the placed character is static; the spec-keyed effect is
  the correct source. Report if that seems insufficient.
- The composed bend visibly breaks the existing gust look in a way you can
  evidence headless (e.g. NaNs from the normalize when bendVec is zero —
  guard with the `max(…, 1e-5)` shown) — report.
- Test-count drop below 212 baseline for any reason other than intentional
  replacements listed in Step 5.

## Maintenance notes

- Look knobs after this plan: `uDirSpread` (how disorganized the meadow
  reads), `uCharRadius`/`uCharBend` (reaction size/strength),
  `uCharFadeInner/Outer` (fade disc), edge-feather constants (0.18/0.82),
  `BLADES_PER_CELL`, height range.
- If the character later MOVES continuously (a walk mode), the uniform write
  moves from the spec effect into a `useFrame` that reads the actor's
  position — the shader side is already ready for that.
- alphaToCoverage quality depends on MSAA sample count; if the app ever
  renders into a non-MSAA target (post-processing), revisit with hashed
  alpha instead.
