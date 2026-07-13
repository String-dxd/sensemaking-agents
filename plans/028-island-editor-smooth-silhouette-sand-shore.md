# Plan 028: Island editor — smooth terrain silhouette + sand-only shoreline

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), report in the STATUS/STEPS/FILES CHANGED/NOTES format.
>
> **Drift check (run first)** — `<BASE>` = the commit named in your dispatch:
> `git diff --stat <BASE>..HEAD -- island-editor/src/terrain/terrainGrid.ts island-editor/src/scene/materials/IslandGroundMaterial.ts island-editor/src/scene/IslandTerrain.tsx island-editor/test/terrainGrid.test.ts island-editor/test/materials.test.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P1 (maintainer feedback with screenshots)
- **Effort**: M
- **Risk**: MED-HIGH (touches the tier-field sampler EVERY terrain consumer
  shares — mesh, heights, shore field, grass, character; changes must keep
  the documented invariants)
- **Depends on**: plans 026 + 027 merged first (no file overlap in src, but
  test/materials.test.ts is edited by 027 too — sequential avoids conflicts)
- **Category**: direction (visual quality)
- **Planned at**: 2026-07-12 (tip at planning time `9dd8921`; your BASE
  includes 026/027)

## Why this matters

Two maintainer reports (with screenshots):

1. **The island reads "blocky"/"pixel-like"** — the shoreline and every
   terrace edge is a sawtooth of diamond-shaped teeth that trace the grid
   cells.
2. **The shoreline shows a brown cliff rim** where the sand meets the water —
   the maintainer wants sand running into the sea, no brown lip.

### Root causes (verified in code — fix these, not symptoms)

1. The continuous tier field (`sampleTierField`, `terrainGrid.ts`) uses
   plain **bilinear** interpolation. Bilinear iso-contours are piecewise
   linear with direction kinks at every lattice point — on a near-binary
   land/water grid that yields exactly the diamond sawtooth in the
   screenshots. The MESH is not the problem (256 segments ≈ 4 per cell —
   see `buildIslandGeometry.ts`'s SEGMENTS comment); the FIELD is.
   Fix: **smoothstep the bilinear fractions** (a "smooth bilinear" — C1
   continuous, contours become rounded). Critically, at integer lattice
   coordinates the fractions are 0, so **cell-center values are exact and
   unchanged** — this preserves the module's documented thin-feature
   invariant (see the BLUR_MIX comment: an isolated tier-2 cell must keep
   ~95 % of its height; with smooth fractions it keeps exactly as much as
   today).
2. `IslandGroundMaterial`'s wall mask paints the cliff texture on ANY steep
   face: `wallF = max(smoothstep(.25,.45,vWallness), smoothstep(.35,.6,slope))`.
   The beach tier's small drop to the sea (tier 1 top at 0.05 → ocean floor)
   is steep, so its rim classifies as cliff → the brown lip. Fix: **gate the
   cliff by height** — faces at or below the beach top render the flat
   (sand) color; cliff texture only starts above it.

## Current state (verified at `9dd8921`)

Gate: `pnpm check:island-editor` from the worktree root (record your own
baseline count — it includes 026/027's additions).

### `src/terrain/terrainGrid.ts` — the sampler (lines ~172–215)

```ts
/** Bilinear sample of a row-major field in cell-center space (integer u/v = a
 *  cell center). u/v are expected pre-clamped to [0, cols-1] / [0, rows-1]. */
function bilinear(field: ArrayLike<number>, cols: number, u: number, v: number): number {
  const c0 = Math.floor(u)
  const r0 = Math.floor(v)
  …
  const a = h00 + (h10 - h00) * fu
  const b = h01 + (h11 - h01) * fu
  return a + (b - a) * fv
}
```

`sampleTierField` calls `bilinear` twice (raw + blurred) and mixes by
`BLUR_MIX = 0.25`; its doc comment forbids simplifying to blur-only (thin
features). Consumers of `sampleTierField`/`evaluateHeight`: the terrain mesh
(`buildIslandGeometry.ts`), `shoreDistanceField`, grass scatter, object
placement heights, the character behavior env — ALL inherit this change
automatically and stay mutually consistent. That's the point: change the
SAMPLER, not any consumer.

### `src/scene/materials/IslandGroundMaterial.ts` — the wall mask (~line 144)

```glsl
  vec2 cliffUv = vec2(vWorld.x + vWorld.z, vWorld.y * 2.4);
  vec3 cliff = texture2D(uCliffTexture, cliffUv).rgb;
  …
  float slope = 1.0 - clamp(normalize(vNormal).y, 0.0, 1.0);
  float wallF = max(smoothstep(0.25, 0.45, vWallness), smoothstep(0.35, 0.6, slope));
  vec3 albedo = mix(flatColor, cliff, wallF);
