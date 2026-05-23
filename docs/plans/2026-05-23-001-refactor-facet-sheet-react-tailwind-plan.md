---
title: "refactor: Migrate engine half-sheet FacetView to React + Tailwind"
status: active
created: 2026-05-23
type: refactor
depth: standard
---

# Summary

Replace the last engine-owned DOM surface on the `/` world scene — the half-sheet card that opens when the player hovers or clicks an in-world tree, flower, or fruit — with a React + Tailwind component fronted by a controller bridge that mirrors `ObjectPeekController`. The card is currently built by `src/engine/student-space/Game/View/FacetView.js` (~526 lines of imperative `document.createElement` + `innerHTML`) and styled by `.half-sheet*` rules in `src/engine/student-space/style.css`. After this refactor, the imperative API on `view.facetView` (`.openFor(target)`, `.close()`, `.isOpen`) is preserved so the six call sites in `src/components/student-space/world/WorldInteractions.tsx` continue to work, but the rendering is owned by `<FacetSheetCard />` mounted under that same host alongside `ObjectPeekPopover` and `ObjectPickupPanel`.

This is the gap left by the completed `docs/plans/2026-05-22-001-refactor-full-dom-react-tailwind-migration-plan.md`, which mis-classified `FacetView.js` as Three.js scene content and left it untouched. The migration is a 1:1 visual and behavioral parity replacement — copy, facet theming (accent/soft/ink), the half↔full expansion gesture, scrim, close button, Escape, ArrowUp/ArrowDown, and the imperative seam are all preserved.

---

# Problem Frame

`src/engine/student-space/Game/View/FacetView.js` is the last sheet-shaped DOM surface inside the engine. Every other sheet was migrated by the May 22 plan, but FacetView was incorrectly listed under "Three.js scene content and shaders are untouched" on line 52 of that plan (and again on line 1258), so its implementation was preserved while its CSS (`.half-sheet*` block in `src/engine/student-space/style.css`, ~lines 383–664) was scheduled for removal in a later sweep that never happened.

This violates the repo guardrail in `CLAUDE.md`: *"DOM surfaces are React + Tailwind v4. New UI belongs in React + Tailwind — do not add per-surface DOM CSS [in the engine style.css]."* It also keeps a parallel rendering universe alive: imperative class with its own `dispose()`, its own document-level `keydown` listener, its own `--facet-*` CSS variable seeds in the engine stylesheet (which the recent HMR fix at commit `e6fff905` flagged as a hidden DX hazard — engine-stylesheet HMR swaps drop those variable defaults briefly).

The card itself is straightforward: an eyebrow ("WHAT PULLS YOUR ATTENTION" / "WHAT YOU'RE GETTING GOOD AT"), a colored facet pill ("Interests" / "Skills"), a claim title ("Conventional" / "Leadership"), a subtitle, two `vips-row` lines (Most common / Quietly emerging), a detail block with claim description and a bento `"1 noticing · '…quote…'"` line, and a CTA that opens `/profile/$tab`. It has two visual states — half-sheet (default) and a full-sheet expansion (`is-full`, 92vh) — toggled by a drag handle, by clicking the handle, or by ArrowUp/ArrowDown. Escape closes; a click on the scrim closes.

The replacement does not change copy, layout, or behavior. It moves rendering to React + Tailwind, moves facet CSS variable seeds to `@theme` in `src/styles.css` (HMR-safe), and threads the imperative API through a controller class that mirrors the existing `ObjectPeekController` pattern.

---

# Goals

