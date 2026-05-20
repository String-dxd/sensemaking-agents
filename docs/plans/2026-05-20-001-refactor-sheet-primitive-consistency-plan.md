---
title: Sheet primitive + cross-page chrome consistency
type: refactor
status: active
date: 2026-05-20
---

# Sheet primitive + cross-page chrome consistency

## Overview

The app's full-viewport surfaces (History, Profile, Letters, Path Finder/Trajectory, Calendar, DayDetail) are each hand-rolled. They diverge in backdrop, transition, z-index, and DOM-portal strategy — which causes two user-visible problems and one structural problem:

1. **Bug:** Tapping a date in History → Calendar opens `DayDetailCard` *behind* the History sheet (DayDetail is appended to `document.body` at z-32; History covers the viewport at z-60).
2. **Inconsistency:** Profile/Letters/Trajectory use opaque slide-up sheets; History uses a translucent fade-in. The user likes the History feel (island stays visible behind) and wants the others to match.
3. **No guardrail:** Each new sheet re-implements chrome from scratch, so drift is inevitable.

This plan introduces a single engine-side `SheetChrome` primitive that every sheet inherits, harmonizes all four full-viewport surfaces on the History look, fixes the DayDetail stacking bug as the natural consequence of correct parent/child portaling, and documents the guardrail in `CLAUDE.md` so future sheets cannot drift.

---

## Problem Frame

Sheet chrome (backdrop, blur, transition, z-index layering, portal target, escape/back handling, child-overlay reparenting) is a cross-cutting concern that today lives copy-pasted in five vanilla-JS files. The repo has no shared primitive for it, no design-system documentation describing the contract, and no enforcement mechanism. Each new surface (the recent Path Finder addition is a clear example) re-derives the contract from whichever existing sheet the author looked at first.

The DayDetail bug is the visible symptom of the underlying structural problem: child overlays mount to `document.body` instead of into their parent's stacking context, so any future "sheet above a sheet" pattern will hit the same bug.

---

## Requirements Trace

- R1. Clicking a date inside History → Calendar shows the DayDetailCard *above* the History sheet, not behind it.
- R2. Profile, Letters, Trajectory, and Calendar all use the same backdrop + transition pattern as History today (transparent → semi-opaque with `backdrop-filter: blur(10px)`, fade-in via opacity, z-60).
- R3. A single `SheetChrome` primitive owns backdrop, blur, transition, z-index layering, portal target, escape/back handling, and child-overlay reparenting for every engine sheet.
- R4. The chrome contract is documented in `CLAUDE.md` (or a linked design-system doc) such that a future contributor adding a new sheet has one canonical reference and no choice but to use it.
- R5. No regression in existing sheet behavior: `body.has-overlay` class still toggles, TopNav still hides, OverlayController still arbitrates exclusivity, escape/× still close, and React-mirrored content (`ProfileSheetView`, `TrajectoryPageView`) renders unchanged inside its engine shell.

---

## Scope Boundaries

- **Not** migrating the bottom-anchored "capture" sheets (Ask, Photo, Mood, Chooser). They are tall-but-not-full-viewport and already share their own `has-capture-sheet` body class — different visual tier, different ergonomics.
- **Not** installing shadcn/ui. (See Key Technical Decisions for rationale.)
- **Not** touching `src/components/world/*` (dormant per project memory).
- **Not** redesigning the *content* of any sheet — only the chrome (frame/backdrop/transition).
- **Not** changing React mirror components (`ProfileSheetView.tsx`, `TrajectoryPageView.tsx`); they render inside the engine shell, so the chrome migration is transparent to them.

### Deferred to Follow-Up Work

- Migrating capture sheets (Ask/Photo/Mood) onto the same primitive if a future visual unification is desired — separate plan, separate tier.
- Per-sheet motion polish (spring physics, stagger, exit-direction asymmetry) beyond the shared baseline fade.

---

## Context & Research

### Relevant Code and Patterns

