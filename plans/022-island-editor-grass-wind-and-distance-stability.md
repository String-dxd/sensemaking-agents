# Plan 022: Island editor — gentle grass wind + distance-stable blade rendering

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), same report format as before.
>
> **Drift check (run first)**:
> `git diff --stat 9faf64b..HEAD -- island-editor/src/scene/materials/GrassBladeMaterial.ts island-editor/test/materials.test.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P1 (direct maintainer feedback)
- **Effort**: S
- **Risk**: LOW (shader-local; no data-model or layout changes)
- **Depends on**: plan 021 (merged to `feat/island-editor-v2` @ 9faf64b)
- **Category**: direction (visual tuning)
- **Planned at**: commit `9faf64b`, 2026-07-12

## Why this matters

Two maintainer reports on the live meadow:

1. **"The wind pushes the grass almost flat to the ground."** The shader
   displaces tips by a FIXED world offset: `uWindDir * sway * uWindStrength *
   tip` with `uWindStrength = 0.045` and `sway ∈ [-1.5, 1.5]` → up to 0.0675
   world units of horizontal push. Blade heights are 0.10–0.24, so a short
   blade's tip swings ~2/3 of its own height sideways — a ~34° flatten at
   gust peaks, worst on the shortest blades. The lean must be
   HEIGHT-PROPORTIONAL (constant lean ANGLE for all blades) and gentler.
2. **"Zoomed out, the grass does not render, then lazily appears while
   zooming in; back-of-island grass lazy-renders too."** Not culling
   (`frustumCulled={false}` is already set and there is no LOD/async path —
   nothing "lazy" exists in the code). It's sub-pixel rasterization: blade
   cards are 0.018 world units wide (plan 021); beyond a moderate camera
   distance that projects below one pixel and the rasterizer produces no
   fragments, so distant blades vanish and "pop" back as they cross the
   one-pixel threshold. Fix: a distance-based WIDTH floor in the vertex
   shader — blades widen smoothly with view distance so they always cover
   ≥ ~a pixel. (BOTW does the same trick; near-camera look is unchanged.)

## Current state (at `9faf64b`)

`island-editor/src/scene/materials/GrassBladeMaterial.ts` vertex shader core:

```glsl
  float s = sin(aYawScale.x);
  float c = cos(aYawScale.x);
  vec3 p = position * vec3(1.0, aYawScale.y, 1.0);
  vec3 world = aOffset + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);

  float sway = sin(uTime * 1.4 + aShadePhase.y + world.x * 0.9 + world.z * 0.7)
             + 0.5 * sin(uTime * 2.3 + aShadePhase.y * 1.7 + world.x * 1.6);
  float tip = uv.y * uv.y;
  world.xz += uWindDir * sway * uWindStrength * tip;
```

Uniforms: `uTime`, `uWindDir` (normalized, default (0.8, 0.6)),
`uWindStrength` (default 0.045), `uBaseColor` 0x2e6b2a, `uTipColor` 0xa8d84f.
`test/materials.test.ts` asserts the uniform set, `uWindStrength ≈ 0.045`,
palette hexes, DoubleSide/opaque, `colorspace_fragment`, and that the vertex
shader names the three instanced attributes. `cameraPosition` is available in
every three.js ShaderMaterial vertex shader (built-in uniform) — no wiring
needed. Gate: `pnpm check:island-editor`, green at 198 tests on `9faf64b`.

## Scope

**In scope**: `island-editor/src/scene/materials/GrassBladeMaterial.ts`,
`island-editor/test/materials.test.ts` (GrassBladeMaterial block only).
**Out of scope**: GrassLayer.tsx, grassField.ts, all other materials/tests,
`SeaMaterial` TinySkies assertions, anything else.

## Git workflow

Branch `advisor/022-grass-wind-distance` off `feat/island-editor-v2`
(@ `9faf64b`). Commit: `fix(island-editor): gentle height-proportional grass
wind + distance-stable blade width`. Do NOT push.

## Steps

### Step 1: Height-proportional, gentler wind

In the vertex shader, change the displacement line to scale by blade height,
and retune the default strength to a dimensionless lean ratio:

```glsl
  world.xz += uWindDir * sway * uWindStrength * tip * aYawScale.y;
```

- `uWindStrength` default `0.045` → **`0.12`**. Semantics change from "world
  units of tip push" to "tip push as a fraction of blade height per unit
  sway" — max lean ratio = 0.12 × 1.5 = 0.18 (~10°), typical ±5°. Update the
  uniform's doc/comment accordingly (it is the sway-amplitude knob).

### Step 2: Distance width floor

After computing `p` (before yaw rotation is fine — widen the card's local x):

```glsl
  // Sub-pixel guard: widen the card with view distance so a blade never
  // projects below ~a pixel and pops out of existence when zoomed out
  // (maintainer report: grass "lazy renders" with zoom / at the island's
  // far side). Near-camera width is unchanged.
  float dist = distance(cameraPosition, aOffset);
  p.x *= 1.0 + uWidenMax * smoothstep(uWidenStart, uWidenEnd, dist);
```

New uniforms with defaults: `uWidenStart = 8.0`, `uWidenEnd = 30.0`,
`uWidenMax = 2.5` (i.e. up to 3.5× width at far zoom, ramping in smoothly —
these are look knobs the reviewer will screenshot-tune). Add them to
`createGrassBladeMaterial`'s options (`widenStart?`, `widenEnd?`,
`widenMax?`) mirroring the existing option pattern.

**Verify (both steps)**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 3: Tests

`test/materials.test.ts` GrassBladeMaterial block only:

- Extend the uniform-set assertion with `uWidenStart`/`uWidenEnd`/`uWidenMax`
  and their defaults (8, 30, 2.5); update `uWindStrength` default to 0.12.
- Add an assertion that the vertex shader contains `cameraPosition` and
  `aYawScale.y` in the wind line's vicinity is NOT required — instead assert
  the shader string contains `* tip * aYawScale.y` (the height-proportional
  contract) and `smoothstep(uWidenStart, uWidenEnd,` (the width floor).

**Verify**: `cd island-editor && pnpm test` → all pass.

### Step 4: Gate

`pnpm check:island-editor` (repo root) → exit 0. Report exact test count.

## Done criteria

- [ ] `grep -n "tip \* aYawScale.y" island-editor/src/scene/materials/GrassBladeMaterial.ts` → hit
- [ ] `grep -n "uWidenStart" island-editor/src/scene/materials/GrassBladeMaterial.ts` → uniform + use
- [ ] `pnpm check:island-editor` exits 0
- [ ] `git status` — only the two in-scope files

## STOP conditions

- `cameraPosition` turns out NOT to be available in the vertex shader
  (compile error at runtime is not verifiable headless — but if the three
  docs/types you can check suggest it needs manual wiring for raw
  ShaderMaterial, report rather than adding uniforms beyond the plan).
  (Reviewer note: it IS a built-in for ShaderMaterial; RawShaderMaterial is
  the one that lacks it. This material is ShaderMaterial.)
- You find yourself editing GrassLayer or grassField — out of scope.

## Maintenance notes

- Knobs: `uWindStrength` (lean), `uWidenStart/End/Max` (distance floor).
  The widen trick changes silhouette width only — density still thins
  visually with distance (real coverage), which is the wanted look.
- If far grass still shimmers, the next lever is a distance ALPHA fade —
  needs `transparent: true` + sorting cost; deliberately not done here.
