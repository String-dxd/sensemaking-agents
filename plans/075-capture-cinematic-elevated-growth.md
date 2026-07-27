# Plan 075: Capture cinematic — seed growth on elevated ground, defer the camera zoom until the sheet closes, confirm with a Kira dialog

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ac56d2eb..HEAD -- src/engine/student-space/Game/State/Island.js src/engine/student-space/Game/State/Island.d.ts src/engine/student-space/Game/View/Sprouts.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the live capture celebration path; all changes are
  view/state-slice local, no schema or network changes)
- **Depends on**: none
- **Category**: bug + direction (product-requested UX)
- **Planned at**: commit `ac56d2eb`, 2026-07-27

## Why this matters

This is a direct operator request: after a student logs a capture, the island's
response should read clearly — the growing thing should sit **on the raised
grass tiers, above the sand**, the camera should **zoom to it**, and a **Kira
dialog** (the same bottom panel the student sees when clicking the bird) should
say the capture was recorded and the island is growing.

Today three things fall short:

1. **Sprouts/trees can seed on the beach.** The seeded-placement pool is *all*
   placeable land cells, including tier-1 sand. Growth on the sand undercuts the
   "your island levels up" metaphor the operator wants.
2. **The per-capture camera zoom exists but is broken in the common path.** The
   flow starts synchronously when `captures.add()` fires — while the capture
   sheet is still open **and while the capture sheet's own camera dolly (owner
   `'capture'`) still holds the framing**. The sprout flow's `zoomTo` then
   snapshots the capture close-up as its restore anchor; when the sheet closes,
   its out-of-order `restoreZoom({owner:'capture'})` silently drops the true
   pre-capture anchor (by design, see Camera.js excerpt below). Net effect: the
   cinematic plays behind the closing sheet, and when it ends the camera
   "returns" to the capture close-up pose instead of the student's world view.
3. **There is no confirmation dialog.** The bloom chime and badge exist, but
   nothing tells the student in words that the capture landed and the island
   grew.

## Current state

### Files and roles

- `src/engine/student-space/Game/State/Island.js` — terrain query facade over
  the committed island spec. Owns `placeableCells()` (lines 163–171), the
  placement pool. Has a hand-written declaration file
  `src/engine/student-space/Game/State/Island.d.ts` that must stay in sync.
- `src/engine/student-space/Game/View/Sprouts.js` — the sprout/bloomed-tree
  view module. Owns seeded placement (`seededPlacement`, lines 102–114), the
  state-slice subscription that starts camera flows (lines 256–309), the
  per-capture camera-flow state machine (`_startCameraFlow` line 1329,
  `_tickCameraFlow` line 1392, `_returnCamera` line 1448), the frame `update()`
  (line 1527), and `dispose()` (ends line 1723).
- `src/components/student-space/world/WorldInteractions.tsx` — React host for
  the Kira narrator panel (**read-only for this plan — do not modify**). The
  engine reaches it as `view.kiraNarrator`.
- `src/engine/student-space/Game/View/Camera.js` — owner/save-stack cinematic
  zoom (**read-only for this plan**).

### Terrain tiers — what "above the sand" means

`defaultIslandSpec.json`: `seaLevel: 0`, `tierHeights: [-1.2, 0.05, 1, 1.65, 2.3]`.
Tier 0 is seafloor, **tier 1 (top 0.05) is the beach/sand**, tiers 2–4 (tops
1.0 / 1.65 / 2.3) are the elevated grass plateaus. The committed island has
hundreds of tier-2/3/4 cells, so an elevated pool is never empty in practice.
Each entry from `island.landCells()` / `placeableCells()` carries its raw grid
`tier` (see the `LandCell` type in `Island.d.ts`).

`src/engine/student-space/Game/State/Island.js:163`:

