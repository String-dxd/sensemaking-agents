---
title: Island editor — distributed control layout (bottom hotbar · bottom-right camera dock · top-right file bar) + camera adjustment
type: feat
status: done — merged to main via #79 (distributed layout + camera dock + file bar)
date: 2026-07-06
written_against_commit: a29a3cf2
base_branch: main
supersedes: 2026-07-06-002-feat-island-editor-camera-controls-plan.md
builds_on: 2026-07-06-001-feat-island-editor-hotbar-ux-redesign-plan.md (MERGED to main via PR #78); the sea/stroke polish (PR #77) is also merged
reconciled: 2026-07-06 — hotbar (#78) + polish (#77) merged to main a29a3cf2; re-stamped to main. main's App.tsx paint handler now carries the polish `cellLine`/`lastCell` interpolation (see the App.tsx note); 003's changes are additive and do not touch it.
---

# Plan: Distributed control layout + camera adjustment during design

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report — do not improvise. When done, flip `status:` in this
> file's frontmatter to `done` (or `blocked: <reason>`). This plan is fully
> self-contained; it **supersedes** the camera-only plan (002), so do not also run
> that one.
>
> **Base branch**: `main` (the hotbar redesign #78 and the sea/stroke polish #77 have
> both merged to `main` at commit `a29a3cf2`):
> `git checkout -b feat/island-editor-distributed-layout main`.
> Sanity check: `island-editor/src/ui/ToolPanel.tsx` must be the `.hotbar` panel with a
> `HotbarButton` helper (NOT an old text-button `.tool-panel` with a "Scene" section).
> If it's the old panel, STOP — you're on the wrong base and this plan's excerpts won't match.
>
> **Drift check (run first)**:
> `git diff --stat a29a3cf2..HEAD -- island-editor/src/ui/ island-editor/src/App.tsx island-editor/src/scene/IslandTerrain.tsx`
> On any change, compare "Current state" below against the live code; mismatch = STOP.

## Status

- **Priority**: P2 (UX/IA, user-requested)
- **Effort**: L
- **Risk**: MED (a layout refactor across 3 UI zones + the paint/camera pointer interplay; the risk-bearing camera math is pure-unit-tested, the rest is browser-QA'd)
- **Depends on**: the hotbar redesign (`feat/island-editor-hotbar-ux`, `123c418e`).
- **Category**: direction / ux
- **Planned at**: commit `123c418e`, 2026-07-06

## Why this matters

The bottom hotbar (from the redesign) currently holds every control — tools, brush,
undo/redo, view presets, and file actions — and the planned camera controls would push
it to ~20 buttons in one row. That's past the point where a hotbar reads as a hotbar.

This distributes controls by frequency and concern (the layout the requester chose):

- **Bottom-center hotbar** = the creative loop: **tools + brush size + undo/redo**.
- **Bottom-right camera dock** = "how I'm looking at it": **Designer/Top presets +
  rotate ←/→, zoom −/+, recenter**, plus **hold-Space to orbit** while a tool is active.
- **Top-right file bar** = rare/meta: **Export, Import, Reset** (moving Reset out of the
  hotbar also reduces mis-clicks on a destructive action).
- **Left edge** = intentionally reserved (empty for now) for a future objects/inspector
  pane when placement lands — do NOT build a left pane in this plan.

It also delivers the "camera adjustment during design" feature: today the only camera
move that works over the island is the scroll-wheel (any click-drag on the island
paints and disables OrbitControls). Hold-Space frees drags for orbit/pan, and the dock
buttons give discoverable zoom/rotate/recenter.

## Decisions already made (confirmed with the requester — do not relitigate)

- **Distributed zones** (not a right pane, not a two-row bar): bottom-center hotbar,
  bottom-right camera dock, top-right file bar, left edge reserved/empty.
- **Camera controls live in the bottom-right dock**, NOT in the hotbar. The hotbar's
  view + file clusters are REMOVED.
- **Camera adjustment = hold-Space orbit + dock buttons** (rotate/zoom/recenter). No
  right/middle-drag gesture rewrite, no animated preset transitions (not chosen).
- **Inline SVG icons, no new dependencies.** Left pane deferred.

## Current state (verified at `123c418e` on `feat/island-editor-hotbar-ux`)

The package has no icon lib / no Tailwind; UI is inline SVG + hand `panel.css`.

### `island-editor/src/ui/ToolPanel.tsx` — the hotbar (as built by plan 001)

A `.hotbar` (`position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%)`)
with a `hotbar__hint` caption and a `hotbar__row` of `hotbar__group` clusters split by
`<span className="hotbar__divider" />`: **tools** (raise/lower/water/path/erase),
**brush** (1/2/3 as growing squares), **history** (undo/redo), **view** (Designer/Top),
**file** (Export/Import/Reset). It defines: a `svgProps` spread const; **13 inline SVG
icon components** (RaiseIcon, LowerIcon, WaterIcon, PathIcon, EraseIcon, UndoIcon,
RedoIcon, DesignerViewIcon, TopViewIcon, ExportIcon, ImportIcon, ResetIcon, and a
size-parametrized BrushIcon); a `TOOL_META` map; and a `HotbarButton` helper:

```tsx
function HotbarButton({ title, active, disabled, onClick, children }: {
  title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <button type="button" className={`hotbar__btn${active ? ' is-active' : ''}`}
      title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
```

`interface ToolPanelProps` currently carries: `tool`, `onToolChange`, `brushSize`,
`onBrushSizeChange`, `canUndo`, `canRedo`, `onUndo`, `onRedo`, `onReset`, `onExport`,
`onImport`, `onTopView`, `onDesignerView`.

### `island-editor/src/ui/panel.css`

`.hotbar` (column, centered), `.hotbar__hint`, `.hotbar__row` (glass card: `rgba(16,22,38,0.82)`,
`blur(8px)`, `border-radius: 16px`, `opacity: 0.9`→`1` on hover), `.hotbar__group`,
`.hotbar__divider` (1px vertical), `.hotbar__btn` (40×40 tile, `border-radius: 10px`,
hover `translateY(-1px) scale(1.05)`, `:active scale(0.96)`, `.is-active` = orange
`#ff7b54` + glow, `:disabled` dim), a `.hotbar__btn svg { width:20px; height:20px }`
rule, and a `@media (prefers-reduced-motion: reduce)` guard stripping transforms.

### `island-editor/src/App.tsx`

- `const [orbitEnabled, setOrbitEnabled] = useState(true)`; `onPaintStart` sets it
  false, `onPaintEnd` true (one undo command per stroke).
- `type OrbitControlsLike = { object: Camera; target: Vector3; update: () => void }`;
  `controlsRef` + `setControls` callback ref; `topView`/`designerView` move
  `object.position` and call `controls.update()`.
- A `keydown` effect handles undo/redo and skips when focus is in an editable element
  (`INPUT`/`TEXTAREA`/`isContentEditable`).
- Render: `<Canvas camera={{ position: [14,11,14], fov: 50 }}>` with `<Backdrop/>`,
  `<SeaSurface key={…} spec={spec}/>`, `<IslandTerrain spec brushSize onPaintStart
  onPaint onPaintEnd/>`, `<OrbitControls ref={setControls} makeDefault
  enabled={orbitEnabled}/>`, a hidden file `<input>`, and `<ToolPanel …/>` with all the
  props above.
- **NOTE (post-merge on main `a29a3cf2`)**: the `paint` useCallback now interpolates
  strokes via a `cellLine` import + a `lastCell` ref (merged from the sea/stroke polish
  PR #77 — `import { cellLine, … } from './terrain/terrainGrid'`, `const lastCell =
  useRef<{c:number;r:number}|null>(null)`, reset in `onPaintStart`). **This plan does
  NOT modify the paint handler** — its changes (cameraMode state, Space handling, the
  nudge callbacks, and rendering the three zones) are additive and in different regions.
  When you add the `cameraMode` gate in `IslandTerrain` (below), it sits above the paint
  path regardless of the interpolation. Do not remove or rewrite the `cellLine` logic.

### `island-editor/src/scene/IslandTerrain.tsx` — pointer handlers

```tsx
interface IslandTerrainProps { spec: IslandSpec; brushSize: number; onPaintStart?: () => void; onPaint?: (x: number, z: number) => void; onPaintEnd?: () => void }
// …
const handleDown = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); painting.current = true; onPaintStart?.(); onPaint?.(e.point.x, e.point.z) }
const handleMove = (e: ThreeEvent<PointerEvent>) => { moveCursor(e.point.x, e.point.z); if (!painting.current) return; onPaint?.(e.point.x, e.point.z) }
const handleOut = () => { if (cursorRef.current) cursorRef.current.visible = false }
```

### Conventions

- Inline SVG icons; buttons via a shared icon-button; hand CSS. No new deps.
- Pure helpers go in `src/…` with a `test/*.test.ts` (vitest node env) modeled on
  `island-editor/test/terrainGrid.test.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + tests | `pnpm check:island-editor` | exit 0 (83 tests + new ones) |
| Dev server (QA) | `pnpm dev:editor` | http://localhost:5180 |
| Scope check | `git diff --name-only <base>` | only files in Scope |
| No new deps | `git diff island-editor/package.json` | empty |

(`<base>` = `feat/island-editor-hotbar-ux`, or `main` if merged.)

## Target design

### Zones

- **Bottom-center `.hotbar`** (existing container, trimmed): tools · brush · undo/redo.
  Remove the **view** and **file** clusters (and their dividers).
- **Bottom-right `.camera-dock`** (NEW component + container): a compact glass card,
  `position: fixed; bottom: 20px; right: 20px`. Two rows / a small grid of icon tiles:
  Designer view, Top view, rotate ←, rotate →, zoom −, zoom +, recenter. A muted
  one-line "Hold Space to orbit" caption under it (subtle).
- **Top-right `.file-bar`** (NEW component + container): a small horizontal glass card,
  `position: fixed; top: 16px; right: 16px`: Export, Import, Reset. Give Reset a subtle
  destructive hover (e.g. red-tinted) — optional but nice.
- **Left edge**: nothing (reserved). Do not add a pane.

### Shared icon module — `src/ui/icons.tsx` (NEW; extract for 3 consumers)

Move the `svgProps` const, the `HotbarButton` helper (rename to **`IconButton`**), and
**all** icon components out of `ToolPanel.tsx` into `src/ui/icons.tsx`, and export them.
Add the **5 new camera icons** (starter path data — polish for 20px legibility):

- **RotateLeftIcon** — CCW arrow: `<path d="M4 9a8 8 0 1 1-1.5 5"/><path d="M4 4v5h5"/>`
- **RotateRightIcon** — CW arrow: `<path d="M20 9a8 8 0 1 0 1.5 5"/><path d="M20 4v5h-5"/>`
- **ZoomInIcon** — magnifier +: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/>`
- **ZoomOutIcon** — magnifier −: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>`
- **RecenterIcon** — frame/crosshair: `<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2"/>`

`IconButton` keeps the same shape/markup but uses a shared tile class. Rename the CSS
tile class `.hotbar__btn` → **`.tile`** and `.is-active` stays; update `panel.css` and
`IconButton`'s `className` accordingly (all three zones reuse `.tile`). Keep the
`prefers-reduced-motion` guard on `.tile`.

### `ToolPanel.tsx` (bottom hotbar — trimmed)

- Import `IconButton`, `svgProps`(if needed), and the tool/brush/history icons +
  `TOOL_META` from `./icons`.
- Keep clusters: **tools**, **brush**, **history**. **Delete** the view + file clusters.
- Trim `ToolPanelProps` to: `tool`, `onToolChange`, `brushSize`, `onBrushSizeChange`,
  `canUndo`, `canRedo`, `onUndo`, `onRedo`. Remove `onReset/onExport/onImport/onTopView/
  onDesignerView`.
- Container stays `.hotbar` / `.hotbar__row` / `.hotbar__group` / `.hotbar__divider`.

### `CameraDock.tsx` (NEW — bottom-right)

```tsx
interface CameraDockProps {
  onDesignerView: () => void; onTopView: () => void
  onRotateLeft: () => void; onRotateRight: () => void
  onZoomOut: () => void; onZoomIn: () => void
  onRecenter: () => void
}
```
Render a `.camera-dock` card with `IconButton`s: [Designer][Top] then [rotate←][rotate→]
[zoom−][zoom+][recenter] (a 2-column grid or two short rows — your call, keep it
compact), and a muted `.camera-dock__hint` "Hold Space to orbit".

### `FileBar.tsx` (NEW — top-right)

```tsx
interface FileBarProps { onExport: () => void; onImport: () => void; onReset: () => void }
```
Render a `.file-bar` card with `IconButton`s Export, Import, Reset. Reset may carry a
`.is-danger` class for a red hover (optional).

### Camera math — `src/scene/cameraOps.ts` (NEW; no three/r3f imports)

```ts
export interface Vec3 { x: number; y: number; z: number }

/** Orbit `pos` around the vertical (Y) axis through `target` by `angleRad`. Keeps
 *  height + radius; returns a NEW position. */
export function orbitAroundY(pos: Vec3, target: Vec3, angleRad: number): Vec3 {
  const ox = pos.x - target.x, oz = pos.z - target.z
  const c = Math.cos(angleRad), s = Math.sin(angleRad)
  return { x: target.x + ox * c - oz * s, y: pos.y, z: target.z + ox * s + oz * c }
}

/** Dolly toward (factor<1) / away (factor>1) from `target`, clamping distance to
 *  [minDist, maxDist]. Returns a NEW position. */
export function dolly(pos: Vec3, target: Vec3, factor: number, minDist = 4, maxDist = 120): Vec3 {
  const dx = pos.x - target.x, dy = pos.y - target.y, dz = pos.z - target.z
  const dist = Math.hypot(dx, dy, dz) || 1e-6
  const s = Math.min(maxDist, Math.max(minDist, dist * factor)) / dist
  return { x: target.x + dx * s, y: target.y + dy * s, z: target.z + dz * s }
}

export const ROTATE_STEP = Math.PI / 8
export const ZOOM_IN_FACTOR = 0.8
export const ZOOM_OUT_FACTOR = 1.25
export const DEFAULT_CAMERA: Vec3 = { x: 14, y: 11, z: 14 } // matches <Canvas camera position>
```

### `App.tsx` — camera mode, nudges, rewiring

- **Hold-Space orbit**: `const [cameraMode, setCameraMode] = useState(false)`. Add a
  key effect (reuse the `inEditable` guard): `keydown` Space (`e.code === 'Space'`) →
  `e.preventDefault(); setCameraMode(true)`; `keyup` Space → `setCameraMode(false)`;
  window `blur` → `setCameraMode(false)` (so a lost focus can't leave it stuck). Pass
  `cameraMode` to `<IslandTerrain>`.
- **Nudge callbacks** via `cameraOps` on `controlsRef.current`:
  ```tsx
  const nudge = useCallback((next: (p: Vec3, t: Vec3) => Vec3) => {
    const c = controlsRef.current; if (!c) return
    const p = next({ x: c.object.position.x, y: c.object.position.y, z: c.object.position.z },
                   { x: c.target.x, y: c.target.y, z: c.target.z })
    c.object.position.set(p.x, p.y, p.z); c.update()
  }, [])
  const zoomIn = useCallback(() => nudge((p, t) => dolly(p, t, ZOOM_IN_FACTOR)), [nudge])
  const zoomOut = useCallback(() => nudge((p, t) => dolly(p, t, ZOOM_OUT_FACTOR)), [nudge])
  const rotateLeft = useCallback(() => nudge((p, t) => orbitAroundY(p, t, ROTATE_STEP)), [nudge])
  const rotateRight = useCallback(() => nudge((p, t) => orbitAroundY(p, t, -ROTATE_STEP)), [nudge])
  const recenter = useCallback(() => {
    const c = controlsRef.current; if (!c) return
    c.target.set(0, 0, 0); c.object.position.set(DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z); c.update()
  }, [])
  ```
  (`OrbitControlsLike.target` is a `Vector3`, so `.set` typechecks.)
- **Render**: keep `<ToolPanel>` (trimmed props); add `<CameraDock onDesignerView
  onTopView onRotateLeft onRotateRight onZoomOut onZoomIn onRecenter/>` and `<FileBar
  onExport onImport onReset/>`. The hidden file `<input>` stays (FileBar's Import calls
  the same `openImport`).

### `IslandTerrain.tsx` — `cameraMode` guard

Add `cameraMode?: boolean`; at the top of `handleDown` and `handleMove`,
`if (cameraMode) { /* hide cursor in move */ return }` BEFORE `stopPropagation`/paint,
so the drag reaches OrbitControls.

## Steps

Order so each ends green. Steps 1–2 are additive; 3 is the icon extraction; 4–7 rewire.

### Step 1: `cameraOps.ts` + tests
Create the helper and `test/cameraOps.test.ts` (model after `test/terrainGrid.test.ts`):
`orbitAroundY` 90° maps `(10,5,0)`→`(0,5,10)` (±1e-9), preserves `y` + radius; 360°
round-trips; non-origin target works. `dolly` factor 0.5 halves distance; clamps at
`minDist`/`maxDist`; preserves direction; non-origin target works.
**Verify**: `pnpm check:island-editor` → exit 0; new tests pass.

### Step 2: `IslandTerrain.tsx` — `cameraMode` guard
**Verify**: `pnpm check:island-editor` → exit 0.

### Step 3: Extract `src/ui/icons.tsx`
Move `svgProps`, `HotbarButton`→`IconButton`, and all existing icons out of
`ToolPanel.tsx` into `icons.tsx`; add the 5 camera icons; rename the tile CSS class
`.hotbar__btn`→`.tile` in `panel.css` and `IconButton`. `ToolPanel.tsx` imports what it
needs from `./icons`.
**Verify**: `pnpm check:island-editor` → exit 0; `grep -c "<svg" island-editor/src/ui/icons.tsx` ≥ 18.

### Step 4: `ToolPanel.tsx` — trim to tools · brush · history
Delete the view + file clusters; trim `ToolPanelProps`.
**Verify**: `pnpm check:island-editor` → exit 0 (App.tsx will error until Step 6 rewires — acceptable mid-refactor; if you prefer green-every-step, do Steps 4–6 as one commit and verify after 6).

### Step 5: `CameraDock.tsx` + `FileBar.tsx` + their CSS
Create both components and add `.camera-dock`, `.camera-dock__hint`, `.file-bar` (and
optional `.tile.is-danger`) to `panel.css`, reusing `.tile`.
**Verify**: `pnpm check:island-editor` → exit 0.

### Step 6: `App.tsx` — camera mode + nudges + render the three zones
Add `cameraMode` + Space/keyup/blur handling; the `nudge` + 5 callbacks; render
`<CameraDock>` and `<FileBar>`; pass `cameraMode` to `<IslandTerrain>`; give `<ToolPanel>`
only its trimmed props.
**Verify**: `pnpm check:island-editor` → exit 0. `git diff --name-only <base>` shows only
the in-scope files.

### Step 7: Visual/interaction QA (`pnpm dev:editor`)
Screenshots if you have a browser tool, else report NOT RUN:
- [ ] Bottom-center hotbar shows ONLY tools · brush · undo/redo (no view/file buttons).
- [ ] Bottom-right camera dock shows Designer/Top + rotate ←→ + zoom −+ + recenter, with the "Hold Space to orbit" caption.
- [ ] Top-right file bar shows Export/Import/Reset (Reset hover reads as destructive if you added `.is-danger`).
- [ ] **Hold Space + drag on the island orbits** (no paint); release → paints again.
- [ ] Zoom −/+ dolly (and clamp — spam doesn't cross through / fly away); rotate ←→ orbit a step; recenter frames the island from any pose.
- [ ] Designer/Top presets still work; painting/undo/redo unaffected; no console errors.
- [ ] Nothing occludes the island at the default camera; the three zones don't overlap.

Then flip frontmatter `status`.

## Test plan
- `test/cameraOps.test.ts` (the risk-bearing math). No component-test infra exists — do
  NOT add jsdom/testing-library; the layout + wiring is verified by typecheck + Step 7.
- Expected: `pnpm check:island-editor` green with ~6 new tests (≈89 total on this base).

## Done criteria
ALL must hold:
- [ ] `pnpm check:island-editor` exits 0; `test/cameraOps.test.ts` passes.
- [ ] `git diff --name-only <base>` shows ONLY: `src/scene/cameraOps.ts`,
      `test/cameraOps.test.ts`, `src/scene/IslandTerrain.tsx`, `src/ui/icons.tsx`,
      `src/ui/ToolPanel.tsx`, `src/ui/CameraDock.tsx`, `src/ui/FileBar.tsx`,
      `src/ui/panel.css`, `src/App.tsx`.
- [ ] `git diff island-editor/package.json` empty (no new deps).
- [ ] `grep -n "import .*three" island-editor/src/scene/cameraOps.ts` → no matches.
- [ ] `grep -n "hotbar__group\|hotbar__divider" island-editor/src/ui/ToolPanel.tsx` shows tools/brush/history only (no view/file cluster; verify by reading — no Designer/Top/Export/Import/Reset in ToolPanel).
- [ ] Step 7 QA reported (run or NOT RUN).
- [ ] Frontmatter `status` updated.

## STOP conditions
- Base `ToolPanel.tsx` is still the old text-button panel (hotbar redesign not landed).
- Drift: `ToolPanel.tsx`/`App.tsx`/`IslandTerrain.tsx` changed since `123c418e` and no longer match "Current state".
- Hold-Space orbit doesn't work even with `cameraMode` suppressing the mesh handler — report what you observe (may need `enabled` forced true in camera mode); don't hack blindly.
- A new dependency or an out-of-scope file seems required.
- `pnpm check:island-editor` fails twice after a reasonable fix.

## Maintenance notes
- **Left pane is intentionally empty** — reserved for a future objects/inspector pane
  (the deferred placement plan `2026-06-19-004`). When that lands, the left edge is its home.
- **Three zones now consume screen corners** — bottom-center, bottom-right, top-right.
  A future status bar or second panel must avoid those.
- **`cameraMode` gates the paint path** — keep the early-return at the very top of
  `handleDown`/`handleMove` if the stroke logic is refactored (e.g. the polish branch's
  stroke interpolation).
- **Reviewer focus**: hotbar has ONLY the creative-loop controls; camera dock + file bar
  are separate components (no duplicate buttons); hold-Space fully suppresses painting;
  the `blur` reset works; dolly clamp holds. Confirm the `.tile` rename didn't leave
  stray `.hotbar__btn` references.
- **Supersedes plan 002** (camera-only): 002's camera controls live here in the dock.
- **Deferred (not chosen)**: right/middle-drag orbit, animated presets, touch gestures,
  keyboard tool shortcuts, a left pane.
