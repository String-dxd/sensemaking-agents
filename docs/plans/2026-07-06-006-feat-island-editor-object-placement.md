---
title: Island editor — object placement (v4 spec objects layer + click-to-place / remove + ghost preview)
type: feat
status: done
date: 2026-07-06
written_against_commit: b375cdbb
base_branch: feat/island-editor-object-models (Plan A) — which is on top of the distributed layout / main
initiative: 2026-07-06-004-feat-island-editor-objects-overview.md
plan: B (of A→B→C)
---

# Plan B: Placement — v4 objects layer + click-to-place / remove + ghost preview

> **Executor instructions**: step by step; verify each step; STOP on a STOP condition;
> flip `status` when done.
>
> **Base branch**: Plan A's branch `feat/island-editor-object-models` (or `main` once A
> has merged). **Re-validate Plan A's `buildObjectModel(kind, seed?) => THREE.Group`
> signature and the `ObjectKind`/`OBJECT_KINDS` exports in `terrain/terrainGrid.ts`
> before starting** — this plan imports them. If they differ from the overview's
> contract, reconcile this plan first (STOP).
>
> **Drift check**: `git diff --stat <A-tip>..HEAD -- island-editor/src/terrain/ island-editor/src/App.tsx island-editor/src/scene/IslandTerrain.tsx island-editor/src/editor/specIO.ts`

## Status

- **Priority**: P2 · **Effort**: L · **Risk**: MED (spec version bump + migration; pointer/paint/camera interplay) · **Depends on**: Plan A (`buildObjectModel`, `ObjectKind`). · **Category**: feature · **Planned at**: `b375cdbb`, 2026-07-06
- **Executed 2026-07-06** on branch `feat/island-editor-object-placement` (commit `604a9ff0`, base `feat/island-editor-object-models`/`927b7ff7`). Advisor-reviewed & APPROVED: 10 in-scope files + 5 mechanically-updated existing test files (forced by the `version 3→4` literal bump — verified purely mechanical); no deps; gate green (118 tests). Verified: v3→v4 migration (v3 no longer throws, gets `objects:[]`; v4 validates + range-checks against parsed grid), IslandTerrain precedence camera→place→paint, remove-beats-place via `onPointerDown`+`stopPropagation` gated on placeMode (a justified deviation from the plan's `onClick`, since terrain places on pointer-down), StrictMode-safe undo commands (mutation outside the updater; `push` doesn't auto-`do`), reset/import full-spec-swap flows `objects` through. **Browser QA (on the stack tip `feat/island-editor-model-panel`) PASSED**: gallery renders 5 distinct on-ground models; arm-a-kind + click-to-place works (multiple kinds placed on land, confirmed in perspective + top view); no startup/console errors. **Finding (minor, in-spec):** placing on a submerged/ocean cell drops the object into the water (no land-gate) — captured as follow-up plan `2026-07-06-009-fix-island-editor-object-placement-land-gate.md` (P3). Remove-on-click is code-verified correct but wasn't cleanly re-confirmed in QA (coordinate-clicks couldn't reliably hit the small object). Minor note: temp arming (1–5) had no `inEditable` guard, but there are no text inputs and Plan C removed it. Part of the objects stack.

## Why this matters

Plan A built the models; this makes them placeable. It adds an `objects` layer to the
island spec (**v4**), renders placed objects on the terrain, and gives the click-to-place
/ click-to-remove interaction with a ghost preview — the core "drop trees on your island"
loop. Position is cell-snapped and sits on the terrain height; placement adds a little
yaw + scale jitter for natural variety. Objects serialize/export/import with the island
and are undoable. (The palette UI to *pick* a kind is Plan C; this plan uses a temporary
keyboard arming for its own QA.)

## Current state (verified at `b375cdbb`, + Plan A)

- **Plan A** provides `buildObjectModel(kind: ObjectKind, seed?: number): THREE.Group`
  (`src/models/buildObjectModel.ts`), `mulberry32`/`hashString` (`src/models/rand.ts`),
  and `ObjectKind`/`OBJECT_KINDS` in `terrain/terrainGrid.ts`.
