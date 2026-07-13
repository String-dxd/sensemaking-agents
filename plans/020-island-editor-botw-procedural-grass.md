# Plan 020: Island editor — BOTW-style procedural grass blades (drop the GLB, add wind)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> any STOP condition occurs, stop immediately and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Ordering**: this plan stacks on plan 019 (toon object lighting). Execute
> AFTER 019 — both modify `GrassLayer.tsx`, the asset pipeline, and
> `objectGlbs.test.ts`. Base branch: `advisor/019-toon-object-lighting`
> (or `feat/island-editor-v2` if 019 has already been merged — verify with
> `grep -n "applyToonMaterials" island-editor/src/models/useObjectModel.ts`;
> a hit means 019 is in your base).

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED (new procedural render path + custom shader)
- **Depends on**: plan 019 (executes first; supersedes 019's grass-specific
  bits — the GrassLayer toon conversion and the grass GLB rebuild become dead
  weight this plan removes)
- **Category**: direction (visual style / feature)
- **Planned at**: 2026-07-12, against `696a321` + plan 019's branch

## Why this matters

Painted grass currently renders as ONE GLB tuft per painted cell — a visible
64×64 grid of identical clumps that reads as crop rows (the maintainer's
screenshot shows exactly this). The maintainer wants Breath-of-the-Wild
meadow grass instead:

1. **Dense, organic blades** — thin tapered polys, not authored tuft models.
   The `grass.glb` asset is DROPPED from the runtime and pipeline; blade
   geometry is generated procedurally (a handful of vertices per blade).
2. **"Closer" placement / continuous drawing feel** — solved by SCATTER, not
   by a data-model change: each painted cell spawns ~24 jittered blades whose
   positions spill slightly across cell borders, so adjacent painted cells
   interlock into a continuous meadow with organic edges. The paint data
   model stays cell-resolution `SURFACE_GRASS` (spec stays at v5 — no
   migration, no codec change; a finer sub-cell mask was considered and
   rejected as heavy spec churn for a win the scatter already delivers).
   The existing drag-to-paint interaction (brush sizes, stroke undo,
   ground under-tint) is untouched.
3. **Wind** — blades sway in the vertex shader (per-blade phase, tip-weighted
   bend, traveling gust), cheap enough for a hundred thousand blades. The
   tree canopy spring (`useCanopyWind`) stays as-is; grass wind is
   shader-side because per-instance JS springs don't scale to blade counts.

## Current state

(Excerpts from `696a321`; plan 019 modifies some of these — its changes are
noted inline. Gate: `pnpm check:island-editor` from repo root.)

### The renderer being replaced — `island-editor/src/scene/GrassLayer.tsx`

One `InstancedMesh` using geometry/material extracted from
`useGLTF('/models/grass.glb')` (with a meshopt-dequant matrix fold), one
instance per grass-painted land cell, matrices from
`grassInstanceTransforms(spec)`, `raycast={() => null}`,
`frustumCulled={false}`, mounted in `App.tsx`'s `<Suspense>` as
`<GrassLayer key={…grid dims…} spec={spec} />`. After 019 it also calls
`applyToonMaterials(gltf.scene)`. **The whole file is rewritten by this
plan** — the mount point, `key`, `raycast`/culling choices, and the
pure-helper pattern survive; the GLB does not.

### The pure helper — `island-editor/src/terrain/grassField.ts`

```ts
export function grassInstanceTransforms(spec: IslandSpec): GrassInstanceTransform[] {
  const { grid, worldSize, tierHeights, seaLevel } = spec
  const blurred = blurTiers(grid)
  const out: GrassInstanceTransform[] = []
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const i = cellIndex(grid, c, r)
      if (grid.surface[i] !== SURFACE_GRASS) continue
      if (!isLandTier(grid.tiers[i], tierHeights, seaLevel)) continue
      const { x, z } = cellCenter(worldSize, grid, c, r)
      const y = evaluateHeight(spec, x, z, blurred)
      const rand = mulberry32(i + 1)
      const yaw = rand() * Math.PI * 2
      const scale = 0.95 + rand() * 0.4
      out.push({ x, y, z, yaw, scale })
    }
  }
  return out
}
```

NO three imports (terrain-core rule). `test/grassField.test.ts` covers:
land-cells-only, determinism, y = evaluateHeight, scale range. This module
is EXTENDED (per-blade emission), not discarded.

### The GLB being retired

- Pipeline entry `grass` in `island-editor/scripts/optimize-meshy-glb.mjs`'s
  `ASSETS` (keep-the-atlas lane, `meshNode: 'tuft'`).
