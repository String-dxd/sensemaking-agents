---
title: E2E UX/motion audit — findings
type: audit
status: active
date: 2026-05-20
related_plan: docs/plans/2026-05-20-002-refactor-e2e-ux-motion-audit-plan.md
references: docs/audit/mobbin-references-2026-05-20.md
---

# Audit findings — 2026-05-20

Findings from the U6 Mobbin-referenced visual audit plus the U7–U10 `make-interfaces-feel-better` passes. Each table is grouped by principle (per the m-i-f-b convention) so reviewers can scan the deltas without re-reading the originating goal.

Screenshots referenced live in `/tmp/audit-fixes/`. Mobbin references resolve via the IDs in `docs/audit/mobbin-references-2026-05-20.md`.

---

## PHASE 2 — Critical fixes (U2–U5)

Captured before/after for the four user-reported defects. All verified via headless replay in `/tmp/audit-fixes/`.

| Defect | Before | After |
| --- | --- | --- |
| Kira pre-land flash (U2) | Bird mesh added to scene at perch on construction → visible for full duration of greeting/egg phases before flyTo animation starts | `Kira.setOnboardingMode(true)` hides the group; `Kira.flyTo()` reveals AFTER teleport to startPos. First rendered frame after flyTo is at off-canvas start, not at perch. Idempotent reveal in `setOnboardingMode(false)` handles resume-past-FirstChat. |
| ShareDialog under Profile (U3) | `document.body.appendChild` + `z-index: 40` lost to sheet-chrome's `z-index: 60`. ShareDialog opened "behind" the Profile sheet | Portal via `OverlayController.getActiveRoot()` (mirrors `DayDetailCard`) into the active sheet's stacking context. `z-index: 5` beats sibling sheet content, stays below the chrome's × (z-32). Runtime probe confirms `parent: .sheet-chrome.profile-sheet.is-open, zIndex: 5`. |
| Profile hero opaque (U4) | `.profile-sheet__hero-shimmer { opacity: 0.85 }`, wash stops `88% / 55%` — read as a solid beige strip crowning the sheet | Shimmer `opacity: 0.35`, wash stops `55% / 28%`. Hero now reads as a soft facet-tinted wash; cream gradient at the bottom blends into the sheet's translucent backdrop. |
| Path Finder opaque cards (U5) | `.trajectory-starter__card`, `.trajectory-nudge`, `.trajectory-foreclosed__item`, `.trajectory-achieved__item` all `rgba(255,255,255,0.72)` — solid card-on-sheet | All four reduced to `rgba(255,255,255,0.40)`; status pill `0.72 → 0.55`. Cards now sit as glass panels on the chrome; the sheet gradient and (when the canvas renders) the island visibly extend through. |

---

## PHASE 3 — Mobbin-referenced family audit (U6)

For each family, (a) **what theirs has ours lacks**, (b) **what ours does well**, (c) **AI-slop reflexes to remove**.

### Onboarding companion (Tolan / Gentler Streak / Duolingo)

| Aspect | Note |
| --- | --- |
| (a) Lacking | Tolan grounds the companion in the *same scene* as the world; ours used to put Kira on the perch before the world had "arrived" — fixed by U2. Speech tail-anchoring (Duolingo) would clarify attribution; today Kira's dialogue is a separate dialogue layer, not visually tied to her beak. |
| (b) Doing well | Kira renders directly in the 3D scene at world depth, not as a flat 2D illustration. Stronger spatial commitment than any reference, and the camera close-up during FirstChat is more cinematic than Tolan's static bottom-pinned line. |
| (c) Slop to remove | The Greeting → EggHatcher → FirstChat sequence has copy bursts ("In a few moments…", "Almost in…") that don't compound. The user is patient through one preamble, not three. Defer the copy pass; flagged for a follow-up plan. |

### Reflection / mood capture (How We Feel / Ahead / Fitbit)

