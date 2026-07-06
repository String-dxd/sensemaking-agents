---
title: Island editor — bottom hotbar UX redesign (Spline + sandbox-game inspired)
type: feat
status: implemented — executed on branch feat/island-editor-hotbar-ux (from main, commit 123c418e), advisor-reviewed & APPROVED (gates 83 tests green; scope clean — only the 2 ui/ files; App.tsx + package.json diffs empty; 13 inline SVGs; dead CSS removed; live browser QA confirms hotbar renders + tool/brush switching + hint update work; console clean). PENDING operator look sign-off before merge.
date: 2026-07-06
written_against_commit: 288f7375
---

# Plan: Redesign the island-editor ToolPanel as a bottom-center icon hotbar

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report — do not improvise. When done, flip `status:` in this
> file's frontmatter to `done` (or `blocked: <reason>`).
>
> **Drift check (run first)**:
> `git diff --stat 288f7375..HEAD -- island-editor/src/ui/`
> If either `ToolPanel.tsx` or `panel.css` changed since this plan was written,
> compare the "Current state" excerpts below against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (UX polish, user-requested)
- **Effort**: M
- **Risk**: LOW (one component + its CSS; the props API is unchanged so the rest of the app is untouched)
- **Depends on**: none
- **Category**: direction / dx / ux
- **Planned at**: commit `288f7375`, 2026-07-06

## Why this matters

The island editor's control surface is currently a top-right panel of plain
text-label buttons (`Raise`, `Lower`, `Water`… in 2-column grids). It reads like
a settings form, not a creative/game tool — at odds with the editor's whole point
(an Animal-Crossing/Pokopia-style terraforming sandbox). It also sits at
`opacity: 0.22` until hovered, so the primary control is nearly invisible at rest.

This redesign turns it into a **bottom-center floating icon hotbar** — the synthesis
the requester chose: a Spline-style floating toolbar crossed with a sandbox-game
hotbar. Tools become icons; brush size, camera, history, and file actions become
compact icon clusters. Visual character is a **balanced hybrid**: Spline's clean
structure with tactile, game-y icon tiles, the existing orange accent, and
satisfying hover/press feedback. The bar is always visible.

**Scope is deliberately tight**: the `ToolPanel` component's *props interface does
not change*, so only two files move — `ToolPanel.tsx` (markup) and `panel.css`
(styles). `App.tsx` and everything else stay byte-for-byte identical.

## Decisions already made (do not relitigate — confirmed with the requester)

1. **Layout: bottom-center floating hotbar** (not the top-right panel, not a left rail).
2. **Visual feel: balanced hybrid** — Spline-clean + game-tactile, keep the orange
   accent `#ff7b54`, add hover-scale and press feedback and an active-tool glow.
3. **Icons: inline hand-written SVG.** Do NOT add an icon library or any dependency
   (the island-editor package is intentionally minimal — see "Out of scope").
4. **Always visible.** Drop the `opacity: 0.22` rest state; the hotbar is the primary
   control. A gentle idle→hover lift is fine; near-invisible is not.
5. **Props API frozen.** `ToolPanelProps` stays exactly as it is so `App.tsx` needs
   no change.

## Current state (verified at `288f7375`)

Two files, both under `island-editor/src/ui/`. The island-editor package has **no
icon library and no Tailwind** (deps: react, react-dom, three, @react-three/fiber,
@react-three/drei, leva). Styling is a single hand-written `panel.css` imported by
the component. There is **no test** for this component (the vitest suite is
pure-core only, `environment: 'node'`).

### `island-editor/src/ui/ToolPanel.tsx` (current — full file)

