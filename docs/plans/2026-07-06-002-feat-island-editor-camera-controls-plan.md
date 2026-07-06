---
title: Island editor — camera adjustment during design (hold-Space orbit + camera buttons)
type: feat
status: superseded by 2026-07-06-003-feat-island-editor-distributed-layout-plan.md — its camera controls (hold-Space orbit + rotate/zoom/recenter + the pure cameraOps helper) are absorbed into the distributed-layout plan, where they live in a bottom-right CameraDock rather than the hotbar. Execute 003 instead; this file is retained for its cameraOps spec + rationale.
date: 2026-07-06
written_against_commit: 123c418e
base_branch: feat/island-editor-hotbar-ux
---

# Plan: Camera adjustment during design — hold-Space orbit + on-screen camera buttons

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report — do not improvise. When done, flip `status:` in this
> file's frontmatter to `done` (or `blocked: <reason>`).
>
> **Base branch (important)**: this plan builds on the bottom-hotbar redesign, which
> lives on branch `feat/island-editor-hotbar-ux` (commit `123c418e`) and is **not yet
> merged to main**. Create your branch from it:
> `git checkout -b feat/island-editor-camera-controls feat/island-editor-hotbar-ux`.
> **If that branch has already merged into `main`**, base on `main` instead — the only
> thing this plan needs from it is the new hotbar `ToolPanel` (icon buttons + the
> `hotbar__group`/`hotbar__divider`/`hotbar__btn` CSS). If `ToolPanel.tsx` is still the
> old *text-button* panel (has a `.tool-panel` / "Scene" section, not `.hotbar`), STOP
> and report — the hotbar redesign hasn't landed and this plan's ToolPanel excerpts
> won't match.
>
> **Drift check (run first)**:
> `git diff --stat 123c418e..HEAD -- island-editor/src/App.tsx island-editor/src/scene/IslandTerrain.tsx island-editor/src/ui/ToolPanel.tsx`
> If any of those changed since this plan was written, compare the "Current state"
> excerpts below against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (feature, user-requested)
- **Effort**: M
- **Risk**: LOW–MED (touches the paint pointer path and OrbitControls interplay; the pure camera math is unit-tested, the interaction needs browser QA)
- **Depends on**: the hotbar redesign (`feat/island-editor-hotbar-ux`, commit `123c418e`) for the ToolPanel structure. No other plan.
- **Category**: direction / feature
- **Planned at**: commit `123c418e`, 2026-07-06

## Why this matters

While designing, the only camera move that works over the island today is the
scroll-wheel. The terrain mesh's pointer handler fires on **any** mouse button and
`stopPropagation`s, and starting a stroke disables OrbitControls — so any click-drag
on the island paints and the camera is stuck. To reposition the view you must drag on
empty sky or use the two jump presets (Designer view / Top view). That's real friction
for a design tool.

This adds two camera-adjustment affordances the requester chose:

1. **Hold-Space to orbit** — while Space is held, painting is suppressed so a drag
   drives OrbitControls (orbit/pan) even when the pointer is over the island. Release
   Space and painting resumes. (Figma/Spline-style navigation.)
2. **On-screen camera buttons** in the hotbar — zoom in / out, rotate left / right,
   and recenter (frame the island) — for players who won't discover the key.

The rotate/zoom math is extracted into a pure, unit-tested helper so the risky part is
covered without a WebGL harness.

## Decisions already made (confirmed with the requester — do not relitigate)

- **Two mechanisms only**: hold-key orbit + on-screen camera buttons. The requester
  did **not** choose the right/middle-drag gesture rewrite or animated preset
  transitions — leave the existing mouse-button behavior otherwise as-is, and keep the
  Designer/Top presets as instant jumps.
- **Modifier key = Space.** Held → camera mode (drag orbits/pans, paint suppressed).
- **Camera buttons live in the hotbar's camera cluster**: zoom−, zoom+, rotate←,
  rotate→, recenter. Inline SVG icons (no icon dependency), matching the hotbar.

