---
plan_type: refactor
status: active
created: 2026-05-23
depth: standard
origin: solo (no upstream brainstorm)
rubric: ~/.claude/skills/make-interfaces-feel-better/SKILL.md
target_repo: sensemaking-agents
---

# refactor: Apply `make-interfaces-feel-better` to History, Profile, and Path Finder

## Summary

A polish pass that lifts the perceived quality of three sheets — **History** (`/history`, `/history/$tab`), **Profile** (`/profile`, `/profile/$tab` — including the Relationships and Choices sub-tabs), and **Path Finder** (`/trajectory`) — by applying the 16 principles of the `make-interfaces-feel-better` skill (concentric border radius, optical alignment, layered shadows, interruptible/staggered animations, tabular numerals, text-wrap balance/pretty, image outlines, scale-on-press, 40×40 hit areas, font smoothing, specific transitions, judicious `will-change`).

The work is **token-first**: changes to `src/styles.css` (`@theme` block) and the shared chrome (Sheet primitive, Button, Drawer) cascade across every surface so the per-page audits become local refinements. Path Finder is already the most polished of the three (text-balance / text-pretty / tabular-nums / press-scale / ease-sheet keyframes are widely applied), so its unit is small. Profile is the largest because its two non-VIPS tabs (Choices, Relationships) are big files with systematic gaps. History sits in the middle.

No motion library is introduced (no `motion` / `framer-motion` in `package.json`) — animations use CSS keyframes with the existing `--ease-sheet` token (`cubic-bezier(0.22, 1, 0.36, 1)`).

---

## Problem Frame

