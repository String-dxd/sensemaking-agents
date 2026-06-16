---
title: Island Editor — dev-gated authoring surface (panel · palette/add · delete · inspector · full add/remove · preview)
type: feat
status: proposed
date: 2026-06-15
revised: 2026-06-15 (post design-review — full add/remove incl. tree rebuild; inspector transforms; preview toggle)
written_against_commit: 22856862
part_of: 2026-06-15-000-feat-island-editor-engine-overview.md
plan_index: 003
depends_on: [001, 002]
---

# Island Editor — dev-gated authoring surface

## Overview

The developer/designer UI on top of 001 (layout model) + 002 (selection + numeric transform + command
stack): a dev-gated React panel to **add** from a palette, **delete**, edit a selected object in a
**numeric inspector** (x/z/yaw/scale/species/locked), **undo/redo**, **revert to default** (with a
"diverged" badge), and **toggle the preview** bare↔populated — plus the engine-side **add/remove
spawn/despawn for all kinds, including the tree `InstancedMesh` rebuild**.

When this lands, a dev at `/#editor` can fully author placement: drop/move/rotate/scale/delete any
authored object and see it live. Export → committed default is plan 004; species recolor is plan 005
(its controls mount in this same panel).

> Read `…-000-…-overview.md`; confirm 001 + 002 merged. Locked: dev-gated; numeric inspector (no
> gizmo); **full live add/remove incl. trees** (simple rebuild, brief flash OK); preview toggle.

---

## Preconditions / drift check (DO FIRST)

1. **001 + 002 merged.** `IslandLayout` exposes `addObject/removeObject/updateObject/list/listByKind/
   get/isDiverged/revertToDefault/subscribe` + events; `EditController` exposes `activate/deactivate/
   applyTransform/selection`; `CommandStack` exists; `editableViews` adapters exist (with **declared**
   `spawn`/`remove`). Use as-merged names.
2. Anchors: `EngineHost.tsx:319` (`{import.meta.env.DEV && game ? <CameraTuneBridge/> : null}` — the
   mount precedent); `IslandProgressionOverlay.tsx` (`WorldIconButton`, the `game as unknown as
   {state?…}` cast, `useState`/subscribe); `useEngine` / `useEngineSliceVersion`; `Debug.js:33-36` gate;
   `Tree._placeAll:415` + `hideAll:510` + `_leafMeshes`/`_leafMeshBySpecies`/`entries`;
   `Flowers.flowers`+`_buildOne` + the dispose idiom `Flowers.js:448-456`; `Fruits.entries`+`_placeBushes`;
   `Mailbox.dispose:249`/`Telescope.dispose:188`; `Tree/Flowers/Fruits.showAll` (mature-island preview).
3. **STOP and report** if the 003-panel or 002-controller APIs are absent, or `import.meta.env.DEV`
   isn't the project's dev-build flag.

---

## Requirements Trace

- **R1.** A `IslandEditorPanel` mounts **only** under `import.meta.env.DEV` + `#editor`; never in prod /
  on the SideRail; `activate()`/`deactivate()`s the 002 controller.
- **R2.** Palette: pick kind (tree/flower/fruit) + species + Add → `addObject` (fresh uuid) → mesh
  appears; auto-select it.
- **R3.** Delete the selected object → `removeObject` → mesh despawns.
- **R4.** Numeric inspector for the selected object: `x/z/yaw/scale` (number fields), `species` (enum),
  `locked` (toggle) → `EditController.applyTransform` / `updateObject`; edits reflect on the mesh.
- **R5.** **Engine add/remove reconcile for all kinds**, driven by layout `objectAdded/objectRemoved/
  layoutReplaced` events: flowers/fruits per-instance spawn/despawn; **trees via teardown + `_placeAll`
  rebuild** (brief flash accepted); mailbox/telescope are singletons (reposition only — no add/remove).
- **R6.** Undo/redo buttons (002 `CommandStack`); a **"diverged from default" badge** + **revert**
  (001 `isDiverged`/`revertToDefault`).
- **R7.** **Preview toggle** bare authored stage ↔ populated (reuse `Tree/Flowers/Fruits.showAll`).
- **R8.** Panel reflects the live layout via `useEngineSliceVersion(state.islandLayout)`.
- **R9.** Clean activate/deactivate on mount/unmount; production bundle excludes the panel (DEV-stripped).
- **R10.** Tests: dev-gate, add→spawn, delete→despawn, inspector→updateObject→mesh, undo of add/delete,
  **tree rebuild**, preview toggle, revert. `pnpm check`+`pnpm test`+`pnpm build` pass.

