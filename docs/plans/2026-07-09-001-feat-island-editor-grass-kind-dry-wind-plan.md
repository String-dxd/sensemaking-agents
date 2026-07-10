# Plan 001: Add a wind-reactive `grass` object kind, keeping the wind system single-source

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `docs/plans/2026-07-09-000-feat-island-editor-cozy-interactions-overview.md`.
>
> **Drift check (run first)**: `git diff --stat 9328feee..HEAD -- island-editor/src island-editor/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (written against branch `feat/island-editor-palm-remodel-orbit`, PR #89 — execute after it merges, or on top of it)
- **Category**: direction
- **Planned at**: commit `9328feee`, 2026-07-09

## Why this matters

The island editor can place trees, bushes, and rocks, but nothing ground-level —
islands read as bare lawns between trees. Grass tufts are the cheapest, highest-
frequency decoration in the cozy-game references (Tiny Glade, Animal Crossing)
and they're what makes wind visible at ground level. The wind system already
exists and is deliberately centralized; this plan adds grass WITHOUT forking it —
the "DRY" requirement means zero new time-based sway code outside the existing
`wind.ts` seam.

## Current state

- `island-editor/src/terrain/terrainGrid.ts` — pure spec module (headless-
  testable, no three.js scene deps beyond types). Object kinds live at lines
  237–238:

  ```ts
  export type ObjectKind = 'fruitTree' | 'pine' | 'palm' | 'bush' | 'rock'
  export const OBJECT_KINDS: ObjectKind[] = ['fruitTree', 'pine', 'palm', 'bush', 'rock']
  ```

- `island-editor/src/models/buildObjectModel.ts` — procedural model factory for
  non-GLB kinds. Line 18: `export type ProceduralKind = Extract<ObjectKind, 'bush' | 'rock'>`.
  Line ~232: `const BUILDERS: Record<ProceduralKind, (rand: Rand) => THREE.Object3D[]>`.
  The bush builder wraps its foliage in a named `'canopy'` group with
  `canopy.userData.windAmp = 0.25` (line ~154) — this userData is the ONLY
  contract the wind system needs. Texture-theme registration is TWO-part in the
  bush exemplar — copy both parts exactly:
  1. at build time it calls `registerPaintedMaterial(mat, 'bush-leaves', 0xffffff, LEAF)`
     (from `textureThemes.ts:72`), guarded by `typeof document !== 'undefined'`
     so headless tests don't touch the TextureLoader;
  2. it stamps `material.userData.paint = { map: 'bush-leaves', offTint: LEAF }`
     (no `classicTint` — it defaults to white), which `registerPaintedModel`
     (island-editor/src/models/textureThemes.ts:96) re-reads on React mount to
     survive StrictMode's mount→dispose→remount.
  The bush foliage material is named `'bush-foliage'`. Follow the bush builder
  as the exemplar for grass in all of this.
- `island-editor/src/scene/wind.ts` — the single wind source: pure gust field
  (`windDirection`, `gustStrength`) + `CanopySpring` (spring-damper writing
  rotX/rotZ/scaleY). No React, no scene objects.
- `island-editor/src/scene/useCanopyWind.ts` — the one r3f seam:

  ```ts
  export function useCanopyWind(model: THREE.Object3D, key: string, worldX: number, worldZ: number): void
  ```

  It resolves the model's `'canopy'` group, reads `userData.windAmp`, steps a
  `CanopySpring` per frame. Consumers: `PlacedObjects.tsx:67`, `ModelGallery.tsx:38`.
  A model without a canopy group is a silent no-op (rock).
- `island-editor/src/models/useObjectModel.ts` — resolves kind→model. GLB kinds
  come from `GLB_MODEL_URLS`; anything else falls through to
  `buildObjectModel(kind as ProceduralKind, seed)`. Adding a procedural kind
  requires NO change here.
- `island-editor/src/models/rand.ts` — `mulberry32` seeded PRNG + `hashString`.
  Builders take a `Rand` and must be deterministic (same seed → same geometry).
- Placement land-gating already exists (`isLandCell` checks in `App.tsx`
  `onPlaceHover`/`placeObject`); grass inherits it for free.
- Tests: `island-editor/test/buildObjectModel.test.ts` — per-kind contract tests
  (grounded at y=0, footprint bound, determinism, canopy/windAmp). Model new
  grass tests on the bush cases in that file. `island-editor/test/wind.test.ts`
  covers the gust field and spring — read it; do not duplicate its coverage.
- UI: the place panel and gallery iterate `OBJECT_KINDS`, so a new kind appears
  automatically; it only needs an icon + label. The kind→icon/label mapping is
  `KIND_META` in `island-editor/src/ui/icons.tsx` (~line 200), consumed by
  `island-editor/src/ui/ModelPanel.tsx`. `App.tsx` never references
  `OBJECT_KINDS` directly — do not edit it in this plan.

## Commands you will need

| Purpose | Command (from repo root) | Expected on success |
|---------|--------------------------|---------------------|
| Install | `cd island-editor && pnpm install` | exit 0 |
| Typecheck + tests | `pnpm check:island-editor` | exit 0, all tests pass |
| Dev server | `pnpm dev:editor` | serves http://localhost:5180 |
| Model gallery | open `http://localhost:5180/?gallery` | all kinds in a row, seeded variants per column |

