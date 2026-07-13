# Plan 029: Island editor — FPS/resource HUD + edit-path performance (no visual changes)

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), report in the STATUS/STEPS/FILES CHANGED/NOTES format.
>
> **Drift check (run first)** — `<BASE>` = the commit named in your dispatch
> (the feat/island-editor-v2 tip WITH plans 027 + 028 merged):
> `git diff --stat <BASE>..HEAD -- island-editor/src/terrain/grassField.ts island-editor/src/scene/GrassLayer.tsx island-editor/src/scene/SeaSurface.tsx island-editor/src/scene/CharacterActor.tsx island-editor/src/scene/IslandTerrain.tsx island-editor/src/scene/PlacedObjects.tsx`
> Must be empty; on a mismatch, STOP. Line numbers in this plan were taken a
> few commits earlier — treat them as anchors, not gospel; the quoted code is
> what to match.

## Status

- **Priority**: P1 (maintainer request: "show fps and improve memory/resource
  usage without sacrificing quality")
- **Effort**: M
- **Risk**: MED (touches the per-edit hot path; behavior must be
  bit-identical — determinism tests guard it)
- **Depends on**: plans 027 + 028 merged (file overlap: CharacterActor,
  SeaSurface, terrain sampling)
- **Category**: performance + DX
- **Planned at**: 2026-07-12 (audit at `2fcc200`)

## Why this matters

The editor recomputes several expensive derived fields on EVERY spec tick —
and a paint drag emits a tick per pointer sample (tens per second). Audit
findings (verified in code):

1. **No performance visibility.** Nothing shows FPS, draw calls, or memory —
   the maintainer flies blind while judging changes like the 262k-blade
   meadow.
2. **`shoreDistanceField` runs TWICE per edit.** `SeaSurface.tsx` refreshes
   the foam texture from it per spec change, and `CharacterActor.tsx`
   independently memoizes the identical field for the swim leash
   (`useMemo(() => shoreDistanceField(spec.grid, spec.worldSize), [spec])`).
   Each run samples the terrain at a 128×128 lattice then BFS-floods it.
   (The BFS itself is already optimal — head-indexed queue, audited and
   cleared.)
3. **`grassBlades` allocates ~262k objects per edit.** The scatter builds a
   `GrassBlade` object per blade and pushes it into a growing array; the
   caller (GrassLayer) then copies each field into typed arrays and throws
   the objects away — pure allocation/GC churn on the hottest path.
4. **`blurTiers` recomputed 5–7× per edit** (IslandTerrain, PlacedObjects,
   GrassLayer's character write, grassBlades, shoreField's internal call,
   plus per-frame env fallbacks) — individually cheap (3×3 kernel over 64²)
   but pointless duplication.

Constraints (the maintainer's words): NO quality sacrifice — no resolution,
density, texture, or algorithmic-fidelity reductions. Everything below is
visibility + deduplication + allocation elimination; rendered output must be
pixel-identical.

## Current state (audited at `2fcc200`; verify against your BASE)

Gate: `pnpm check:island-editor` from the worktree root (record baseline).

### The per-spec identity model (why WeakMap memoization is safe)

`App.tsx` holds the spec in a ref whose GRID ARRAYS ARE MUTATED IN PLACE by
paint ops; a `gridTick` state bump then produces a FRESH spec object
identity per edit: `const spec = useMemo(() => ({ ...specRef.current }),
[gridTick])`. Every scene consumer receives that same per-tick object. So:
**memoize derived fields keyed on the SPEC OBJECT (WeakMap<IslandSpec, …>)**
— correct (new identity per edit) and leak-free (old specs get collected).
Do NOT key on `spec.grid` (identity persists across mutations — stale
results).

### `src/terrain/grassField.ts` — the allocating scatter (plan 025/026 era)

```ts
export interface GrassBlade { x; y; z; yaw; height; shade; phase }
export function grassBlades(spec: IslandSpec, perCell = BLADES_PER_CELL): GrassBlade[] {
  …
  const out: GrassBlade[] = []
  for (…cells…) {
    …
    for (let b = 0; b < perCell; b++) {
      … const y = evaluateHeight(spec, x, z, blurred)
      if (y <= seaLevel + 0.01) continue
      if (Math.abs(y - yCell) > CLIFF_DROP) continue
      out.push({ x, y, z, yaw, height, shade, phase })
    }
  }
  return out
}
```

`test/grassField.test.ts` asserts against the object array (lengths, field
ranges, determinism via `toEqual`).

### `src/scene/GrassLayer.tsx` — the consumer

Spec-keyed effect: calls `grassBlades(spec)`, then per blade
`offset.setXYZ(i,…); yawScale.setXY(i,…); shadePhase.setXY(i,…)`, sets
`instanceCount = blades.length`, marks the three `InstancedBufferAttribute`s
`needsUpdate`, and writes the `uCharPos` uniform using
`worldPositionOfObject(spec, char, blurTiers(spec.grid))`.

### `src/scene/SeaSurface.tsx` + `src/scene/CharacterActor.tsx` — duplicate BFS

```ts
// SeaSurface, per spec change:
updateShoreDataTexture(shoreTex, shoreDistanceField(spec.grid, spec.worldSize))
// CharacterActor:
const shore = useMemo(() => shoreDistanceField(spec.grid, spec.worldSize), [spec])
```

### blurTiers call sites (per edit)

`IslandTerrain.tsx:85` (memo), `PlacedObjects.tsx:29` (memo),
`GrassLayer.tsx:96` (inline), `grassField.ts:51` (inside grassBlades),
`shoreField.ts:29` (inside shoreDistanceField), `CharacterActor` (uses the
PlacedObjects-provided `blurred` prop; check your base).

### UI conventions for the HUD

Panels are plain divs styled in `src/ui/panel.css` (`.file-bar`, `.hotbar`,
`.animation-dock`, `.camera-dock` — dark rounded boxes, fixed-position).
Icons/tiles in `src/ui/icons.tsx`. r3f's `useFrame` is available INSIDE the
Canvas only; the HUD div lives OUTSIDE — bridge with a tiny component inside
the Canvas that writes into a shared ref/store (same pattern as
`characterPose.ts`).

## Scope

**In scope**:

- `island-editor/src/terrain/specCache.ts` (create — WeakMap memos)
- `island-editor/src/terrain/grassField.ts` (SoA fill API)
- `island-editor/src/scene/GrassLayer.tsx` (use SoA + caches)
- `island-editor/src/scene/SeaSurface.tsx`, `CharacterActor.tsx`,
  `IslandTerrain.tsx`, `PlacedObjects.tsx` (switch to the caches)
- `island-editor/src/ui/StatsHud.tsx` (create), `src/ui/panel.css` (one
  style block), `src/scene/frameStats.ts` (create — in-Canvas probe)
- `island-editor/src/App.tsx` (mount the HUD + probe ONLY)
- `island-editor/test/grassField.test.ts` (adapt to SoA),
  `island-editor/test/specCache.test.ts` (create)

**Out of scope**: any constant that changes the LOOK (`BLADES_PER_CELL`,
SEGMENTS, texture sizes, shader math), the BFS internals (already optimal),
spec/codec, behavior machine logic, new dependencies (no stats.js/r3f-perf).

## Git workflow

Branch `advisor/029-perf-fps-hud` off the tip named in your dispatch.
Commit: `perf(island-editor): FPS/resource HUD, shared per-spec field
caches, allocation-free grass scatter`. Do NOT push.

## Steps

### Step 1: Per-spec caches

`src/terrain/specCache.ts` (new; NO three imports; header comment in the
grassField.ts style):

```ts
import { blurTiers, type IslandSpec } from './terrainGrid'
import { type ShoreField, shoreDistanceField } from './shoreField'

// Per-edit derived fields, memoized on the SPEC OBJECT. App mints a fresh
// spec identity per grid tick ({ ...specRef.current }) while the grid arrays
// mutate in place — so the spec object is the correct cache key (a WeakMap
// entry per edit, collected with the spec) and the grid object is NOT (its
// identity survives mutation; keying on it would serve stale fields).

const blurredCache = new WeakMap<IslandSpec, Float32Array>()
export function blurredForSpec(spec: IslandSpec): Float32Array {
  let b = blurredCache.get(spec)
  if (!b) { b = blurTiers(spec.grid); blurredCache.set(spec, b) }
  return b
}

const shoreCache = new WeakMap<IslandSpec, ShoreField>()
export function shoreFieldForSpec(spec: IslandSpec): ShoreField {
  let f = shoreCache.get(spec)
  if (!f) { f = shoreDistanceField(spec.grid, spec.worldSize); shoreCache.set(spec, f) }
  return f
}
```

Switch consumers (each is a one-line change; keep their memo/effect
structure):

- `SeaSurface.tsx` (both call sites) → `shoreFieldForSpec(spec)`
- `CharacterActor.tsx` shore memo → `shoreFieldForSpec(spec)`
- `IslandTerrain.tsx` + `PlacedObjects.tsx` blurred memos →
  `blurredForSpec(spec)`
- `GrassLayer.tsx` uCharPos line → `blurredForSpec(spec)`

`test/specCache.test.ts`: same spec object → SAME Float32Array/ShoreField
instance (references equal); a spread-copied spec (`{...spec}`) after a grid
mutation → a DIFFERENT, freshly-computed instance reflecting the mutation.

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0;
`npx vitest run test/specCache.test.ts` → pass.

### Step 2: Allocation-free grass scatter

`grassField.ts`: keep `grassBlades` (tests + any other consumers) but make
it a thin wrapper over a new fill-style core:

```ts
export interface GrassBladeArrays {
  /** xyz per blade (3 floats) */ offsets: Float32Array
  /** yaw, height per blade (2 floats) */ yawScales: Float32Array
  /** shade, phase per blade (2 floats) */ shadePhases: Float32Array
}
/** Fill caller-owned arrays (capacity ≥ cells×perCell blades); returns the
 *  blade COUNT. Zero allocations beyond the one blurTiers (pass `blurred`
 *  to avoid even that). Determinism identical to grassBlades. */
export function fillGrassBlades(
  spec: IslandSpec, out: GrassBladeArrays, perCell = BLADES_PER_CELL,
  blurred?: Float32Array,
): number
```

The loop body is IDENTICAL to today's (same rand stream/order, same clip
rules) except it writes `out.offsets[count*3]…` etc. and increments `count`
instead of pushing an object. `grassBlades` becomes: allocate arrays sized
to the worst case, call `fillGrassBlades`, then materialize the object array
FROM the arrays (test-facing shape unchanged — determinism tests still pass
by construction).

`GrassLayer.tsx`: the spec effect calls
`fillGrassBlades(spec, { offsets: offsetAttr.array as Float32Array, … },
BLADES_PER_CELL, blurredForSpec(spec))` writing DIRECTLY into the three
instanced attribute arrays (they are exactly the SoA layout already), sets
`instanceCount = count`, marks needsUpdate. Delete the per-blade copy loop.

**Verify**: `npx tsc --noEmit` → exit 0; `npx vitest run
test/grassField.test.ts` → all pass UNCHANGED (the object wrapper keeps the
public contract; if any test imports internals that moved, adapt minimally
and note it).

### Step 3: FPS/resource HUD

1. `src/scene/frameStats.ts` (new): a `frameStats` mutable singleton
   `{ fps: 0, ms: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 }`
   plus a tiny component `<FrameStatsProbe />` (r3f, must be INSIDE the
   Canvas): `useFrame(({ gl }) => …)` accumulates frame count + a rolling
   window; twice per second writes fps (frames/elapsed), ms (avg), and
   copies `gl.info.render.calls`, `gl.info.render.triangles`,
   `gl.info.memory.geometries`, `gl.info.memory.textures` into the
   singleton. Renders `null`. No per-frame allocations.
2. `src/ui/StatsHud.tsx` (new): fixed-position div (top-left, style block
   appended to `panel.css` matching the `.file-bar` look, smaller type),
   updating from the singleton via a 500 ms `setInterval` +
   `useState` tick — NOT per frame. Shows:
   `62 fps · 16.1 ms · 214 calls · 1.2M tris · geo 38 · tex 21`
   (format numbers compactly; triangles as k/M). Add a `title` tooltip
   explaining the fields.
3. `App.tsx`: `<FrameStatsProbe />` inside the Canvas (next to Backdrop),
   `<StatsHud />` next to the other overlays. Always on (it IS the feature —
   the maintainer asked to see it).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Gate

`pnpm check:island-editor` (worktree root) → exit 0; report exact test
count. State for the reviewer: the browser pass must show (a) the HUD live
with plausible numbers, (b) IDENTICAL visuals (before/after screenshots of
the same island), and (c) subjectively snappier paint drags with a character
placed (the double-BFS elimination) — the HUD itself now provides the
numbers to check.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -rn "shoreDistanceField(" island-editor/src/scene` → NO direct
      call sites remain (all go through `shoreFieldForSpec`)
- [ ] `grep -rn "blurTiers(" island-editor/src/scene` → no direct call sites
      remain in scene components
- [ ] `grep -n "fillGrassBlades" island-editor/src/terrain/grassField.ts island-editor/src/scene/GrassLayer.tsx` → defined + consumed
- [ ] `grep -n "frameStats" island-editor/src/App.tsx` → probe + HUD mounted
- [ ] grassField determinism tests pass without modification
- [ ] `git status` — only in-scope files

## STOP conditions

- Any grassField test needs its EXPECTED VALUES changed (not just import
  shape) — the SoA refactor altered the scatter; report, don't adjust
  expectations.
- You find yourself changing a look-affecting constant or shader — quality
  is explicitly protected; report.
- `gl.info` fields differ on this three version (r171) — check the actual
  shape and adapt names, but if render/memory info is absent entirely,
  report.
- WeakMap keying proves wrong (e.g. a consumer receives a different spec
  object identity than App's per-tick one) — report with the evidence, do
  not fall back to keying on the grid.

## Maintenance notes

- The caches hold ONE entry per live spec identity; nothing to invalidate
  manually. If App's spec-identity model ever changes (e.g. in-place spec),
  `specCache.ts`'s header comment is the tripwire to re-read.
- The HUD is intentionally dependency-free; if deeper profiling is ever
  wanted, r3f-perf is the upgrade path (new dep — a deliberate decision,
  not a drive-by).
- Reviewer focus: determinism tests green WITHOUT edits (the strongest
  no-visual-change signal); the HUD's numbers moving when painting a big
  meadow; no direct shoreDistanceField/blurTiers calls left in scene code.