- `terrain/terrainGrid.ts`: `IslandSpec` is **v3** (`{ version:3, worldSize, seaLevel,
  tierHeights, grid }`); `CURRENT_SPEC_VERSION = 3`; `cellCenter(worldSize, grid, c, r)
  → {x,z}`; `worldToCell(...)`; `evaluateHeight(spec, x, z, blurred?)` (top-of-terrain
  world Y). No `objects`.
- `editor/specIO.ts`: `serializeSpec` (JSON, grid via `encodeGrid`); `validateSpecObject`
  accepts `version 1|2|3` and migrates to current (v1/v2 rasterize to grid; v3 passes);
  `deserializeSpec`, `downloadSpec`, `importSpecFromFile`.
- `App.tsx`: spec lives in `specRef` + a `gridTick` bump; `spec = useMemo(() =>
  ({...specRef.current}), [gridTick])`; command stack (`stack.push({do,undo})`);
  `onPaintStart/paint/onPaintEnd` do terraform strokes; `cameraMode` (hold-Space)
  suppresses painting via a prop to `<IslandTerrain>`; keydown effect handles undo/redo
  (and Space). Renders `<IslandTerrain spec brushSize cameraMode onPaintStart onPaint
  onPaintEnd/>`, `<SeaSurface/>`, `<OrbitControls …/>`, plus the hotbar/camera-dock/file-bar.
- `scene/IslandTerrain.tsx`: mesh with `onPointerDown={handleDown}`, `onPointerMove=
  {handleMove}`; `cameraMode` early-returns before paint; `moveCursor(x,z)` drives the
  brush cursor; a window `pointerup` ends strokes.

## Scope

**In scope**:
- `island-editor/src/terrain/terrainGrid.ts` — add `PlacedObject`, `objects` to
  `IslandSpec`, bump `CURRENT_SPEC_VERSION = 4`, add `worldPositionOfObject(spec, o)` helper.
- `island-editor/src/terrain/objectOps.ts` (new, pure) — `addObject`, `removeObject`, `makePlacedObject`.
- `island-editor/src/editor/specIO.ts` — serialize/validate/migrate `objects` (v4).
- `island-editor/src/scene/PlacedObjects.tsx` (new) — render `spec.objects`; per-object click-to-remove.
- `island-editor/src/scene/IslandTerrain.tsx` — add `placeMode`/`onPlaceHover`/`onPlaceClick`.
- `island-editor/src/scene/PlaceGhost.tsx` (new, or inline in App) — the translucent preview.
- `island-editor/src/App.tsx` — `placeKind` state, place/remove handlers + undo commands,
  temporary keyboard arming (1–5, 0/Esc), render `<PlacedObjects>` + the ghost.
- Tests: `island-editor/test/objectOps.test.ts`, extend `test/specIO.test.ts` (v4).

**Out of scope**: the palette panel UI (Plan C), move/multi-select/per-object tint,
agent ops, `package.json`.

## Target design

### Spec v4 (`terrainGrid.ts`)

```ts
export interface PlacedObject { id: string; kind: ObjectKind; c: number; r: number; yaw: number; scale: number }
export interface IslandSpec { version: 4; worldSize: number; seaLevel: number; tierHeights: number[]; grid: TerrainGrid; objects: PlacedObject[] }
export const CURRENT_SPEC_VERSION = 4

/** World transform for a placed object: cell center X/Z, terrain-top Y. */
export function worldPositionOfObject(spec: IslandSpec, o: PlacedObject, blurred?: ArrayLike<number>): { x: number; y: number; z: number } {
  const { x, z } = cellCenter(spec.worldSize, spec.grid, o.c, o.r)
  return { x, y: evaluateHeight(spec, x, z, blurred), z }
}
```
`seedIsland()` (in `terrain/seed.ts`) must now include `objects: []`. **Check
`seed.ts`** — if it builds the spec literally, add `objects: []`; if it spreads a base,
ensure `objects` is present.

### `objectOps.ts` (pure)