```js
    /**
     * Land cells whose centers pass `isPlaceable` — the scatter/placement
     * pool for sprout seeding and ambient systems. Cached.
     */
    placeableCells()
    {
        if(this._placeableCells) return this._placeableCells
        this._placeableCells = this.landCells().filter((cell) => this.isPlaceable(cell.x, cell.z))
        return this._placeableCells
    }
```

### Seeded placement (the pool to narrow)

`src/engine/student-space/Game/View/Sprouts.js:102`:

```js
export function seededPlacement(seed, island)
{
    const a = Math.sin(seed * 12.9898) * 43758.5453
    const b = Math.sin(seed * 78.233) * 12345.6789
    const theta = (a - Math.floor(a)) * Math.PI * 2
    const u = b - Math.floor(b)
    const cells = island.placeableCells()
    if(cells.length === 0) return { theta, x: 0, z: 0 }
    const cell = cells[Math.min(cells.length - 1, Math.floor(u * cells.length))]
    return { theta, x: cell.x, z: cell.z }
}
```

Student-dragged positions (`descriptor.position`) bypass this — they go through
`resolveWorldPlacement` (line 127) and `island.isPlaceable`. **Leave that
freedom intact**: only the *seeded* pool narrows to elevated tiers.

### Camera-flow start sites (the calls to defer)

`src/engine/student-space/Game/View/Sprouts.js:256` (subscriber; abbreviated):

```js
        this._unsubscribe = this.state.sprouts.subscribe((event) =>
        {
            if(event.type === 'spawned')
            {
                this._spawnNode(event.sprout)
                this._startCameraFlow(event.sprout.id, { autoBloom: false })
            }
            else if(event.type === 'grew')
            {
                ...
                this._startCameraFlow(event.sprout.id, { autoBloom: false })
            }
            else if(event.type === 'markedReady')
            {
                ...
                this._startCameraFlow(event.sprout.id, { autoBloom: true })
            }
```

Note `Sprouts.grow()` (state slice) fires exactly **one** of
`spawned`/`grew`/`markedReady` per capture.

`_startCameraFlow` (line 1329) currently: bails if `this._editMode`; on
`reduceMotion()` flashes the sprout and (for `autoBloom`) triggers the bloom
immediately; bails if `this._camFlow` is in flight; then computes a pose 1.7 m
back / 0.8 m up along the current viewing axis and calls
`camera.zoomTo(camPos, camLook, CAM_ZOOM_IN_MS, { owner: 'sprouts' })`, setting
`this._camFlow = { sproutId, phase: 'flying', startMs, autoBloom }`.

`_tickCameraFlow` (line 1392) advances `flying → holding →
('blooming' →) returning → done` on wall-clock; the hold is
`CAM_HOLD_MS = 500` (non-bloom) or `CAM_HOLD_BLOOM_MS = 350`. Constants at
lines 94–99:

```js
const CAM_ZOOM_IN_MS    = 500
const CAM_HOLD_MS       = 500     // non-bloom hold before returning
const CAM_HOLD_BLOOM_MS = 350     // shorter; bloom animation provides the dwell
const CAM_ZOOM_OUT_MS   = 500
const BLOOM_GROW_MS     = 1000    // bloomed-object grow-in duration (was 1200)
```

`update()` (line 1527) runs per frame while the world route renders and already
calls `this._tickCameraFlow(now)` (line 1538).

### Why the flow is broken today (evidence)

Commit order in `src/components/student-space/capture/AskSheet.tsx`
(`logPreparedReframe`, lines 815–827): `captures.add(...)` → (synchronously:
Sprouts slice `grow` → view subscriber → `_startCameraFlow` → `zoomTo` owner
`'sprouts'`) → then `close()` → `camera.restoreZoom?.(620, { owner: 'capture' })`
(line 454). The capture sheet's own dolly opened earlier with
`camera.zoomTo(camPos, camLook, 700, { owner: 'capture', adoptAnchorOf: 'kira-narrator' })`
(line 448). The same sheet-open-at-commit ordering holds for the direct
`commitCapture` path (lines 751–768) and for `MoodSheet.tsx` (commit, then
`close()` after 260 ms).

