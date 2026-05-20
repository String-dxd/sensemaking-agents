---
title: "refactor: Profile + Path Finder — TLDR, progressive disclosure, visual breaks"
type: refactor
status: active
date: 2026-05-20
---

# Profile + Path Finder — TLDR, progressive disclosure, visual breaks

## Overview

Students reported the Profile and Path Finder sheets read as walls of text with no visual rhythm — overwhelming on first open and easy to bounce out of. This refactor adds three patterns across both surfaces:

1. A **TLDR hero** at the top of every sheet/tab — what the student should take away in 3-5 seconds.
2. **Progressive disclosure** ("see more" / chevron-expand) on the long-form content below the TLDR — full text stays available, but the cold-open weight drops.
3. **Visual breaks** — chip rows, 2-up stat tiles, and a callout strip — so neither surface is just paragraphs stacked on paragraphs.

The work stays inside the engine substrate (per `docs/solutions/2026-05-18-island-progression-engine-substrate.md`) and uses `SheetChrome` exactly as the contract in `CLAUDE.md` requires. No new gamification — only structural and visual changes that match the introspective register the research synthesis recommends (`docs/research/2026-05-20-gender-and-adolescent-engagement-implications.md`).

---

## Problem Frame

Today (May 2026):

**Profile sheet** (`src/engine/student-space/Game/View/ProfileSheet.js`) — six tabs (Values / Interests / Personality / Skills / Relationships / Choices). Each tab opens with: eyebrow + tag + display title + paragraph summary + "Open Question" callout + last-refined meta line. Below that: COLLECTION bento (8 / 6 / 2 / 6 claim tiles) + TIMELINE quote list (every captured quote shown un-collapsed). On a typical Values tab the student lands on 200+ words and 14+ tiles before they see any quote.

**Path Finder sheet** (`src/engine/student-space/Game/View/TrajectorySheet.js`) — five Marcia-status quadrants (starter / diffused / searching / foreclosed / achieved). Each quadrant renders: eyebrow (`PATH FINDER · STATUS`) + title + lead paragraph (~30-60 words) + status pill + meta + body. The body varies by status — Searching shows 3-4 pathway cards each carrying full evidence + tradeoffs + actions, with no progressive disclosure. The lead paragraph reads first and lands as a wall.

Student feedback (per the user, confirmed in conversation): "wall of text, no visuals, overwhelming." This is not a content problem — the writing is good — but a *structural* one: hierarchy is flat, density is high, and there is no visual rhythm to let the eye rest.

This refactor reshapes the cold open without removing content.

---

## Requirements Trace

- R1. Every Profile tab opens with a TLDR hero (large headline + 3-5 trait chips) above the existing prose. Cold-open weight drops; full prose stays reachable.
- R2. Every Path Finder quadrant opens with a TLDR card (one-line summary + status chip + "show details" toggle). The full lead paragraph + evidence move behind the toggle, expanded by default only on first open.
- R3. Profile timeline collapses to the first 3 quote cards by default; "Show all N noticings" expands the rest. State persists across tab switches within a session.
- R4. Path Finder pathway cards (Searching / Achieved bodies) collapse evidence + tradeoffs by default; a per-card "See evidence" chevron reveals the long-form content.
- R5. A consistent visual-break vocabulary lands across both surfaces:
  - **Stat tile** primitive (2-up grid, big number + label) for "X noticings · Y values" / "Generated DATE · N pathways"
  - **Trait chip** vocabulary extended for TLDR hero (small uppercase chips with dot + label)
  - **Callout strip** primitive for the existing "Open Question" prompt (left-bordered, soft tint)
- R6. New primitives appear in `/dev/design` so the design-system page reflects what shipped. The IdentityStatusPill sync from prior turn stays in place.
- R7. No regressions to existing tests in `test/engine/ProfileSheet.tabs.test.ts`, `test/engine/IdentityStatusOverride.test.ts`, or `test/components/RelationshipsPageView.*`.

---

## Scope Boundaries

