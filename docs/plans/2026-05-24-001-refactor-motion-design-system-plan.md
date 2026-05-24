---
title: Motion design system — tokens, transitions, and reduced-motion across DOM surfaces
type: refactor
status: active
date: 2026-05-24
---

# Motion design system — tokens, transitions, and reduced-motion across DOM surfaces

## Overview

A focused motion-only pass on the **React/DOM** surfaces of the app: navigation (side rail + routed sheet enter/exit + page-to-page swaps), capture popup (chooser + Ask/Mood drawers), tab switching inside sheets (Profile, History, Trajectory), and onboarding step transitions. Engine scene motion (Three.js — Kira, particles, weather, camera tweens) is out of scope and already tuned by recent PRs.

Today the DOM motion is uneven: the `Drawer` primitive and `Hud` are well-tuned; routed sheets have **no enter or exit at all** (intentional, to fix the world-frame flash in PR #3546242); the `CaptureChooser` pops in with zero motion; tab content swaps are instant; `OnboardingFlow.StageSlot` never actually crossfades between stages despite the transition class; `Button` declares `active:scale-[0.96]` without a transform transition so the press snaps; and `transition: all` shortcuts and untokenized durations are scattered across the world overlays and dialogs.

This plan centralizes a small motion-token vocabulary, fixes the press-feel snap, layers a route-enter/exit cross-fade onto the **world canvas** (sidestepping the no-portal-remount decision for `PageSurface`), adds content-only stagger and cross-fades for first-open sheets and tab swaps, gives the `CaptureChooser` a real enter, makes onboarding cross-step transitions actually happen, and sweeps the `transition: all` shortcuts. Every motion ≥200ms gets a `prefers-reduced-motion` collapse.

The guiding source is the `web-animation-design` skill (Emil Kowalski / animations.dev): **ease-out for enters and exits, ease-in-out for on-screen movement, ease for hover, ≤300ms durations, transform/opacity only.** The team's prior audit (`docs/audit/audit-findings.md`) codified `cubic-bezier(0.22, 1, 0.36, 1)` and a ≤80ms reduced-motion ceiling — both carried forward here.

---

## Problem Frame

Concrete defects across the current DOM motion:

- **Routed sheets have no enter/exit motion.** Opening Profile, History, Letters, Trajectory, or Settings flips into existence with no transition. The trade-off is documented in `src/components/ui/sheet.tsx:12–33` — the previous opacity-0 starting style caused a world-frame flash on every page→page swap (fixed in PR #3546242). The fix removed *all* sheet motion; we need to restore enter/exit motion **only** at world↔sheet boundaries, never on sheet→sheet.
- **World canvas hides/shows instantly.** `EngineHost.tsx:232` toggles `pointer-events-none invisible opacity-0` with no transition. Opening a sheet snaps the world off; closing snaps it back. This is the same world↔sheet boundary as the sheet motion problem.
- **`CaptureChooser` has zero enter motion.** `CaptureChooser.tsx:42` returns `null` when inactive and mounts a full-bleed backdrop + bottom card with no `data-starting-style` and no transition. Compare to `Drawer` (PR #53) which animates correctly via Base UI.
- **Tab content swaps instantly.** Profile and History tab content swaps with no transition. Trajectory remounts via `key={selectedIndex}` (`TrajectorySheet.tsx:716`) but applies no transition either.
- **Onboarding cross-step transitions don't fire.** `StageSlot` (`OnboardingFlow.tsx:303–313`) has `opacity-100` hard-coded and never toggles, so the `transition-opacity duration-[320ms]` class is dead. Per-stage `visible` ramps work, but there is no crossfade *between* stages.
- **Press feel snaps on most primitives.** `Button` (`button.tsx:7`) declares `active:scale-[0.96]` paired with `transition-colors` only — no `transition-property: transform`, so the scale snaps. Same pattern on many onboarding CTAs and `SkipButton`.
- **No global reduced-motion safety net.** Only `Hud`, `StageSlot`, and `CameraTuneHud` honor `motion-reduce:`. 200+ Tailwind transitions across sheets, world overlays, and primitives do not — users with `prefers-reduced-motion: reduce` still see full motion on most surfaces.
- **`transition: all` shortcuts.** `WorldInteractions.tsx` overlays (KiraBubble, HoverCtaChip, NarratorPanel, ObjectPeekPopover at lines 1543, 1564, 1609, 1654, 1708), `DevPalette.tsx:186`, `alert-dialog.tsx:38`, `dialog.tsx:43` all use `transition` or `transition-all`. Banned per prior audit; reintroduced as React surfaces shipped.
- **Mixed duration vocabulary.** Literal `120ms`, `140ms`, `150ms`, `160ms`, `180ms`, `200ms`, `220ms`, `300ms`, `320ms`, `1500ms` scattered through 30+ files. Only `--duration-sheet: 200ms` and `--ease-sheet: cubic-bezier(0.22, 1, 0.36, 1)` exist as tokens.

The shared characteristic: motion was added per-surface as features shipped. The system is missing a token layer and a couple of global behaviors (reduced-motion, world↔sheet cross-fade) that would unify the surface without per-component change.

---

## Requirements Trace

- **R1.** A central motion token vocabulary in `src/styles.css` `@theme` covers duration (fast / base / slow) and easing (out / in-out / linear). Existing `--duration-sheet` and `--ease-sheet` remain valid as aliases.
- **R2.** Every transition or animation ≥200ms collapses to ≤80ms under `prefers-reduced-motion: reduce`. Transform-based motion (translate/scale) is disabled entirely under reduced motion; opacity-only fades are kept but compressed.
- **R3.** Every interactive primitive (`Button`, `Badge`, side-rail rail buttons, sheet nav buttons, tabs, chips, capture cards) declares an explicit `transition-property` that includes `transform` whenever it uses `active:scale-*`. Scale never goes below 0.95.
- **R4.** Opening a routed sheet from the world (`/` → any sheet) cross-fades the world canvas out over 200ms and fades the sheet content in. Closing back to the world reverses the motion. **Page-to-page swaps between sheets remain instant** (no chrome remount, no flash).
- **R5.** Sheet body content fades in with a 60ms stagger on first open from the world (header → tabs → body), totaling ≤280ms. The chrome (`PageSurface` + `SheetSidebar` + `SheetPageHeader`) does not remount or re-fade on sheet→sheet swaps.
- **R6.** Tab switching inside Profile, History, and Trajectory cross-fades the content panel over 120ms (opacity only). The tab indicator and chrome stay instant.
- **R7.** `CaptureChooser` gains a real enter: backdrop fades in over 200ms ease-out; the bottom card slides up `translate-y-4 → 0` and fades opacity `0 → 1` over 200ms ease-out. Exit reverses on close, 160ms.
- **R8.** `OnboardingFlow.StageSlot` actually cross-fades between stages: outgoing stage fades out 200ms, incoming fades in 320ms with an 80ms overlap. Per-stage `visible` ramps stay intact.
- **R9.** `transition: all` and bare `transition` (shorthand) are removed across React surfaces. Every transition declares the property list explicitly.
- **R10.** `will-change` remains restricted to `transform / opacity / filter`, only on elements with observed first-frame stutter. No regression of the single load-bearing usage in `world-label.tsx:28`.
- **R11.** The Kira pre-land invisibility contract from the prior audit (Kira invisible until `flyTo` enters the tick loop) is not regressed.
- **R12.** Side rail (`SideRail.tsx`) hover, active, and tooltip motion uses the new tokens; tooltip reveal is opacity + translate-x with explicit `transition-property`.

---

## Scope Boundaries

- **Not** changing the Three.js engine scene motion. Kira walking, camera tweens, weather, particles, day cycle — all stay as the engine ships them.
- **Not** changing `PageSurface` to a Base UI `Dialog`. The plain-div decision in `sheet.tsx:12–33` is load-bearing for the world-frame-flash fix from PR #3546242. Sheet enter motion is layered onto the world canvas + sheet **content**, not the chrome.
- **Not** redesigning sheet visuals, typography, or layout. Motion-only pass.
- **Not** adding a JS animation library (Framer Motion / React Spring / Motion). The current toolkit (Tailwind utilities, CSS `@theme`, Base UI `data-[starting-style]` / `data-[ending-style]`, hand-rolled rAF for the CaptureFab particle burst) covers every case in this plan.
- **Not** touching the engine substrate `src/engine/student-space/style.css` motion. The four `@media (prefers-reduced-motion: reduce)` blocks there gate engine-side motion; we leave them alone.
- **Not** changing IA, copy, or component hierarchy.

### Deferred to Follow-Up Work

- A `useReducedMotion` React hook for cases where Tailwind's `motion-reduce:` variant can't reach (e.g. inline style transforms in `OverlayController.js`). Not needed for any unit in this plan.
- Springs / interruptible drag motion. The capture flow doesn't currently use draggable bottom sheets; if that comes in a future plan, it'd justify a spring system.
- Page-to-page sheet→sheet motion (e.g., Profile → History via the side rail). Currently instant by design; revisiting would require renegotiating the world-frame-flash trade.
- View Transitions API. The current TanStack Router setup doesn't expose route transitions and the world↔sheet cross-fade on the canvas covers the highest-impact case without it.

---

## Context & Research

### Current motion tokens (`src/styles.css:18–34`)

```css
--blur-sheet: 10px;
--duration-sheet: 200ms;
--ease-sheet: cubic-bezier(0.22, 1, 0.36, 1);
```

Plus one keyframe at `src/styles.css:108–117` used twice in `TrajectorySheet.tsx`:

```css
@keyframes trajectoryMenuIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

Engine substrate carries `--onb-ease: cubic-bezier(0.22, 1, 0.36, 1)` at `src/engine/student-space/style.css:820` — same value, different name. `StageSlot` references it via `ease-[var(--onb-ease)]`.

### Existing patterns to follow

- **`Hud`** (`src/components/ui/hud.tsx:30–45`) — the gold reference. Pairs `--duration-sheet` + `--ease-sheet` + `motion-reduce:transition-none`. New surfaces should match its pattern.
- **`Drawer`** (`src/components/ui/drawer.tsx:21–63`) — PR #53's capture pattern. Uses Base UI `data-[starting-style]` / `data-[ending-style]` with `transition-transform transition-opacity duration-200 ease-out` and a `popup` variant. The closest production reference for a properly-tuned enter/exit on a Base UI Dialog.
- **Trajectory tab + button** (`src/components/student-space/sheets/TrajectorySheet.tsx:680, 722, 870`) — explicit `transition-[transform,background-color,color,box-shadow] duration-150 ease-(--ease-sheet) active:scale-[0.98]`. The closest reference for a properly-tuned in-sheet interactive primitive.

### Anti-patterns confirmed in the current code

| File:line | Issue |
| --- | --- |
| `src/components/ui/button.tsx:7` | `active:scale-[0.96]` paired only with `transition-colors` — scale snaps |
| `src/components/student-space/world/WorldInteractions.tsx:1543, 1564, 1609, 1654, 1708` | `transition duration-200` (bare shorthand = `transition: all`) |
| `src/components/DevPalette.tsx:186` | `transition-all duration-200 ease-out` |
| `src/components/ui/alert-dialog.tsx:38` | `transition-all duration-200 ease-out` |
| `src/components/ui/dialog.tsx:43` | `transition-all duration-200 ease-out` |
| `src/components/student-space/capture/CaptureChooser.tsx:42, 55` | No enter motion; pops in via conditional render |
| `src/components/student-space/onboarding/OnboardingFlow.tsx:303–313` | `StageSlot` opacity hard-coded `100`; transition class never fires |
| `src/components/student-space/EngineHost.tsx:232` | `pointer-events-none invisible opacity-0` on canvas with no transition |
| `src/components/ui/sheet.tsx:38–60` | `PageSurface` has no enter motion (intentional for sheet→sheet, but world↔sheet motion missing) |

### Historical constraints from prior work

- The **world-frame flash** problem (PR #3546242, `sheet.tsx:12–33`) — page→page sheet swaps must not remount or starting-style-fade `PageSurface`. Our enter motion lives on the world canvas and on sheet body content, never on the chrome.
- The **Kira pre-land invisibility contract** (`docs/audit/audit-findings.md`, prior plan U2) — `Kira.setOnboardingMode(true)` sets `group.visible = false`; `FirstChat` positions before flyTo. Don't regress.
- The **sheet-chrome contract** (`docs/sheet-chrome-contract.md`) — full-viewport sheets share visual treatment. Our motion changes don't break that.

### Prior audit's motion contract (carry forward)

- Sheet enter: 200ms, `cubic-bezier(0.22, 1, 0.36, 1)` — kept as `--ease-out`.
- Press feedback: `scale(0.96)` over `120ms ease`. Never below 0.95.
- Stagger: 60ms (tightened from the prior 80ms — adds less perceived latency per the `web-animation-design` "100+ times daily" rule).
- Reduced motion: ≥200ms collapses to ≤80ms; transforms disabled, opacity kept.
- `will-change` restricted to `transform / opacity / filter`.

---

## High-Level Technical Design

This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.

### Motion token vocabulary

Two duration tiers and three easing curves, plus retained sheet/onboarding aliases:

```text
--duration-fast: 120ms   ← press feedback, micro
--duration-base: 200ms   ← sheets, drawers, route fades, capture enter (= --duration-sheet)
--duration-slow: 320ms   ← onboarding cross-step
--ease-out:     cubic-bezier(0.22, 1, 0.36, 1)   ← enters/exits (= --ease-sheet, --onb-ease)
--ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1)   ← on-screen movement
--ease:         cubic-bezier(0.4, 0, 0.2, 1)     ← hover, color
```

`--duration-sheet` and `--ease-sheet` remain as aliases (kept for the 30+ existing usages); new code reaches for the named tokens.

### Route-transition cross-fade (the world↔sheet boundary)

```text
isWorldRoute change ('/' or '/onboarding'  ↔  any sheet route)

  ENTERING SHEET                       EXITING SHEET (back to world)
  ───────────────                      ──────────────────────────────
  world canvas: opacity 1→0 (200ms)    world canvas: opacity 0→1 (200ms)
  sheet body:   opacity 0→1 (200ms)    sheet body:   opacity 1→0 (160ms exit)
  with stagger on first-open only      (chrome stays mounted; no flash)
```

Implementation seam: `EngineHost.tsx` already tracks `isWorldRoute`. Adding `transition-opacity duration-(--duration-base) ease-(--ease-out)` to the world canvas div and dropping `invisible` (keeping `pointer-events-none`) gives the canvas side of the cross-fade for free. Sheet-content side is per-sheet, controlled by a `data-fresh-enter` attribute set by a tiny `usePageEnterState()` hook (or directly in each sheet via a `useRef`-tracked previous pathname).

### Tab cross-fade

Each sheet with internal tabs wraps the content panel in `<div key={tabId} className="transition-opacity duration-[120ms] ease-(--ease) motion-reduce:transition-none">`. Trajectory already remounts on `key`; just add the transition class. Profile and History gain the same wrapper.

### Onboarding cross-step

`StageSlot` becomes keyed on `stage`, with two slots layered: outgoing stage absolute-positioned, fading out 200ms ease-out, then unmounted. Incoming stage fades in 320ms ease-out with an 80ms delay (overlap). Per-stage `visible` ramps stay; `StageSlot` provides the *between*-stage motion that's currently missing.

### Reduced-motion safety net

A single `@layer base` block in `src/styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 80ms !important;
    animation-delay: 0ms !important;
    transition-duration: 80ms !important;
    transition-delay: 0ms !important;
  }
}
```

This is the global safety net. Surfaces that already use `motion-reduce:transition-none` (Hud, StageSlot, CameraTuneHud) keep their explicit overrides and dominate.

---

## Key Technical Decisions

- **Sheet enter motion lives on the world canvas and sheet body, not on `PageSurface`.** The plain-div `PageSurface` decision in `sheet.tsx:12–33` is preserved. The chrome never remounts on route change; only the *contents* respond to first-open. This sidesteps the world-frame-flash regression risk from PR #3546242 entirely.
- **Sheet stagger only on first-open from the world.** `data-fresh-enter` is set only when entering from a non-sheet route (`/` or `/onboarding`). On sheet→sheet (e.g., Profile → History via side rail), the attribute is **not** set; the body swap is instant. This matches the prior audit's "subtle exit, snappy nav" feel and keeps power-use latency at zero.
- **Stagger is 60ms, not 80ms.** Tighter than the prior audit's 80ms — better adherence to `web-animation-design`'s "≤300ms total" rule. Three slots × 60ms + 200ms body = 380ms perceived enter; if user feedback says too long, drop stagger to 40ms.
- **Capture popup stays center-anchored, not origin-from-fab.** Geometry math to anchor `transform-origin` to the `CaptureFab` location is cost-disproportionate; the Drawer's `translate-y-4 → 0` slide already feels grounded. PR #53 just landed and should not be undone.
- **Tab cross-fade is opacity-only, 120ms.** Power-use surfaces (Profile facet tabs, History timeline/growth) need to feel near-instant. 120ms opacity is the lightest possible cushion. No stagger.
- **Global reduced-motion via `*`-selector `!important`.** The `prefers-reduced-motion` block uses `!important` to dominate Tailwind utilities. Per the `web-animation-design` skill, this is the one place `!important` is acceptable. Surfaces that need to opt out (none today) would do so via `motion-reduce:transition-none` overrides.
- **No new JS animation library.** Tailwind utilities + CSS @theme + Base UI's `data-[starting-style]` cover every case; adding Framer Motion or Motion just to handle stagger is overkill. The two custom keyframes we'll add live in `src/styles.css` alongside `trajectoryMenuIn`.
- **`will-change` policy stays "only on observed stutter"** — the prior audit's rule. We will not preemptively add `will-change: transform` to sheet bodies or tab panels.
- **Press scale standardized at `0.96`.** Some primitives use `0.95`, `0.97`, `0.98`. Normalize to `0.96` across `Button`, `Badge`, side-rail rail buttons, sheet nav buttons. Trajectory's `0.98` stays — it's already tuned for that surface, and the prior audit allows tab-specific overrides.

---

## Implementation Units

### U1. Motion design tokens

**Goal:** Add a small motion token vocabulary to `src/styles.css` `@theme` and keep `--duration-sheet` / `--ease-sheet` as aliases for backward compatibility.

**Requirements:** R1

**Dependencies:** None.

**Files:**

- Modify: `src/styles.css`

**Approach:**

- In the `@theme` block, alongside the existing `--duration-sheet` / `--ease-sheet`, add `--duration-fast: 120ms`, `--duration-base: 200ms`, `--duration-slow: 320ms`, `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`, `--ease: cubic-bezier(0.4, 0, 0.2, 1)`.
- Keep `--duration-sheet` and `--ease-sheet` exactly as they are; document them as aliases (single-line comment).
- Tailwind v4 picks up `@theme` tokens as arbitrary-property utilities — `duration-(--duration-base)` and `ease-(--ease-out)` become available with no extra config. No `tailwind.config.ts` edit required.

**Patterns to follow:** existing token block structure (`--blur-sheet`, `--duration-sheet`, `--ease-sheet`) at `src/styles.css:32–34`.

**Test scenarios:**

- Test expectation: none — pure token addition, no behavior change. Verified by U2–U9 consuming the tokens.

**Verification:**

- `grep -n "duration-base\|duration-fast\|duration-slow\|ease-out\|ease-in-out" src/styles.css` shows the new tokens.
- `pnpm check` passes (no biome / tsc impact expected from a CSS-only change).

---

### U2. Global `prefers-reduced-motion` safety net + interactive primitive press feel

**Goal:** A single global `@media` block in `src/styles.css` caps all transitions and animations at 80ms when reduced motion is requested. `Button` and `Badge` declare `transition-property: transform` to pair with `active:scale-*`.

**Requirements:** R2, R3, R10

**Dependencies:** U1.

**Files:**

- Modify: `src/styles.css`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/badge.tsx`