- `FacetView.js` is deleted; its half-sheet rendering is owned by `<FacetSheetCard />` at `src/components/student-space/world/FacetSheetCard.tsx`.
- The `.half-sheet*` CSS block in `src/engine/student-space/style.css` is deleted (~280 lines).
- `--facet-accent`, `--facet-soft`, `--facet-ink` seed defaults live in `@theme` in `src/styles.css`, with per-instance overrides applied via React inline `style={{ '--facet-accent': … }}` on the card root — same shape as the `e6fff905` HMR fix for `--sky-*`.
- The imperative API stays intact: `view.facetView.openFor(target)`, `view.facetView.close()`, `view.facetView.isOpen` all behave identically from the six call sites in `WorldInteractions.tsx`.
- HMR-safe controller registration mirrors `ObjectPeekController`: assigned/nulled symmetrically inside the same boot `useEffect`, with the identity-check guard (`if (view.facetView === controllersRef.current.facetSheet) view.facetView = null`).
- The `rankClaims` helper is extracted from both engine-private (`FacetView.js:140–182`) and TS-private (`ProfileSheet.tsx:1461–1478`) implementations into a shared `src/lib/student-space/rank-claims.ts`; ProfileSheet is updated to consume it.
- `VIPS_BY_FACET` and `claimLabel` are added to the ambient declarations at `src/components/student-space/world/engine-view-modules.d.ts` so React can type-safely import from `~/engine/student-space/Game/Data/vipsTaxonomy.js`.
- `data-facet-sheet` attribute is added to the new card root, and the click-outside selector in `ObjectPeekController._onDocPointerDown` includes it so clicks inside the facet sheet don't dismiss adjacent overlays.

---

# Non-Goals

- No copy changes, layout redesign, or behavior changes. This is a parity replacement.
- No new Drawer/Sheet primitive in `src/components/ui/`. The existing `src/components/ui/drawer.tsx` is fixed at `h-[82vh]` and does not support the half↔full expansion this card needs; the new card is hand-rolled on `@base-ui-components/react/dialog` directly, matching the `ObjectPickupPanel` precedent.
- No migration of `ObjectPeekPopover` or `ObjectPickupPanel` — both already React + Tailwind.
- No touching of routed sheets (`ProfileSheet`, `HistorySheet`, `LettersSheet`, `TrajectorySheet`, `SettingsSheet`) beyond `ProfileSheet` consuming the extracted `rankClaims` helper.
- No broader sweep of `src/engine/student-space/style.css` — only the `.half-sheet*` block and any other rules that exclusively serve `FacetView`. The Three.js substrate and frame styles stay.
- No `useSyncExternalStore` migration; `useEngineSliceVersion` remains the seam per `docs/solutions/2026-05-18-island-progression-engine-substrate.md`.

---

# Requirements Traceability

- **R1.** `view.facetView.openFor(target)`, `view.facetView.close()`, `view.facetView.isOpen` continue to behave identically from `WorldInteractions.tsx:586, 653–655, 860, 967, 1357`. (Verified by U5, U6.)
- **R2.** Visual parity with current FacetView: eyebrow, pill, title, subtitle, vips-rows (Most common / Quietly emerging), detail title/body, bento line, CTA. (Verified by U4, manual smoke.)
- **R3.** Half↔full expansion gesture: drag handle, click handle, ArrowUp/ArrowDown all toggle `is-full` mode. (Verified by U4.)
- **R4.** Facet theming via `--facet-accent` / `--facet-soft` / `--facet-ink` survives engine-stylesheet HMR (per commit `e6fff905` precedent). (Verified by U1.)
- **R5.** HMR / StrictMode double-mount does not orphan `view.facetView` against a torn-down controller. (Verified by U5.)
- **R6.** Click inside the facet sheet does not dismiss it via `ObjectPeekController._onDocPointerDown`. (Verified by U5.)
- **R7.** No regressions in existing tests (`test/engine/HoverProbe.performance.test.ts`, `test/engine/student-space-element-evidence.test.ts`, `test/lib/profile-tokens.test.ts`).
- **R8.** Engine `style.css` shrinks by the `.half-sheet*` block; `src/styles.css` `@theme` gains the seed `--facet-*` defaults.

---

# Key Technical Decisions

**Hand-rolled `Dialog.Root modal={false}` over `<Drawer>` or `<Sheet>`.** `src/components/ui/sheet.tsx` is shaped for routed full-viewport two-pane pages (`SheetSurface` requires a `SheetSidebar` + `SheetContent` pair). `src/components/ui/drawer.tsx` is hard-coded to `h-[82vh]` and does not support the half↔full expansion. Both `ObjectPeekPopover` and `ObjectPickupPanel` use hand-rolled `<div role="dialog">` already; the new card adds Base UI's `Dialog.Root modal={false}` wrapper to inherit focus trap + Escape semantics for free, with `Dialog.Backdrop` for the scrim and `Dialog.Popup` for the sheet surface.

