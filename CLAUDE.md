# sensemaking-agents — repo guardrails

This file is loaded as instructions for any agent (Claude Code, Codex, etc.) operating in this repo. Rules here override default behavior; follow them exactly.

For deeper context (architecture, substrate notes, history), see `docs/` and `docs/solutions/`.

---

## Sheet chrome contract

Every **full-viewport sheet** in the engine (`src/engine/student-space/Game/View/*Sheet.js`) MUST be built on the shared `SheetChrome` primitive. No new sheet may hand-roll its own backdrop, blur, opacity fade, transform, or z-index.

### The rule

Use `new SheetChrome({ key, sheetClassName, … })` from `src/engine/student-space/Game/View/SheetChrome.js`. The chrome owns:

- backdrop (`rgba(253, 250, 243, 0.85 → 0.92)`) — updated from the original `0.55 → 0.92` after the 2026-05-21 routing refactor. Routed sheets (Profile/History/Letters/Trajectory) now have a transparent header instead of a solid cream panel, so the gradient's top stop carries the title's legibility against the engine canvas. The lower bound stays at `0.92` near the bottom.
- 10px blur (`backdrop-filter: blur(10px)`)
- 200ms opacity fade (`transition: opacity 200ms ease`)
- z-60 tier (`z-index: 60`)
- the × close button (`.sheet-chrome__close`, shared style) — opt-out via `withCloseButton: false` on routed sheets where browser back / SideRail are the navigation primitives
- Escape-to-close key handling, with optional `onCloseRequest` callback that routes Escape through the host router for routed sheets
- registration with `OverlayController` for exclusivity + body class toggling
- a `portalTarget` for child overlays (popovers, day-detail cards) that need to mount inside the active sheet's stacking context

Per-sheet content lives in `chrome.contentSlot`. Scope content-only CSS (typography, layout, padding) to `.<sheet-name> .sheet-chrome__content` — never to `.<sheet-name>` directly, since chrome's baseline lives on `.sheet-chrome`.

### Why

Before SheetChrome, every sheet hand-rolled its own chrome. That produced two real problems:

1. **Visual drift.** History used a translucent fade; Profile / Letters / Path Finder / Calendar used opaque slide-up. The product lost its sense of being one family of surfaces.
2. **A stacking bug.** `DayDetailCard` mounted to `document.body` at `z-index: 32` — fine when Calendar (z-30) was its only ancestor. When Calendar got embedded inside History (z-60), DayDetail rendered *behind* the History sheet because z-32 couldn't beat z-60 at the body level. The structural fix was to portal child overlays into the *active sheet's* root (`OverlayController.getActiveRoot()`), so z-stacking falls out of DOM ancestry rather than hand-tuned numbers.

One chrome implementation makes both problems go away at the root.

### How to apply

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
        })
        this.chrome.contentSlot.innerHTML = `<header>…</header><section>…</section>`
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
.my-new-sheet .sheet-chrome__content
{
    /* padding, typography, layout — content-only. */
    padding: 24px 20px 32px;
    color: #2b2620;
    font-family: var(--font-sans);
    min-height: 100%;
}
```

Wiring it into `View.js` (`src/engine/student-space/Game/View/View.js`):

```js
this.myNewSheet = new MyNewSheet()
this.overlayController.register('my-new', this.myNewSheet)
```

Adding the URL hook and TopNav entry (`src/engine/student-space/Game/Game.js` and `TopNav.js`) follows the same pattern as existing sheets — see `historySheet` for a recent reference.

### What this is NOT for

- **Bottom-anchored capture sheets** (Ask, Photo, Mood, Chooser) keep their own `has-capture-sheet` tier and do not use SheetChrome. They are tall-but-bottom-anchored, not full-viewport.
- **Popovers, tooltips, dialogues** (KiraDialogue, ShareDialog) are inline UI, not sheets — they should not register with OverlayController.
- **`src/components/world/*`** is dormant; no new code goes there.

### React-side parity

React-only surfaces (none today) should use `src/components/ui/dialog.tsx` or `drawer.tsx` (Base UI) and apply the same visual treatment: translucent backdrop, 10px blur, 200ms opacity fade, no slide-up. The repo does **not** use shadcn/ui — do not install it without an explicit plan to migrate the existing Base UI primitives.

### Reference files

- `src/engine/student-space/Game/View/SheetChrome.js` — primitive
- `src/engine/student-space/Game/View/OverlayController.js` — exclusivity + `getActiveRoot()`
- `src/engine/student-space/Game/View/HistorySheet.js` — canonical consumer (reference migration)
- `src/engine/student-space/style.css` — `.sheet-chrome`, `.sheet-chrome__content`, `.sheet-chrome__close` base rules
- `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md` — origin plan