The three sheets work, look reasonable, and were recently overhauled (Profile + History in PR #53; Path Finder pre-dates and has been iteratively polished). The remaining gaps are not bugs — they are the compound effects that separate a polished interface from a merely functional one: avatars and thumbnails without subtle outlines, headings that wrap awkwardly without `text-balance`, counters that shift on update without `tabular-nums`, modals that snap on without enter staging, buttons under the 40×40 hit-area minimum, and stylistic shadow stacks duplicated literally across files instead of routed through tokens.

The goal is not to redesign these sheets. It is to apply a checklist-driven polish pass against the skill rubric and route the cascading wins through shared tokens / chrome so future surfaces inherit them.

---

## Scope Boundaries

### In scope
- `src/styles.css` `@theme` — new tokens (shadows, press-scale, image outline) and global text-wrap defaults
- Shared chrome the three sheets ride on:
  - `src/components/ui/sheet.tsx` (`PageCloseButton`, `SheetNavButton`, `SheetTitle`, `SheetDescription`)
  - `src/components/ui/button.tsx` (already polished — JSDoc note on hit-area for `sm` size)
  - `src/components/ui/drawer.tsx` (close-button hit area, transition specificity)
- `src/components/student-space/sheets/HistorySheet.tsx` + supporting panes `CalendarPane.tsx`, `DayDetailCard.tsx`
- `src/components/student-space/sheets/ProfileSheet.tsx` (VIPS tabs + ShareDialog + IdentityCard)
- `src/components/student-space/sheets/TrajectorySheet.tsx` (light triage — already polished)
- `src/components/ChoicesPageView.tsx` (Profile → Choices tab)
- `src/components/RelationshipsPageView.tsx` (Profile → Relationships tab)

### Out of scope (other key pages — per user scope narrowing)
- `/` world canvas, HUD, CaptureFab, AskSheet, WorldInteractions, IslandProgressionOverlay
- `/onboarding` (EdupassLogin, EggHatcher, FirstChat, FirstMood) — recently polished in PR #50, #52
- `/letters`, `/settings` — not requested
- SideRail — already uses correct `active:scale-[0.96]` with specific transitions and is on the rail not inside these three sheets
- All engine substrate CSS (`src/engine/student-space/style.css`) — off-limits per CLAUDE.md
- The Three.js scene inside `GrowthIslandPreview` — engine territory; the wrapper card frame is in scope but the canvas content is not

### Deferred to Follow-Up Work
- Animation library evaluation — if future polish needs orchestrated stagger across many elements, evaluate `motion` then; for now, CSS suffices.
- Extending the press-scale / image-outline / shadow tokens to the out-of-scope surfaces (Onboarding, Letters, Settings, world HUDs) — straightforward port once these three are landed and the tokens prove themselves.
- Auditing the Drawer used by AskSheet / MoodSheet for full polish — the drawer-close hit area gets fixed in U2, but a deeper audit belongs in the world-canvas polish pass.

---

## Key Technical Decisions

1. **Token-first cascade over per-surface duplication.** New `--shadow-sheet-popover`, `--shadow-sheet-dialog`, `--shadow-sheet-tile`, and `--shadow-active-rail` tokens replace hand-coded `shadow-[0_18px_48px_rgba(43,38,32,0.14)]`-style values that currently repeat across files. Same for `--press-scale: 0.96` (token; existing literal `active:scale-[0.96]` Tailwind classes keep working — the token serves new code and documentation, not a sweeping rename).

2. **Global `text-wrap` defaults via `:where()`.** Use `:where(h1, h2, h3, h4)` to set `text-wrap: balance` and `:where(p, li)` for `text-wrap: pretty` at zero specificity, so per-element overrides still win. This applies to the whole app, not just the three pages — it's a safe global polish.

3. **No global `tabular-nums` rule.** Per the skill, tabular numerals are for *dynamically updating* numbers. The three sheets already apply `tabular-nums` per-instance to counters, dates, scores. Adding a global rule would change visual character of prose containing numbers (e.g. paragraph "5 things"). Keep selective.

4. **No motion library.** Skill principle #7 prescribes a CSS cross-fade fallback when no `motion`/`framer-motion` is installed. Animations use `@keyframes` + `--ease-sheet` (already `cubic-bezier(0.22, 1, 0.36, 1)`).

5. **Generalize the existing `trajectoryMenuIn` keyframe to `sheet-popover-in`.** It already does what we want (opacity + small translateY + scale). Rename and reuse across all popovers; update TrajectorySheet's two callsites in the same unit that lands the rename.

6. **Hit-area fixes use the actual element size, not pseudo-elements, where possible.** Bumping `min-h-8` → `min-h-10` is simpler than adding a `before:absolute before:-inset-1` pseudo extender; the latter risks overlap with adjacent controls in dense layouts (Profile timeline rows have small buttons close together). Reserve pseudo-elements for cases where the visual size is intentionally tight (e.g., the Profile toggle switch).

7. **Image outlines use `outline` not `border`.** Per skill principle #11, the spec is `1px solid rgba(0,0,0,0.10)` in light mode. Using `outline-offset: -1px` keeps the visual inside the image bounds, so it doesn't add layout. The app is locked to light mode via `:root { color-scheme: light }` in `src/styles.css:91`, so single-tone outline is sufficient.

---

## High-Level Technical Design

The cascade flows from tokens / chrome → three sheets:

```
src/styles.css (@theme + global text-wrap)
        │
        ├── --shadow-sheet-popover ─────┐
        ├── --shadow-sheet-dialog       │
        ├── --shadow-sheet-tile         │
        ├── --press-scale: 0.96         │ used by
        ├── .image-outline utility      ├──► HistorySheet, ProfileSheet,
        ├── @keyframes sheet-popover-in │     TrajectorySheet, Choices/
        └── :where(h1-h4): balance      │     Relationships sub-views
                                        │
src/components/ui/sheet.tsx (shared) ───┤
src/components/ui/button.tsx (shared) ──┤
src/components/ui/drawer.tsx (shared) ──┘
```

*This is directional guidance — file paths and token names may be refined during implementation.*

---

## Implementation Units

### U1. Global `@theme` tokens, text-wrap defaults, shared keyframe

**Goal:** Land the cascade — new shadow/press tokens, image-outline utility, `text-wrap` defaults, generalized popover-enter keyframe — so subsequent per-surface units become local class additions instead of bespoke Tailwind arbitrary values.

**Requirements:** Skill principles #3 (shadows over borders), #5 (split/stagger enter), #9 (tabular numerals — selective only), #10 (text wrapping), #11 (image outlines), #12 (scale on press).

**Dependencies:** None — this is the foundation.

**Files:**
- `src/styles.css` — add tokens, utility, keyframe, text-wrap defaults

**Approach:**
- Add to `@theme` block:
  - `--shadow-sheet-popover: 0 18px 48px rgba(43, 38, 32, 0.14);`
  - `--shadow-sheet-dialog: 0 24px 80px rgba(43, 38, 32, 0.22);`
  - `--shadow-sheet-tile: 0 8px 20px rgba(43, 38, 32, 0.08);`
  - `--shadow-active-rail: 0 8px 24px rgba(0, 0, 0, 0.12);` (for SideRail active state if extended later)
  - `--press-scale: 0.96;` (token; existing `scale-[0.96]` literals continue to work)
- Add a `.image-outline` utility class (outside `@theme`):
  ```css
  .image-outline {
    outline: 1px solid rgba(0, 0, 0, 0.10);
    outline-offset: -1px;
  }
  ```
- Add global text-wrap defaults at zero specificity:
  ```css
  :where(h1, h2, h3, h4) { text-wrap: balance; }
  :where(p, li) { text-wrap: pretty; }
  ```
- Rename `@keyframes trajectoryMenuIn` → `@keyframes sheet-popover-in` (and update the two TrajectorySheet callsites at `src/components/student-space/sheets/TrajectorySheet.tsx:410` and `:529` in U5). Keep semantics identical (opacity 0→1, translateY -4px→0, scale 0.97→1).

**Patterns to follow:**
- `--ease-sheet` and `--duration-sheet` tokens already in `src/styles.css:33-34` — follow the same naming + commenting style for the new shadow tokens (kebab-case, semantic name, brief comment block above the group).

**Test scenarios:**
- *Test expectation: none — pure CSS / token additions; no behavior change.* Verification: `pnpm check` passes (Biome lints CSS too via the existing config); existing visual tests for `src/components/ui/sheet.tsx` and `src/components/student-space/sheets/TrajectorySheet.tsx` continue to pass (they assert structure / data-testid, not class lists).

**Verification:** Running `pnpm dev` and navigating to `/`, `/history`, `/profile`, `/trajectory` shows no visual regression — headings now wrap with balance where multi-line, and the renamed `sheet-popover-in` keyframe still drives the menu enter on Path Finder.

---

### U2. Sheet primitive + Button + Drawer chrome polish

**Goal:** Apply the polish rubric to the three primitives that the three target sheets compose. Hit-area minimum on `PageCloseButton` and `Drawer` close, transition specificity on `Drawer`, press-scale on `SheetNavButton`, image-outline awareness in primitive docs.

**Requirements:** Skill principles #12 (scale on press), #14 (never `transition: all` — use specific properties), #16 (40×40 hit area).

**Dependencies:** U1 (uses the `.image-outline` utility name in JSDoc comments).

**Files:**
- `src/components/ui/sheet.tsx` — `PageCloseButton`, `SheetNavButton`, `SheetTitle`
- `src/components/ui/button.tsx` — JSDoc note on `sm` variant hit area
- `src/components/ui/drawer.tsx` — close-button size + transition specificity
- `test/components/ui/sheet.test.tsx` — verify existing tests still pass (no test additions needed; this unit is pure polish)

**Approach:**
- `PageCloseButton` (`src/components/ui/sheet.tsx:66-81`): bump `size-9` → `size-10`; add `active:scale-[0.96]`; change `transition-colors` → `transition-[background-color,color,transform]` to cover the new scale.
- `SheetNavButton` (`src/components/ui/sheet.tsx:190-211`): add `active:scale-[0.97]` (gentler than 0.96 for dense nav rows so adjacent items don't visually compress); add `transition-[background-color,color,transform]` (replacing the current `transition-colors`).
- `Button` (`src/components/ui/button.tsx`): add a JSDoc comment above the `sm` size variant noting that `h-8` (32px) is below the 40×40 hit-area minimum and should only be used when the consumer extends the hit area via a wrapper or pseudo-element. No code change to defaults — the variant is intentionally compact.
- `Drawer` (`src/components/ui/drawer.tsx`): the close button at line ~84 — bump `size-8` → `size-10`; the panel transition at line ~57 changes `transition-transform transition-opacity` → `transition-[transform,opacity]` (single property list per principle #14).

**Patterns to follow:**
- Existing `Button` already has `active:scale-[0.96]` in its CVA base classes (`src/components/ui/button.tsx:7`) — mirror that pattern.
- `cn(...)` from `~/lib/utils` is the project's standard class composer — keep using it.

**Test scenarios:**
- *Existing test scenarios in `test/components/ui/sheet.test.tsx` cover composition / data-testid presence and continue to apply.* This unit adds no new behavior; the test expectation is **none** — pure visual polish.
- **Hit-area regression check** (manual): in `pnpm dev`, confirm the page-close button (visible on `/letters` and `/settings` if used) doesn't visually overlap adjacent SheetSidenav items. The 40px close button at top-right of `PageSurface` has fixed positioning so there's no risk of overlap, but verify.
- **Drawer transition smoke** (manual): open AskSheet / MoodSheet on `/`, confirm enter / exit slide + fade still feels right (the transition list change is semantically equivalent).

**Verification:** `pnpm check` passes; existing `test/components/ui/sheet.test.tsx`, `test/components/ui/drawer.test.tsx` (if present), and `test/components/student-space/capture/capture-stack.test.tsx` continue to pass.

---

### U3. HistorySheet + CalendarPane + DayDetailCard audit

**Goal:** Apply the full rubric to the Timeline tab (`/history`) and the Growth tab (`/history/growth`), including the calendar grid and selected-day detail card.

**Requirements:** Skill principles #1 (concentric radius — verify), #9 (tabular-nums — already mostly applied; spot-check), #10 (text-wrap), #12 (scale on press), #16 (hit area), #3 (shadows over borders — swap to tokens).

**Dependencies:** U1 (uses `--shadow-sheet-popover`, `sheet-popover-in` keyframe, text-wrap defaults).

**Files:**
- `src/components/student-space/sheets/HistorySheet.tsx`
- `src/components/student-space/sheets/CalendarPane.tsx`
- `src/components/student-space/sheets/DayDetailCard.tsx`
- `test/components/student-space/sheets/history-sheet.test.tsx` — verify existing tests still pass

**Approach:**
- `HistorySheet.tsx`:
  - `PaneHeader` h2 at line 312: rely on U1's global `text-balance` default for h2 (no per-element class needed; cited here as intent).
  - `ViewModeDropdown` trigger at line 250–256: add `active:scale-[0.96]` + change `transition-colors` to `transition-[background-color,transform]` to cover the scale.
  - `ViewModeDropdown` menu at line 263: swap `shadow-[0_18px_48px_rgba(43,38,32,0.14)]` → `shadow-(--shadow-sheet-popover)`; add `animate-[sheet-popover-in_140ms_var(--ease-sheet)_both]` for enter.
  - Term-buttons in `GrowthPane` at lines 391–412: add `active:scale-[0.96]` to the non-disabled state (`disabled:pointer-events-none` analogue: rely on the existing `disabled:` prefix or guard with the existing `isFuture` flag).
  - "Try again" retry button at line 481–488: bump `min-h-8` → `min-h-10`; add `active:scale-[0.96]`.
- `CalendarPane.tsx`:
  - Chevron buttons at lines 197 + 218: bump `size-9` → `size-10`; add `active:scale-[0.96]`; change `transition-colors` → `transition-[background-color,color,transform]`.
  - Week/Month toggle at line 209 (`h-8`): bump to `h-10`; add `active:scale-[0.96]`.
  - Calendar cell buttons at line 263 (`min-h-14` / `min-h-10`): hit areas are fine; skip press-scale here — adding it to a dense grid feels jittery.
  - Calendar card outer shadow at line 190: confirm it stays as-is — the inset-1px-border + 1px-blur is a deliberate fine-detail stack.
- `DayDetailCard.tsx`:
  - The three `min-h-8` buttons at lines 361, 369, 380: bump to `min-h-10`; add `active:scale-[0.96]`.
  - Sparkles button at line 416 (`min-h-9`): bump to `min-h-10`; add `active:scale-[0.96]`.
  - Any h2/h3 headings: rely on U1's global `text-balance` default — no per-element class needed.

**Patterns to follow:**
- `TrajectorySheet.tsx` lines 222–251 — the existing well-polished button shape (`transition-[background-color,transform] duration-150 ease-(--ease-sheet) hover:bg-... active:scale-[0.96]`). Mirror this pattern for the buttons being polished here.

**Test scenarios:**
- *Test expectation: none — pure visual polish on existing surfaces; no behavior or data-flow change.*
- **Existing tests in `test/components/student-space/sheets/history-sheet.test.tsx`** continue to assert structure and behavior; verify they still pass.
- **Manual visual check** (`pnpm dev` → `/history` then `/history/growth`): chevron buttons feel pressable; ViewModeDropdown popover enters with the new keyframe; retry button hit area no longer looks tiny.

**Verification:** `pnpm check` + `pnpm test` pass. Manual inspection of `/history` and `/history/growth` shows polished interactions.

---

### U4. ProfileSheet audit (VIPS tabs + ShareDialog + IdentityCard)

**Goal:** Apply the rubric across the four VIPS dimension tabs (`values`, `interests`, `personality`, `skills`), the `IdentityCard` avatar, claim thumbnails, the `ShareDialog`, and the `AccountMenu` popover.

**Requirements:** Skill principles #1 (concentric radius — verify), #3 (shadows over borders), #5 (split/stagger enter — for ShareDialog), #10 (text-wrap — global default catches; explicit on key h2/h3), #11 (image outlines — avatar + thumbnails), #12 (scale on press), #14 (transition specificity), #16 (hit area).

**Dependencies:** U1 (`.image-outline` utility, `--shadow-sheet-dialog`, `--shadow-sheet-popover`, `--shadow-sheet-tile`, `sheet-popover-in` keyframe).

**Files:**
- `src/components/student-space/sheets/ProfileSheet.tsx`
- `test/components/student-space/sheets/profile-sheet.test.tsx` (if present — verify)

**Approach:**
- **Image outlines**:
  - `IdentityCard` avatar `<img>` at line 358: add `image-outline` class.
  - Claim thumbnail `<img>` at line 651: add `image-outline` class.
- **Shadows over borders** (token swaps):
  - `AccountMenu` popover at line 419: `shadow-[0_18px_48px_rgba(43,38,32,0.14)]` → `shadow-(--shadow-sheet-popover)`; add `animate-[sheet-popover-in_140ms_var(--ease-sheet)_both]`.
  - `ShareDialog` panel at line 1189: `shadow-[0_24px_80px_rgba(43,38,32,0.22)]` → `shadow-(--shadow-sheet-dialog)`.
  - `TldrHero` gradient surface at line 783: keep the gradient; add `shadow-(--shadow-sheet-tile)` for depth.
  - `PersonalityTldr` at line 844: same treatment.
  - Claim-tile thumbnail container at line 650 (`shadow-[0_8px_20px_rgba(43,38,32,0.08)]`) → `shadow-(--shadow-sheet-tile)`.
- **Hit areas**:
  - `ShareDialog` close `size-9` at line 1203: bump to `size-10`; add `active:scale-[0.96]`.
  - `ShareDialog` "Try again" `min-h-9` at line 1234: bump to `min-h-10`; add `active:scale-[0.96]`.
  - `ShareDialog` "Sign in to share" `min-h-9` at line 1226: bump to `min-h-10`; add `active:scale-[0.96]`.
  - `ShareDialog` "Copy" button at line 1262 — already `min-h-10`; just add `active:scale-[0.96]`.
  - `ShareDialog` "Revoke link" `min-h-9` at line 1314: bump to `min-h-10`; add `active:scale-[0.96]`.
  - `ShareDialog` show-quotes toggle at line 1289 (`h-7 w-12`): the visible toggle stays compact for design reasons; extend hit area via `before:absolute before:-inset-3 before:content-['']` pseudo-element on the button (40×40+).
  - "Clear filter" button at line 614 (`px-3 py-1`): bump to `min-h-10 px-3` with vertical padding adjusted; add `active:scale-[0.96]`.
- **Scale on press** (for buttons that don't have it yet):
  - `TimelineQuote` forget button at line 1083: add `active:scale-[0.96]`.
  - `TimelineQuote` "see source reflection" button at line 1097: add `active:scale-[0.96]` (also ensure 40px hit area — wrap in a `min-h-10` padded button).
  - `BigFiveCards` article-button at line 916: already styled; add `active:scale-[0.98]` for the lighter press on a wide row.
  - `TldrHero` pole chips at line 800: add `active:scale-[0.96]`.
- **Enter animation for `ShareDialog`**:
  - Wrap the dialog `<section>` (line 1189) in a span class `animate-[sheet-popover-in_180ms_var(--ease-sheet)_both]` for a soft enter. Keep the surrounding `<div>` backdrop opaque-from-the-start so the click-to-dismiss target appears instantly.

**Patterns to follow:**
- `TrajectorySheet`'s `StatusPreviewSelector` popover animation pattern (line 410) — copy the keyframe-via-animate-class idiom.
- The existing image-outline pattern in shadcn-inspired projects is `outline` + negative `outline-offset` — the new `.image-outline` utility lands exactly that.

**Test scenarios:**
- *Test expectation: none — pure visual polish.* Behavior unchanged: same handlers, same disabled-state semantics (Button CVA's `disabled:pointer-events-none` ensures press-scale doesn't fire on disabled).
- **ShareDialog tests** (if present in `test/components/student-space/sheets/`): verify they still pass — the dialog still mounts conditionally on `open`, the `data-testid="share-dialog"` is preserved.
- **Manual visual check**: open `/profile` → click Share → confirm dialog softly fades-and-scales in; open AccountMenu (top-right kebab) → confirm popover enters with the new keyframe; toggle through Values / Interests / Personality / Skills tabs and confirm claim thumbnails have a subtle outline at all background colors.

**Verification:** `pnpm check` + `pnpm test` pass. Visual inspection at `/profile`, `/profile/interests`, `/profile/personality`, `/profile/skills`, `/profile/relationships`, `/profile/choices` shows polished hits, outlines, shadows.

---

### U5. TrajectorySheet light triage + concentric nudge

**Goal:** Path Finder is already the most polished surface (text-balance, text-pretty, tabular-nums, press-scale, ease-sheet tokens widely applied). Apply a thin triage pass: rename the `trajectoryMenuIn` keyframe call to the new shared `sheet-popover-in`, fix a 2px concentric-radius mismatch on the pathway-tab container, and consolidate any duplicated shadow stacks via the new tokens.

**Requirements:** Skill principles #1 (concentric radius), #5 (split/stagger enter — reuse shared keyframe), #3 (shadows over borders — via token consolidation).

**Dependencies:** U1 (the `sheet-popover-in` keyframe rename).

**Files:**
- `src/components/student-space/sheets/TrajectorySheet.tsx`

**Approach:**
- Update the two `animate-[trajectoryMenuIn_140ms_cubic-bezier(0.22,1,0.36,1)_both]` references at line 410 and `animate-[trajectoryMenuIn_160ms_...]` at line 529 to use `sheet-popover-in` and the `var(--ease-sheet)` token:
  - Line 410 → `animate-[sheet-popover-in_140ms_var(--ease-sheet)_both]`
  - Line 529 → `animate-[sheet-popover-in_160ms_var(--ease-sheet)_both]`
- Concentric radius nudge on the pathway-tab container (line 668): outer `rounded-2xl` (16px) with `p-1.5` (6px padding) and inner `rounded-xl` (12px) — concentric formula says outer = inner + padding = 18px. Change outer to `rounded-[18px]` for exact concentric alignment. Inner stays `rounded-xl`.
- StatusPreviewSelector popover at line 410: confirm the outer `rounded-2xl` (16) + `p-1` (4) + inner `rounded-xl` (12) is exact concentric (16 = 12 + 4 ✓) — no change.
- StatTile at line 478: already uses a layered inset shadow stack — leave as-is, but verify the shadow values are still appropriate after U1's token additions. If the `--shadow-sheet-tile` token visually matches the existing stack, swap; otherwise keep the local stack with a comment that it's intentionally bespoke for the inset look.

**Patterns to follow:**
- The skill's concentric formula: `outerRadius = innerRadius + padding`.
- Existing TrajectorySheet press-scale + transition pattern lines 222–251 — already canonical for the project.

**Test scenarios:**
- *Test expectation: none — keyframe rename and 2px radius nudge are pure visual polish; behavior unchanged.* The `data-trajectory-status-root`, `data-testid="trajectory-status-pill"`, etc. remain.
- **Manual visual check**: navigate to `/trajectory`, open the StatusPreviewSelector dropdown — confirm the popover enters with the same easing curve (it's the same keyframe under a new name). Pathway tabs container should look subtly more "right" — the inner tabs sit inside an outer container whose radius is exactly inner+padding.

**Verification:** `pnpm check` + `pnpm test` pass; `pnpm dev` → `/trajectory` shows no regression.

---

### U6. Choices + Relationships profile sub-views

**Goal:** Apply the rubric to the two large non-VIPS profile sub-views, which currently have systematic gaps: missing press-scale on every CTA, missing tabular-nums on counts, hit-area violations on remove buttons, and dense pattern / force-toggle chips.

**Requirements:** Skill principles #3 (shadows over borders — careful judgment), #9 (tabular-nums on counts), #10 (text-wrap — global default catches h1/h2), #12 (scale on press), #16 (hit area).

**Dependencies:** U1 (text-wrap default; press-scale convention).

**Files:**
- `src/components/ChoicesPageView.tsx`
- `src/components/RelationshipsPageView.tsx`

**Approach (Choices)** — `src/components/ChoicesPageView.tsx`:
- h1 at line 109 — global `text-balance` default from U1 catches this; no per-element class needed.
- Count display at line 534: add `tabular-nums`.
- "Log a decision" button at lines 166–174: add `active:scale-[0.96]`.
- Remove buttons (line 213): add `active:scale-[0.96]`; verify hit area — extend with `min-h-10` if currently smaller.
- Pattern tag buttons at lines 306–322 (`px-2.5 py-0.5`): these are very dense tags. Add `active:scale-[0.96]`; extend hit area via `before:absolute before:-inset-1.5 before:content-['']` pseudo-element rather than resizing the visible chip (resizing would change layout).
- Force toggle buttons at lines 422–439 (`px-3 py-1`): same treatment — pseudo-extend.
- Form save buttons at lines 454–462 and 752–759: add `active:scale-[0.96]`.
- "Add an intention" button at lines 577–585: add `active:scale-[0.96]`.
- `border-l-3` accent strip at line 202 / 613: **leave as-is** — replacing a left-accent border with a shadow loses semantic meaning (the accent communicates state). Deferred to a future polish pass if needed.

**Approach (Relationships)** — `src/components/RelationshipsPageView.tsx`:
- h1 at line 119 + h2 at line 592: global `text-balance` default catches; no per-element class needed.
- "Add a person" / "Add a group" / "Log an observation" buttons at lines 166, 369, 595: add `active:scale-[0.96]`.
- Remove buttons at lines 218, 420, 690: add `active:scale-[0.96]`; pseudo-extend hit area to 40×40 (or bump element size if layout permits).
- Form submit buttons at lines 320, 542, 821: add `active:scale-[0.96]`.
- `border-dashed border-[#e3d8c4]` at line 608: this is intentionally rough — a "self-side" empty-state visual treatment. Leave as-is; replacing with a shadow would change semantic register. Deferred.
- `border-l-3` accent strips at lines 202, 408, 668: same reasoning as Choices — accent borders are intentional. Leave; deferred.

**Patterns to follow:**
- ProfileSheet's `TimelineQuote` button shape (line 1083 in `src/components/student-space/sheets/ProfileSheet.tsx`) — small text button with hover + add press-scale.
- The `before:absolute before:-inset-X` pseudo-element pattern for hit-area extension on dense controls is a common shadcn-inspired idiom — use `before:content-['']` to ensure it renders.

**Test scenarios:**
- *Test expectation: none — pure visual polish; no behavior change.*
- **Manual check at `/profile/relationships`**: confirm pressing any CTA feels tactile; remove buttons (now larger or pseudo-extended) don't overlap adjacent controls.
- **Manual check at `/profile/choices`**: same.
- **Existing engine slice tests** for `Choices` and `Relationships` slices (if present in `test/`) continue to pass — this unit touches only view components, not data.

**Verification:** `pnpm check` + `pnpm test` pass. Visual inspection at `/profile/choices` and `/profile/relationships` shows uniform press feedback and properly-sized tap targets.

---

## System-Wide Impact

- **Designers / future polish PRs**: the new `--shadow-sheet-*` and `--press-scale` tokens become the canonical reference. Add a brief comment block in `src/styles.css` so future contributors use them instead of arbitrary values.
- **Onboarding / Letters / Settings (out of scope here)**: when these get a polish pass later, the cascade tokens from U1 will already be available. The actual port is small.
- **Accessibility**: hit-area fixes improve mobile touch targets across History, Profile, Path Finder. No keyboard / screen-reader regressions are expected (all changes are CSS / class additions).
- **No tenancy / data-flow impact**. Zero changes to `withStudent`, engine slices, agents, or routes.
- **No SHEET_HREFS impact**. The `src/components/student-space/navigation/SideRail.tsx` constant is untouched; the round-trip test `test/engine/SideRail.hrefs.test.ts` continues to pass.

---

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Global `text-wrap: balance` on `h1-h4` causes regression on an out-of-scope surface (Onboarding, Letters, world HUD) | Low–medium | Manual visual scan of `/`, `/onboarding`, `/letters`, `/settings` after U1 lands. `:where()` selector is zero-specificity so any per-element `text-wrap-*` already in place wins. |
| Hit-area pseudo-extender (`before:absolute before:-inset-X`) overlaps adjacent control in dense lists (Choices / Relationships rows) | Medium | Default to bumping element size where layout permits; reserve pseudo only for chip / toggle cases. Manual visual check + tab-key navigation to verify focus rings are correct. |
| Renaming `trajectoryMenuIn` → `sheet-popover-in` breaks a callsite I missed | Low | Grep `trajectoryMenuIn` across the repo before merging U1; the only callsites are the two in TrajectorySheet. U5 lands the rename and the callsite updates in the same unit. |
| Adding press-scale to a button inside a tightly-coupled scroll container (e.g., calendar grid) feels jittery | Low | U3 explicitly excludes calendar cells from press-scale for this reason. The grid-cell button at `CalendarPane.tsx:263` stays untouched. |
| Shadow-token swap visually shifts a surface that intentionally used a slightly different stack | Medium | Confirm pixel-equivalence: the new tokens use the same RGB values as the literals they replace. If a surface looks subtly different after the swap, the token-vs-literal divergence is the cause — adjust the token, not the surface. |
| Test snapshot or DOM assertion breaks on the keyframe-class addition | Low | Animation classes use `animate-[name_duration_ease_fill]` arbitrary-value syntax — these are part of `className` strings only. Existing tests check `data-testid` and structure, not class lists. |

---

## Sequencing & PR Shape

The work is naturally a single PR (or a stacked pair: U1+U2 as foundation, then U3–U6 as the audits). All six units share the same theme — feel polish — and the changes are small per file. The unit boundaries above let an implementer land them as discrete commits if a single PR feels too dense.

Recommended sequence:
1. **U1** (tokens + keyframe rename) — foundation
2. **U2** (Sheet primitive + Drawer + Button JSDoc) — chrome cascade
3. **U5** (Trajectory keyframe rename + concentric nudge) — small, validates the cascade
4. **U3** (History + supporting panes)
5. **U4** (Profile sheet)
6. **U6** (Choices + Relationships sub-views)

U5 deliberately sits early to validate that the keyframe rename works before U3 / U4 / U6 adopt the new token + keyframe.

---

## Verification (cross-unit)

- `pnpm check` (Biome + `tsc --noEmit`) passes
- `pnpm test` passes (no test additions; existing suites preserved)
- `pnpm dev` → manual visual sweep of:
  - `/history` and `/history/growth`
  - `/profile`, `/profile/interests`, `/profile/personality`, `/profile/skills`, `/profile/relationships`, `/profile/choices`
  - `/trajectory`
  - Smoke check: `/`, `/onboarding`, `/letters`, `/settings` for any unintended visual regression from the global text-wrap default
- Confirm at least one moment of "this feels better" on each of the three target sheets — the compounding-of-details effect the skill exists to produce