```tsx
import './panel.css'

export type Tool = 'raise' | 'lower' | 'water' | 'path' | 'erase'
export type BrushSize = 1 | 2 | 3

const TOOLS: Tool[] = ['raise', 'lower', 'water', 'path', 'erase']
const SIZES: BrushSize[] = [1, 2, 3]

const TOOL_HINTS: Record<Tool, string> = {
  raise: 'Click-drag to raise land one cliff tier per stroke.',
  lower: 'Click-drag to lower land one cliff tier per stroke.',
  water: 'Carve cells down to the ocean floor — water flows in.',
  path: 'Paint a dirt path onto flat ground.',
  erase: 'Erase painted paths back to grass or sand.',
}

interface ToolPanelProps {
  tool: Tool
  onToolChange: (t: Tool) => void
  brushSize: BrushSize
  onBrushSizeChange: (s: BrushSize) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onExport: () => void
  onImport: () => void
  onTopView: () => void
  onDesignerView: () => void
}
// …then a JSX body rendering: title, undo/redo, a "Tool" section of 5 text
// buttons, a hint line, a "Brush size" section of 3 text buttons, and a "Scene"
// section of 5 text buttons (Designer view / Top view / Export / Import / Reset).
```

**The `ToolPanelProps` interface and the two exported types (`Tool`, `BrushSize`)
must be preserved exactly** — `App.tsx` imports `{ type BrushSize, type Tool, ToolPanel }`
and passes every one of those props.

### `island-editor/src/ui/panel.css` (current)

A `.tool-panel` fixed top-right glass card (`top: 12px; right: 12px; width: 252px`,
`background: rgba(16,22,38,0.82)`, `backdrop-filter: blur(8px)`, `opacity: 0.22`
rising to `1` on hover). Buttons: `.tool-panel button` (subtle outline, orange
`.is-active` = `#ff7b54` bg / `#1a1206` text). Class families: `__title`,
`__topbar`, `__history`, `__modes` (2-col grid), `__section`, `__hint`, `__actions`.
**Dead classes from the removed profile UI still linger** and must be deleted:
`.tool-panel__tabs`, `.tool-panel__row`, `.tool-panel__label`, `.tool-panel__value`,
`.tool-panel__coords`, `.tool-panel__pointbtns`, and the `input[type='range']` /
`input[type='number']` rules (nothing renders them anymore).

### Repo conventions to match

- Hand-written CSS in `panel.css`; no CSS-in-JS, no Tailwind, no new deps.
- Keep the accent orange `#ff7b54` and the dark glass palette already in the file.
- The component is imported/used only by `island-editor/src/App.tsx:14,226-240`.
- Comment style: sparse, only where a constraint isn't obvious.

## Commands you will need

Run from the repo root (all verified against this repo):

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + tests | `pnpm check:island-editor` | exit 0 (87 tests) |
| Dev server (visual QA) | `pnpm dev:editor` | serves http://localhost:5180 |
| Scope check | `git status --short` | only the two `ui/` files changed |
| No new deps | `git diff island-editor/package.json` | empty |

## Scope

**In scope** (the ONLY files you may modify):
- `island-editor/src/ui/ToolPanel.tsx` — rewrite the markup + add icon components/meta.
- `island-editor/src/ui/panel.css` — rewrite for the hotbar; delete dead classes.
- This plan file's frontmatter `status`.

**Out of scope** (do NOT touch):
- `island-editor/src/App.tsx` — the props API is frozen; if you feel you must change
  it, STOP (see STOP conditions). It must compile unchanged.
- `island-editor/package.json` — no new dependencies (no icon lib, no testing-library,
  no jsdom). Icons are inline SVG.
- Any `terrain/`, `scene/`, `editor/`, `agent/` file, and anything outside `island-editor/`.
- The tool behavior, brush logic, camera presets — visual/markup only.

## Git workflow

- Branch: `feat/island-editor-hotbar-ux` (from `main`, or stack on the current branch
  if instructed).
- One commit is fine (single-component change); message
  `feat(island-editor): bottom hotbar UX (icon tools, Spline+sandbox inspired)`.
- Do NOT push or open a PR unless the operator instructs it.

## Target design

### Layout (bottom-center hotbar)