- `src/engine/student-space/Game/View/OverlayController.js` — singleton arbitrating which sheet is active; owns `body.has-overlay` class. **This is where the primitive's lifecycle hooks should live.**
- `src/engine/student-space/Game/View/HistorySheet.js` (1038 lines) — current canonical visual treatment (z-60, blur 10px, rgba fade). Treat as the *reference look*. Line 287 reparents `CalendarSheet.root` into History's DOM — model for child-into-parent portaling.
- `src/engine/student-space/Game/View/CalendarSheet.js` (424 lines), `ProfileSheet.js` (697), `LettersSheet.js` (173), `TrajectorySheet.js` (778) — the four surfaces to harmonize.
- `src/engine/student-space/Game/View/DayDetailCard.js:67` — `document.body.appendChild(root)` is the bug root. Must portal into nearest open sheet's `root` instead.
- `src/engine/student-space/style.css` — monolithic CSS. Lines 729–773 already group `.profile-sheet__close, .calendar-sheet__close, …` for the shared × button — *exactly* the pattern this plan generalizes to backdrop/transition/z-index.
- `src/components/ui/dialog.tsx`, `drawer.tsx` — Base UI primitives present on the React side. Untouched by this plan but referenced in the guardrail doc so new React-side surfaces (if any) use them consistently.

### Institutional Learnings

- `docs/solutions/2026-05-18-island-progression-engine-substrate.md` — confirms the engine substrate is the live home; React mirrors are content-only. Reinforces that the primitive must be vanilla-JS-first.

### External References

- None required — this is an internal consolidation, not a new pattern adoption.

---

## Key Technical Decisions

- **Build a vanilla-JS engine-side `SheetChrome` primitive; do NOT install shadcn.** Rationale: the engine surfaces are vanilla JS (not React), so a React component library cannot serve as the shared primitive without rewriting all five sheets into React — which is far beyond this plan's scope and breaks the engine substrate pattern. The Base UI primitives in `src/components/ui/` remain the canonical choice for *React-only* surfaces.
- **Harmonize on the History look (translucent + blur + fade), not the slide-up look.** User explicitly prefers it; the island remaining visible is a core aesthetic of the product.
- **Unify all full-viewport sheets at z-60.** Slide-up sheets currently sit at z-30 because they were originally designed not to overlap any chrome; once the chrome is unified, the z-tier should be one number. DayDetail and other child overlays then sit at parent-z + 2 within their parent's stacking context (which is implicit once portaled correctly).
- **Child overlays portal into their parent sheet's `root`, not `document.body`.** This makes z-stacking automatic (child is always above parent because it's a DOM descendant of a positioned, z-indexed ancestor) and fixes the DayDetail bug structurally rather than by hand-tuning numbers.
- **Document the contract in `CLAUDE.md` as a top-level "Sheet chrome" guardrail.** Engine has no AGENTS.md today; CLAUDE.md is the natural place for an enforceable rule that an agent (or human) will read before adding a new sheet.

---

## Open Questions

### Resolved During Planning

- *Should we install shadcn?* — No. See Key Technical Decisions.
- *Should DayDetail be portaled into parent or just z-bumped?* — Portaled. Bump-only works for this one case but leaves the structural bug in place for any future child overlay.
- *Should React mirrors change?* — No. They render *inside* the engine shell; the chrome migration is invisible to them.

### Deferred to Implementation

- Exact API surface of `SheetChrome` (constructor signature, hook names) — settle when writing U2 by looking at what the four migrating sheets actually need.
- Whether to keep per-sheet CSS classes (`.profile-sheet`, `.letters-sheet`, …) for content-specific overrides, or collapse them into one `.sheet--<key>` modifier. Decide while migrating U4.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

The chrome-vs-content split:

```
┌──────────────────────────── document.body ─────────────────────────────┐
│                                                                         │
│  [engine canvas — island scene]                                         │
│                                                                         │
│  ┌─ .sheet-chrome.is-open  (z-60, fixed inset-0) ─────────────────┐    │
│  │     backdrop: rgba(253,250,243, 0.55→0.92) + blur(10px)         │    │
│  │     transition: opacity 200ms                                   │    │
│  │     escape/back wired by SheetChrome, not per-sheet             │    │
│  │                                                                  │    │
│  │   ┌─ .sheet-chrome__inner (scrollable content slot) ────┐      │    │
│  │   │   per-sheet content: profile / letters / calendar /  │      │    │
│  │   │   trajectory / history mounts here                   │      │    │
│  │   └──────────────────────────────────────────────────────┘      │    │
│  │                                                                  │    │
│  │   ┌─ child overlay (DayDetail, future popovers) ─┐              │    │
│  │   │   portaled INTO this sheet's DOM (not body)  │              │    │
│  │   │   z auto-stacks above parent content          │              │    │
│  │   └────────────────────────────────────────────────┘              │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

`SheetChrome` lifecycle (sketch — not API spec):

```
new SheetChrome({ key: 'profile', onOpen, onClose })
  → builds .sheet-chrome root, appends to body
  → registers with OverlayController.getInstance().register(key, …)
  → exposes contentSlot for the per-sheet content
  → exposes portalTarget for child overlays
  → owns escape/click-outside → OverlayController.close(key)
  → emits 'open'/'close' for content to react
