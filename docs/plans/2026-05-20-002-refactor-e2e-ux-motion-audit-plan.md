---
title: E2E UX, motion, and polish audit (Mobbin-augmented)
type: refactor
status: active
date: 2026-05-20
---

# E2E UX, motion, and polish audit (Mobbin-augmented)

## Overview

The sheet-primitive migration (plan 001 from earlier today) unified the chrome. This plan addresses the *content inside* the chrome plus the rest of the app — onboarding, capture flow, world-level HUDs, in-context overlays — across every user-visible surface.

Three lenses, used together:

1. **`make-interfaces-feel-better`** — 16 concrete design-engineering principles (concentric border radius, optical alignment, shadows-over-borders, interruptible animations, split-and-stagger enters, contextual icon animations, font smoothing, tabular numbers, text-wrap, image outlines, scale-on-press, skip animation on page load, never `transition: all`, sparing `will-change`, 40×40px hit area, subtle exits).
2. **`web-animation-design`** — motion timing, easing curves, transition specificity, GPU acceleration, prefers-reduced-motion compliance.
3. **Mobbin MCP** (`https://api.mobbin.com/mcp`) — real production-app references per surface family, used as benchmarks to prevent AI-slop reflexes.

---

## Problem Frame

The user reports (and recon confirms) several concrete defects that span the full flow:

- **Onboarding**: Kira (the companion bird) is visible on the island for a moment *before* her landing animation plays — a render-before-animate flash.
- **Profile**: an opaque beige strip at the top defeats the "island visible behind every sheet" promise from the chrome migration.
- **Path Finder (Trajectory)**: opaque `rgba(255,255,255,0.72)` cards in the middle of the sheet break the translucent posture.
- **ShareDialog**: opens *behind* the Profile sheet — same class of bug as the DayDetailCard one that was just fixed.
- **Cross-flow**: motion timings, hit areas, hover treatments, tabular numbers, font smoothing, and other polish details have never been audited holistically.

The shared characteristic: no single principle is being violated dramatically — many small details compound into a "feels generated" surface. The goal is to address them in one coherent pass against real-world references.

---

## Requirements Trace

- R1. Kira does not appear on the island until her landing animation begins.
- R2. ShareDialog renders *above* whichever full-viewport sheet is open, with the correct stacking context, and stays correctly positioned across open/close cycles.
- R3. Profile's hero area does not present as an opaque solid block — the island remains perceptibly visible through it.
- R4. Trajectory and other sheets do not display opaque white-cream cards on top of the translucent chrome; content sits on the chrome itself or in cards with alpha ≤0.40.
- R5. Every interactive element (buttons, tabs, pills, chips, day cells, nav arrows) has a minimum 40×40px hit area and a `scale(0.96)` press feedback.
- R6. Every nested rounded element uses concentric border radius (outer = inner + padding).
- R7. Every dynamic numeric display uses `font-variant-numeric: tabular-nums`.
- R8. The root layout applies `-webkit-font-smoothing: antialiased`.
- R9. Headings use `text-wrap: balance`; body paragraphs use `text-wrap: pretty`.
- R10. No `transition: all` rules in the codebase; every transition specifies exact properties.
- R11. `will-change` is only applied to `transform`/`opacity`/`filter`, only when first-frame stutter is observed.
- R12. All transitions ≥ 200ms collapse to ≤ 80ms when `prefers-reduced-motion: reduce` is set.
- R13. The full E2E flow (cold onboarding → world → every sheet → every capture flow → sign out) is captured in before/after screenshots and verified end-to-end.

---

## Scope Boundaries

- **Not** redesigning information architecture. (No tab moves, no sheet merges, no flow reshuffling.)
- **Not** touching `src/components/world/*` (dormant per project memory).
- **Not** touching the sheet primitive itself — the `SheetChrome` contract from plan 001 is stable. Only its consumers are in scope.
- **Not** installing shadcn (engine is vanilla JS; React-side uses Base UI).
- **Not** changing prose / copy unless the audit identifies a specific cognitive-load or AI-slop issue.

### Deferred to Follow-Up Work

- Mobile-only adaptations (the engine has some, but full responsive polish would be a separate plan).
- A new design-tokens layer extracted from the per-sheet styles — useful but bigger than this audit.

---

## Context & Research

### Surface inventory (from prior recon)

