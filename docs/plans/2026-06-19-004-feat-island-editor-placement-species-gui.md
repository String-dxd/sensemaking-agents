---
title: GUI for object placement + species palette (resolve the host-app fork first)
type: feat
status: deferred 2026-07-08 — the gap is real (product still boots from hand-edited defaultIslandLayout.json + defaultSpeciesPalette.json) but low-value now. The #79 editor object system does NOT resolve the fork — its kinds (bush/fruitTree/palm/pine/rock) differ from the product's (tree/flower/fruit/mailbox/telescope + species), and the editor does not write the product's files. Both options remain L-effort. If revived, prefer Option B (in-product editor, real meshes, direct write-back). Do not build now.
date: 2026-06-19
written_against_commit: dda45ec1
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 2026-06-19-004
addresses: REMAIN-02
---

# Plan 004: A placement + species-palette editor — but first decide where it lives

> **⚠️ DECISION REQUIRED — do not dispatch an executor until the fork below is resolved.** The investigation
> surfaced a genuine architectural fork that changes nearly the whole plan. Picking wrong means building the
> wrong tool.

## The fork

Since PR #74, object placement and species colors are data-driven: the engine boots from
`src/engine/student-space/Game/Data/defaultIslandLayout.json` (31 objects) + `defaultSpeciesPalette.json`.
Editing either means hand-editing JSON. A GUI could live in one of two places:

**Option A — extend the standalone island-editor** (`island-editor/`, three@0.171 r3f).
- *Against:* the editor renders **terrain only** — it has no tree/flower/fruit meshes (those are engine
  `View/*` classes on three@0.149), so placement would use **placeholder markers**, not real models (weak
  WYSIWYG). And it **cannot write back**: `island-editor/vite.config.ts` has no `server.fs.allow`/alias,
  `tsconfig.json` has no path mapping, and `IslandSpec` has no `objects` field — so the editor would manage
  an in-memory copy and **export JSON the user hand-commits** (Option-D from the audit).
- *For:* fully isolated; no product-app risk; reuses the editor's command stack + autosave + panel UI.

**Option B — revive an in-product placement editor** in the root app (where the engine renders **real**
trees/flowers and already consumes the JSON).
- *For:* true WYSIWYG; writes the exact files the engine reads; PR #74 *removed* an in-app `#editor`, so
  there's prior art to restore.
- *Against:* re-introduces a surface #74 deliberately deleted; needs dev-only gating; more product-app risk.

**Recommendation:** if the goal is *seeing objects in context while placing them*, **Option B** (real
meshes, direct write-back) is the right tool and Option A's placeholder-markers + hand-commit loop will
disappoint. If the goal is only *faster data authoring* (and committing JSON by hand is acceptable),
**Option A** is smaller and isolated. Because placement is inherently spatial/visual, I lean **B** — but
this is the maintainer's call and depends on whether reopening the removed in-app editor is acceptable.

The rest of this plan specifies **Option A** (the isolated path) in executor-ready detail, since it's the
lower-risk build if chosen. If **B** is chosen, the first step is an archaeology pass on the pre-#74
`#editor` (see "If Option B").

## Status

- **Priority**: P3
- **Effort**: L (either option)
- **Risk**: MED (A: cross-package data flow; B: reopening removed product surface)
- **Depends on**: none to build A. Shares the spec-artifact-location question with plan 003 if objects ever fold into the engine spec.
- **Category**: feature / editability
- **Planned at**: commit `dda45ec1`, 2026-06-19

## Current state (shared facts)

- Object schema — `src/engine/student-space/Game/Data/islandLayout.d.ts`:
  `PlacedObject { id; kind: 'tree'|'flower'|'fruit'|'mailbox'|'telescope'; species?; x; z; yaw?; scale?; locked? }`,
  `IslandLayout { v: 1; objects: PlacedObject[] }`. Loader `defaultIslandLayout()` (islandLayout.js) imports
  the JSON, merges via `mergeIslandLayout` (`State/schema.js`), falls back to constants.
- Palette schema — `speciesPalette.d.ts`: `TreeColors {colorA,colorB}`, `FlowerColors {petal,centre?,face?}`,
  `FruitColors {color}`, `SpeciesPaletteData { v:1; tree; flower; fruit }`. Loader `defaultSpeciesPalette()`.
  `mailbox`/`telescope` have no species; `mailbox-0`/`telescope-0` are `locked: true`.
