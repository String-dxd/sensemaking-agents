---
title: Island Editor Engine — initiative overview & plan index
type: feat
status: done — shipped in #74 (data-driven island + standalone designer); terrain surfaces largely superseded by the #76 tile-grid rewrite
date: 2026-06-15
revised: 2026-06-15 (post design-review / grill)
written_against_commit: 22856862
---

# Island Editor Engine — overview & plan index

> A sequenced set of self-contained plans that turn the island's hard-coded scene into a
> **data-driven world authored through a dev-facing in-app editor** — placement *and* species
> appearance — exported as committed defaults every user boots from. This file is the map. Each
> numbered plan is executable by an implementer with **zero context from the design session**.
>
> **This revision** reflects a design review (the `/grill-me` pass). Where it differs from the
> first draft, the review's decision wins — notably: **no 3D gizmo** (numeric inspector instead),
> **stable uuid object ids** (not `kind:index`), **full live add/remove incl. trees**, a **species
> palette** workstream (plan 005), and a **working-copy + committed-file** persistence model.

---

## Decisions locked with the requester (design review, 2026-06-15)

| # | Decision |
|---|---|
| Audience / home | **Dev/engineer tool**, gated by `import.meta.env.DEV` + `#editor` hash. Not in production, not on the student SideRail. |
| Output | **Two committed artifacts**: `defaultIslandLayout.json` (placement) + `defaultSpeciesPalette.json` (species colors). Authored → exported → committed → ships via PR/deploy. |
| Scope of the model | **Authored static stage only** — trees, flowers, fruits, mailbox, telescope. Grown/bloomed objects (the reflection mechanic) stay owned by `Sprouts`, untouched. |
| Operations | select · add · remove · move · rotate(yaw) · scale — **all kinds incl. trees**, live. |
| Transform UX | **Numeric inspector** (type exact x/z/yaw/scale) + reuse the existing ground-plane drag for coarse move. **No `TransformControls` / 3D gizmo** (dropped — too risky at three 0.149, untestable headlessly). |
| Tree add/remove | Live teardown + `_placeAll` rebuild of the per-species `InstancedMesh`; a brief rebuild flash is accepted. |
| Object identity | **Stable uuid per object, assigned once ("baked") and never recomputed from array position.** Defaults carry frozen ids in the committed file; editor-added objects get fresh uuids. |
| Per-object config | kind + species + transform. **No per-object color** (color lives in the species palette). |
| Species palette | Edit **existing** species' colors live (oak/cherry two-tone leaves, the 6 flower palettes, the 6 fruit colors) → applied via shader uniforms / `material.color`. New species/geometry = v2. |
| Edit persistence | localStorage **working copy** layered over the committed-file **base**, a "diverged from default" **badge**, a **revert to default** action, and **Export**. |
| Preview | Toggle **bare authored stage ↔ populated** (reuses the existing `showAll` mature-island preview). |
| Undo/redo | **One unified command stack** across move / add / remove / inspector / palette edits. |
| Per-student pick-and-plant | Re-key `decorOffsets` from **index → stable uuid** with a one-time migration, so a student's moved objects survive a designer changing the defaults. (Promoted from optional → in-scope.) |
| Deferred (v2+) | island shape/terrain editing; "core mechanics" tuning (thresholds/weather); new-species creation / asset import; a deployed self-serve designer surface + DB; per-instance color; multi-select; the 3D gizmo. |

