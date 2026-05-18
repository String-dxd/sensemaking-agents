---
title: Island Pick-and-Plant — drag to rearrange grown objects
type: feat
status: active
date: 2026-05-18
---

# Island Pick-and-Plant — drag to rearrange grown objects

## Overview

Kids can pick up any object **they have grown** on the island — active sprouts and bloomed trees/flowers/butterflies/fruits — and plant it wherever they want on the plateau. The interaction is mode-based: an "Arrange" toggle in the world UI flips the island into edit mode. While editing, dragging an object lifts it slightly, follows the pointer across the plateau, and commits to a new spot on release. Outside the plateau the drop is rejected and the object snaps back. The student-set position survives reloads.

Static decoration (the environmental trees seeded by `Tree.js` PLACEMENTS, ambient flowers, grass, etc.) is **not** movable — only what the student grew is theirs to rearrange.

---

## Problem Frame

The island currently places every grown object at a deterministic seeded coordinate (`placementSeed` → `seededAngleAndRadius()` in `src/engine/student-space/Game/View/Sprouts.js:99`). The student has zero authorship over where their things live; whatever the seeded hash decides is where it stays forever. For a product whose whole posture is "you are building a representation of yourself," that's a missed ownership beat.

The smallest valuable addition is direct manipulation: long-touch-or-drag in an edit mode to relocate a sprout or bloomed object. No new visuals, no new species, no new claims — just authorship over the layout.

The constraint to honor: bloom-on-tap (`View/Sprouts.js:281`) must keep working in the default mode. We don't want to overload tap with both "bloom" and "pick up." Hence the mode toggle.

---

## Requirements Trace

- R1. Active sprouts MUST be draggable while edit mode is on; released on the plateau, they persist at the new position; released off-plateau, they snap back to where they started.
- R2. Bloomed trees/flowers/butterflies/fruits MUST be draggable on the same terms (R1).
- R3. Static decoration objects (Tree.js PLACEMENTS, Flowers.js, Grass, Fireflies, etc.) MUST NOT be draggable. Only student-grown objects respond.
- R4. The default island mode MUST behave exactly as today (bloom-on-tap, peek-on-tap). Drag MUST be inert until the student enters edit mode.
- R5. Edit mode MUST be toggleable from a single button surface (the world overlay), visible state, easy to exit. While edit mode is on, the bloom-on-tap behavior is suppressed.
- R6. Position MUST persist via the existing `Sprouts` persistence slice (`ss:v1:sprouts` localStorage namespace). No new persistence keys.
- R7. The view MUST treat an explicit `position` field, when present on a descriptor, as authoritative; absent/null `position` MUST fall back to the existing seeded placement so legacy data renders unchanged.
- R8. Y (height) MUST be snapped to `island.heightAt(x, z)` on drop so objects sit on terrain rather than floating or burying.
- R9. The valid drop area MUST be the central plateau (`island.isOnPlateau(x, z)`), with a small inset so objects don't clip the cliff lip.
- R10. `prefers-reduced-motion` MUST collapse the lift / hover animations to a flat cursor-following position update; the commit/snap behavior is unchanged.
- R11. While dragging, OrbitControls MUST be suppressed so camera rotation doesn't fight the drag.

---

## Scope Boundaries

