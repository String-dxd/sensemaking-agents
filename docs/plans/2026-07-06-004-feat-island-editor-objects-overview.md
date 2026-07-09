---
title: Island editor — placeable objects (procedural trees/bushes/rocks + drop + model panel) — initiative overview
type: overview
status: done — initiative shipped to main via #79 (models + placement + model panel); land-gate hardened by #81. See reconcile note below.
date: 2026-07-06
written_against_commit: b375cdbb
base_branch: feat/island-editor-distributed-layout (merge to main first; then base on main)
---

# Placeable objects initiative — overview & plan index

> **Reconcile note (2026-07-08):** DONE. The whole initiative shipped to `main`
> via **#79** ("distributed layout + camera + placeable objects — models,
> placement, panel") — plans A/B/C = `005`/`006`/`007`. The land-gate follow-up
> shipped via **#81** (`009`); raise/lower-to-target via **#80** (`008`). The
> follow-on object-model **texture/reshape** pass (`2026-07-07-001`) was executed
> and advisor-approved this session and is pending merge. No open work remains in
> this initiative.

> A sequenced set of self-contained plans that let a user **place procedural objects**
> (trees, bushes, rocks) onto the island in the standalone editor, pick them from a
> **left-pane model palette**, and export them as part of the island. This file is the
> map + the shared contracts; each numbered plan is independently executable by an
> agent with zero context from this session.

## Decisions locked with the requester (2026-07-06)

- **Procedural models from primitives** (not GLB assets) — stylized low-poly
  trees/bushes/rocks built in code from cones/spheres/cylinders + toon-ish materials,
  the `bird-builder` approach. Covers every reference shape (palm, pine, round fruit
  tree, leafy bush, rock), no asset/licensing pipeline, parametric variety.
- **Click-to-place, cell-snapped**: pick a kind in the panel → a ghost model follows the
  cursor snapped to the hovered grid cell (sitting on the terrain height) → click to
  drop, with small random yaw + scale jitter for natural variety. Keep placing; Esc or
  a mode toggle stops.
- **v1 object set (5 kinds)**: `fruitTree`, `pine`, `palm`, `bush`, `rock`.
- **The model panel is the LEFT pane** — the distributed layout deliberately reserved
  the left edge for "a future objects/inspector pane" (see
  `2026-07-06-003-feat-island-editor-distributed-layout-plan.md` maintenance notes).

## Base & dependency

Builds on the **distributed-layout** branch (`feat/island-editor-distributed-layout`,
commit `b375cdbb`) — the bottom hotbar + camera dock + file bar + the reserved left
edge. **Merge that to `main` first** (it's advisor-approved), then base this initiative
on `main`. Every plan below stamps `b375cdbb` and says "base on main once the
distributed layout has merged."

## Why this needs 3 plans, not 1

The feature spans three separable concerns, each with its own risk profile and
verification surface. Building them as one plan would be a giant, hard-to-review diff.

| # | Plan | What it delivers | Risk | Depends on |
|---|------|------------------|------|-----------|
| A | `…-005-feat-island-editor-object-models.md` | Procedural model factory (5 kinds) + a gallery route + unit tests | LOW (pure/visual, isolated) | none |
| B | `…-006-feat-island-editor-object-placement.md` | Spec **v4** `objects` layer + click-to-place/select/delete + rendering + undo + serialization/migration | MED (spec bump, pointer/camera interplay) | A (model factory), B needs A's `buildObjectModel` |
| C | `…-007-feat-island-editor-model-panel.md` | Left-pane palette to pick a kind + enter place mode, wired into the distributed layout | LOW–MED (UI + a bit of state) | A (previews), B (place API) |

**Execution order: A → B → C.** A is a self-contained visual foundation (mergeable on
its own). B makes objects real (data + interaction) using A's factory. C is the palette
UI that drives B. Each downstream plan carries a drift note: **re-validate against the
predecessor's as-merged API before executing** (A defines `buildObjectModel`, B defines
the place/select/delete callbacks + the `objects` spec field; if those land with
different signatures than specced here, reconcile the later plan first).

## Shared contracts (both later plans reference these — defined once here)

### Object kinds + the v4 spec (introduced by Plan B)