## Current state (verified at `123c418e` on `feat/island-editor-hotbar-ux`)

The island-editor package has **no icon library and no Tailwind**; UI is inline SVG +
hand-written `panel.css`. Camera control is drei `OrbitControls` with default mouse
mapping (LEFT=rotate, MIDDLE=dolly, RIGHT=pan, wheel=dolly), `enabled={orbitEnabled}`.

### `island-editor/src/App.tsx` — relevant excerpts

State + the OrbitControls type (top of `App`):

```tsx
const [orbitEnabled, setOrbitEnabled] = useState(true)
// …
type OrbitControlsLike = { object: Camera; target: Vector3; update: () => void }
```

Paint start disables orbit; paint end re-enables it (lines ~70–117):

```tsx
const onPaintStart = useCallback(() => {
  setOrbitEnabled(false)
  // …snapshot + visited.clear()
}, [])
// paint(x,z): worldToCell → brushCells → tool switch → setGridTick
const onPaintEnd = useCallback(() => {
  setOrbitEnabled(true)
  // …push one undo command
}, [stack, bumpStack, applySnapshot])
```

A `keydown` effect already handles undo/redo (lines ~127–146) and skips when focus is
in an editable element:

```tsx
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const inEditable = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    if (inEditable) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
    else if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [undo, redo])
```

Camera presets capture the OrbitControls instance and move `object.position` (lines
~180–203):

```tsx
const controlsRef = useRef<OrbitControlsLike | null>(null)
const setControls = useCallback((instance: OrbitControlsLike | null) => { controlsRef.current = instance }, [])
const topView = useCallback(() => {
  const controls = controlsRef.current; if (!controls) return
  const { object, target } = controls
  const dist = object.position.distanceTo(target)
  object.position.set(target.x, target.y + dist, target.z + 0.001)
  controls.update()
}, [])
const designerView = useCallback(() => { /* elevated ~52°: target.y + dist*0.79, target.z + dist*0.61 */ }, [])
```

Render (lines ~205–241): `<Canvas camera={{ position: [14, 11, 14], fov: 50 }}>` with
`<IslandTerrain spec brushSize onPaintStart onPaint onPaintEnd />`,
`<OrbitControls ref={setControls} makeDefault enabled={orbitEnabled} />`, and a
`<ToolPanel …/>` receiving `onTopView={topView} onDesignerView={designerView}` (among
others).

### `island-editor/src/scene/IslandTerrain.tsx` — the pointer handlers

```tsx
interface IslandTerrainProps {
  spec: IslandSpec
  brushSize: number
  onPaintStart?: () => void
  onPaint?: (x: number, z: number) => void
  onPaintEnd?: () => void
}
// …
const handleDown = (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation()
  painting.current = true
  onPaintStart?.()
  onPaint?.(e.point.x, e.point.z)
}
const handleMove = (e: ThreeEvent<PointerEvent>) => {
  moveCursor(e.point.x, e.point.z)
  if (!painting.current) return
  onPaint?.(e.point.x, e.point.z)
}
const handleOut = () => { if (cursorRef.current) cursorRef.current.visible = false }
```

The mesh wires `onPointerDown={handleDown} onPointerMove={handleMove} onPointerOut={handleOut}`.
There is also a window `pointerup` effect that ends the stroke.

### `island-editor/src/ui/ToolPanel.tsx` — the hotbar (from the redesign)

A `.hotbar` with a `hotbar__hint` caption and a `hotbar__row` of `hotbar__group`
clusters separated by `<span className="hotbar__divider" />`. Tools, brush, history,
**view** (Designer + Top), and file clusters. Reusable `HotbarButton` helper:

```tsx
function HotbarButton({ title, active, disabled, onClick, children }: {
  title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) { /* <button className={`hotbar__btn${active ? ' is-active' : ''}`} title aria-label aria-pressed disabled onClick> */ }
```

Icons are inline SVG components sharing a `svgProps` spread const
(`viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} …`). Props are
declared in `interface ToolPanelProps { … onTopView: () => void; onDesignerView: () => void }`.