**Controller class lives in `WorldInteractions.tsx`, alongside `ObjectPeekController`.** The card lives in its own file (`FacetSheetCard.tsx`, per user confirmation), but the controller class is co-located with the existing controllers so the single boot `useEffect` at `WorldInteractions.tsx:282–352` owns all of them. This matches the established pattern (`ObjectPeekController`, `HoverCtaController`, `HoverProbeController` all live there) and means there's exactly one cleanup path to reason about during HMR.

**Facet CSS variable seeds in `@theme` (`src/styles.css`), per-instance overrides via React inline `style={}`.** This is the shape commit `e6fff905` (#42) applied to `--sky-*` after engine-stylesheet HMR swaps caused brief flashes of the unstyled state. Same fix here: seed defaults survive HMR; per-target overrides come from `PROFILE_COLORS[facetId]` via a `facetThemeVars()` helper in `FacetSheetCard.tsx`, mirroring `ProfileSheet`'s `profileThemeVars(tab)` at `ProfileSheet.tsx:1453–1458`.

**Shared `rankClaims` extracted to `src/lib/student-space/rank-claims.ts`.** The engine version (`FacetView.js:140–182`, signature `(facetId, profile)`) and the ProfileSheet version (`ProfileSheet.tsx:1461–1478`, signature `(claims, counts)`) do the same work. Adopt ProfileSheet's signature (cleaner, no engine-profile coupling), let the new card and ProfileSheet share it, and let the engine version retire with `FacetView.js`.

**Imperative `view.facetView` shape preserved verbatim.** Six call sites in `WorldInteractions.tsx` rely on `view.facetView?.isOpen`, `view.facetView?.close()`, and `view.facetView.openFor(target)`. Keeping that surface lets U7 land as a pure delete-and-rewire change with zero callsite edits beyond removing the engine-side construction in `View.js`.

**Use `useEngineSliceVersion`, not `useSyncExternalStore`.** Per `docs/solutions/2026-05-18-island-progression-engine-substrate.md`, the version-bump hook is the seam for engine slice reads. The card's body content reads from `state.profile` via `resolveElementEvidence` — if any of that needs to react to live engine mutations (e.g., a new noticing landing while the card is open), it goes through this hook.

---

# Implementation Units

### U1. Promote facet CSS variables to `@theme` and remove engine-stylesheet seeds

**Goal:** Move `--facet-accent`, `--facet-soft`, `--facet-ink` seed defaults from `src/engine/student-space/style.css` (where the `.half-sheet*` block currently relies on them via `root.style.setProperty(...)` in `FacetView.js:312–314`) into `@theme` in `src/styles.css`, so HMR stylesheet swaps don't drop them. Apply the same shape as commit `e6fff905`.

**Requirements:** R4, R8

**Dependencies:** none

**Files:**
- Modify: `src/styles.css` — add `--color-facet-accent`, `--color-facet-soft`, `--color-facet-ink` (or `--facet-accent` / `--facet-soft` / `--facet-ink` without the `color-` prefix; match the convention of nearby tokens) inside the existing `@theme` block.
- Modify: `src/engine/student-space/Game/View/facets.js` — remove `applyFacetVars(el, facetId)` if it has no remaining consumers after U7. Verify with grep first.
- Verify: no other engine consumer reads the `--facet-*` vars from `:root`.

**Approach:** Seed the variables once in `@theme`. The new FacetSheetCard (U4) reads `PROFILE_COLORS[facetId]` and writes per-instance overrides via `style={{ '--facet-accent': … }}` on the card root — same pattern as `profileThemeVars(tab)` in `ProfileSheet.tsx:1453–1458`. The engine no longer touches these vars.

**Patterns to follow:**
- Commit `e6fff905` (#42) — `--sky-*` variables promoted to `@theme` to survive HMR.
- `ProfileSheet.tsx:1453–1458` `profileThemeVars(tab)` — React-side helper that returns a `style` object with CSS variable overrides.

**Test scenarios:**
- `test/lib/profile-tokens.test.ts` continues to pass (no token value changes, only declaration site moves).
- Manual: open the card for each facet (values, interests, skills, presentation) in dev with HMR triggered by editing `style.css`; verify no white flash of unstyled state.
- Test expectation: no new test file. The drift gate covers the data; behavior is verified manually post-U5.

**Verification:** Edit `src/engine/student-space/style.css` to force HMR while a card is open (in U5+) and confirm the facet accent color does not blink white. `grep -rn '--facet-' src/engine` after U7 returns no matches.

### U2. Extract `rankClaims` to a shared helper

**Goal:** Single source of truth for ranking facet claims into Most common / Quietly emerging buckets. Replace both the engine-private implementation in `FacetView.js:140–182` and the TS-private one in `ProfileSheet.tsx:1461–1478` with one helper.

**Requirements:** R2

**Dependencies:** none

**Files:**
- Create: `src/lib/student-space/rank-claims.ts` — `rankClaims(claims, counts)` returning `{ mostCommon, quietlyEmerging }`. Use ProfileSheet's signature (claims + counts as plain inputs; no engine-profile coupling).
- Create: `src/lib/student-space/rank-claims.test.ts` — unit tests, see scenarios below.
- Modify: `src/components/student-space/sheets/ProfileSheet.tsx` — replace local `rankClaims` (lines 1461–1478) with the import.

**Approach:** Match ProfileSheet's algorithm shape (the current engine version's two-bucket / "no quotes yet" handling is the same intent expressed differently). Default to the ProfileSheet implementation if they disagree on edge cases — the React side is the surface we're keeping.

**Patterns to follow:**
- `src/lib/student-space/use-engine-slice-version.ts` — module shape, file header conventions.
- `ProfileSheet.tsx:1461–1478` — existing implementation.

**Test scenarios:**
- Happy path: 5 claims with varying counts → top-2 land in `mostCommon`, next 2 in `quietlyEmerging`, rest dropped (or whatever the current ProfileSheet algorithm actually does — read it first and document).
- Tie-breaking: claims with equal counts → deterministic ordering by claim ID alphabetically (or whatever the existing code does; preserve it).
- Empty inputs: `[]` claims → both buckets empty, no throw.
- Missing counts: claims with no entry in `counts` → treated as 0.
- Single claim: lands in `mostCommon`, `quietlyEmerging` empty.

**Verification:** `pnpm test src/lib/student-space/rank-claims.test.ts` passes. `pnpm check` passes after ProfileSheet refactor.

### U3. Add `VIPS_BY_FACET` and `claimLabel` to ambient engine module declarations

**Goal:** Let React-side TypeScript code import these helpers from `~/engine/student-space/Game/Data/vipsTaxonomy.js` without `any` casts.

**Requirements:** R2

**Dependencies:** none (can run in parallel with U1, U2)

**Files:**
- Modify: `src/components/student-space/world/engine-view-modules.d.ts` — add module declarations matching the existing entries (lines 11–14 for `elementEvidence`). The new declarations:
  - `VIPS_BY_FACET: Record<string, Array<{ id: string; label: string; … }>>` (match the actual shape in `vipsTaxonomy.js:195–209`).
  - `claimLabel: (claimId: string) => string`.

**Approach:** Read `vipsTaxonomy.js:193–209` first to confirm the runtime shape; mirror it in the .d.ts. Keep the declarations narrow — only what the new card consumes.

**Patterns to follow:**
- `src/components/student-space/world/engine-view-modules.d.ts:11–14` — existing `elementEvidence` declarations.

**Test scenarios:** Test expectation: none — pure type declaration with no runtime behavior. Verified by `pnpm check` (`tsc --noEmit`) in U4 when FacetSheetCard imports these symbols.

**Verification:** `pnpm check` passes after U4 lands.

### U4. Build `FacetSheetCard.tsx` (React + Tailwind component, full visual + behavioral parity)

**Goal:** A `<FacetSheetCard state={…} onClose={…} onOpenProfile={…} onToggleFull={…} />` component that renders the same visual and supports the same interactions as the current `.half-sheet`. State is owned by the controller (U5); this component is purely presentational + interaction.

**Requirements:** R2, R3, R4

**Dependencies:** U1 (CSS var seeds), U2 (rankClaims), U3 (ambient types)

**Files:**
- Create: `src/components/student-space/world/FacetSheetCard.tsx` — the React component.
- Create: `test/components/student-space/world/facet-sheet-card.test.tsx` — RTL + Vitest, scenarios below.

**Approach:**
- Wrap in `Dialog.Root modal={false}` from `@base-ui-components/react/dialog` — inherits focus trap and Escape handling.
- `Dialog.Backdrop` renders the scrim with the same opacity ramp as the current `.half-sheet__scrim` (light + heavy variants for half vs full).
- `Dialog.Popup` is the sheet surface. Bottom-anchored, `fixed inset-x-0 bottom-0`, with `height` switching between half (~50vh) and full (92vh) on `state.isFull`.
- Use `Dialog.Popup`'s data-state attributes (`data-[starting-style]`, `data-[ending-style]`) for enter/exit motion. Match the timing token (`duration-(--duration-sheet) ease-(--ease-sheet)`) used by the routed Sheet primitive.
- Header: eyebrow + tag pill + title + subtitle. Tag pill background is `style={{ background: var(--facet-soft), color: var(--facet-ink) }}`.
- Two `vips-row` items: "Most common" / "Quietly emerging". Bodies populated by `rankClaims()` output.
- Detail block: claim title (text color `var(--facet-ink)`), description body, and bento `"1 noticing · '…quote…'"` line from `latestEvidenceLine(evidence, 96)`.
- CTA: bottom-right rounded button, `onClick={onOpenProfile}`, routes to `/profile/$tab` via TanStack Router's `Link` or imperative `navigate()`.
- Handle bar at top: two angled `<span>`s (`half-sheet__handle-bar--l` / `--r`); pointer-drag with `useRef`-mutated transforms (keep React out of the per-frame hot path per `use-world-position` doctrine); release threshold flips `isFull` via `onToggleFull`.
- Keyboard parity: ArrowUp / ArrowDown when Dialog content has focus → `onToggleFull`. Attach via `onKeyDown` on the `Dialog.Popup`, not document — Base UI's Dialog already owns focus; let it.
- Apply `data-facet-sheet` attribute on the Popup root for U5's click-outside selector update.
- `facetThemeVars(facetId)` helper inside this file returns the inline `style={{ '--facet-accent': …, '--facet-soft': …, '--facet-ink': … }}` object — reads `PROFILE_COLORS` from `~/lib/profile-tokens`.

**Patterns to follow:**
- `WorldInteractions.tsx:1654–1687` `ObjectPeekPopover` — Tailwind class conventions, motion patterns, z-index choices (z-[56]/[58]).
- `WorldInteractions.tsx:1689–1742` `ObjectPickupPanel` — bottom-anchored overlay shape, close button, CTA buttons.
- `ProfileSheet.tsx:1453–1458` `profileThemeVars(tab)` — CSS variable override helper.
- `src/components/ui/drawer.tsx` — Base UI Dialog wrap-and-style pattern (do not import Drawer; just borrow the shape).

**Test scenarios:**
- Renders eyebrow, pill, title, subtitle when `state.open === true` with a values-facet target.
- Renders the same with an interests-facet target (different theme colors applied via inline style).
- Renders "1 noticing · '…'" line when evidence has one quote; renders "No noticings have landed here yet" when evidence is empty.
- Renders `mostCommon` / `quietlyEmerging` rows correctly given a `rankClaims` output.
- Click on close button calls `onClose`.
- Click on scrim calls `onClose`.
- Press Escape calls `onClose`.
- Press ArrowUp / ArrowDown calls `onToggleFull`.
- Click on handle calls `onToggleFull`.
- Returns `null` (no portal mount) when `state.open === false`.
- Applies `--facet-accent` inline style matching `PROFILE_COLORS[facetId].accent`.
- `data-facet-sheet` attribute is present on the Popup root.

**Verification:** Component test file passes; visual smoke in dev (`pnpm dev`) once U5 wires the controller.

### U5. Wire `FacetSheetController` in `WorldInteractions.tsx` and render `<FacetSheetCard />`

**Goal:** Mirror `ObjectPeekController` exactly. Register `view.facetView = controller`, set React state from `openFor()` / `close()`, expose `isOpen` getter. Add `<FacetSheetCard />` to the JSX. Update the click-outside selector to recognize `data-facet-sheet`.

**Requirements:** R1, R5, R6

**Dependencies:** U4 (the card component)

**Files:**
- Modify: `src/components/student-space/world/WorldInteractions.tsx`:
  - Add `FacetSheetState` type alongside `ObjectPeekState` (~line 213).
  - Add `INITIAL_FACET_SHEET` alongside `INITIAL_OBJECT_PEEK` (~line 244).
  - Add `useState<FacetSheetState>(INITIAL_FACET_SHEET)` in `WorldInteractions` (~line 271).
  - Add `facetSheet?: FacetSheetController` to `controllersRef.current` type (~line 277).
  - Add `FacetSheetController` class alongside `ObjectPeekController` (~line 912).
  - In the boot `useEffect` (~line 282–352): instantiate `new FacetSheetController(deps, setFacetSheet)`, assign `view.facetView = controller`, store in `controllersRef.current.facetSheet`, include in the controllers[] dispose loop, and apply the identity-check `if (view.facetView === controllersRef.current.facetSheet) view.facetView = null` on cleanup.
  - Update `_onDocPointerDown` inside `ObjectPeekController` (~line 932): add `[data-facet-sheet]` to the closest() selector that detects clicks inside overlays.
  - Render `<FacetSheetCard state={facetSheet} onClose={() => controllersRef.current.facetSheet?.close()} onToggleFull={() => controllersRef.current.facetSheet?.toggleFull()} onOpenProfile={() => controllersRef.current.facetSheet?.openProfile()} />` in the JSX, after `<ObjectPickupPanel />` (~line 376).

**Approach:** The controller's public surface is `openFor(target)`, `close()`, `toggleFull()`, `openProfile()`, plus a getter `get isOpen()` that reads from a private `_isOpen` field updated in lockstep with the React state. The setter calls `setFacetSheet({ ...prev, open: true, target, evidence, facetId, header, theme, isFull: false })` on open; `setFacetSheet(prev => ({ ...prev, open: false }))` on close; `setFacetSheet(prev => ({ ...prev, isFull: !prev.isFull }))` on toggle. Compute `evidence = resolveElementEvidence(target, deps.state.profile)`, `facetId = evidence.facetId || facetIdForTarget(target)`, `header = PROFILE_HEADERS[facetId]`, `theme = PROFILE_THEMES[facetId]` inside `openFor()`. Carry over `facetIdForTarget` from `FacetView.js:79–125` into this class (it's small).

