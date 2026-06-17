---
title: Island editor — fix per-frame full-field rebuild during coastline drag
type: perf
status: proposed
date: 2026-06-17
written_against_commit: b6dc287d
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 003
---

# Plan 003: Keep coastline dragging smooth (stop rebuilding the full terrain every pointer-move)

> **Executor instructions**: Follow each step in order; run every verification command and confirm the
> expected result. This plan changes a hot render path — if a STOP condition occurs, stop and report.
> When done, update this plan's row in
> `docs/plans/2026-06-17-000-island-editor-improvements-overview.md`.
>
> **Drift check (run first)**:
> `git diff --stat b6dc287d..HEAD -- island-editor/src/App.tsx island-editor/src/scene/Terrain.tsx island-editor/src/scene/CoastlineHandles.tsx island-editor/src/terrain/buildTerrainGeometry.ts`
> If any changed, compare the "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2 (felt improvement; becomes urgent once plan 004 adds more coastline points)
- **Effort**: M
- **Risk**: MED — touches the terrain render path; a wrong move makes dragging worse or the mesh stale
- **Depends on**: none. Pairs with 004 (more points → heavier rebuilds → this matters more).
- **Category**: perf
- **Planned at**: commit `b6dc287d`, 2026-06-17

## Why this matters

Dragging a coastline handle rebuilds the **entire** terrain field on every pointer-move. Each rebuild
runs point-in-polygon + distance-to-coast for all `(80+1)² = 6,561` vertices against the
`24×12 = 288`-point sampled coastline — roughly **1.9M segment tests per frame** — then reallocates the
geometry buffers and recomputes vertex normals. At today's 24 points / 80 segments it is borderline;
plan 004 (add/insert points) and any detail increase push it into visible lag. Two contained changes
keep dragging smooth: drop the mesh resolution *only while dragging* (restored crisp on release), and
coalesce rapid pointer-moves to one update per animation frame.

## Current state

- `island-editor/src/scene/Terrain.tsx`:
  ```ts
  export function Terrain({ spec, segments = 80, sculptActive = false, ... }: TerrainProps) {
    const field = useMemo(
      () => buildBaseField(spec, segments),
      [spec.coastline, spec.heightProfile, spec.worldSize, segments],   // ← rebuilds on every new coastline
    )
    const geometry = useMemo(() => composeGeometry(field, spec), [field])  // ← reallocates buffers on every rebuild
    useEffect(() => { updateGeometry(geometry, field, spec) }, [geometry, field, spec])
    useEffect(() => () => geometry.dispose(), [geometry])
    // ...
  }
  ```
  `Terrain` is rendered in `App.tsx:220` **without** a `segments` prop (uses the default `80`).
- `island-editor/src/terrain/buildTerrainGeometry.ts:33` — `buildBaseField(spec, segments)` is the
  expensive nested loop (`n = segments + 1`; for each of `n²` vertices: `isInsidePolygon` +
  `distanceToPolygon` over the sampled coastline). It has **no test**.
- `island-editor/src/scene/CoastlineHandles.tsx:48-70` — while dragging, a window `pointermove`
  listener raycasts and calls `onChange(index, {x, z})` **synchronously on every event** (pointer-moves
  can fire several times per frame):
  ```ts
  const move = (ev: PointerEvent) => {
    const r = gl.domElement.getBoundingClientRect()
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    if (raycaster.ray.intersectPlane(plane, hit)) onChange(index, { x: hit.x, z: hit.z })
  }
  const up = () => setDragging(false)
  ```
- `island-editor/src/App.tsx`:
  - `movePoint` (73) → `setCoastline((pts) => pts.map(...))` (a new array each call → new `spec` → field rebuild).
  - `onDragChange(dragging)` (79–99) toggles `setOrbitEnabled(!dragging)` and records the undo command
    by reading `specRef.current.coastline` for `before`/`after`. **Preserve this contract** — the
    command's `after` must reflect the final dragged position.