A single floating bar, horizontally centered at the bottom, containing grouped
clusters separated by thin dividers, left→right:

```
        ╭──────────────────────────────────────────────────────╮
        │  [◭ ▽ ≈ ⌇ ⌫]  │  [▪ ▫ ▫]  │  [↶ ↷]  │  [⌂ ⊞]  │  [⤓ ⤒ ⟲] │
        │    tools          brush       history    view      file   │
        ╰──────────────────────────────────────────────────────╯
                  ▲ active tool's hint floats just above the bar
```

- **Tools cluster**: 5 icon buttons — raise, lower, water, path, erase. Exactly one
  active (orange fill + soft glow). Others are quiet tiles.
- **Brush cluster**: 3 buttons showing a small / medium / large filled square (so
  size is glanceable, not just "1×1/2×2/3×3" text — put the text in the tooltip).
- **History cluster**: undo, redo. Respect `canUndo`/`canRedo` (disabled + dimmed).
- **View cluster**: Designer view, Top view.
- **File cluster**: Export, Import, Reset.
- Each button is icon-only with a **tooltip** (`title` + `aria-label`). The active
  tool's `TOOL_HINTS[tool]` renders as a small caption centered just above the bar.

### Visual character (balanced hybrid)

- Bar: reuse the dark glass tokens — `background: rgba(16,22,38,0.82)`,
  `backdrop-filter: blur(8px)`, `border-radius: 16px`,
  `box-shadow: 0 8px 30px rgba(0,0,0,0.35)`, plus a subtle top hairline
  (`box-shadow` inset or a `1px` translucent border). `position: fixed; bottom: 20px;
  left: 50%; transform: translateX(-50%)`. **Always visible** (no `0.22` rest state);
  optional idle `opacity: 0.9` → `1` on `:hover` is fine.
- Buttons (tiles): ~40×40px, `border-radius: 10px`, quiet bg
  `rgba(255,255,255,0.05)`, `1px` translucent border, icon stroke `#cfd8ea`.
- Hover: bg `rgba(255,255,255,0.12)` + `transform: translateY(-1px) scale(1.05)`.
- Press (`:active`): `transform: scale(0.96)`.
- Active tool (`.is-active`): `background: #ff7b54`, icon color `#1a1206`,
  `box-shadow: 0 0 0 1px #ff7b54, 0 0 12px rgba(255,123,84,0.5)` (the game-y glow).