**Patterns to follow:**
- `WorldInteractions.tsx:912–1130` `ObjectPeekController` — class shape, `disposed` boolean guard on every async continuation, setter-based React state updates.
- `WorldInteractions.tsx:282–352` boot effect — registration and cleanup pattern, especially the identity-check guards at lines 344–348.
- `WorldInteractions.tsx:1076–1090` `ObjectPeekController.dispose()` — removes doc-level listeners, clears timers, resets state to initial.

**Test scenarios:**
- `view.facetView.openFor({ kind: 'tree', species: { id: 'oak' }, … })` causes `<FacetSheetCard />` to mount with the right header eyebrow / pill / title.
- `view.facetView.close()` sets `state.open = false` and the card unmounts.
- `view.facetView.isOpen` returns `true` after open, `false` after close.
- HMR simulation: instantiate controller, assign `view.facetView`, instantiate a second controller (simulating a fresh mount), dispose the first. Assert `view.facetView` still equals the second controller (identity-check guard works).
- StrictMode double-mount: controller's `dispose()` is called immediately after construction; on second mount, `view.facetView` is correctly assigned to the new controller, not orphaned to null.
- Click outside the card (on the world canvas) does not dismiss the card via `ObjectPeekController._onDocPointerDown` (because of the `data-facet-sheet` selector update).
- Click outside ObjectPeek when the facet sheet is also open: peek dismisses, facet sheet stays.
- `openFor()` then `close()` then `openFor()` in quick succession does not leak event listeners or timers (verified by `dispose()` cleanup being symmetric).