Sculpt/paint is unaffected by coastline detail: `field`'s `useMemo` deps do **not** include relief, so
brush strokes never rebuild the field. Do not change resolution during painting.

## Commands you will need

| Purpose | Command (run from repo root) | Expected |
|---|---|---|
| Typecheck | `pnpm --dir island-editor typecheck` | exit 0 |
| Tests | `pnpm --dir island-editor test` | all pass (44+ after Step 1) |
| Manual feel-check | `pnpm --dir island-editor dev` then open http://localhost:5180 | see Test plan |

## Scope

**In scope**:
- `island-editor/src/App.tsx` (add a `coastlineDragging` flag; pass `segments` to `Terrain`)
- `island-editor/src/scene/CoastlineHandles.tsx` (coalesce intermediate moves to rAF — Step 2)
- `island-editor/test/buildTerrainGeometry.test.ts` (create — Step 1)

**Out of scope** (do NOT touch):
- `buildTerrainGeometry.ts` math — only *call* it with a smaller `segments`; don't change the algorithm.
- The sculpt/paint path (`onPaintStart/onPaint/onPaintEnd`, `brush.ts`) — resolution reduction must
  NOT apply while painting.
- The undo-command recording in `onDragChange` — its `before`/`after` semantics must stay correct.

## Git workflow

