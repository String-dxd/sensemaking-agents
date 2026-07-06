---
title: Island editor — gate object placement to land (don't drop objects into the sea)
type: fix
status: done
date: 2026-07-06
written_against_commit: b287b765
base_branch: main
initiative: 2026-07-06-004-feat-island-editor-objects-overview.md
---

# Plan: Gate object placement to land cells

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving to the next step. If anything
> in "STOP conditions" occurs, stop and report — do not improvise. This is a small,
> self-contained follow-up to the placeable-objects feature (already merged to `main`),
> found during browser QA. When done, flip `status:` in this frontmatter to `done`.
>
> **Base branch**: `main` (commit `b287b765`) — the objects feature (models + placement
> + panel) and the raise/lower-to-target fix are already merged. Create your branch:
> `git checkout -b fix/island-editor-object-land-gate main`.
>
> **Drift check (run first)**:
> `git diff --stat b287b765..HEAD -- island-editor/src/App.tsx island-editor/src/terrain/gridOps.ts island-editor/test/gridOps.test.ts`
> If any in-scope file changed since `b287b765`, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3 (minor UX polish; in-spec behavior, not a crash) · **Effort**: S · **Risk**: LOW · **Depends on**: none (the objects feature it refines is already on `main`) · **Category**: bug / ux · **Planned at**: `b287b765`, 2026-07-06
- **Executed & merged 2026-07-06** — branch `fix/island-editor-object-land-gate` (commit `dcb3ee58`, base `main`), PR **#81** squash-merged. Advisor-reviewed & APPROVED: exactly the 3 in-scope files, no deps; `isLandTier` + 5 unit tests (ocean floor / land tiers / custom seaLevel / boundary-equals-sea / out-of-range); both `placeObject` and `onPlaceHover` gated via `isLandCell`; gate green (126 tests, tsc clean). Plan was cold-read by a fresh-context agent before execution (no blockers). Browser QA below.

## Why this matters

Browser QA of the objects feature found that a click on a **submerged (ocean) grid cell**
places an object anyway: `placeObject` only checks that the target cell is in-bounds, not
that it's land. The object then renders at that cell's below-sea-level terrain height and
appears as a half-submerged blob floating in the open water beside the island (QA
screenshot `scratchpad/qa/water-artifact.png` from the session that shipped the feature).

This is *within* the placement plan's literal spec (placement was defined as cell-snapped
and sitting on the terrain-top height, with no land-only rule), so it isn't a crash — but
it reads as a bug to a user. Objects should only drop on **land**, and the hover ghost
should disappear over water so the user gets an affordance that the sea isn't placeable.

## Current state (verified at `b287b765`)

### The tier / height model — what "land" means

`island-editor/src/terrain/terrainGrid.ts`:
- `export const MAX_TIER = 4` — tiers are integers `0..4`.
- `export const DEFAULT_TIER_HEIGHTS = [-1.2, 0.12, 1.0, 1.65, 2.3]` — the flat-top world-Y
  of each tier. **Tier 0's top is `-1.2` (the ocean floor, below the sea); tier 1's top is
  `0.12` (just above the sea).**
- `IslandSpec` carries `seaLevel: number` (the seed uses `seaLevel: 0`) and
  `tierHeights: number[]` — both are per-spec, so an imported spec could in principle carry
  a different sea level or heights.
- Helpers present: `cellIndex(grid, c, r)`, `inBounds(grid, c, r)`, `cellCenter(...)`,
  `evaluateHeight(spec, x, z, blurred?)`.

So the correct, robust definition of "land" is: **the target cell's tier top is strictly
above the sea** → `tierHeights[tier] > seaLevel`. Under the defaults that means tier 0 =
water, tiers 1–4 = land. This is preferable to a hardcoded `tier >= 1` (which silently
assumes `seaLevel === 0`) and to `evaluateHeight(...) > seaLevel` (which uses the *blurred*
render height — near the shoreline the blur lifts an ocean cell's sampled height slightly,
so it would misclassify boundary cells; the discrete tier is the honest per-cell signal).

### `island-editor/src/App.tsx` — placement wiring (the code to change)