```

Per-sheet refactor reduces to: stop owning backdrop/transition/escape; render content into `chrome.contentSlot`; ask `chrome.portalTarget` when mounting child overlays.

---

## Implementation Units

- U1. **Fix DayDetailCard parent portaling (regression test of the contract before the contract exists)**

**Goal:** Eliminate the user-visible bug as a standalone, smallest-possible change — and lock the behavior under a test before the larger refactor lands.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `src/engine/student-space/Game/View/DayDetailCard.js` (replace `document.body.appendChild(root)` with appendChild to the open History sheet's root when present, falling back to body)
- Modify: `src/engine/student-space/Game/View/HistorySheet.js` (expose a `getChildOverlaySlot()` or equivalent for child portaling — same pattern as the existing `timelineSlotEl` reparent for Calendar)
- Modify: `src/engine/student-space/Game/View/CalendarSheet.js` (wire the new child-slot lookup when mounting DayDetail)
- Modify: `src/engine/student-space/Game/View/OverlayController.js` (helper: `getActiveRoot()` returning the active sheet's root DOM node so children can ask the controller rather than reaching across modules)
- Modify: `src/engine/student-space/style.css` (drop the explicit `z-index: 32` on `.day-detail-card` once it's a DOM descendant of `.history-sheet`; let the natural stacking context handle it)

**Approach:**
- DayDetail asks `OverlayController.getActiveRoot()` at open-time; if non-null, appendChild there; else fall back to `document.body` (preserves behavior if Calendar is ever opened outside History).
- Removes the explicit z-index dance; relies on natural DOM stacking within a positioned, z-indexed ancestor.

**Patterns to follow:**
- `HistorySheet.js:287` already does this for `CalendarSheet.root` — mirror that idiom.

**Test scenarios:**
- *Happy path:* With History open and Timeline tab active, tap a date that has events → DayDetail card is visible (rendered above History panel content, inside History's bounding box).
- *Edge case:* Tap a date with no events → empty-state card still visible above History.
- *Edge case:* Close DayDetail (×, escape, tap-outside) → returns to Calendar without leaving orphaned DOM nodes under `.history-sheet`.
- *Integration:* Close History entirely while DayDetail is open → DayDetail is torn down (it was a child of History's DOM, so History's dispose path should naturally collect it).
- *Regression:* If Calendar is somehow opened without History (defensive fallback path), DayDetail still mounts to body and is visible.

**Verification:**
- Manual: open `localhost:3004/?sheet=calendar`, click any date, confirm DayDetail overlays the History/Calendar surface and is fully visible.
- DOM inspection: `.day-detail-card` is a descendant of `.history-sheet`, not a body sibling.

---

- U2. **Introduce `SheetChrome` engine primitive**

**Goal:** Create the shared vanilla-JS class that owns backdrop, blur, transition, z-layer, portal target for children, and escape/back handling. No sheets migrated yet — primitive lands standalone and is exercised by U3.

**Requirements:** R3, R5

**Dependencies:** U1 (so the bug fix is in place independently and U2 doesn't have to ship before merging the user-visible fix)

**Files:**
- Create: `src/engine/student-space/Game/View/SheetChrome.js`
- Modify: `src/engine/student-space/Game/View/OverlayController.js` (add `getActiveRoot()` if not landed in U1; document the SheetChrome contract in the file's existing header comment)
- Modify: `src/engine/student-space/style.css` (add `.sheet-chrome`, `.sheet-chrome.is-open`, `.sheet-chrome__inner` base rules — backdrop/blur/transition/z-60. Per-sheet content classes remain.)

**Approach:**
- Constructor takes `{ key, onOpen, onClose, contentClassName }`; builds root DOM, appends to `document.body`, registers with OverlayController under `key`.
- Exposes `contentSlot` (DOM element where the sheet's content mounts) and `portalTarget` (DOM element where child overlays mount — usually the chrome root itself).
- Owns event listeners for Escape and click-on-backdrop → calls `OverlayController.close(key)`.
- Provides `open()`/`close()` matching OverlayController's expected surface contract.
- Visual baseline mirrors current History exactly (z-60, rgba 0.55→0.92, blur 10px, 200ms opacity fade).

**Patterns to follow:**
- Existing engine singleton/lifecycle patterns (per-project-memory engine-slice template).
- The existing shared close-button CSS group (`style.css:729-773`) — same generalization, applied to the chrome layer.

**Test scenarios:**
- *Happy path:* Instantiate SheetChrome with a stub key not used by any sheet, call open(), confirm root is in DOM with `.is-open` class and content slot is empty and ready.
- *Edge case:* Open then immediately close — backdrop fade-out completes without orphaning event listeners.
- *Error path:* Escape key dispatched while chrome is open calls `OverlayController.close(key)` exactly once.
- *Error path:* Click on backdrop (not on content) calls `OverlayController.close(key)`; click on content does not.
- *Integration:* OverlayController's exclusivity rule still fires — opening a second SheetChrome with a different key causes the first to close via its registered surface.

**Verification:**
- Standalone manual test page or a temporary debug hook that instantiates a SheetChrome with stub content and confirms visual + dismissal behavior matches current History.

---

- U3. **Migrate `HistorySheet` to `SheetChrome` (reference migration, zero visual change)**

**Goal:** Prove the primitive is sufficient by migrating the sheet whose look it was derived from. Visual output should be pixel-identical. This is the lowest-risk migration and serves as the template for U4.

**Requirements:** R3, R5

**Dependencies:** U2

**Files:**
- Modify: `src/engine/student-space/Game/View/HistorySheet.js` (replace its chrome-owning code with `new SheetChrome({ key: 'history', … })`; keep content/tab/calendar-reparent logic intact)
- Modify: `src/engine/student-space/style.css` (remove now-duplicated chrome rules from `.history-sheet`; leave content-specific rules)

**Approach:**
- HistorySheet becomes a content-only module that asks SheetChrome for its content slot and child-overlay portal.
- Calendar reparenting (the existing `timelineSlotEl.appendChild(calendarSheet.root)` at line 287) continues to work because it operates on HistorySheet's content, not on chrome.
- DayDetail child-portal lookup from U1 still resolves correctly (it asks OverlayController.getActiveRoot() — which now returns the SheetChrome root, same as before structurally).

**Test scenarios:**
- *Happy path:* Open History via TopNav, switch between Timeline and Growth tabs — content renders identically to pre-migration.
- *Happy path:* Open History → Calendar → tap date → DayDetail still overlays correctly (continuity check with U1).
- *Edge case:* Escape closes History; backdrop tap closes History; × closes History — all three paths produce the same OverlayController.close('history') call.
- *Integration:* TopNav `body.has-overlay` toggling still occurs (OverlayController owns it, not the chrome — but verify the class is on the body when History is open).
- *Visual regression:* Side-by-side screenshot pre/post migration shows no perceptible difference in backdrop, blur, fade timing, or z-stacking.

**Verification:**
- Manual visual diff against pre-migration screenshot.
- All History interactions (open/close/tab switch/date click) work identically.

---

- U4. **Migrate `ProfileSheet`, `LettersSheet`, `TrajectorySheet`, `CalendarSheet` to `SheetChrome`**

**Goal:** Replace each sheet's bespoke chrome with `SheetChrome`. Visual result: all four sheets now have the History look (transparent → 0.92 fade, blur 10px, z-60, opacity transition). Content of each sheet is unchanged.

**Requirements:** R2, R3, R5

**Dependencies:** U3

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js`
- Modify: `src/engine/student-space/Game/View/LettersSheet.js`
- Modify: `src/engine/student-space/Game/View/TrajectorySheet.js`
- Modify: `src/engine/student-space/Game/View/CalendarSheet.js`
- Modify: `src/engine/student-space/style.css` (delete now-dead chrome rules for `.profile-sheet`, `.letters-sheet`, `.trajectory-sheet`, `.calendar-sheet` — backdrop, transform, transition, z-index. Keep all content/typography/spacing rules.)
- Modify: React mirrors only if they currently rely on a wrapping `<section className="…rounded-t-[1.75rem] bg-[#fdfaf3]…">` that assumed an opaque container. Re-evaluate `src/components/ProfileSheetView.tsx:51` and `src/components/TrajectoryPageView.tsx` (likely keep — the rounded inner card sitting on a translucent backdrop is the History pattern already).