- Editor architecture to build on (Option A): `island-editor/src/App.tsx` — `EditMode = 'shape' | 'sculpt'`
  (from `ui/ToolPanel.tsx`); command stack `island-editor/src/editor/commandStack.ts`
  (`Command { label?, do, undo }`, `push` records already-applied); autosave
  `island-editor/src/editor/persistence.ts`. Pointer/raycast pattern: `scene/CoastlineHandles.tsx`
  (pointerdown → drag → raycast onto a horizontal plane → world x/z). Terrain pointer events expose
  `e.point.x/z` (`scene/Terrain.tsx`). Panel style: `ui/ToolPanel.tsx` + `ui/panel.css` (fixed top-right,
  `NumberField`, `.tool-panel__section`, `#ff7b54` accent). Pure-ops template: `terrain/coastlineOps.ts`
  + `test/coastlineOps.test.ts`.

## Option A — executor-ready outline

**Decision A1 — data flow (cross-package):** the editor imports the **types only** (zero-runtime) by copying
`PlacedObject`/`SpeciesPaletteData` into `island-editor/src/placement/types.ts` (mirror the `.d.ts`; the editor
cannot reach the root package at build time). It loads objects by user **Import** (file picker) or an optional
static copy placed in `island-editor/public/`. It manages objects in its own state and **Exports** an updated
`islandLayout.json` + `speciesPalette.json` the user commits. (Direct write-back is out of scope — it needs
the build infra plan 003 also wants; note the overlap.)

**Steps (Option A):**
1. `island-editor/src/placement/types.ts` (copy the two schemas) + `placement/placementOps.ts` +
   `placement/paletteOps.ts` — pure, immutable: `addObject`, `removeObject`, `moveObject(id,x,z)`,
   `updateObject(id,patch)`, `rotateObject`, `setSpeciesColor(kind,species,slot,hex)`. Respect `locked`.
   Tests mirror `test/coastlineOps.test.ts`. **(This is the CI gate — get it green first.)**
2. Load/Import/Export plumbing for the objects + palette JSON (their own validators mirroring
   `mergeIslandLayout`/`mergeSpeciesPalette`; reuse the file-picker pattern in `exportSpec.ts`).
3. `scene/ObjectHandles.tsx` — render a marker per object (color by kind/species); pointerdown selects;
   drag raycasts to a terrain-height plane (reuse the `CoastlineHandles` math) → `moveObject`; each
   gesture pushes one command. Skip/disable `locked` objects.
4. New `'placement'` mode in `EditMode` + a ToolPanel section: object list (select/delete), x/z/yaw/scale
   `NumberField`s, and a species swatch grid editing palette colors (match `panel.css`).
5. First slice: **move existing objects only** (no add/delete/palette) to validate the interaction, then
   layer add/delete/palette in follow-ups.

**Done (Option A):** `pnpm check:island-editor` green with new `placementOps`/`paletteOps` tests; in
`pnpm dev:editor` the 31 objects render as markers, drag-to-move works with undo/redo, and Export produces a
valid `islandLayout.json` the engine loads unchanged.

## If Option B (archaeology-first)

1. `git log --oneline --all -- '*editor*'` around PR #74; find the removed in-app `#editor` and the engine
   API it used to place/move objects and recolor species (it wrote the same JSON the engine now boots from).
2. Restore it behind a dev-only route/flag (it must stay out of the student build — see `EngineHost` rAF
   gating + onboarding hide rules in CLAUDE.md). Reuse the engine's real meshes for WYSIWYG.
3. Write back to `Game/Data/*.json` directly (in-app, dev-only), validated by the existing
   `mergeIslandLayout`/`mergeSpeciesPalette`.
This path needs its own full plan once chosen; the above is the scoping spike.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Editor gates (A) | `pnpm check:island-editor` | exit 0 |
| Run editor (A) | `pnpm dev:editor` → http://localhost:5180 | objects render + drag |
| App gates (B) | `pnpm check` / `pnpm test` | exit 0 |
| Run app (B) | `pnpm dev` → http://localhost:3000 | dev-only editor route works |

## STOP conditions

- (A) Building placement requires writing into `src/engine/student-space/Game/Data/*.json` from the editor —
  that's the deferred direct-write-back; STOP and use Import/Export instead.
- (A) Placeholder markers prove too weak to place objects meaningfully — STOP and reconsider Option B.
- (B) Reviving the editor pulls in ambient-visual code the rebuild will replace — STOP; keep it placement-only.

## Maintenance notes

- The host-app fork is the load-bearing decision; record the choice (and why) in the overview before building.
- Option A duplicates the object/palette schemas in the editor (no cross-package import). If a shared
  workspace package is created (also wanted by plan 003's pure core), both duplications collapse.
- Reviewer should scrutinize: `locked` handling, undo fidelity across move/add/delete, and (A) that exported
  JSON validates against `mergeIslandLayout`/`mergeSpeciesPalette` unchanged.
</content>