- **Boot/Onboarding** (7 surfaces): EdupassLogin, Greeting, EggHatcher (color/name/hatch), FirstChat, FirstMood, IslandReveal, OnboardingFlow.
- **World always-on** (~12 surfaces): Island, Kira, Sky, Trees/Flowers/Fruits/Sprouts, TopNav, HourHud, ZoomHud, StatusPreviewHud, CaptureFab, Mailbox, Telescope, Butterflies, Fireflies, Particles, weather (Rain/Rainbow/Aurora).
- **Capture flow** (6 surfaces): CaptureChooser, MoodSheet, AskSheet, PhotoSheet, CaptureActionMenu, IslandProgressionOverlay.
- **Full-viewport sheets** (5): History, Profile, Letters, Trajectory, Calendar (all on `SheetChrome`).
- **In-context overlays** (~9): KiraDialogue, KiraNarrator, DayDetailCard, FacetView, ObjectPeek, HoverCta, BirdPicker, TrackPicker, ShareDialog.
- **Routing**: `?sheet=*` deep links.

### Confirmed defect coordinates

| # | Issue | File:line |
|---|---|---|
| 1 | Kira mesh added at perch on scene init | `Kira.js:297` |
| 2 | Kira fly-in starts off-canvas | `FirstChat.js:72–85`, `Kira.js:550–594` |
| 3 | ShareDialog mounts to body, z-40 < chrome z-60 | `ShareDialog.js:82`, `style.css:3159` |
| 4 | Profile hero shimmer opacity 0.85 | `style.css:3043` |
| 5 | Trajectory "starter card" rgba 0.72 | `style.css:4918` |
| 6 | Trajectory "nudge" rgba 0.72 | `style.css:4979` |
| 7 | Trajectory "foreclosed item" rgba 0.72 | `style.css:5080` |
| 8 | Trajectory "achieved item" rgba 0.72 | `style.css:5155` |
| 9 | History pill hover rgba 0.95 (over-aggressive) | `style.css:6386` |
| 10 | Calendar standalone has no eyebrow/title | `CalendarSheet.js:73–88` |
| 11 | HoverCta `display: none → block` swap | `HoverCta.js` |
| 12 | KiraDialogue greeting 1400ms cold-start delay | `KiraDialogue.js` |

### Motion-suspect shortlist

- HoverCta display swap (no opacity prep)
- CaptureChooser RAF slide vs CSS backdrop fade sync
- DayDetailCard portal-mount timing
- Onboarding cross-fade race
- AskSheet typewriter + RAF scroll race
- StatusPreviewHud visibility toggle without fade
- ShareDialog spinner has no stop condition

---

## Key Technical Decisions

- **Mobbin first, opinion second.** For each surface family, pull 2–3 reference patterns from Mobbin before designing changes. The references go in `docs/audit/mobbin-references-2026-05-20.md` as a brief.
- **Bug fixes before polish.** PHASE 2's four critical bugs ship before any of the principle sweeps. The user has seen these specific defects; landing fixes for them first re-establishes trust.
- **The `make-interfaces-feel-better` review-output convention.** Every PHASE 3/4/5 finding presents as a before/after table grouped by principle. No prose-only findings.
- **Verification by replay.** Every phase ends with a browser walk that recreates the affected user flow from a known state (typically a fresh tab, sometimes a cleared `localStorage`).

---

## Implementation Units

- U1. **Mobbin reference brief**

**Goal:** Pull 2–3 Mobbin patterns per surface family and save them as the audit's external benchmark.

**Requirements:** R3, R4, R6, R9, R13 (visual references inform all visual fixes)

**Dependencies:** Mobbin MCP available in the session.

**Files:**
- Create: `docs/audit/mobbin-references-2026-05-20.md`

**Approach:**
- Confirm Mobbin tools are available; list them.
- For each query below, run the Mobbin search/fetch and capture: app name, screen description, key detail we should benchmark against, screenshot URL if available.
  - "guided first-run onboarding with character/companion intro"
  - "journaling / reflection mood-capture flow"
  - "translucent sheet over animated background scene"
  - "personal calendar with mood/affective markers"
  - "personal letters or messages inbox"
  - "decision-explorer / pathway viewer / careers tool"
- Write the brief as a single markdown file with per-family sections, ≤ 1 page total. This is **reference material, not a copy target.**

**Test scenarios:**
- *Happy path:* Brief contains 6 family sections, each with 2–3 named patterns and what specifically we'd benchmark against.
- *Edge case:* If a family has no good Mobbin match, the brief states that explicitly and falls back to the design laws from `make-interfaces-feel-better` for that family.