```ts
import { hashString } from '../models/rand'    // for a stable-ish id if no crypto
export function makePlacedObject(kind, c, r, rand: () => number): PlacedObject {
  const id = `${kind}-${(rand() * 1e9 | 0).toString(36)}-${(rand() * 1e9 | 0).toString(36)}`
  const yaw = rand() * Math.PI * 2
  const scale = 0.85 + rand() * 0.30           // 0.85..1.15
  return { id, kind, c, r, yaw, scale }
}
export function addObject(objects: PlacedObject[], o: PlacedObject): PlacedObject[] { return [...objects, o] }
export function removeObject(objects: PlacedObject[], id: string): PlacedObject[] { return objects.filter((o) => o.id !== id) }
```
(`rand` is injected so tests are deterministic; App passes `Math.random` at runtime.)

### `specIO.ts` (v4)

- `serializeSpec`: include `objects: spec.objects` (plain array) in the JSON.
- `validateSpecObject`: accept `version` 1|2|3|4. For 1/2/3 (migrated), set `objects: []`.
  For 4: validate `objects` is an array; each entry has string `id`, `kind ∈ OBJECT_KINDS`,
  integer `c` in `[0, cols)`, integer `r` in `[0, rows)`, finite `yaw`, finite `scale > 0`
  — drop/normalize invalid entries with a field-level throw (match the file's existing
  validation style). Always return a spec with `objects` present.

### `IslandTerrain.tsx` — place-mode props

Add `placeMode?: boolean`, `onPlaceHover?: (x,z) => void`, `onPlaceClick?: (x,z) => void`.
When `placeMode`:
- `handleMove` → `onPlaceHover?.(e.point.x, e.point.z)` and hide the brush cursor; NO paint.
- `handleDown` → `e.stopPropagation(); onPlaceClick?.(e.point.x, e.point.z)`; NO paint stroke.
`cameraMode` still wins (checked first): hold-Space over the terrain orbits even in place
mode. Precedence in both handlers: `if (cameraMode) return` → `else if (placeMode) {…}` →
`else {paint…}`.

### `PlacedObjects.tsx`

