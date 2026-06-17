---
title: Island editor — coastline add/insert/delete points + numeric point & world-size entry
type: feat
status: proposed
date: 2026-06-17
written_against_commit: b6dc287d
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 004
---

# Plan 004: Let the coastline grow/shrink and accept precise numeric input

> **Executor instructions**: Follow steps in order. Step 1 is pure and unit-tested — get it green
> before touching the UI. Run every verification command. If a STOP condition occurs, stop and report.
> When done, update this plan's row in
> `docs/plans/2026-06-17-000-island-editor-improvements-overview.md`.
>
> **Drift check (run first)**:
> `git diff --stat b6dc287d..HEAD -- island-editor/src/App.tsx island-editor/src/ui/ToolPanel.tsx island-editor/src/ui/panel.css island-editor/src/scene/CoastlineHandles.tsx island-editor/src/terrain/islandSpec.ts`
> If any changed, compare the "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2 (raises the editor's expressive ceiling; the pure ops also seed plan 001)
- **Effort**: L
- **Risk**: LOW (Step 1 pure; UI steps are additive and don't alter existing drag/sculpt paths)
- **Depends on**: none. Synergistic with 003 (more points → 003's drag perf matters more).
- **Category**: feature / editability
- **Planned at**: commit `b6dc287d`, 2026-06-17

## Why this matters

The coastline is locked at the 24 seeded control points: you can drag them but cannot add detail (carve
a bay), simplify, or place a point at an exact coordinate — every edit is imprecise mouse-dragging, and
world size is uneditable. This caps what the "shape editor" can express. Adding insert/delete plus
numeric entry lifts that ceiling. Crucially, the mutations are written as **pure, immutable helper
functions** (`coastlineOps.ts`) — the same operations plan 001's agent-editing design names as the
coastline op vocabulary, so this work doubles as the foundation for agent edits.

## Current state

- `island-editor/src/terrain/islandSpec.ts` — `Vec2` is `{ x: number; z: number }` (line 6). The
  coastline is `Vec2[]` of control points sampled by `sampleCoastline` (line 44). `deserializeSpec`
  (in `exportSpec.ts`) **requires `coastline.length >= 3`** — deletion must respect this.
- `island-editor/src/App.tsx`:
  - State: `const [coastline, setCoastline] = useState<Vec2[]>(INITIAL.coastline)` (32);
    `worldSize` is **not** state — the spec memo hardcodes `worldSize: INITIAL.worldSize` (55) and the
    brush reads `INITIAL.worldSize` (`paint`, 115).
  - `movePoint(index, next)` (73) → `setCoastline((pts) => pts.map((p,i)=> i===index ? next : p))`.
  - Undo command pattern (the template to copy) — drag records one command via a `before` ref
    (78–99): `stack.push({ label, do: () => setCoastline(after), undo: () => setCoastline(before) })`
    then `bumpStack()`. `specRef.current` (65) always holds the latest spec for reading `after`.
  - `reset` (162) and `onImportFile` (179) call `setCoastline(...)` + `setProfile(...)` +
    `stack.clear()`; they must also reset any new selection state.
  - `<CoastlineHandles points={coastline} seaLevel={...} onChange={movePoint} onDragChange={onDragChange} />`
    (227), rendered only when `mode === 'shape'`.
- `island-editor/src/scene/CoastlineHandles.tsx` — `Handle` (39) starts a drag on `pointerdown` (82);
  color logic at 88–90 keys off `dragging`/`hovered`. No selection concept.
- `island-editor/src/ui/ToolPanel.tsx` — shape mode renders the `PROFILE_FIELDS` sliders (71–88) and a
  hint; `EditMode = 'shape' | 'sculpt'`. Scene actions (Top view / Export / Import / Reset) at 133–147.
- `island-editor/src/ui/panel.css` — `.tool-panel__row` is `grid-template-columns: 92px 1fr 40px`;
  `.tool-panel__section`, `.tool-panel__hint`, `.tool-panel__actions` (grid 2col), `.tool-panel button`
  styles. Accent color `#ff7b54`.

Repo convention: strict TS (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).
Match the existing immutable-update style (`setState(prev => ...)`, no mutation of arrays in state).

## Commands you will need

| Purpose | Command (run from repo root) | Expected |
|---|---|---|
| Typecheck | `pnpm --dir island-editor typecheck` | exit 0 |
| Tests | `pnpm --dir island-editor test` | all pass (+ new `coastlineOps` cases) |
| Manual | `pnpm --dir island-editor dev` → http://localhost:5180 | see Test plan |

## Scope

**In scope** (modify/create):
- `island-editor/src/terrain/coastlineOps.ts` (create — pure ops)
- `island-editor/test/coastlineOps.test.ts` (create — unit tests)
- `island-editor/src/App.tsx` (selection state, command-wrapped insert/delete/numeric, world-size state)
- `island-editor/src/scene/CoastlineHandles.tsx` (select-on-grab + selected highlight)
- `island-editor/src/ui/ToolPanel.tsx` (numeric point inputs, insert/delete buttons, world-size input)
- `island-editor/src/ui/panel.css` (styles for the new inputs/buttons)

**Out of scope** (do NOT touch):
- The drag mechanics in `CoastlineHandles` (window listeners / raycast) — only add selection on top.
- `sampleCoastline` / terrain math — coastline stays a `Vec2[]`; do not change how it's sampled.
- The sculpt/relief path.
- Coastline self-intersection prevention — out of scope (note it as a known limitation; plan 001 tracks it).

## Git workflow

- Branch: `advisor/004-island-editor-coastline-editing`.
- Commit per step; conventional commits (e.g. `feat(island-editor): pure coastline ops`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pure coastline operations + tests (the agent-reusable core)

Create `island-editor/src/terrain/coastlineOps.ts`:

```ts
import type { Vec2 } from './islandSpec'

/** Insert a midpoint on the edge points[index] → points[(index+1) % n]. Returns a NEW array. */
export function insertPointAfter(points: Vec2[], index: number): Vec2[] {
  const n = points.length
  if (n === 0) return points.slice()
  const i = ((index % n) + n) % n
  const a = points[i]
  const b = points[(i + 1) % n]
  const out = points.slice()
  out.splice(i + 1, 0, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })
  return out
}

/** Remove the point at index. No-op (returns a copy) if it would drop below 3 points. */
export function deletePoint(points: Vec2[], index: number): Vec2[] {
  if (points.length <= 3) return points.slice()
  const n = points.length
  const i = ((index % n) + n) % n
  const out = points.slice()
  out.splice(i, 1)
  return out
}

/** Move the point at index to next. Returns a NEW array; other points are reused. */
export function movePointTo(points: Vec2[], index: number, next: Vec2): Vec2[] {
  return points.map((p, i) => (i === index ? { x: next.x, z: next.z } : p))
}
```

Create `island-editor/test/coastlineOps.test.ts` (pattern: `test/brush.test.ts`). Cover:
- `insertPointAfter` increases length by 1 and the new point is the edge midpoint.
- `insertPointAfter` wraps: index `n-1` inserts between the last and first points.
- `deletePoint` decreases length by 1 when length > 3.
- `deletePoint` is a no-op at exactly 3 points (length stays 3; returns a new array, not the same ref).
- `movePointTo` changes only the target point and returns a new array reference.

**Verify**: `pnpm --dir island-editor test` → all pass incl. new cases; `pnpm --dir island-editor typecheck` → exit 0.

### Step 2: Point selection + numeric x/z inputs + insert/delete in the UI

**App.tsx** — add selection and command-wrapped structural edits (copy the existing drag-command shape):
- `const [selectedPoint, setSelectedPoint] = useState<number | null>(null)`
- Import `{ insertPointAfter, deletePoint, movePointTo }` from `./terrain/coastlineOps`.
- `insertAfterSelected`:
  ```ts
  const insertAfterSelected = useCallback(() => {
    const at = selectedPoint ?? coastline.length - 1
    const before = specRef.current.coastline
    const after = insertPointAfter(before, at)
    setCoastline(after)
    setSelectedPoint(at + 1)
    stack.push({ label: 'Insert point', do: () => setCoastline(after), undo: () => setCoastline(before) })
    bumpStack()
  }, [selectedPoint, coastline.length, stack, bumpStack])
  ```
- `deleteSelected`:
  ```ts
  const deleteSelected = useCallback(() => {
    if (selectedPoint === null) return
    const before = specRef.current.coastline
    const after = deletePoint(before, selectedPoint)
    if (after.length === before.length) return // min-3 guard hit
    setCoastline(after)
    setSelectedPoint(null)
    stack.push({ label: 'Delete point', do: () => setCoastline(after), undo: () => setCoastline(before) })
    bumpStack()
  }, [selectedPoint, stack, bumpStack])
  ```
- Numeric edit session (one undo entry per focus→blur, mirroring `dragBefore`):
  ```ts
  const numericBefore = useRef<Vec2[] | null>(null)
  const onPointFieldFocus = useCallback(() => { numericBefore.current = specRef.current.coastline }, [])
  const onPointFieldChange = useCallback((index: number, next: Vec2) => {
    setCoastline((pts) => movePointTo(pts, index, next))
  }, [])
  const onPointFieldBlur = useCallback(() => {
    const before = numericBefore.current
    numericBefore.current = null
    if (!before) return
    const after = specRef.current.coastline
    if (after === before) return
    stack.push({ label: 'Edit point', do: () => setCoastline(after), undo: () => setCoastline(before) })
    bumpStack()
  }, [stack, bumpStack])
  ```
- In `reset` and `onImportFile`, add `setSelectedPoint(null)`.
- Pass new props to `CoastlineHandles` and `ToolPanel` (below).

**CoastlineHandles.tsx** — add selection (grabbing a handle selects it):
- Props: add `selectedIndex: number | null` and `onSelect: (index: number) => void`.
- In `Handle`, accept `selected: boolean`. On `pointerdown` (line ~82) call `onSelect(index)` *before*
  `setDragging(true)`.
- Update the color/scale: `const active = hovered || dragging || selected`; color expression →
  `dragging ? '#ffd166' : selected ? '#ffd166' : hovered ? '#ffe39a' : '#ff7b54'`.
- In the list (`CoastlineHandles`), pass `selected={i === selectedIndex}` and `onSelect` to each `Handle`.

**ToolPanel.tsx** — add a "Coastline" section in shape mode (after the height-profile fields). New props:
`selectedPoint: number | null`, `selectedPos: Vec2 | null`, `canDelete: boolean`,
`onPointFieldFocus: () => void`, `onPointFieldChange: (next: Vec2) => void`, `onPointFieldBlur: () => void`,
`onInsertAfter: () => void`, `onDeleteSelected: () => void`. (App passes
`selectedPos={selectedPoint===null ? null : coastline[selectedPoint] ?? null}`, `canDelete={coastline.length > 3}`,
and wraps `onPointFieldChange` to inject the index: `(next) => onPointFieldChange(selectedPoint!, next)`.)

Render:
```tsx
<div className="tool-panel__section">Coastline</div>
{selectedPos ? (
  <>
    <div className="tool-panel__coords">
      <label>x
        <input type="number" step={0.1} value={selectedPos.x.toFixed(2)}
          onFocus={onPointFieldFocus} onBlur={onPointFieldBlur}
          onChange={(e) => onPointFieldChange({ x: Number(e.target.value), z: selectedPos.z })} />
      </label>
      <label>z
        <input type="number" step={0.1} value={selectedPos.z.toFixed(2)}
          onFocus={onPointFieldFocus} onBlur={onPointFieldBlur}
          onChange={(e) => onPointFieldChange({ x: selectedPos.x, z: Number(e.target.value) })} />
      </label>
    </div>
    <div className="tool-panel__pointbtns">
      <button type="button" onClick={onInsertAfter}>Insert after</button>
      <button type="button" disabled={!canDelete} onClick={onDeleteSelected}>Delete</button>
    </div>
  </>
) : (
  <div className="tool-panel__hint">Click a handle to select a point, then edit or insert/delete it.</div>
)}
```

**panel.css** — add (match the existing dark style / `#ff7b54` accent):
```css
.tool-panel__coords { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 4px 0; }
.tool-panel__coords label { display: grid; grid-template-columns: 14px 1fr; align-items: center; gap: 6px; opacity: 0.85; }
.tool-panel input[type='number'] {
  width: 100%; box-sizing: border-box; appearance: textfield;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  color: #e7ecf6; border-radius: 6px; padding: 4px 6px; font: inherit; font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.tool-panel__pointbtns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }
```

**Verify**: `pnpm --dir island-editor typecheck` → exit 0; `pnpm --dir island-editor test` → all pass.

### Step 3: Editable world size

**App.tsx**:
- `const [worldSize, setWorldSize] = useState<number>(INITIAL.worldSize)`.
- In the `spec` memo (55) use `worldSize` instead of `INITIAL.worldSize`, and add `worldSize` to the
  memo deps.
- The brush reads world size in `paint` (115); add a ref so the `[]`-dep callback isn't stale:
  `const worldSizeRef = useRef(worldSize); worldSizeRef.current = worldSize;` and in `paint` call
  `applyBrush(reliefRef.current, worldSizeRef.current, x, z, brushRef.current)`.
- In `reset` set `setWorldSize(fresh.worldSize)`; in `onImportFile` set `setWorldSize(imported.worldSize)`.
- Pass `worldSize` + `onWorldSizeChange={(v) => setWorldSize(v)}` to `ToolPanel`.

**ToolPanel.tsx** — in the Scene section add a world-size number input (a plain row; world-size changes
are **not** undoable — see maintenance notes):
```tsx
<label className="tool-panel__row">
  <span className="tool-panel__label">World size</span>
  <input type="number" min={8} max={64} step={1} value={worldSize}
    onChange={(e) => onWorldSizeChange(Number(e.target.value))} />
  <span className="tool-panel__value">{worldSize.toFixed(0)}</span>
</label>
```

**Verify**: `pnpm --dir island-editor typecheck` → exit 0; `pnpm --dir island-editor test` → all pass.

## Test plan

- Automated (Step 1): `test/coastlineOps.test.ts` covers insert (midpoint + wrap), delete (+ min-3
  guard), and move purity. Pattern: `test/brush.test.ts`.
- Manual (`pnpm --dir island-editor dev`, **Shape** tab):
  1. Click a handle → it highlights and the Coastline section shows its x/z. Type a new x → the handle
     moves to it. Blur, then ⌘Z → it returns (one undo step per field edit session).
  2. "Insert after" → a new handle appears mid-edge and becomes selected; ⌘Z removes it.
  3. Select a point → "Delete" removes it; keep deleting → at 3 points "Delete" is disabled.
  4. Change "World size" → the world/grid rescales and terrain rebuilds (note: relief reinterprets — a
     known dev-tool quirk).
  5. Export then Import the file → shape (incl. added/removed points and world size) round-trips.

## Done criteria

ALL must hold:

- [ ] `coastlineOps.ts` exists with `insertPointAfter`/`deletePoint`/`movePointTo`, all pure/immutable.
- [ ] `pnpm --dir island-editor test` exits 0 with `coastlineOps.test.ts` present and passing.
- [ ] `pnpm --dir island-editor typecheck` exits 0.
- [ ] Manual: select/edit/insert/delete work; delete is blocked at 3 points; undo/redo restores shapes;
      world size edits and round-trips through export/import.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Overview status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- Deleting can drop the coastline below 3 points (breaks `deserializeSpec`'s `>= 3` invariant) — the
  `deletePoint` guard + the `canDelete` button state must both hold.
- Wiring selection breaks the existing handle **drag** (dragging must still move points) — selection is
  additive; if it conflicts, STOP rather than rewriting the drag listeners.
- The drift check shows `App.tsx`/`CoastlineHandles.tsx` already grew selection/insert/delete.

## Maintenance notes

- `coastlineOps.ts` is intentionally the seed of plan 001's agent op vocabulary — keep these signatures
  stable; the agent runner should import them rather than re-implement.
- World-size changes are deliberately **not** undoable (rare, dev-tool) and reinterpret the relief grid
  over new bounds. If that becomes confusing, either wrap it in a command or clear relief on resize —
  call it out in review.
- Self-intersecting coastlines are not prevented; `isInsidePolygon` will behave oddly. Acceptable for a
  dev tool; plan 001 tracks whether to add a guard.
- Reviewer should scrutinize: undo fidelity across insert/delete/numeric/drag interleaving, and that
  `selectedPoint` is cleared/clamped on delete, reset, and import (never points past the array end).