**Approach:**
- Each migration follows the U3 template: replace chrome-owning code with `new SheetChrome({ key, … })`; pass the existing content-building code into the chrome's content slot.
- The `translateY(100%)` slide-up animation is removed in favor of opacity fade. (User explicitly prefers the fade.)
- React content components (`ProfileSheetView`, `TrajectoryPageView`) render unchanged into the SheetChrome content slot — they were already content-only; their parent shell changes.
- One sub-decision per sheet: does the existing rounded opaque inner card look good sitting on the translucent backdrop? Audit visually during migration; tweak inner-card opacity per sheet if needed (likely keep at current).

**Patterns to follow:**
- U3.

**Test scenarios:**
- *Happy path (×4, once per sheet):* Open Profile/Letters/Trajectory/Calendar via their respective routes (`?sheet=profile|letters|trajectory|calendar`). Visual: island remains visible behind a 10px-blurred translucent backdrop; sheet content fades in over 200ms. Sheet content (forms, tabs, lists) renders and interacts identically to pre-migration.
- *Happy path:* Profile tab navigation (values/interests/etc.), Trajectory mode-switching, Letters open/dismiss letter — all still functional.
- *Edge case:* Escape / backdrop tap / × all close the sheet for all four.
- *Edge case:* Open Profile, then open Letters from inside (if such a flow exists) — OverlayController's exclusivity still swaps them.
- *Integration:* `body.has-overlay` class toggles consistently across all four (test by inspecting `document.body.classList` mid-open).
- *Cross-sheet visual consistency:* All four sheets and History share identical backdrop opacity, blur radius, fade timing, and z-tier. Side-by-side screenshots confirm.

**Verification:**
- Manual walkthrough of all four sheets + History. Confirm the island shows through behind every one.
- Tap-targets, scroll containment, and content layout unchanged.

---

- U5. **Document the chrome contract as a guardrail**

**Goal:** Make the SheetChrome contract discoverable and enforceable so future contributors cannot drift. Single canonical reference; CLAUDE.md is the place because the repo has no AGENTS.md today.

**Requirements:** R4

**Dependencies:** U2 (so the primitive exists to document) — independent of U3/U4 ordering for landing; ideally lands in the same PR as U4 so the rule is true the moment it appears.

**Files:**
- Create: `CLAUDE.md` (top-level — does not exist today)
  - Section: **Sheet chrome contract** — one-screen description of the rule, with code-pointer references.
- Modify: `src/engine/student-space/Game/View/SheetChrome.js` (header comment links to the CLAUDE.md section so a code-side reader finds the doc too).
- Modify: `src/engine/student-space/Game/View/OverlayController.js` (header comment mentions SheetChrome as the standard surface implementation).

**Approach:**
- The CLAUDE.md section states, in order:
  1. **Rule:** Every full-viewport sheet must be built on `SheetChrome`. No new sheet may own its own backdrop/transition/z-index.
  2. **Why:** Lists the inconsistency-and-bug history this plan resolves (one sentence each, referencing this plan file).
  3. **How to apply:** Code example (5–8 lines) showing the canonical `new SheetChrome({...})` invocation. Mentions where content goes (`chrome.contentSlot`) and where child overlays go (`chrome.portalTarget`).
  4. **What this is NOT for:** Bottom-anchored capture sheets (Ask/Photo/Mood/Chooser) keep their own `has-capture-sheet` tier.
  5. **React-side parity:** New React-only surfaces (none today) should use `src/components/ui/dialog.tsx` or `drawer.tsx` and match the same visual treatment (translucent backdrop, blur, fade).

