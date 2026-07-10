# Plan 003: Contextual editing — cursor marker + gesture-inferred terraforming (Tiny Glade direction)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `docs/plans/2026-07-09-000-feat-island-editor-cozy-interactions-overview.md`.
>
> **Drift check (run first)**: `git diff --stat 9328feee..HEAD -- island-editor/src`
> Pay particular attention to `App.tsx`, `scene/IslandTerrain.tsx`,
> `ui/ToolPanel.tsx` — this plan rewires them. On excerpt mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches the core input path; mitigated by keeping the classic
  tool hotbar as a fallback mode and by putting all inference in a pure,
  headless-tested module)
- **Depends on**: docs/plans/2026-07-09-001 (grass) only insofar as the
  contextual dropdown lists `OBJECT_KINDS` — it composes automatically; no hard
  dependency. Execute after PR #89 merges (camera-mode precedence excerpts
  below come from it).
- **Category**: direction
- **Planned at**: commit `9328feee`, 2026-07-09

## Open items from the operator (resolve before or during Step 4)

The operator supplied reference screenshots of the desired marker (Tiny
Glade-style) that did NOT reach the planning session. The interaction spec
below is grounded in the operator's written description; the marker's exact
VISUAL treatment (shape, glyph, animation) is a placeholder: a soft ring that
tints per context. Before polishing visuals in Step 4, ask the operator to
re-share the marker references.

## The interaction spec (operator's intent, normative)

Replace mode-picking with context inference — "the editor understands what you
mean from where you act":

| User action | Context | Behavior |
|---|---|---|
| Click (no drag) on land | ground | Open a contextual dropdown at the cursor listing object kinds; choosing one drops it on that cell |
| Drag starting on sea | sea | Raise seabed to sand (tier 0 → 1) along the stroke — "start with sands" |
| Drag starting on sand/land | land | Raise terrain (existing raise-to-target stroke semantics) |
| Drag again over just-raised land | land | Lifts further (tier +1 per new stroke — already how strokes work) |
| Delete (key or marker action) on an object | object | Remove that object |
| Delete on land | land | Lower terrain (tier −1 stroke) |
| Hold Cmd/Ctrl + drag | any | Camera orbit — unchanged, always wins |

Lowering land and deleting objects are BOTH on delete — there is no "lower"
drag gesture. Water/path/erase painting stay available in the classic hotbar
(fallback mode); they are not part of the contextual gestures in this plan.

## Current state

- `island-editor/src/App.tsx` — owns tool state and stroke logic:
  - `const [tool, setTool] = useState<Tool>('raise')` (line 60). The `Tool`
    TYPE is defined in `src/ui/icons.tsx` line 4 (edit it THERE if the union
    must grow); `ui/ToolPanel.tsx` only imports it and owns the hotbar list
    (`const TOOLS: Tool[] = ['raise', 'lower', 'water', 'path', 'erase']`, line 6).
  - `paint` callback (lines ~150–177): per-stroke `strokeTarget` (tier under
    cursor at stroke start ±1) then dispatches on `toolRef.current`:
    `raise` → `adjustTierToward(grid, cells, +1, target)`, `lower` → `−1`,
    `water` → `setTier(grid, cells, 0)`, etc.
  - `onPaintStart`/`onPaintEnd` snapshot tiers+surface for the undo stack
    (`stack.push({label:'Stroke', do, undo})`).
  - Placement: `placeKind` state armed via the model panel (`onPick`), ghost
    preview (`PlaceGhost`), `placeObject(x,z)` gated by `isLandCell`, undo via
    `addObject`/`removeObject` from `terrain/objectOps.ts`.
  - Esc disarms placement (keydown handler ~line 275).
- `island-editor/src/scene/IslandTerrain.tsx` — pointer seam. Precedence
  comment at the handlers (~line 126): "camera (hold-Cmd) wins → then place
  mode → then paint". `handleDown` starts a stroke immediately on pointerdown
  (there is NO click-vs-drag distinction today — this plan introduces one).
  Stroke picks lock to a ground plane (`strokePlane`) so mid-stroke picks
  don't wander. A brush-sized cursor quad (`moveCursor`, ~line 106) already
  tracks the hovered cell block — the contextual marker replaces/extends it.
