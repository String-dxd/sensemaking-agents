---
title: Island Editor — selection, numeric transform & unified command/undo (no gizmo)
type: feat
status: proposed
date: 2026-06-15
revised: 2026-06-15 (post design-review — TransformControls dropped)
written_against_commit: 22856862
part_of: 2026-06-15-000-feat-island-editor-engine-overview.md
plan_index: 002
depends_on: [001]
---

# Island Editor — selection + numeric transform + command/undo

## Overview

With placement data-driven (001), this plan adds the **engine core of the editor**: **select** an
object (raycast pick + highlight), **transform** it via a precise API the inspector calls
(`applyTransform(id, {x,z,yaw,scale})`) plus the existing **ground-plane drag** for coarse move,
**commit** to the layout, and **undo/redo** via a unified command stack. A small **`EditableView`**
adapter per kind lets all of this work uniformly across the bespoke views.

**Locked decision honored: no 3D gizmo.** Transforms are numeric (inspector, built in 003) + drag for
coarse move. This removes `TransformControls` entirely — the single riskiest, least-testable piece of
the first draft. Everything here is unit-testable without WebGL.

> Read `…-000-…-overview.md` and confirm 001 is merged.

---

## Preconditions / drift check (DO FIRST)

1. **001 merged.** `Game/State/IslandLayout.js` exposes `list/listByKind/get/updateObject/moveObject/
   subscribe` and fans `objectUpdated`; objects carry **stable uuid** `id`; each view's per-object
   record carries its layout `id` (001 U5/U6). Use as-merged names if they differ.
2. Anchors: the existing drag reference `View/Sprouts.js` — `_raycaster`/`_drag`/`_dragGroundPlane`
   (~317-334), `_handlePointerDown:347`, `_raycastDraggable:434`, `_handlePointerMove:471`,
   `_finishDrag:773`/`_cancelDrag:868`, `camera.controls.enabled` suppression; per-object groups
   (`Tree.entries[i].group`, `Flowers.flowers[i].group`, `Fruits.entries[i].group`, `Mailbox.group`,
   `Telescope.group`); move APIs (`Tree.moveEntry:617`, `Flowers.moveInstance:509`,
   `Fruits.moveEntry:251`, `Mailbox.move:223`, `Telescope.move:166`); `View.js` construction (~40-122)
   + `SUBSYSTEMS` dispose (~187-220); `camera.controls` bound at `View.js:55`; bounds
   `Island.heightAt/isPlaceable`; dev gate `Debug.js:33-36`; `window.__studentSpaceGame` in
   `EngineHost.tsx`.
3. **STOP and report** if the student pick-and-plant has been removed (this plan leaves it intact), or
   001's objects aren't uuid-addressable.

---

## Requirements Trace

- **R1.** An `EditableView` adapter per kind resolves a layout object's `THREE.Object3D`
  (`getObject3D(id)`), enumerates raycast targets (`hitTargets()`), and applies a live transform
  (`applyTransform(id,{x?,z?,yaw?,scale?})`) by wrapping the existing move API + setting
  `group.rotation.y`/`group.scale`. (`spawn`/`remove` are **declared**; implemented in 003.)
- **R2.** An `EditController` raycast-picks an object on pointer-down (editor active) → `Selection`,
  with a highlight.
- **R3.** `EditController.applyTransform(id, patch)` (the API the 003 inspector calls) transforms the
  mesh **and** commits to `state.islandLayout.updateObject(id, patch)` (`y` always `heightAt`).
- **R4.** A **coarse-move drag** (reuse the `Sprouts.js` ground-plane pattern): pointer-drag a selected
  object across the plateau, suppress `camera.controls` during drag, snap `y`, reject `!isPlaceable`,
  commit `{x,z}` on release. **No gizmo.**
- **R5.** A **unified `CommandStack`** records every commit (`{before,after}` for transforms; extended
  by 003/005 for add/remove/recolor) with `undo()`/`redo()`.
- **R6.** Editor is **dev-gated** (`import.meta.env.DEV` + `#editor`), `activate()`/`deactivate()`-able
  from React (003), exposed as `window.__islandEditor` in dev for pre-UI testing.