`src/engine/student-space/Game/View/Camera.js:291` — out-of-order restores drop
the anchor silently:

```js
    restoreZoom(duration = 700, options = {})
    {
        const owner = options.owner ?? '_default'
        if(!this._saveStack || !this._saveStack.has(owner)) return
        const keys = Array.from(this._saveStack.keys())
        const top  = keys[keys.length - 1]
        if(owner !== top)
        {
            // Out-of-order close: another consumer is currently
            // displaying the camera. Drop our anchor and let them keep
            // ownership; they'll restore to their own pre-zoom pose.
            this._saveStack.delete(owner)
            return
        }
```

So with stack `[capture, sprouts]`, the sheet's restore deletes `capture`'s
anchor and the sprout flow later "restores" to the capture close-up it
snapshotted. Deferring the sprout flow until the overlay is closed **and** the
camera is idle (no `_zoom` tween, empty `_saveStack`) fixes both the anchor
corruption and the plays-behind-the-sheet problem in one move.

Overlay-open signals (set by `src/lib/student-space/use-engine-overlay.ts`,
lines 71 and 76): `document.body` classes `has-capture-sheet` (ask/mood/photo)
and `has-chooser` (the capture chooser).

### The Kira narrator panel (the dialog to reuse)

`src/components/student-space/world/WorldInteractions.tsx` attaches controllers
to the engine view on mount: `view.kiraNarrator` (and `view.kiraDialogue`).
Engine code already null-guards these (e.g. `Character.js:344`). The two
methods this plan uses, verbatim contracts:

- `view.kiraNarrator.speak({ text, cta = '', name?, onConfirm? })`
  (WorldInteractions.tsx:612) — opens the bottom narrator panel with arbitrary
  text, **no camera dolly, no Kira yaw turn** ("Caller owns framing"). With
  `cta` omitted the panel is read-only with only the close X. Sets
  `isActive = true`.
- `view.kiraNarrator.close()` (line 694) — closes the panel. Its
  `restoreZoom(..., { owner: 'kira-narrator' })` is a **no-op** when the
  narrator never called `zoomTo` (the `speak` path): `restoreZoom` returns
  early when the owner has no stack entry. Its `_kiraRestYaw` is null on the
  speak path, so no yaw tween fires either. Safe to call from the engine.
- `view.kiraNarrator.isActive` — public boolean.

This is exactly the "dialog box like when I click on the bird" — the bird-click
path (`narrate`, line 550) uses the same panel, it just adds its own camera
dolly, which the sprout flow already provides.

### Repo conventions that apply

- Engine `View/*.js` modules are vanilla JS (no TS annotations), 4-space
  indent, Allman-style braces (`{` on its own line), `const` UPPER_SNAKE
  module constants — match `View/Sprouts.js` itself.
- Engine code must never throw from a slice-subscriber path; wrap narrator
  calls in `try { ... } catch(_) {}` like the existing
  `try { this.view.sound?.playOneShot?.('bloom') } catch(_) {}` (line 1465).
- Tests live in `test/engine/`, run under Vitest with `environment:
  'happy-dom'` (so `document.body` exists). View-module tests avoid full
  engine boots by calling prototype methods on a hand-built stub `this` — the
  pattern is `test/engine/SproutsView.timelapse.test.ts` (see its header
  comment). Model the new tests on it.
- `test/engine/Island.spec-api.test.ts` constructs a real `new Island()`
  against the committed spec — reuse that for placement tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 (should be a no-op) |
| Typecheck + lint | `pnpm check` | exit 0; Biome may print pre-existing warnings (18 at planning time), **0 errors** |
| Targeted tests | `npx vitest run test/engine/Sprouts.test.ts test/engine/SproutsView.timelapse.test.ts test/engine/Island.spec-api.test.ts test/engine/SproutsView.captureFlow.test.ts` | all pass |
| Full suite | `pnpm test` | see "Done criteria" note on pre-existing failures |