- `island-editor/src/terrain/gridOps.ts` — pure ops: `brushCells`,
  `adjustTierToward`, `setTier`, `isLandTier`. `terrainGrid.ts` has
  `worldToCell`, `cellIndex`, tier data. Sea = tier 0 (below `seaLevel`);
  `isLandCell` in App wraps this.
- `island-editor/src/scene/PlacedObjects.tsx` — placed-object meshes; in place
  mode a click on an object removes it (`onRemove`). Objects know their cell.
- Repo conventions: pure logic in `island-editor/src/terrain/*` with vitest
  coverage in `island-editor/test/*`; React/three glue stays thin; UI panels in
  `src/ui/*` (see `ToolPanel.tsx`, `StylePanel.tsx` for panel styling +
  `panel.css`). Undo integration is mandatory for every mutating interaction.
- Base UI note: the product app mandates Base UI for dropdowns, but the
  island-editor workspace has NO `@base-ui-components/react` dependency and
  hand-rolls its panels — match the editor's existing panel style for the
  contextual dropdown; do not add a dependency for one menu.

## Suggested executor toolkit

- **Visual iteration protocol** — read the section of that name in
  `docs/plans/2026-07-09-000-feat-island-editor-cozy-interactions-overview.md`
  before Step 2. For THIS plan the subject is the MAIN editor
  (`http://localhost:5180/`), not the gallery, and the loop applies to
  interactions as well as looks: every gesture gets a before/after capture
  pair, and the marker gets per-context captures. The protocol's metaKey
  gotcha is load-bearing here — this plan's gestures interact with camera
  mode, and a keydown-only simulation will false-pass.