**Verification:** `pnpm test test/components/student-space/world/` passes. Manual smoke: hover a tree → facet sheet opens; press Escape → closes; drag handle up → expands to full; click scrim → closes.

### U6. Delete `FacetView.js`, the `.half-sheet*` CSS block, and the `View.js` wiring

**Goal:** Pure dead-code removal. After U5, nothing references the engine-side FacetView. Delete it and the CSS it owned.

**Requirements:** R1, R7, R8

**Dependencies:** U5 (must verify the new controller works first)

**Files:**
- Delete: `src/engine/student-space/Game/View/FacetView.js`.
- Modify: `src/engine/student-space/Game/View/View.js` — remove `import FacetView from './FacetView.js'` (line 22), remove `this.facetView = new FacetView()` (line 97), remove the `this.facetView` entry from the `SUBSYSTEMS` array (~line 205) so its dispose loop entry goes away too.
- Modify: `src/engine/student-space/style.css` — delete the `.half-sheet*` block (~lines 383–664; verify exact bounds before deleting — close-button styling at 383 may be shared with other surfaces, so isolate strictly to `.half-sheet`-prefixed selectors and the `.half-sheet__close`-specific rule).
- Modify: `test/engine/HoverProbe.performance.test.ts` — if it stubs `view.facetView`, update the stub or remove the reference. Read first to confirm; the dependency may be a no-op stub already.