Plans live in `docs/plans/` (the repo's active planning home), **not** the empty root `plans/`.

---

## Current state (verified against commit `22856862`)

A mature hand-rolled **Three.js engine** at `src/engine/student-space/` (122 files):

- **Game root & loop** — `Game/Game.js`: singleton `Game`, rAF loop gated by
  `_running`/`_hidden`/`_renderActive`, `setRenderActive(active)`, and a `dispose()` that nulls
  every singleton. `Game/index.js` is `createGame(...)`.
- **State slices** — hand-rolled observer slices under `Game/State/` (no Redux). Each: mutation
  methods → `subscribe(cb)` fan-out (try/catch) → lenient `hydrate`/`serialize` → `_persist()` via
  `Persistence` (debounced). `schema.js` holds per-slice lenient mergers + `coercePosition`.
- **View objects** — bespoke per-kind `THREE.Group`s under `Game/View/`; **no base class**. Per-kind
  registries (`Tree.entries`, `Fruits.entries`, `Flowers.flowers`).
- **Authored layout is hard-coded constants** — `Tree.PLACEMENTS` (7, `{species,x,z,scale,yaw}`),
  `Fruits.BUSH_PLACEMENTS` (4), `Flowers` (18, `seed = 1337`, all 6 species), `Mailbox` (`-0.6,2.5`),
  `Telescope` (`RIM_THETA=1.30, RIM_RADIUS=4.85`). Bounds/height: `State/Island.js`
  (`heightAt`, `isOnPlateau`, `isPlaceable(inset=0.3)`, `radius=5.0`).
- **Species colors are hard-coded constants** — `Tree` `OAK_COLOR_A/B`,`CHERRY_COLOR_A/B`
  (shader uniforms `uColorA/uColorB`); `Flowers.SPECIES` (`petal`/`centre`/`face`);
  `Fruits.FRUIT_SPECIES` (`color`). All live-mutable (shader uniform / `material.color`).
- **A move-only student "Arrange" mode ships** — `ss:edit-mode` (button in
  `IslandProgressionOverlay.tsx`) drag-moves sprouts/bloomed/decor; persists via
  `Sprouts.decorOffsets` (**index-keyed**) to localStorage + the server snapshot
  (`vips_island_snapshots`, via `IslandSnapshotBridge`). `View/Sprouts.js:618-681` applies offsets.
- **Dev-gate precedent** — `EngineHost.tsx:319` mounts `{import.meta.env.DEV && game ?
  <CameraTuneBridge/> : null}`; `Debug.js` gates `lil-gui` behind `import.meta.env.DEV` +
  `#debug`. React seam: `useEngine()`, `useEngineSliceVersion(slice)`.

### The gap this initiative closes

Authored placement **and** species appearance are constants — no add/remove, no transform, no
recolor, no authoring tool, no export. This builds the data models, the editor, and the
ship-as-default pipeline.

---

## Plan set & execution order

| # | File | Title | Depends on | Status |
|---|------|-------|-----------|--------|
| 001 | `…-001-feat-island-layout-data-model-plan.md` | Layout data model (uuid ids · default · render-from-data · working-copy slice) | — | Not started |
| 002 | `…-002-feat-island-editor-selection-transform-plan.md` | Selection + numeric-inspector transform + unified command/undo (**no gizmo**) | 001 | Not started |
| 003 | `…-003-feat-island-editor-authoring-surface-plan.md` | Dev-gated panel: palette/add · delete · inspector · undo · **full add/remove incl. tree rebuild** · preview toggle | 001, 002 | Not started |
| 004 | `…-004-feat-island-layout-export-default-pipeline-plan.md` | Layout export + committed `defaultIslandLayout.json` + **decorOffsets uuid re-key migration** | 001, 003 | Not started |
| 005 | `…-005-feat-island-species-palette-plan.md` | Species palette: data model + `defaultSpeciesPalette.json` + live recolor + palette editing UI + export | 001, 003 | Not started |

**Execution order: 001 → 002 → 003, then 004 and 005 (independent — separate artifacts) after 003.**
Each downstream plan was written against `22856862` and assumes the architecture below; **re-validate
each against its predecessor's as-merged APIs** before executing (every plan carries a drift check +
STOP-and-report escape hatches).

```
001 ──▶ 002 ──▶ 003 ──┬──▶ 004  (layout export / committed default / offset re-key)
(model) (select+   (panel    └──▶ 005  (species palette: model + recolor + export)
        inspector)  add/remove)
```

---

## Target architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EDITOR SURFACE (React, DEV + #editor)                          [003 + 005]    │
│  palette·add/delete · inspector(x/z/yaw/scale/species/locked) · recolor ·     │
│  preview toggle · undo/redo · revert-to-default · Export(layout + palette)    │
└───────────────▲───────────────────────────────────────────────▲──────────────┘
                │ commands                                        │ recolor
┌───────────────┴───────────────────────────────────┐  ┌─────────┴───────────────┐
│ SELECTION + NUMERIC TRANSFORM + COMMAND STACK [002]│  │ SPECIES PALETTE      [005]│
│  raycast pick · numeric x/z/yaw/scale commits ·    │  │  per-species colors →     │
│  reuse drag for coarse move · terrain-snap/bounds  │  │  uniforms / material.color│
└───────────────▲────────────────────────────────────┘  └─────────▲───────────────┘
                │ updateObject / addObject / removeObject           │ default+working copy
┌───────────────┴───────────────────────────────────┐  ┌──────────┴───────────────┐
│ ISLAND-LAYOUT SLICE (working-copy + base) [001]    │  │ SPECIES-PALETTE SLICE [005]│
│  uuid objects · CRUD · events · divergence/revert  │  │  same working-copy pattern │
└───────────────▲────────────────────────────────────┘  └──────────▲───────────────┘
                │ render-from-data + reconcile(add/remove)          │ apply-on-change
        Tree (rebuild) · Flowers/Fruits (per-instance) · Mailbox/Telescope (move)
        committed: defaultIslandLayout.json [004]      committed: defaultSpeciesPalette.json [005]