- Multi-select drag (move many at once) — single-object drag only in v1.
- Grid / radial snap-to-positions — free placement only.
- Rotation, scale, or species swap via direct manipulation.
- Moving static environment decoration (the seeded Tree.js trees, the ambient flowers / grass / fireflies).
- Mid-air placement, stacking, or layering rules.
- Server-side persistence — uses existing localStorage path.
- Tutorial / onboarding overlay teaching the gesture. A one-time toast on first edit-mode entry is the only discoverability hint.
- Keyboard / screen-reader move support — out of scope for v1, but the edit-mode toggle itself must remain keyboard-reachable (it's a `<button>`).

### Deferred to Follow-Up Work

- Undo / "reset layout" affordance — once we see whether kids actually want to redo layouts, we can add either a per-object reset or a wholesale "scramble"/"reset" button.

---

## Context & Research

### Relevant Code and Patterns

- **Sprouts state slice** — `src/engine/student-space/Game/State/Sprouts.js`. Owns both `sprouts[]` (active) and `bloomedTrees[]` (post-bloom persistent). Descriptors today carry `placementSeed: number` only; we extend with optional `position: { x, z } | null`. Mutation methods follow the existing `_invalidateCache → _fan(event) → _persist()` triplet.
- **Sprouts view** — `src/engine/student-space/Game/View/Sprouts.js`. The `_spawnNode` (line 502) and `_spawnBloomedTree` (line 307) methods are the single chokepoint where descriptor → world position is computed. Both call `seededAngleAndRadius(descriptor.placementSeed)` then `island.heightAt(x, z)`. This is where the "explicit position overrides seed" branch goes.
- **Sprouts subscriber loop** — already at line 170; handles `spawned / grew / markedReady / speciesLocked / bloomed`. Add a `'moved'` case that updates an existing node's `group.position`.
- **Hit raycasting** — sprouts already carry an invisible `parts.hitTarget` sphere (line 552). Bloomed trees do **not** have hit targets today (only sprouts get pointerup handling at line 274). For v1, we add a matching invisible hit sphere to each `bloomedNode` so drag can grab bloomed objects.
- **Camera / OrbitControls** — `src/engine/student-space/Game/View/Camera.js:48`. The Camera class exposes `this.controls` (the OrbitControls instance) with `controls.enabled` available to suppress during drag. We won't fight the existing `zoomTo` flow because drag never starts during a camera flow (the auto-bloom flow doesn't happen in edit mode; sprouts are paused mid-grow there).
- **Schema** — `src/engine/student-space/Game/State/schema.js`. `mergeSprout` (line 411) drives the lenient hydrate. Extending requires: adding `'position'` to `KNOWN_SPROUT_KEYS`, validating `{ x, z }` numerics, defaulting to `null`. Bloomed trees today merge inline in `Sprouts.hydrate` (line 308); we extend that filter to carry forward `position` too.
- **Persistence pattern** — `src/engine/student-space/Game/State/Persistence.js`. Already covers `sprouts`. No new key needed.
- **Island bounds** — `src/engine/student-space/Game/State/Island.js`. `isOnPlateau(x, z)` (line 98) is the strict test. The view's `PLATEAU_RADIUS = 2.6` (Sprouts view line 90) is the seeded-placement working radius — slightly inside the silhouette. We reuse `isOnPlateau` for the drop test plus a configurable inset.
- **Overlay surface** — `src/components/IslandProgressionOverlay.tsx` is where the world UI overlays sit. The "Arrange" toggle button lives here so it's React-managed (matches the existing pattern for sprout-related UI). The toggle dispatches a `ss:edit-mode` `CustomEvent` that the engine's Sprouts view listens for, mirroring the existing `ss:sprout-tap-not-ready` event pattern (View/Sprouts.js:297).

### Institutional Learnings

- **`docs/solutions/2026-05-18-island-progression-engine-substrate.md`** — the live home route mounts the engine; `src/components/world/*` is dormant. All work lives in `src/engine/student-space/Game/State/` and `src/engine/student-space/Game/View/`.
- **`feedback-engine-slice-template`** (memory) — additions to a state slice are a 6-step change (slice / Persistence / schema / State / Game.dispose / index.d.ts). This plan does **not** add a new slice; it extends `Sprouts.js` and `schema.js` only. Steps 4 / 5 / 6 are unaffected.
- **Subscriber crash isolation** (memory) — the engine's `_fan` already wraps subscribers in try/catch (Sprouts.js:407), so a buggy view handler won't abort persistence. We can rely on that.
- **React-bridge stability** (memory) — `Sprouts.recent()` and `getActive()` return cached frozen snapshots. The new `position` field becomes part of those frozen objects automatically because we mutate-then-invalidate-cache.

---

## Key Technical Decisions