- Branch: `advisor/003-island-editor-coastline-drag-perf`.
- Commit style: conventional commits (e.g. `perf(island-editor): reduce terrain detail while dragging`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Reduce mesh resolution only while a coastline drag is active

In `App.tsx`:
1. Add interaction state: `const [coastlineDragging, setCoastlineDragging] = useState(false)`.
2. In `onDragChange`, set it alongside the existing `setOrbitEnabled`:
   - on `dragging === true`: `setCoastlineDragging(true)`
   - on `dragging === false` (the branch that records the command): `setCoastlineDragging(false)`
   Keep all existing command-recording logic unchanged.
3. Define module constants near the top of the file:
   `const FULL_SEGMENTS = 80` and `const DRAG_SEGMENTS = 32`.
4. Pass `segments` to `Terrain`:
   ```tsx
   <Terrain
     spec={spec}
     segments={coastlineDragging ? DRAG_SEGMENTS : FULL_SEGMENTS}
     sculptActive={mode === 'sculpt'}
     onPaintStart={onPaintStart}
     onPaint={paint}
     onPaintEnd={onPaintEnd}
   />
   ```
   On drag start the field rebuilds once at 32; every drag frame is then ~6× cheaper
   (`(33/81)² ≈ 0.17`); on release it rebuilds once at 80 (crisp final mesh).

Add `island-editor/test/buildTerrainGeometry.test.ts` proving `segments` is honored (this is the
mechanism Step 1 relies on; `buildBaseField` returns plain typed arrays — node-safe, no WebGL). Follow
the structure of `test/terrain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBaseField } from '../src/terrain/buildTerrainGeometry'
import { seedFromCurrentIsland } from '../src/terrain/islandSpec'

describe('buildBaseField — resolution', () => {
  const spec = seedFromCurrentIsland()
  it('honors a reduced segment count (drag preview)', () => {
    const f = buildBaseField(spec, 32)
    expect(f.segments).toBe(32)
    expect(f.n).toBe(33)
    expect(f.xs.length).toBe(33 * 33)
    expect(f.indices.length).toBe(32 * 32 * 6)
  })
  it('builds the full-resolution field', () => {
    const f = buildBaseField(spec, 80)
    expect(f.n).toBe(81)
    expect(f.xs.length).toBe(81 * 81)
  })
})
```

**Verify**:
- `pnpm --dir island-editor test` → all pass incl. the two new cases.
- `pnpm --dir island-editor typecheck` → exit 0.

### Step 2: Coalesce intermediate pointer-moves to one update per frame

In `CoastlineHandles.tsx`, inside the drag `useEffect`, schedule intermediate `onChange` calls on
`requestAnimationFrame` (so N pointer-moves in one frame produce ≤1 `setCoastline`), but **commit the
final position synchronously in the pointer-up handler** so the undo command's `after` stays correct
(do not flush from cleanup — that races React's render):

```ts
useEffect(() => {
  if (!dragging) return
  onDragChange(true)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hit = new THREE.Vector3()
  let raf = 0
  let pending: { x: number; z: number } | null = null
  const flush = () => {
    raf = 0
    if (pending) { onChange(index, pending); pending = null }
  }
  const move = (ev: PointerEvent) => {
    const r = gl.domElement.getBoundingClientRect()
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    if (raycaster.ray.intersectPlane(plane, hit)) {
      pending = { x: hit.x, z: hit.z }
      if (!raf) raf = requestAnimationFrame(flush)
    }
  }
  const up = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    if (pending) { onChange(index, pending); pending = null } // final commit, synchronous
    setDragging(false)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  return () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (raf) cancelAnimationFrame(raf)
    onDragChange(false)
  }
}, [dragging, camera, gl, index, onChange, onDragChange, y])
```

Why this ordering is safe: `up` commits the final `pending` via a synchronous `onChange` in the native
pointer-up event, then `setDragging(false)`; both state updates batch into one render that updates
`specRef.current` *before* the effect cleanup runs `onDragChange(false)` — so the recorded `after`
includes the final position (same guarantee as today, just with intermediate frames coalesced).

**Verify**: `pnpm --dir island-editor typecheck` → exit 0; `pnpm --dir island-editor test` → all pass.

## Test plan

- Automated: `test/buildTerrainGeometry.test.ts` (Step 1) asserts the field honors both a reduced and
  full segment count — the mechanism this plan depends on. Existing tests stay green.
- Manual (`pnpm --dir island-editor dev`, http://localhost:5180, **Shape** tab):
  1. Drag an orange coastline handle in a fast circle. Expected: the handle tracks the cursor smoothly;
     terrain may look slightly coarser *while dragging* and snaps crisp on release. No multi-hundred-ms
     stalls.
  2. Release, then press ⌘Z. Expected: the coastline returns to its pre-drag shape (undo fidelity
     intact). ⇧⌘Z redoes to the final dragged shape.
  3. Switch to **Sculpt** and paint. Expected: terrain stays at full detail while painting (resolution
     reduction must not apply to sculpting).

## Done criteria

ALL must hold:

- [ ] `App.tsx` passes `segments={coastlineDragging ? DRAG_SEGMENTS : FULL_SEGMENTS}` to `Terrain`.
- [ ] `coastlineDragging` flips true/false in `onDragChange` and is **not** set by the paint handlers.
- [ ] `test/buildTerrainGeometry.test.ts` exists; `pnpm --dir island-editor test` exits 0 with the new cases.
- [ ] `pnpm --dir island-editor typecheck` exits 0.
- [ ] Manual: dragging is smooth, mesh snaps crisp on release, undo/redo restores the right shapes,
      sculpting stays full-detail.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Overview status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- After Step 1, dragging is still visibly janky at 32 segments — report timings; do not chase a
  micro-optimization in `buildTerrainGeometry.ts` (out of scope).
- The undo command no longer restores the correct shape after Step 2 (a sign the commit ordering was
  changed) — revert Step 2 and ship Step 1 alone, then report.
- The drift check shows `Terrain.tsx`/`CoastlineHandles.tsx` already refactored for performance.

## Maintenance notes

- `DRAG_SEGMENTS = 32` is a quality/perf knob. If plan 004 lets the coastline grow large and 32 looks
  too coarse mid-drag, raise it to 48 — re-check the feel.
- If a future change makes `field` depend on relief, revisit: the "paint doesn't rebuild the field"
  assumption (which is why resolution reduction is drag-only) would no longer hold.
- Reviewer should confirm: resolution reduction is gated on coastline drag only, and the final-position
  commit in `up` is synchronous (not deferred to rAF/cleanup).
