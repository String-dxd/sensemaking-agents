---
title: "refactor: Gather Town-style two-pane layout for full-viewport sheets"
type: refactor
status: active
date: 2026-05-21
---

# refactor: Gather Town-style two-pane layout for full-viewport sheets

## Overview

Redesign every full-viewport sheet in the engine — Profile, Path Finder, History, Calendar, Letters, Settings — to follow the Gather Town pattern: a slim **left pane** with the page title (compact scale, not the current oversized 56–64px) and a contextual intro/summary, paired with a **right pane** that holds the dense working surface (tabs, lists, detail content).

The contract today is "one column inside the sheet body, header on top, big title". The contract after this refactor is "two panes side-by-side inside the sheet body; left pane orients you, right pane is where you work". Same chrome, same animation, same z-stacking — only the inner layout changes.

---

## Problem Frame

The current `.sheet-chrome__header` renders eyebrow + huge title + subtitle stacked at the top of every sheet, and the body is a single ~760px-wide column below it. The visual hierarchy is "page name is the loudest thing on screen, content is small". The user wants the inverse — title small and contextual, content big and dense — and wants the family of sheets to read uniformly so Profile, Path Finder, History all feel like siblings.

Gather Town demonstrates the pattern well: the page title is a normal heading (~22px), the left rail tells you *where you are* and *what this surface is about*, and the right surface is where you do the actual work. The user attached three Gather screenshots (Calendar, Calendar with notifications, Activity) showing the exact split they want.

We have a shared `SheetChrome` primitive (CLAUDE.md "Sheet chrome contract") that owns backdrop/blur/fade/Escape/portal — so the layout change is a content-slot concern, not a chrome rewrite. The trick is doing it once in the primitive so every sheet inherits the new shape rather than each sheet re-inventing it.

---

## Requirements Trace

- R1. Add a split-pane layout option to `SheetChrome` so any sheet can opt in by passing `layout: 'split'`.
- R2. Render the page title at a compact scale (~22px) inside the left pane when split layout is active; collapse the current oversized title CSS for split sheets.
- R3. Expose a new `introSlot` for per-sheet summary content in the left pane (intro paragraph, identity card, status pill, etc.).
- R4. Keep `bodySlot` as the right pane's content container so per-sheet content migrates with minimal churn.
- R5. Preserve the 200ms fade + content-stagger entry animation by keeping left + right as direct children of `contentSlot`.
- R6. Preserve the `portalTarget` contract — `OverlayController.getActiveRoot()` must keep returning the chrome root so DayDetailCard / ShareDialog z-stacking stays correct.
- R7. Migrate ProfileSheet, TrajectorySheet, LettersSheet, HistorySheet, CalendarSheet (standalone), and SettingsSheet to the new layout.
- R8. Keep CalendarSheet's embedded-inside-HistorySheet mode rendering as before (no nested two-pane), since it's already inside HistorySheet's right pane.
- R9. Below a narrow-viewport breakpoint (~860px), stack the two panes vertically: left becomes a compact intro band above, right scrolls below.
- R10. Left pane visual treatment must obey the project's translucency rule (alpha ≤ 0.40, hairline/shadow for separation) — no solid sidebar fill.

---

## Scope Boundaries

- Bottom-anchored capture sheets (AskSheet, PhotoSheet, MoodSheet, CaptureChooser) are out of scope — they are not full-viewport pages and they stay on their own tier per CLAUDE.md.
- No new product content. The left pane intros are summaries of what each sheet already shows; we are not designing new copy/IA.
- No React subtree changes. ProfileSheet's Relationships/Choices tabs render via `profile-tab-react-bridge.tsx`; they continue to mount into the right pane via the existing `omitChrome` path.
- KiraDialogue, ShareDialog, popovers — they are inline UI, not sheets, and are unaffected.

### Deferred to Follow-Up Work

- A `/dev/design` page entry showing the new split layout as a design-system primitive — separate plan after this lands.
- Animating the split-pane *contents* (per-pane sub-stagger of the left intro card vs the right tab strip) — current plan keeps the existing 0/80/160ms top-level stagger only.

---

## Context & Research

### Relevant Code and Patterns