- Brush-size active: same orange treatment (it's a selection, not a tool).
- Dividers: `1px` vertical `rgba(255,255,255,0.12)` between clusters, with small gaps.
- Transitions: `transition: transform 120ms ease, background 120ms, box-shadow 120ms`.
- Respect reduced motion: wrap the scale/translate transitions so they're removed
  under `@media (prefers-reduced-motion: reduce)`.

### Inline SVG icons (starting point — refine strokes if needed)

Define one small stateless `Icon` per glyph (24×24 viewBox, `stroke="currentColor"`,
`fill="none"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
unless a fill reads better). Suggested, recognizable shapes — the executor may
polish the paths, but ship glyphs that read at 20px:

- **raise** — up chevron over a baseline: `M6 14l6-6 6 6` + `M5 19h14`.
- **lower** — down chevron over a baseline: `M6 10l6 6 6-6` + `M5 5h14`.
- **water** — two stacked waves: `M3 8q3-3 6 0t6 0 6 0` and the same at `y=14`.
- **path** — dashed centerline / footsteps: a dashed line
  `M4 12h4M12 12h4M20 12h0` (use `stroke-dasharray` or discrete segments) or two
  footprint ellipses.
- **erase** — eraser block: a rounded rect tilted, `M4 16l8-8 4 4-8 8H6z` style + a
  baseline `M3 21h10`.
- **undo** — curved left arrow: `M9 7L4 12l5 5` + `M4 12h11a4 4 0 0 1 0 8h-1`.
- **redo** — mirror of undo.
- **designer view** — a 3/4 cube: hexagon outline + inner Y (`M12 3l8 4.5v9L12 21l-8-4.5v-9z` + `M12 12v9M12 12l8-4.5M12 12L4 7.5`).
- **top view** — square grid: outer rounded square + a cross (`M4 4h16v16H4z` + `M12 4v16M4 12h16`).
- **export** — tray with up-out arrow: `M12 3v10M8 7l4-4 4 4` + `M4 15v4h16v-4`.
- **import** — tray with down-in arrow: `M12 13V3M8 9l4 4 4-4` + `M4 15v4h16v-4`.
- **reset** — circular arrow: `M4 12a8 8 0 1 1 2.3 5.6` + arrowhead `M4 20v-4h4`.
- **brush sizes** — a centered filled square that grows: 1×1 → `8×8`, 2×2 → `12×12`,
  3×3 → `16×16` `<rect>` centered in the viewBox (use `fill="currentColor"`).

### Component shape (structure, not verbatim)

Keep the two exported types and the frozen `ToolPanelProps` and `TOOL_HINTS`
exactly. Add metadata + a reusable button, e.g.:

```tsx
const TOOL_META: Record<Tool, { label: string; Icon: () => JSX.Element }> = {
  raise: { label: 'Raise', Icon: RaiseIcon },
  lower: { label: 'Lower', Icon: LowerIcon },
  water: { label: 'Water', Icon: WaterIcon },
  path:  { label: 'Path',  Icon: PathIcon },
  erase: { label: 'Erase', Icon: EraseIcon },
}

function HotbarButton({ title, active, disabled, onClick, children }: {
  title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`hotbar__btn${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

Then the returned markup is a single `<div className="hotbar">` with:
`<div className="hotbar__hint">{TOOL_HINTS[tool]}</div>` (positioned above the bar),
then a `<div className="hotbar__row">` of clustered groups
(`<div className="hotbar__group">…</div>` separated by
`<span className="hotbar__divider" />`): tools (map `TOOLS`), brush (map `SIZES`
with the size-square icon), history (undo/redo with `disabled={!canUndo}` /
`disabled={!canRedo}`), view (designer/top), file (export/import/reset).
Keep `import './panel.css'` at the top. Titles include the shortcut where one
exists, e.g. `title="Undo (⌘Z)"`.

You may keep the class prefix `tool-panel` if you prefer minimal churn, but the
plan uses `hotbar` for clarity — either is fine as long as `panel.css` matches.

## Steps

### Step 1: Rewrite `panel.css` for the hotbar

Replace the file's contents with the hotbar styles per "Target design → Visual
character". Delete every dead class listed in "Current state". Keep the accent
`#ff7b54` and the glass tokens. Include the `prefers-reduced-motion` guard.

**Verify**: `pnpm check:island-editor` → exit 0 (CSS isn't typechecked, but this
confirms nothing else broke). `grep -n "tool-panel__row\|__coords\|__pointbtns\|input\[type" island-editor/src/ui/panel.css` → no matches.

### Step 2: Rewrite `ToolPanel.tsx` markup + add inline SVG icons

Add the icon components and `TOOL_META`, the `HotbarButton` helper, and the new
returned markup. **Do not change** the exported `Tool`/`BrushSize` types, the
`TOOL_HINTS` map, or the `ToolPanelProps` interface. Wire every existing prop:
`tool`/`onToolChange`, `brushSize`/`onBrushSizeChange`, `canUndo`/`canRedo`/`onUndo`/
`onRedo`, `onDesignerView`/`onTopView`, `onExport`/`onImport`/`onReset`.

**Verify**: `pnpm check:island-editor` → exit 0. `git diff --name-only` → only
`island-editor/src/ui/ToolPanel.tsx` and `island-editor/src/ui/panel.css`.
`git diff island-editor/src/App.tsx` → empty (App untouched and still compiles).

### Step 3: Visual QA (`pnpm dev:editor` → http://localhost:5180)

Confirm each — screenshots if you have a browser tool, else report as NOT RUN for a
human:

- [ ] A single hotbar is centered at the bottom, always visible (not near-invisible
      at rest).
- [ ] Five tool icons render (no tofu/□); the active tool has the orange glow; clicking
      each switches tools and updates the hint caption above the bar.
- [ ] Brush cluster shows three growing squares; the active size is highlighted;
      clicking changes brush size (verify a stamp uses the new size).
- [ ] Undo/redo icons are dimmed/disabled when `canUndo`/`canRedo` are false and work
      when enabled (make a stroke, undo it).
- [ ] Designer view / Top view / Export / Import / Reset all still fire (Import opens
      the file picker; Reset reseeds).
- [ ] Hover lifts a tile; press scales it down; tooltips show on hover.
- [ ] The bar does not occlude the island at the default camera; no console errors.

If the bar overlaps the island badly at some camera, nudge `bottom` or max-width and
re-check (a tuning knob, not a redesign).

Then flip this plan's frontmatter `status` to `done`.

## Test plan

The island-editor package has **no component-test infrastructure** (vitest runs in
`node`; no jsdom/testing-library) and this is a pure visual/markup change with an
**unchanged props API**. Do **not** add test infra (that's a dependency change and
out of scope). Verification is:

- `pnpm check:island-editor` stays green (typecheck confirms the props API and types
  are intact; the 87 pure-core tests are unaffected).
- The Step 3 visual QA checklist (the real acceptance surface for a visual redesign).

If a reviewer later wants a render test, that's a separate plan (add jsdom +
`@testing-library/react` first).

## Done criteria

ALL must hold:

- [ ] `pnpm check:island-editor` exits 0 (87 tests).
- [ ] `git diff --name-only` shows ONLY `island-editor/src/ui/ToolPanel.tsx` and
      `island-editor/src/ui/panel.css` (plus this plan's status line).
- [ ] `git diff island-editor/src/App.tsx` is empty — the props API is unchanged.
- [ ] `git diff island-editor/package.json` is empty — no new dependencies.
- [ ] `grep -n "tool-panel__row\|__coords\|__pointbtns\|input\[type='range'\]\|input\[type='number'\]" island-editor/src/ui/panel.css` → no matches (dead CSS removed).
- [ ] Tool icons are inline SVG (`grep -c "<svg" island-editor/src/ui/ToolPanel.tsx` ≥ 8).
- [ ] Step 3 visual QA reported (run or explicitly NOT RUN).
- [ ] Frontmatter `status` updated.

## STOP conditions

Stop and report (do not improvise) if:

- The drift check shows `ToolPanel.tsx` or `panel.css` changed since `288f7375` and
  no longer matches "Current state".
- Achieving the design appears to require changing `ToolPanelProps` or editing
  `App.tsx` — it should not; the redesign is markup + CSS only.
- You're tempted to add any dependency (icon library, testing-library, jsdom) — the
  package must stay dependency-frozen; use inline SVG.
- `pnpm check:island-editor` fails twice after a reasonable fix.

## Maintenance notes

- **Placement collision risk**: a bottom-center bar can fight bottom-anchored UI if any
  is added later. If a status bar or second panel appears, revisit the vertical offset.
- **Icon set lives inline** in `ToolPanel.tsx`. If the icon count grows, consider a
  small `icons.tsx` in `src/ui/` (still no dependency) — but that's a future refactor,
  not this plan.
- **Reviewer focus**: confirm the props API is byte-identical (App untouched), the
  active-tool state is unambiguous at a glance, disabled undo/redo is obvious, and
  icons read at ~20px. Watch for the near-invisible rest state sneaking back in.
- Deliberately deferred: keyboard tool shortcuts (e.g. 1–5 to pick a tool), a
  collapsed/compact mode, and any component render test (needs test infra first).