```

### Data models

- **`PlacedObject`** `{ id: uuid, kind, species?, x, z, yaw?, scale?, locked? }` — `y` is always
  derived from `island.heightAt(x,z)`, never stored. `IslandLayout` `{ v, objects: PlacedObject[] }`.
- **`SpeciesPalette`** `{ v, species: { [kind]: { [speciesId]: { colors… } } } }` — colors only in
  v1 (oak/cherry two-tone, flower petal/centre/face, fruit color).

### Persistence model (both slices)

base = committed default file (004/005) → fallback to the constants-derived seed → **working copy**
in localStorage layered on top → `diverged` flag → `revertToDefault()` → `Export` writes the file.

---

## Cross-cutting concerns (apply to every plan)

- **No 3D gizmo.** Transforms are numeric (inspector) + the existing ground-plane drag for coarse
  move. Do not add `TransformControls`.
- **Stable uuids, never index-as-identity.** Ids are assigned once and frozen; never recompute an
  id from a live array position (that desyncs under add/remove/reorder).
- **Provenance is not a blocker, stay clear of the rebuild.** Per
  `docs/plans/2026-06-12-asset-provenance-audit.md`, placeable content + the colors the palette edits
  (tree foliage MIT; flowers/fruits own) are release-clean. The **ambient visuals** (grass/sky/rain/
  water/aurora) must be rebuilt before public release — the editor must **not** touch them. Island
  shape editing (deferred v2) collides with that rebuild; that's why it's deferred.
- **rAF / HMR / dispose discipline.** New slices/controllers register in `Game.dispose()` and remove
  their own listeners; respect `setRenderActive`.
- **State-slice ceremony.** A slice = slice file · `schema.js` merger · `State.js` construct/hydrate ·
  (persistence wiring) · `Game.dispose` clear · `*.d.ts`. Plans 001/005 enumerate every file.
- **Testing.** Vitest in `test/engine/*.test.ts` (slices, merge, reconcile) and
  `test/components/*.test.tsx` (panel). Follow `Sprouts.test.ts` / `Sprouts.pickPlant.test.ts` /
  `IslandSnapshotBridge.test.ts`. Numeric transforms + recolor are fully unit-testable (no WebGL).
- **Gates:** `pnpm check` (Biome + tsc) and `pnpm test` before any unit is "done"; `pnpm build` for
  UI changes (and to verify the editor is DEV-stripped from production).
- **Components:** Base UI (`@base-ui-components/react`) for behavior + local `src/components/ui/*`
  visuals. **Do not** install shadcn.

---

## Scope boundaries (initiative)

Not student-facing; no terrain/heightfield editing; no new-species/asset import; no deployed/DB
designer surface; no multiplayer; does not change the reflection→grow→bloom mechanic or the
ambient-visual rebuild.

---

## Source map (verified)

- Loop/dispose: `Game/Game.js`, `Game/index.js`. Bounds: `State/Island.js`.
- Placement consts: `View/Tree.js` (`PLACEMENTS:66`, `_placeAll:415`), `View/Fruits.js`
  (`BUSH_PLACEMENTS:36`, `_placeBushes:92`), `View/Flowers.js` (`seed:359`, `_buildOne:378`),
  `View/Mailbox.js:49`, `View/Telescope.js:27`.
- Color consts: `View/Tree.js:50-53` + `makeLeavesMaterial:246`; `View/Flowers.js:20-27`;
  `View/Fruits.js:23-32`.
- Move APIs: `Tree.moveEntry:617`, `Flowers.moveInstance:509`, `Fruits.moveEntry:251`,
  `Mailbox.move:223`, `Telescope.move:166`.
- Edit/persist: `State/Sprouts.js` (`decorOffsets:100`, `setDecorOffset:263`, `serialize:490`,
  `hydrate:424`), `View/Sprouts.js:618-681`, `State/IslandSnapshotBridge.js`,
  `src/components/IslandProgressionOverlay.tsx`.
- Schema/persistence: `State/schema.js` (`coercePosition:471`, `mergeSprout:482`, `mergeArray:520`),
  `State/Persistence.js` (`KEY:33`, `SLICES:47`, `_exportJson:153`, `_importJson:168`), `State/State.js`.
- Server snapshot: `src/server/island-snapshot.handler.server.ts`, `…/island-state-at.handler.server.ts`,
  `src/db/schema.ts:583` (`vipsIslandSnapshots`), `src/server/function-schemas.ts`.
- React seam / dev gate: `EngineHost.tsx:319`, `use-engine.ts`, `use-engine-slice-version.ts`,
  `IslandProgressionOverlay.tsx`, `Debug/Debug.js:33-36`.
- Types template: `State/Sprouts.d.ts`. Tests: `test/engine/Sprouts*.test.ts`,
  `test/components/*.test.tsx`. Provenance: `docs/plans/2026-06-12-asset-provenance-audit.md`.