**Verification:**
- Brief file exists at the path above with all 6 family sections populated.

---

- U2. **Fix Kira pre-land flash**

**Goal:** Kira is invisible until the FirstChat fly-in animation begins; she materializes only during the fly arc.

**Requirements:** R1

**Dependencies:** None (independent bug)

**Files:**
- Modify: `src/engine/student-space/Game/View/Kira.js`
- Modify: `src/engine/student-space/Game/View/Onboarding/FirstChat.js`
- Possibly: `src/engine/student-space/Game/View/Onboarding/OnboardingFlow.js`

**Approach:**
- Add a visibility gate: when `setOnboardingMode(true)` runs, set `this.group.visible = false`.
- In `FirstChat.mount()` (or the equivalent hook just before `kira.flyTo(...)`), call `kira.group.visible = true` and ALSO `kira.group.position.copy(startPos)` BEFORE `flyTo` enables the tick loop. This guarantees the first rendered frame shows the bird at the off-canvas start position, not at the perch.
- Confirm `kira.setOnboardingMode(false)` no-ops on visibility (the bird should already be visible by then via the flyTo entry).
- Reduced-motion path: when `reducedMotion`, still reveal at the start position; flyTo collapses to an instant snap (existing behavior) — visible-at-perch is fine in that mode because there was never an animation expectation.

**Test scenarios:**
- *Happy path:* Clear `localStorage.onboarding` → reload → walk through to FirstChat phase → Kira appears off-canvas-left high, then arcs to perch over 2.4s. No pre-land flash.
- *Edge case:* Refresh mid-FirstChat (onboarding resume). Kira reveals at the correct frame even if a phase is partially complete.
- *Reduced motion:* `prefers-reduced-motion: reduce` — Kira reveals at perch instantly (no arc), but never visible-before-revealed.

**Verification:**
- Cold-onboarding replay shows no Kira-at-perch frame before the arc starts. Capture as a GIF.

---

- U3. **Fix ShareDialog z-stacking + portaling**

**Goal:** ShareDialog always renders above the active full-viewport sheet, with correct stacking context.

**Requirements:** R2

**Dependencies:** None (independent bug; uses the `OverlayController.getActiveRoot()` helper added in plan 001)

**Files:**
- Modify: `src/engine/student-space/Game/View/ShareDialog.js`
- Modify: `src/engine/student-space/style.css`

**Approach:**
- At open time, portal ShareDialog's root into `OverlayController.getActiveRoot()` if non-null, else `document.body`. Mirror the DayDetailCard pattern from `DayDetailCard.js:open()`.
- Raise `.share-dialog` z-index from 40 to a value greater than 60 within the active sheet's stacking context — but since ShareDialog now lives inside the sheet's DOM tree, its z-index only needs to beat sibling content. Set z-index: 5 within the sheet's stacking context (above sheet content, below sheet's own × button at z-32).
- Test open / close / open cycle: ShareDialog should re-portal on each open (active sheet may have changed).

**Test scenarios:**
- *Happy path:* Open Profile → click Share → ShareDialog appears centered above Profile content, island still blurred behind.
- *Edge case:* Close ShareDialog (backdrop tap / × / escape) → Profile is still open and interactive.
- *Cross-sheet:* If ShareDialog could ever open from a different sheet, it portals into THAT sheet — not Profile permanently.
- *Reflow:* After ShareDialog closes, open it again → portals freshly each time.

**Verification:**
- Screenshot: ShareDialog open over Profile, visibly on top, Profile content blurred behind both.

---

- U4. **Profile hero opacity — let the island show through**

**Goal:** Profile's hero band no longer reads as a solid beige strip; the island visibly extends through the top of the sheet.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `src/engine/student-space/style.css` (lines around 3019–3049)

**Approach:**
- Reduce `.profile-sheet__hero-shimmer` opacity from `0.85` to `0.35`.
- Reduce `.profile-sheet__hero-wash` gradient opacity caps (the `88%` end stop drops to `55%`; the `55%` mid stop drops to `28%`).
- Verify the facet color still tints the top area perceptibly (it should — `color-mix()` with `var(--facet-soft)` still applies).
- Adjacent: `.profile-id` (`style.css:3074`) has 72px top padding creating the apparent "header band". Audit whether this padding is intentional spacing or accidentally amplifying the hero density. Leave alone unless it visibly improves the result.