**Approach:**

- Add a `@media (prefers-reduced-motion: reduce)` block at the end of `src/styles.css` that targets `*, *::before, *::after` with `transition-duration: 80ms !important; animation-duration: 80ms !important; transition-delay: 0ms !important; animation-delay: 0ms !important;`.
- Update `button.tsx` base class to replace `transition-colors active:scale-[0.96]` with `transition-[transform,background-color,color,box-shadow] duration-(--duration-fast) ease-(--ease-out) active:scale-[0.96] motion-reduce:active:scale-100`. The `motion-reduce:active:scale-100` opts out of scale under reduced motion (the global block would still compress duration; this disables transform entirely).
- Update `badge.tsx` base class to `transition-[colors,transform] duration-(--duration-fast) ease-(--ease-out)`. Only add `active:scale-*` if the existing usage warrants — `Badge` is mostly non-interactive; leave as colors+transform property list so future `:active` usage works.

**Technical design:** the `motion-reduce:active:scale-100` pattern is the cleanest way to disable a transform without rewriting the press variant. Tailwind v4 supports it natively.

**Patterns to follow:** `src/components/ui/hud.tsx:38` (the `--duration-sheet` + `--ease-sheet` + `motion-reduce:transition-none` pairing).

**Test scenarios:**

- *Happy path:* Click any `Button` — press scale animates over 120ms with the ease-out curve rather than snapping.
- *Reduced motion:* OS setting `prefers-reduced-motion: reduce` — clicking a `Button` produces no scale; color hover still applies but at ≤80ms.
- *Sheet motion under reduced:* Open Profile (after U3 lands) — world canvas cross-fade compresses to ≤80ms.
- *Edge case:* Double-click — press scale interrupts cleanly without sticking at 0.96 (transition restarts).