- `island-editor/public/models/grass.glb` (checked in).
- `island-editor/test/objectGlbs.test.ts`: `KINDS = ['tree', 'rock', 'grass']`
  with grass budgets (250 KB / 5,000 tris / height 0.16), a grass
  atlas test, a grass no-canopy test, and (after 019) grass rows in the
  normals-contract test.
- `island-editor/assets/meshy/README.md` grass row.
- `~/Downloads/glb-models/grass.glb` (raw source — user's file, do NOT
  delete; it just stops being consumed).

### House shader conventions (follow these)

Custom GLSL materials live in `island-editor/src/scene/materials/` (see
`SeaMaterial.ts`, `IslandGroundMaterial.ts`): raw `THREE.ShaderMaterial`,
fragment ends with `#include <colorspace_fragment>` (r171 gives raw shader
materials no automatic output conversion — `test/materials.test.ts` asserts
this include for the existing two; add the same for the new one). Time
uniforms are driven from `useFrame` (see `SeaSurface.tsx`:
`material.uniforms.uTime.value = state.clock.elapsedTime * 0.45`).
`prefers-reduced-motion` freezes motion (see `useCanopyWind.ts`) — the grass
must respect it too. The scene's BOTW palette constants for coherence:
ground `uGrassColor` default `0x4a8f3f`, sun `0xffedcc`, sky `0x8fa8c8`
(IslandGroundMaterial defaults).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` (repo root) | exit 0 |
| Tests | `cd island-editor && pnpm test` | all pass |
| Typecheck | `cd island-editor && npx tsc --noEmit` | exit 0 |
| Gate | `pnpm check:island-editor` (repo root) | exit 0 |

## Scope

**In scope**:

- `island-editor/src/terrain/grassField.ts` (extend: per-blade transforms)
- `island-editor/src/scene/GrassLayer.tsx` (rewrite: procedural instanced blades)
- `island-editor/src/scene/materials/GrassBladeMaterial.ts` (create)
- `island-editor/scripts/optimize-meshy-glb.mjs` (remove the `grass` entry)
- `island-editor/public/models/grass.glb` (DELETE — `git rm`)
- `island-editor/assets/meshy/README.md` (drop grass row; one-line note that
  grass went procedural in plan 020)
- `island-editor/test/grassField.test.ts` (extend), `test/materials.test.ts`
  (add GrassBladeMaterial block), `test/objectGlbs.test.ts` (remove grass)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- The paint data model and interaction: `SURFACE_GRASS`, spec v5, specIO,
  gridCodec, App.tsx's stroke machinery, the ground shader's grass
  under-tint, ToolPanel/icons.
- `useCanopyWind.ts` / `wind.ts` (tree wind) — grass wind is its own shader.
- tree/rock/character pipeline entries, budgets, and 019's toon work on
  placed objects (`toonMaterial.ts`, `useObjectModel.ts`).
- `~/Downloads/glb-models/*` — never delete the user's raw files.

## Git workflow

- Branch: `advisor/020-botw-grass` off plan 019's branch (see Ordering note).
- Commit: `feat(island-editor): procedural BOTW grass blades with shader wind`
- Do NOT push or open a PR.

## Steps

### Step 1: Per-blade transforms in the pure core

In `src/terrain/grassField.ts`, add (keeping `grassInstanceTransforms`
untouched until Step 2 removes its only consumer — then DELETE it and its
interface, migrating its tests):

```ts
export interface GrassBlade {
  x: number
  y: number
  z: number
  /** Radians, Y rotation of the blade card. */
  yaw: number
  /** World height of this blade (already jittered). */
  height: number
  /** 0..1 per-blade shade jitter (fragment darkening variety). */
  shade: number
  /** 0..2π wind phase offset. */
  phase: number
}

export const BLADES_PER_CELL = 24 // density knob; ~131k blades worst-case full grid