## Suggested executor toolkit

- **Visual iteration protocol** — read the section of that name in
  `docs/plans/2026-07-09-000-feat-island-editor-cozy-interactions-overview.md`
  before Step 2. Every geometry change in this plan goes through that
  capture→critique→tweak loop; the exact agent-browser commands are there.
- `agent-browser` CLI for captures (see protocol for install fallback).

## Scope

**In scope** (the only files you should modify/create):
- `island-editor/src/terrain/terrainGrid.ts` (extend the kind union + list)
- `island-editor/src/models/buildObjectModel.ts` (grass builder)
- `island-editor/src/ui/*` (only the place-panel icon entry for grass)
- `island-editor/test/buildObjectModel.test.ts` (grass contract tests)

**Out of scope** (do NOT touch, even though they look related):
- `island-editor/src/scene/wind.ts` and `useCanopyWind.ts` — the whole point is
  that grass needs zero changes here. If you find yourself editing them, stop.
- `island-editor/scripts/build-tree-glbs.mjs` and `public/models/*.glb` — grass
  is procedural, not a GLB.
- `src/` (the product app) — the editor is an isolated workspace.
- Save-format/codec files (`island-editor/src/editor/specIO.ts`,
  `island-editor/src/editor/gridCodec.ts`) — `PlacedObject.kind` is serialized
  as a string; a new kind value needs no codec change. Verify with the
  existing `specIO` round-trip test rather than editing the codec.

## Git workflow

