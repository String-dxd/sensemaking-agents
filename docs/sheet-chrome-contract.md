# Sheet chrome contract

Every **full-viewport sheet** in the engine (`src/engine/student-space/Game/View/*Sheet.js`) MUST be built on the shared `SheetChrome` primitive. No new sheet may hand-roll its own backdrop, blur, opacity fade, transform, or z-index.

## The rule

Use `new SheetChrome({ key, sheetClassName, … })` from `src/engine/student-space/Game/View/SheetChrome.js`. The chrome owns:

- backdrop (`rgba(253, 250, 243, 0.55 → 0.92)`)
- 10px blur (`backdrop-filter: blur(10px)`)
- 200ms opacity fade (`transition: opacity 200ms ease`)
- z-60 tier (`z-index: 60`)
- the × close button (`.sheet-chrome__close`, shared style)
- Escape-to-close key handling
- registration with `OverlayController` for exclusivity + body class toggling
- a `portalTarget` for child overlays (popovers, day-detail cards) that need to mount inside the active sheet's stacking context

Per-sheet content lives in `chrome.contentSlot`. Scope content-only CSS (typography, layout, padding) to `.<sheet-name> .sheet-chrome__content` — never to `.<sheet-name>` directly, since chrome's baseline lives on `.sheet-chrome`.

## Why

Before SheetChrome, every sheet hand-rolled its own chrome. That produced two real problems:

1. **Visual drift.** History used a translucent fade; Profile / Letters / Path Finder / Calendar used opaque slide-up. The product lost its sense of being one family of surfaces.
2. **A stacking bug.** `DayDetailCard` mounted to `document.body` at `z-index: 32` — fine when Calendar (z-30) was its only ancestor. When Calendar got embedded inside History (z-60), DayDetail rendered *behind* the History sheet because z-32 couldn't beat z-60 at the body level. The structural fix was to portal child overlays into the *active sheet's* root (`OverlayController.getActiveRoot()`), so z-stacking falls out of DOM ancestry rather than hand-tuned numbers.

One chrome implementation makes both problems go away at the root.

## Split layout (default for full-viewport sheets)

Every user-facing full-viewport sheet uses `layout: 'split'` — a Gather Town-style two-pane structure:

- **Left pane** (`introSlot`, ~360px) — compact title + per-sheet intro/summary (identity card, status pill, page description, navigation tab strip, etc.). Orients the reader.
- **Right pane** (`bodySlot`) — the working surface (tabs, lists, detail, dense content). This is where work happens.

Constraints:

- Both panes are direct children of `chrome.contentSlot` so the existing 0/80/160ms entry stagger animates panes in sequence for free.
- `portalTarget` stays the chrome root under both layouts. Child overlays (DayDetailCard, ShareDialog) keep portaling into the active sheet's stacking context — splitting that per pane would re-introduce the z-32-behind-z-60 bug class that originally motivated SheetChrome.
- Below 860px viewport, the chrome stacks the panes vertically (left becomes a compact intro band above the right pane). No per-sheet media query needed.
- Left pane background obeys the translucency rule (alpha ≤ 0.40) — never a solid sidebar fill, or the "island visible through chrome" promise breaks.

Stacked layout (`layout: 'stacked'`, the default) is still available for sheets that don't need a left intro pane — currently only CalendarSheet uses it, because it gets reparented into HistorySheet's right pane (Timeline tab) and a nested two-pane would compound the structure.

## How to apply

Adding a new sheet:

```js
// MyNewSheet.js
import SheetChrome from './SheetChrome.js'

export default class MyNewSheet
{
    constructor()
    {
        this.chrome = new SheetChrome({
            key:            'my-new',           // OverlayController exclusivity key
            sheetClassName: 'my-new-sheet',     // for per-sheet content CSS
            withCloseButton: true,              // chrome renders the × button
            closeOnBackdrop: false,             // opt-in click-outside dismissal
            layout:         'split',            // Gather-style two-pane (recommended for new full-viewport sheets)
            header: {
                eyebrow:  'MY SECTION',
                title:    'My new page',
                subtitle: 'Brief one-line description.',
            },
        })
        this.chrome.introSlot.innerHTML = `<!-- left pane: summary / nav / status -->`
        this.chrome.bodySlot.innerHTML  = `<!-- right pane: working surface -->`
        this.root = this.chrome.root            // back-compat for code that expects this.root

        // Content-level clicks (tabs, lists, etc.) — chrome owns ×/Escape.
        this._onClick = (event) => this._handleClick(event)
        this.root.addEventListener('click', this._onClick)
    }

    open(opts) { this.chrome?.open(opts); this.isOpen = true; /* …per-sheet open… */ }
    close()    { if(!this.isOpen) return; this.isOpen = false; /* …cleanup…*/; this.chrome?.close() }
    dispose()  { /* …cleanup…*/; this.chrome?.dispose(); this.chrome = null; this.root = null }
}
```

Adding the per-sheet CSS (`style.css`):

```css
/* Left-pane intro overrides — keep alpha low; pad to taste. */
.my-new-sheet.sheet-chrome--split .sheet-chrome__intro
{
    padding: 0 24px 24px;
    gap: 14px;
}

/* Right-pane body overrides — drop any old 760px centering tricks, the
   chrome pane already constrains width. */
.my-new-sheet.sheet-chrome--split .sheet-chrome__body
{
    padding: 24px 32px 64px;
    color: #2b2620;
    font-family: var(--font-sans);
}
```

Wiring it into `View.js` (`src/engine/student-space/Game/View/View.js`):

```js
this.myNewSheet = new MyNewSheet()
this.overlayController.register('my-new', this.myNewSheet)
```

Adding the URL hook and TopNav entry (`src/engine/student-space/Game/Game.js` and `TopNav.js`) follows the same pattern as existing sheets — see `historySheet` for a recent reference.

## What this is NOT for

- **Bottom-anchored capture sheets** (Ask, Photo, Mood, Chooser) keep their own `has-capture-sheet` tier and do not use SheetChrome. They are tall-but-bottom-anchored, not full-viewport.
- **Popovers, tooltips, dialogues** (KiraDialogue, ShareDialog) are inline UI, not sheets — they should not register with OverlayController.
- **`src/components/world/`** was deleted in the 2026-05-21 cleanup; do not re-add it.

## React-side parity

React-only surfaces should use `src/components/ui/dialog.tsx` or `drawer.tsx` (Base UI) and apply the same visual treatment: translucent backdrop, 10px blur, 200ms opacity fade, no slide-up. The repo does **not** use the `shadcn/ui` package — do not install it without an explicit plan to migrate the existing Base UI primitives.

## Reference files

- `src/engine/student-space/Game/View/SheetChrome.js` — primitive (split + stacked layouts)
- `src/engine/student-space/Game/View/OverlayController.js` — exclusivity + `getActiveRoot()`
- `src/engine/student-space/Game/View/HistorySheet.js` — canonical split-layout consumer (tabs in left pane, embedded Calendar in right pane)
- `src/engine/student-space/Game/View/ProfileSheet.js` — split-layout consumer that hosts a React subtree in the right pane
- `src/engine/student-space/style.css` — `.sheet-chrome`, `.sheet-chrome--split`, `.sheet-chrome__pane`, `.sheet-chrome__intro`, `.sheet-chrome__header--compact` base rules
- `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md` — origin plan
- `docs/plans/2026-05-21-001-refactor-gather-style-two-pane-sheets-plan.md` — split-layout plan