- **R7.** Everything participates in `View.dispose()`/`Game.dispose()`; `camera.controls.enabled`
  restored on dispose/cancel.
- **R8.** Tests cover selection, `applyTransform`→layout+mesh, drag bounds reject, undo/redo, controls
  restore. `pnpm check`+`pnpm test` pass. (No WebGL needed — gizmo is gone.)

---

## Scope Boundaries

**In:** adapters (transform of existing objects), Selection, EditController (pick + applyTransform +
coarse-move drag), unified CommandStack, dev activation, tests.
**Not in:** add/remove spawn/despawn (003 — `spawn`/`remove` are stubs here); the inspector/palette
**UI** (003); species recolor (005); export (004); 3D gizmo (dropped); multi-select; retiring the
student pick-and-plant.

---

## Key Technical Decisions

1. **No gizmo.** The first draft's `TransformControls` is removed: it's risky at three 0.149 and can't
   be unit-tested in happy-dom. Selection is click-to-pick; transforms are numeric (003 inspector via
   `applyTransform`) + the proven ground-plane drag for coarse move.
2. **Additive controller; student pick-and-plant untouched.** Both can run; the dev editor is
   `#editor`-gated, the student drag is `ss:edit-mode`-gated. Add a one-line guard so the student drag
   is inert while `#editor` is active.
3. **`y` derived, never stored.** Transform commits store `{x,z,yaw,scale}`; view snaps `y` via
   `heightAt`.
4. **Reactive sync:** subscribe to `objectUpdated` → `adapter.applyTransform` keeps the mesh in sync
   when the layout changes from elsewhere (e.g. undo, inspector).
5. **`EditableView` is a per-kind adapter object** (no base class) looked up by `kind`.
6. **Unified command stack** so add/remove (003) and recolor (005) compose with transforms in one
   undo history.

---

## Implementation Units

### U1 — `EditableView` adapters
**Files:** create `Game/View/edit/editableViews.js` (+ `.d.ts`).
Per kind, an adapter closing over the view: `getObject3D(id)` (look up the record by its layout `id`
from 001 → `.group`), `hitTargets()` (the groups), `applyTransform(id,t)` (translate → existing
`moveEntry`/`moveInstance`/`move`; `t.yaw` → `group.rotation.y`; `t.scale` → `group.scale.setScalar`),
`spawn(obj)`/`remove(id)` → `console.warn('… see plan 003')`. `buildEditableViews(view, island)` returns
`{tree,flower,fruit,mailbox,telescope}`. **Escape hatch:** if a kind exposes no per-object group to
transform, STOP & report (trees: use the per-tree trunk `entry.group`; `moveEntry` re-projects leaves).

### U2 — Selection
**Files:** `Game/View/edit/Selection.js`. `select(id)`/`deselect()`/`get()`; a tiny change-callback set
(003 observes). Highlight: a cheap `THREE.BoxHelper(object3d)` or a ground ring at the object; dispose
on deselect.

### U3 — `EditController` (pick + numeric transform + coarse-move drag)
**Files:** create `Game/View/edit/EditController.js` (+ `.d.ts`).
- Construct `{view,state,camera,scene,island,editableViews,selection}`; `activate()`/`deactivate()`
  add/remove a canvas `pointerdown`.
- **Pick:** pointerdown raycasts `Σ editableViews[*].hitTargets()`; map hit → layout `id` via
  `object.userData`/identity; `selection.select(id)`.
- **`applyTransform(id, patch)`** (called by the 003 inspector + by undo): clamp translate to
  `isPlaceable`; `editableViews[kind].applyTransform(id, patch)`; push a command (U4); commit
  `state.islandLayout.updateObject(id, {...patch})` (omit `y`).
- **Coarse-move drag:** reuse the `Sprouts.js` mechanics — on drag of the selected object, project to a
  ground plane, set `x/z`, `y=heightAt`, tint/block when `!isPlaceable`, `camera.controls.enabled=false`
  during, commit `{x,z}` (via `applyTransform`) on release inside bounds else snap back.