- Branch from the PR #89 branch (or `main` if merged): `feat/island-editor-grass-kind`
- Commit style: `feat(island-editor): <summary>` (see `git log --oneline -10`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend the kind union

In `island-editor/src/terrain/terrainGrid.ts` change lines 237–238 to include
`'grass'` (append to both the union and the array). Nothing else in the file.

**Verify**: `pnpm check:island-editor` → typecheck fails ONLY with exhaustiveness
errors pointing at places that must now handle `'grass'` (expected — they guide
step 2). If it passes clean, grep `OBJECT_KINDS` consumers to confirm none
switch exhaustively, then continue.

### Step 2: Build the grass tuft model

In `island-editor/src/models/buildObjectModel.ts`:

1. Change `ProceduralKind` to `Extract<ObjectKind, 'bush' | 'rock' | 'grass'>`.
2. Add a `grass` builder to `BUILDERS`, modeled structurally on the bush
   builder. Target shape — a small tuft, ~0.25–0.35 world units tall:
   - 7–11 blades; each blade a 2-segment creased strip (three vertices per
     ring — for the construction pattern, READ `frondBlade` in
     `island-editor/scripts/build-tree-glbs.mjs` (~line 366); that file is
     out of scope to EDIT but is the reference for strip geometry — but tiny:
     length 0.18–0.3, width 0.03–0.05), leaning outward at a seeded angle,
     fanned around the tuft center with seeded yaw. Flat-faceted or smooth —
     match the bush's shading choice for consistency at ground level.
   - All blades inside a group named `'canopy'` with
     `canopy.userData.windAmp = 1.6` (grass flutters harder than any crown;
     the spring clamps lean via MAX_LEAN so 1.6 is safe — fruitTree=1,
     palm=1.25 for calibration).
   - Deterministic: only the passed `rand` for entropy.
   - Grounded: blade bases at y=0. The factory's contract assertions apply to
     every kind — before building, read the assertion block at the end of
     `buildObjectModel` (grep `footprint` in the file) and note its exact
     numeric bounds; your tuft must satisfy them and your Step 5 tests must
     assert against those same numbers, not guessed ones.
   - Materials: a single `MeshStandardMaterial`, green in the bush family
     (bush uses the leaf palette in this file), `DoubleSide` (blades are
     strips), and stamp `userData.paint = { map: 'bush-leaves' }` so grass
     follows texture themes exactly like the bush foliage does (reuse the
     bush's map rather than authoring a new texture in this plan).

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 2b: Visual iteration on the tuft (mandatory, expect 2–3 rounds)

Run the visual iteration protocol (overview doc) on the gallery view. Named
criteria — iterate until ALL hold, in Classic AND Off themes, side + top-down:

- **Reads as grass, not a bush**: individual blades distinguishable at gallery
  zoom; silhouette is spiky/tufty, not a mound.
- **Scale**: tuft height visibly below the bush's shoulder (~1/3 bush height);
  at game zoom in the MAIN editor (place 5+ tufts on an island) it reads as
  ground cover, not shrubbery.
- **Seed variety**: the three gallery seeds differ visibly (blade count/lean),
  but all read as the same species.
- **No floating**: orbit to eye-level; every blade base meets the ground
  (placement sits objects at terrain height — a blade starting at y>0.02
  floats on slopes).
- **Color**: sits in the bush-green family; not brighter than the palm fronds.

Measurable proxies for the scale criterion: build a bush and a grass tuft in a
scratch test and compare `Box3` heights — target grass max.y in 0.25–0.35 vs
the bush's (~0.55+). Common first-round failures to check for explicitly:
blades so thin they alias/shimmer when orbiting (widen or reduce count), and
DoubleSide strips going black on the back face (the palm's `frondMat` in
`scripts/build-tree-glbs.mjs` ~line 455 solves this with a soft emissive
floor — read it there, reproduce in the grass material if the problem appears).

**Verify**: final-round screenshots exist for side/top/eye-level × 2 themes;
every criterion above met.

### Step 3: Place-panel icon

Add a grass entry to `KIND_META` in `island-editor/src/ui/icons.tsx` (~line
200 — the kind→icon/label mapping `ModelPanel.tsx` consumes). Simplest
acceptable icon: reuse the bush icon component with a different title, or a
minimal 3-blade SVG matching the existing icon style in the same file.

**Verify**: `pnpm dev:editor`, open the editor, the place panel shows a grass
button; clicking it arms placement; clicking land drops a tuft; clicking sea
does nothing (land gate).

### Step 4: Wind, for free — prove the DRY property

No wind code changes. Confirm:

1. In the gallery (`?gallery`), grass tufts visibly flutter faster than bushes.
   Prove it with captures, not eyeballing: screenshot the gallery 3 times ~2 s
   apart (protocol's wind gotcha) — the grass tufts' lean must differ between
   frames MORE than the bushes'. If windAmp 1.6 reads frantic next to the palm
   (1.25), iterate downward in 0.1 steps and re-capture; if imperceptible,
   check the tuft actually nests its blades inside the `'canopy'` group
   (blades outside it never move).
2. `git diff --name-only <branch-base>..HEAD` contains NEITHER
   `island-editor/src/scene/wind.ts` NOR `useCanopyWind.ts`.
3. `grep -rn "elapsedTime\|Math.sin(" island-editor/src/models/buildObjectModel.ts`
   → no time-based animation in the model builder (builders are static; sway
   comes only from the spring).

**Verify**: all three checks hold.

### Step 5: Contract tests

In `island-editor/test/buildObjectModel.test.ts`, add grass cases following the
bush tests' structure:

- grass builds, is grounded (bbox min.y ≈ 0), footprint within the factory's
  bound
- carries a `'canopy'` group with `userData.windAmp === 1.6`
- deterministic: two builds with the same seed produce identical vertex buffers;
  different seeds differ
- material stamped with `userData.paint.map === 'bush-leaves'`

**Verify**: `pnpm check:island-editor` → exit 0, new tests listed as passing.

## Test plan

Covered by Step 5 (unit contract tests) plus the manual placement check in
Step 3. Also run the existing `specIO` round-trip test — a placed grass object
must survive export/import unchanged (it will, since kind is a plain string;
the test run is the proof).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0 with new grass tests passing
- [ ] `git diff --name-only` shows no changes to `wind.ts` / `useCanopyWind.ts`
- [ ] Grass places on land, is rejected on sea, undoes/redoes like other objects
- [ ] Grass follows texture themes (switch Classic → Off in the running editor)
- [ ] Final visual capture set exists (Step 2b criteria met; wind-motion
      frame diffs from Step 4 captured AFTER the last geometry change)
- [ ] Status row updated in the overview doc

## STOP conditions

- The factory's grounding/footprint assertions reject the tuft and the fix
  isn't a geometry tweak — report rather than loosening the contract.
- `useObjectModel` turns out to special-case kinds beyond the GLB map (it
  shouldn't; if it does, the codebase drifted).
- Adding the kind forces edits in serialization/codec files — that means the
  format is no longer kind-agnostic; report.
- Placement of many tufts (50+) visibly drops frame rate in dev — the
  per-object spring may need instancing; that's a separate plan, report back.

## Maintenance notes

- Grass is per-placement (one spring each). If a future "scatter brush" places
  hundreds of tufts, migrate grass rendering to `InstancedMesh` with a GLSL
  port of the gust field — keep `wind.ts` the single source by exporting its
  constants into the shader rather than re-deriving them.
- Reviewers should check the tuft reads at game zoom (not just gallery zoom)
  and that windAmp 1.6 doesn't look frantic next to palm 1.25.