**Patterns to follow:**
- Concise prose; no aspirational filler. The rule is the rule.

**Test scenarios:**
- *Verification scenario, not a code test:* A new contributor (or agent) tasked with adding a sheet reads CLAUDE.md before touching `Game/View/` and ends up calling `new SheetChrome(...)` instead of copying from another sheet. This is verified by future reviewer behavior; not by an automated test.

**Verification:**
- CLAUDE.md exists at repo root.
- Section heading is greppable and the rule is stated in the imperative.
- Code-pointer references in `SheetChrome.js` and `OverlayController.js` resolve to the right CLAUDE.md section.

---

## System-Wide Impact

- **Interaction graph:** OverlayController gains one new helper (`getActiveRoot()`); its existing exclusivity arbitration is unchanged. All five sheet modules become consumers of the same primitive rather than parallel implementations.
- **Error propagation:** Escape/back/click-outside handling moves from per-sheet to chrome. A bug in escape handling now fixes everywhere at once — and breaks everywhere at once, which is why U2 includes its own dismissal test scenarios.
- **State lifecycle risks:** Child overlays portaled into parent DOM are now disposed when the parent disposes. The risk is reverse: if a sheet's dispose path was previously sloppy because DayDetail was a body-sibling, it must now correctly tear down children. Watch this in U3 and U4.
- **API surface parity:** The React-side `Dialog`/`Drawer` primitives in `src/components/ui/` are *not* migrated; the guardrail doc explicitly aligns them visually but leaves the React mount surface intact.
- **Integration coverage:** OverlayController's exclusivity contract — opening one full-viewport sheet auto-closes any other — must be verified for every migrated sheet, since the close path now runs through the chrome's `close()` rather than the sheet's own.
- **Unchanged invariants:** `body.has-overlay` class still toggles (still owned by OverlayController, not chrome). TopNav hiding rules don't change. React mirror props/render contracts are untouched. `?sheet=` URL param routing is untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Visual regression on History during U3 (the reference migration) | U3 is *intentionally* a zero-change refactor; verify with side-by-side screenshot before U4 |
| TopNav `body.has-overlay` class stops toggling because a sheet's `open()` is now thinner | OverlayController owns the body class, not the sheet; U2's test scenarios assert this explicitly |
| Hidden coupling between an existing sheet and its old chrome (e.g., a sheet that reads `.profile-sheet` from its own CSS) | Migrate one sheet at a time in U4; smoke-test each before the next |
| DayDetail dispose path now needs to handle being a child of History (was previously a body-sibling cleaned up independently) | U1 and U3 test scenarios include "close History while DayDetail open" |
| User dislikes the harmonized look on one specific sheet (e.g., Trajectory feels too busy through a translucent backdrop) | Per-sheet inner-card opacity is a one-line tweak in CSS; surface during U4 walkthrough |

---

## Documentation / Operational Notes

- The CLAUDE.md guardrail (U5) is itself the operational note. No rollout, monitoring, or migration concerns — this is a pure refactor of UI chrome.
- No data, no schema, no API, no env changes.

---

## Sources & References

- Audit findings: in-conversation map from 2026-05-20 (file paths, z-indices, transitions, portal targets — used as primary research input).
- `src/engine/student-space/Game/View/OverlayController.js`, `HistorySheet.js`, `CalendarSheet.js`, `ProfileSheet.js`, `LettersSheet.js`, `TrajectorySheet.js`, `DayDetailCard.js`, `View.js`.
- `src/engine/student-space/style.css` (lines 384–950 cover sheet/overlay tiering).
- `src/components/ProfileSheetView.tsx`, `src/components/TrajectoryPageView.tsx` (React mirrors).
- `docs/solutions/2026-05-18-island-progression-engine-substrate.md` (substrate context).