```ts
// terrainGrid.ts — add alongside the existing v3 types
export type ObjectKind = 'fruitTree' | 'pine' | 'palm' | 'bush' | 'rock'
export const OBJECT_KINDS: ObjectKind[] = ['fruitTree', 'pine', 'palm', 'bush', 'rock']

/** A placed object. Position is a grid CELL (snapped); world x/z derive from
 *  cellCenter(worldSize, grid, c, r); y derives from evaluateHeight at that point. */
export interface PlacedObject {
  id: string        // stable id, assigned once at placement (never recomputed)
  kind: ObjectKind
  c: number         // grid column (0..cols-1)
  r: number         // grid row (0..rows-1)
  yaw: number       // radians, placement jitter
  scale: number     // ~0.85..1.15 placement jitter
}

export interface IslandSpec {
  version: 4        // bumped from 3
  worldSize: number
  seaLevel: number
  tierHeights: number[]
  grid: TerrainGrid
  objects: PlacedObject[]   // NEW in v4 (empty array on migrated v1/v2/v3 specs)
}
```

Migration v3→v4: `objects = []`. The validator keeps its accepts-older-versions
contract (v1/v2 rasterize to the grid AND get `objects: []`; v3 gets `objects: []`).
Serialization: `objects` serialize as a plain array (small; no special encoding).
Mirrors the engine's `PlacedObject` vocabulary (`kind`, `yaw`, `scale`) in
`src/engine/student-space/Game/Data/islandLayout.d.ts` for eventual convergence —
though the editor keys position by grid **cell** (c,r), the engine by world (x,z);
Plan B documents the derivation.

### The model-factory API (defined by Plan A, consumed by B + C)

```ts
// island-editor/src/models/buildObjectModel.ts  (MAY import three)
import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'

/** Build a stylized low-poly model for `kind`. Deterministic given `seed`
 *  (vary silhouette/tint slightly per seed for natural variety). Returned Group
 *  is centered at origin, sits on y=0 (base at y=0), ~1 world-unit "footprint"
 *  so callers scale/position uniformly. Toon-ish materials matching the editor's
 *  grass/sand palette. */
export function buildObjectModel(kind: ObjectKind, seed?: number): THREE.Group
```

- Plan B places objects with `buildObjectModel(kind, hash(id))`, positions at
  `cellCenter` + `evaluateHeight`, rotates by `yaw`, scales by `scale`.
- Plan C renders small previews for the palette by mounting `buildObjectModel(kind)`
  in a tiny r3f scene (or a shared thumbnail).

## Cross-cutting concerns (apply to every plan)

- **Isolated package**: three@0.171 + r3f/drei. No new dependencies (procedural = no
  asset lib). Pure/logic helpers stay framework-free with a `test/*.test.ts` modeled on
  `test/terrainGrid.test.ts`; only `src/scene/*`, `src/models/*`, `src/ui/*`, `App.tsx`
  may import three/r3f.
- **Gates**: `pnpm check:island-editor` (typecheck + vitest) before any unit is "done";
  visual/interaction acceptance via `pnpm dev:editor` + screenshots.
- **StrictMode discipline**: object mutations (place/delete) stay out of React updaters —
  use the same spec-ref + tick pattern App already uses for grid edits.
- **Undo/redo**: place and delete each push one command onto the existing command stack.
- **Runtime randomness is fine in app code** (`Math.random` for jitter/seed at placement
  time) — the no-`Math.random` rule only applies to Workflow scripts, not the editor.
- **Left pane placement**: the model panel occupies the reserved left edge; it must not
  overlap the bottom hotbar or the camera dock/file bar.

## Scope boundaries (initiative)

- Standalone editor only; does NOT wire objects into the product engine (that's the
  separate, still-open `2026-06-19-004` fork — this initiative is the "Option A,
  upgraded to real procedural models" path).
- No per-object color/species editing, no multi-select, no move-after-place in v1
  (delete + re-place is the v1 edit loop; move is a deferred follow-up).
- No agent ops for placement in v1 (deferred; the `objects` array is agent-diffable JSON
  already, and a `placeObject`/`removeObject` op set is a clean follow-up).

## Deferred (v2+)

Move/drag placed objects; multi-select; per-object tint; agent placement ops; density
brush ("scatter N bushes"); collision/overlap rules; engine binding; GLB upgrade lane
per kind (the procedural models leave a clean seam).