- `src/engine/student-space/Game/View/SheetChrome.js` — the primitive. Header rendering, `contentSlot`/`bodySlot`, portal target, stagger trigger (via `is-open` class on root). Add the new layout mode here.
- `src/engine/student-space/Game/View/ProfileSheet.js` — biggest consumer. Has hero (atmospheric wash + shimmer), identity card, 6 tabs (4 vanilla, 2 React-backed), TLDR hero, COLLECTION bento, TIMELINE.
- `src/engine/student-space/Game/View/TrajectorySheet.js` — status pill + reason tooltip + meta stat tiles + head actions + status-branched body.
- `src/engine/student-space/Game/View/LettersSheet.js` — already a two-pane (list + detail) at ≥780px. The new chrome panes will absorb its existing list/detail.
- `src/engine/student-space/Game/View/HistorySheet.js` — tab strip (Timeline | Growth). Timeline embeds CalendarSheet's root DOM. Growth has year-scrubber + island preview + summary.
- `src/engine/student-space/Game/View/CalendarSheet.js` — standalone (own chrome) or embedded (reparented into HistorySheet); `.calendar-sheet--embedded` modifier handles the latter.
- `src/engine/student-space/Game/View/SettingsSheet.js` — just refactored into a section list (World & Weather · Music · Companion · Path Finder preview · Onboarding).
- `src/engine/student-space/Game/View/OverlayController.js` — `getActiveRoot()` returns the registered surface's `.root` so child overlays portal into the active chrome.
- `src/engine/student-space/style.css` — sheet chrome rules around lines 933–1090; per-sheet CSS lives further down per `.profile-sheet`, `.trajectory-sheet`, etc.
- `src/engine/student-space/profile-tab-react-bridge.tsx` — `mountProfileTabReactPanel({ omitChrome: true })` is the contract; the React panel renders into whatever container the engine hands it.

### Institutional Learnings

From `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md` (origin of SheetChrome) and `docs/audit/audit-findings.md`:

- **A two-pane layout is a content-slot concern, not a chrome rewrite.** Both panes must live inside `chrome.contentSlot`. Do not split chrome itself — splitting chrome breaks `getActiveRoot()` and reopens the DayDetailCard z-32-behind-z-60 stacking bug.
- **Translucency posture extends to nested cards.** The left pane must not become a solid sidebar fill (the recent Profile-hero / Trajectory-card regressions are the cautionary tale). Alpha ≤ 0.40, hairline, or shadow only.
- **Existing stagger is wired to `chrome.contentSlot > :nth-child(-n+3)` at 0/80/160ms.** If left + right are sibling children of `contentSlot`, the stagger animates left first then right "for free". If they're wrapped in a single container, the stagger animates one element and we lose the effect. Pick the top-level child structure deliberately.
- **Component vocabulary is locked** (`docs/audit/design-system-2026-05-20.md`): pill = read-only (radius 999, no border, no cursor pointer), squircle = tap (10–14px radius). The left pane will be tempted to render its title-block summary as a card; obey the alpha and radius conventions.

### External References

None gathered — this is a content-slot refactor inside a codebase pattern we already own. No framework or third-party guidance applies.

---

## Key Technical Decisions