- Subscribe to `state.islandLayout` `objectUpdated` → `editableViews[kind].applyTransform(id, …)` to
  keep meshes synced on external changes (undo, inspector).

### U4 — Unified `CommandStack`
**Files:** `Game/View/edit/CommandStack.js` (+ `.d.ts`). `push({do,undo})`; `undo()`/`redo()` with a
redo stack; optional cap (~100). Transform command: `do=()=>layout.updateObject(id,after)`,
`undo=()=>layout.updateObject(id,before)`. Generic so 003 add/remove + 005 recolor slot in.

### U5 — Dev activation + lifecycle
**Files:** `View.js` (construct `this.editController` after the view kinds; add to `SUBSYSTEMS`); maybe
`Debug/Debug.js` for an `editor` toggle; `index.d.ts` if it enumerates subsystems.
Do **not** `activate()` by default. Expose `window.__islandEditor` in dev. `dispose()` → `deactivate()`,
remove listeners, restore `camera.controls.enabled = true`, dispose the highlight. **Escape hatch:**
conform to the existing `SUBSYSTEMS` dispose shape; if unclear, STOP & report.

### U6 — Tests + gates
**Files:** `test/engine/IslandEditor.selection.test.ts`, `…transform.test.ts`. (Construct `Game`/`View`
in happy-dom like `Camera.test.ts`/`Sprouts.pickPlant.test.ts`.)
**Scenarios:** simulated raycast hit → `selection.get()` is the id; `applyTransform` writes
`{x,z,yaw,scale}` to `layout.updateObject` (assert `layout.get(id)`) and moves/rotates/scales the group;
`y` not stored; off-plateau translate rejected (mirror `Sprouts.pickPlant.test.ts`); drag toggles
`camera.controls.enabled` (stub controls) and restores it; undo restores `before`, redo `after`;
`dispose()` restores `controls.enabled` + clears the highlight.
**Verify:**
```bash
pnpm test test/engine/IslandEditor.selection.test.ts test/engine/IslandEditor.transform.test.ts
pnpm test ; pnpm check
pnpm dev   # /#editor: click an object → highlight; numeric/drag move within bounds commits; reload persists (001 working copy)
```

---

## System-Wide Impact

- **Student pick-and-plant:** untouched; guarded off while `#editor` active. Both write different
  layers (editor → layout; student → `decorOffsets`).
- **Layout slice:** first writer of `updateObject`; edits persist to the working copy (001).
- **Camera:** the drag toggles `controls.enabled`; restore is bulletproofed (dispose + cancel + a
  try/finally). A stuck `false` bricks orbit — U6 covers it.
- **No WebGL test dependency** — the gizmo's removal makes the core fully unit-testable.

## Risks
| Risk | Mitigation |
|---|---|
| Tree transform anchor (leaves are a shared InstancedMesh) | transform the per-tree trunk `entry.group`; `moveEntry` re-projects leaves; U1 escape hatch |
| Stuck `controls.enabled=false` | restore in dispose + cancel + try/finally; U6 |
| Editor + student drag both raycast | guard student drag off under `#editor` |

## Done Criteria
1. `pnpm check`+`pnpm test` green; new tests pass; `Sprouts.*`/`IslandLayout.*` unaffected.
2. `/#editor`: click selects (highlight), numeric + drag transforms commit + persist; off-plateau
   rejected. 3. Outside `#editor`, world + student pick-and-plant unchanged. 4. Dispose leaves
   `controls.enabled === true` and no highlight in the scene. **No `TransformControls` anywhere.**

## Sources
Overview/001. Drag reference `View/Sprouts.js:347/434/773/618-681`. Move APIs `Tree.js:617`,
`Flowers.js:509`, `Fruits.js:251`, `Mailbox.js:223`, `Telescope.js:166`. Camera `View.js:55`. Lifecycle
`View.js:40-122/187`, `Game.js:310-359`. Bounds `State/Island.js`. Dev gate `Debug.js:33-36`,
`EngineHost.tsx`. Tests `test/engine/Camera.test.ts`, `Sprouts.pickPlant.test.ts`.