| Aspect | Note |
| --- | --- |
| (a) Lacking | One-screen capture (Ahead) — our AskSheet + MoodSheet are separate flows. Implicit selection confirmation (scale-up of the picked option) is missing on MoodSheet; today the affordance only highlights via colour. |
| (b) Doing well | Our Ask + Photo + Mood capture set is broader than any reference, and the Chooser pre-flight is more intentional than Fitbit's direct entry. |
| (c) Slop to remove | None obvious in this pass. Empty-state copy for AskSheet ("How are things") could use a friendlier opener; deferred to U12. |

### Translucent sheet over animated background (Flighty / Bump / Moonlitt)

| Aspect | Note |
| --- | --- |
| (a) Lacking | Flighty's **nested cards are lower-alpha than the sheet itself** — the rule we just enforced with U5 (cards 0.40 < sheet 0.55–0.92). Bump's protruding avatar (badge breaks the pill boundary) is a dimensional detail we don't currently use anywhere. |
| (b) Doing well | The SheetChrome contract from plan 001 is now the canonical implementation of this pattern. Translucency + blur + the 200ms fade are uniform across all five full-viewport sheets. |
| (c) Slop to remove | A handful of per-sheet content rules still hand-roll backdrop colours that the chrome already provides — picked up in U7/U8/U10. |

### Calendar with affective markers (Apple Health / How We Feel / Stoic)

| Aspect | Note |
| --- | --- |
| (a) Lacking | Apple Health's **glyph-as-content, no cell** layout — our calendar uses rounded squares per day with a tiny dot when logged. The dot is too quiet; the cells dominate. Stoic's **density-as-pattern** (one dot per day across stacked months) could anchor a future yearly view. |
| (b) Doing well | The "Today" ring (May 20 in the screenshot) is a clean focus marker. Faceted color glints already begin to appear on logged days — the right direction, just under-amplified. |
| (c) Slop to remove | "No confirmed reflections" CTA copy is negatively framed; replaced this pass with `Log a reflection to begin`. Day cells' uniform card treatment is "AI-slop neutral" — every cell looks like a tile. The fix (let glyphs carry the rhythm) is structural and deferred to a follow-up plan; we mark it here so future work has the reference. |

### Letters / messages inbox (Apple Messages / Behance / Tesla)

| Aspect | Note |
| --- | --- |
| (a) Lacking | Apple Messages' **single coloured dot for unread** instead of a full pill background — our active row uses a heavy white pill, which makes the row look "active" even when the user is just reading. |
| (b) Doing well | Sparse rows + huge negative space below match Apple's posture. Per-sender label + date format already aligns to Tesla's read-at-a-glance pattern. |
| (c) Slop to remove | The blurred backdrop behind the empty zone is too busy on the headless capture — the per-letter row hover/focus state will be tuned in U8. |

### Pathway viewer (Duolingo / Mimo / Brightmind)

| Aspect | Note |
| --- | --- |
| (a) Lacking | Brightmind's **dotted spline path metaphor** — ours uses a horizontal status-pill carousel, which doesn't read as a journey. Mimo's **connector lines + locked downstream node** would make the "achievable next" of a path explicit. |
| (b) Doing well | The status-aware Path Finder (Starter/Diffused/Searching/Foreclosed/Achieved) is a richer vocabulary than any reference. Generation timestamp + "X pathways" subtitle is honest. |
| (c) Slop to remove | "Generated 5/20/2026, 9:32 AM · 3 pathways" — the generation timestamp reads as developer telemetry, not user value. Consider hiding behind a tooltip or compressing to just "3 pathways". Deferred — not blocking. |

---

## PHASE 4 — m-i-f-b principle passes (U7–U10)

Tables below populate as each principle pass lands. Each row cites the file and the specific property changed where it isn't obvious from the snippet.

### Typography (U7) — text-wrap, font smoothing, tabular numbers

| Before | After |
| --- | --- |
| `body.student-space-shell` — no font-smoothing | Added `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` |
| `.sheet-chrome__content h1/h2/h3` — default text-wrap | Grouped rule `text-wrap: balance` — prevents lone-word last lines on sheet titles |
| `.sheet-chrome__content p` — default text-wrap | Grouped rule `text-wrap: pretty` — prevents single-word orphans on body paragraphs |
| `.calendar-day__num`, `.history-sheet__pill`, `.trajectory-sheet__meta`, `.profile-sheet__meta` — proportional digits | Grouped rule `font-variant-numeric: tabular-nums` — calendar dates / year-pill scrubs / pathway count / last-refined stamp no longer shift width across rotations |