## Scope

**In scope** (the only files you should modify/create):

- `src/engine/student-space/Game/State/Island.js` — add `elevatedPlaceableCells()`
- `src/engine/student-space/Game/State/Island.d.ts` — declare it
- `src/engine/student-space/Game/View/Sprouts.js` — placement pool, deferral,
  narrator beat
- `test/engine/SproutsView.captureFlow.test.ts` — create
- `plans/README.md` — status row on completion

**Out of scope** (do NOT touch, even though they look related):

- `src/components/student-space/world/WorldInteractions.tsx` — the narrator
  API is used as-is; changing it risks the bird-click and onboarding flows.
- `src/engine/student-space/Game/View/Camera.js` — the owner semantics are
  correct; the fix is to stop calling `zoomTo` at the wrong moment.
- `src/engine/student-space/Game/State/Sprouts.js` (the state slice) and its
  persistence schema — no state change is needed.
- `src/components/student-space/capture/*` (AskSheet/MoodSheet/CaptureFab) —
  commit ordering stays; the view defers instead.
- `src/engine/student-space/Game/State/islandSpecCore/**` and
  `Game/Data/defaultIslandSpec.json` — pure core + committed spec; the parity
  fixture guard would trip.
- The drag/drop validity rule (`isPlaceable`) for student-moved objects — the
  student may still plant anything on the beach by hand.

## Git workflow

- Branch: `advisor/075-capture-cinematic-elevated-growth`
- Conventional commits, matching recent history (e.g.
  `fix(capture): frame Kira above the capture sheet`): suggest one commit per
  step group, e.g. `feat(island): elevated placement pool for sprout seeding`,
  `fix(sprouts): defer capture camera flow until overlays close`,
  `feat(sprouts): narrator confirmation on capture cinematic`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `Island.elevatedPlaceableCells()`

In `src/engine/student-space/Game/State/Island.js`, after `placeableCells()`
(line 171), add a cached filter for cells whose raw grid tier is ≥ 2, with a
fallback so a hypothetical beach-only island still seeds somewhere:

```js
    /**
     * Placeable cells on the raised tiers (grid tier >= 2) — strictly above
     * the tier-1 beach. Sprout/bloom seeding uses this pool so growth reads
     * as "the island levels up", not sand clutter. Falls back to the full
     * placeable pool if a custom spec has no elevated land. Cached.
     */
    elevatedPlaceableCells()
    {
        if(this._elevatedPlaceableCells) return this._elevatedPlaceableCells
        const elevated = this.placeableCells().filter((cell) => cell.tier >= 2)
        this._elevatedPlaceableCells = elevated.length > 0 ? elevated : this.placeableCells()
        return this._elevatedPlaceableCells
    }
```

In `src/engine/student-space/Game/State/Island.d.ts`, add
`elevatedPlaceableCells(): LandCell[]` next to `placeableCells(): LandCell[]`.

**Verify**: `pnpm check` → exit 0, no new errors.

### Step 2: Seed sprouts/blooms from the elevated pool

In `src/engine/student-space/Game/View/Sprouts.js`, `seededPlacement`
(line 110): change `const cells = island.placeableCells()` to
`const cells = island.elevatedPlaceableCells()`. Update the module-header
"Placement:" comment (line 32–34) and the line-91 comment to say seeds land on
random **elevated (tier ≥ 2)** placeable cells.

Do **not** change `resolveWorldPlacement`'s explicit-position branch or its
`isPlaceable`-based snap — student-moved objects keep full placement freedom.

Known, accepted side effect: persisted sprouts/bloomed trees **without** a
student-set `position` re-derive their cell from the same seed against the new
pool, so on next boot they move to elevated ground once. That is the requested
behavior ("grow it on top of level-up ground"); student-moved objects
(`position` set) do not move.