**Approach:** Delete in this order: (1) update `View.js` first so the engine no longer constructs `FacetView` — verify dev still works with the new controller owning `view.facetView`. (2) Delete `FacetView.js`. (3) Delete the CSS block. (4) Run `pnpm check` + `pnpm test` to catch anything missed.

**Patterns to follow:**
- Recent dead-code removals: `docs/plans/2026-05-21-001-refactor-dead-code-cleanup-plan.md`.

**Test scenarios:**
- `pnpm check` (Biome + `tsc --noEmit`) passes — no dangling references.
- `pnpm test` passes — `HoverProbe.performance.test.ts` either no longer references FacetView, or its stub is updated.
- `pnpm dev` boots without console errors.
- Manual smoke: open the card via in-world hover (tree, flower, fruit); verify all interactions work as before.
- `grep -rn 'FacetView\|half-sheet' src test` returns only references in `docs/` and the new component (no stray engine-side mentions).

**Verification:** All checks above pass. The deleted CSS block accounts for the expected `style.css` line reduction (~280 lines).

---

# Scope Boundaries

### In Scope

- New `FacetSheetCard.tsx` and its test file.
- New `rank-claims.ts` helper and its test.
- Ambient type additions for `VIPS_BY_FACET` / `claimLabel`.
- `--facet-*` CSS variable promotion to `@theme`.
- Controller class + boot-effect wiring in `WorldInteractions.tsx`.
- Deletion of `FacetView.js`, `.half-sheet*` CSS, and the `View.js` construction/disposal entry.
- `ProfileSheet.tsx` consumes the new shared `rankClaims` helper.