`placeObject` (lines **193–210**) only bounds-checks the cell:

```ts
const placeObject = useCallback(
  (x: number, z: number) => {
    const kind = placeKindRef.current
    if (!kind) return
    const s = specRef.current
    const { c, r } = worldToCell(s.worldSize, s.grid, x, z)
    if (c < 0 || c >= s.grid.cols || r < 0 || r >= s.grid.rows) return   // ← bounds only, no land check
    const o = makePlacedObject(kind, c, r, Math.random) // runtime jitter is fine here
    applyObjects(addObject(s.objects, o))
    stack.push({
      label: 'Place object',
      do: () => applyObjects(addObject(specRef.current.objects, o)),
      undo: () => applyObjects(removeObject(specRef.current.objects, o.id)),
    })
    bumpStack()
  },
  [applyObjects, stack, bumpStack],
)
```

`onPlaceHover` (lines **228–236**) sets the ghost cell, hiding it only when out of bounds:

```ts
const onPlaceHover = useCallback((x: number, z: number) => {
  const s = specRef.current
  const { c, r } = worldToCell(s.worldSize, s.grid, x, z)
  if (c < 0 || c >= s.grid.cols || r < 0 || r >= s.grid.rows) {
    setGhostCell((prev) => (prev === null ? prev : null))   // hide ghost off-terrain
    return
  }
  setGhostCell((prev) => (prev && prev.c === c && prev.r === r ? prev : { c, r }))
}, [])
```

App.tsx **already imports** (from the merged raise-to-target fix) `cellIndex`, `inBounds`,
`MAX_TIER` from `./terrain/terrainGrid`, and `adjustTierToward, brushCells, setSurface,
setTier` from `./terrain/gridOps`. `PlaceGhost.tsx` already renders nothing when its `cell`
prop is `null` (so making `onPlaceHover` pass `null` over water hides the ghost — no change
to `PlaceGhost.tsx` needed).

### `island-editor/src/terrain/gridOps.ts` — where the pure helper goes

Pure, in-place / predicate helpers, **no three imports** (headless-testable). It already
holds `clampTier`, `brushCells`, `adjustTier`, `adjustTierToward`, `setTier`, `setSurface`,
`fillRect`. Its tests live in `island-editor/test/gridOps.test.ts` (vitest, node env). Add
the new predicate here so the land rule is unit-tested, matching that file's style.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck + tests | `pnpm check:island-editor` (from the **repo root**) | exit 0, all tests pass |
| Dev / manual QA | `pnpm dev:editor` → open the printed `http://localhost:5180` (or next free port) | editor loads |

Baseline test count at `b287b765` is **121**. `pnpm check:island-editor` = `pnpm --filter
island-editor typecheck && pnpm --filter island-editor test`; run it from the repo root.
No `pnpm install` needed if `island-editor/node_modules` exists.

## Scope