**Verification:**

- DevTools → Rendering → Emulate CSS media feature → `prefers-reduced-motion: reduce`. Walk every visible surface; no transition exceeds 80ms.
- `grep -n "transition-colors active:scale\|transition active:scale" src/components/ui/` returns zero results (every active:scale is paired with a transform-bearing property list).

---

### U3. World canvas cross-fade on route enter/exit

**Goal:** The world canvas fades out as the user enters a routed sheet from the world, and fades back in when the user returns. Page-to-page sheet swaps remain instant.

**Requirements:** R4

**Dependencies:** U1, U2.

**Files:**

- Modify: `src/components/student-space/EngineHost.tsx`

**Approach:**

- At `EngineHost.tsx:227–239`, the canvas container currently toggles `pointer-events-none invisible opacity-0` when `!isWorldRoute`. Replace `invisible` with a pure opacity + pointer-events approach so the element stays in the layout tree for the transition:
  - Always: `transition-opacity duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-none`
  - When `!isWorldRoute`: `pointer-events-none opacity-0`
  - When `isWorldRoute`: default `pointer-events-auto opacity-100`
- Keep `aria-hidden={!isWorldRoute}` — accessibility is unchanged.
- Verify: while the canvas opacity is between 0 and 1, the engine `rAF` loop is already paused (`game.setRenderActive(isWorldRoute)` at line 84). The canvas shows the last rendered frame during the fade — desired behavior.
- HMR concern: the inline sky-gradient style (lines 235–237) keeps the gradient alive through HMR; our change doesn't touch that.