- **Add `layout: 'split' | 'stacked'` to `SheetChrome` constructor; default `'stacked'`.** Per-sheet opt-in keeps the primitive backward-compatible. The plan opts every sheet in; the default stays stacked so any future sheet that doesn't want the split layout still works.
- **Left and right panes are direct children of `contentSlot`** (not wrapped in an extra container). Preserves the existing 0/80/160ms entry stagger automatically — left pane = child 1, right pane = child 2.
- **Header migrates into the left pane when `layout: 'split'`.** Today the header is the first child of `contentSlot`; under split layout it becomes the first child of the left pane. Title CSS gets a `--compact` modifier dropping the scale from ~56px to ~22px.
- **`introSlot` is new; `bodySlot` is reused as the right pane content container.** Sheets that already render via `bodySlot.innerHTML = ...` keep working; they just gain an `introSlot` to populate. Renaming `bodySlot` → `rightSlot` was considered and rejected — too much per-sheet churn for a cosmetic gain.
- **CalendarSheet stays `layout: 'stacked'` when embedded inside HistorySheet.** The constructor takes an existing `embedded` mode; we'll route the layout off that flag so embedded Calendar doesn't render a nested two-pane inside HistorySheet's right pane. Standalone CalendarSheet uses split layout.
- **Responsive stack breakpoint: `max-width: 860px`** (matches the existing engine convention from LettersSheet's 780px breakpoint, bumped slightly to leave room for the wider two-pane). Below the breakpoint, the left pane becomes a compact intro band above the right pane and both panes flow vertically.
- **Sheet max-width grows from 760px to ~1180px** under split layout (~360px left + ~760px right + gutters), centered. Single-column sheets keep their 760px max-width.
- **ProfileSheet hero gets re-shaped, not removed.** The atmospheric wash + shimmer band currently spans full-bleed above the tabs; it becomes a thin band inside the left pane behind the identity card. Hero is too brand-defining to drop, but it doesn't need to claim a full row when the chrome already supplies the cream backdrop.

---

## Open Questions

### Resolved During Planning

- *Should the left pane host its own tab strip (sheets like Profile have 6 tabs)?* — Resolved: tabs stay in the right pane. The Gather screenshots show the right pane owns the working surface; pushing tabs into the left rail would force the left pane to grow taller than the intro content warrants and would conflict with the React-backed tabs' mount contract. Tabs are part of "the work", not part of "where am I".
- *Should the left pane scroll independently of the right pane?* — Resolved: yes. The left pane is `position: sticky` (or its own scroll container) so a long right-pane TIMELINE doesn't push the title off-screen. Mirrors Gather's behavior.
- *Should the chrome rewrite the existing header CSS or add a new compact title class?* — Resolved: add a new `.sheet-chrome__title--compact` modifier and the `.sheet-chrome--split` root modifier. Original stacked-layout sheets (none after this plan, but possible future ones) keep the original scale.

### Deferred to Implementation

- *Exact pixel width of the left pane.* The plan calls for ~320–380px; the right value drops out of fitting the longest left-pane intro (Profile's identity card + dimension summary) and the shortest viewport we still want two panes on (~960px). Tune during U2 with screenshots.
- *Whether the React-backed Relationships/Choices tabs need any prop changes when mounted into the new right pane.* The contract is `omitChrome: true`, which already implies "engine owns the chrome, you render the content"; verify during U2 implementation that the React panels respect the right pane's width constraints.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

DOM shape under `layout: 'split'`:

```
.sheet-chrome.sheet-chrome--split.<sheet-name>
├── .sheet-chrome__close                            (× button, unchanged)
└── .sheet-chrome__content                          (existing portal target)
    ├── .sheet-chrome__pane.sheet-chrome__pane--left
    │   ├── .sheet-chrome__header                   (eyebrow + compact title + subtitle)
    │   └── .sheet-chrome__intro                    (NEW — per-sheet introSlot)
    └── .sheet-chrome__pane.sheet-chrome__pane--right
        └── .sheet-chrome__body                     (existing bodySlot — per-sheet content)
```

Left + right panes are siblings of `.sheet-chrome__content`. The existing stagger rule `.sheet-chrome.is-open .sheet-chrome__content > :nth-child(-n+3)` continues to fire — child 1 = left pane, child 2 = right pane — so panes animate in sequence as before.

Per-sheet content responsibilities:

| Sheet | Left pane (intro) | Right pane (work) |
|---|---|---|
| Profile | Hero band · identity card · dimension summary · stat tiles | Tab strip · TLDR hero · COLLECTION bento · TIMELINE |
| Path Finder | Status pill + reason · meta stat tiles · head actions | Status-branched pathway content |
| Letters | Title + intro · letter list (clickable, selected state) | Selected letter detail |
| History | Title + intro · tab strip (Timeline / Growth) | Active tab's content (Calendar grid OR Growth's year-scrubber + island + summary) |
| Calendar (standalone) | Title + intro · month nav · Run Connector | Month grid (DayDetailCard portals into chrome root) |
| Settings | Title + intro | Sections list (World & Weather · Music · Companion · Path Finder preview · Onboarding) |

Responsive stacking below 860px:

```
[full-width left pane: compact title + intro inline]
[full-width right pane: working surface, scrolls]
```

Both panes still receive the stagger; the visual just rearranges from row to column.

---

## Implementation Units

- U1. **SheetChrome split-layout primitive**

**Goal:** Teach `SheetChrome` a `layout: 'split' | 'stacked'` option that builds the two-pane DOM, exposes a new `introSlot`, and ships the CSS skeleton (layout grid + compact title scale + responsive stack).

**Requirements:** R1, R2, R3, R4, R5, R6, R9, R10

**Dependencies:** None.

**Files:**
- Modify: `src/engine/student-space/Game/View/SheetChrome.js`
- Modify: `src/engine/student-space/Game/View/SheetChrome.d.ts`
- Modify: `src/engine/student-space/style.css` (add `.sheet-chrome--split`, `.sheet-chrome__pane`, `.sheet-chrome__pane--left/right`, `.sheet-chrome__intro`, `.sheet-chrome__title--compact`, responsive stack rule)

**Approach:**
- Add `layout: 'split' | 'stacked'` to the ctor; default `'stacked'`. Document in the JSDoc.
- When `'split'`, build the DOM under `contentSlot` as `[leftPane, rightPane]` siblings. Move the header element into `leftPane` (instead of `contentSlot`). Create `introSlot` as the second child of `leftPane`. `bodySlot` lives inside `rightPane`.
- Expose `chrome.introSlot` (only present when split). Falls back to `null` for stacked sheets. Document the contract.
- `portalTarget` stays = `chrome.root` (do NOT change to a pane). DayDetailCard and ShareDialog continue to portal into the active sheet's root.
- CSS: `.sheet-chrome--split .sheet-chrome__content` becomes a flex/grid row container; `.sheet-chrome__pane--left` is ~360px fixed, `.sheet-chrome__pane--right` is `min-width: 0; flex: 1`. Both panes are independently scrollable (`overflow-y: auto`). Compact title is ~22px line-height tight.
- Translucency: left pane background `rgba(255, 250, 243, 0.32)` (alpha well under the 0.40 cap), separated from right pane by a hairline `border-right: 1px solid rgba(43, 38, 32, 0.06)`. No solid fill.
- Responsive: `@media (max-width: 860px) { .sheet-chrome--split .sheet-chrome__content { flex-direction: column } .sheet-chrome__pane--left { width: 100%; position: static; border-right: none; border-bottom: 1px solid ... } }`.

**Patterns to follow:**
- The existing `header` block in `SheetChrome.js` for building/wiring DOM nodes.
- The existing stagger rule in `style.css` (`.sheet-chrome.is-open .sheet-chrome__content > :nth-child(-n+3)`) — verify it still triggers under split layout since left + right are children #1 and #2 of `contentSlot`.
- `.sheet-chrome__body` rules at ~line 996 in `style.css` — the new compact title and intro slot follow the same scoping convention.

**Test scenarios:**
- Happy path: A stacked-layout sheet (no `layout` option) still constructs with header on top, body below, no panes. No regression.
- Happy path: A split-layout sheet constructs with `.sheet-chrome--split` root class, left pane containing header + introSlot, right pane containing bodySlot.
- Happy path: `chrome.introSlot` is a real DOM element for split sheets, `null` for stacked sheets.
- Edge case: `setHeader({...})` still updates the eyebrow/title/subtitle text after split construction.
- Edge case: `OverlayController.getInstance().getActiveRoot()` returns the chrome root (not a pane) for both layouts.
- Edge case: Escape and × button still close the sheet for both layouts.
- Integration: Verify the entry-stagger CSS triggers visually — left pane fades in first, right pane ~80ms later. Manual browser check.
- Integration: At viewport width 800px, panes stack vertically; at 1100px they're side-by-side.

Test expectation: none -- this is a primitive DOM/CSS change with no unit-testable logic; verification is visual + downstream consumer tests in U2-U7. The chrome has no existing test file under `test/` and adding one for layout DOM scaffolding would add maintenance cost without catching regressions that the per-sheet visual checks won't already catch.

**Verification:**
- Manual: open any existing sheet (still stacked) — it looks identical to before this change.
- Manual: temporarily flip ProfileSheet to `layout: 'split'` and confirm the two-pane DOM is built and the stagger animation still plays.
- Typecheck passes (`pnpm run typecheck`).

---

- U2. **ProfileSheet to split layout**

**Goal:** Move Profile to `layout: 'split'`. Left pane = compact hero band + identity card + dimension summary (the "More about this dimension" disclosure body) + meta stat tiles. Right pane = tab strip + active tab content (TLDR hero, COLLECTION bento, TIMELINE for vanilla tabs; React panel for Relationships/Choices).

**Requirements:** R1, R2, R3, R4, R7, R10

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js`
- Modify: `src/engine/student-space/style.css` (per-sheet rules under `.profile-sheet`)
- Verify: `src/engine/student-space/profile-tab-react-bridge.tsx` (no changes expected; React panel mounts into right pane container)

**Approach:**
- Pass `layout: 'split'` to `new SheetChrome({...})`.
- Render hero (atmospheric wash + shimmer) inside `introSlot` as a compact band behind the identity card, NOT full-bleed above the panes.
- Identity card (avatar/name/class + share + auth buttons) lives in `introSlot` after the hero.
- "More about this dimension" disclosure (eyebrow + title + subtitle + VIPS breakdown + open-question callout) lives in `introSlot` below the identity card, scoped per active tab. Tab switch re-renders this block (it's tab-dependent today).
- Meta stat tiles (noticings count, voiced claims count) move into `introSlot` as the bottom intro element.
- Tab strip + TLDR hero + COLLECTION bento + TIMELINE all render into `bodySlot` (the right pane). Tab switching, filtering, forget-confirm pattern — all unchanged.
- React-backed tabs (Relationships, Choices) call `mountProfileTabReactPanel({ container: <body slot subtree>, omitChrome: true })` exactly as today.

**Patterns to follow:**
- Existing ProfileSheet tab-switching logic — keep `_renderTab(tabId)` but split its DOM output: per-tab intro block → `introSlot`, per-tab body → `bodySlot`.
- `tldrHeroHTML` / `bindDisclosureToggles` / `statTileRowHTML` from `visualPrimitives.js` — these continue to render in their current locations.
- CSS scoping: `.profile-sheet .sheet-chrome__intro` for left-pane styles, `.profile-sheet .sheet-chrome__body` for right-pane styles.

**Test scenarios:**
- Happy path: Open Profile from rail → left pane shows hero + identity + dimension summary + stats; right pane shows tab strip + TLDR + bento + timeline.
- Happy path: Click a tab → both panes update (left pane's dimension summary changes, right pane's content changes).
- Happy path: Open Relationships tab → React panel mounts into the right pane container; tab switch unmounts it.
- Edge case: A claim with no voiced quotes (TIMELINE empty) — empty-state copy renders in right pane; left pane stays populated.
- Edge case: Forget-quote two-tap arm/confirm still works in TIMELINE (no scroll re-bind issue between panes).
- Integration: Open ShareDialog from identity card → still portals into chrome root, sits above both panes (no z-index regression).

Test expectation: none -- this is a content-routing refactor with no new business logic. Existing engine flows (tab switching, forget-quote, share) keep their existing tests in `test/engine/`. Visual verification via dev server is the right check, per CLAUDE.md guidance.

**Verification:**
- Manual: every tab renders correctly with intro on left, content on right.
- Manual: hero band reads as intro context, not as full-bleed decoration.
- Manual: React-backed tabs (Relationships, Choices) render and respond to engine state changes.

---

- U3. **TrajectorySheet to split layout**

**Goal:** Move Path Finder to `layout: 'split'`. Left pane = status pill + reason tooltip + meta stat tiles + head actions (Run sense-making, Show/Back to paths). Right pane = the status-branched pathway content.

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/TrajectorySheet.js`
- Modify: `src/engine/student-space/style.css` (per-sheet rules under `.trajectory-sheet`)

**Approach:**
- Pass `layout: 'split'` to `new SheetChrome({...})`.
- Status pill (Starter/Diffused/Searching/Foreclosed/Achieved) + reason-on-click tooltip move into `introSlot`. The pill is the "where are you" badge.
- Meta stat tiles (pathway count, last-generated relative time) move into `introSlot` below the pill, hidden for Starter/Diffused per existing logic.
- Head actions (Run sense-making button, Show/Back to paths escape hatch) move into `introSlot` at the bottom.
- Status-branched body (single CTA card for Starter; three nudge buttons for Diffused; through-line + tabs + panel for Searching; committed direction + adjacent bearings for Foreclosed; 3-item card list for Achieved) all render into `bodySlot`.
- Header text continues to drive from the status — `setHeader({ eyebrow, title, subtitle })` is called per status; compact title scale applies automatically via U1's CSS.

**Patterns to follow:**
- Existing `_renderForStatus(status)` (or equivalent) routing in TrajectorySheet.
- Status colors from `facets.js` / `statusHeuristics.js` — already wired through the status pill's CSS.

**Test scenarios:**
- Happy path: open Path Finder in each of the 5 status states → left pane shows status pill + appropriate actions; right pane shows status-appropriate content.
- Happy path: tap "Run sense-making" from the left pane → triggers the same flow as today; new pathways appear in right pane.
- Edge case: status transitions (e.g., Searching → Achieved) while sheet is open — both panes re-render.
- Edge case: StatusPreviewHud override in Settings → forces Path Finder into a specific status — left pane status pill reflects the override.

Test expectation: none -- behavior preservation only; existing trajectory tests cover state transitions.

**Verification:**
- Manual: cycle through the 5 statuses via Settings → Path Finder preview, confirm each renders correctly.
- Manual: status-reason tooltip still opens from the status pill in the left pane.

---

- U4. **LettersSheet to split layout**

**Goal:** Move Letters to `layout: 'split'`. Left pane = title + intro paragraph + letter list. Right pane = active letter detail (or empty placeholder).

**Requirements:** R1, R2, R3, R4, R7, R9

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/LettersSheet.js`
- Modify: `src/engine/student-space/style.css` (per-sheet rules under `.letters-sheet`; remove the now-redundant 780px breakpoint that did its own list/detail split since the chrome handles it now)

**Approach:**
- Pass `layout: 'split'` to `new SheetChrome({...})`.
- The existing list-pane DOM (sorted letters with from/date meta, unread dot, subject, selected state) moves into `introSlot`. Above the list, add a one-line intro paragraph ("Notes that have arrived for you.").
- The existing detail-pane DOM (header with from/date, subject, body paragraphs, empty placeholder) moves into `bodySlot`.
- Drop the back-button (it was a mobile artifact of the old internal two-pane); responsive stacking from U1 handles the small-viewport case.
- Selection state: clicking a letter in `introSlot` updates `bodySlot` (existing behavior, just different containers).

**Patterns to follow:**
- Existing letter selection + detail render logic in `LettersSheet.js`.
- The 780px-breakpoint internal two-pane CSS is replaced by chrome's 860px stack from U1.

**Test scenarios:**
- Happy path: open Letters → list shows in left pane, detail in right.
- Happy path: click a letter → right pane updates to show its content.
- Edge case: no letters yet → left pane shows empty-state, right pane shows placeholder.
- Edge case: viewport narrows below 860px → panes stack; list above detail.

Test expectation: none -- content routing only.

**Verification:**
- Manual: select multiple letters, confirm right pane updates each time.
- Manual: narrow viewport check.

---

- U5. **HistorySheet to split layout**

**Goal:** Move History to `layout: 'split'`. Left pane = title + intro + tab strip (Timeline | Growth). Right pane = active tab content (embedded Calendar for Timeline, year-scrubber + island + summary for Growth).

**Requirements:** R1, R2, R3, R4, R7, R8

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/HistorySheet.js`
- Modify: `src/engine/student-space/style.css` (per-sheet rules under `.history-sheet`)

**Approach:**
- Pass `layout: 'split'` to `new SheetChrome({...})`.
- Title + intro paragraph ("How your reflections have changed over time.") + tab strip live in `introSlot`.
- Active tab content lives in `bodySlot`:
  - Timeline tab: reparent CalendarSheet's `root` into `bodySlot` as today (CalendarSheet stays in embedded mode, see U6).
  - Growth tab: year-scrubber pills + island preview + summary panel + footnote — same internal layout as today (which is already a left-rail + right-content composition inside the tab).
- Tab switch swaps the right-pane content; left pane intro stays.

**Patterns to follow:**
- Existing `_renderTab(tabId)` logic in HistorySheet for swapping content.
- The current `historySheet.calendarSheet.attachToHostRoot(hostRoot)` (or equivalent reparenting) — passes the new `bodySlot` as the host.

**Test scenarios:**
- Happy path: Open History → Timeline tab is active by default; embedded Calendar renders in right pane.
- Happy path: Switch to Growth → year-scrubber + island + summary renders in right pane.
- Edge case: Open DayDetailCard from inside the embedded Calendar — DayDetailCard portals into `HistorySheet.root` (via `OverlayController.getActiveRoot()`) and sits above both panes. **Critical: do not regress this.**
- Edge case: Switch tabs while DayDetailCard is open — DayDetailCard closes (existing behavior).

Test expectation: none -- content routing + reparenting; DayDetailCard z-stacking is the highest-risk integration check and is verified manually.

**Verification:**
- Manual: open Timeline tab → tap a calendar day → DayDetailCard renders above both panes, not behind. (This is the bug class that originally motivated SheetChrome.)
- Manual: Growth tab year-scrubber click → island + summary update.

---

- U6. **CalendarSheet split layout (standalone) + preserve embedded mode**

**Goal:** Move standalone CalendarSheet to `layout: 'split'`. Left pane = title + intro + month nav + Run Connector. Right pane = month grid. Keep the embedded-inside-HistorySheet mode unchanged (no nested split).

**Requirements:** R1, R2, R3, R4, R7, R8

**Dependencies:** U1, U5 (HistorySheet must still embed Calendar correctly)

**Files:**
- Modify: `src/engine/student-space/Game/View/CalendarSheet.js`
- Modify: `src/engine/student-space/style.css` (per-sheet rules under `.calendar-sheet`; ensure `.calendar-sheet--embedded` overrides leave the embedded mode single-column)

**Approach:**
- In CalendarSheet ctor, gate the chrome layout on the existing `embedded` flag: standalone → `layout: 'split'`, embedded → `layout: 'stacked'` (or whatever flag/path it uses today, e.g., not constructing its own chrome at all when embedded).
- Standalone split-layout: title + intro + month nav (prev/next/today buttons + month/year label) + "Run Connector" button in `introSlot`. Month grid (weekday labels + 42-cell grid) in `bodySlot`. DayDetailCard continues to portal into the chrome root.
- Embedded mode (inside HistorySheet's right pane): render only the grid (no chrome). HistorySheet's left pane already supplies title/intro; HistorySheet's tab strip already supplies navigation.

**Patterns to follow:**
- Existing `.calendar-sheet--embedded` modifier in `style.css` — it suppresses the standalone chrome's close button and shifts positioning. Extend it to suppress the split-layout left pane if Calendar somehow gets constructed with `layout: 'split'` while embedded (defensive — should not happen if U6's gating is correct).

**Test scenarios:**
- Happy path: Open standalone Calendar (e.g., via debug or future route) → left pane shows month nav, right pane shows grid.
- Happy path: Open History → Timeline tab → embedded Calendar still renders as single-column grid inside HistorySheet's right pane (no nested two-pane).
- Edge case: DayDetailCard opens correctly in both standalone and embedded modes; z-stacking unchanged.

Test expectation: none -- visual mode-switching; the embedded-vs-standalone routing already has implicit coverage via HistorySheet.

**Verification:**
- Manual: Open History → Timeline → DayDetailCard opens above HistorySheet's right pane, not behind.
- Manual: If/when standalone Calendar is reachable, confirm split layout renders.

---

- U7. **SettingsSheet to split layout**

**Goal:** Move Settings to `layout: 'split'`. Left pane = title + intro paragraph. Right pane = the existing 5 sections (World & Weather · Music · Companion · Path Finder preview · Onboarding).

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/SettingsSheet.js`
- Modify: `src/engine/student-space/style.css` (per-sheet rules under `.settings-sheet` — the section list already lives in `bodySlot`)

**Approach:**
- Pass `layout: 'split'` to `new SheetChrome({...})`.
- Move the existing header text (eyebrow "SETTINGS", title "Settings", subtitle "Tools for adjusting how the world behaves.") into compact-title rendering automatically via U1.
- `introSlot` contains a short orientation paragraph below the header (e.g., "Adjust the world's behavior or replay the first-run ceremony.") — short, non-redundant with the subtitle.
- The 5 section rows + their embedded admin UIs (HourHud, TrackPicker, BirdPicker, StatusPreviewHud) all stay in `bodySlot` exactly as they are. No changes to admin UI mounting.

**Patterns to follow:**
- The just-shipped SettingsSheet structure (sections + admin-slot mounts). Don't disturb the admin UI ownership/disposal flow.

**Test scenarios:**
- Happy path: Open Settings → left pane shows title + intro; right pane shows all 5 sections.
- Happy path: Cycle bird companion / toggle rain / open Path Finder preview menu — admin UIs still function inside the right pane.
- Edge case: Restart Onboarding still triggers a reload (no regression).

Test expectation: none -- content reshuffle only.

**Verification:**
- Manual: confirm rain toggle, music cycle, bird cycle, and quadrant preview all work from the new layout.

---

- U8. **Documentation update — CLAUDE.md sheet chrome contract**

**Goal:** Document the new `layout: 'split'` option in `CLAUDE.md` so the "Sheet chrome contract" guardrail covers the new shape. Mention the `introSlot` API and the responsive stacking convention.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1–U7 (so the documentation describes what actually shipped)

**Files:**
- Modify: `CLAUDE.md` (Sheet chrome contract section)

**Approach:**
- Add a short subsection "Split layout (default for full-viewport sheets)" describing the two-pane structure, `introSlot` API, compact title scale, and 860px responsive stack breakpoint.
- Update the example snippet to show `layout: 'split'` + `introSlot.innerHTML = '...'`.
- Note that stacked layout remains for any future surface that doesn't need the left intro pane.

**Patterns to follow:**
- The existing CLAUDE.md "Sheet chrome contract" tone — opinionated, with "Why" and "How to apply" subsections.

**Test scenarios:**
Test expectation: none -- documentation only.

**Verification:**
- Read-through: a new contributor reading CLAUDE.md can build a new split-layout sheet from the documented API without reading SheetChrome's source.

---

## System-Wide Impact

- **Interaction graph:** SheetChrome's API gains `layout` and `introSlot`; all six full-viewport sheets consume the new shape. Child overlays (DayDetailCard, ShareDialog) keep portaling into the chrome root via `OverlayController.getActiveRoot()` — no change.
- **Error propagation:** None new. Sheet construction failures still throw via `SheetChrome.constructor` as today.
- **State lifecycle risks:** ProfileSheet's React-backed tabs (Relationships, Choices) mount into the right pane via `profile-tab-react-bridge.tsx`. Mount/unmount lifecycle must continue to fire on tab switch — verify during U2 that the container reference handed to the bridge is stable across tab switches.
- **API surface parity:** No external API changes. `chrome.headerEl`, `chrome.bodySlot`, `chrome.portalTarget`, `chrome.closeBtn`, `chrome.open()`, `chrome.close()`, `chrome.setHeader()`, `chrome.dispose()` all keep their signatures. `chrome.introSlot` is additive.
- **Integration coverage:** DayDetailCard z-stacking inside History → Timeline → embedded Calendar is the highest-risk integration scenario. Re-verify after U5 + U6.
- **Unchanged invariants:** OverlayController exclusivity (one full-viewport sheet at a time), body-class hooks (`has-overlay`), Escape-to-close, × button, 200ms fade, content stagger, capture-sheet tier, chooser tier — all unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Splitting chrome instead of just contentSlot would break `getActiveRoot()` and re-introduce the DayDetailCard z-32-behind-z-60 bug. | U1 explicitly keeps `portalTarget = chrome.root` and adds panes as siblings of `contentSlot`. U5/U6 verification step explicitly opens DayDetailCard inside History → Timeline. |
| ProfileSheet's React-backed tabs (Relationships, Choices) might not respect the right pane's narrower width. | U2 verifies during implementation; if breakage, add a CSS width constraint inside `.profile-sheet .sheet-chrome__body` to feed the React panel a sane max-width. |
| Wrapping panes in a container would lose the existing 0/80/160ms entry stagger. | U1's design makes panes direct children of `contentSlot`, not wrapped — the existing stagger selector continues to match. |
| Left pane could become a solid sidebar fill, breaking the "island visible through chrome" translucency rule. | U1's CSS uses `rgba(255, 250, 243, 0.32)` (well under the 0.40 cap) and a hairline `border-right` for separation. Recent audit cited Profile hero / Trajectory cards as cautionary tales — same posture applied here. |
| CalendarSheet's embedded mode could accidentally render its own two-pane inside HistorySheet's right pane. | U6 explicitly gates `layout` on the existing `embedded` flag; embedded mode uses stacked (or its current no-chrome path). |
| ProfileSheet's full-bleed hero (atmospheric wash + shimmer) might not transition cleanly into a compact intro band. | U2 redesigns the hero as a thin band inside the left pane's `introSlot`. If visually unsuccessful, fallback is to render hero as a full-width band that spans both panes (using `grid-column: 1 / -1` or absolute positioning above the panes) — preserves the brand moment without breaking the layout grid. |
| Below the 860px stack breakpoint, the left pane's intro could push the right pane's content too far down to be useful. | U1's responsive rule collapses the left pane to a compact band (header + minimal intro), not the full left-pane content. Per-sheet CSS can `display: none` non-essential intro elements (e.g., Profile's hero band) in the stacked mode. |
| Tab strip currently lives in the right pane (in Profile / History). Users might expect tabs in the left pane (looking at the Gather screenshots more closely, Gather puts tabs in the right pane too). | Resolved during planning — tabs stay in right pane. Matches Gather's pattern; matches the "left orients, right works" principle. |

---

## Documentation / Operational Notes

- Update `CLAUDE.md` "Sheet chrome contract" in U8 to document `layout: 'split'`, `introSlot`, compact title scale, and the 860px responsive stack.
- After landing, capture a learning via `/ce-compound` documenting the responsive-stack breakpoint convention (currently no prior learning on engine-side breakpoints — this is the first one).
- Screenshot the before/after for each of the 6 sheets and attach to the PR description.

---

## Sources & References

- Origin user request: Gather Town two-pane redesign with attached screenshots (Calendar, Calendar with notifications, Activity).
- Sheet chrome contract: `CLAUDE.md` section "Sheet chrome contract" (line 5 onward).
- Origin chrome plan: `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md`.
- Translucency audit: `docs/audit/audit-findings.md` (Profile hero / Trajectory cards).
- Design system component vocabulary: `docs/audit/design-system-2026-05-20.md`.
- Profile/Path Finder TLDR + progressive disclosure: `docs/plans/2026-05-20-003-refactor-profile-path-finder-tldr-progressive-disclosure-plan.md`.
