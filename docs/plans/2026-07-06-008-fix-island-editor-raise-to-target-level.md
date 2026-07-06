---
title: Island editor — raise/lower to a target level (stop over-raising already-raised neighbors)
type: fix
status: done
date: 2026-07-06
written_against_commit: a29a3cf2
base_branch: main
---

# Plan: Raise/lower to a target level (don't over-raise adjacent already-raised cells)

> **Executor instructions**: Follow step by step; run every verification command and
> confirm the expected result before moving on. Touch only in-scope files. On a STOP
> condition, stop and report. When done, flip `status:` to `done`.
>
> **Base branch**: `main` (commit `a29a3cf2`). This fix only touches the raise/lower
> paint logic + a pure grid helper — it is independent of the unmerged editor branches
> (`feat/island-editor-distributed-layout`, the objects initiative). Those don't touch
> the raise/lower switch, so it rebases cleanly onto them. Create your branch:
> `git checkout -b fix/island-editor-raise-to-target main`.
>
> **Drift check**: `git diff --stat a29a3cf2..HEAD -- island-editor/src/App.tsx island-editor/src/terrain/gridOps.ts`

## Status

- **Priority**: P2 (real terraforming UX bug, user-reported) · **Effort**: S · **Risk**: LOW (small, localized; pure helper is unit-tested) · **Depends on**: none · **Category**: bug / ux · **Planned at**: `a29a3cf2`, 2026-07-06
- **Executed 2026-07-06** on branch `fix/island-editor-raise-to-target` (commit `1b736899`, base `main`/`a29a3cf2`). Advisor-reviewed & APPROVED: diff = exactly the 3 in-scope files; gate green (90 tests, tsc clean); logic verified on edge cases (`2 2 2 | 3` → `3 3 3 | 3`). Browser QA (Step 3) NOT RUN. **Pending merge** to `main` (independent bugfix — mergeable on its own).

## Why this matters

When raising an area, if the brush strays onto an adjacent **already-raised** cell, that
cell gets raised further too — so a sloppy drag over higher ground pushes it even higher,
producing uneven, spiky terrain. Today raise/lower is an unconditional `±1` on every cell
the stroke touches, with no awareness of each cell's current level.

The fix (chosen behavior): a stroke **raises to a target level** = the tier of the cell
you first touched **+ 1** (for raise; `− 1` for lower). Touched cells move one step
*toward* that target but are **never pushed past it** — so a cell already at or above the
target is left alone. You "level an area up one step from where you started," and straying
onto higher ground no longer over-raises it. Lower is symmetric.

Concretely, starting on flat tier-2 and straying onto an already-raised tier-3 cell:
`before: 2 2 2 | 3` → `after: 3 3 3 | 3` (the 3 is left alone; the area levels up to 3).

## Current state (verified at `a29a3cf2`)

### `island-editor/src/terrain/gridOps.ts`

Pure, in-place mutators (no three imports). Relevant:

```ts
import { cellIndex, inBounds, MAX_TIER, SURFACE_AUTO, SURFACE_PATH, type TerrainGrid } from './terrainGrid'
function clampTier(t: number): number { return t < 0 ? 0 : t > MAX_TIER ? MAX_TIER : t }
// brushCells(grid, centerC, centerR, size): number[]  — in-bounds size×size block indices
/** tier += delta, clamped to 0..MAX_TIER, for each listed cell. */
export function adjustTier(grid: TerrainGrid, cells: number[], delta: number): void {
  for (const i of cells) grid.tiers[i] = clampTier(grid.tiers[i] + delta)
}
export function setTier(grid: TerrainGrid, cells: number[], tier: number): void { /* clamped set */ }
```

### `island-editor/src/App.tsx` — the stroke lifecycle + `paint`

`onPaintStart` resets the per-stroke refs (`strokeBefore`, `visited`, `lastCell`).
`paint(x,z)` computes the cursor cell, interpolates a `cellLine` from the last sample,
unions `brushCells` (deduped by `visited`), then applies the tool:

```tsx
const onPaintStart = useCallback(() => {
  setOrbitEnabled(false)
  const grid = specRef.current.grid
  strokeBefore.current = { tiers: grid.tiers.slice(), surface: grid.surface.slice() }
  visited.current.clear()
  lastCell.current = null
}, [])

const paint = useCallback((x: number, z: number) => {
  const s = specRef.current
  const grid = s.grid
  const { c, r } = worldToCell(s.worldSize, grid, x, z)
  const last = lastCell.current
  const path = last ? cellLine(last.c, last.r, c, r) : [{ c, r }]
  lastCell.current = { c, r }
  const cellSet = new Set<number>()
  for (const p of path) {
    for (const i of brushCells(grid, p.c, p.r, brushSizeRef.current)) {
      if (!visited.current.has(i)) cellSet.add(i)
    }
  }
  const cells = [...cellSet]
  if (cells.length === 0) return
  for (const i of cells) visited.current.add(i)
  switch (toolRef.current) {
    case 'raise': adjustTier(grid, cells, +1); break     // ← unconditional +1 (the bug)
    case 'lower': adjustTier(grid, cells, -1); break      // ← unconditional -1
    case 'water': setTier(grid, cells, 0); break
    case 'path':  setSurface(grid, cells, SURFACE_PATH); break
    case 'erase': setSurface(grid, cells, SURFACE_AUTO); break
  }
  setGridTick((t) => t + 1)
}, [])
```

Imports at top include `{ adjustTier, brushCells, setSurface, setTier } from './terrain/gridOps'`
and `{ cellLine, …, worldToCell } from './terrain/terrainGrid'`, plus `cellIndex`? (No —
`cellIndex` is NOT currently imported into App.tsx; the fix needs it — add it.)

Refs are declared near `strokeBefore`/`visited`/`lastCell`.

## Scope

**In scope**:
- `island-editor/src/terrain/gridOps.ts` — add `adjustTierToward(grid, cells, delta, target)`.
- `island-editor/src/App.tsx` — add a `strokeTarget` ref; capture the target on the first
  cell of a stroke; use `adjustTierToward` for `raise`/`lower`. (water/path/erase unchanged.)
- `island-editor/test/gridOps.test.ts` — add cases for `adjustTierToward`.

**Out of scope**: water/path/erase behavior; the brush/cursor; the camera/objects work;
any spec/serialization change; `package.json`.

## Git workflow
Branch `fix/island-editor-raise-to-target` from `main`; one commit
(`fix(island-editor): raise/lower to a target level, not unconditional ±1`); no push/PR.

## Target design

### `gridOps.ts` — `adjustTierToward`

```ts
/** Move each listed cell's tier one step (delta = +1 or -1) TOWARD `target`, but
 *  never past it: a raise (delta > 0) only lifts cells currently below `target`; a
 *  lower (delta < 0) only drops cells currently above `target`. Cells already at or
 *  beyond `target` are left unchanged. `target` should be pre-clamped by the caller.
 *  In place; clamped to 0..MAX_TIER. */
export function adjustTierToward(grid: TerrainGrid, cells: number[], delta: number, target: number): void {
  for (const i of cells) {
    const t = grid.tiers[i]
    if (delta > 0 && t < target) grid.tiers[i] = clampTier(t + 1)
    else if (delta < 0 && t > target) grid.tiers[i] = clampTier(t - 1)
  }
}
```
(Keep `adjustTier` — it's still used by the agent op-runner/CLI. Add the new function; don't remove the old.)

### `App.tsx` — capture the stroke target, use `adjustTierToward`

- Add a ref by the others: `const strokeTarget = useRef<number | null>(null)`.
- In `onPaintStart`, reset it: `strokeTarget.current = null`.
- In `paint`, after computing `cells` (and before the `switch`), capture the target once
  per stroke from the tier of the cursor's starting cell:
  ```ts
  if (strokeTarget.current === null) {
    // tier under the cursor at stroke start; fall back to the first brush cell if the
    // exact cursor cell is out of bounds.
    const centerIdx = inBounds(grid, c, r) ? cellIndex(grid, c, r) : cells[0]
    const startTier = grid.tiers[centerIdx]
    const dir = toolRef.current === 'lower' ? -1 : 1
    strokeTarget.current = clampTierValue(startTier + dir) // see note
  }
  ```
  - Import `cellIndex` and `inBounds` from `./terrain/terrainGrid` (add to the existing
    import). For the clamp, either import a small clamp or inline
    `Math.max(0, Math.min(MAX_TIER, startTier + dir))` (import `MAX_TIER` from
    `./terrain/terrainGrid`). Don't reach into gridOps' private `clampTier`.