- **Position model: explicit `{x, z}` overlay, not seed mutation.** Each descriptor gains `position: { x, z } | null`. The view prefers `position` when present, else falls back to `seededAngleAndRadius(placementSeed)`. Rationale: keeps the deterministic seed available as a fallback (and for any future "reset layout" affordance), and keeps the migration story trivial — legacy snapshots without `position` continue to render at their seeded spot.
- **Mode toggle, not always-on drag.** A persistent edit-mode flag in the view (set via `CustomEvent`) gates drag. Rationale: bloom-on-tap and drag-from-tap conflict, especially on touch where there's no hover state. A clear visual mode boundary is easier for a 13-year-old than a long-press gesture.
- **CustomEvent for the toggle (no new state slice).** Edit mode is ephemeral UI state, not persistent. We use the same `CustomEvent` pattern already established by `ss:sprout-tap-not-ready`. Rationale: avoids the 6-file slice ceremony for what is essentially a transient view flag.
- **Plateau-only drops with snap-back.** The drop is committed only if `isOnPlateau(x, z)` plus a small inset. Off-plateau drops snap the mesh back to its origin position. Rationale: clearer than a "you can't drop there" toast, matches the physical metaphor of plant-on-soil.
- **Add hit targets to bloomed objects.** Today only sprouts have `hitTarget` meshes; bloomed trees rely on their group children. Adding a uniform invisible sphere keeps the raycast logic single-path (one target type, predictable hit radius). Rationale: simpler code, consistent feel between sprout-drag and bloomed-drag.
- **Suppress OrbitControls via `controls.enabled = false` during drag.** Rationale: minimal-invasive — flips a flag on the existing controls rather than re-architecting input dispatch.
- **Reduced-motion: drag still works.** Disabling drag on reduced-motion would deny the feature; only the lift / hover micro-animation is gated. Rationale: the *interaction* is essential; only the *animation* is decorative.

---

## Open Questions

### Resolved During Planning

- **Should static Tree.js placements be movable?** No — environment, not student-authored. Out of scope.
- **Where does the toggle live?** In `IslandProgressionOverlay.tsx` (React side, alongside the existing world overlay UI), dispatched into the engine via `CustomEvent`.
- **What happens to the seed if a position is set?** Seed stays on the descriptor as a fallback; only `position` is read by the view when both exist.

### Deferred to Implementation

- The exact "valid drop" inset margin from the plateau silhouette — to be tuned by visual feel during U4 (~0.2-0.4m inside `isOnPlateau`).
- Whether the drag-lift Y offset should be a constant or a per-species value — start constant, revisit if butterfly drags feel off (butterflies are already ~0.42m off ground).
- Whether to play an audio cue on commit — defer to U4; if `view.sound.playOneShot('plant')` (or reuse the bloom chime) feels right, ship it; otherwise silent commit.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                                     ┌──────────────────────────┐
                                     │ IslandProgressionOverlay │  (React)
                                     │  [ Arrange  ◯ ]          │
                                     └────────────┬─────────────┘
                                                  │ dispatchEvent
                                                  │   ss:edit-mode { on: true|false }
                                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                  View/Sprouts.js  (engine)                      │
   │                                                                 │
   │  editMode flag                                                  │
   │   ├─ ON  →  pointerdown→drag, suppress OrbitControls            │
   │   └─ OFF →  pointerdown→tap (existing bloom path)               │
   │                                                                 │
   │  drag lifecycle                                                 │
   │   pointerdown on hitTarget                                      │
   │     ▶ lift mesh (Y+0.15, scale*1.05) unless reduce-motion       │
   │     ▶ store origin (x,y,z) for snap-back                        │
   │     ▶ controls.enabled = false                                  │
   │   pointermove                                                   │
   │     ▶ ground-plane raycast → (x, z)                             │
   │     ▶ y = island.heightAt(x, z) + lift                          │
   │     ▶ valid? glow.color green : red                             │
   │   pointerup                                                     │
   │     ▶ valid → state.sprouts.setSproutPosition(id, {x,z})        │
   │              or setBloomedPosition(id, {x,z})                   │
   │     ▶ invalid → tween mesh back to origin                       │
   │     ▶ controls.enabled = true                                   │
   └────────────────────────────┬────────────────────────────────────┘
                                │ slice mutation
                                ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                  State/Sprouts.js  (engine)                     │
   │                                                                 │
   │  setSproutPosition(id, {x, z})                                  │
   │   ▶ find sprout                                                 │
   │   ▶ sprout.position = { x, z }   (or null to clear)             │
   │   ▶ _invalidateCache()                                          │
   │   ▶ _fan({ type: 'moved', sprout })                             │
   │   ▶ _persist()  →  ss:v1:sprouts                                │
   │                                                                 │
   │  setBloomedPosition(id, {x, z})   ─── analogous on bloomedTrees │
   └─────────────────────────────────────────────────────────────────┘
                                │ 'moved' event
                                ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  View/Sprouts.js  subscriber                                    │
   │   'moved' → update node.sprout / node.tree                      │
   │           → mesh.group.position.set(x, heightAt(x,z), z)        │
   └─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U1. **Schema + slice mutations for explicit position**