**Patterns to follow:** `src/components/ui/hud.tsx:38` (the canonical token + motion-reduce wiring).

**Test scenarios:**

- Covers R4. Open Profile from world: canvas fades out 200ms while Profile's PageSurface appears instantly behind. Close Profile: canvas fades back in 200ms.
- *Sheet → sheet:* Open Profile, then click History via side rail. Canvas stays at opacity 0 throughout. **No flash.**
- *Reduced motion:* OS setting on. Canvas opacity flips effectively instantly (≤80ms).
- *Engine pause:* During the 200ms fade, the engine rAF is paused — no extra GPU cost from the fade itself. Verify by checking Chrome DevTools Performance recording shows no main-thread render activity from the engine during the fade.
- *HMR survival:* Trigger a hot reload while on Profile. Canvas should not flash visible during the reload (it shouldn't have unmounted; opacity stays 0).
- *Edge case:* Click side rail to navigate Profile → History → Profile rapidly. The canvas opacity stays at 0 throughout (never re-fades on sheet→sheet).

**Verification:**

- Side-by-side recording: before (instant snap) vs after (200ms cross-fade) on world → Profile.
- DevTools Performance trace: no frame drops during the cross-fade.

---

### U4. Sheet body content stagger on first open

**Goal:** When opening a routed sheet from the world (not sheet→sheet), the sheet's body content fades in with a 60ms stagger across the three top regions (sidebar identity → page header → body), totaling ≤380ms.

**Requirements:** R5

**Dependencies:** U1, U3.

**Files:**

- Modify: `src/components/ui/sheet.tsx`
- Create: `src/lib/student-space/use-page-enter-state.ts`
- Modify: One representative sheet (`src/components/student-space/sheets/ProfileSheet.tsx`) to use the new attribute; the pattern then applies to the other four sheets via a small follow-up sweep within this unit.

**Approach:**

- Create `use-page-enter-state.ts` hook: tracks the previous pathname via a ref. Returns `'fresh' | 'continuous'`:
  - `'fresh'` when previous pathname was `/`, `/onboarding`, or undefined (first mount).
  - `'continuous'` when previous pathname was another sheet route.
- In `sheet.tsx`, augment `PageSurface` to accept an `entering` prop (default `undefined`). When `entering === 'fresh'`, render with `data-fresh-enter="true"`.
- Add a small CSS block in `src/styles.css` (alongside `trajectoryMenuIn`):
  ```css
  [data-fresh-enter='true'] [data-stagger-slot] {
    opacity: 0;
    animation: pageStaggerIn var(--duration-base) var(--ease-out) forwards;
  }
  [data-fresh-enter='true'] [data-stagger-slot='1'] { animation-delay: 0ms; }
  [data-fresh-enter='true'] [data-stagger-slot='2'] { animation-delay: 60ms; }
  [data-fresh-enter='true'] [data-stagger-slot='3'] { animation-delay: 120ms; }
  @keyframes pageStaggerIn { from { opacity: 0; } to { opacity: 1; } }
  ```
- Update the three layout primitives in `sheet.tsx` (`SheetSidebar`, `SheetPageHeader`, `SheetBody` — find their actual export names in the file) to accept and forward `data-stagger-slot`. Or, simpler: in each sheet's render, attach `data-stagger-slot="1"`, `"2"`, `"3"` to the three top-level regions.
- In `ProfileSheet.tsx`, read `useLocation()` previous-pathname-ref via the new hook and pass `entering={enterState}` to `PageSurface`. Attach `data-stagger-slot` to the three regions.
- Sweep the same change to `HistorySheet.tsx`, `LettersSheet.tsx`, `TrajectorySheet.tsx`, `SettingsSheet.tsx` — purely additive, no behavior change for sheet→sheet.

**Execution note:** Implement the hook + Profile first, screenshot the result, then sweep the other four sheets once the visual is validated.

**Technical design:** the staircase is `[content opacity 0 → 1] × 3` with 60ms offsets. Animation, not transition, because we need a forward-fill on first-render — transitions need a class swap.

**Patterns to follow:** `src/styles.css:108–117` (the `trajectoryMenuIn` keyframe is the precedent for forward-fill animations).

**Test scenarios:**

- Covers R5. Open Profile from world: identity sidebar appears first, page header at 60ms, body at 120ms, total 320ms to fully opaque.
- *Sheet → sheet:* Open Profile → click History. History appears instantly (no stagger). Then go History → Profile: Profile appears instantly. The flag only flips back to `'fresh'` once the user returns to the world.
- *Reduced motion:* Stagger compresses to ≤80ms total per the global block (U2).
- *Edge case — refresh on a sheet route:* Hard-reload at `/profile`. Previous pathname is `undefined`, so stagger fires. Acceptable (first paint).
- *Edge case — deep link:* Open `/profile?facet=interests` directly. Same as refresh — stagger fires once.
- *Tab change within sheet (not a route change):* No stagger; only U5's cross-fade applies.

**Verification:**

- Screen recording: world → Profile shows the 60ms staircase. Profile → History shows no stagger.
- Console: no React warnings about hook ordering, ref instability, or `useSyncExternalStore` snapshot churn.

---

### U5. Tab content cross-fade in Profile, History, Trajectory

**Goal:** When the user switches tabs inside Profile (facets), History (timeline/growth/letters), or Trajectory (pathways), the body panel cross-fades opacity over 120ms.

**Requirements:** R6

**Dependencies:** U1.

**Files:**

- Modify: `src/components/student-space/sheets/ProfileSheet.tsx`
- Modify: `src/components/student-space/sheets/HistorySheet.tsx`
- Modify: `src/components/student-space/sheets/TrajectorySheet.tsx`

**Approach:**

- In each sheet, identify the content panel that swaps on tab change. For Trajectory, it's the panel below the pathway tabs at line ~716 with `key={selectedIndex}`.
- Wrap (or modify) the content container with `<div key={tabKey} className="transition-opacity duration-[120ms] ease-(--ease) motion-reduce:transition-none">`. The `key` forces remount; the `transition-opacity` would not fire on a key-swap remount because `opacity: 1` is the starting style.
- Use a CSS keyframe instead (mirroring U4) for the cross-fade-on-tab-change:
  ```css
  [data-tab-content] {
    animation: tabCrossfade 120ms var(--ease) both;
  }
  @keyframes tabCrossfade { from { opacity: 0; } to { opacity: 1; } }
  ```
- Attach `data-tab-content` to the keyed wrapper in each sheet.
- Tab indicator (the underline / pill highlight) stays on its existing `transition-colors duration-150` — instant feel.

**Patterns to follow:** the `trajectoryMenuIn` keyframe precedent (`src/styles.css:108–117`).

**Test scenarios:**

- Covers R6. In Profile, click Interests → Personality → Skills. Body panel fades over 120ms each time.
- In History, switch timeline ↔ growth. Body fades.
- In Trajectory, switch pathways via the pathway tabs at `TrajectorySheet.tsx:672`. Body fades.
- *Tab indicator:* The selected-state highlight on the tab itself stays instant (no fade).
- *Reduced motion:* Cross-fade compresses to ≤80ms (effectively instant).
- *Edge case — same tab clicked twice:* No animation (same key, no remount).

**Verification:**

- Screen recording: tab switches in all three sheets show the 120ms cushion.
- Performance check: no layout thrash; opacity-only animation runs on the compositor.

---

### U6. Capture chooser enter motion

**Goal:** `CaptureChooser` opens with a real enter: backdrop fades, card slides up + fades in. Exit reverses.

**Requirements:** R7

**Dependencies:** U1, U2.

**Files:**

- Modify: `src/components/student-space/capture/CaptureChooser.tsx`

**Approach:**

- Replace the hand-rolled conditional render with a Base UI `Dialog.Root` controlled by `overlay.activeChooser`. The backdrop and popup get `data-starting-style` / `data-ending-style` classes mirroring `Drawer`'s pattern (`src/components/ui/drawer.tsx:21–63`).
- Backdrop: `transition-opacity duration-(--duration-base) ease-(--ease-out) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none`.
- Card popup: `transition-transform transition-opacity duration-(--duration-base) ease-(--ease-out) data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0 motion-reduce:transition-none`.
- Move the existing escape-handler + focus-management to Base UI's built-ins (it handles both, removing 15 lines of effect code).
- Card buttons keep their `transition-[transform,box-shadow] duration-150 hover:-translate-y-1` (line 84) — already token-aligned post-U1 if you swap `duration-150` to `duration-(--duration-fast)`. Apply that swap here.

**Technical design:** `CaptureChooser` becomes structurally parallel to `Drawer`'s `popup` variant. The visual treatment (bottom-anchored card, dark overlay) stays identical to what shipped in PR #53 — only the motion changes.

**Patterns to follow:** `src/components/ui/drawer.tsx:21–63` (the `popup` variant is the direct analog).

**Test scenarios:**

- Covers R7. Click `CaptureFab` → chooser backdrop fades in over 200ms, card slides up from `translate-y-4` + opacity 0 → 0, 0 over 200ms ease-out. Feels grounded.
- Close via backdrop tap: reverse over 160ms (Base UI default for ending-style — verify and tune if it feels off).
- Close via Escape: same exit motion.
- Open chooser → open Ask sheet (via card tap): chooser closes with exit motion, Ask drawer opens with its own enter. No motion conflict — they're sequenced.
- *Reduced motion:* No slide; opacity-only fade compressed to ≤80ms.
- *Edge case — open during onboarding:* `CaptureChooser` should not be reachable during onboarding (CaptureFab hidden), but if it ever is, the motion shouldn't break anything.

**Verification:**

- Screen recording: tap CaptureFab → chooser appears with slide+fade. Tap backdrop → chooser exits.
- Compare side-by-side with current behavior (instant pop-in vs new slide).

---

### U7. Onboarding cross-step crossfade

**Goal:** `OnboardingFlow.StageSlot` actually crossfades between stages — not just paints `opacity-100` and lies.

**Requirements:** R8, R11

**Dependencies:** U1.

**Files:**

- Modify: `src/components/student-space/onboarding/OnboardingFlow.tsx`

**Approach:**

- Rewrite `StageSlot` (`OnboardingFlow.tsx:303–313`) to layer two slots: outgoing (positioned absolute, fading out 200ms) and incoming (fading in 320ms with 80ms delay). Pseudo-shape (directional, not literal):
  ```text
  function StageSlot({ stage, children }) {
    const previousStage = usePrevious(stage);
    // Render outgoing only briefly: keep it mounted until 200ms after stage change
    // Two layered slots, both positioned absolute inset-0
    // Outgoing: opacity-0 from opacity-100 over 200ms
    // Incoming: opacity-100 from opacity-0 over 320ms with 80ms delay
  }
  ```
- The per-stage `visible` ramps inside `EdupassLogin`, `Greeting`, `EggHatcher`, etc. stay untouched — they handle the "I'm ready to be looked at" moment within a stage. `StageSlot` provides the *between*-stage crossfade.
- **Critical: do not regress Kira pre-land invisibility.** The Kira reveal happens *inside* the FirstChat stage, not at the StageSlot boundary. Crossfading StageSlot does not affect the Kira `group.visible` toggle in the engine. Verify by reading `Kira.setOnboardingMode(true/false)` callers — they're in the engine, not in StageSlot.
- Reduce-motion: `motion-reduce:duration-[80ms]` on both fades — already present in the current StageSlot, keep it.

**Execution note:** Test cold-onboarding flow (cleared `localStorage.onboarding`) before and after to verify no Kira flash regression. Capture both as short GIFs for the audit folder.

**Patterns to follow:** the per-stage `visible` ramp pattern in `EdupassLogin.tsx:144` (one-tick delay → opacity-100) is the template for "intentional reveal moment", which the new StageSlot won't replace, only complement.

**Test scenarios:**

- Covers R8. Walk cold onboarding (Login → Greeting → EggHatcher → FirstChat → FirstMood → IslandReveal). Each step crossfades over ~320ms perceived total (with 80ms overlap).
- Covers R11. **Kira pre-land:** in FirstChat, Kira still doesn't appear until `flyTo` begins. Confirm via cold-onboarding screen capture.
- *Reduced motion:* All transitions ≤80ms.
- *Skip onboarding:* `SkipButton` jumps to the world — no motion conflict; StageSlot is unmounted with the rest of OnboardingFlow.
- *Resume:* Refresh mid-onboarding. The current stage paints; no crossfade needed (no previous stage in this session).
- *Edge case — rapid stage change (dev tool):* Stage advances faster than 200ms. Outgoing slot is dropped mid-fade; visual is acceptable (no stuck slot).

**Verification:**

- GIF: cold onboarding flow showing smooth crossfades.
- GIF: cold onboarding showing **no** Kira pre-land flash.
- Compare against the prior audit's `docs/audit/2026-05-20-e2e-walk-screenshots/01-cold-onboarding-*.png` family (the Kira contract reference).

---

### U8. Anti-pattern sweep — `transition: all` removal

**Goal:** Every `transition` (shorthand) or `transition-all` across React surfaces is replaced with an explicit property list. Tokens applied where applicable.

**Requirements:** R9, R10

**Dependencies:** U1.

**Files:**

- Modify: `src/components/student-space/world/WorldInteractions.tsx` (lines 1543, 1564, 1609, 1654, 1708 and the trailing CTA buttons around lines 1719, 1728, 1735)
- Modify: `src/components/DevPalette.tsx` (line 186)
- Modify: `src/components/ui/alert-dialog.tsx` (line 38)
- Modify: `src/components/ui/dialog.tsx` (line 43)

**Approach:**

- For each occurrence:
  - `transition duration-N` (bare) → `transition-[opacity,transform] duration-(--duration-...) ease-(--ease-out)`. The shorthand was always animating only `opacity` and `transform` in practice (these are the only properties changing on the same element); make that explicit.
  - `transition-all duration-200 ease-out` → `transition-[opacity,transform,background-color] duration-(--duration-base) ease-(--ease-out)`.
- Add `motion-reduce:transition-none` to each overlay that wasn't already covered by the global block — defensive, since these are world-overlay surfaces that should be quiet under reduced motion.
- Verify the visual is unchanged with the explicit property list. The shorthand was implicitly animating all changing properties; if any surface had an unintended property change (e.g., font-weight) animating, it would now snap — that's the correct outcome but worth a spot-check.

**Patterns to follow:** `src/components/ui/hud.tsx:38` for the canonical pattern.

**Test scenarios:**

- Covers R9. `grep -rn "transition: all\|transition-all\|className=\"[^\"]*\\btransition\\b[^-]" src/components/ src/lib/` returns no React-source matches.
- *World overlays — KiraBubble:* Bird speech bubble opens/closes with opacity + scale, no other property morphs.
- *NarratorPanel:* Slides up + fades, same as before.
- *HoverCtaChip:* Opens with translate-y + opacity, same as before.
- *DevPalette / AlertDialog / Dialog:* Open/close motion unchanged perceptually.
- *Reduced motion:* All overlays compress.

**Verification:**

- Grep clean.
- Manual spot-check of each surface (open & close).

---

### U9. Side rail + nav-button polish

**Goal:** Side rail rail buttons, tooltip reveal, and `SheetNavButton` use the new tokens and have explicit transition properties.

**Requirements:** R3, R12

**Dependencies:** U1, U2.

**Files:**

- Modify: `src/components/student-space/navigation/SideRail.tsx`
- Modify: `src/components/ui/sheet.tsx` (the `SheetNavButton` at line ~201)

**Approach:**

- In `SideRail.tsx`, `RailButton` already has an explicit property list (`transition-[transform,background-color,border-color,color,box-shadow]`) but no duration / easing. Add `duration-(--duration-fast) ease-(--ease-out)`.
- Tooltip label (the `group-hover:opacity-100 group-hover:translate-x-0` span at line ~178) currently uses bare `transition`. Replace with `transition-[opacity,transform] duration-(--duration-fast) ease-(--ease-out)`.
- In `sheet.tsx`, `SheetNavButton` uses `transition-colors`. Augment to `transition-[colors,transform,background-color] duration-(--duration-fast) ease-(--ease-out) active:scale-[0.96] motion-reduce:active:scale-100`. Adds press feedback consistent with `Button`.
- `PageCloseButton` (sheet.tsx:73) — same treatment: add explicit property list with `--duration-fast` and `--ease-out`.

**Patterns to follow:** `Button` post-U2 is the reference primitive.

**Test scenarios:**

- Covers R12. Hover side rail button: scale + tooltip slide+fade over 120ms ease-out.
- Click a side rail button: press scale animates (no snap).
- *Active state* (currently on this route): unchanged visual, just the data attribute swap that already works.
- *Tooltip on focus-visible* (keyboard): same motion as hover.
- *Reduced motion:* press scale disabled; opacity still fades but ≤80ms.

**Verification:**

- Screen recording: side rail hover + click + keyboard focus all feel responsive without snapping.

---

## System-Wide Impact

- **Interaction graph:** The world canvas now stays in the layout tree at opacity 0 instead of `invisible`. Verify nothing else in `EngineHost.tsx` or downstream effects keyed off `visibility: hidden` for the canvas. (Quick scan: `pointer-events-none` plus `aria-hidden` is the load-bearing accessibility/click hygiene; opacity is purely visual.)
- **Error propagation:** Replacing `CaptureChooser`'s hand-rolled escape handler with Base UI's built-in removes ~15 lines of effect code. Verify the existing `overlay.setActiveChooser(false)` callback still fires (Base UI calls `onOpenChange`).
- **State lifecycle risks:** The `usePageEnterState()` hook tracks previous pathname via a ref. Cold mount (refresh on a sheet route) returns `'fresh'` — desired. Verify no SSR hydration mismatch by using `useLayoutEffect` if needed, or by reading `location.pathname` from TanStack Router's loader during SSR.
- **API surface parity:** None changed. All changes are CSS / Tailwind class-list / Base UI wiring. No public exports added or removed.
- **Integration coverage:** The motion-reduce `@media` block is global. Existing surfaces using `motion-reduce:transition-none` (Hud, StageSlot, CameraTuneHud) keep their explicit overrides and continue to dominate where they declare them.
- **Unchanged invariants:**
  - `PageSurface` plain-div decision (`sheet.tsx:12–33`) — preserved.
  - Sheet-chrome contract (`docs/sheet-chrome-contract.md`) — preserved.
  - Kira pre-land invisibility — preserved (verified in U7 verification).
  - Engine substrate motion (`src/engine/student-space/style.css`) — untouched.
  - `OverlayController.js` imperative bridge — untouched (capture overlays still flow through it for engine-side callers).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| World-frame flash regression on sheet→sheet | U3 only changes the canvas opacity transition; sheet→sheet keeps canvas at opacity 0 throughout. Verified in U3 test scenarios. |
| Kira pre-land flash regression in U7 | U7 explicitly keeps Kira visibility outside StageSlot. Cold-onboarding GIF check is part of verification. |
| Stagger feels slow on Profile (a frequent surface) | 60ms × 3 + 200ms = 380ms perceived. If user feedback is "too long", drop stagger to 40ms (`web-animation-design`'s rule allows micro-tuning). |
| `motion-reduce` global block uses `!important` and might surprise developers | Document the policy at the top of the `@media` block in styles.css. Devs needing exceptions use `motion-reduce:transition-none` overrides at the class level (the variants take precedence). |
| Base UI `data-[ending-style]` exit timing varies between popup and dialog | U6 verification compares chooser exit perceptually with the existing Drawer exit; tune duration if needed. |
| Tab cross-fade adds 120ms to Profile facet switches (power-use surface) | 120ms is intentionally fast. If still too slow, drop to 80ms — but anything below feels jarring per `web-animation-design`. |
| `usePageEnterState` SSR hydration mismatch | Use a ref-based pattern that doesn't read pathname during render; only on commit. Verify hydration warnings absent in dev console. |
| Global `*` selector reduced-motion block hurts engine rAF animations | The block targets *CSS* transitions/animations, not JS-driven Three.js rAF. Engine motion under reduced-motion is governed by the existing engine `style.css` blocks, which stay. |

---

## Documentation / Operational Notes

- Add a short policy block at the top of the `@media (prefers-reduced-motion: reduce)` section in `src/styles.css` documenting the contract: "Any transition or animation declared in user code is capped at 80ms here. Override with `motion-reduce:transition-none` or equivalent only when the motion is critical to comprehension."
- Add a sentence to `CLAUDE.md` under a new "Motion" sub-bullet in the "Engine view architecture" section: *Motion tokens (`--duration-*`, `--ease-*`) live in `src/styles.css` `@theme`. Use `--ease-out` for enters/exits, `--ease-in-out` for on-screen movement, `--ease` for hover/color. All transitions ≥200ms are auto-capped at 80ms under `prefers-reduced-motion: reduce`.*
- After landing, capture a short demo reel of the end-to-end flow (world → sheet → tab switch → capture → onboarding) as a GIF and attach to the PR description.

---

## Sources & References

- Skill: `web-animation-design` (Emil Kowalski / animations.dev) — easing decision tree, duration guidelines, reduced-motion handling, GPU acceleration policy.
- Prior plan: `docs/plans/2026-05-20-002-refactor-e2e-ux-motion-audit-plan.md` — motion contract codification (carry forward).
- Prior audit findings: `docs/audit/audit-findings.md` — `cubic-bezier(0.22, 1, 0.36, 1)`, 60ms stagger, scale(0.96) press standard.
- Prior PR: PR #3546242 (`fix(navigation): eliminate world-frame flash between routed sheet transitions`) — the trade we're preserving.
- Prior PR: PR #53 (`feat(student-space): capture popup redesign + profile/history UI overhaul`) — the Drawer pattern reference.
- Prior PR: PR #38 (`style(trajectory): polish TrajectorySheet typography + button motion`) — Trajectory tab motion reference.
- Project doc: `docs/sheet-chrome-contract.md` — visual treatment contract (motion changes preserve it).
- Repo CLAUDE.md — engine view architecture, sheet primitive, design tokens.
