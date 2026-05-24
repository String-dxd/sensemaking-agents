---
type: feat
status: active
created: 2026-05-24
plan_id: 2026-05-24-001
title: Mobile hamburger nav + responsive screens
---

# feat: Mobile hamburger nav + responsive screens

Replace the ≤640px bottom-strip fallback in `SideRail` with a top-left hamburger button that opens a left-slide nav drawer carrying the same six destinations, and make the five routed sheets (History, Profile, Letters, Trajectory, Settings) usable on a phone by collapsing the fixed 360px `SheetSidebar` into a stacked single-pane layout. Mechanical knock-ons (frame inset token, CaptureFab, HUD anchors) are mobile-branched so nothing assumes a desktop rail exists.

---

## Problem Frame

Today on ≤640px viewports:

- `SideRail` flips into a bottom horizontal strip that competes with the CaptureFab and squeezes the world canvas (`src/components/student-space/navigation/SideRail.tsx:107`). Tooltips disappear and labels are inaccessible — users see six unlabeled icons.
- Routed sheets (`src/components/student-space/sheets/*`) render the fixed 360px `SheetSidebar` (`src/components/ui/sheet.tsx:98`) regardless of viewport. On a phone the right pane is squeezed to ~20px of usable width and the identity header pushes the actual content offscreen.
- The frame inset token reserves a bottom gutter (`src/components/ui/sheet.tsx:7`, `max-[640px]:bottom-[calc(var(--inset-frame)+4.25rem)]`) for the bottom strip. After the strip goes away the gutter is wasted; the hamburger needs a top gutter instead.
- `CaptureFab` (`src/components/student-space/capture/CaptureFab.tsx:92`) and several `StudentSpaceHud` panels (`src/components/student-space/hud/StudentSpaceHud.tsx:157,305,504,640,699`) hard-code `left-[calc(var(--width-rail)+var(--inset-frame))]` for their world-area positioning; on mobile they sit ~64px inboard of where they should.

The desired phone behavior: a single hamburger button anchored top-left at `z-[70]` opens a Base UI `Dialog`-backed left-slide drawer holding the same six rail items vertically; selecting an item navigates and dismisses the drawer. Routed sheets stack their two panes vertically so the identity header and (where present) sub-nav sit on top of the body. The world canvas frame, FAB, and HUD anchors collapse the rail offset to zero at ≤640px.

---

## Scope

### In scope

- Top-left hamburger button + left-slide `NavDrawer` mobile nav surface (≤640px).
- Hide `SideRail` entirely on mobile; desktop (≥641px) behavior unchanged.
- `Drawer` primitive: add a `side` prop so it can slide from `bottom` (current), `left`, or `right`.
- `Sheet` primitive: mobile single-pane collapse (`SheetSidebar` flows above `SheetContent`; `SheetSidenav` becomes a horizontal scroll-tab strip).
- Per-sheet mobile reflow: Profile's inline `role="tablist"` collapses to horizontal scroll; Trajectory and Settings reflow with the primitive change; Letters switches to master/detail (list ↔ detail one-at-a-time on mobile).
- `studentSpaceFrameClassName` mobile inset: reserve top space (for the hamburger) instead of bottom space (for the deleted strip).
- `CaptureFab` and `StudentSpaceHud` mobile branches to drop the rail offset.
- Engine media-query reconciliation: extend `src/engine/student-space/style.css` rail-collapse breakpoint from `max-width: 520px` to `max-width: 640px` so engine + Tailwind agree on the mobile threshold.
- Test updates: `side-rail.test.tsx` two-group assertion, new `mobile-nav.test.tsx`, optional sheet mobile-shape test.

### Out of scope

#### Deferred to Follow-Up Work
- Onboarding ceremony screens (`src/components/student-space/onboarding/*`) — explicitly excluded by user. The ceremony is `display:none`'d during the onboarding window and would need its own pass.
- World canvas / in-world labels (`src/components/StudentSpaceHost.tsx`, `WorldInteractions.tsx`) — the 3D scene already fills the viewport; pickers and labels reposition automatically once `--width-rail` collapses to 0.
- `_dev/*` design surfaces — not user-facing.
- A `body.is-mobile` viewport class from `useEngineOverlay` (suggested in learnings research) — could be a follow-up if more components need shared mobile gating; not needed now since CSS variables + Tailwind `max-[640px]:` cover this plan.
- Capturing this work as a `docs/solutions/` learning entry — file after merge.

#### Outside this product's identity
- Native iOS / Android navigation patterns (gesture-driven back-swipe, tab bar at bottom) — desktop-first product; mobile is "still works" rather than "native feel."

---

## Requirements

Pulled from the user request and gating discussion:

- **R1.** A ≤640px hamburger button at top-left (`fixed top-(--inset-frame) left-(--inset-frame) z-[70]`) opens a nav drawer carrying the same six destinations as `SideRail` (Island, History, Profile, Path Finder, Letters, Settings) in the same `SHEET_HREFS` order.
- **R2.** Selecting a nav item navigates the router AND closes the drawer in one interaction.
- **R3.** The hamburger button and drawer respect the same onboarding-hide rules as `SideRail`: `useEngineOverlay().isOnboarding` OR `engine.state.onboarding.stage ∉ {done, pending} && !isDone` OR `pathname === '/onboarding'` ⇒ hide.
- **R4.** Active-state highlight in the drawer flips immediately on click (optimistic `pendingPathname` pattern from current `SideRail`), not waiting for the route to settle.
- **R5.** Desktop (≥641px) behavior of `SideRail` is unchanged. The existing `test/components/student-space/navigation/side-rail.test.tsx` desktop assertions continue to pass.
- **R6.** All five routed sheets render usable on a 375×667 viewport: identity header, sub-nav (where present), and body content are all reachable; no horizontal overflow; the body has at least 80% viewport width.
- **R7.** `SHEET_HREFS` remains the single source of truth — the round-trip test (`test/engine/SideRail.hrefs.test.ts`) continues to pass without modification.
- **R8.** `CaptureFab` and `StudentSpaceHud` left-anchored panels reposition correctly on ≤640px — they collapse the rail offset to zero, since the rail is hidden.
- **R9.** No engine (`src/engine/student-space/`) behavior change beyond the one media-query breakpoint reconciliation.

---

## Key Technical Decisions

### D1. Use Tailwind `max-[640px]:` arbitrary variant; do not introduce `sm:`

The repo's nav + frame code is consistently `max-[640px]:` (per research: `SideRail.tsx`, `sheet.tsx`, `WorldInteractions.tsx`). Switching to `sm:` would be functionally equivalent (`sm:` = `min-[640px]:`) but introduces idiom drift across the navigation surface area. Keep `max-[640px]:` for everything this plan touches.

### D2. Extend the engine media-query breakpoint from 520px to 640px

`src/engine/student-space/style.css:35-39` already zeros `--rail-width` and shrinks `--frame-inset` at ≤520px. That breakpoint pre-dates the React migration's `max-[640px]:` convention. Realigning to 640px means the engine and Tailwind agree on "mobile," and the CaptureFab JS particle-origin calc (`CaptureFab.tsx:46-49`, which reads `--width-rail` via `getComputedStyle`) automatically yields the right offset on mobile without a JS-side branch.

### D3. Extend `Drawer` with a `side` prop instead of forking a new `NavDrawer` primitive

`src/components/ui/drawer.tsx` already wraps `BaseDialog.Root` and ships a polished bottom-slide and bottom-popup. Adding `side?: 'bottom' | 'left' | 'right'` (default `bottom`) with three small animation-class branches is ~20 lines and preserves the single Base UI dialog primitive. A separate `NavDrawer` would duplicate Portal/Backdrop/animation plumbing for no behavioral gain.

The bottom-sheet-specific affordances inside `DrawerContent` (grabber pill at lines 65–78, close button) are only rendered for `side="bottom"`. Left/right variants render neither.

### D4. Mobile sheet collapse: stack `SheetSidebar` above `SheetContent`, do not portal it

The simplest and most accessible mobile collapse is `SheetSurface` flipping `max-[640px]:flex-col`, with `SheetSidebar` becoming `w-full` + `border-r-0 border-b` + auto-height. `SheetSidenav` flips to `max-[640px]:flex-row max-[640px]:overflow-x-auto` so multi-tab sheets get a horizontal scroll strip. No portals, no extra drawers.

Letters is the one sheet where this doesn't work (the sidebar IS a long list, not a sub-nav) — see U6.

### D5. Hamburger button position: `top-(--inset-frame) left-(--inset-frame)`, no new tokens

Mirroring `SideRail`'s anchor formula. The hamburger reuses the existing `--inset-frame` token; no new `--inset-frame-top-mobile` needed.

### D6. Frame inset reservation switches from bottom to top

`studentSpaceFrameClassName` in `src/components/ui/sheet.tsx:7` changes `max-[640px]:bottom-[calc(var(--inset-frame)+4.25rem)]` → `max-[640px]:top-[calc(var(--inset-frame)+3.5rem)]` (reserving ~56px for the hamburger button + breathing room). Routed sheets render below the hamburger; the hamburger remains accessible above the sheet (z-[70] > z-30).

### D7. Share nav item config between `SideRail` and the new `MobileNavDrawer`