### Deferred to Follow-Up Work

- A `/ce-compound` learning entry capturing focus-management parity during DOM→React migration of an engine surface (gap flagged by learnings researcher; no prior incident documented).
- Optional: a component test for `ObjectPeekPopover` and `ObjectPickupPanel` to bring those alongside the new `FacetSheetCard` test (current test coverage is zero per `grep -rln "ObjectPeek\|ObjectPickup" test/`).
- Optional: extracting `facetIdForTarget` to a shared helper if a third consumer appears later.

### Out of Scope

- Any change to copy, layout, or behavior.
- Migration of any other engine surface.
- New design tokens beyond moving existing ones.
- Backend, server functions, drizzle schema, or agent prompt changes.

---

# Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| HMR / StrictMode double-mount orphans `view.facetView` against a torn-down controller | high | Identity-check guard on cleanup (`if (view.facetView === controllersRef.current.facetSheet) view.facetView = null`), exactly mirroring `WorldInteractions.tsx:344–348`. Covered by U5 test scenarios. |
| Engine-stylesheet HMR swap drops `--facet-*` variable defaults, causing a white flash | medium | Move seeds to `@theme` in `src/styles.css` (U1), same fix shape as commit `e6fff905`. |
| Drag-to-expand pointer interaction conflicts with Base UI Dialog's focus trap or backdrop pointer handling | medium | Stop propagation on handle pointer events; verify in U4 component test and manual smoke. Fallback: if Dialog interferes, hand-roll the popup without `Dialog.Root` and re-implement Escape/focus locally (the `ObjectPickupPanel` precedent works without Dialog). |
| `secondaryAction` at `WorldInteractions.tsx:860` calls `view.facetView?.openFor(target)` synchronously; React state setter is async — timing difference might be observable | low | The legacy `FacetView.openFor` synchronously mutates DOM; the new path enqueues a re-render. No callsite reads `view.facetView.isOpen` immediately after `openFor()`. If a race is found in manual smoke, expose `isOpen` via a controller-internal flag updated synchronously in `openFor()` ahead of the setState call. |
| `rankClaims` extraction subtly changes ordering vs the engine version | low | Read both implementations before extracting; document the chosen behavior in the test file; verify visual parity by opening the card for a known student profile before and after. |
| `.half-sheet*` CSS block has bleed-through to a non-FacetView consumer (rule named `.half-sheet__close` shares conventions with other close buttons) | low | U6 verifies exact selector ownership before deletion. `grep -rn '\.half-sheet' src` after U6 should return nothing. |
| `View.js`'s `SUBSYSTEMS` array assumes `facetView` is present | low | Remove the entry; `try { sub?.dispose?.() }` is null-safe but cleaner without the entry. |