```tsx
// props: { spec: IslandSpec; placeMode: boolean; onRemove: (id: string) => void }
// blurred = useMemo(() => blurTiers(spec.grid), [spec])
// spec.objects.map(o => {
//   const model = useMemo(() => buildObjectModel(o.kind, hashString(o.id)), [o.kind, o.id])
//   const { x, y, z } = worldPositionOfObject(spec, o, blurred)
//   return <primitive key={o.id} object={model} position={[x, y, z]}
//            rotation={[0, o.yaw, 0]} scale={o.scale * BASE_OBJECT_SCALE}
//            onClick={(e) => { if (!placeMode) return; e.stopPropagation(); onRemove(o.id) }} /> })
```
`BASE_OBJECT_SCALE ≈ 1.0` (models are ~1-unit; tune in QA). Dispose models when removed
(a small wrapper that disposes on unmount, or accept the leak for v1 and note it).
`onClick` removes **only in place mode** (so terraform clicks near a tree don't delete it).

### `App.tsx` — wiring

- State: `const [placeKind, setPlaceKind] = useState<ObjectKind | null>(null)`; `placeMode = placeKind !== null`.
- Ghost: while `placeMode`, track the hovered cell in a ref/state from `onPlaceHover`
  (compute `worldToCell`, clamp to bounds), and render a translucent `buildObjectModel(placeKind)`
  at `worldPositionOfObject` of that cell (opacity ~0.5; traverse the group and set
  `material.transparent = true; material.opacity = 0.5` on a cloned model, OR a simpler
  wireframe/tinted clone). Hide when the cell is out of bounds.
- Place: `onPlaceClick(x,z)` → `worldToCell` → if in bounds, `const o =
  makePlacedObject(placeKind, c, r, Math.random)`; mutate `specRef.current.objects =
  addObject(objects, o)`; `setGridTick(t=>t+1)`; push undo `{ do: () => addById(o), undo:
  () => removeById(o.id) }` (both mutate specRef.objects + tick). 
- Remove: `onRemove(id)` → capture the object first (for undo), `specRef.current.objects =
  removeObject(objects, id)`; tick; push `{ do: removeById(id), undo: addBack(obj) }`.
- Temp arming (QA only; **Plan C replaces this**): in the existing keydown effect (guard
  `inEditable`), keys `1`–`5` → `setPlaceKind(OBJECT_KINDS[n-1])`; `0` or `Escape` →
  `setPlaceKind(null)`. Leave a comment: `// TEMP arming — superseded by the model panel (Plan C)`.
- Render: add `<PlacedObjects spec={spec} placeMode={placeMode} onRemove={removeObj}/>`
  inside the Canvas; pass `placeMode`, `onPlaceHover`, `onPlaceClick` to `<IslandTerrain>`;
  render the ghost. Reset (`reset`) and import already replace `specRef.current`; ensure
  they clear/replace `objects` too (import brings the file's objects; reset → seed's `[]`).

## Steps (each ends green)

1. **Spec v4 + `seed.ts`**: types + `CURRENT_SPEC_VERSION=4` + `worldPositionOfObject`;
   `seedIsland` includes `objects: []`. **Verify** `pnpm check:island-editor` → 0.
2. **`objectOps.ts` + `test/objectOps.test.ts`**: add/remove immutability; `makePlacedObject`
   with an injected deterministic `rand` yields in-range yaw/scale + unique-ish ids.
   **Verify** → 0.
3. **`specIO.ts` v4 + extend `test/specIO.test.ts`**: v4 round-trip preserves `objects`;
   a v3 spec migrates with `objects: []`; an invalid object entry throws; version 5 throws.
   **Verify** → 0.
4. **`IslandTerrain.tsx` place-mode props** (precedence camera → place → paint). **Verify** → 0.
5. **`PlacedObjects.tsx`** render component. **Verify** → 0 (typecheck).
6. **`App.tsx` wiring** + ghost + temp arming. **Verify** → 0; `git diff --name-only <base>`
   shows only in-scope files; `git diff island-editor/package.json` empty.
7. **QA** (`pnpm dev:editor`): press `1` → a fruit-tree ghost follows the cursor snapped to
   cells → click drops a tree sitting on the terrain; place several; `2`–`5` place the
   other kinds; clicking a placed object (in place mode) removes it; `Esc` exits place
   mode and terraform tools work again; hold-Space still orbits while placing; undo/redo
   restores placements and removals; Export→Import round-trips objects; Reset clears them;
   no console errors. Screenshots or NOT RUN. Then flip `status`.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0; `objectOps` + v4 `specIO` tests pass.
- [ ] `git diff --name-only <base>` = only the in-scope files; `package.json` unchanged.
- [ ] `grep -n "version: 4\|CURRENT_SPEC_VERSION = 4" island-editor/src/terrain/terrainGrid.ts` present.
- [ ] A v3 spec deserializes to v4 with `objects: []` (specIO test).
- [ ] Placed objects sit ON the terrain (QA); place/remove are undoable; Export/Import round-trip objects.
- [ ] Step 7 QA reported; frontmatter `status` updated.

## STOP conditions

- Plan A's `buildObjectModel`/`ObjectKind` signature differs from the overview contract — reconcile first.
- r3f event precedence doesn't let a placed-object `onClick` beat the terrain click (remove
  fails) — report; do not add a custom raycaster without saying so.
- The ghost can't be made translucent without artifacts — report (a wireframe ghost is an acceptable fallback; note it).
- New dependency or out-of-scope file needed.

## Maintenance notes

- **Temp keyboard arming (1–5/0/Esc) is replaced by Plan C's panel** — Plan C should remove
  it or keep it as a shortcut; don't leave two arming paths unlabeled.
- **Spec is now v4** — anything reading the spec (engine-binding follow-ups, agent ops)
  must handle `objects`. The migration keeps older files loading.
- **Model disposal**: if `PlacedObjects` leaks GPU memory on heavy place/remove churn,
  add per-object dispose-on-unmount; noted as acceptable for v1.
- **Position keyed by cell (c,r)**; the engine keys by world (x,z). If objects ever bind to
  the engine, convert via `cellCenter`. Documented for the future fork (`2026-06-19-004`).