Extract `SHEET_HREFS`, `TOP_RAIL_ITEMS`, and `BOTTOM_RAIL_ITEMS` from `SideRail.tsx` into `src/components/student-space/navigation/nav-items.ts`. Both surfaces import the same arrays. Avoids drift, satisfies the round-trip test from one source.

The mobile drawer renders top + bottom groups stacked vertically with a divider, preserving the visual grouping.

### D8. Mobile hide of `SideRail` via `max-[640px]:hidden` on the `<nav>`, not by branching the component

Cleaner than the current intra-component mobile flip. The component still returns its JSX; CSS hides it. The new `MobileNav` (hamburger + drawer) is rendered as a sibling at the same level in `EngineHost` and uses `min-[641px]:hidden` to flip the other way. Each surface owns one viewport.

---

## High-Level Technical Design

*Directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Component composition after this plan

```
EngineHost
├── .game (canvas)
├── SideRail              ← max-[640px]:hidden
├── MobileNav             ← min-[641px]:hidden (NEW)
│    ├── MobileNavTrigger ← hamburger button (top-left, z-70)
│    └── MobileNavDrawer  ← Base UI Dialog (left-slide via new Drawer side="left")
│         └── nav items from nav-items.ts (NEW)
├── CaptureFab            ← max-[640px]:left-(--inset-frame)
├── ...
└── routed children
     └── <PageSurface>    ← max-[640px]:top reserves hamburger gutter
          └── <SheetSurface flex-col on mobile>
               ├── <SheetSidebar w-full on mobile, border-b on mobile>
               │    └── <SheetSidenav horizontal scroll on mobile>
               └── <SheetContent>
                    └── <SheetBody>
```

### Sheet mobile collapse — per-sheet variants

| Sheet | Desktop sidebar | Mobile collapse |
|---|---|---|
| **History** | Identity + 2 SheetNavButtons | Identity + horizontal 2-tab strip → body (primitive change only) |
| **Profile** | Identity + IdentityCard + inline `role="tablist"` (6 items) + SignInLink footer | Identity + IdentityCard + horizontal scroll 6-tab strip → body; SignInLink moves to end of body or just below the strip |
| **Letters** | Identity + scrollable letter list | Master/detail toggle: list-only by default; selecting a letter swaps in the detail view with a "← Letters" back button. Local `selectedId` state already exists. |
| **Trajectory** | Identity + StatusPreviewSelector + status copy + meta + actions | Stacked above body (primitive change only) — the sidebar IS content here, not nav |
| **Settings** | Identity + prose description | Stacked above body; description folds into body (primitive change only) |

### Drawer animation states (D3)

| `side` | Closed transform | Open transform |
|---|---|---|
| `bottom` (existing) | `translate-y-full` | `translate-y-0` |
| `left` (new) | `-translate-x-full` | `translate-x-0` |
| `right` (new) | `translate-x-full` | `translate-x-0` |

Position classes per side: `bottom` → `inset-x-0 bottom-0`; `left` → `inset-y-0 left-0`; `right` → `inset-y-0 right-0`.

---

## Implementation Units

### U1. Reconcile the mobile breakpoint: frame token + engine media-query

**Goal:** One canonical mobile breakpoint at 640px across engine CSS and Tailwind classes; the world frame reserves a top gutter (for the hamburger) instead of a bottom gutter (for the deleted strip).

**Requirements:** R8, R9 (carries decisions D1, D2, D6)

**Dependencies:** none

**Files:**
- `src/engine/student-space/style.css` — bump the `@media (max-width: 520px)` rule to `max-width: 640px` (lines 35–39).
- `src/components/ui/sheet.tsx` — update `studentSpaceFrameClassName` (line 7): replace `max-[640px]:bottom-[calc(var(--inset-frame)+4.25rem)]` with `max-[640px]:top-[calc(var(--inset-frame)+3.5rem)]`; keep `max-[640px]:left-(--inset-frame)`.
- `test/components/ui/sheet.test.tsx` — if a test currently snapshots `studentSpaceFrameClassName`, update the expected string.

**Approach:** Two surgical edits — one CSS rule, one Tailwind class string. No new tokens, no JS changes. The engine media-query change is a numeric value swap; it cascades through `--rail-width: 0px; --frame-inset: 6px; --frame-radius: 14px` for the 521–640px range that previously kept the desktop values. Verify the canvas still looks reasonable in that gap by eye.

**Patterns to follow:** existing `max-[640px]:` idiom (D1).

**Test scenarios:**
- `studentSpaceFrameClassName` includes `max-[640px]:top-[calc(var(--inset-frame)+3.5rem)]` and does not include `max-[640px]:bottom-[`.
- (Manual) Resize to 600px: engine `.game` frame has zero rail offset; canvas fills width minus frame inset.