### Conventions to match

- Inline SVG icons using the existing `svgProps` spread; new buttons use `HotbarButton`.
- No new dependencies. Hand CSS in `panel.css` (reuse `hotbar__group`/`__divider`/`__btn`).
- Pure, framework-free helpers go in `src/…` with a matching `test/*.test.ts` (vitest,
  `environment: 'node'`); model tests after `island-editor/test/terrainGrid.test.ts`
  (small pure-function cases with hand-built inputs).

## Commands you will need

Run from the repo root:

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + tests | `pnpm check:island-editor` | exit 0 (83 tests + your new ones) |
| Dev server (QA) | `pnpm dev:editor` | serves http://localhost:5180 |
| Scope check | `git diff --name-only <base>` | only the files in Scope |
| No new deps | `git diff island-editor/package.json` | empty |

(`<base>` = `feat/island-editor-hotbar-ux`, or `main` if that has merged — see the base-branch note.)

## Scope

**In scope** (the only files you may create/modify):
- `island-editor/src/scene/cameraOps.ts` — NEW pure helper (orbit/dolly math).
- `island-editor/test/cameraOps.test.ts` — NEW unit tests.
- `island-editor/src/App.tsx` — Space-key camera mode, camera-nudge callbacks, wiring.
- `island-editor/src/scene/IslandTerrain.tsx` — accept + honor a `cameraMode` prop.
- `island-editor/src/ui/ToolPanel.tsx` — camera-button cluster + icons + props.
- `island-editor/src/ui/panel.css` — only if a new class is genuinely needed (prefer reusing `hotbar__group`/`__divider`).
- This plan's frontmatter `status`.

**Out of scope** (do NOT touch):
- The paint/tool logic itself (tools, brush, grid ops), the sea/terrain shaders, the
  spec/persistence, the agent ops.
- Right/middle-drag gesture behavior — NOT chosen; do not add gesture-based orbit.
- Animated/eased preset transitions — NOT chosen; keep presets instant.
- `island-editor/package.json` — no new dependencies.
- Anything outside `island-editor/`.

## Git workflow

- Branch: `feat/island-editor-camera-controls` from the base branch (see the note).
- One or two commits; message e.g. `feat(island-editor): camera adjustment during design (hold-Space orbit + camera buttons)`.
- Do NOT push, merge, or open a PR.

## Target design

### 1. Pure camera math — `src/scene/cameraOps.ts` (no three/r3f imports)

Operate on plain `{x, y, z}` coordinates so it's trivially testable:

```ts
export interface Vec3 { x: number; y: number; z: number }

/** Orbit a camera position around the vertical (Y) axis through `target` by
 *  `angleRad` (radians). Keeps height and radius; returns a NEW position. */
export function orbitAroundY(pos: Vec3, target: Vec3, angleRad: number): Vec3 {
  const ox = pos.x - target.x
  const oz = pos.z - target.z
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    x: target.x + ox * cos - oz * sin,
    y: pos.y,
    z: target.z + ox * sin + oz * cos,
  }
}

/** Dolly the camera toward (factor < 1) or away from (factor > 1) `target`,
 *  clamping the resulting distance to [minDist, maxDist]. Returns a NEW position. */
export function dolly(pos: Vec3, target: Vec3, factor: number, minDist = 4, maxDist = 120): Vec3 {
  const dx = pos.x - target.x, dy = pos.y - target.y, dz = pos.z - target.z
  const dist = Math.hypot(dx, dy, dz) || 1e-6
  const clamped = Math.min(maxDist, Math.max(minDist, dist * factor))
  const s = clamped / dist
  return { x: target.x + dx * s, y: target.y + dy * s, z: target.z + dz * s }
}
```

Export a couple of named steps used by the buttons:
`export const ROTATE_STEP = Math.PI / 8`  (22.5° per click),
`export const ZOOM_IN_FACTOR = 0.8`, `export const ZOOM_OUT_FACTOR = 1.25`,
and `export const DEFAULT_CAMERA: Vec3 = { x: 14, y: 11, z: 14 }` (matches the initial
`<Canvas camera position>`).