- Change the switch arms:
  ```ts
  case 'raise': adjustTierToward(grid, cells, +1, strokeTarget.current); break
  case 'lower': adjustTierToward(grid, cells, -1, strokeTarget.current); break
  ```
  Import `adjustTierToward` from `./terrain/gridOps`. Leave `water`/`path`/`erase` as-is.

Note: the target is captured on the FIRST `paint` of the stroke (when `strokeTarget.current`
is null), so it reflects "where you started," matching the chosen behavior. `onPaintStart`
must reset it to null so each new stroke re-captures.

## Steps

### Step 1: `adjustTierToward` + tests
Add the helper to `gridOps.ts`. Add to `test/gridOps.test.ts` (model after the existing
`adjustTier` cases):
- raise toward target 3: a cell at 2 → 3; a cell already at 3 → 3 (unchanged); a cell at 4
  → 4 (unchanged, not lowered); a cell at 0 → 1 (one step toward, not jumped to 3).
- lower toward target 1: a cell at 3 → 2; a cell at 1 → 1 (unchanged); a cell at 0 → 0
  (unchanged, not raised).
- MAX_TIER clamp still holds (target never exceeds MAX_TIER given a clamped caller).
**Verify**: `pnpm check:island-editor` → exit 0, new tests pass.

### Step 2: wire into `App.tsx`
Add the ref + reset + first-cell target capture + swap the raise/lower switch arms + the
new imports (`adjustTierToward`, `cellIndex`, `inBounds`, `MAX_TIER`).
**Verify**: `pnpm check:island-editor` → exit 0. `git diff --name-only main` shows only
`gridOps.ts`, `App.tsx`, `test/gridOps.test.ts`. `git diff island-editor/package.json` empty.

### Step 3: QA (`pnpm dev:editor`)
Screenshots or NOT RUN:
- [ ] Raise a flat area up one tier; drag so the brush strays onto an adjacent
      already-raised (higher) cell → that higher cell is NOT raised further.
- [ ] Raising a lower area still lifts it one step toward the target per stroke.
- [ ] A second raise stroke starting on the now-raised area lifts it another step
      (target re-captured per stroke).
- [ ] Lower behaves symmetrically (straying onto an already-lower cell doesn't dig it deeper).
- [ ] Water/path/erase unchanged; undo/redo restores strokes; no console errors.
Then flip `status`.

## Test plan
- `test/gridOps.test.ts`: the `adjustTierToward` cases above (pure, deterministic).
- Interaction verified in Step 3 (no component-test infra in this package).
- Expected: `pnpm check:island-editor` green with the new gridOps cases.

## Done criteria
- [ ] `pnpm check:island-editor` exits 0; `adjustTierToward` tests pass.
- [ ] `git diff --name-only main` = only `gridOps.ts`, `App.tsx`, `test/gridOps.test.ts`.
- [ ] `grep -n "adjustTierToward" island-editor/src/App.tsx` shows it used for raise AND lower.
- [ ] `grep -n "adjustTier(grid, cells, +1)\|adjustTier(grid, cells, -1)" island-editor/src/App.tsx` → no matches (old unconditional calls replaced).
- [ ] Step 3 QA reported; frontmatter `status` updated.

## STOP conditions
- `paint`/`gridOps` don't match the "Current state" excerpts (drift) — reconcile first.
- Capturing the target from the first cell interacts badly with the `cellLine`
  interpolation (e.g. the first `paint` call already spans many cells at different tiers so
  "start tier" is ambiguous) — if the behavior feels wrong in QA, report; a reasonable
  alternative is to capture the target from the cursor cell in `handleDown` before any
  interpolation, but do not change interpolation itself.
- New dependency or out-of-scope file needed.

## Maintenance notes
- `adjustTier` (unconditional) stays for the agent op-runner (`agent/applyOps.ts`
  `adjustRect`) — that's a deliberate rect fill, not a level-aware stroke. Only the
  interactive raise/lower strokes use `adjustTierToward`.
- If a future "flatten to a chosen level" tool is added, it would `setTier` to an explicit
  target rather than step toward one — different helper.
- The target is per-stroke (captured on first cell). If strokes are ever batched or
  replayed (agent ops), pass the target explicitly rather than relying on stroke state.