**Goal:** Make position a first-class field on sprouts and bloomed trees, with lenient hydrate and persisted mutations that emit a `'moved'` event.

**Requirements:** R1, R2, R6, R7

**Dependencies:** None

**Files:**
- Modify: `src/engine/student-space/Game/State/schema.js`
- Modify: `src/engine/student-space/Game/State/Sprouts.js`
- Modify: `src/engine/student-space/Game/State/Sprouts.d.ts`
- Test: `src/engine/student-space/Game/State/__tests__/Sprouts.pickPlant.test.js` *(create)*

**Approach:**
- Extend `mergeSprout` (`schema.js:411`): add `'position'` to `KNOWN_SPROUT_KEYS`; validate as `{ x: number, z: number }` or `null`; default to `null`; warn-and-drop on malformed shape.
- In `defaultSprout()` add `position: null`.
- In `Sprouts.hydrate` extend the `bloomedTrees` map step to carry forward `position` if it's a valid `{ x, z }` object, default `null`.
- In `Sprouts.serialize` include `position` on each sprout and bloomed tree.
- Add two mutation methods on `Sprouts`:
  - `setSproutPosition(id, position)` — find active sprout, set `position` (or null), `_invalidateCache()`, `_fan({ type: 'moved', sprout })`, `_persist()`. Validate `position` is `null` OR `{x: number, z: number}`; reject silently otherwise.
  - `setBloomedPosition(id, position)` — same shape on `bloomedTrees`, fan `{ type: 'moved', bloomedTree }`.
- Extend the `Sprouts.d.ts` types so the React side / TypeScript consumers see the new field and methods.

**Patterns to follow:**
- The existing `setDimensionForFirstCapture` method (`Sprouts.js:211`) for "find one, mutate, fan, persist" structure.
- The lenient merge style in `mergeSprout` for the new field.

**Test scenarios:**
- Happy path — `setSproutPosition(id, { x: 1.2, z: -0.4 })` sets position; `recent()[0].position` equals `{ x: 1.2, z: -0.4 }` (frozen).
- Happy path — `setBloomedPosition(id, { x: 0, z: 0 })` updates the right bloomedTree.
- Happy path — after `setSproutPosition`, a `'moved'` event fires with `{ type: 'moved', sprout }`.
- Happy path — `setSproutPosition` triggers `_persist()` and the next `hydrate(serialize())` round-trip preserves `position`.
- Edge case — unknown id is a silent no-op (no throw, no event, no persist).
- Edge case — `setSproutPosition(id, null)` clears the position back to null and emits `'moved'`.
- Edge case — `setSproutPosition(id, { x: 'foo' })` is rejected (no mutation, no event); `setSproutPosition(id, { x: 1 })` (missing z) is rejected.
- Edge case — schema merge: a hydrated snapshot with `position: { x: 1.5, z: 2.0 }` is preserved; with `position: { x: 'bad' }` is dropped to null with a warn.
- Edge case — legacy snapshot without any `position` key hydrates to `position: null` (back-compat).