**Test scenarios:**
- *Happy path:* Open Profile → top of sheet shows facet-colored wash but the island silhouette and tree-tops are perceptibly visible through it.
- *Per-facet:* Switch tabs (Values → Interests → Personality → Skills → Relationships → Choices) — each facet's wash should tint differently but never opaquely.

**Verification:**
- Side-by-side screenshots: Profile vs History. Both should show island behind. Profile's facet color still reads as the dominant top tone but with island visible through it.

---

- U5. **Path Finder opaque-card sweep**

**Goal:** Trajectory's content cards no longer present as solid panels on the translucent chrome.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `src/engine/student-space/style.css` (lines 4918, 4979, 5080, 5155 and any sibling card rules in trajectory area)

**Approach:**
- Per-card decision: reduce alpha or remove the card background entirely.
  - `.trajectory-starter__card` (4918): reduce to `rgba(255,255,255, 0.40)`. Keep `border-radius: 18px` and `box-shadow` for shape; the soft glass effect carries it.
  - `.trajectory-nudge` (4979): reduce to `rgba(255,255,255, 0.40)`.
  - `.trajectory-foreclosed__item` (5080): reduce to `rgba(255,255,255, 0.40)`.
  - `.trajectory-achieved__item` (5155): reduce to `rgba(255,255,255, 0.40)`.
- Also: `.trajectory-sheet__status-pill` at 0.72 (4845) — reduce to 0.55 for chip consistency.

**Test scenarios:**
- *Happy path:* Open Path Finder via `?sheet=trajectory` → all status modes (Starter / Diffused / Searching / Foreclosed / Achieved) — content reads cleanly on the chrome, no solid panel in the middle.
- *Readability check:* The longest body text (PATH 1 detail) still has adequate contrast against the translucent + island backdrop. If contrast fails on bright sky areas, increase to 0.50 (not 0.72).

**Verification:**
- Side-by-side: Path Finder before vs after.

---

- U6. **Mobbin-referenced visual audit, per family**

**Goal:** Each surface family is evaluated against the Mobbin references from U1 and adjusted where ours falls short.

**Requirements:** R3, R4, R13

**Dependencies:** U1, U2–U5 (do bug fixes first to avoid auditing against known-broken state)

**Files:**
- Modify: per-surface CSS and JS files, surgically. Likely small edits scattered across `style.css` and a few sheet JS files.

**Approach:**
- For each surface family in the brief, open the live surface side-by-side with the Mobbin reference.
- Note three things per family: (a) what theirs does that ours doesn't, (b) what ours does that we could keep but make more intentional, (c) what's an AI-slop reflex we should remove.
- Apply targeted fixes only. NOT a full redesign. The brief is reference, not prescription.

**Test scenarios:**
- *Per family:* Walk each surface; record the (a)/(b)/(c) notes. Apply small edits. Re-screenshot.

**Verification:**
- An `audit-findings.md` summary in `docs/audit/` with per-family before/after notes.

---

- U7. **`make-interfaces-feel-better` pass — typography**

**Goal:** Apply the typography principles (text-wrap, font smoothing, tabular numbers) across the whole app.

**Requirements:** R7, R8, R9