---

# System-Wide Impact

- **Engine substrate:** `View.js` shrinks slightly. No other engine class references `FacetView` directly (verified by grep — only `View.js:22, 97, 205`).
- **`src/components/student-space/world/WorldInteractions.tsx`:** grows by ~200 lines (controller class + state + boot-effect registration + JSX render), shrinks by 0. Already at ~1800 lines; this is a known concentration.
- **`src/engine/student-space/style.css`:** shrinks by ~280 lines (the `.half-sheet*` block).
- **`src/styles.css`:** grows by ~6 lines (three new `@theme` variable seeds).
- **`src/components/student-space/sheets/ProfileSheet.tsx`:** net-neutral (local `rankClaims` removed, import added).
- **`docs/`:** none directly; a future `/ce-compound` entry is deferred.

---

# Test Coverage Strategy

- **Unit:** `rank-claims.test.ts` covers the extracted helper with happy path + edge cases.
- **Component:** `facet-sheet-card.test.tsx` covers the React card in isolation — visual states, callbacks, accessibility.
- **Integration (light):** Extend a WorldInteractions-level test or add `test/components/student-space/world/facet-sheet-controller.test.tsx` to exercise the HMR identity-check guard and the open/close/toggleFull state machine. Pattern: `test/components/student-space/EngineHost.test.tsx` for boot-and-dispose.
- **Performance:** `test/engine/HoverProbe.performance.test.ts` continues to pass. If it stubs `view.facetView`, update the stub minimally.
- **Manual smoke:** open the card via tree, flower, fruit hover for each of the four VIPS facets; verify drag-to-expand, ArrowUp/Down, Escape, scrim click, close button, CTA navigation to `/profile/$tab`, and that HMR (editing `style.css` while card is open) does not flash white.

---

# Verification Checklist

- [ ] `pnpm check` (Biome + `tsc --noEmit`) passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm dev` boots; `/` shows the world; hovering a tree opens the new card.
- [ ] Card looks visually identical to the screenshots: eyebrow, pill, title, subtitle, vips-rows, detail with "1 noticing · '…quote…'", CTA.
- [ ] Drag handle up → card expands to full height. Drag down → returns to half.
- [ ] ArrowUp / ArrowDown toggle full while card is focused.
- [ ] Escape closes the card. Scrim click closes.
- [ ] CTA opens `/profile/$tab` for the right facet.
- [ ] HMR cycle (edit `src/engine/student-space/style.css`) while card is open: no white flash.
- [ ] `grep -rn 'FacetView\|half-sheet' src/engine` returns no matches after U6.
- [ ] `grep -rn 'FacetView' src/components` returns only intentional new code paths (FacetSheetCard, FacetSheetController).
- [ ] Imperative call sites in `WorldInteractions.tsx` still compile and work (lines 586, 653–655, 860, 967, 1357).