**Verification:** `pnpm check` passes; manual viewport check at 320/375/600/640/641/768/1024px shows continuous behavior — no visual breakage at the new 640px boundary.

---

### U2. `Drawer` primitive gains a `side` prop

**Goal:** `DrawerContent` accepts `side?: 'bottom' | 'left' | 'right'` (default `bottom`). Bottom keeps the existing grabber + close button; left/right render position-only.

**Requirements:** enables R1, R2 (carries decision D3)

**Dependencies:** none

**Files:**
- `src/components/ui/drawer.tsx` — add `side` to `DrawerContentProps`; branch position classes and animation classes per side; gate grabber + close button on `side === 'bottom'`.
- `test/components/ui/drawer.test.tsx` *(new file)* — three render snapshots, one per side, verifying the position class set and the grabber/close visibility.

**Approach:** Keep `popup` mode unchanged. Introduce a `SIDE_CLASSES` map of position + animation classes. Default `side="bottom"` preserves every existing call site (AskSheet, MoodSheet) without source changes. The left/right variants are full-height (`inset-y-0 left-0 w-[88vw] max-w-sm` for the left drawer, mirrored for right) — generous on small phones, capped on tablets-in-mobile-mode.

**Patterns to follow:** existing two-mode (`popup` vs default) prop pattern in the same file.

**Test scenarios:**
- Default (no side prop): popup behavior unchanged; grabber present.
- `side="bottom"` explicitly: same as default.
- `side="left"`: container has `left-0 inset-y-0`, animation classes include `-translate-x-full`, grabber and close button are NOT rendered.
- `side="right"`: container has `right-0 inset-y-0`, animation classes include `translate-x-full`.

**Verification:** AskSheet and MoodSheet (existing consumers) still open with the bottom-slide animation — visual check.

---

### U3. Mobile nav: hamburger button + left-slide drawer

**Goal:** A top-left hamburger button that opens a `Drawer side="left"` carrying the same six nav items as `SideRail`, with onboarding-hide rules, optimistic active state, and dismiss-on-select preserved.

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U2

**Files:**
- `src/components/student-space/navigation/nav-items.ts` *(new)* — re-exports `SHEET_HREFS`, `TOP_RAIL_ITEMS`, `BOTTOM_RAIL_ITEMS`, `RailItemId` type. `SideRail.tsx` re-exports `SHEET_HREFS` from here (to preserve the import path used by the round-trip test) — see U4.
- `src/components/student-space/navigation/nav-active.ts` *(new)* — exports `activeKeyFromPathname` and `normalizePathname` extracted from the current `SideRail.tsx`. Consumed by both `SideRail` (after U4) and `MobileNav`.
- `src/components/student-space/navigation/MobileNav.tsx` *(new)* — composes `MobileNavTrigger` + `MobileNavDrawer`; owns the `open` state, `pendingPathname` optimistic state, and the onboarding-hide guard. Wrapper element has `min-[641px]:hidden`.
- `src/components/student-space/EngineHost.tsx` — mount `<MobileNav game={game} />` next to `<SideRail game={game} />` (line 241).

**Approach:**
- `MobileNavTrigger`: a `button` with `aria-label="Open navigation"`, `aria-haspopup="dialog"`, `aria-expanded`, hamburger icon (lucide `Menu`), positioned `fixed top-(--inset-frame) left-(--inset-frame) z-[70]`, size-11 grid (same as `RailButton` for consistency), white background + ink, identical hover/active treatment.
- `MobileNavDrawer`: `Drawer` with `side="left"`, controlled `open` from `MobileNav`. Inside, render top-group items, a thin divider, then bottom-group items — each as a full-width button (`flex w-full items-center gap-3 px-5 py-3` + lucide icon + label) with the same `data-active` styling rules as `RailButton`. `aria-current="page"` on the active row.
- Selecting an item: call `useStudentSpaceNavigate()(href)`, set `pendingPathname`, close the drawer.
- Onboarding-hide: copy the triple guard from `SideRail.tsx:54-78` verbatim (including `useEngineSliceVersion` on `onboarding.subscribe`).
- Active-key derivation: re-use `activeKeyFromPathname` and `normalizePathname` — extract them into a small helper module `src/components/student-space/navigation/nav-active.ts` so both `SideRail` and `MobileNav` consume the same logic.

**Execution note:** Start by extracting `activeKeyFromPathname` and `nav-items.ts` so the new and existing components share one truth; then build `MobileNav`.

**Patterns to follow:** `src/components/student-space/navigation/SideRail.tsx` (entire file) for onboarding gating, optimistic active state, navigation transport. `src/components/ui/drawer.tsx` for `DrawerContent` composition.