**Verify**: `npx vitest run test/engine/Sprouts.test.ts test/engine/SproutsView.timelapse.test.ts test/engine/Sprouts.integration.test.ts test/engine/Sprouts.pickPlant.test.ts` → all pass (these don't pin the old pool; if one fails, read it — see STOP conditions).

### Step 3: Defer the camera flow until overlays are closed and the camera is idle

Still in `View/Sprouts.js`:

3a. Add a constant near the camera timings (after line 99):

```js
const PENDING_FLOW_TIMEOUT_MS = 4000  // max wait on a busy camera before flying anyway
```

3b. In the constructor, next to `this._camFlow = null` (line 234), add
`this._pendingCamFlow = null  // { sproutId, autoBloom, queuedAtMs }`.

3c. Add two helpers (place them just above `_startCameraFlow`):

```js
    /**
     * True while the capture overlays are up or another consumer holds the
     * camera. Starting the sprout zoom now would (a) play behind the sheet
     * and (b) snapshot the capture dolly's close-up as the 'sprouts' restore
     * anchor — the sheet's later out-of-order restoreZoom('capture') then
     * drops the true pre-capture pose (Camera.js save-stack semantics), and
     * the camera ends the cinematic stuck at the capture framing.
     */
    _shouldDeferCameraFlow()
    {
        if(typeof document !== 'undefined')
        {
            const cls = document.body.classList
            if(cls.contains('has-capture-sheet') || cls.contains('has-chooser')) return true
        }
        const camera = this.view.camera
        if(camera && (camera._zoom || (camera._saveStack && camera._saveStack.size > 0))) return true
        return false
    }

    /** Start a queued flow once the overlay is gone and the camera settles. */
    _drainPendingCamFlow(now)
    {
        const pending = this._pendingCamFlow
        if(!pending || this._camFlow) return
        if(typeof document !== 'undefined')
        {
            const cls = document.body.classList
            // An open overlay always blocks — no timeout while the student
            // is mid-capture.
            if(cls.contains('has-capture-sheet') || cls.contains('has-chooser')) return
        }
        const camera = this.view.camera
        const busy = camera && (camera._zoom || (camera._saveStack && camera._saveStack.size > 0))
        if(busy && now - pending.queuedAtMs < PENDING_FLOW_TIMEOUT_MS) return
        this._pendingCamFlow = null
        this._startCameraFlow(pending.sproutId, { autoBloom: pending.autoBloom })
    }
```

3d. At the top of `_startCameraFlow` (line 1329), **before** the `_editMode` and
reduced-motion checks, queue instead of starting when deferral applies (so the
reduced-motion narrator/bloom beat in Step 4 also waits for the sheet to
close):

```js
        if(this._shouldDeferCameraFlow())
        {
            this._pendingCamFlow = {
                sproutId,
                autoBloom: autoBloom || !!(this._pendingCamFlow && this._pendingCamFlow.autoBloom),
                queuedAtMs: performance.now(),
            }
            return
        }
```

(`autoBloom` merges true-wins so a rapid grow-then-ready pair queued behind one
sheet still blooms. The node-missing case is already handled — `_startCameraFlow`
returns silently when `this.nodes.get(sproutId)` is gone.)

3e. In `update()` (line 1527), immediately before
`this._tickCameraFlow(now)` (line 1538), add
`this._drainPendingCamFlow(now)`.

3f. In `dispose()`, alongside the existing defensive camera-controls restore
(around line 1704), add `this._pendingCamFlow = null`.

**Verify**: `pnpm check` → exit 0. `npx vitest run test/engine/SproutsView.timelapse.test.ts` → pass.

### Step 4: Kira narrator confirmation during the hold

Still in `View/Sprouts.js`:

4a. Add constants near the camera timings:

```js
// Narrator beat — the bottom Kira panel confirms the capture while the
// camera holds on the sprout. Copy is deliberately plain; species-aware
// variants are a product decision deferred to a future plan.
const NARRATOR_HOLD_MS = 3600   // replaces CAM_HOLD_MS while the panel is up
const GROW_NARRATION  = 'Your capture has been recorded — your island is growing.'
const BLOOM_NARRATION = 'Your capture has been recorded — something new is blooming on your island!'
```

4b. Add helpers (near `_returnCamera`):

```js
    /** Open the bottom Kira panel for this flow. No-ops if the narrator is
     *  unavailable (world host unmounted) or already mid-conversation. */
    _openFlowNarrator(flow)
    {
        const narrator = this.view.kiraNarrator
        if(!narrator || typeof narrator.speak !== 'function' || narrator.isActive) return
        try
        {
            narrator.speak({ text: flow.autoBloom ? BLOOM_NARRATION : GROW_NARRATION })
            flow.narratorOpened = true
        }
        catch(_) {}
    }

    _closeFlowNarrator(flow)
    {
        if(!flow || !flow.narratorOpened) return
        flow.narratorOpened = false
        const narrator = this.view.kiraNarrator
        if(narrator && narrator.isActive)
        {
            try { narrator.close() } catch(_) {}
        }
    }
```

(`narrator.close()` is safe from the speak path: its
`restoreZoom({owner:'kira-narrator'})` no-ops because the narrator never owned
a zoom, and no yaw tween fires because `_kiraRestYaw` is null — verified
against WorldInteractions.tsx:694–727.)

4c. Wire into `_tickCameraFlow`:

- In the `'flying'` branch, when the phase flips to `'holding'`
  (line 1401–1405), call `this._openFlowNarrator(flow)` right after setting
  `flow.phase = 'holding'`.
- In the `'holding'` branch (line 1409), replace
  `const holdMs = flow.autoBloom ? CAM_HOLD_BLOOM_MS : CAM_HOLD_MS` with:

```js
            const holdMs = flow.autoBloom
                ? CAM_HOLD_BLOOM_MS
                : (flow.narratorOpened ? NARRATOR_HOLD_MS : CAM_HOLD_MS)
            // Student dismissed the panel early — return right away.
            if(flow.narratorOpened && !this.view.kiraNarrator?.isActive)
            {
                flow.narratorOpened = false
                this._returnCamera(flow)
                return
            }
```

  (The bloom path keeps its short hold — the panel stays up through the
  blooming + returning phases, ~1.85 s of read time plus the zoom-out.)
- In the `'returning'` branch, when the flow completes
  (`elapsed >= CAM_ZOOM_OUT_MS`, line 1441–1444), call
  `this._closeFlowNarrator(flow)` before `this._camFlow = null`.

4d. Reduced-motion path (inside `_startCameraFlow`'s `reduceMotion()` branch,
lines 1348–1353): the student still gets the words, no camera. After the
existing `tapAckUntilMs` / `autoBloom` logic, add:

```js
            const rmFlow = { autoBloom, narratorOpened: false }
            this._openFlowNarrator(rmFlow)
            if(rmFlow.narratorOpened) this._rmNarratorCloseAtMs = performance.now() + NARRATOR_HOLD_MS
            return
```

Initialize `this._rmNarratorCloseAtMs = 0` in the constructor next to
`_pendingCamFlow`, and in `update()` (next to the `_drainPendingCamFlow` call)
add:

```js
        if(this._rmNarratorCloseAtMs && now >= this._rmNarratorCloseAtMs)
        {
            this._rmNarratorCloseAtMs = 0
            this._closeFlowNarrator({ narratorOpened: true })
        }
```

4e. In `dispose()`, after `this._pendingCamFlow = null`, close any panel this
module opened: `this._closeFlowNarrator(this._camFlow)` and reset
`this._rmNarratorCloseAtMs = 0`.

**Verify**: `pnpm check` → exit 0.

### Step 5: Tests — `test/engine/SproutsView.captureFlow.test.ts` (create)

Model the stub-`this` technique on `test/engine/SproutsView.timelapse.test.ts`
(call `SproutsView.prototype.<method>.call(stub, ...)`; never construct the
real view). Import `SproutsView` and the named export `seededPlacement` with
the same `// @ts-expect-error` JS-module comment that file uses. Clean up
`document.body.className` in `afterEach`.

1. **Elevated seeding (real terrain)** — construct `new Island()` (pattern:
   `test/engine/Island.spec-api.test.ts`), import `worldToCell` from
   `~/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts`, and for
   `seed` in a loop over at least 100 varied integers (e.g.
   `(i * 2654435761) >>> 0`, matching the slice's `_nextPlacementSeed`):
   `const { x, z } = seededPlacement(seed, island)`; map `{x,z}` back to a cell
   via `worldToCell(island.worldSize, island.spec.grid, x, z)` and assert
   `island.spec.grid.tiers[r * cols + c] >= 2`.
2. **Fallback pool** — a fake island `{ elevatedPlaceableCells: () => [{ x: 3, z: 4, tier: 1 }] }`
   still returns `{x: 3, z: 4}` (the method owns the fallback; the view just
   consumes the pool).
3. **Deferral queues behind the capture sheet** — stub `this` with
   `nodes: new Map([[id, { group: { position: new THREE.Vector3(0, 1, 0) } }]])`,
   `_editMode: false`, `_camFlow: null`, `_pendingCamFlow: null`,
   `view: { camera: { instance: { position: new THREE.Vector3(5, 5, 5) }, zoomTo: vi.fn() } }`,
   plus `_tmpVec: new THREE.Vector3()`. Add `has-capture-sheet` to
   `document.body.classList`; call `_startCameraFlow`; assert `zoomTo` not
   called and `_pendingCamFlow.sproutId === id`. Remove the class; call
   `_drainPendingCamFlow.call(stub, performance.now())`; assert `zoomTo`
   called once and `_camFlow.phase === 'flying'`.
4. **Deferral waits for a busy camera, with timeout** — same stub, no body
   class, `camera._saveStack = new Map([['capture', {}]])`: queue via
   `_startCameraFlow` (asserts pending), drain at `queuedAtMs + 100` → still
   pending; drain at `queuedAtMs + PENDING_FLOW_TIMEOUT_MS + 1` (use
   `4001`) → flies.
5. **autoBloom merge** — queue `{autoBloom: true}` then `{autoBloom: false}`
   behind the sheet; assert `_pendingCamFlow.autoBloom === true`.
6. **Narrator beat** — stub with
   `view.kiraNarrator = { isActive: false, speak: vi.fn(function () { this.isActive = true }), close: vi.fn(function () { this.isActive = false }) }`
   and `view.camera.restoreZoom: vi.fn()`. Set
   `_camFlow = { sproutId: id, phase: 'flying', startMs: t0, autoBloom: false }`;
   `_tickCameraFlow.call(stub, t0 + 500)` → phase `'holding'`, `speak` called
   once with the GROW copy. Then:
   - early dismiss: set `kiraNarrator.isActive = false`;
     `_tickCameraFlow.call(stub, t0 + 600)` → `restoreZoom` called (phase
     `'returning'`).
   - full hold: fresh flow, keep `isActive` true, tick at
     `startMs + 3600` → returning; tick at `+500` more → `close` called,
     `_camFlow === null`.
   - already-active narrator: `isActive: true` before the flow → `speak` NOT
     called, `narratorOpened` falsy, hold falls back to 500 ms.

**Verify**: `npx vitest run test/engine/SproutsView.captureFlow.test.ts` → all pass.

### Step 6: Gates

Run in order:

1. `pnpm check` → exit 0 (warnings allowed only if they pre-exist on the base
   commit; 18 Biome warnings / 0 errors at planning time).
2. `npx vitest run test/engine/Sprouts.test.ts test/engine/Sprouts.integration.test.ts test/engine/Sprouts.pickPlant.test.ts test/engine/SproutsView.timelapse.test.ts test/engine/Island.spec-api.test.ts test/engine/SproutsView.captureFlow.test.ts test/engine/Progression.e2e.test.tsx` → all pass.
3. `pnpm test` → see Done criteria for the pre-existing-failure rule.

## Test plan

Covered in Step 5 (new file `test/engine/SproutsView.captureFlow.test.ts`,
cases 1–6) plus the existing suites in Step 6, which pin: slice semantics
(`Sprouts.test.ts`), capture→sprout integration
(`Sprouts.integration.test.ts`), drag/drop (`Sprouts.pickPlant.test.ts`),
timelapse subset (`SproutsView.timelapse.test.ts`), terrain facade
(`Island.spec-api.test.ts`), and the progression e2e
(`Progression.e2e.test.tsx`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0 with no errors.
- [ ] `npx vitest run test/engine/SproutsView.captureFlow.test.ts` passes with
      ≥ 6 tests.
- [ ] The Step-6 targeted vitest command passes in full.
- [ ] `pnpm test`: zero failures, **or** every failing file also fails
      identically on the base commit `ac56d2eb` with your changes stashed
      (`git stash && pnpm test <failing files> && git stash pop`) — record the
      list in the README status row. (A 2026-07-23 reconcile noted 10
      pre-existing product-UI test failures on main; they may since be fixed.)
- [ ] `grep -n "placeableCells()" src/engine/student-space/Game/View/Sprouts.js`
      shows only the `elevatedPlaceableCells` call site inside
      `seededPlacement` (the drag path's `isPlaceable` calls are untouched —
      they don't match this grep).
- [ ] `git status` shows no modified files outside the Scope list.
- [ ] `plans/README.md` status row for 075 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows changes in the in-scope files, or any "Current state"
  excerpt no longer matches (especially `_startCameraFlow` /
  `_tickCameraFlow` structure or the `restoreZoom` owner semantics).
- `new Island()` in the test yields an empty `elevatedPlaceableCells()` pool —
  the committed spec should have hundreds of tier ≥ 2 cells; emptiness means
  the spec or tier semantics changed.
- Any existing test in Step 2/6's list fails after your change and the failure
  is *not* obviously a pre-existing one (verify against the base commit before
  concluding).
- You find yourself needing to modify `WorldInteractions.tsx`, `Camera.js`, or
  the capture sheets to make the narrator or deferral work — the design above
  is engine-side only; if it can't be, the plan's assumption is wrong.
- `view.kiraNarrator.speak` turns out to move the camera or turn Kira (it must
  not, per its doc comment) — the hold math would then be wrong.

## Maintenance notes

- **Copy lives in `View/Sprouts.js`** (`GROW_NARRATION` / `BLOOM_NARRATION`).
  Species-aware or count-aware variants ("2 more to bloom!") are a natural
  follow-up; keep them as module constants or lift to a Data file if they
  multiply.
- **One-time layout shift**: existing islands' seed-placed objects move to
  elevated tiers on the first boot after this lands. If the operator wants
  strict continuity for existing demo personas instead, the pool change would
  need a persisted flag — deliberately not built.
- **Reviewers should scrutinize**: the deferral gate reading Camera privates
  (`_zoom`, `_saveStack`) — it's read-only coupling, matching the engine's
  informal-privacy style, but a Camera refactor would silently disable
  deferral (flows would start immediately again; the
  `PENDING_FLOW_TIMEOUT_MS` fallback keeps it non-fatal). A public
  `camera.isBusy()` is a nice-to-have follow-up.
- If a future plan adds the V/I/P/S chip picker as a post-capture overlay, it
  must also toggle a body class (or reuse `has-capture-sheet`) so the deferral
  keeps holding until the student finishes tagging.
- The `Progression.e2e.test.tsx` suite exercises capture→sprout→bloom
  end-to-end; if it ever constructs the real view with a live narrator stub,
  the NARRATOR_HOLD_MS gate will lengthen simulated flows — tests that advance
  fake clocks must account for the 3600 ms hold.