**In scope** (the only files you may modify):
- `island-editor/src/terrain/gridOps.ts` — add the pure `isLandTier` predicate.
- `island-editor/src/App.tsx` — add a thin `isLandCell(spec, c, r)` wrapper and apply it in
  `placeObject` (reject a click that isn't land) and `onPlaceHover` (hide the ghost off-land).
- `island-editor/test/gridOps.test.ts` — unit tests for `isLandTier`.

**Out of scope** (do NOT touch, even though they look related):
- `island-editor/src/scene/PlaceGhost.tsx` — it already hides on a `null` cell; no change.
- The spec / serialization / `specIO.validateObjects` — this plan gates *interactive*
  placement only; it does NOT retro-clean water-cell objects in an already-saved spec
  (see Maintenance notes).
- Object **overlap/stacking** rules (placing two objects on one cell) — a separate deferred
  feature in the initiative; do not add it here.
- The tier/height model, the camera, the terraform tools, `package.json`.

## Git workflow

- Branch `fix/island-editor-object-land-gate` from `main`.
- Conventional-commit message, e.g.
  `fix(island-editor): only place objects on land, hide ghost over water`.
- Do NOT push or open a PR unless the operator instructs it.

## Target design

### `gridOps.ts` — pure `isLandTier`

```ts
/** True when tier `t`'s flat top sits strictly above the sea — i.e. the cell is
 *  land, not ocean floor. Under the default heights [-1.2, 0.12, 1.0, 1.65, 2.3]
 *  with seaLevel 0, tier 0 is water and tiers 1..4 are land. Robust to a custom
 *  seaLevel / tierHeights (e.g. an imported spec). An out-of-range tier is water. */
export function isLandTier(tier: number, tierHeights: number[], seaLevel: number): boolean {
  const top = tierHeights[tier]
  return top !== undefined && top > seaLevel
}
```

### `App.tsx` — thin spec-level `isLandCell` + wire it in

Add a module-scope helper function in `App.tsx` at top level — anywhere between the import
block and `export function App()` is fine (App.tsx has no other module-scope helper
functions today, only the `SAVED`/`INITIAL`/`autosave` consts and the `OrbitControlsLike`
type alias; place `isLandCell` just after those, before `export function App()`). Add
`isLandTier` to the existing `./terrain/gridOps` import; `cellIndex`, `inBounds`, and the
`IslandSpec` type are already imported:

```ts
/** A cell is placeable when it is in bounds AND its tier is land (above the sea). */
function isLandCell(spec: IslandSpec, c: number, r: number): boolean {
  const g = spec.grid
  if (!inBounds(g, c, r)) return false
  return isLandTier(g.tiers[cellIndex(g, c, r)], spec.tierHeights, spec.seaLevel)
}
```

- `placeObject`: replace the bounds line
  `if (c < 0 || c >= s.grid.cols || r < 0 || r >= s.grid.rows) return`
  with `if (!isLandCell(s, c, r)) return`. (Everything else in `placeObject` is unchanged —
  a rejected click simply places nothing and pushes no undo command.)
- `onPlaceHover`: replace the bounds branch condition
  `if (c < 0 || c >= s.grid.cols || r < 0 || r >= s.grid.rows) {`
  with `if (!isLandCell(s, c, r)) {` — so the ghost hides over water *and* off-terrain.
  Keep the `setGhostCell((prev) => (prev === null ? prev : null))` body and the
  unchanged-cell bail-out on the land path exactly as they are.

Net effect: hovering the sea (an in-bounds tier-0 cell) or off-terrain hides the ghost;
clicking there places nothing; land behaves exactly as before.

## Steps

### Step 1: `isLandTier` + unit tests
Add `isLandTier` to `gridOps.ts`. In `island-editor/test/gridOps.test.ts`: add `isLandTier`
to the existing `../src/terrain/gridOps` import (line 2, alongside `adjustTier,
adjustTierToward, brushCells, fillRect, setSurface, setTier`) and add `DEFAULT_TIER_HEIGHTS`
to the existing `../src/terrain/terrainGrid` import. Append the new cases as flat `it(...)`
blocks **inside the file's single existing `describe('gridOps', ...)` block** (the file has
no nested per-function `describe`s — match that flat structure), modeled after the
`adjustTierToward` cases:
- tier 0 with default heights, seaLevel 0 → `false` (ocean floor, `-1.2`).
- tier 1 → `true` (`0.12 > 0`); tiers 2, 3, 4 → `true`.
- custom `seaLevel = 0.5`: tier 1 (`0.12`) → `false`, tier 2 (`1.0`) → `true`.
- boundary — a tier whose top *equals* seaLevel (e.g. `isLandTier(0, [0], 0)`) → `false`
  (strictly above).
- out-of-range tier (e.g. `isLandTier(99, DEFAULT_TIER_HEIGHTS, 0)`) → `false` (defensive).

**Verify**: `pnpm check:island-editor` → exit 0; the new `isLandTier` cases pass (test
count rises above the 121 baseline).

### Step 2: wire `isLandCell` into `App.tsx`
Add the `isLandCell` helper, add `isLandTier` to the existing `./terrain/gridOps` import,
and swap the two checks in `placeObject` and `onPlaceHover` as specified above.