**Test scenarios:**
- *Covers R1.* Hamburger button is visible at ≤640px (matchMedia mock); button has `aria-label="Open navigation"`.
- *Covers R1.* Clicking the hamburger sets `aria-expanded="true"` and renders a dialog with `aria-label="Navigation menu"` containing six buttons: Island, History, Profile, Path Finder, Letters, Settings. (Distinct from `SideRail`'s `aria-label="World navigation"` so test queries don't collide when both components are mounted in jsdom.)
- *Covers R2.* Clicking a nav item in the drawer calls the router navigate function with the matching `SHEET_HREFS` value AND closes the drawer (`aria-expanded` returns to `false`).
- *Covers R4.* The clicked item's button has `aria-pressed="true"` immediately after click, before the route changes.
- *Covers R3.* When `useEngineOverlay` reports `isOnboarding: true`, neither the hamburger nor the drawer renders (the wrapper returns `null`).
- *Covers R3.* When the pathname is `/onboarding`, neither the hamburger nor the drawer renders.
- *Covers R3.* When `engine.state.onboarding.stage === 'login'` and `isDone === false`, the hamburger is hidden.
- Pressing Escape while the drawer is open closes the drawer (Base UI default behavior — verify it works).
- At ≥641px viewport, the wrapper is hidden via CSS (`min-[641px]:hidden`).

**Verification:** Manual: open the dev server, resize to mobile, tap the hamburger, tap a nav item, confirm the route changed and the drawer closed. Resize to desktop, confirm the hamburger is hidden and SideRail returns.

---

### U4. `SideRail` desktop-only refactor + shared imports

**Goal:** `SideRail` consumes nav config from `nav-items.ts`, hides itself on mobile via CSS, and drops the inline `max-[640px]:` flip rules.

**Requirements:** R5, R7

**Dependencies:** U3 (creates `nav-items.ts` and `nav-active.ts`)

**Files:**
- `src/components/student-space/navigation/SideRail.tsx` — replace inline `SHEET_HREFS`, `TOP_RAIL_ITEMS`, `BOTTOM_RAIL_ITEMS`, `activeKeyFromPathname`, `normalizePathname` with imports from `nav-items.ts` + `nav-active.ts`. **Re-export `SHEET_HREFS`** from this file so existing import paths (notably the round-trip test) continue to resolve unchanged. Remove all `max-[640px]:` classes from the `<nav>` and inner divs (lines 107, 110, 113) — desktop styling only. Add `max-[640px]:hidden` to the `<nav>`. Remove the now-redundant `max-[640px]:hidden` from the tooltip span (the whole rail is hidden on mobile anyway, but keep it as defense-in-depth — opinion: drop it for cleanliness).
- `test/components/student-space/navigation/side-rail.test.tsx` — keep all existing assertions for desktop (default jsdom viewport ≥641px is fine). Add one new test: when `window.matchMedia('(max-width: 640px)')` returns `matches: true`, the `<nav>` has the `hidden` class (Tailwind compiles `max-[640px]:hidden` to a media query — verify via `nav.className.includes('max-[640px]:hidden')`).

**Approach:** Mostly deletion. The two-group inner div structure is preserved (the existing `side-rail.test.tsx` two-group assertion still passes). The component still mounts on every viewport; CSS handles hiding.

**Patterns to follow:** same file, pre-refactor.

**Test scenarios:**
- *Covers R7.* `SHEET_HREFS` import from `'~/components/student-space/navigation/SideRail'` resolves to the same value as the import from `'~/components/student-space/navigation/nav-items'`.
- *Covers R5.* All existing desktop tests in `side-rail.test.tsx` continue to pass: optimistic active state, router navigation per label, active-key collapse for `/history/growth`, two-group layout, onboarding hide.
- The rendered `<nav>` className includes `max-[640px]:hidden`.

**Verification:** `pnpm test` for `side-rail.test.ts` and `SideRail.hrefs.test.ts` both green.

---

### U5. `Sheet` primitive: mobile single-pane collapse

**Goal:** `SheetSurface` flips to `flex-col` on mobile; `SheetSidebar` becomes full-width with a bottom border; `SheetSidenav` becomes a horizontal scroll-tab strip; `SheetBody` reduces horizontal padding.

**Requirements:** R6, D4

**Dependencies:** none (parallel with U1–U4)