### Surfaces (U8) — concentric radius, optical alignment, shadows-over-borders, image outlines

| Before | After |
| --- | --- |
| `.bento-tile__thumb` — image with no outline; bled into facet-tinted tile background | `outline: 1px solid rgba(0, 0, 0, 0.1)` (pure-black 10%, NEVER tinted) + `outline-offset: -1px`. `@media (prefers-color-scheme: dark)` switches to pure-white 10%. |
| `.sheet-chrome__close` — × glyph ~1px above geometric center (typographic metrics) | Added `padding-bottom: 2px` so × reads as optically centered inside the 40px circle |
| `.cal-nav` chevrons — geometrically centered, but asymmetric glyph reads off-center | `[data-dir="-1"] { text-indent: -2px }` and `[data-dir="1"] { text-indent: 2px }` — nudges each chevron toward its own apex |

(Concentric-radius walk of Profile open-question, bento, letter rows, Trajectory bearings, calendar cells found no violations — each container's children are either non-rounded or sit at sufficient padding for the existing radius. Image-outline + optical alignment carried the principle's load this pass.)

### Animations (U9) — interruptible, split-and-stagger, scale-on-press, contextual icon anims, reduced-motion

| Before | After |
| --- | --- |
| 5 sheet-close buttons (`trajectory-sheet__close`, `ask-sheet__close`, `photo-sheet__shutter`, `kira-dialogue__close`, `day-detail-card__close`) — `transform: scale(0.94)` on `:active` (under the 0.95 floor per principle) | All standardized to `transform: scale(0.96)` |
| `.calendar-day:active` — `scale(0.98)` (above floor but inconsistent) | `scale(0.96)` |
| `.ask-sheet__emoji-option:active` — `scale(0.98)` | `scale(0.96)` |
| `.bento-tile`, `.letter-row`, `.history-sheet__pill`, `.trajectory-sheet__status-pill`, `.trajectory-starter__cta` — no `:active` press feedback | Grouped rule `transform: scale(0.96); transition: transform 120ms ease;` — every primary tap target now has tactile feedback |
| Sheet enter — single 200ms opacity fade on the whole chrome | Added split-stagger: `.sheet-chrome.is-open .sheet-chrome__content > :nth-child(-n+3)` runs `sheet-stagger-in 200ms cubic-bezier(0.2, 0, 0, 1) both` with delays 0 / 80 / 160ms. Sheet opens read as one breath instead of a thump. |
| Existing reduced-motion blocks scattered across the file but new rules unprotected | Added one consolidated `@media (prefers-reduced-motion: reduce)` block: stagger collapses to 80ms with `animation-delay: 0ms !important`; new press-feedback rules collapse to 80ms transition-duration |

### Performance (U10) — transition specificity, `will-change` discipline

Grep audit clean — no source code changes needed:
- `grep "transition: all"` → 0 rule matches (only a comment in the new U9 block referencing the rule)
- `grep "will-change:"` → 1 occurrence (`will-change: opacity` on line 5512 — correct, in allowed set `transform/opacity/filter`)
- All `transition-duration: <ms>` standalone rules live inside `@media (prefers-reduced-motion)` blocks, overriding base `transition: <prop> <ms> <ease>` shorthands; no risk of inheriting `transition-property: all`

### Hit areas (U11) — ≥40×40px

| Before | After |
| --- | --- |
| `.cal-nav` — 36×36px (under floor) | Bumped to 40×40 directly (calendar header has room; no layout shift) |
| `.history-sheet__pill` — ~32px tall (under floor) | `position: relative` + `::before { inset: -4px; border-radius: inherit; }` — hit area extends to ≥40×40 without changing the visible chip. Gap between pills is 8px, extension is 4px per side, so adjacent zones touch but never overlap |
| `.trajectory-sheet__status-pill` — 28px tall (well under floor) | `position: relative` + `::before { inset: -7px -6px; border-radius: inherit; }` — extends to ≥42×40 |