- No copy rewrites — paragraphs stay; only their visual treatment changes. (A copy pass can follow but isn't this plan.)
- No gamification — no streaks, no leaderboards, no point counters. Research synthesis explicitly cautions against gamifying reflective surfaces.
- No new data sources or selectors that require a roundtrip to Connector/Cartographer. TLDR chips draw from data the engine already has (top claims by quote count for Profile; status + pathway count for Path Finder).
- No changes to the React-backed Relationships / Choices tabs in this plan — those have their own structure (`src/components/RelationshipsPageView.tsx`, `src/components/ChoicesPageView.tsx`). The hero pattern can be ported in a follow-up.
- No changes to the bottom-anchored capture sheets (Ask, Photo, Mood, Chooser) — they aren't full-viewport and the contract in `CLAUDE.md` keeps them separate.
- No shadcn install — `CLAUDE.md` is explicit. New primitives go in `src/engine/student-space/style.css` and (for React surfaces) compose Base UI / Tailwind v4 tokens.

### Deferred to Follow-Up Work

- Porting the TLDR hero to the React-backed Relationships and Choices tabs: a separate plan.
- Copy editing pass on lead paragraphs once the visual structure has stabilised: a separate plan.
- A `/ce-compound` writeup capturing the TLDR + progressive-disclosure pattern as institutional learning (the learnings researcher flagged this as a gap in `docs/solutions/`).

---

## Context & Research

### Relevant Code and Patterns

- `src/engine/student-space/Game/View/ProfileSheet.js` — current panel structure (`.profile-sheet__panel` with eyebrow/tag/title/summary/open-text/meta + COLLECTION bento + TIMELINE list). Lines 220-240 hold the template; `_renderPanel(facet)` reads it.
- `src/engine/student-space/Game/View/TrajectorySheet.js` — current per-status render (`_renderForStatus(audit, capture)`), header copy from `statusHeuristics.js`, body fills `.trajectory-sheet__body`.
- `src/engine/student-space/Game/View/SheetChrome.js` — owns backdrop / blur / × / Escape / `OverlayController` registration. TLDR hero lives inside `chrome.bodySlot`, never in `chrome.contentSlot`'s header area.
- `src/engine/student-space/style.css` — existing chip + pill + bento styles. New primitives extend this file; no separate stylesheet.
- `src/routes/dev.design.tsx` — design system page. New primitives must show up here.
- `src/engine/student-space/Game/View/facets.js` — `FACET_THEMES` per-facet color tokens (re-used for TLDR chip tint).
- `src/engine/student-space/Game/Data/vipsTaxonomy.js` — `VIPS_BY_FACET` and `FACET_IDS` for the "top voiced claims" selector.
- `src/engine/student-space/Game/View/statusHeuristics.js` — status copy + nudges + actions. Source of truth for the TLDR card's headline.

### Institutional Learnings

- `docs/solutions/2026-05-18-island-progression-engine-substrate.md` — engine substrate is live; `src/components/world/*` is dormant; React-engine bridge snapshots must be cache-stable.
- `docs/plans/2026-05-18-005-feat-profile-redesign-share-plan.md` — prior atmospheric Profile redesign + pill-chip tab pattern + reduced-motion contract.
- `docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md` — chip vocabulary (force chips, pattern tags) — re-used here instead of inventing a parallel set.
- `docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md` — TrajectorySheet status pill + reactive-on-open contract. R10 (no regression to Searching quadrant) is preserved here.
- `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md` — SheetChrome contract; the source of `CLAUDE.md`'s rules.
- `docs/plans/2026-05-20-002-refactor-e2e-ux-motion-audit-plan.md` — 40×40 hit areas, scale(0.96) press, concentric radii, tabular-nums, staggered sheet-enter. New visuals conform.
- `docs/research/2026-05-20-gender-and-adolescent-engagement-implications.md` — informs **what NOT to do**: no gamification on reflective surfaces; VIPS discoveries as the achievement vocabulary; temporal comparison with self (not peers); warmth in Mirror, not in Path Finder.

### External References (via Mobbin MCP)

Patterns scanned: personality results pages, profile insight cards, career-exploration discovery flows.

- **Tolan, Dimensional** — hero card with illustration + name + 3 trait chips → analogue for Profile-tab TLDR hero.
- **Breeze** — accordion sections with chevron expand + blue-bordered quote callout → analogue for callout-strip primitive and progressive disclosure.
- **Komoot, AllTrails** — 2-up stat tiles (big number + label + small icon) → analogue for stat-tile primitive.
- **Coursera, Mimo** — career path card with illustration + 3 checkmark benefits + "Show all N courses" link → analogue for Path Finder quadrant TLDR and pathway-card progressive disclosure.
- **Pangea** — profile with "Show more" inline expand on the about paragraph → analogue for the lead-paragraph collapse on Path Finder.

The references are visual inspiration, not specification. None replace the engine's warm cream-tan palette or the Marcia status taxonomy.

---

## Key Technical Decisions

- **TLDR hero is engine-native, not React.** The Profile imperative tabs (Values/Interests/Personality/Skills) render via vanilla JS; the hero stays in `ProfileSheet.js`'s `_renderPanel(facet)` template. Keeps the implementation cheap and avoids a new React mount per tab.
- **Progressive-disclosure state lives in DOM, not engine State.** Each disclosure section toggles a `data-expanded="true|false"` attribute on its root and a corresponding CSS rule animates the height. No new state slice, no persistence across sheet opens — fresh-on-open matches the rest of the sheet behaviour. (Within a single open, state holds across tab switches via a `Map<tabId, Set<sectionId>>` on the sheet instance.)
- **TLDR chip selector is local.** "Top voiced claims" = sort `facet.claims` by quote count desc, take top 5 with at least 1 quote. No connector / cartographer roundtrip. If the facet has fewer than 3 voiced claims, the hero falls back to "Few noticings yet — capture a moment" copy without chips.
- **One CSS file.** Everything lives in `src/engine/student-space/style.css` under new `*-tldr`, `*-disclosure`, `*-stat-tile`, `*-callout` selectors. Content-only CSS scoped under `.profile-sheet__content` / `.trajectory-sheet__body` per the SheetChrome contract.
- **No new dependencies.** Base UI / Tailwind v4 already cover the React side; the engine side is plain CSS.

---

## Open Questions

### Resolved During Planning

- **Should the TLDR replace or sit above the existing eyebrow/title/paragraph?** Sit above as a new hero block; the existing prose moves into a collapsed `details` strip immediately below the hero, expanded by default on first tab open and collapsed on subsequent visits within the same sheet open. Resolution: the writing is good, we don't want to lose it; just lower its visual weight.
- **Should "see more" persist across sheet opens?** No — fresh-on-open matches existing engine behaviour and avoids new persistence. In-session memory only.
- **Are chips clickable in TLDR?** Yes — clicking a TLDR chip filters the TIMELINE below to that claim's quotes (same behaviour as bento tile click). Re-uses `_onClick` routing; no new handler.

### Deferred to Implementation

- Exact chip count threshold for the TLDR fallback (3? 5?) — pick during implementation against real Profile data.
- Animation duration for the expand/collapse — start with 220ms ease (matches existing sheet fade); tune in implementation if motion review flags it.
- Whether the Path Finder pathway-card collapse should default open for Searching status only and collapsed for Achieved (where action lists are short) — decide while implementing U5 against the live data.

---

## High-Level Technical Design

> *This illustrates the intended layout. Directional guidance for review, not implementation specification.*

```
┌─ Profile sheet, Values tab ──────────────────────────────────┐
│  [eyebrow] WHAT I CARE ABOUT · [tag] Values                  │ (existing — unchanged)
│                                                              │
│  ┌─ TLDR hero (NEW) ──────────────────────────────────┐      │
│  │  Top voices in your reflections                    │      │
│  │  [• Belonging]  [• Curiosity]  [• Service]         │      │
│  │  [• Honesty]    [• Family]                         │      │
│  │  ─── 12 noticings · last refined 2 days ago ───    │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ▶ More about this dimension                  (chevron)      │ (collapsed by default after 1st open)
│  ┌─ Hidden when collapsed ────────────────────────────┐      │
│  │  [existing display title]                          │      │
│  │  [existing paragraph]                              │      │
│  │  ┌─ Open Question callout strip ──────────────┐    │      │
│  │  │ │  What part of school energised you …     │    │      │
│  │  └──────────────────────────────────────────────┘  │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  COLLECTION  (existing bento — unchanged)                    │
│  [tile] [tile] [tile] [tile] …                               │
│                                                              │
│  TIMELINE — showing 3 of 12                                  │ (NEW count)
│  [quote card]  [quote card]  [quote card]                    │
│  [▼ Show all 9 more noticings]                               │ (NEW expand)
└──────────────────────────────────────────────────────────────┘

┌─ Path Finder, Searching quadrant ────────────────────────────┐
│  PATH FINDER · SEARCHING                                     │ (chrome — unchanged)
│  You're in active exploration                                │
│                                                              │
│  ┌─ TLDR card (NEW) ──────────────────────────────────┐      │
│  │  [• SEARCHING]                                     │      │
│  │  4 bearings the evidence points toward.            │      │
│  │  None of these is a decision yet.                  │      │
│  │  ─── Generated 5/20 · 8:11 PM ───                  │      │
│  │  [Run sense-making]                                │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ▶ Why this status                            (chevron)      │ (full lead paragraph hides here)
│                                                              │
│  Pathway 1: Public service                                   │
│  ┌────────────────────────────────────────────────────┐      │
│  │ [• ENERGISES]  Slow people-facing care work …      │      │
│  │ ▶ See evidence                                     │      │ (collapsed by default)
│  └────────────────────────────────────────────────────┘      │
│  Pathway 2: Education                                        │
│  …                                                           │
└──────────────────────────────────────────────────────────────┘
```

The TLDR hero, the collapsed-prose pattern, the stat tile, and the callout strip are the four new primitives. Everything else is composition.

---

## Implementation Units

- U1. **Visual primitives (CSS + design-system page)**

**Goal:** Land the four new CSS primitives that both sheets compose: TLDR hero card, disclosure section (chevron expand/collapse), 2-up stat tile, callout strip. Wire them into `/dev/design` so the design system reflects what ships.

**Requirements:** R5, R6

**Dependencies:** None.

**Files:**
- Modify: `src/engine/student-space/style.css` (append four primitive blocks near the bottom; class names: `.tldr-hero`, `.tldr-hero__chips`, `.disclosure`, `.disclosure__chevron`, `.stat-tile`, `.stat-tile-row`, `.callout-strip`)
- Modify: `src/routes/dev.design.tsx` (add four `<ComponentBlock>` entries under the existing Cards and Pills sections; keep file paths citing `style.css`)
- Test: `test/engine/visual-primitives.test.ts` — new file, snapshots structural HTML emitted by a tiny helper that builds each primitive

**Approach:**
- Each primitive is plain CSS — no JS dependency, no JSX wrapper required on the engine side.
- TLDR hero: `display: grid; gap: 14px;` cream-tan surface, soft border, optional headline + chip row + meta footer.
- Disclosure: `<button>` toggle that flips `data-expanded` on its parent; CSS uses `[data-expanded="false"] .disclosure__panel { display: none; }` (or a `grid-template-rows: 0fr → 1fr` animation if motion review allows). Plain CSS rotates the chevron 90°.
- Stat tile / stat-tile-row: a 2-up grid; each tile has big tabular-numeric number + label + small icon slot.
- Callout strip: 4px left border in facet accent, soft tint background, italic prompt copy.
- Use existing tokens — `--font-sans`, the cream-warm color stack, concentric radii 12/14/18, scale(0.96) active feedback.

**Patterns to follow:**
- `.trajectory-sheet__status-pill` (chip vocabulary, recently synced to design system)
- `.profile-sheet__panel` cream-surface card
- `.history-sheet__day` disclosure-like rows

**Test scenarios:**
- Happy path: each primitive rendered with sample data produces the expected DOM structure (no missing classes, correct ARIA attributes on `<button>` toggle).
- Edge case: disclosure with no children renders nothing instead of an empty panel.
- Edge case: stat-tile-row with 1 tile renders centered (no broken grid).
- Integration: design system page renders each new primitive without console errors.

**Verification:**
- `/dev/design#pills` and `/dev/design#cards` show the four new primitives with file path citations.
- Visual: opening `/dev/design` and scrolling matches the existing layout density (no overflowing cards, no broken padding).

---

- U2. **Profile sheet — TLDR hero per tab**

**Goal:** Add a TLDR hero block to the top of the Profile panel for each VIPS tab (Values / Interests / Personality / Skills). The hero shows the headline `Top voices in your <facet>`, 3-5 trait chips (top claims by quote count), and a meta line (`N noticings · last refined …`). Clicking a chip filters the TIMELINE just like a bento tile click.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js` — extend the panel template, add `_renderTldrHero(facet, claims, quoteCounts)`, route chip click through existing `_onTimelineFilterChip`
- Modify: `src/engine/student-space/style.css` — per-sheet content CSS scoping `.tldr-hero` inside `.profile-sheet__content`, plus facet-tinted variants via `data-facet` attribute
- Test: `test/engine/ProfileSheet.tldr.test.ts` — new file

**Approach:**
- Insert hero element right after `</header>` and before `.profile-sheet__vips-body` in the existing template.
- "Top claims" = filter `VIPS_BY_FACET[facetId]` to ones with at least one quote, sort desc by quote count, take 5.
- If < 3 claims have any quotes, hero shows the empty-state copy: `Few noticings yet — capture a moment on the island to see what shows up.` No chips.
- Chip click dispatches the same filter event as bento tile click; visual state syncs.
- `last refined` reads from existing `facet.refinedAt` (formatted via `formatRefined` already in the file).

**Patterns to follow:**
- Existing `_renderPanel(facet)` in `ProfileSheet.js`
- `_onClick(event)` event delegation
- `_onTimelineFilterChip(claimId)` for filter wiring

**Test scenarios:**
- Happy path: tab with ≥3 voiced claims renders hero with N=5 chips ordered by quote count desc.
- Edge case: tab with 1 voiced claim renders empty-state copy (no chips).
- Edge case: tab with 0 quotes renders empty-state copy.
- Happy path: clicking a chip filters the TIMELINE to that claim's quotes (assert filter chip text + quote count).
- Happy path: clicking the same chip again clears the filter (toggle).
- Integration: switching tabs re-renders the hero with the new facet's chips (no stale data).

**Verification:**
- Opening Profile on a populated state shows the hero block with chips on every VIPS tab.
- Existing `test/engine/ProfileSheet.tabs.test.ts` still passes.

---

- U3. **Profile sheet — collapse existing prose into disclosure**

**Goal:** Move the existing display title + paragraph + Open Question callout into a disclosure block titled `More about this dimension`. Default state: collapsed (after first viewing of that tab in this sheet open). All existing prose is preserved.

**Requirements:** R1, R3 (timeline disclosure ships in U4 but uses the same primitive)

**Dependencies:** U1, U2

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js` — wrap existing prose in disclosure markup; track per-tab open state in a `Map<tabId, boolean>` on the instance
- Modify: `src/engine/student-space/style.css` — scope `.disclosure` styles for `.profile-sheet__content`
- Test: `test/engine/ProfileSheet.tldr.test.ts` (extend U2's file)

**Approach:**
- On first render of each VIPS tab in a given sheet open, the disclosure is expanded (so the student sees the full prose at least once).
- On second render of the same tab in the same sheet open, the disclosure is collapsed (the student can re-expand via chevron).
- A `Map<facetId, boolean>` keeps that per-open memory; reset on `dispose()`.
- Re-route the existing Open Question into the `.callout-strip` primitive — same copy, new wrapper.

**Patterns to follow:**
- `_renderPanel(facet)` existing flow
- `.disclosure` primitive from U1

**Test scenarios:**
- Happy path: first render of a tab → disclosure expanded, full prose visible.
- Happy path: second render of the same tab → disclosure collapsed, only headline + chevron visible.
- Happy path: clicking the chevron toggles the disclosure (assert `data-expanded` attribute flip).
- Edge case: tab with empty `facet.paragraph` renders no disclosure (hidden entirely).

**Verification:**
- Tab open shows hero + prose by default; switching to a second tab and back shows hero + collapsed prose.
- Existing prose content is byte-identical to before (no copy changes).

---

- U4. **Profile sheet — TIMELINE progressive disclosure + count chip**

**Goal:** Show the first 3 quote cards in the TIMELINE by default; render `[▼ Show all N more noticings]` button below if there are more. Update the TIMELINE eyebrow to show `TIMELINE · showing 3 of N`.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js` — extend `_renderQuoteList` to slice + render a count chip + "show all" button
- Modify: `src/engine/student-space/style.css` — `.timeline-expand-btn` styles (rounded-rect 12px, cream surface, matches secondary CTA)
- Test: `test/engine/ProfileSheet.tldr.test.ts` (extend)

**Approach:**
- Track expanded-state per-tab in the same instance Map used by U3.
- When collapsed, render only the first 3 quote items; append the expand button.
- When expanded, render all quote items; append `[▲ Show fewer]` button.
- When the active filter is applied (chip selected) AND the filtered set is ≤ 3, hide the button entirely.

**Patterns to follow:**
- Existing `_renderQuoteList(quotes)` in `ProfileSheet.js`
- `.trajectory-sheet__run` for the secondary CTA shape (cream squircle)

**Test scenarios:**
- Happy path: 8-quote tab collapsed renders 3 cards + "Show all 5 more noticings" button.
- Happy path: clicking expand renders all 8 cards + "Show fewer" button.
- Edge case: 2-quote tab renders both with no button.
- Edge case: filter active with 1 result hides the button.
- Edge case: forget-quote on a hidden quote (state mutation while collapsed) does not crash; re-render computes the new count correctly.

**Verification:**
- Existing forget-quote tests still pass.
- Existing bento-filter tests still pass.

---

- U5. **Path Finder — TLDR card per quadrant**

**Goal:** Each Path Finder quadrant (Searching / Diffused / Foreclosed / Achieved; Starter keeps its existing card shape) renders a TLDR card immediately under the chrome header: status chip + one-line summary + meta line + primary CTA (`Run sense-making` for Searching/Achieved; `Show me all paths` for others). The current lead paragraph from `statusHeuristics.js` collapses into a `Why this status` disclosure beneath the TLDR.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/View/TrajectorySheet.js` — extend `_renderForStatus(audit, capture)` to emit the new TLDR + disclosure markup
- Modify: `src/engine/student-space/Game/View/statusHeuristics.js` — add a `tldr` field next to existing `eyebrow` / `title` / `lead` so the one-line summary is taxonomy-driven, not hard-coded in the renderer
- Modify: `src/engine/student-space/style.css` — `.trajectory-sheet__tldr` scoping
- Test: `test/engine/statusHeuristics.test.ts` (extend with TLDR copy assertions)
- Test: `test/engine/IdentityStatusOverride.test.ts` (assert TLDR re-renders when override changes)

**Approach:**
- Status-pill (the one synced to design system in the prior turn) sits inside the TLDR card as the eyebrow.
- TLDR copy is one short sentence per status (Searching: "4 bearings the evidence points toward — none committed yet."; Foreclosed: "A direction is named in Choices — here are bearings to test it against."; etc).
- Meta line: `Generated DATE · N pathways` (Searching/Foreclosed/Achieved) or `N nudges to start` (Diffused).
- "Why this status" disclosure wraps the existing `lead` paragraph + the longer evidence prose verbatim. Default state: expanded on first open of the sheet, collapsed on subsequent re-renders within the same open (mirrors Profile U3 pattern).

**Patterns to follow:**
- `_renderForStatus(audit, capture)` existing flow
- `STATUS_HEADER_COPY` shape in `statusHeuristics.js`
- The recently-synced `.trajectory-sheet__status-pill`

**Test scenarios:**
- Happy path: each of the 5 statuses returns a `tldr` string from `statusHeuristics.js` (assert all 5 keys present and non-empty).
- Happy path: TLDR card renders for Searching with status pill, one-line summary, meta, and "Run sense-making" CTA.
- Edge case: status override flips Searching → Achieved → TLDR re-renders with new copy + chip color.
- Integration: existing R10 (Searching quadrant no-regression from `2026-05-19-003`) still holds — pathway cards still render below the TLDR.

**Verification:**
- Opening Path Finder at each of the 5 statuses shows a TLDR card. The status pill stays sized as the design system reference.
- Existing `statusHeuristics.test.ts` and `IdentityStatusOverride.test.ts` pass.

---

- U6. **Path Finder — pathway card progressive disclosure**

**Goal:** Each pathway card (Searching status's bearings list, Achieved status's action-bearing combos) renders the pathway label + 1-line description + primary chip by default. Evidence + tradeoffs + actions collapse under `See evidence` chevron. Default: collapsed.

**Requirements:** R4

**Dependencies:** U1, U5

**Files:**
- Modify: `src/engine/student-space/Game/View/TrajectorySheet.js` — extend `_renderBearingCard(bearing)` (or equivalent helper) to wrap the long content in disclosure markup
- Modify: `src/engine/student-space/style.css` — pathway-card disclosure variant
- Test: `test/engine/TrajectorySheet.pathway-disclosure.test.ts` — new file

**Approach:**
- Re-use the `.disclosure` primitive from U1.
- For Achieved status: keep action-list visible by default (it's short, ≤3 items); collapse only `evidence` text and `tradeoffs` text under the chevron.
- For Searching status: collapse the full evidence + tradeoffs paragraph; the pathway label + 1-line description + chip (`ENERGISES` / `WORTH PROBING` etc) stay visible.
- Each card carries its own disclosure state; toggling one doesn't affect others.

**Patterns to follow:**
- Existing pathway-card renderer in `TrajectorySheet.js`
- `.disclosure` primitive from U1

**Test scenarios:**
- Happy path: Searching status with 4 pathways renders 4 cards, all evidence-collapsed by default.
- Happy path: clicking one card's chevron expands it; other cards stay collapsed.
- Happy path: Achieved status keeps action-list visible, hides evidence under chevron.
- Edge case: pathway with no evidence text renders no disclosure (hides chevron entirely).
- Integration: status override flips quadrant → pathway cards re-render with fresh disclosure state (all collapsed again).

**Verification:**
- Cold open of Searching quadrant: pathway cards read as a glanceable list, not 4 dense paragraphs.

---

- U7. **Cross-surface visual stat strip + meta polish**

**Goal:** Replace flat meta lines (`Generated 5/19/2026, 8:11 PM · 4 pathways` on Path Finder; `12 noticings · last refined …` on Profile) with the stat-tile-row primitive from U1. Two tiles each: count + label. Tabular-nums per the motion-audit plan.

**Requirements:** R5

**Dependencies:** U1, U2, U5

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js` — replace `.profile-sheet__meta` text with stat-tile-row
- Modify: `src/engine/student-space/Game/View/TrajectorySheet.js` — replace the meta line in the TLDR card with stat-tile-row
- Modify: `src/engine/student-space/style.css` — stat-tile scoping inside each sheet content

**Approach:**
- Two tiles per surface:
  - Profile: `[N noticings]` + `[K voiced claims]`
  - Path Finder: `[N pathways]` + `[Last generated · 2h ago]` (relative time formatted via existing helper)
- The plain meta line stays as fallback for screen readers (`<span class="sr-only">…`).

**Patterns to follow:**
- `.stat-tile` primitive from U1
- Existing `formatRefined` / `_currentAudit` helpers

**Test scenarios:**
- Happy path: Profile renders 2 stat tiles with non-zero counts on a populated state.
- Happy path: Path Finder renders 2 stat tiles in the TLDR card.
- Edge case: empty Profile (0 quotes) renders the stat strip with `0 noticings` + `0 voiced claims` rather than hiding (the zero state IS the message).
- Accessibility: screen-reader-only fallback meta line is present and includes both counts.

**Verification:**
- Visual: both surfaces have rhythm; the eye finds the count tile, then the chips, then the prose.

---

## System-Wide Impact

- **Interaction graph:** Click delegation through `_onClick` in both `ProfileSheet.js` and `TrajectorySheet.js` extends to handle disclosure chevrons and TLDR chip clicks. No new event bus or global handler.
- **Error propagation:** If `_renderTldrHero` throws (e.g. missing facet data), the panel still renders the existing body — surrounded by a `try/catch` that logs once and skips the hero rather than blocking the whole sheet.
- **State lifecycle risks:** In-session disclosure memory is held on the sheet instance and reset by `dispose()`. No persistence; nothing to migrate.
- **API surface parity:** No exported API surface changes. `statusHeuristics.js` gains a `tldr` field per status — additive, not breaking.
- **Integration coverage:** Status override (`IdentityStatusOverride.subscribe`) must re-render TLDR + pathway disclosure. Existing override tests extend to cover this.
- **Unchanged invariants:** SheetChrome contract holds (no hand-rolled backdrop/blur). The IdentityStatusPill design-system sync from prior turn stays in place; the status pill renders inside the new TLDR card with the same CSS.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| TLDR hero pushes important content below the fold on small viewports | Sizing per Motion-Audit plan: cap hero at ~140px; test at 375×667 (iPhone SE) before merge |
| Disclosure collapse hides content from students who don't notice the chevron | Default to expanded on first tab open; chevron is sized to motion-audit hit area (40×40); the chevron arrow tilts on hover; "More about this dimension" headline is descriptive, not generic "see more" |
| Status override flow regresses (no re-render on override) | U5 carries an explicit integration test that flips override and asserts TLDR copy changes |
| New CSS primitives drift from design system over time | U1 registers each primitive in `/dev/design`; the IdentityStatusPill drift incident proves the design page catches this when it's used as the reference |
| Performance: disclosure animation janks on Profile tabs with 50+ quotes | Use `grid-template-rows: 0fr → 1fr` (cheap) or fall back to `display: none` if animation is flagged. Test on the largest seed state |

---

## Documentation / Operational Notes

- After merge, run `/ce-compound` to capture the TLDR + progressive-disclosure pattern as a `docs/solutions/` learning — `ce-learnings-researcher` flagged this as a gap.
- The 4 new primitives (TLDR hero, disclosure, stat tile, callout strip) become canonical engine primitives going forward — future sheets reuse them.
- No runbook or monitoring changes.

---

## Sources & References

- Recent research synthesis: `docs/research/2026-05-20-gender-and-adolescent-engagement-synthesis.md`
- Design implications: `docs/research/2026-05-20-gender-and-adolescent-engagement-implications.md`
- Engine substrate learning: `docs/solutions/2026-05-18-island-progression-engine-substrate.md`
- Prior plans (must respect, not regress): `docs/plans/2026-05-18-005-feat-profile-redesign-share-plan.md`, `docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md`, `docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md`, `docs/plans/2026-05-20-001-refactor-sheet-primitive-consistency-plan.md`, `docs/plans/2026-05-20-002-refactor-e2e-ux-motion-audit-plan.md`
- SheetChrome contract: `CLAUDE.md` and `src/engine/student-space/Game/View/SheetChrome.js`
- Mobbin references: Tolan, Breeze, Dimensional, Komoot, AllTrails, Coursera, Mimo, Pangea (scanned 2026-05-20)