export function grassBlades(spec: IslandSpec, perCell = BLADES_PER_CELL): GrassBlade[]
```

Per painted LAND cell (same surface/land gate as today), seed
`mulberry32(cellIndex + 1)` and emit `perCell` blades:

- position: cell center + jitter of ±0.575 × cellSize on X and Z (15%
  overflow past the cell edge so neighboring painted cells interlock);
- y: `evaluateHeight` at the BLADE's own x/z (blades follow slopes), using
  one precomputed `blurTiers`; SKIP the blade if `y <= seaLevel + 0.01`
  (edge blades must not stand in water);
- yaw: `rand() * 2π`; height: `0.10 + rand() * 0.14` world units (tuning
  knob — beach-tier freeboard is 0.05, trees 1.7; grass reads right around
  0.1–0.25); shade: `rand()`; phase: `rand() * 2π`.

Deterministic: same spec → identical array (same guarantee the current
helper's tests assert).

**Verify**: `npx tsc --noEmit` → exit 0 (GrassLayer still compiles against
the old helper until Step 3).

### Step 2: The blade material

Create `src/scene/materials/GrassBladeMaterial.ts` following the house
raw-ShaderMaterial conventions ("Current state"). Design:

- **Geometry contract** (built in Step 3): a single tapered blade card,
  5 vertices / 3 triangles, base at y=0, unit height, `uv.y` 0 at base → 1
  at tip. Per-instance attributes: `aOffset` (vec3 world position),
  `aYawScale` (vec2: yaw, height), `aShadePhase` (vec2: shade, phase).
- **Vertex shader**: rotate the card by yaw, scale by height, translate to
  offset; wind displacement added to the WORLD position:

```glsl
  float sway = sin(uTime * 1.4 + aShadePhase.y + world.x * 0.9 + world.z * 0.7)
             + 0.5 * sin(uTime * 2.3 + aShadePhase.y * 1.7 + world.x * 1.6);
  float tip = uv.y * uv.y;          // only the top bends — base stays planted
  world.xz += uWindDir * sway * uWindStrength * tip;
```

  Uniforms: `uTime`, `uWindDir` (vec2, normalized, default (0.8, 0.6) —
  matches the scene's general gust direction), `uWindStrength`
  (default 0.045).
- **Fragment shader**: BOTW gradient `mix(uBaseColor, uTipColor, uv.y)`
  darkened by the per-blade shade jitter
  (`* mix(0.82, 1.0, aShadePhase.x)` via a varying), then
  `#include <colorspace_fragment>`. Defaults: `uBaseColor` `0x2e6b2a`
  (deeper than the ground's `0x4a8f3f` so blades read against the painted
  under-tint), `uTipColor` `0xa8d84f` (the sunny yellow-green tips in the
  reference). No lights/shadow chunks — the gradient + ground under-tint +
  jitter carry the look (keeps the shader trivial at 131k blades; noted as a
  future knob).
- `side: THREE.DoubleSide`, `transparent: false`.

Export `createGrassBladeMaterial(opts?: { windDir?, windStrength?, baseColor?, tipColor? })`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Rewrite `GrassLayer.tsx`

Replace the GLB path entirely:

1. Build the blade card geometry once (module-level or memoized):
   `THREE.BufferGeometry` with 5 positions
   `[(-w/2,0,0), (w/2,0,0), (-w/3,0.55,0), (w/3,0.55,0), (0,1,0)]`
   (w ≈ 0.045 world), uvs with `uv.y` = height fraction, indices for 3
   triangles. Wrap in `THREE.InstancedBufferGeometry` per mount, with
   `aOffset`/`aYawScale`/`aShadePhase` `InstancedBufferAttribute`s sized to
   `grid.cols * grid.rows * BLADES_PER_CELL` capacity,
   `instanceCount` set per edit.
2. On each `spec` change (same `useEffect` shape as today): call
   `grassBlades(spec)`, fill the three instanced attributes, set
   `geometry.instanceCount = blades.length`, mark attributes
   `needsUpdate`.
3. `useFrame`: `material.uniforms.uTime.value = state.clock.elapsedTime`
   — UNLESS `prefers-reduced-motion` (copy the `matchMedia` memo pattern
   from `useCanopyWind.ts`), in which case leave uTime at 0.
4. Mesh: a plain `<mesh>` (not `instancedMesh` — instancing lives in the
   geometry), `frustumCulled={false}`, `raycast={() => null}`,
   `castShadow={false}` `receiveShadow={false}` (per-blade shadows are
   noise at this scale; the ground under-tint plays the grounding role).
5. Dispose geometry + material on unmount. Remove the `useGLTF` import and
   `useGLTF.preload('/models/grass.glb')`. Keep the component name, props
   (`{ spec }`), and the App.tsx mount unchanged (the `key` on grid dims
   still matches the capacity allocation — keep it).
6. DELETE `grassInstanceTransforms` + its interface from `grassField.ts`
   (GrassLayer was its only consumer) and migrate its tests (Step 5).

**Verify**: `npx tsc --noEmit` → exit 0;
`grep -rn "grass.glb\|grassInstanceTransforms" island-editor/src` → no hits.

### Step 4: Retire the GLB from pipeline + contracts

1. `scripts/optimize-meshy-glb.mjs`: delete the `grass` ASSETS entry (leave
   a one-line comment: grass went procedural in plan 020 — see
   GrassLayer/GrassBladeMaterial).