**Files:**
- `src/components/ui/sheet.tsx` —
  - The inner container in `PageSurface` (currently `flex h-full w-full overflow-hidden`): add `max-[640px]:flex-col`.
  - `SheetSidebar`: change `w-[360px] shrink-0 ... border-r border-(--color-sheet-divider)` to add `max-[640px]:w-full max-[640px]:shrink max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:max-h-none max-[640px]:overflow-visible`.
  - `SheetIdentityHeader`: add `max-[640px]:px-5 max-[640px]:py-6` to shrink the generous desktop padding.
  - `SheetSidenav`: add `max-[640px]:flex-row max-[640px]:gap-2 max-[640px]:overflow-x-auto max-[640px]:px-3 max-[640px]:pb-3` so it's a horizontal scroll strip.
  - `SheetNavButton`: add `max-[640px]:w-auto max-[640px]:shrink-0 max-[640px]:whitespace-nowrap` so each tab sizes to content and doesn't wrap.
  - `SheetPageHeader`: add `max-[640px]:px-5 max-[640px]:pt-6 max-[640px]:pb-4`.
  - `SheetBody`: add `max-[640px]:px-5 max-[640px]:py-5`.
- `test/components/ui/sheet.test.tsx` — add one assertion that with `matchMedia` mocked for `(max-width: 640px)`, the page container has `max-[640px]:flex-col` in className (Tailwind class strings are stable to grep at the className level; happy-dom doesn't actually compile the media query, so this is a class-presence check, not a layout check).

**Approach:** All edits are additive Tailwind class strings on existing primitive functions. No structural changes; all `data-testid`s preserved. The fixed `w-[360px]` becomes effectively `min-[641px]:w-[360px]` by virtue of `max-[640px]:w-full` winning at small viewports.

**Patterns to follow:** existing className composition in the same file.

**Test scenarios:**
- *Covers R6 (primitive level).* `sheet-sidebar` testid still queryable after the changes.
- Class-presence: `sheet-sidebar` className includes `max-[640px]:w-full`; page-container className includes `max-[640px]:flex-col`.
- `SheetSidenav` className includes `max-[640px]:flex-row max-[640px]:overflow-x-auto`.

**Verification:** Open `HistorySheet` and `SettingsSheet` on a 375px viewport in dev — sidebar and body should stack, with no horizontal scrollbar.

---

### U6. Per-sheet mobile reflow (Profile, Letters)

**Goal:** Two sheets that need targeted attention beyond the primitive change: Profile's inline `role="tablist"` becomes a horizontal scroll strip; Letters becomes master/detail on mobile.

**Requirements:** R6

**Dependencies:** U5 (the primitive change is what makes History/Trajectory/Settings work without per-sheet edits)

**Files:**
- `src/components/student-space/sheets/ProfileSheet.tsx` — find the inline `<div role="tablist">` around line 280 (the 6-tab strip). Add `max-[640px]:flex-row max-[640px]:overflow-x-auto max-[640px]:gap-2` and ensure each `SheetNavButton` inside has `max-[640px]:shrink-0 max-[640px]:whitespace-nowrap`. The `IdentityCard` and `SignInLink` footer continue to render above/below the tab strip; verify they fit visually on mobile or move the footer into the body on mobile if too cramped.
- `src/components/student-space/sheets/LettersSheet.tsx` — implement master/detail behavior on mobile:
  - Track viewport via a `useMediaQuery('(max-width: 640px)')` hook (add to `src/lib/hooks/use-media-query.ts` if it doesn't exist; otherwise inline a small one).
  - On mobile when `selectedId !== null`, render only `SheetContent` with a top "← Letters" back button that calls `setSelectedId(null)`.
  - On mobile when `selectedId === null`, render only the `SheetSidebar` (now full-width courtesy of U5).
  - On desktop both panes render as today.
  - Existing auto-select-newest behavior (lines 76–84) needs adjustment: on mobile, do NOT auto-select on mount (user should see the list first). Gate the effect by `!isMobile || sorted.find(l => l.id === selectedId)`.
- `src/lib/hooks/use-media-query.ts` *(new, if needed)* — a tiny SSR-safe `useMediaQuery(query: string): boolean` hook. Listens via `MediaQueryList.addEventListener('change', ...)`. Returns `false` during SSR.

**Approach:** Profile is a one-line class addition. Letters is the only sheet that genuinely needs a layout fork — the master/detail pattern is the canonical mobile email/messages affordance. Keep the engine slice subscription and `markRead` behavior unchanged; only the rendering branches.

**Patterns to follow:** existing Profile tab strip composition (use the same `SheetNavButton` styling). Letters' existing `selectedId` state machine.

**Test scenarios:**
- *Covers R6 (Profile).* With matchMedia mocked for mobile, the Profile tablist className includes `max-[640px]:flex-row max-[640px]:overflow-x-auto`.
- *Covers R6 (Letters).* On mobile with no `selectedId`, the back button is NOT rendered and the list is visible. Selecting a letter via `handleSelect` flips to the detail view AND the back button becomes visible AND the list is no longer rendered.
- On mobile, clicking the back button clears `selectedId` and re-renders the list.
- On desktop (default jsdom viewport), Letters renders both panes simultaneously — existing behavior unchanged.
- *Covers R6 (Letters auto-select).* On first mount in mobile mode with letters present, `selectedId` stays `null` (list visible). On desktop, auto-select still picks the newest unread.

**Verification:** Manual: open `/profile` on 375px — six tabs scroll horizontally; the active tab is visible. Open `/letters` on 375px — list appears; tap a letter; detail appears with back button; tap back; list returns.

---

### U7. `CaptureFab` and `StudentSpaceHud` mobile branches

**Goal:** Every fixed-positioned overlay that anchors against `--width-rail` gets a `max-[640px]:` branch that drops the rail offset.

**Requirements:** R8

**Dependencies:** U1 (engine media-query breakpoint at 640px makes the JS particle-origin calc in `CaptureFab` automatic; without U1 the JS would still read 64px at 521–640px).

**Files:**
- `src/components/student-space/capture/CaptureFab.tsx` — line 92, add `max-[640px]:left-(--inset-frame)` to drop the rail offset. The right anchor (`right-(--inset-frame)`) is fine on both viewports. The JS calc at lines 46–49 needs no change — it reads `getComputedStyle(document.documentElement).getPropertyValue('--width-rail')`, which U1 zeros at ≤640px.
- `src/components/student-space/hud/StudentSpaceHud.tsx` — five fixed anchors to mobile-branch:
  - Line 157: width formula `min(252px,calc(100vw-var(--width-rail)-44px))` — works automatically once `--width-rail` is 0 at ≤640px (no class change needed).
  - Line 305: same.
  - Line 504 (`StatusPreviewHud` non-inline branch): add `max-[640px]:left-[calc(var(--inset-frame)+12px)]`.
  - Line 640 (`TrackPicker` non-inline): same.
  - Line 699 (`BirdPicker` non-inline): same.
- `src/components/ui/hud.tsx` — `DOCK_CLASSES.top-left` and `DOCK_CLASSES.bottom-left` (lines 24, 26): add `max-[640px]:left-(--inset-frame)`.

**Approach:** Pure Tailwind className additions. Verify each anchor manually at 375px — none should clip the world canvas or overlap the hamburger button (which sits at `top-(--inset-frame) left-(--inset-frame)`, size-11 ≈ 44px). The HUDs at `top-left` dock and `StatusPreviewHud` at `top-left+12px` would overlap with the hamburger — they may need to bump to `top-[calc(var(--inset-frame)+56px)]` on mobile to clear the hamburger. Decide during implementation by looking at the layout.

**Patterns to follow:** existing mobile className idioms in the same file (HUD components use `inline` prop to skip fixed positioning entirely — verify whether the inline rendering paths are what mobile uses, in which case fewer branches are needed).

**Test scenarios:**
- Class-presence: `CaptureFab` container className includes `max-[640px]:left-(--inset-frame)`.
- Class-presence: `StatusPreviewHud` non-inline branch includes `max-[640px]:left-[calc(var(--inset-frame)+12px)]`.
- *Covers R8 (manual).* On a 375px viewport, the CaptureFab button is centered within the visible world area (no left offset that would push it offscreen).

**Verification:** Manual: open `/` (world route) on 375px — the FAB sits ~halfway between the hamburger and the right inset; the HUD pickers (BirdPicker, TrackPicker) do not overlap the hamburger or the FAB; the StatusPreviewHud (top-left dock) sits below the hamburger.

---

### U8. Test coverage finalization

**Goal:** Tests reflect the new mobile reality and cover regressions.

**Requirements:** R5, R7

**Dependencies:** U3, U4, U5, U6

**Files:**
- `test/engine/SideRail.hrefs.test.ts` — no changes; existing assertions still pass via re-export from `SideRail.tsx`.
- `test/components/student-space/navigation/side-rail.test.tsx` — see U4 test additions.
- `test/components/student-space/navigation/mobile-nav.test.tsx` *(new)* — see U3 test scenarios.
- `test/components/ui/sheet.test.tsx` — see U5 test additions.
- `test/components/ui/drawer.test.tsx` *(new)* — see U2 test scenarios.
- `test/components/student-space/sheets/letters-sheet.test.tsx` — verify the master/detail flip from U6 test scenarios. If this file already exists, extend it; otherwise create it.
- `test/components/student-space/sheets/profile-sheet.test.tsx` — verify the Profile tablist gains `max-[640px]:flex-row` className.

**Approach:** Use `vi.stubGlobal('matchMedia', ...)` or `Object.defineProperty(window, 'matchMedia', ...)` to mock viewport queries in tests. The `useMediaQuery` hook from U6 must be SSR-safe and respect the mock.

**Patterns to follow:** existing test files in `test/components/student-space/navigation/` for setup boilerplate (router providers, engine-overlay providers).

**Test scenarios:** see U2, U3, U4, U5, U6 sections — this unit is the catch-all to ensure every scenario listed has a corresponding test, and that the cross-cutting test runner passes.

**Verification:** `pnpm test` green; `pnpm check` green (Biome + tsc).

---

## System-Wide Impact

- **Engine ↔ React seam:** one numeric change in `src/engine/student-space/style.css` (520 → 640) is the only engine-side edit. CSS variables continue to be the single shared signal between engine and React.
- **Body-class system:** untouched. `has-overlay`, `has-capture-sheet`, `has-chooser`, `is-onboarding` continue to drive engine CSS as before. No new `is-mobile` class introduced (deferred — see Scope Boundaries).
- **URL-as-source-of-truth contract:** preserved. The mobile drawer fires `useStudentSpaceNavigate()(href)` exactly like `SideRail`; engine pause via `setRenderActive(pathname === '/')` continues to work.
- **`SHEET_HREFS` round-trip:** preserved by re-export from `SideRail.tsx` (U4). The test file path doesn't change; the constant's source moves to `nav-items.ts` but the import surface is unchanged.
- **Capture chooser (`AskSheet`, `MoodSheet`):** unchanged. They use `Drawer` with `side="bottom"` (default) — D3 ensures their behavior is identical.

## Risk Analysis

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| `useMediaQuery` SSR mismatch (renders desktop layout first, flips on hydrate) | Medium | Low | Default to `false` (mobile layout) in SSR for Letters specifically — list is the safer first paint than detail. For sheet primitive collapse, CSS handles it without JS, so no SSR risk. |
| The engine media-query breakpoint bump from 520→640 changes layout for 521–640px users (was desktop, now mobile) | Medium | Low | Intentional — that range was getting the desktop layout on phone-sized viewports. Verify on a Galaxy Fold (~540px) or tablet portrait split-screen by eye. |
| `side-rail.test.tsx` two-group assertion may break if the refactor accidentally flattens the inner divs | Low | Medium | U4 explicitly preserves the two-group structure; the test still passes. Re-run the test after U4 lands. |
| `Drawer` `side` prop addition could subtly affect existing AskSheet/MoodSheet animations | Low | Medium | D3 defaults `side` to `"bottom"` and gates affordances on `side === 'bottom'`. Visual smoke test of both sheets is in U2 verification. |
| HUD pickers (BirdPicker, TrackPicker) overlap the hamburger on mobile | Medium | Low | U7 explicitly notes this and proposes a top-offset bump if needed. Catches it at implementation time. |
| Letters master/detail back button is missed by users (they tap the hamburger expecting back) | Low | Low | Place the back button prominently as a chevron + label at the top of `SheetPageHeader` on mobile. Hamburger continues to work as global nav. |

## Test Strategy

- **Vitest unit tests** for each primitive (Drawer side variants, Sheet mobile classes) and the navigation surfaces (SideRail desktop-only, MobileNav rendering and gating).
- **`matchMedia` mocking** at the test setup level to flip between desktop and mobile assertions in the same file.
- **`SideRail.hrefs.test.ts` is the immovable contract** — must pass without modification at every step.
- **No e2e or visual-regression tests** — the existing test suite uses happy-dom and class-presence assertions; visual checks are manual via dev server.
- **Manual smoke checklist** in U3, U6, U7 Verification fields covers the full user flow on a 375px viewport.

## Dependencies / Prerequisites

- No new packages. Base UI Dialog, Tailwind v4, lucide-react, TanStack Router are all already in use.
- A `useMediaQuery` hook is added to `src/lib/hooks/` (or inlined in `LettersSheet`) — single small SSR-safe utility.

## Open Questions Deferred to Implementation

- **Whether the Profile sign-in footer stays above the body or moves into the body on mobile** — decide during implementation by looking at the 375px layout. Trivial to flip later.
- **Whether HUD pickers need a top-offset bump on mobile to clear the hamburger** — see U7. Decide visually.
- **Whether to keep the existing `IdentityCard` inside `SheetSidebar` on Profile mobile, or move it into the body for vertical space** — trivial follow-up adjustment if it feels cramped.

---

## Deferred to Follow-Up Work

- Onboarding ceremony mobile pass.
- World canvas / in-world labels mobile audit (out of scope, but worth a separate look — pickers should already reposition automatically).
- `body.is-mobile` viewport class via `useEngineOverlay` for cross-cutting mobile gating.
- A `docs/solutions/` entry capturing the 640px breakpoint convention and the master/detail mobile pattern (the 2026-05-21 gather-style plan flagged that engine breakpoint conventions had no learning captured — same gap here).
