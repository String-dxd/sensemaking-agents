---
title: Island editor — model panel (left-pane palette to pick & arm a placeable object)
type: feat
status: done
date: 2026-07-06
written_against_commit: b375cdbb
base_branch: feat/island-editor-object-placement (Plan B)
initiative: 2026-07-06-004-feat-island-editor-objects-overview.md
plan: C (of A→B→C)
---

# Plan C: Model panel — left-pane palette to arm a placeable object

> **Executor instructions**: step by step; verify each step; STOP on a STOP condition;
> flip `status` when done.
>
> **Base branch**: Plan B's branch `feat/island-editor-object-placement` (or `main` once
> A+B have merged). **Re-validate Plan B's App state before starting**: this plan expects
> `placeKind: ObjectKind | null` + `setPlaceKind` in `App.tsx` and B's TEMPORARY keyboard
> arming (keys 1–5/0/Esc). This plan adds the real palette UI and replaces that temp
> arming. If B's state names differ, reconcile first (STOP).
>
> **Drift check**: `git diff --stat <B-tip>..HEAD -- island-editor/src/App.tsx island-editor/src/ui/`

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: LOW–MED (UI + a little state; reuses the distributed layout's `.tile` + reserved left edge) · **Depends on**: Plan A (kinds), Plan B (`placeKind`/`setPlaceKind`, placement machinery). · **Category**: feature / ux · **Planned at**: `b375cdbb`, 2026-07-06
- **Executed 2026-07-06** on branch `feat/island-editor-model-panel` (commit `00d4525f`, base `feat/island-editor-object-placement`/`604a9ff0`). Advisor-reviewed & APPROVED: exactly the 4 in-scope files, no deps; gate green (118 tests); temp keyboard arming removed (Esc kept as disarm); `OBJECT_KINDS` import correctly dropped from App.tsx; existing icons untouched. **Browser QA PASSED**: left PLACE panel shows 5 tiles + caption, arms a kind (orange), and the four fixed zones (left panel / bottom hotbar / bottom-right camera dock / top-right file bar) don't overlap. Tip of the objects stack.

## Why this matters

Plans A + B can build and place objects, but the only way to *pick* a kind is B's
temporary keyboard arming (1–5). This plan adds the real **model panel**: a left-pane
palette of the five object kinds that arms placement on click and shows what's active —
the discoverable "pick a tree, drop it" surface. It lands in the left edge the
distributed layout deliberately reserved for an objects panel.

## Current state (verified at `b375cdbb`, + Plans A & B)

- The distributed layout (`2026-07-06-003`) established three zones and **reserved the
  left edge** for a future objects panel (its maintenance notes say so). Shared UI lives
  in `island-editor/src/ui/icons.tsx`: `IconButton` (uses the `.tile` class), `svgProps`,
  and inline SVG icons. Container CSS in `panel.css` (`.hotbar`, `.camera-dock`,
  `.file-bar`, `.tile`, reduced-motion guard). Left edge is currently empty.
- **Plan A**: `OBJECT_KINDS: ObjectKind[]`, `buildObjectModel`. **Plan B**: `App.tsx` has
  `placeKind`/`setPlaceKind` (`placeMode = placeKind !== null`), place/remove wired,
  and TEMP keyboard arming (`// TEMP arming — superseded by the model panel (Plan C)`).
- `App.tsx` renders `<ToolPanel/>` (bottom hotbar), `<CameraDock/>` (bottom-right),
  `<FileBar/>` (top-right), and the Canvas.

## Scope

**In scope**:
- `island-editor/src/ui/icons.tsx` — add 5 object-silhouette icons (fruitTree/pine/palm/bush/rock) + a `KIND_META` label map (or put the map in ModelPanel).
- `island-editor/src/ui/ModelPanel.tsx` (new) — the left-pane palette.
- `island-editor/src/ui/panel.css` — add `.model-panel` (left edge) styles, reusing `.tile`.
- `island-editor/src/App.tsx` — render `<ModelPanel placeKind onPick/>`; REMOVE (or relabel as documented shortcuts) Plan B's temporary keyboard arming.

**Out of scope**: live 3D thumbnails (v1 uses SVG silhouettes — see design), move/tint/
multi-select, `package.json`, the placement machinery itself (Plan B owns it).

## Target design

### Palette icons (SVG silhouettes in `icons.tsx`)

Five inline-SVG silhouette glyphs (glanceable, cheap — NOT live 3D; consistent with the
hotbar's icon approach). Starter shapes (24×24, `svgProps`; use `fill="currentColor"` for
solid silhouettes rather than stroke where it reads better):
- **FruitTreeIcon** — trunk rect + a round canopy circle: `<rect x="10.5" y="13" width="3" height="8"/><circle cx="12" cy="9" r="6"/>`
- **PineIcon** — trunk + stacked triangles: `<rect x="11" y="18" width="2" height="4"/><path d="M12 2l5 7H7zM12 8l6 8H6z"/>`
- **PalmIcon** — leaning trunk + frond fan: `<path d="M12 22V9" /><path d="M12 9c-4-3-8-2-9 1M12 9c4-3 8-2 9 1M12 9c-1-4 1-7 0-8M12 9c1-4-1-7 0-8" />` (stroke)
- **BushIcon** — cluster of bumps: `<path d="M4 20a4 4 0 0 1 3-6 4 4 0 0 1 5-2 4 4 0 0 1 5 2 4 4 0 0 1 3 6z"/>`
- **RockIcon** — faceted boulder: `<path d="M4 20l3-8 5-3 6 4 2 7z"/>`
Also a `KIND_META: Record<ObjectKind, { label: string; Icon: FC }>` (Fruit tree / Pine /
Palm / Bush / Rock).

### `ModelPanel.tsx` (left pane)

```tsx
// props: { placeKind: ObjectKind | null; onPick: (k: ObjectKind) => void }
// A .model-panel card fixed to the left edge. A small header ("Place"), then a vertical
// stack of IconButtons — one per OBJECT_KINDS[k] — each showing KIND_META[k].Icon,
// title/aria-label = KIND_META[k].label, active={placeKind === k}, onClick={() => onPick(k)}.
// A muted caption: "Click terrain to drop · click an object to remove · Esc to stop".
```
Reuse `IconButton` + `.tile` (with `.is-active` orange for the armed kind). The panel is
icon-first with the label as tooltip (match the hotbar), OR icon + short label if there's
room — your call, keep it compact.

### `panel.css` — `.model-panel`

`position: fixed; left: 16px; top: 50%; transform: translateY(-50%)` (vertically centered
on the left edge, clear of the top-right file bar and bottom hotbar), glass card matching
`.hotbar__row` (`rgba(16,22,38,0.82)`, blur, radius 16, border, shadow), column of tiles
with a small gap + header + caption. Ensure it does NOT overlap the bottom-center hotbar
or the bottom-right camera dock at a normal viewport.

### `App.tsx` wiring

- `onPick = (k) => setPlaceKind((cur) => (cur === k ? null : k))` (click active kind →
  disarm, back to terraform). Render `<ModelPanel placeKind={placeKind} onPick={onPick}/>`.
- **Remove Plan B's temporary keyboard arming** (the `1`–`5`/`0`/Esc block marked TEMP).
  Keep `Esc → setPlaceKind(null)` as a real shortcut (it's good UX), but drop the numeric
  arming (the panel is now the arming surface). If you keep the number keys, document them
  in the panel caption; otherwise remove them cleanly.

## Steps

1. **Icons + `KIND_META`** in `icons.tsx`. **Verify** `pnpm check:island-editor` → 0;
   `grep -c "<svg" island-editor/src/ui/icons.tsx` increased by 5.
2. **`ModelPanel.tsx`** + `.model-panel` CSS. **Verify** → 0.
3. **`App.tsx`**: render `<ModelPanel/>`, wire `onPick`, remove/relabel B's temp arming.
   **Verify** → 0; `git diff --name-only <base>` shows only in-scope files.
4. **QA** (`pnpm dev:editor`): the left panel shows 5 object tiles; clicking one arms it
   (orange) and the ghost appears; clicking terrain drops it; clicking the active tile (or
   Esc) disarms → terraform tools work again; clicking another kind switches; a placed
   object removes on click while armed; no overlap with hotbar/camera-dock/file-bar; no
   console errors. Screenshots or NOT RUN. Then flip `status`.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0.
- [ ] `git diff --name-only <base>` = only `icons.tsx`, `ModelPanel.tsx`, `panel.css`, `App.tsx`.
- [ ] `grep -n "TEMP arming" island-editor/src/App.tsx` → no matches (temp arming removed/relabeled).
- [ ] Left panel arms/disarms placement and the four zones (left panel, bottom hotbar, camera dock, file bar) don't overlap (QA).
- [ ] Step 4 QA reported; frontmatter `status` updated.

## STOP conditions

- Plan B's `placeKind`/`setPlaceKind` (or `placeMode`) aren't present/named as expected — reconcile first.
- The left panel overlaps another zone at a normal viewport and can't be positioned clear — report.
- New dependency or out-of-scope file needed.

## Maintenance notes

- **Four fixed zones now** (left panel, bottom hotbar, bottom-right camera dock, top-right
  file bar). Any future surface must avoid these; on very small viewports they may crowd —
  a responsive pass is a deferred follow-up.
- **v1 palette uses SVG silhouettes**, not live 3D previews (deferred — live thumbnails
  mean N WebGL contexts or an offscreen render-to-texture; not worth it for v1).
- **Left pane is now occupied** — the distributed layout's "reserved for objects/inspector"
  note is fulfilled; a future per-object inspector (when move/tint land) would extend this panel.