- Gesture capture recipe (adapt the protocol's pointer-event `eval` snippets):
  dispatch pointerdown → N pointermoves → pointerup on the canvas at chosen
  coordinates, then screenshot. A "click" is down+up within the 4 px
  threshold; a "drag" moves ≥ 8 px. Sea vs land coordinates: reset to the
  seeded default island first (top-right reset button — capture and snapshot
  to find its ref) so geography is deterministic; then canvas CENTER is land
  and points within ~15% of the frame edges are sea. Confirm each chosen
  point once via a screenshot with the context marker visible (its tint tells
  you which context you hit) before scripting the gesture. The e2e captures
  are EVIDENCE; the context-inference correctness itself is proven by the
  Step 1 unit tests, so don't burn rounds making pixel-picking precise.
- `agent-browser` CLI (see protocol for install fallback).

## Commands you will need

| Purpose | Command (repo root) | Expected on success |
|---------|---------------------|---------------------|
| Typecheck + tests | `pnpm check:island-editor` | exit 0 |
| Dev server | `pnpm dev:editor` | http://localhost:5180 |

## Scope

**In scope**:
- `island-editor/src/terrain/editContext.ts` (create — pure context/gesture module)
- `island-editor/test/editContext.test.ts` (create)
- `island-editor/src/App.tsx`, `island-editor/src/scene/IslandTerrain.tsx`
- `island-editor/src/ui/ToolPanel.tsx` (add the smart/classic switch)
- `island-editor/src/ui/ContextMenu.tsx` (create — the drop-object dropdown)
- Marker visuals inside `IslandTerrain.tsx` or a new `scene/EditMarker.tsx`

**Out of scope**:
- `src/editor/commandStack.ts`, `src/terrain/gridOps.ts`,
  `src/terrain/objectOps.ts` (paths under `island-editor/`) — the pure ops are
  sufficient; new behavior composes them.
- The wind/model/texture systems; the GLB pipeline.
- Mobile/touch support — pointer-mouse only, matching the current editor.
- Removing the classic tools — they must remain reachable (fallback + the
  water/path/erase behaviors have no contextual gesture yet).

## Git workflow

- Branch: `feat/island-editor-contextual-editing`
- Commits: `feat(island-editor): <summary>`, one per step below.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure context module + tests (no UI yet)

Create `island-editor/src/terrain/editContext.ts`:

```ts
export type EditContext = 'sea' | 'land' | 'object' | 'out-of-bounds'
export type GestureIntent =
  | { kind: 'raise-from-sea' }   // drag started on sea → tier 0→1 strokes
  | { kind: 'raise-land' }       // drag started on land → +1 stroke
  | { kind: 'open-drop-menu'; c: number; r: number } // click (no drag) on land
  | { kind: 'delete-object'; id: string }            // delete with object hovered
  | { kind: 'lower-land' }                           // delete with land hovered
  | { kind: 'none' }

export function resolveContext(spec: IslandSpec, x: number, z: number, hoveredObjectId: string | null): EditContext
export function resolveGesture(args: {
  context: EditContext
  phase: 'click' | 'drag-start' | 'delete'
  cell: { c: number; r: number } | null
  hoveredObjectId: string | null
}): GestureIntent
```

Pure functions over `IslandSpec` (use `worldToCell`, tier lookup, `isLandTier`
from `terrainGrid.ts`/`gridOps.ts`). Write `test/editContext.test.ts` first —
model on `test/gridOps.test.ts` — covering: sea vs land resolution at tier
boundaries, object hover priority over land, out-of-bounds, and each
phase×context → intent row of the table above.

**Verify**: `pnpm check:island-editor` → exit 0, new tests pass.

### Step 2: Click-vs-drag discrimination in the pointer seam

In `IslandTerrain.tsx`, split pointerdown into a pending gesture: record the
down position/time; it becomes a DRAG when the pointer moves > 4 px (screen
space) or a CLICK on pointerup within the threshold. Keep the existing
precedence exactly: camera mode → place mode (classic armed placement) → smart
gestures → classic paint. Wire callbacks upward: `onSmartClick(x,z)`,
`onSmartDragStart(x,z)` — App decides via `resolveGesture`.

The stroke-plane locking and cliff-face outward resolution (existing comments
in `handleDown`) must be preserved for drag strokes.

**Verify**: `pnpm check:island-editor` green. Manual: in the dev editor with
smart mode OFF (Step 5 adds the toggle; until then keep classic default),
existing painting/placing behaves exactly as before (no regression).

### Step 3: Wire the gestures in App

In `App.tsx`, add `interactionMode: 'smart' | 'classic'` state (persist to
localStorage like the texture theme). In smart mode:

- `raise-from-sea` / `raise-land` → reuse the existing stroke machinery
  (`onPaintStart`/`paint`/`onPaintEnd`) with tool forced to `'raise'`. No new
  stroke code — sea cells raised by a stroke become tier 1 (sand) via
  `adjustTierToward(grid, cells, +1, target)`, which is the operator's
  "dragging on sea starts with sands" for free.
- `open-drop-menu` → set state `{screenX, screenY, c, r}`; render
  `ContextMenu.tsx` (fixed-position panel styled like `ToolPanel`'s buttons)
  listing `OBJECT_KINDS` with icons; choosing one calls the existing
  `placeObject` path for that cell (single placement, no armed mode), then
  closes. Esc/click-away closes.
- Delete: `Delete`/`Backspace` keydown → `resolveGesture(phase:'delete')` on
  the currently hovered target: object → existing `removeObj`; land → a one-
  shot `-1` lower stroke on the hovered brush cells (reuse stroke snapshot for
  undo). Hover tracking: thread the hovered object id from `PlacedObjects`
  up to App (it already detects clicks on objects; add a hover callback the
  same way).

All paths must push onto the existing undo stack — reuse the stroke and object
command patterns already in `App.tsx`; write no new undo plumbing.

**Verify**: `pnpm check:island-editor` green, then the gesture script as
CAPTURED evidence, not just eyeballing — for each row, a before/after
screenshot pair via the toolkit's gesture recipe:

1. drag on sea → after-shot shows new sand cells; undo → matches before-shot
2. drag on land → terrain visibly raised along the stroke
3. click (no drag) on land → after-shot shows the menu OPEN at the cursor;
   choose a kind → object placed on that cell; undo → gone
4. Delete over an object → object gone; Delete over land → tier lowered
5. Cmd+drag (with `metaKey: true` on the POINTER events) → camera orbited,
   ZERO terrain change and undo stack length unchanged — capture the undo/redo
   button states to prove it
6. drag that starts on sea and crosses onto land → stroke stays a sea-raise
   (stroke-start context wins; mid-stroke context must not flip)

Keep the pairs as `/tmp/003-step3-<case>-{before,after}.png`.

### Step 4: The contextual marker

Replace the plain cursor quad with a marker that reflects the resolved
context, updated in `handleMove` from `resolveContext`:

- land → soft ring (existing brush-quad footprint) in the raise tint
- sea → same ring in a sand/amber tint (signals "drag to build sand")
- object hovered → ring snaps to the object's cell with a delete-red tint when
  Delete is held, neutral highlight otherwise
- placeholder visuals; **ask the operator for the Tiny Glade marker
  references before polish** (see Open items) and match the editor's HUD ink
  aesthetic (`panel.css`).

Keep it a single mesh + material color swap per frame (the existing
`moveCursor` mutation pattern — no React state in the hot path).

**Verify**: `pnpm check:island-editor` green.

**Visual iteration (protocol; expect 2–3 rounds)** — capture the marker in
each context state (hover sea / hover land / hover object / Delete held over
object) as `/tmp/003-step4-<context>.png`, plus one capture mid-orbit. Named
criteria:

- **Legible at a glance**: the four context states are distinguishable in the
  captures WITHOUT reading this plan — show the set to the operator if unsure.
- **Sits on the terrain**: the ring hugs the hovered surface height (reuses
  `moveCursor`'s tier sampling); at cliff edges it must not z-fight or float —
  capture one shot exactly on a cliff edge.
- **Calm, not noisy**: no flicker when the pointer crosses a cell boundary
  (capture a short `agent-browser` video or 3 rapid frames while moving);
  tint transitions may be instant but must not strobe.
- **Consistent with the HUD ink**: colors drawn from `panel.css` / the hotbar
  palette, not new saturated primaries.
- **Marker-reference check**: the operator's Tiny Glade marker screenshots are
  an OPEN ITEM (see top of plan). Before calling this step done, present your
  captures and ask for the references; if provided, run one more round
  matching their shape/weight.

### Step 5: Mode toggle + default

Add the smart/classic switch to `ToolPanel.tsx` (leftmost slot). Smart is the
default; classic shows the full old hotbar (raise/lower/water/path/erase) and
bypasses gesture inference entirely. Placement panel keeps working in both
modes.

**Verify**: toggling modes mid-session never leaves a stuck stroke or open
menu; `pnpm check:island-editor` green.

## Test plan

- `test/editContext.test.ts` (Step 1): full phase×context matrix, boundary
  cells, object-over-land priority — the inference brain is 100% headless.
- Existing suites (`gridOps`, `objectOps`, `commandStack`, `cameraOps`) must
  pass untouched — proof the pure layer didn't change.
- Manual gesture script from Step 3, run once in smart and once in classic
  mode, plus undo/redo depth ≥ 3 across mixed gesture types.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0; `editContext` tests cover every
      table row from the interaction spec
- [ ] Smart mode: sea-drag→sand, land-drag→raise, land-click→drop menu,
      delete→remove/lower — each undoable
- [ ] Classic mode: behavior identical to `main` today
- [ ] Cmd-orbit precedence unchanged (verify while a menu is open too)
- [ ] Capture evidence exists: Step 3 before/after pairs for all 6 gesture
      cases + Step 4 marker set (4 context states + cliff edge + mid-orbit),
      all taken AFTER the final code change
- [ ] Status row updated in the overview doc

## STOP conditions

- The click-vs-drag threshold fights the stroke-plane locking (strokes feel
  laggy because they start 4 px late) and no threshold ≤ 6 px fixes it —
  report; the fix may need pointer capture changes that deserve review.
- Hover tracking from `PlacedObjects` requires raycasting changes that slow
  the frame — report rather than shipping a stuttering marker.
- The interaction spec turns out ambiguous for a case the table doesn't cover
  (e.g. delete while a menu is open) — pick nothing; list the cases and ask.
- Undo integration for any gesture can't reuse existing command patterns.

## Maintenance notes

- The gesture table in this plan is the spec of record until the operator's
  marker screenshots are re-shared; future contextual behaviors (water, path)
  should extend `resolveGesture`'s matrix + tests, never inline branching in
  React handlers.
- Reviewers: scrutinize pointer-capture edge cases (leave canvas mid-drag,
  Cmd pressed mid-stroke) and StrictMode double-invoke on the new menu state.
- Deferred: touch support; marker animation polish; contextual water/path
  gestures; "drag object to move it" (natural follow-up once hover tracking
  exists).