---

## Scope Boundaries

**In:** the panel (palette/add, delete, numeric inspector, undo/redo, revert+badge, preview toggle),
the engine add/remove reconcile (incl. tree rebuild), tests.
**Not in:** export / committed default (004); species recolor model + controls (005 — its controls
mount here later); a second mailbox/telescope; new-species/asset import; student exposure / prod;
multi-select / drag-from-palette (click-to-add suffices); terrain.

---

## Key Technical Decisions

1. **Reactive reconcile:** UI mutates the layout; the 002 `EditController` subscribes to structural
   events and calls `editableViews[kind].ensureFromLayout(listByKind(kind))`. One flow: UI → layout →
   controller → view.
2. **`ensureFromLayout` per kind.** Flowers/fruits: add groups for new ids, dispose+remove for gone ids
   (cheap; reuse `Flowers.js:448-456` dispose idiom). **Trees: full teardown + `_placeAll` rebuild**
   (the leaf `InstancedMesh` is count-sized; rebuild beats index surgery; brief flash accepted per the
   locked decision). Mailbox/telescope: reposition the singleton only.
3. **Dev-only, hash-invoked** (`import.meta.env.DEV && hash includes 'editor'`). No prod surface, no
   SideRail. Verify `pnpm build` strips it.
4. **Inspector is the transform UI** (numeric), calling 002's `applyTransform`; coarse move via 002's
   drag. No gizmo.
5. **All edits undoable** (002 stack): add⇄remove inverse commands; inspector edits push transform
   commands; the panel's undo/redo drive the stack.
6. **Preview toggle reuses `showAll`** (the existing mature-island dev preview) — cheap; default bare.

---

## Implementation Units

### U1 — Panel shell + activation + preview toggle
**Files:** create `src/components/student-space/editor/IslandEditorPanel.tsx`; modify `EngineHost.tsx`
(mount beside `CameraTuneBridge`: `{import.meta.env.DEV && game ? <IslandEditorPanel game={game}/> :
null}`).
Gate on `location.hash` includes `editor` (read + `hashchange`); render `null` otherwise. `useEffect`:
`activate()` on mount, `deactivate()` on unmount. Reach slice/controller via the `game as unknown as
{…}` cast; subscribe with `useEngineSliceVersion(layoutSlice)`. Fixed-corner dev panel, `pointer-events-auto`,
local `ui/*` styling. **Preview toggle:** a checkbox that calls `view.tree/flowers/fruits.showAll()`
(on) / the bare reveal-prep (off).

### U2 — Palette (add)
**Files:** `IslandEditorPanel.tsx`. Kind + species selectors (species enums sourced from the view
modules — export `FRUIT_SPECIES` keys, `Flowers.SPECIES` ids, oak/cherry). Add → `{ id: \`${kind}-
${uuid}\`, kind, species, x, z, yaw:0, scale:1 }` at the camera-target XZ (or `0,0`) clamped to
`isPlaceable` → `addObject` + push an add/remove command; auto-select.