```

Uniforms include `uSeaLevel`; there is NO beach-top uniform yet.
`test/materials.test.ts`'s IslandGroundMaterial block asserts the uniform
list + defaults. The material is constructed in `IslandTerrain.tsx:75`:
`createIslandGroundMaterial(textures, { seaLevel: spec.seaLevel })`.
`DEFAULT_TIER_HEIGHTS = [-1.2, 0.05, 1.0, 1.65, 2.3]` — the beach top is
`tierHeights[1]` (0.05).

### Tests that pin terrain values

`test/buildIslandGeometry.test.ts` asserts heights at CELL CENTERS
(`toBeCloseTo(DEFAULT_TIER_HEIGHTS[i])`) and the ocean-floor min — all
preserved by construction (fractions are 0 at cell centers).
`test/terrainGrid.test.ts` covers sampleTierField/terraceHeight — read it
before editing; if any case asserts a MID-CELL interpolated value, update
the expectation with a comment (the smooth fraction changes mid-cell values
by design) — but do NOT weaken cell-center or amplitude assertions.

## Scope

**In scope**:

- `island-editor/src/terrain/terrainGrid.ts` (smooth the bilinear fractions)
- `island-editor/src/scene/materials/IslandGroundMaterial.ts` (uBeachTop gate)
- `island-editor/src/scene/IslandTerrain.tsx` (pass `beachTop:
  spec.tierHeights[1]` into the material options)
- `island-editor/test/terrainGrid.test.ts` (mid-cell expectation updates ONLY
  if needed)
- `island-editor/test/materials.test.ts` (IslandGroundMaterial block only)

**Out of scope**: buildIslandGeometry.ts (SEGMENTS stays 256), blurTiers /
BLUR_MIX (unchanged), SeaMaterial/GrassBladeMaterial, shoreField.ts,
characterBehavior, spec/codec. If smoothing alone doesn't satisfy the look,
report — do not start raising resolutions or blur radii.

## Git workflow

Branch `advisor/028-smooth-silhouette` off the tip named in your dispatch.
Commit: `feat(island-editor): smooth terrain silhouette + sand-only shoreline`.
Do NOT push.

## Steps

### Step 1: Smooth bilinear

In `terrainGrid.ts`'s `bilinear`, smoothstep the FRACTIONS before the lerps
(keep everything else identical):

```ts
  let fu = u - c0
  let fv = v - r0
  // C1 "smooth bilinear" (plan 028): smoothstepped fractions round the
  // field's iso-contours — plain bilinear contours are piecewise-linear with
  // kinks at every lattice point, which rendered the island silhouette as a
  // diamond sawtooth. At integer u/v the fractions are 0/1, so CELL-CENTER
  // VALUES ARE EXACT AND UNCHANGED — the thin-feature amplitude invariant
  // documented on sampleTierField (BLUR_MIX comment) is preserved.
  fu = fu * fu * (3 - 2 * fu)
  fv = fv * fv * (3 - 2 * fv)
```

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0; then
`npx vitest run test/terrainGrid.test.ts test/buildIslandGeometry.test.ts test/grassField.test.ts test/shoreField.test.ts test/characterBehavior.test.ts`
— cell-center/amplitude cases must pass untouched; if a mid-cell
interpolation expectation fails, update THAT expectation with a plan-028
comment and list every such change in your report.

### Step 2: Sand-only shoreline

1. `IslandGroundMaterial.ts`: options gain `beachTop?: number`; new uniform
   `uBeachTop` (default `0.05`). In the fragment, gate the wall mask:

```glsl
  // Sand-only shoreline (plan 028): the beach tier's little drop to the sea
  // is geometrically steep, so it classified as cliff — a brown lip along
  // every shore. Cliff texture only begins ABOVE the beach top; at and below
  // it, steep faces keep the flat (sand) color, and the existing wet-sand
  // darkening handles the waterline.
  wallF *= smoothstep(uBeachTop + 0.02, uBeachTop + 0.30, vWorld.y);
```

   placed immediately after the existing `wallF` line, before `albedo`.
2. `IslandTerrain.tsx:75`: pass `beachTop: spec.tierHeights[1]` in the
   options object (material memo already keys on what it needs — match the
   existing seaLevel pattern; if the memo's dep array needs
   `spec.tierHeights`, add it).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Tests

`test/materials.test.ts`, IslandGroundMaterial block ONLY: add `uBeachTop`
to the uniform list, assert its default (0.05), and add a case asserting the
fragment contains `smoothstep(uBeachTop + 0.02, uBeachTop + 0.30,` (the
gate contract).

**Verify**: `cd island-editor && pnpm test` → all pass; report exact count.

### Step 4: Gate

`pnpm check:island-editor` (worktree root) → exit 0. Reviewer does the
browser pass: shoreline and terrace edges read as smooth curves (no diamond
teeth); shore rim is sand with no brown lip; upper-tier cliffs are still
brown; grass/objects/character still sit on the ground correctly.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "3 - 2 \* fu" island-editor/src/terrain/terrainGrid.ts` → hit
- [ ] `grep -n "uBeachTop" island-editor/src/scene/materials/IslandGroundMaterial.ts island-editor/src/scene/IslandTerrain.tsx` → both hit
- [ ] Cell-center height assertions in buildIslandGeometry.test.ts unchanged
- [ ] `git status` — only the five in-scope files

## STOP conditions

- Any test failure that is NOT a mid-cell interpolation expectation (e.g. a
  cell-center or amplitude case) — the invariant broke; report, don't patch
  the test.
- You find yourself changing SEGMENTS, BLUR_MIX, blurTiers, or shoreField —
  out of scope by design.
- The smoothstep visibly widens terrace WALLS in a way you can measure
  (wall width is set by terraceBlend, not the sampler — if a geometry test
  about wall width fails, report).

## Maintenance notes

- The smooth fractions apply to BOTH the raw and blurred field samples (they
  share `bilinear`) — that is intended; everything downstream stays
  consistent because there is exactly one sampler.
- `uBeachTop` follows `spec.tierHeights[1]` — if tier heights become
  editable later, the wiring already tracks the spec.
- Reviewer focus: before/after screenshots of the same shoreline; the
  0.02/0.30 gate band (should hide the lip without unbrowning real cliffs);
  paint-responsiveness unchanged (the sampler is in the per-edit hot path —
  two smoothsteps per sample are negligible, but verify no perceptible
  regression).