### 2. `IslandTerrain.tsx` — honor a `cameraMode` prop

Add `cameraMode?: boolean` to `IslandTerrainProps`. When true, the pointer must NOT
paint and must NOT `stopPropagation`, so the drag reaches OrbitControls (orbit/pan):

```tsx
const handleDown = (e: ThreeEvent<PointerEvent>) => {
  if (cameraMode) return           // let OrbitControls handle the drag
  e.stopPropagation()
  painting.current = true
  onPaintStart?.()
  onPaint?.(e.point.x, e.point.z)
}
const handleMove = (e: ThreeEvent<PointerEvent>) => {
  if (cameraMode) { if (cursorRef.current) cursorRef.current.visible = false; return }
  moveCursor(e.point.x, e.point.z)
  if (!painting.current) return
  onPaint?.(e.point.x, e.point.z)
}
```

(Hide the brush cursor while in camera mode so it doesn't imply painting.)

### 3. `App.tsx` — Space camera mode + nudge callbacks + wiring

- **State**: `const [cameraMode, setCameraMode] = useState(false)`.
- **Key handling** (extend the existing keydown effect OR add a dedicated effect):
  - `keydown` Space (`e.code === 'Space'` or `e.key === ' '`), when NOT in an editable
    target: `e.preventDefault(); setCameraMode(true)`. Space keydown repeats — that's
    fine (idempotent).
  - `keyup` Space: `setCameraMode(false)`.
  - `window` `blur`: `setCameraMode(false)` (so a lost focus while held doesn't leave
    camera mode stuck on).
  - Reuse the existing `inEditable` guard.
- **Nudge callbacks** (each reads `controlsRef.current`, applies `cameraOps`, writes
  `object.position.set(...)`, calls `controls.update()`):
  ```tsx
  const nudge = useCallback((next: (pos: Vec3, target: Vec3) => Vec3) => {
    const controls = controlsRef.current; if (!controls) return
    const { object, target } = controls
    const p = next({ x: object.position.x, y: object.position.y, z: object.position.z },
                    { x: target.x, y: target.y, z: target.z })
    object.position.set(p.x, p.y, p.z)
    controls.update()
  }, [])
  const zoomIn      = useCallback(() => nudge((p, t) => dolly(p, t, ZOOM_IN_FACTOR)), [nudge])
  const zoomOut     = useCallback(() => nudge((p, t) => dolly(p, t, ZOOM_OUT_FACTOR)), [nudge])
  const rotateLeft  = useCallback(() => nudge((p, t) => orbitAroundY(p, t, ROTATE_STEP)), [nudge])
  const rotateRight = useCallback(() => nudge((p, t) => orbitAroundY(p, t, -ROTATE_STEP)), [nudge])
  const recenter    = useCallback(() => {
    const controls = controlsRef.current; if (!controls) return
    controls.target.set(0, 0, 0)
    controls.object.position.set(DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z)
    controls.update()
  }, [])
  ```
  Import `{ Vec3, dolly, orbitAroundY, recenter constants… }` from `./scene/cameraOps`.
  Note: `OrbitControlsLike` already exposes `object` and `target`; `target.set(...)` is
  a `Vector3` method — extend the `OrbitControlsLike` type's `target` to `Vector3`
  (it already is) so `.set` typechecks (it does — `Vector3` has `.set`).
- **Wiring**: pass `cameraMode={cameraMode}` to `<IslandTerrain>`; pass
  `onZoomIn={zoomIn} onZoomOut={zoomOut} onRotateLeft={rotateLeft}
  onRotateRight={rotateRight} onRecenter={recenter}` to `<ToolPanel>`.
- Optionally set the canvas cursor to `grab` while `cameraMode` (e.g. a `className`
  toggle on the wrapping `<div>` + a CSS rule). Nice-to-have, not required.

### 4. `ToolPanel.tsx` — camera cluster + icons

- Extend `ToolPanelProps` with `onZoomIn, onZoomOut, onRotateLeft, onRotateRight,
  onRecenter: () => void` (additive — App passes them). Destructure them.
- Add 5 inline SVG icons using the existing `svgProps` spread (starter path data —
  polish for legibility at 20px):
  - **zoomIn** — magnifier + plus: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/>`
  - **zoomOut** — magnifier + minus: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>`
  - **rotateLeft** — CCW arrow: `<path d="M4 9a8 8 0 1 1-1.5 5"/><path d="M4 4v5h5"/>`
  - **rotateRight** — CW arrow (mirror): `<path d="M20 9a8 8 0 1 0 1.5 5"/><path d="M20 4v5h-5"/>`
  - **recenter** — frame/crosshair: `<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2"/>`
- Add a camera cluster after the existing view cluster (Designer/Top), separated by a
  `hotbar__divider`:
  ```tsx
  <span className="hotbar__divider" />
  <div className="hotbar__group">
    <HotbarButton title="Rotate left"  onClick={onRotateLeft}><RotateLeftIcon /></HotbarButton>
    <HotbarButton title="Rotate right" onClick={onRotateRight}><RotateRightIcon /></HotbarButton>
    <HotbarButton title="Zoom out"     onClick={onZoomOut}><ZoomOutIcon /></HotbarButton>
    <HotbarButton title="Zoom in"      onClick={onZoomIn}><ZoomInIcon /></HotbarButton>
    <HotbarButton title="Recenter (frame the island)" onClick={onRecenter}><RecenterIcon /></HotbarButton>
  </div>
  ```
- Add a subtle affordance for the key: append " · Hold Space to orbit" is too noisy in
  the per-tool hint; instead give the camera cluster's first button a title that hints
  it, OR add one muted line. Minimal acceptable: a `title` on the Recenter/rotate
  buttons is enough; a nicer touch is a tiny persistent "Hold Space to orbit" note — if
  you add it, keep it muted and out of the way. Do not overbuild.

## Steps

### Step 1: Pure camera math + tests

Create `src/scene/cameraOps.ts` and `test/cameraOps.test.ts`.

New tests (model after `test/terrainGrid.test.ts`):
- `orbitAroundY` by `Math.PI/2` around origin moves `(10,5,0)` → `(0,5,10)` (within 1e-9),
  preserves `y`, preserves radius (`hypot(x,z)`).
- `orbitAroundY` by `2π` returns (within 1e-9) the input.
- `dolly` with factor `0.5` halves the distance to target; clamps at `minDist` when the
  factor would go under it and at `maxDist` when over; preserves direction (the new
  offset is parallel to the old).
- `dolly`/`orbitAroundY` around a non-origin target work (translate-invariance).

**Verify**: `pnpm check:island-editor` → exit 0; the new tests pass; the 83 existing pass.

### Step 2: `IslandTerrain.tsx` — `cameraMode` guard

Add the prop and the two early-returns per "Target design → 2". Nothing else changes.

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 3: `App.tsx` — Space mode, nudges, wiring

Add `cameraMode` state + Space keydown/keyup + window `blur` reset; add the `nudge`
helper and the five callbacks; pass `cameraMode` to `<IslandTerrain>` and the five
`on*` camera props to `<ToolPanel>`. Import from `./scene/cameraOps`.

**Verify**: `pnpm check:island-editor` → exit 0. `git diff --name-only <base>` shows
only the in-scope files.

### Step 4: `ToolPanel.tsx` — camera cluster + icons

Extend `ToolPanelProps`, add the 5 icons + the camera cluster.

**Verify**: `pnpm check:island-editor` → exit 0. `grep -c "<svg" island-editor/src/ui/ToolPanel.tsx` increased by 5 (was 13 → 18).

### Step 5: Visual/interaction QA (`pnpm dev:editor`)

Confirm — screenshots if you have a browser tool, else report NOT RUN for a human:

- [ ] With Raise active, **hold Space and drag on the island → the camera orbits**
      (no painting happens); release Space and drag → paints again.
- [ ] Space + right-drag pans (OrbitControls default) — bonus, should work.
- [ ] **Zoom in / Zoom out** buttons dolly the camera (and clamp — spamming zoom-in
      doesn't cross through the island; zoom-out stops at a sane distance).
- [ ] **Rotate left / right** buttons orbit the view by a step each click.
- [ ] **Recenter** returns to the default framing from any camera pose.
- [ ] Painting still works normally when Space is not held; undo/redo unaffected.
- [ ] No console errors. The camera buttons render as icons (no tofu) in the hotbar.

Then flip this plan's frontmatter `status`.

## Test plan

- New `test/cameraOps.test.ts` covering `orbitAroundY` (90°, 360°, non-origin target)
  and `dolly` (halving, min/max clamp, direction preserved, non-origin target). This is
  the risk-bearing math and is fully pure-testable.
- The Space-mode gate and button wiring are verified by typecheck + the Step 5 QA (the
  package has no component-test infra; do not add jsdom/testing-library).
- Expected: `pnpm check:island-editor` green with ~6 new tests (≈89 total on this base).

## Done criteria

ALL must hold:

- [ ] `pnpm check:island-editor` exits 0; `test/cameraOps.test.ts` exists and passes.
- [ ] `git diff --name-only <base>` shows ONLY: `src/scene/cameraOps.ts`,
      `test/cameraOps.test.ts`, `src/App.tsx`, `src/scene/IslandTerrain.tsx`,
      `src/ui/ToolPanel.tsx` (and `src/ui/panel.css` only if a class was truly needed).
- [ ] `git diff island-editor/package.json` is empty (no new deps).
- [ ] `grep -n "import .*three" island-editor/src/scene/cameraOps.ts` → no matches
      (the helper is framework-free).
- [ ] `grep -c "<svg" island-editor/src/ui/ToolPanel.tsx` ≥ 18.
- [ ] Step 5 QA reported (run or explicitly NOT RUN).
- [ ] Frontmatter `status` updated.

## STOP conditions

Stop and report (do not improvise) if:

- The base branch's `ToolPanel.tsx` is still the old text-button `.tool-panel` (the
  hotbar redesign hasn't landed) — this plan's ToolPanel excerpts won't match.
- The drift check shows `App.tsx` / `IslandTerrain.tsx` / `ToolPanel.tsx` changed since
  `123c418e` and no longer match "Current state".
- Hold-Space orbit does not work because OrbitControls isn't receiving the drag even
  with `cameraMode` suppressing the mesh handler — report what you observe (it may need
  `enabled` to be forced true during camera mode, or the mesh's `onPointerDown` still
  intercepting; do not hack around it blindly).
- Achieving this appears to require a new dependency or touching out-of-scope files.
- `pnpm check:island-editor` fails twice after a reasonable fix.

## Maintenance notes

- **Interaction with the paint path**: `cameraMode` gates the mesh pointer handler. If
  the paint/stroke logic is refactored later (e.g. the polish branch's stroke
  interpolation), keep the `cameraMode` early-return at the very top of `handleDown` /
  `handleMove`.
- **The `nudge` helper reads/writes `OrbitControls.object.position` + `.target`**; if
  the camera controls are swapped (e.g. MapControls, or a custom rig), re-point these.
- **Deliberately deferred** (not chosen this round): right/middle-drag orbit over the
  island, animated preset transitions, touch/pinch camera gestures, keyboard tool
  shortcuts. Each is additive.
- **Reviewer focus**: confirm painting is fully suppressed while Space is held (no
  stray dab on Space+drag), the `blur` reset prevents a stuck camera mode, and the
  dolly clamp keeps the camera from crossing through or flying away from the island.
- If the hotbar redesign and this both merge, the hotbar `ToolPanel` gains the camera
  cluster — verify no duplicate view/camera buttons after any rebase.