**Verify**: `pnpm check:island-editor` → exit 0 (tsc clean — confirms `isLandTier` is
imported and `isLandCell` typechecks). `git diff --name-only main` shows ONLY the three
in-scope files. `git diff main -- island-editor/package.json` is empty.
`grep -c "isLandCell(s, c, r)" island-editor/src/App.tsx` returns exactly `2` (the two call
sites — the definition reads `isLandCell(spec: IslandSpec, …)` so it does not match this
pattern); `grep -n "c < 0 || c >= s.grid.cols" island-editor/src/App.tsx` returns no matches
(the old bounds-only checks are gone).

### Step 3: Manual QA (`pnpm dev:editor`)
Screenshots, or write "NOT RUN":
- [ ] Arm a kind in the left panel. Hover over the **open sea** → the ghost hides (no
      preview). Hover over the **green land** → the ghost shows, snapped to the cell.
- [ ] Click the sea → nothing is placed. Click land → an object drops on the terrain as before.
- [ ] Hover/click the shoreline sand (tier 1, just above water) → allowed (it's land).
- [ ] Terraform a flat area up a tier, then place on it → allowed; lower a cell to water,
      then hover it → ghost hides (the rule is live against the current grid, not a snapshot).
- [ ] Undo/redo still work; no console errors.
Then flip `status:` to `done`.

## Test plan

- `island-editor/test/gridOps.test.ts`: the `isLandTier` cases listed in Step 1 (pure,
  deterministic — no three/WebGL needed), modeled on the existing `adjustTierToward` tests
  in the same file.
- No component test for the App wiring (interaction/visual — covered by Step 3 QA; the
  package has no r3f-component test harness).
- **Verify**: `pnpm check:island-editor` → all pass, including the new `isLandTier` tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check:island-editor` exits 0; new `isLandTier` tests exist and pass.
- [ ] `git diff --name-only main` = only `island-editor/src/terrain/gridOps.ts`,
      `island-editor/src/App.tsx`, `island-editor/test/gridOps.test.ts`.
- [ ] `git diff main -- island-editor/package.json` is empty (no dep changes).
- [ ] `grep -c "isLandCell(s, c, r)" island-editor/src/App.tsx` returns `2` (both call sites: `placeObject` + `onPlaceHover`).
- [ ] `grep -n "c < 0 || c >= s.grid.cols" island-editor/src/App.tsx` → no matches.
- [ ] Step 3 QA reported (run or NOT RUN); frontmatter `status` updated.

## STOP conditions

Stop and report (do not improvise) if:
- `placeObject` / `onPlaceHover` in `App.tsx` don't match the "Current state" excerpts, or
  `gridOps.ts` doesn't hold the pure helpers described (the codebase drifted) — reconcile first.
- After the change, the ghost hides over legitimate **land** the user expects to plant on
  (e.g. tier 1 shoreline) — the land rule is too strict; report before adjusting (do not
  quietly switch to a different signal such as `evaluateHeight`, which the "Current state"
  section explains is the wrong one).
- A verification fails twice after a reasonable in-scope fix attempt.
- The fix appears to need an out-of-scope file (e.g. `PlaceGhost.tsx`, the spec, `package.json`)
  or a new dependency.

## Maintenance notes

- **Single source of the land rule**: `isLandTier` (gridOps) is the one place the "what
  counts as land" decision lives. A future "place on water = dock/buoy" feature relaxes it
  here (or per-kind in `isLandCell`).
- **Interactive gate only**: this rejects new placements on water; it does NOT remove
  water-cell objects already present in a saved/imported spec, and the renderer
  (`PlacedObjects.tsx`) still draws whatever is in `spec.objects`. If a hard invariant is
  ever wanted, enforce land-only in `specIO.validateObjects` on load (out of scope here).
- **Deferred UX**: hiding the ghost over water is the v1 affordance. A "blocked" red-tinted
  ghost over water would be clearer but needs a new `PlaceGhost` state — deferred.
- **Reviewer, scrutinize**: that the land check reads the *live* `specRef.current` grid (so
  terraforming a cell to/from water immediately changes placeability), and that a rejected
  placement pushes NO undo command (no empty entry on the command stack).
- Related deferred initiative items (`2026-07-06-004` overview): object overlap/collision
  rules, move-after-place, density brush — none are touched here.