**Verification:**
- `Sprouts` round-trips position through hydrate/serialize.
- Subscribers receive `'moved'` events distinct from `'spawned' / 'grew' / 'bloomed'`.
- No existing test regresses (the existing `Sprouts` tests must still pass).

---

- U2. **View reads explicit position; reacts to `'moved'`**

**Goal:** The Sprouts view treats an explicit `position` as the authoritative placement, falls back to the seeded hash when absent, and updates existing meshes when the slice fires `'moved'`.

**Requirements:** R7, R8

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/Sprouts.js`

**Approach:**
- Introduce a small helper `_resolvePosition(descriptor)` returning `{ x, y, z }`:
  - If `descriptor.position && typeof descriptor.position.x === 'number' && typeof descriptor.position.z === 'number'` → use those; `y = island.heightAt(x, z)`.
  - Else → existing `seededAngleAndRadius(descriptor.placementSeed)` path.
- Call `_resolvePosition` from both `_spawnNode` (sprouts) and `_spawnBloomedTree` (bloomed). Replace the inline seed-then-height block.
- In the slice subscriber (line 170), add a `'moved'` branch:
  - For sprout-shaped events (`event.sprout`): look up `this.nodes.get(event.sprout.id)`, update `node.sprout`, recompute position via `_resolvePosition`, set `node.group.position`.
  - For bloomed-shaped events (`event.bloomedTree`): same on `this.bloomedNodes`.
- Position update should be instantaneous (not tweened) — the mesh follows the pointer during drag, and the `'moved'` event only fires on commit. Tweening from old to new would race the drag-release lift-drop.

**Patterns to follow:**
- The existing `'speciesLocked'` branch in the subscriber for "look up node, mutate in place" structure.

**Test scenarios:**
- Test expectation: none — pure plumbing; view-layer behavior is covered indirectly by U4's drag integration test. The unit's correctness is verified by visual smoke (sprouts spawn at custom position) and by U4.

**Verification:**
- Spawning a sprout with `position: { x, z }` in a hydrated snapshot renders that sprout at the explicit coordinates, not at the seeded hash.
- After `setSproutPosition` is called by U4, the affected mesh's `group.position.x/z` matches the new position within float epsilon.

---

- U3. **"Arrange" toggle in the world overlay**

**Goal:** Add a clearly-visible toggle button to the React world overlay that flips the engine in and out of edit mode via a `CustomEvent`.

**Requirements:** R4, R5

**Dependencies:** None (parallel to U1/U2)

**Files:**
- Modify: `src/components/IslandProgressionOverlay.tsx`
- Modify: `src/engine/student-space/Game/View/Sprouts.js` *(listen for `ss:edit-mode`)*

**Approach:**
- In `IslandProgressionOverlay.tsx`:
  - Add a small button positioned at the bottom-left (or wherever doesn't collide with the capture FAB / TopNav). Label: "Arrange" with a move-cursor icon; when on, label flips to "Done" with a check-icon.
  - Local React state `editMode: boolean` drives the visual.
  - On toggle, dispatch `window.dispatchEvent(new CustomEvent('ss:edit-mode', { detail: { on: nextValue } }))`.
  - When `editMode` is on, render a small persistent banner ("Drag to plant. Tap Done when finished.") so the mode is unmistakable. On first-ever entry, show a one-time toast ("Move things around — anywhere on the island."); store the "shown once" flag in `sessionStorage` (no need to persist long-term).
- In `View/Sprouts.js`:
  - Constructor wires a `window.addEventListener('ss:edit-mode', this._onEditMode)`.
  - `this._editMode = false` flag.
  - `_onEditMode` sets `this._editMode = !!event.detail?.on`.
  - `dispose()` removes the listener.
- Visual cue while edit mode is on: the badge layer (`this.badgeLayer`) gets a class `edit-mode` that subtly increases all badges' contrast or adds a small "move" icon (CSS-only).

**Patterns to follow:**
- The existing `ss:sprout-tap-not-ready` `CustomEvent` (View/Sprouts.js:297) for engine→React; this plan inverts the direction (React→engine).
- `IslandProgressionOverlay.tsx` already uses local React state + `useEffect` patterns; extend rather than restructure.

**Test scenarios:**
- Happy path — clicking the "Arrange" button toggles `editMode` and dispatches `ss:edit-mode` with `detail.on: true`; clicking again toggles to false.
- Happy path — `View/Sprouts.js._editMode` flips in response to the event.
- Edge case — first entry to edit mode shows the one-time toast; subsequent entries in the same session don't.
- Edge case — `dispose()` unsubscribes; firing the event after dispose doesn't mutate a torn-down view.
- Accessibility — the toggle button has a real `aria-pressed` value matching the state.

**Verification:**
- The button is reachable, clearly visible, and labeled.
- Engine `_editMode` is observable in dev (a single `console.debug` is fine; remove or gate before merge).

---

- U4. **Drag-to-move interaction**

**Goal:** When edit mode is on, dragging an active sprout or bloomed object lifts it, follows the pointer across the plateau, commits on release inside the plateau, and snaps back on release outside.

**Requirements:** R1, R2, R3, R8, R9, R11

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `src/engine/student-space/Game/View/Sprouts.js`
- Modify: `src/engine/student-space/Game/State/Island.js` *(add `isPlaceable(x, z, inset)` helper)*

**Approach:**
- Add `Island.isPlaceable(x, z, inset = 0.3)` — returns `true` if `Math.hypot(x, z) < radiusAt(x, z) - inset`. Keeps drop tests off the cliff lip.
- Add invisible hit targets to bloomed objects. In `_spawnBloomedTree`, after building the species-specific mesh, append:
  ```
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  hitTarget.userData = { kind: 'bloomed', bloomedId: tree.id }
  group.add(hitTarget)
  ```
  Cache it on the `bloomedNodes` entry so the raycast can find it. Mark `node.parts.hitTarget` analogously.
- New per-instance state on the view: `this._drag = null | { kind: 'sprout'|'bloomed', id, group, originPos, originScale, lifted, valid }`.
- Reuse the existing `_canvasEl` pointerdown/pointerup listeners. Branch by `this._editMode`:
  - **Edit-mode-on pointerdown**: raycast against the union of sprout and bloomed hit targets. On hit, start drag: store origin position + scale, lift mesh (Y += 0.15, scale *= 1.05) unless reduced motion, set `Camera.controls.enabled = false`, and attach `pointermove` to the canvas.
  - **Edit-mode-off pointerdown**: existing path (unchanged) — taps eventually flow to bloom-on-tap.
- **`pointermove` during drag**: project pointer onto a horizontal `THREE.Plane(new Vector3(0, 1, 0), -hoverPlaneY)` where `hoverPlaneY = island.plateauTopY + 0.15`. From the intersect point, set the mesh's `group.position.x/z`; recompute `y = island.heightAt(x, z) + liftOffset`. If `Island.isPlaceable(x, z)` is false, tint the sprout's glow ring (or for bloomed objects: add a small red rim mesh / temporary material color shift) and mark `this._drag.valid = false`. Else, restore the normal glow / material and `valid = true`.
- **`pointerup` during drag**:
  - If `valid`, call `state.sprouts.setSproutPosition(id, {x, z})` or `setBloomedPosition(id, {x, z})`. The slice fires `'moved'`, U2's subscriber re-positions cleanly. Drop the lift offset back to ground (`y = island.heightAt(x, z)`).
  - If `invalid`, tween mesh back to `originPos` over ~250ms (or instantaneous under reduced motion), no slice mutation.
  - Restore `Camera.controls.enabled = true`, clear `this._drag = null`, optionally `view.sound?.playOneShot?.('plant')` on commit if a chime sound id exists; otherwise silent.
- **Edge: drag started → student exits edit mode mid-drag**. Treat as cancel — snap back, restore controls, clear drag.

**Patterns to follow:**
- Existing `_handlePointerDown / _handlePointerUp` raycast structure (View/Sprouts.js:242-305). Extend the same two handlers rather than adding a new listener layer.

**Test scenarios:**
- Happy path — In edit mode, pointerdown on a sprout → pointermove to a valid plateau coord → pointerup. After the gesture, `state.sprouts.recent()[0].position` is `{ x, z }` close to the drop point.
- Happy path — Same for a bloomed tree; `state.sprouts.listBloomedTrees().find(...).position` is set.
- Edge case — Drag a sprout off the plateau and release. Mesh snaps back; slice state is unchanged (no `'moved'` event fires).
- Edge case — Drag a sprout while edit mode is off → no drag starts; existing tap-to-bloom path runs.
- Edge case — Drag a ready-to-bloom sprout in edit mode → drag works; bloom is NOT triggered by the drag.
- Edge case — Drag a sprout, then toggle edit mode off mid-drag → drag cancels (snap back), controls re-enabled.
- Edge case — Reduced motion → drag works, lift animation skipped; commit/snap-back still functional.
- Integration — `Camera.controls.enabled` is `false` during the drag and `true` after `pointerup` (cover both commit and snap-back paths).
- Integration — Static decoration (any random Tree.js mesh) does NOT respond to drag (raycast filter is the union of sprout + bloomed hit targets only; assert no false positives).

**Verification:**
- Manual smoke: spawn 2 sprouts, bloom one, enter edit mode, drag both to opposite corners of the plateau. Reload the page. Both render at the moved positions.
- OrbitControls do not rotate while a drag is in flight.

---

- U5. **Polish: visual cue, reduced motion, cancel paths**

**Goal:** Make edit mode look unmistakably different from default mode, ensure reduced-motion users can still drag, and cover the cancel/dispose corner cases.

**Requirements:** R5, R10

**Dependencies:** U3, U4

**Files:**
- Modify: `src/components/IslandProgressionOverlay.tsx` *(banner + first-entry toast)*
- Modify: `src/engine/student-space/Game/View/Sprouts.js` *(badge edit-mode class, dispose cleanup)*
- Modify: `src/engine/student-space/style.css` *(badge .edit-mode visual tweak — keep it tiny)*

**Approach:**
- In `style.css`: add a `.sprouts-badge-layer.edit-mode .sprout-badge { outline: 1px dashed #5C8A3A; }` (or similar minimal cue). No new font, no animation that fights reduced motion.
- In `View/Sprouts.js`: when `_editMode` flips, toggle the `edit-mode` class on `this.badgeLayer`. Also, while in edit mode, suppress the auto-bloom camera flow for `markedReady` events — those events are still received and the badge updates, but the camera fly + auto-bloom does not run while the student is rearranging (returns control to the student to finish arranging before the next bloom). Re-entering default mode resumes normal behavior on the next `markedReady`.
- Banner copy in `IslandProgressionOverlay.tsx`: small pill at the top of the viewport while edit mode is on, "Arranging your island — tap Done when finished."
- One-time toast: on first edit-mode enable per session, show "Drag any of your things to plant them somewhere new."
- Dispose path: ensure `View/Sprouts.js.dispose()` removes the `ss:edit-mode` listener AND resets `Camera.controls.enabled = true` if a drag was in flight (defensive — drag would normally be a no-op after dispose, but a torn-down view that left controls disabled would brick the camera).
- Reduced-motion: U4 already gates the lift animation; add a check here for the banner — it remains visible but the appear/disappear is a hard show/hide rather than a fade.

**Test scenarios:**
- Happy path — Edit mode on → banner visible; edit mode off → banner gone.
- Happy path — First entry to edit mode shows toast; subsequent entries don't.
- Edge case — Reduced motion → banner appears/disappears without transition.
- Edge case — `dispose()` while a drag is mid-flight restores `controls.enabled = true`.
- Edge case — Auto-bloom is suppressed while edit mode is on, then resumes correctly on the next `markedReady` after edit mode is off.

**Verification:**
- Manual smoke: enter edit mode, drag a sprout, verify the banner remains visible throughout and the camera does not auto-fly.
- Toggle a `prefers-reduced-motion` simulation in DevTools and re-run the smoke flow.

---

## System-Wide Impact

- **Interaction graph:** The new `'moved'` event extends the `Sprouts` slice subscriber surface. Any future subscriber should expect it; the engine's own view is the only consumer in v1. The React `IslandProgressionOverlay` does not need to subscribe to `'moved'` (the overlay shows aggregate counts, not per-object position).
- **Error propagation:** Slice mutations are best-effort (silent no-op on bad id / payload), matching every other slice. Drag failures (off-plateau drop) are non-errors — the snap-back is the UX, not an error toast.
- **State lifecycle risks:** The `position` field round-trips through hydrate/serialize. Two specific failure modes to verify:
  - Hydrated `position: { x: NaN, z: 0 }` — should be dropped to `null` by the schema merger so the view falls back to the seed.
  - Concurrent `'moved'` and `'bloomed'` for the same sprout id — bloom removes from `sprouts[]` and pushes to `bloomedTrees[]`; we carry `position` forward into the new bloomed descriptor so the moved sprout's bloomed form materializes at the moved spot, not at the seed.
- **API surface parity:** `setSproutPosition` and `setBloomedPosition` are sibling methods, not a single overloaded one. Keeps each list's mutation pathway distinct for grep-ability.
- **Integration coverage:** U4's test scenarios cover the cross-layer story (overlay click → engine event → drag → slice mutation → view re-position). Unit tests on the slice (U1) prove the data layer; view-layer behavior is verified via U4's integration scenarios.
- **Unchanged invariants:** Bloom-on-tap, bloom CTA, sprout growth from captures, species locking, persistence schema version, and OrbitControls default behavior all stay unchanged outside edit mode. The Sprouts slice's existing event types (`'spawned' / 'grew' / 'markedReady' / 'speciesLocked' / 'bloomed'`) are not modified — `'moved'` is purely additive.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| OrbitControls re-enabling fails after a drag cancel path → camera bricks. | U5 explicitly resets `controls.enabled = true` in dispose; U4's tests cover the cancel path. |
| Bloomed object move loses position on bloom. | U1 carries `position` forward in `bloom()` from sprout → bloomedTree; covered by a U1 test scenario. |
| Touch devices interpret a slow drag as a tap → false-fires bloom-on-tap. | Drag is gated on `_editMode`; tap-on-sprout in default mode is unchanged. The drag-vs-tap threshold (`dx > 4 || dy > 4` at View/Sprouts.js:253) already handles this; we keep it. |
| Reduced-motion users can't tell what's happening during a drag (no lift cue). | The badge edit-mode visual + banner cover it without animation. |
| Two sprouts placed at exactly the same point. | Acceptable — kids can do this on purpose. No collision detection in v1. |
| `sessionStorage` blocked (Safari private) breaks the one-time toast. | Try/catch the read; on failure, just skip the toast (the banner still teaches the feature). |

---

## Documentation / Operational Notes

- No backend changes; no env vars; no CI changes.
- Update the engine's `Sprouts.d.ts` so external TypeScript consumers see the new `position` field and methods. Done in U1.
- The home page route is unchanged.
- This feature is local-only; per-device localStorage. If the student moves devices, they get their seeded layout again (which is fine — that's the current cross-device behavior for everything).

---

## Sources & References

- Live home route: `src/routes/index.tsx`
- Engine substrate rule of thumb: `docs/solutions/2026-05-18-island-progression-engine-substrate.md`
- Sprouts state + view (the surface this plan extends): `src/engine/student-space/Game/State/Sprouts.js`, `src/engine/student-space/Game/View/Sprouts.js`
- Island bounds: `src/engine/student-space/Game/State/Island.js`
- Persistence: `src/engine/student-space/Game/State/Persistence.js`
- Schema: `src/engine/student-space/Game/State/schema.js`
- Overlay: `src/components/IslandProgressionOverlay.tsx`
- Prior plan (sprout progression v1): `docs/plans/2026-05-18-002-feat-island-object-progression-plan.md`