**Dependencies:** U2–U5 (so we're auditing the fixed surfaces, not the broken ones)

**Files:**
- Modify: `src/engine/student-space/style.css` (root + heading + numeric-display selectors)
- Possibly: `src/app/layout.tsx` or whichever React-side root sets up the document body class

**Approach:**
- **Font smoothing:** Add `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` to the engine's root layout (likely `body.student-space-shell` or similar in `style.css`).
- **text-wrap balance:** Apply to every `h1`, `h2`, `h3` in sheet content. Group selector: `.sheet-chrome__content h1, .sheet-chrome__content h2, .sheet-chrome__content h3 { text-wrap: balance; }`.
- **text-wrap pretty:** Apply to `.sheet-chrome__content p` for body paragraphs (Profile narrative, Path Finder body, Letters body, History stats).
- **tabular-nums:** Apply to: calendar day numbers (`.calendar-day__num`), year-scrubber pills (`.history-sheet__pill` numeric content), claim counts (Profile bento tile thumbnails — currently SVG so likely fine), Path Finder generation timestamp, status pill "X pathways" count, any "0/0 applied" connector text.

**Test scenarios:**
- *Happy path:* Open History → calendar dates don't shift width across months (1 vs 11 vs 31). Year pills don't shift width across years.
- *Heading wrap:* "What you keep coming back to" (Profile values heading) — balance prevents an awkward orphan break.
- *Body wrap:* Path Finder body paragraph — `pretty` prevents the last line from being a single short word.
- *Font crispness:* Compare before/after on a macOS Retina display — text noticeably less heavy.

**Verification:**
- Cross-sheet text screenshots with before/after, ≤6 examples.

---

- U8. **`make-interfaces-feel-better` pass — surfaces**

**Goal:** Apply the surfaces principles (concentric radius, optical alignment, shadows-over-borders, image outlines) across the app.

**Requirements:** R6

**Dependencies:** U7 (close ordering — both touch sheet CSS heavily, keep them adjacent in time)

**Files:**
- Modify: `src/engine/student-space/style.css` (targeted radius / shadow / outline edits)
- Possibly: a few JS files for optical icon adjustments

**Approach:**
- **Concentric radius audit:** Walk every nested rounded element in sheet content and fix where outer ≠ inner + padding. Likely offenders:
  - Profile open-question callout (border-radius on the box vs inside the box's content).
  - Bento tiles inside Profile (tile radius vs inner thumbnail radius).
  - Letter rows (row radius vs avatar radius).
  - Trajectory bearing items (item radius vs inner chip radius).
  - Calendar day cells (cell radius vs marker dot radius).
- **Optical alignment:** Audit icons — `×` button glyph centering, share-button arrow, calendar nav `‹/›`, tab pill content centering. The `×` likely needs a 1px down-shift; the `‹/›` likely need 1px right/left shifts to optically center.
- **Shadows over borders:** Find every `border: 1px solid` on a content surface and consider replacing with a layered `box-shadow` (`0 1px 2px rgba(43,38,32,0.04), 0 4px 12px rgba(43,38,32,0.06)`). Exception: image outlines stay as 1px outline per the skill's rule.
- **Image outlines:** Bento tile thumbnails (Profile), letter avatars if any, BirdPicker preview, Kira's selected-species thumbnail — apply `outline: 1px solid rgba(0,0,0,0.1)` (light mode) per the skill's pure-black rule. Never tinted.

**Test scenarios:**
- *Concentric radius:* Inspect Profile open-question callout — outer and inner geometry visibly match.
- *Optical icon centering:* Zoom into the `×` button in DevTools — glyph optically centered within the 40px circle.
- *Shadows-over-borders:* Letter rows no longer have hairline borders; they have soft shadow separation.
- *Image outlines:* Bento thumbnails read as floating-on-surface, not bordered.

**Verification:**
- Before/after table per principle in `audit-findings.md`.

---

- U9. **`make-interfaces-feel-better` pass — animations**

**Goal:** Apply the animation principles (interruptible transitions, split-and-stagger enters, subtle exits, contextual icon animations, scale-on-press, skip-on-load).

**Requirements:** R10, R11 (and R1 stays satisfied)

**Dependencies:** U2 (Kira fix), U7+U8 (visual is in place first)

**Files:**
- Modify: `src/engine/student-space/style.css` (transitions)
- Modify: `src/engine/student-space/Game/View/SheetChrome.js` (split-and-stagger enter)
- Modify: a few JS files for icon-context animations

**Approach:**
- **No `transition: all`:** `grep -n "transition: all" src/engine/student-space/style.css` and replace each with specific properties. Tailwind's `transition-transform` is the canonical alternative when present.
- **Scale on press:** Every `.button`, `.tab`, `.pill`, `.chip`, `.letter-row`, `.calendar-day`, `.bento-tile`, `.trajectory-foreclosed__item`, `.trajectory-achieved__item` → add `&:active { transform: scale(0.96); }` with `transition-property: scale, opacity; transition-duration: 120ms`. NEVER below 0.95.
- **Split-and-stagger sheet enters:** Today's sheet entry is `opacity 0 → 1` over 200ms as one block. Update SheetChrome to apply `is-open` to children with staggered delays:
  - `.sheet-chrome.is-open .sheet-chrome__content > :nth-child(1)` — delay 0
  - `.sheet-chrome.is-open .sheet-chrome__content > :nth-child(2)` — delay 80ms
  - `.sheet-chrome.is-open .sheet-chrome__content > :nth-child(3)` — delay 160ms
  - Each transitions opacity from 0 to 1 over 200ms with `cubic-bezier(0.2, 0, 0, 1)`.
  - This is the skill's "split and stagger" principle.
- **Subtle exits:** Sheet close already fades opacity (200ms). Per the skill, exits should be softer than enters — leave 200ms but ensure no scale or translate on exit (currently OK).
- **Icon animations (contextual):** Where an icon changes between two states (× ↔ ✓, ‹ ↔ › on calendar nav, "Searching" vs "Foreclosed" status pill dot color) — apply the skill's exact recipe: `opacity 0→1, scale 0.25→1, blur 4px→0px`. Use `cubic-bezier(0.2, 0, 0, 1)` since no `motion` library is present. (Verify by checking `package.json`.)
- **prefers-reduced-motion:** Sweep — anywhere we have a transition > 200ms, add a `@media (prefers-reduced-motion: reduce)` override to 80ms. Engine already does this in a few places — make it consistent.

**Test scenarios:**
- *Sheet enter:* Open Profile → header fades first, then tabs, then content panel. Total 360ms.
- *Sheet exit:* Close Profile → instant fade-out, no stagger (subtle exit).
- *Press feedback:* Tap any tab → quick 0.96 scale.
- *Reduced motion:* OS setting on → enters/exits collapse to 80ms; staggers compress.
- *No more `transition: all`:* grep returns zero matches.

**Verification:**
- A short screen recording of opening each sheet, showing the stagger.
- Before/after table per principle.

---

- U10. **`make-interfaces-feel-better` pass — performance**

**Goal:** Tighten transition specificity and `will-change` usage.

**Requirements:** R10, R11

**Dependencies:** U9 (transitions are already audited there; this is the residual sweep)

**Files:**
- Modify: `src/engine/student-space/style.css`

**Approach:**
- Grep for `will-change:` — remove any `will-change: all` (illegal per skill). Keep only `transform`, `opacity`, `filter` usages, and only where first-frame stutter is observed.
- Confirm no transition uses an unsupported property (e.g., `transition: width` or `height`) — those should be replaced with `transform: scale` patterns where possible.
- Confirm no `transition-duration` is set without a matching `transition-property` (defaults to `all`).

**Test scenarios:**
- *Grep audit:* `grep "transition: all\|will-change: all" src/engine/student-space/style.css` returns zero matches.

**Verification:**
- Grep audit passes.

---

- U11. **Hit-area audit (40×40 minimum)**

**Goal:** Every interactive element has at least 40×40px hit area.

**Requirements:** R5

**Dependencies:** U7–U10 (visual & motion in place first)

**Files:**
- Modify: `src/engine/student-space/style.css`

**Approach:**
- Audit every button, tab, pill, chip, day cell, nav arrow. Measure current rendered size. Where < 40×40:
  - First, try increasing padding to bring the visible element to 40×40 if visually acceptable.
  - Else, extend the hit area with a pseudo-element:
    ```css
    .calendar-day::before { content: ''; position: absolute; inset: -4px; }
    ```
  - Pseudo-element hit areas must NOT overlap adjacent elements' hit areas (skill rule).
- Likely candidates: calendar `‹/›` nav arrows, year-scrubber pills, status pill toggle, "Today" button, connector button, chip-style tags.

**Test scenarios:**
- *Coverage:* DevTools "Show Element Bounding Box" on every interactive thing — all measure ≥ 40px on the smaller dimension or have a pseudo-element bringing it there.
- *No overlap:* Calendar adjacent day cells don't have overlapping hit areas.

**Verification:**
- A spot-check list in `audit-findings.md`.

---

- U12. **Coverage gaps — empty + error + reduced-motion**

**Goal:** First-run users and degraded-network users get a polished experience too.

**Requirements:** R12 (reduced motion) plus general coverage

**Dependencies:** Late — ideally after visual/motion is settled

**Files:**
- Modify: `HistorySheet.js` (timeline tab empty state)
- Modify: `LettersSheet.js` (empty inbox state)
- Modify: `AskSheet.js`, `PhotoSheet.js`, `MoodSheet.js` (failed sync UX)
- Modify: `style.css` (reduced-motion sweep)

**Approach:**
- **Empty states:** Each sheet that can be empty on first run renders a friendly placeholder (single illustration or icon + ≤ 20 words of copy + a one-tap CTA back to the world).
- **Error states:** Capture sync failures get a banner ("Couldn't save. Tap to retry.") not a console-only error.
- **Reduced motion sweep:** Confirm every transition that fires from a user-initiated event respects the OS preference. Onboarding already does this; ensure sheet entries, hover treatments, scale-on-press, and icon-context animations also do.

**Test scenarios:**
- *Cold first-run:* New user — Letters / History / Trajectory all show empty-state placeholders that match the family.
- *Network down:* Submit AskSheet text with network disabled — error banner appears; retry works on reconnect.
- *Reduced motion on:* Walk every sheet; no transition exceeds 80ms.

**Verification:**
- Cold-state screenshots of each empty sheet.

---

- U13. **E2E final walk + screenshot family**

**Goal:** Verify nothing regressed and capture the deliverable evidence.

**Requirements:** R13

**Dependencies:** All prior units

**Files:**
- Create: `docs/audit/2026-05-20-e2e-walk-screenshots/` directory with named PNGs

**Approach:**
- Clear `localStorage`, reload, walk through the full onboarding from cold.
- Visit every surface in inventory: TopNav → Profile (every tab) → Letters → Trajectory (every status) → History (Timeline + Growth) → CaptureFab → Chooser → Ask → Photo → Mood → Calendar → DayDetail → ShareDialog.
- Capture screenshots of each. Build a side-by-side comparison sheet of all 5 full-viewport sheets.
- Confirm every PHASE 2 bug is fixed.

**Test scenarios:**
- *Cold onboarding:* No Kira pre-land flash. (Capture as a short GIF.)
- *ShareDialog:* Opens above Profile, visible.
- *Profile hero:* Island visible behind.
- *Path Finder:* No solid cards.
- *Cross-sheet family:* All 5 sheets feel like one product.

**Verification:**
- `docs/audit/2026-05-20-e2e-walk-screenshots/` populated.
- All test scenarios above pass.

---

## System-Wide Impact

- **Interaction graph:** ShareDialog now lives inside the active sheet's stacking context — when that sheet closes, ShareDialog is collected too. Verify the existing ShareDialog open path doesn't assume it survives a sheet close.
- **Error propagation:** New error banners in capture sheets need to clear on success, and not stack.
- **State lifecycle risks:** ShareDialog re-portaling on each open is the new safety property — confirm no code path opens it without re-portaling.
- **API surface parity:** None changed.
- **Integration coverage:** The Mobbin MCP integration is a new external dependency for this audit — the brief lives on disk so the audit doesn't repeatedly re-fetch.
- **Unchanged invariants:** SheetChrome contract (CLAUDE.md), OverlayController exclusivity, `body.has-overlay` class toggling, deep-link routing.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Mobbin MCP not connected at execution time | PHASE 0 in `/goal` prompt confirms tools available; if not, user restarts Claude Code first |
| Profile hero opacity reduction looks washed out at some facets | Per-facet visual check during U4; tune per-facet if needed |
| Split-and-stagger sheet entry feels slower (360ms total vs 200ms) | If user feedback is "too slow", compress to 60ms stagger (total 320ms) or accept |
| Hit area extension via pseudo-elements creates click-through-elsewhere bugs | The skill explicitly bans overlapping hit areas — keep extension to ≤ 4px on a side |
| Tabular-nums on Profile claim counts changes visual width unexpectedly | Spot-check; if too monospace, only apply where actual dynamic update happens |
| `transition: all` sweep changes hover behavior somewhere unintended | Verify each rewrite preserves the original animated property set |

---

## Documentation / Operational Notes

- The Mobbin reference brief (`docs/audit/mobbin-references-2026-05-20.md`) is committed to the repo.
- The audit findings doc (`docs/audit/audit-findings.md`) accumulates before/after tables grouped by `make-interfaces-feel-better` principle.
- The CLAUDE.md "Sheet chrome contract" doesn't need an update — this plan is content polish, not chrome changes.

---

## Sources & References

- Origin recon: in-conversation parallel agent reports (2026-05-20, on onboarding + visual + surface inventory).
- Prior plan: `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md` (chrome migration; this plan continues from its outputs).
- External skill: `make-interfaces-feel-better` at `~/.claude/skills/make-interfaces-feel-better/SKILL.md` (16 principles).
- External skill: `web-animation-design` (motion timing/easing reference).
- MCP: Mobbin (`https://api.mobbin.com/mcp`) — production-app pattern references.
- Article: https://jakub.kr/writing/details-that-make-interfaces-feel-better (the skill's source).