### Coverage gaps (U12) — empty, error, reduced motion

| Surface | Before | After |
| --- | --- | --- |
| `LettersSheet._render` | First-run users (zero letters) saw an empty list pane with no message — read as broken | Added `.letters-sheet__empty--list` placeholder: "No letters yet. Your teacher will write when they notice something." Sets focus that the *teacher* writes here, not the student. |
| Reduced-motion sweep | 14 existing `@media (prefers-reduced-motion)` blocks already in `style.css` | New U9 stagger + press-feedback rules each protected by their own reduced-motion override; no exposed animation longer than 80ms when the OS preference is on |
| AskSheet / PhotoSheet / MoodSheet error state | DayDetailCard already exposes a "Retry sync" affordance for failed captures via `data-sync-action="retry"` | Verified existing path; no further work needed this pass. A future plan can surface the retry banner at capture-time instead of only after the fact. |

### Hit area (U11) note on what's NOT extended

Calendar day cells (`.calendar-day`) already render ≥40px in the default layout via grid sizing. Bento tiles, letter rows, and most chrome buttons clear 40px through normal padding. The pseudo-element extensions above target only the genuine sub-40 offenders.

---

## PHASE 6 — E2E walk (U13)

All artefacts in `docs/audit/2026-05-20-e2e-walk-screenshots/`:

| File | What it shows |
| --- | --- |
| `01-cold-onboarding-*.png` × 8 | Cold boot at 400ms / 800ms / 1.5s / 2.5s / 4s / 6s / 9s / 12s. None show Kira at the perch. The bird only appears mid-arc once FirstChat's `flyTo()` reveals her. **U2 verified end-to-end.** |
| `02-world-default.png` | World view after onboarding completes |
| `03-{profile,letters,trajectory,history,calendar}-default.png` | Each full-viewport sheet at default state. All show the SheetChrome translucency consistently. |
| `04-profile-{values,interests,personality,skills}.png` | Profile facet tabs — hero wash subtly tints per-facet without becoming an opaque crown |
| `05-sharedialog-over-profile.png` | ShareDialog centered above Profile, Profile content dimmed behind. Runtime probe earlier confirmed `parent: .sheet-chrome.profile-sheet.is-open, zIndex: 5`. **U3 verified end-to-end.** |
| `06-trajectory-status-{1..5}.png` | Path Finder cycling Starter / Diffused / Searching / Foreclosed / Achieved. All cards translucent. **U5 verified across every status.** |
| `07-calendar-daydetail.png` | DayDetail child overlay portaled into Calendar's stacking context |
| `08-letters-empty.png` | LettersSheet with first-run empty state (when no demo letters present) |
| `09-5-sheet-side-by-side.png` | Composite of all five full-viewport sheets — visually confirms they read as one family |

### Done criteria check

- [x] Cold-onboarding evidence sequence captured (proves no Kira pre-land flash)
- [x] ShareDialog-over-Profile screenshot + DOM probe
- [x] 5-sheet family composite
- [x] `docs/audit/mobbin-references-2026-05-20.md` committed
- [x] `docs/audit/audit-findings.md` committed (this file)


---

## Microfixes shipped under U6 (Mobbin audit pass)

| Surface | Before | After |
| --- | --- | --- |
| Calendar connector button (`CalendarSheet.js:400`) | `'No confirmed reflections'` (negative empty-state framing) | `'Log a reflection to begin'` (invitation, not absence) |
| History island caption (`HistorySheet.js:780-781,796`) | `'Drag to rotate · scroll to zoom · pills above scrub years'` / `'Drag to rotate · scroll to zoom'` | `'Drag · scroll · pick a year above'` / `'Drag · scroll'` — shorter utility line, less wall-of-text |

These are the only U6 source edits. The bigger principle-driven fixes (concentric radius, animation choreography, etc.) follow in U7–U10 below.