### U3 — Engine add/remove reconcile (incl. tree rebuild)
**Files:** `Tree.js`, `Flowers.js`, `Fruits.js` (reconcile + teardown), `Mailbox.js`/`Telescope.js`
(reposition), `EditController.js` (subscribe), `editableViews.js` (route `spawn`/`remove`).
- **EditController:** on layout `objectAdded`/`objectRemoved`/`layoutReplaced`, call the affected kind's
  `ensureFromLayout(listByKind(kind))`. (002's `objectUpdated`→`applyTransform` path stays.)
- **Flowers.ensureFromLayout(objs):** diff `this.flowers` by layout `id`; build new via
  `_buildFlowerFromObject(obj)` (extracted from `_buildOne`); dispose+remove gone ones. Reveal new ones.
- **Fruits.ensureFromLayout(objs):** same on `this.entries` (`_buildBushFromObject`).
- **Tree.ensureFromLayout(objs):** `Tree._teardownPlacements()` (scene.remove + dispose each
  `entry.group` trunk; remove+dispose every `_leafMeshes` InstancedMesh; clear `entries`/
  `_leafMeshBySpecies`/`_leafMeshes`) then `_placeAll()` (layout-driven, 001); re-apply hide/show. Brief
  flash OK. **Escape hatch:** if teardown leaks GPU resources or `_placeAll` throws (e.g. disposed
  `leafCloudGeo`), STOP & report — do **not** do incremental InstancedMesh surgery.
- **Mailbox/Telescope:** `move()` to the object's x,z; ignore add/remove.
- **editableViews:** `spawn`/`remove` delegate to the kind's `ensureFromLayout`.

### U4 — Inspector + delete
**Files:** `IslandEditorPanel.tsx`. Observe 002 `Selection` → read `layout.get(id)`. Number fields
`x/z/yaw/scale` (Base UI `NumberField` or styled inputs) + species `Select` + `locked` toggle; on
(debounced) change → `EditController.applyTransform(id, patch)` (transform) or `updateObject` (species/
locked); species change → reconcile (treat as remove+add of that object via `ensureFromLayout`). Delete
button → `removeObject(id)` + command. Read-only `id`/`kind`.

### U5 — Undo/redo + divergence badge + revert
**Files:** `IslandEditorPanel.tsx`. ↶/↷ → `commandStack.undo/redo` (disabled when empty). A badge when
`layout.isDiverged()` true ("Local edits — differs from committed default"); a "Revert to default"
button → `layout.revertToDefault()` (confirm first). Optional `g`-free keyboard: `cmd/ctrl+z` undo.

### U6 — Tests + gates
**Files:** `test/engine/IslandEditor.spawn.test.ts`, `test/components/IslandEditorPanel.test.tsx`.
**Scenarios:** dev-gate (renders under `#editor`+DEV, else `null`); add → `addObject` + `ensureFromLayout`
spawns (assert `Flowers.flowers`/`Fruits.entries` grew, group in scene); delete → despawn (group removed+
disposed); inspector edit → `updateObject` + mesh moves; species swap reconciles; **tree rebuild**:
`Tree.ensureFromLayout` after an add yields a new `entries` member + a rebuilt InstancedMesh, no stale
groups; undo/redo of add/delete; preview toggle calls `showAll`; revert restores default + clears badge;
unmount calls `deactivate()`.
**Verify:**
```bash
pnpm test test/engine/IslandEditor.spawn.test.ts test/components/IslandEditorPanel.test.tsx
pnpm test ; pnpm check
pnpm build   # succeeds AND excludes the panel (DEV-stripped)
pnpm dev     # /#editor: add/move/rotate/scale/inspect/delete/undo/revert/preview all work; reload persists; / unaffected
```
Patterns: `test/components/*.test.tsx`, `test/engine/Sprouts.pickPlant.test.ts`.

---

## System-Wide Impact

- **Production safety:** `import.meta.env.DEV` mount gate + hash gate; `pnpm build` must strip it. No
  SideRail, no student exposure.
- **Student pick-and-plant:** untouched (002 guards it off under `#editor`).
- **Tree rebuild cost:** infrequent dev action; brief flash accepted. If thrashing during rapid edits,
  debounce in `ensureFromLayout`.
- **Persistence:** edits flow to the 001 working copy; revert/badge reflect divergence. Export = 004.

## Risks
| Risk | Mitigation |
|---|---|
| Tree InstancedMesh rebuild leaks/throws | U3 escape hatch (STOP+report; never index-surgery); dispose idiom from Mailbox/Telescope/Flowers |
| Editor ships to prod | DEV mount gate + `pnpm build` strip verification |
| Species swap is structural | route via `ensureFromLayout` (remove+add of the one object) |
| shadcn rule | Base UI + local `ui/*`; no shadcn |

## Done Criteria
1. `pnpm check`+`pnpm test`+`pnpm build` green; new tests pass; prior suites unaffected; bundle excludes
   the panel. 2. `/#editor`: add/move/rotate/scale/inspect/delete/undo/redo/revert/preview all work and
   survive reload (001 working copy). 3. `/` (no hash): panel absent, student experience unchanged.

## Sources
Overview/001/002. Mount `EngineHost.tsx:319`; overlay/`WorldIconButton` `IslandProgressionOverlay.tsx`;
`use-engine.ts`, `use-engine-slice-version.ts`; gate `Debug.js:33-36`. Build entry points `Tree.js:415/510`,
`Flowers.js:378/448-456`, `Fruits.js:92`; dispose `Mailbox.js:249`/`Telescope.js:188`; preview `*.showAll`.
Tests `test/components/*.test.tsx`, `test/engine/Sprouts.pickPlant.test.ts`. CLAUDE.md (Base UI, no shadcn).
