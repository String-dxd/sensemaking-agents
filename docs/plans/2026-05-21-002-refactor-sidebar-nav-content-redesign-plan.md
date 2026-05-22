# Refactor — Sidebar-as-nav, content-in-page (Identity + History)

## Goal

Repurpose the two-pane sheets so the left pane is **navigation only** and the right pane is the **content surface**. Two sheets are in scope:

1. **Profile (My Identity)** — left pane holds identity + vertical facet nav; right pane holds the per-dimension prose, COLLECTION bento, and TIMELINE.
2. **History → Calendar / Day Detail** — left pane keeps History title + Timeline/Growth tab nav; right pane embeds the day-detail content inline below the calendar grid instead of as a right-slide overlay (DayDetailCard).

## Why

User feedback after the Gather-style split landed: the left pane currently mixes navigation *and* dimension prose; the right pane has the tabs at top. That fights the two-column metaphor — columns should clearly separate "where to go" from "what's there." The Day-Detail overlay also feels like an old-school side panel grafted onto an already-split sheet.

## Profile (My Identity) changes

### Layout

- **Left pane** (introSlot)
  - `<header class="profile-id">` — avatar, name, class, Share, auth (unchanged).
  - `<nav class="profile-sheet__sidenav" role="tablist">` — vertical list of six tab buttons (Values / Interests / Personality / Skills / Relationships / Choices). Currently rendered as a horizontal tab strip in the right pane; move into the sidebar.
  - Drop the `.profile-sheet__intro-panel` block (the "What matters to me / More about this dimension / Most common / Quietly emerging" disclosure currently in the intro).

- **Right pane** (bodySlot)
  - Page header: per-dimension `eyebrow` + `title` + `subtitle` rendered as the main content header (visually similar to the existing `.profile-sheet__header` but in the right pane).
  - Move the dimension prose here: Most common / Quietly emerging rows, the summary paragraph, the Open-question callout, and the "last refined" meta line.
  - Below: existing TLDR slot, COLLECTION bento, TIMELINE list (unchanged).

### Behaviour

- The horizontal-tab DOM (`.profile-sheet__tabs`) is removed; the sidenav (vertical) takes its place. Click handling on `.profile-tab[data-facet]` continues to work — same `_switchTab(facet)` flow.
- The "More about this dimension" disclosure goes away. The dimension prose appears unconditionally in the right pane (which is what students wanted to see, per current usage).
- Facet-themed CSS vars (`--facet-accent`, `--facet-soft`, `--facet-ink`) still apply to the chrome root, so the sidebar active-state and the right-pane callout/timeline accents continue to shift on tab switch.

## History → Calendar / Day-Detail changes

### Layout

- **Left pane** stays as is: History title + subtitle + Timeline/Growth tab buttons.

- **Right pane**
  - Timeline tab: month grid (existing embedded Calendar) at top + an inline **day-detail panel** below it. The day-detail panel is empty (placeholder text "Pick a day to see what was captured") until a day is clicked.
  - Growth tab: unchanged.

### Behaviour

- `DayDetailCard` no longer opens as a right-slide overlay. Instead, when a calendar day is clicked:
  - The day-detail content renders inline into a slot inside the History right pane (Timeline tab).
  - No portal, no separate stacking context, no `OverlayController.register('dayDetail')`.
- The slide-in animation is replaced by a quick 200ms cross-fade on the slot's content.
- `CalendarSheet` standalone (when opened directly via `?sheet=calendar`) keeps its current behaviour for backward compatibility, but the day-detail content also renders inline there (no overlay).
- Outcome: DayDetailCard becomes a **pure content renderer** with no chrome / lifecycle of its own — it just exposes a `renderInto(slotEl, date)` method and listens for click delegation routed by the parent sheet.

## Files touched

- `src/engine/student-space/Game/View/ProfileSheet.js` — restructure introSlot / bodySlot templates; move dimension content render targets; keep `_switchTab` & event flow.
- `src/engine/student-space/Game/View/HistorySheet.js` — add inline day-detail slot inside the Timeline pane; remove DayDetailCard overlay-open path.
- `src/engine/student-space/Game/View/CalendarSheet.js` — when standalone, render day-detail inline inside its own chrome (new slot inside `contentSlot`).
- `src/engine/student-space/Game/View/DayDetailCard.js` — strip the slide-in chrome; expose `renderInto(slotEl, date)`; keep all the existing data-rendering logic (mood pins, captures with review/retry, events) so behaviour is preserved.
- `src/engine/student-space/Game/View/OverlayController.js` — drop the `'dayDetail'` registration call site (lives in CalendarSheet ctor today).
- `src/engine/student-space/Game/View/View.js` — no API change (CalendarSheet still owns DayDetailCard instance for lifetime).
- `src/engine/student-space/style.css`
  - Profile: vertical sidenav style (`.profile-sheet__sidenav` + `.profile-sheet__sidenav-item`); right-pane header treatment; move intro-panel-only typography rules.
  - History: day-detail inline slot styles; remove fixed-position DayDetailCard rules.
  - DayDetail: simplify (no fixed/absolute positioning, no transform-in animation).

## Non-goals

- No changes to React-backed tabs (Relationships / Choices). They keep rendering through the existing `profile-tab-react-bridge.tsx` mount.
- No data-model changes. All slices read from `State` exactly as today.
- No bottom-capture-sheet changes. Ask / Photo / Mood / Chooser keep their own chrome.

## Validation

1. **agent-browser** — open the running app, click Profile chip → assert sidenav buttons present, click each tab and verify the right pane shows the dimension prose + bento + timeline. Click History → Timeline tab, click a few days and verify the inline day-detail panel updates without an overlay appearing.
2. **Senior designer subagents** — pass before/after screenshots to two parallel reviewer agents (design fidelity + UX flow) and collect punch lists.
3. **ce-work iteration 2** — apply punch-list fixes.
4. **ce-code-review** — final pass before commit.