2. `git rm island-editor/public/models/grass.glb`.
3. `test/objectGlbs.test.ts`: `KINDS` back to `['tree', 'rock']`; remove
   grass from the budget/height tables, the grass atlas test, the grass
   no-canopy test, and any grass rows 019 added to the normals contract.
4. `assets/meshy/README.md`: drop the grass row; note the retirement.

**Verify**: `cd island-editor && npx vitest run test/objectGlbs.test.ts` →
all pass; `ls island-editor/public/models/` → `character.glb rock.glb tree.glb`.

### Step 5: Tests

- `test/grassField.test.ts` — replace the old helper's cases with
  `grassBlades` equivalents (same file, same style):
  1. all-auto grid → `[]`;
  2. one painted land cell → exactly `BLADES_PER_CELL` blades (when none are
     water-clipped: use an interior tier-2 cell), each within ±0.575-cell of
     the cell center on X/Z;
  3. painted WATER cell → 0 blades;
  4. determinism (two calls `toEqual`);
  5. every blade's y equals `evaluateHeight` at that blade's x/z (spot-check
     a few) and `y > spec.seaLevel`;
  6. height within [0.10, 0.24]; shade and phase within their ranges.
- `test/materials.test.ts` — add a `describe('GrassBladeMaterial')`
  mirroring the existing blocks: expected uniforms
  (`uTime`, `uWindDir`, `uWindStrength`, `uBaseColor`, `uTipColor`),
  fragment ends with `#include <colorspace_fragment>`, default colors'
  hex strings, `side` is `THREE.DoubleSide`. Do NOT touch the
  TinySkies-provenance assertions on SeaMaterial.

**Verify**: `cd island-editor && pnpm test` → all pass.

### Step 6: Gate + visual check

1. `pnpm check:island-editor` (repo root) → exit 0.
2. `pnpm dev:editor` → http://localhost:5180 (reviewer does this if you are
   headless): painting grass now lays down dense organic blades that
   interlock across cells (no visible grid rows); blades sway continuously
   (tips move, bases planted); blades follow terrain height on slopes and
   never stand in water at shore edges; undo/erase still clears them;
   performance stays interactive with a large painted meadow (drag a big
   brush across half the island).

## Test plan

Step 5 in full: ~7 rewritten/new grassField cases + a 4-assertion material
block. Removed: 3 grass rows/tests in objectGlbs. Expect the suite to land
around 019's count ± a few; report exact numbers.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -rn "grass.glb" island-editor/src island-editor/scripts` → no
      code hits (comments about the retirement allowed)
- [ ] `island-editor/public/models/grass.glb` deleted from git
- [ ] `grep -n "grassBlades" island-editor/src/terrain/grassField.ts island-editor/src/scene/GrassLayer.tsx` → defined + consumed
- [ ] `grep -n "uWindDir" island-editor/src/scene/materials/GrassBladeMaterial.ts` → present
- [ ] `grep -n "colorspace_fragment" island-editor/src/scene/materials/GrassBladeMaterial.ts` → present
- [ ] `git status` — no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 019 is not in your base (no `applyToonMaterials` in useObjectModel)
  AND it isn't merged — ordering violation; report.
- `InstancedBufferGeometry` + custom attributes fails to render with evidence
  (blank/garbage) after verifying attribute names match between geometry and
  shader — report; do NOT fall back to per-blade meshes or the GLB.
- Painting a full-island meadow makes edits visibly hitch (> ~100 ms per
  stroke sample) — report with numbers rather than silently lowering
  `BLADES_PER_CELL`.
- You find yourself touching the spec/codec/App stroke code to get "closer"
  placement — the scatter design deliberately avoids that; report instead.

## Maintenance notes

- **Look knobs**: `BLADES_PER_CELL` (density), blade height range and card
  width (grassField/GrassLayer), `uBaseColor`/`uTipColor`/`uWindStrength`
  (material). Tune these before touching anything structural.
- **Lighting**: blades are gradient-colored, not lit — if the meadow reads
  flat against toon-lit objects later, options are a cheap fixed sun term or
  sampling the terrain's toon ramp; that's a follow-up, not a tweak.
- **Interaction wind** (character/brush bending nearby blades, BOTW-style)
  would add a "bend field" uniform/texture — the per-blade phase attribute
  and tip-weighted bend already give it a natural insertion point.
- **Reviewer focus**: attribute buffer capacity vs `instanceCount` (the
  full-grid worst case must not overflow); determinism of `grassBlades`;
  that erase/undo repaints correctly (attributes refill per spec tick); the
  water-clip rule at shore cells.
