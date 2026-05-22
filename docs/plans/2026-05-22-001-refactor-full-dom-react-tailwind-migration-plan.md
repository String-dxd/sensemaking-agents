---
title: "refactor: Full DOM → React + Tailwind migration of the engine view layer"
status: active
created: 2026-05-22
type: refactor
depth: deep
---

# Summary

Migrate **every DOM surface** in the engine (`src/engine/student-space/Game/View/*` plus `Onboarding/*`) from imperative JavaScript classes that render via `innerHTML` against ~9,136 lines of `style.css` to React components styled with Tailwind v4. The migration covers six routable sheet-pages (Profile, History, Letters, Path Finder, Settings, Calendar-as-subcomponent), four capture sheets (Ask, Mood, CaptureChooser, CaptureFab), inline overlays (DayDetailCard, ShareDialog, KiraDialogue), five HUDs (Hour, Mood, Zoom, Fps, StatusPreview), three in-world labels/probes (ObjectPeek, HoverProbe, HoverCta), two pickers (Bird, Track), the SideRail nav, and the full Onboarding flow (Greeting, FirstChat, FirstMood, EggHatcher, EdupassLogin, IslandReveal, OnboardingFlow, SkipButton, OnboardingSkip).

Three.js / WebGL stays vanilla JS — the canvas, scene objects, materials, shaders, audio, and engine state slices are explicitly preserved. The seam between React and Three.js is a small set of subscription bridges that let React read engine state and React-side click handlers call engine actions.

After this refactor, `src/engine/student-space/Game/View/` contains only Three.js mesh classes, the engine update loop, scene-rendering helpers, and a thin React-host bridge. `SheetChrome.js`, `OverlayController.js` (or a much-shrunk variant), and `profile-tab-react-bridge.tsx` are removed. `CLAUDE.md` is rewritten to reflect the new contract: routed pages are TanStack Router routes; non-routed overlays (capture sheets, HUDs, in-world labels) are React surfaces composed inside `StudentSpaceHost.tsx`.

---

# Problem Frame

The engine's DOM substrate is a parallel UI universe to the React app it lives inside. As of `eb0d8b57 (#33)` and `6b711854 (#32)` on origin/main:

1. **Sheets are now real routes but still rendered by the engine.** PR #32 made `/profile`, `/history`, `/letters`, `/trajectory` real TanStack Router routes. Each route page renders `null` and the engine still owns the actual sheet rendering via `SheetChrome`. The URL is bookmarkable, but the sheets remain imperative DOM.
2. **`SheetChrome` carries a two-pane split layout** (PR #33). `leftPane` (header + introSlot) and `rightPane` (bodySlot) replace the prior stacked layout for routed pages. The chrome is more capable, which means more things to migrate.
3. **CalendarSheet was folded into HistorySheet's Timeline tab** (PR #33). `DayDetailCard` lost its overlay chrome and became a `renderInto(slotEl, date)` content renderer.
4. **9,136 lines of `style.css`** — dominated by per-sheet rules (profile-sheet, history-sheet, letters-sheet, trajectory-sheet, settings-sheet, calendar-sheet, ask-sheet, mood-sheet, capture-chooser), HUDs (hour-hud, mood-hud, zoom-hud), pickers (bird-picker, track-picker), onboarding (`.onb-*`), and overlay base classes (`.sheet-chrome`, `.half-sheet`, `.day-detail-card`).
5. **Already-proven React-into-engine bridge** at `src/engine/student-space/profile-tab-react-bridge.tsx` mounts React panels inside imperative `bodySlot` for two ProfileSheet tabs. Every new surface pays the cost of straddling both worlds.
6. **Render-loop pause** (`live.setRenderActive(pathname === '/')` from PR #32) already hard-pauses the engine on non-world routes. The Three.js canvas is dormant while routed pages are open — meaning the routed pages are already "pure DOM" and have no reason to remain imperative.

Tailwind v4, React 19, Base UI rc.0, and TanStack Router 1.169 are wired. The bridge precedent works. The right move now is to delete the parallel DOM universe and let React + Tailwind own everything that isn't Three.js. The user has confirmed: **"scope is big, full migration"** — and **"for Three.js styling etc, keep it there"**.

---

# Goals

- **Every DOM surface** in `src/engine/student-space/Game/View/` and `Onboarding/` is a React component, styled with Tailwind v4 utility classes only (no per-surface CSS rules in `style.css`).
- A small set of reusable primitives in `src/components/ui/`: `Sheet` (full-viewport), `Drawer` (existing, refined for capture sheets), `Popover` (Bird/Track pickers — Base UI), `Tooltip`, `Hud` shell, `WorldLabel` (in-world labels positioned by Three.js).
- TanStack Router routes own routed-sheet rendering directly — `profile.tsx`, `history.tsx`, etc. stop returning `null` and render React content.
- A `StudentSpaceHost` React composition owns non-routed overlays (capture sheets, HUDs, in-world labels, dialogues, onboarding).
- Engine `View.js` shrinks to constructing Three.js / scene-object instances only; sheet/HUD/label classes are removed.
- `SheetChrome.js`, `OverlayController.js` (or a much-shrunk variant), `profile-tab-react-bridge.tsx` are removed.
- `style.css` shrinks to only the rules genuinely needed for the Three.js canvas, world frame, fonts, and global engine substrate (target: under 1,500 lines, down from 9,136).
- `@theme` in `src/styles.css` becomes the canonical design-token store (font, color palette, sheet motion tokens, frame layout, facet colors, etc.).
- React-side state synchronization with engine slices uses a single `useEngineSliceVersion` hook (extracted, then either kept or replaced with `useSyncExternalStore` after a slice-hardening pass).
- `CLAUDE.md` is rewritten end-to-end for the new architecture; the stale TopNav reference is removed; sheet-chrome contract is replaced with the new React composition contract.
- Tests follow the React-component pattern from `test/components/RelationshipsPageView.engine-round-trip.test.tsx`. Engine-side sheet tests in `test/engine/` are migrated to `test/components/student-space/`.

---

# Non-Goals

- **Three.js scene content and shaders are untouched.** Renderer, Camera, scene meshes (Island, Tree, Sprouts, Flowers, Fruits, Grass, FacetView, Aurora, Butterflies, Fireflies, Rain, Rainbow, Particles), atmospheric layers (Sky, CssSky), audio (Sound, Noises), materials, textures, the `Mailbox`/`Telescope`/`Kira` 3D meshes, `ThumbnailRenderer`, `renderQuality`, and GLSL files all stay vanilla JS.
- **Engine state slices** (`State/*`, Persistence, schema, mergers, IdentityStatusOverride) stay vanilla JS. React subscribes to them; no rewrite of the state layer.
- **Heuristics modules** (`chatHeuristics`, `statusHeuristics`, `trajectoryHeuristics`, `reframeHeuristics`, `elementEvidence`, `facets`, `claimIcons`, `visualPrimitives`) stay pure JS — they have no DOM dependency. Optionally migrated to TypeScript later as separate work.
- **Server functions, routes/api, drizzle schema, backend bridge** stay unchanged (this is a frontend migration).
- **Engine update loop, `live.setRenderActive`, rAF gating** stay unchanged (PR #32's work is reused as-is).
- **No new product features** — copy, flows, layout, and behavior must match current main exactly.
- **No new design system / shadcn migration** — the existing Base UI + `cn()` + Tailwind v4 stack is what we use. The proposal note in `components.json` is respected.
- **No URL routing changes** — the routing established by PR #32 is taken as given. Routed sheets remain the routed sheets; capture sheets remain non-routed.

---

# Scope Boundaries

### In scope (every surface listed becomes React + Tailwind)

**Routed sheet-pages (Phase B):**
- `ProfileSheet` (1,208 lines) → `src/routes/profile.tsx` + `profile.$tab.tsx` render React content
- `HistorySheet` (1,077 lines) → `src/routes/history.tsx` + `history.$tab.tsx` render React content (Timeline pane includes the inline Calendar + DayDetail)
- `LettersSheet` (186 lines) → `src/routes/letters.tsx` renders React content
- `TrajectorySheet` (874 lines) → `src/routes/trajectory.tsx` renders React content
- `SettingsSheet` (171 lines) → new `src/routes/settings.tsx` renders React content (route to be added if not already)
- `CalendarSheet` (448 lines) → absorbed as a `<CalendarPane>` React subcomponent inside History's Timeline tab; standalone `?sheet=calendar` deep-link continues to redirect to `/history/timeline` (per `route-sheets.ts`)

**Capture sheets (Phase C):**
- `AskSheet` (1,756 lines) → React drawer at `src/components/student-space/capture/AskSheet.tsx`
- `MoodSheet` (336 lines) → React drawer at `src/components/student-space/capture/MoodSheet.tsx`
- `CaptureChooser` (355 lines) → React popover/sheet at `src/components/student-space/capture/CaptureChooser.tsx`
- `CaptureFab` (the floating action button + label) → React component at `src/components/student-space/capture/CaptureFab.tsx`

**Inline overlays and dialogues (Phase D):**
- `DayDetailCard` (401 lines) → React subcomponent of HistorySheet's Timeline pane (already inline after PR #33)
- `ShareDialog` (316 lines) → React Dialog at `src/components/student-space/ShareDialog.tsx`
- `KiraDialogue` (346 lines) → React Dialog/Drawer at `src/components/student-space/KiraDialogue.tsx`
- `KiraNarrator` (338 lines) → React narrator overlay at `src/components/student-space/KiraNarrator.tsx`

**HUDs (Phase E):**
- `HourHud` → `src/components/student-space/hud/HourHud.tsx`
- `MoodHud` → `src/components/student-space/hud/MoodHud.tsx`
- `ZoomHud` → `src/components/student-space/hud/ZoomHud.tsx`
- `FpsOverlay` → `src/components/student-space/hud/FpsOverlay.tsx` (dev-only)
- `StatusPreviewHud` → `src/components/student-space/hud/StatusPreviewHud.tsx`

**In-world labels and probes (Phase F):**
- `ObjectPeek` (548 lines) → `src/components/student-space/world/ObjectPeek.tsx`
- `HoverProbe` (457 lines) → `src/components/student-space/world/HoverProbe.tsx`
- `HoverCta` → `src/components/student-space/world/HoverCta.tsx`
- The `Mailbox` and `Telescope` 3D meshes stay vanilla; their DOM label overlays migrate to React.

**Pickers (Phase F):**
- `BirdPicker` → `src/components/student-space/pickers/BirdPicker.tsx`
- `TrackPicker` → `src/components/student-space/pickers/TrackPicker.tsx`

**Onboarding (Phase G):**
- `OnboardingFlow` (orchestrator) → `src/components/student-space/onboarding/OnboardingFlow.tsx`
- `Greeting` → `src/components/student-space/onboarding/Greeting.tsx`
- `FirstChat` → `src/components/student-space/onboarding/FirstChat.tsx`
- `FirstMood` → `src/components/student-space/onboarding/FirstMood.tsx`
- `EggHatcher` → `src/components/student-space/onboarding/EggHatcher.tsx`
- `EdupassLogin` → `src/components/student-space/onboarding/EdupassLogin.tsx`
- `IslandReveal` → `src/components/student-space/onboarding/IslandReveal.tsx`
- `SkipButton` + `OnboardingSkip` → `src/components/student-space/onboarding/SkipButton.tsx`
- `copy.js` (onboarding copy table) → stays as a data module (no DOM) and is imported by the React components

**Nav and host (Phase H):**
- `SideRail` → `src/components/student-space/SideRail.tsx` (uses TanStack `<Link>` for routed sheets)
- `StudentSpaceHost` (already React) → grows a composition tree that mounts capture sheets, HUDs, in-world labels, dialogues, onboarding

**Infrastructure (Phase A):**
- New: `src/components/ui/sheet.tsx` — routed-page Sheet primitive on Base UI Dialog (`modal={false}`)
- New: `src/components/ui/hud.tsx` — minimal HUD shell (positioned, accessible, motion-respecting)
- New: `src/components/ui/world-label.tsx` — in-world DOM label primitive (positioned from Three.js via subscription)
- New: `src/lib/student-space/use-engine-slice-version.ts` — extracted from the bridge
- New: `src/lib/student-space/use-engine-overlay.ts` — replaces `OverlayController` for non-routed surfaces (React context + state)
- New: `src/lib/student-space/use-world-position.ts` — subscribes to Three.js world-to-screen projections for in-world labels
- Modify: `src/styles.css` — `@theme` extension with all engine design tokens
- Modify: `src/engine/student-space/style.css` — pruned to Three.js / canvas / global engine rules only (target under 1,500 lines)

### Deferred to Follow-Up Work

- Migrating engine state slices (`State/*`) to TypeScript — separate concern; not a DOM migration
- Migrating heuristics modules to TypeScript — same; not DOM
- Hardening engine slice snapshot accessors to support `useSyncExternalStore` (the version-bump pattern is preserved as the interim solution)
- A full design-system audit and consolidation into shadcn-style primitives — the `components.json` proposal stays a proposal
- Splitting `state.css` (the Three.js canvas presentation styles) into Tailwind `@theme` tokens — this refactor migrates DOM, not the canvas layer
- Removing the `OverlayController` JS file entirely — Phase H shrinks it to a body-class toggler that capture sheets may still use, or removes it if the React `useEngineOverlay` hook fully subsumes its responsibilities

### Outside this product's identity

(Not applicable — this is a DOM-layer refactor, not a product change.)

---

# Requirements

- **R1.** After the refactor, every existing user-visible behavior matches current main exactly — every sheet opens with the same content, every HUD shows the same data, every onboarding step plays in the same order, every capture flow ends at the same outcome.
- **R2.** TanStack Router routes own routed-sheet rendering. `/profile`, `/profile/$tab`, `/history`, `/history/$tab`, `/letters`, `/trajectory`, `/settings` (or wherever Settings routes today) render React content directly. URL ↔ sheet sync preserved (PR #32 behavior).
- **R3.** Engine render-loop pause on non-world routes (`live.setRenderActive(pathname === '/')`) still works. Routed pages render zero Three.js until the user returns to `/`.
- **R4.** Capture sheets, HUDs, in-world labels, dialogues, and onboarding mount inside `StudentSpaceHost.tsx` and are visible only while the world route (`/`) is active or while an onboarding flow is active. No double-mount across route changes.
- **R5.** Engine state slice subscriptions work from React via `useEngineSliceVersion`. Slice mutations from React trigger re-renders consistently.
- **R6.** `body.has-overlay`, `body.has-capture-sheet`, `body.has-chooser`, `body.is-onboarding`, `body.is-onb-landing`, `body.is-night` are owned by React effects (or by the shrunk `OverlayController`) and toggle on the same lifecycle events as today. Engine CSS consumers (`bird-picker` hide rules, etc.) keep working until those surfaces themselves migrate.
- **R7.** In-world labels (`ObjectPeek`, `HoverProbe`, `HoverCta`, `Mailbox` label, `Telescope` label, `Kira` name label if any) project from Three.js mesh world positions to screen coordinates on every frame the camera moves, with no observable jitter compared to the current imperative implementations.
- **R8.** `pnpm check` (Biome + tsc) and `pnpm test` (Vitest + happy-dom) pass at the end of every phase, not only at the end of the migration.
- **R9.** Engine `View.dispose()` cleanly unmounts every React surface that the host mounted. No leaked React roots on sign-out / HMR / StrictMode.
- **R10.** The Profile auth flow (sign-in link, body-scoped sign-out form, engine `dispose()` before form submit) preserves sequencing.
- **R11.** HistorySheet's Growth tab embedded Three.js OrbitControls preview camera continues to render the year-by-year island, owned by a React `useEffect` that builds and tears down the Three.js view.
- **R12.** TrajectorySheet's dynamic header (eyebrow/title/subtitle per Marcia status) and per-status body branching work as React state, not as engine `chrome.setHeader(...)` calls.
- **R13.** `style.css` shrinks to only canvas / global engine rules. Every per-surface CSS class (`history-sheet`, `profile-sheet`, `ask-sheet`, `hour-hud`, `bird-picker`, `onb-*`, etc.) is deleted.
- **R14.** `CLAUDE.md` is rewritten end-to-end for the new architecture; the stale TopNav and SheetChrome references are gone; the new contract documents routed pages, host-mounted non-routed surfaces, in-world label projection, and the engine ↔ React seam.

---

# Key Technical Decisions

### D1. TanStack Router routes own routed-sheet rendering directly

The `null`-returning route components from PR #32 are replaced with real React content. Each route page renders the same Sheet primitive shape: full-viewport, two-pane (sidebar nav + content), no close button (no modal to dismiss). Engine `View.js` no longer constructs `ProfileSheet`, `HistorySheet`, `LettersSheet`, `TrajectorySheet`, `SettingsSheet`, or `CalendarSheet` — they are deleted.

URL ↔ sheet sync continues to work because the URL IS the source of truth and the route components render unconditionally.

Rejected: keeping engine adapters as a content-swap inside `SheetChrome`. That keeps the JS-class shell wrapping React content — a hybrid that's only justified when you can't change the routing layer. PR #32 already changed it; the cleanest move is to delete the engine sheet classes entirely.

### D2. Non-routed overlays mount inside `StudentSpaceHost.tsx`

Capture sheets, HUDs, in-world labels, dialogues, and onboarding are React surfaces composed inside `StudentSpaceHost.tsx`. They are visible only when the host is mounted (i.e., when any route inside the engine layout is active).

A small React context — `<EngineOverlayProvider>` — holds non-routed-overlay state (which capture sheet is open, which picker is open, which onboarding step). The `useEngineOverlay()` hook is the React-side replacement for `OverlayController` for these surfaces.

Body-class toggling (`has-capture-sheet`, `has-chooser`, `is-onboarding`) moves into the React provider via `useEffect` that calls `document.body.classList.add/remove`.

### D3. Engine slice subscription uses a single `useEngineSliceVersion` hook

Extracted from `src/engine/student-space/profile-tab-react-bridge.tsx` to `src/lib/student-space/use-engine-slice-version.ts`. All React surfaces subscribe to engine slices via this hook.

The version-bump pattern (re-render on `slice.subscribe(() => setV(v => v + 1))`) sidesteps React's cached-snapshot warning that `useSyncExternalStore` triggers on slices returning new array instances per accessor call. Slice hardening for `useSyncExternalStore` is deferred (see Scope Boundaries).

### D4. Tailwind `@theme` becomes the canonical design-token store

`src/styles.css` `@theme` extends to carry every design token currently in `src/engine/student-space/style.css` `:root`:
- Font stack: `--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;` (engine canon, replaces Inter)
- Sheet motion tokens: `--color-sheet-bg-start`, `--color-sheet-bg-end` (RGBA pair), `--blur-sheet: 10px;`, `--duration-sheet: 200ms;`
- Frame layout: `--inset-frame: 14px;`, `--width-rail: 64px;`, `--radius-frame: 22px;`
- Mobile overrides via Tailwind responsive variants instead of media-query CSS
- Profile facet colors (values/interests/personality/skills × accent/soft/ink) sourced from `src/lib/profile-tokens.ts`
- Onboarding palette, status colors (starter/diffused/searching/foreclosed/achieved), HUD ink colors, sky gradients (read by React surfaces, written by `CssSky.js` as JS-set CSS variables on `:root`)

The engine `:root` CSS variables continue to exist (Three.js code reads some of them — `CssSky` writes `--sky-*`, etc.). `@theme` is the React-side canonical store; engine-set variables are read via Tailwind arbitrary values (`bg-[var(--sky-top)]`) when needed.

### D5. `SheetChrome` is removed; React `Sheet` primitive replaces it

The new `<Sheet>` primitive in `src/components/ui/sheet.tsx` is built on Base UI `Dialog.Root` with `modal={false}`. It supports the split-pane layout PR #33 introduced:

```
<Sheet>
  <SheetSidebar>       (left pane, ~360px — sidenav)
    <SheetIdentityHeader />
    <SheetSidenav />
  </SheetSidebar>
  <SheetContent>        (right pane — page header + body)
    <SheetPageHeader />
    <SheetBody>{children}</SheetBody>
  </SheetContent>
</Sheet>
```

`modal={false}` keeps the Three.js canvas visible behind the (currently fully-opaque per PR #32) sheet — except routed pages don't actually need to see the canvas since `setRenderActive(false)` paused the loop. We retain `modal={false}` for consistency with capture sheets that DO need canvas-visible behavior.

Stagger animation, fade transitions, frame inset positioning, font, and tokens are all expressed in Tailwind utilities backed by `@theme`.

### D6. `OverlayController` shrinks to a body-class toggler (or is fully removed)

After the migration, every consumer of `OverlayController` is either:
- A routed sheet (no longer registers anything — routing IS the coordinator), or
- A non-routed React surface (uses `useEngineOverlay()` instead), or
- An engine-side Three.js helper that reads `body.has-overlay` indirectly via CSS

If no engine-side JS code still imports `OverlayController`, the module is deleted in Phase H. If a few non-DOM consumers remain (e.g., engine-side state coordinators that listen for "is any sheet open" to gate camera input), the module shrinks to a small event emitter + body-class toggler. Decision deferred to Phase H based on grep.

### D7. In-world labels project from Three.js positions via a `useWorldPosition()` hook

`ObjectPeek`, `HoverProbe`, `HoverCta`, `Mailbox` label, and `Telescope` label are React components that read their target's world position from Three.js (the engine still owns the meshes) and project to screen coordinates.

The bridge: each in-world label subscribes via `useWorldPosition(meshRef)`. The hook listens to a per-frame `worldFrame` event emitted by `Renderer.update()` (already exists or trivial to add) and computes `mesh.position` → screen via `camera.project(...)`. The label's `style.transform = translate3d(${x}px, ${y}px, 0)` updates each frame.

This costs one DOM write per label per frame — same as the current imperative implementation. Performance is preserved.

### D8. HistorySheet's Growth-tab Three.js preview stays imperative inside `useEffect`

The current `HistorySheet.js` builds a self-contained Three.js view (year-by-year island preview, OrbitControls). This code moves verbatim into `<GrowthIslandPreview year={...} />` which:
- Owns a `<div ref={canvasMountRef} className="…" />`
- Builds the Three.js view inside `useEffect(() => { … }, [year])`
- Disposes in the effect cleanup

This honors the user's "for Three.js styling etc, keep it there" constraint.

### D9. Capture sheets use a refined `Drawer` primitive

`src/components/ui/drawer.tsx` already exists and uses Base UI Dialog with a drawer-style transition. The capture sheets reuse this with `modal={false}` and the `has-capture-sheet` body class. AskSheet is the largest (1,756 lines) and exercises everything the drawer primitive needs: multi-step (capture → reframe → committed), keyboard handling, photo capture, live chat, emoji panel, replay views.

### D10. Onboarding becomes a React state machine inside `OnboardingFlow.tsx`

The current `OnboardingFlow.js` orchestrates the sequence Greeting → FirstChat → FirstMood → EggHatcher → IslandReveal → done. The React rewrite:
- `<OnboardingFlow>` holds step state (`useState<'greeting' | 'first-chat' | 'first-mood' | 'egg-hatcher' | 'island-reveal' | 'done'>`)
- Each step is a React component that calls `onNext(payload)` when done
- `EdupassLogin` is a side-branch (sign-in mid-flow) returning to the same state machine on completion
- `SkipButton` / `OnboardingSkip` short-circuit the flow
- The orchestrator mounts inside `StudentSpaceHost.tsx` and is gated by `state.onboarding.isComplete`
- Engine state slices for onboarding (`state.onboarding`) keep working unchanged; React reads via `useEngineSliceVersion`
- Body classes (`is-onboarding`, `is-onb-landing`) toggle via a `useEffect` inside the flow

### D11. `style.css` shrinks to only Three.js / canvas / global rules

After every phase, the per-surface CSS for migrated surfaces is deleted in the same commit. Target end-state for `src/engine/student-space/style.css`:
- `:root` CSS variables that Three.js code writes (`--sky-*`, etc.) and that the Tailwind `@theme` does NOT cover
- Global font setup (`html`, `body`, base typography)
- The Three.js canvas wrapper (`.game`, frame inset, mobile overrides on the world frame)
- Anything else that's not surface-specific and not a token

Estimated target: under 1,500 lines (from 9,136).

### D12. Existing React surfaces are absorbed without duplication

`src/components/ChoicesPageView.tsx`, `src/components/RelationshipsPageView.tsx`, `src/components/TrajectorySheetView.tsx` (the small one on `/library/trajectory`), `src/components/DevPalette.tsx`, `src/components/IslandProgressionOverlay.tsx`, `src/components/EmotionPicker.tsx`, `src/components/SheetEntryRail.tsx`, `src/components/VoiceButton.tsx`, `src/components/share/*`, etc. — these already exist and either:
- Continue to be composed into the new React surfaces (Profile absorbs Relationships/Choices)
- Continue to render where they currently render
- Get the deprecated `omitChrome` prop removed (per U6 in the prior plan; PR #33 already simplifies this)

No duplicate React components are created.

### D13. The `profile-tab-react-bridge.tsx` and the JS profile-tokens mirror are deleted

`src/engine/student-space/profile-tab-react-bridge.tsx` (151 lines) is deleted in Phase B when ProfileSheet migrates. Its `useEngineSliceVersion` hook is extracted first (D3). Its module-level `sharedQueryClient` is replaced by the route-level `QueryClient` already provided in `src/routes/__root.tsx`.

`src/engine/student-space/Game/View/profile-tokens.constants.js` (the JS mirror of `src/lib/profile-tokens.ts`) is deleted if the grep at Phase B end shows no remaining engine consumer.

### D14. CLAUDE.md is rewritten

`CLAUDE.md` is rewritten end-to-end in Phase H. The "Sheet chrome contract" section is replaced with:
- **Routed sheets:** TanStack Router file routes own them; render via the React `<Sheet>` primitive in `src/components/ui/sheet.tsx`.
- **Non-routed overlays:** capture sheets, HUDs, in-world labels, dialogues mount inside `StudentSpaceHost.tsx` under `<EngineOverlayProvider>`. The `useEngineOverlay()` hook coordinates them.
- **In-world labels:** project from Three.js via `useWorldPosition(meshRef)`.
- **Engine state from React:** `useEngineSliceVersion(slice)`.
- **CSS:** Tailwind utilities only; `@theme` in `src/styles.css` is the token store; `src/engine/student-space/style.css` is for Three.js canvas / global engine rules only.

### D15. Migration sequence respects risk

Phase A (foundations) before any sheet. Phase B (sheets) in ascending risk order: Letters → Settings → Trajectory → History → Profile. Phase C (capture sheets) after sheets are proven. Phase D (inline overlays) leans on sheet patterns. Phase E (HUDs) is independent and can run anytime after A. Phase F (in-world labels + pickers) needs `useWorldPosition` proven. Phase G (onboarding) is last among feature migrations because it's the rarest path. Phase H (cleanup) runs last.

Each phase ships in its own commits (typically 1 commit per implementation unit) and is fully verifiable in dev before the next phase begins. Migrations are NOT bundled into one monolithic PR.

---

# High-Level Technical Design

This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                       TanStack Router                                │
│  /              → src/routes/index.tsx → <StudentSpaceHost />       │
│  /profile/$tab  → src/routes/profile.$tab.tsx → <ProfileSheet />    │
│  /history/$tab  → src/routes/history.$tab.tsx → <HistorySheet />    │
│  /letters       → src/routes/letters.tsx       → <LettersSheet />   │
│  /trajectory    → src/routes/trajectory.tsx    → <TrajectorySheet />│
│  /settings      → src/routes/settings.tsx      → <SettingsSheet />  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  __root.tsx                                                          │
│    <RouterContext.Provider>                                          │
│      <QueryClientProvider>                                           │
│        <EngineHost>     ← lifts engine across route changes         │
│          <Outlet />     ← routed page content (sheets)               │
│        </EngineHost>                                                 │
│      </QueryClientProvider>                                          │
│    </RouterContext.Provider>                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (on / route only)
┌─────────────────────────────────────────────────────────────────────┐
│  StudentSpaceHost.tsx                                                │
│    <canvas /> ← engine writes Three.js into this                    │
│    <EngineOverlayProvider>      ← React coordinator for non-routed │
│      <SideRail />                                                    │
│      <CaptureFab />                                                  │
│      <CaptureChooser />     (visible when context says so)          │
│      <AskSheet />           (visible when context says so)          │
│      <MoodSheet />          (visible when context says so)          │
│      <HourHud />                                                     │
│      <MoodHud />                                                     │
│      <ZoomHud />                                                     │
│      <StatusPreviewHud />                                            │
│      <ShareDialog />        (mounted lazily)                         │
│      <KiraDialogue />                                                │
│      <KiraNarrator />                                                │
│      <BirdPicker />                                                  │
│      <TrackPicker />                                                 │
│      <ObjectPeek />                                                  │
│      <HoverProbe />                                                  │
│      <HoverCta />                                                    │
│      <Mailbox.Label />      ← reads mailbox mesh position           │
│      <Telescope.Label />    ← reads telescope mesh position         │
│      <OnboardingFlow />     ← mounts on onboarding-incomplete       │
│    </EngineOverlayProvider>                                          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Engine (Three.js, vanilla JS — UNCHANGED)                          │
│    Game.js                                                           │
│      Renderer, Camera, View (now sheet-class-free)                  │
│      Scene meshes: Island, Tree, Sprouts, Flowers, …                │
│      CssSky writes :root CSS vars on every frame                    │
│      ThumbnailRenderer (offscreen WebGL)                            │
│      Mailbox, Telescope, Kira (3D meshes)                           │
│      State slices: Profile, Captures, Letters, …                    │
│      Persistence (localStorage)                                      │
│      OverlayController (shrunk to body-class toggler, or removed)  │
└─────────────────────────────────────────────────────────────────────┘
                           ▲
                           │ React subscribes via useEngineSliceVersion
                           │ React reads world positions via useWorldPosition
                           │ React calls engine actions via direct method calls
                           │
                  React surfaces (top of diagram)
```

Key invariants:
- React never imports Three.js. The seam is the engine's slice/event API.
- Engine never imports React. The seam is the host's `EngineHost` component, which constructs the engine and exposes it via context.
- Routed pages render React content directly; no engine sheet construction.
- Non-routed surfaces live in one composition tree; `<EngineOverlayProvider>` is the React-side replacement for `OverlayController` for these surfaces.
- In-world labels (positioned by Three.js) read mesh positions per frame via `useWorldPosition`.

---

# Output Structure

```text
src/
├── components/
│   ├── student-space/
│   │   ├── EngineHost.tsx                        ← lifts engine across routes
│   │   ├── EngineOverlayProvider.tsx             ← React coordinator for non-routed overlays
│   │   ├── SideRail.tsx
│   │   ├── sheets/                                ← routed sheet-page bodies
│   │   │   ├── ProfileSheet.tsx
│   │   │   ├── ProfileSidenav.tsx
│   │   │   ├── ProfileIdentityHeader.tsx
│   │   │   ├── HistorySheet.tsx
│   │   │   ├── HistorySidenav.tsx
│   │   │   ├── HistoryTimelinePane.tsx
│   │   │   ├── HistoryGrowthPane.tsx
│   │   │   ├── GrowthIslandPreview.tsx
│   │   │   ├── LettersSheet.tsx
│   │   │   ├── TrajectorySheet.tsx
│   │   │   ├── SettingsSheet.tsx
│   │   │   ├── CalendarPane.tsx                  ← absorbed CalendarSheet
│   │   │   ├── DayDetailCard.tsx                 ← inline (per PR #33)
│   │   │   └── ShareButton.tsx                   ← triggers ShareDialog
│   │   ├── capture/
│   │   │   ├── AskSheet.tsx
│   │   │   ├── MoodSheet.tsx
│   │   │   ├── CaptureChooser.tsx
│   │   │   └── CaptureFab.tsx
│   │   ├── hud/
│   │   │   ├── HourHud.tsx
│   │   │   ├── MoodHud.tsx
│   │   │   ├── ZoomHud.tsx
│   │   │   ├── FpsOverlay.tsx
│   │   │   └── StatusPreviewHud.tsx
│   │   ├── world/                                 ← in-world DOM labels
│   │   │   ├── ObjectPeek.tsx
│   │   │   ├── HoverProbe.tsx
│   │   │   ├── HoverCta.tsx
│   │   │   ├── MailboxLabel.tsx
│   │   │   └── TelescopeLabel.tsx
│   │   ├── pickers/
│   │   │   ├── BirdPicker.tsx
│   │   │   └── TrackPicker.tsx
│   │   ├── dialogues/
│   │   │   ├── ShareDialog.tsx
│   │   │   ├── KiraDialogue.tsx
│   │   │   └── KiraNarrator.tsx
│   │   └── onboarding/
│   │       ├── OnboardingFlow.tsx
│   │       ├── Greeting.tsx
│   │       ├── FirstChat.tsx
│   │       ├── FirstMood.tsx
│   │       ├── EggHatcher.tsx
│   │       ├── EdupassLogin.tsx
│   │       ├── IslandReveal.tsx
│   │       └── SkipButton.tsx
│   └── ui/
│       ├── sheet.tsx                              ← new routed-sheet primitive
│       ├── drawer.tsx                             ← existing, used by capture sheets
│       ├── hud.tsx                                ← new HUD shell
│       ├── world-label.tsx                        ← new in-world label primitive
│       └── … (existing dialog.tsx, alert-dialog.tsx, etc.)
├── lib/
│   └── student-space/
│       ├── use-engine-slice-version.ts            ← extracted from bridge
│       ├── use-engine-overlay.ts                  ← context + hook for non-routed overlays
│       ├── use-world-position.ts                  ← Three.js world→screen projection
│       └── (existing files)
├── routes/
│   ├── profile.tsx                                ← renders <ProfileSheet />
│   ├── profile.$tab.tsx                           ← passes tab to <ProfileSheet />
│   ├── history.tsx                                ← renders <HistorySheet />
│   ├── history.$tab.tsx
│   ├── letters.tsx                                ← renders <LettersSheet />
│   ├── trajectory.tsx                             ← renders <TrajectorySheet />
│   └── settings.tsx                               ← new, renders <SettingsSheet /> (if not present)
└── styles.css                                      ← extended @theme block
```

The implementer may adjust this layout if implementation reveals a better one. Per-unit `Files:` sections remain authoritative.

---

# Implementation Units

Units are organized into eight phases. Each phase is self-contained and ships verifiable behavior before the next begins. Plan-time ID format is `U<N>`; gaps are preserved on reordering.

## Phase A — Foundations

### U1. Tailwind `@theme` extension, primitives, and hooks

**Goal:** Land the design-token canon in `@theme`, the new `Sheet`/`Hud`/`WorldLabel` primitives, and the three core hooks. No engine surface is migrated yet.

**Requirements:** R2, R4, R5, R7

**Dependencies:** None

**Files:**
- Modify: `src/styles.css` — `@theme` extension (font, sheet motion tokens, frame layout, facet colors, status colors, HUD ink colors, onboarding palette tokens)
- New: `src/components/ui/sheet.tsx`
- New: `src/components/ui/hud.tsx`
- New: `src/components/ui/world-label.tsx`
- New: `src/lib/student-space/use-engine-slice-version.ts` (extracted from `src/engine/student-space/profile-tab-react-bridge.tsx`)
- New: `src/lib/student-space/use-engine-overlay.ts`
- New: `src/lib/student-space/use-world-position.ts`
- New tests: `test/components/ui/sheet.test.tsx`, `test/components/ui/hud.test.tsx`, `test/components/ui/world-label.test.tsx`, `test/lib/student-space/use-engine-slice-version.test.tsx`, `test/lib/student-space/use-engine-overlay.test.tsx`, `test/lib/student-space/use-world-position.test.tsx`

**Approach:**
- `@theme`: `--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;`, `--color-sheet-bg-start: rgba(253, 250, 243, 0.55);`, `--color-sheet-bg-end: rgba(253, 250, 243, 0.92);`, `--blur-sheet: 10px;`, `--duration-sheet: 200ms;`, `--inset-frame: 14px;`, `--width-rail: 64px;`, `--radius-frame: 22px;`, plus facet colors, status colors, HUD inks, onboarding palette. Source: extract from `src/engine/student-space/style.css` `:root` block and `src/lib/profile-tokens.ts`.
- `<Sheet>` primitive composes `Dialog.Root` + `Dialog.Portal` + `Dialog.Backdrop` + `Dialog.Popup` with `modal={false}`, two-pane split layout via subcomponents (`SheetSidebar`, `SheetContent`, `SheetSidenav`, `SheetPageHeader`, `SheetBody`), `data-[starting-style]` transitions, ARIA roles, optional close button.
- `<Hud>` primitive: positioned absolute, Tailwind utilities for the various dock positions (top-right/top-left/bottom-right/bottom-left), `motion-reduce` overrides, ARIA `role="status"` where appropriate.
- `<WorldLabel>` primitive: accepts `position: { x, y }` props (computed by `useWorldPosition`), renders `<div style={{ transform: translate3d(${x}px, ${y}px, 0) }}>` with Tailwind for visuals.
- `useEngineSliceVersion(slice)`: subscribes via `slice.subscribe(() => setV(v => v + 1))`, returns `version`. Unsubscribes on unmount.
- `useEngineOverlay()`: React context. Exposes `{ activeCapture, setActiveCapture, activeChooser, setActiveChooser, activePicker, setActivePicker, isOnboarding, setIsOnboarding }`. Wraps `useEffect` that toggles body classes (`has-capture-sheet`, `has-chooser`, `is-onboarding`) on state change.
- `useWorldPosition(meshRef)`: subscribes to a per-frame `worldFrame` event on the engine; computes `mesh.position` projected through `camera.matrixWorldInverse` and `camera.projectionMatrix` to screen coordinates; returns `{ x, y, visible }` (visible = z within frustum). Updates on every frame.

**Patterns to follow:**
- `src/components/ui/dialog.tsx`, `drawer.tsx`, `alert-dialog.tsx` — Base UI wrapping pattern
- `src/engine/student-space/profile-tab-react-bridge.tsx:143-149` — version-bump hook source
- `src/components/student-space/IslandProgressionOverlay.tsx` (if it exists with world-position needs) — existing world-label pattern

**Test scenarios:**
- `<Sheet open>` renders backdrop + popup + split-pane layout; `aria-hidden` is `false` when open.
- `<Sheet>` `onOpenChange` fires on Escape, ×, and backdrop click (when enabled).
- `<Hud>` positions correctly in each dock variant; `motion-reduce` collapses transitions to 80ms.
- `<WorldLabel position={{ x: 100, y: 200 }}>` renders with `translate3d(100px, 200px, 0)`.
- `useEngineSliceVersion(fakeSlice)` triggers re-render on `fakeSlice._notify()`; unsubscribes on unmount.
- `useEngineOverlay` provider toggles `body.has-capture-sheet` when `setActiveCapture('ask')` is called; clears class on `setActiveCapture(null)`.
- `useWorldPosition` returns the expected screen coordinates for a mesh at `(0, 0, 0)` with a known camera matrix.

**Verification:** `pnpm test` passes; primitives can be rendered in isolation in Vitest; no engine surface is touched.

---

### U2. EngineHost lifts engine across route changes; expose engine via context

**Goal:** Move engine construction from `StudentSpaceHost.tsx` (per-route-mount) up to `__root.tsx` or an equivalent shared layout so the engine survives route changes. Expose the engine instance via React context so React surfaces can call engine actions without prop drilling.

**Requirements:** R2, R3, R4

**Dependencies:** U1

**Files:**
- New: `src/components/student-space/EngineHost.tsx`
- Modify: `src/routes/__root.tsx` — mount `<EngineHost>` around `<Outlet />`
- Modify: `src/components/StudentSpaceHost.tsx` — move engine boot into `EngineHost`; `StudentSpaceHost` becomes the world-route-only composition surface that reads engine from context
- Modify: `src/engine/student-space/Game/index.js` (if needed) — no API change; verify boot is idempotent enough to survive lifting

**Approach:**
- `<EngineHost>` constructs the engine once (`createGame({...})`) and stores it in a ref + context. The `<canvas>` element it owns moves with the host.
- `useEngine()` hook exposes the engine instance plus engine slices.
- On `/` route, `<StudentSpaceHost>` renders the canvas overlay composition (capture sheets, HUDs, in-world labels, etc.); on other routes, the host renders nothing extra but the canvas DOM element remains in the document (visibility hidden via Tailwind `invisible` + `pointer-events-none` when `setRenderActive(false)`).
- PR #32's `setRenderActive(pathname === '/')` continues to fire via the router-sync layer.
- Engine `dispose()` is called only on auth sign-out (via the existing helper), not on route change.

**Patterns to follow:**
- `src/routes/__root.tsx` — current root layout
- `src/components/StudentSpaceHost.tsx` — current engine boot

**Test scenarios:**
- Navigating from `/` to `/profile` and back to `/` does not rebuild the engine (assert via spy on `createGame`).
- `useEngine()` returns the same instance across route changes.
- `body.has-overlay` toggles correctly when navigating to a routed sheet.
- The canvas DOM element remains attached during route changes.
- Engine `dispose()` runs once at sign-out (existing test scenarios preserved).

**Verification:** `pnpm dev` boots; navigating `/` → `/profile` → `/` keeps the engine alive (the world doesn't re-fade-in); the rAF loop pauses on routed pages and resumes on `/`.

---

## Phase B — Routed sheet-pages

Order: ascending size + risk. Each unit deletes the corresponding engine JS class and the corresponding CSS block in the same commit.

### U3. Migrate LettersSheet to the route page

**Goal:** Render Letters as React content from `src/routes/letters.tsx`. Delete `LettersSheet.js` and its CSS.

**Requirements:** R1, R2, R6, R8

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/LettersSheet.js`
- New: `src/components/student-space/sheets/LettersSheet.tsx`
- Modify: `src/routes/letters.tsx` — render `<LettersSheet />` instead of `null`
- Modify: `src/engine/student-space/Game/View/View.js` — remove `LettersSheet` import, instantiation, and registration with `OverlayController`
- Modify: `src/engine/student-space/style.css` — delete `.letters-sheet*` rules
- New: `test/components/student-space/sheets/letters-sheet.test.tsx` (replaces/expands any LettersSheet engine tests)

**Approach:** Two-pane layout via `<Sheet>` primitive; left pane has the Letters title (no nav since Letters is a single-tab sheet); right pane shows the two-pane inbox/reader grid. Engine slice `state.letters` subscribed via `useEngineSliceVersion`. Mobile single-pane router via React state (no `is-reading` class). Mark-as-read mutation calls slice method. Press feedback `active:scale-[0.96]`.

**Patterns to follow:** `src/components/RelationshipsPageView.tsx` for slice + tailwind composition.

**Test scenarios:**
- Renders list with mocked slice containing letters; unread dot present on unread letters
- Click letter → reader shows subject + body; mark-as-read called
- Empty state copy preserved
- Mobile single-pane router toggles correctly
- Navigating to `/letters` opens the sheet; Escape navigates back to `/`
- Deep-link `/letters` at boot: sheet visible on first paint

**Verification:** `pnpm dev`; `/letters` opens identically to current; Escape returns to `/`.

---

### U4. Migrate SettingsSheet to a new route page

**Goal:** Render Settings as React content from a new `src/routes/settings.tsx` route. Delete `SettingsSheet.js` and CSS.

**Requirements:** R1, R2, R6, R8

**Dependencies:** U1, U2 (U3 not strictly required but ordering keeps risk ascending)

**Files:**
- Delete: `src/engine/student-space/Game/View/SettingsSheet.js`
- New: `src/components/student-space/sheets/SettingsSheet.tsx`
- New (if not present): `src/routes/settings.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove `SettingsSheet` import + instantiation
- Modify: `src/engine/student-space/style.css` — delete `.settings-sheet*` rules
- Modify: `src/lib/student-space/route-sheets.ts` — add `'settings'` to the surface set if needed
- New: `test/components/student-space/sheets/settings-sheet.test.tsx`

**Approach:** Single-tab sheet; reuse the same `<Sheet>` primitive. Content is small (settings toggles, presumably). Re-read the current `SettingsSheet.js` to enumerate exact controls — typically things like sound on/off, reduced motion preference, sign out shortcut, dev-only flags.

**Patterns to follow:** U3.

**Test scenarios:**
- Renders all current settings controls
- Each control toggles the engine slice it backs
- Navigating to `/settings` opens; Escape returns

**Verification:** `pnpm dev`; settings controls behave identically to current.

---

### U5. Migrate TrajectorySheet (dynamic header, status branching)

**Goal:** Render Path Finder as React content from `src/routes/trajectory.tsx`. Preserve dynamic header (Marcia status) and per-status body rendering.

**Requirements:** R1, R2, R6, R8, R12

**Dependencies:** U1, U2, U3

**Files:**
- Delete: `src/engine/student-space/Game/View/TrajectorySheet.js`
- New: `src/components/student-space/sheets/TrajectorySheet.tsx`
- New: `src/components/student-space/sheets/trajectory/StatusPill.tsx`
- New: `src/components/student-space/sheets/trajectory/status-panels/` — per-Marcia-status subcomponents (StarterPanel, DiffusedPanel, SearchingPanel, ForeclosedPanel, AchievedPanel)
- Modify: `src/routes/trajectory.tsx` — render `<TrajectorySheet />`
- Modify: `src/engine/student-space/Game/View/View.js` — remove TrajectorySheet
- Modify: `src/engine/student-space/style.css` — delete `.trajectory-sheet*` and `.path-finder*` rules
- New: `test/components/student-space/sheets/trajectory-sheet.test.tsx` (consolidates `test/engine/TrajectorySheet.pathway-disclosure.test.ts` + `student-space-trajectory.test.ts`)

**Approach:** Subscribe to `state.identityStatusOverride` + run `trajectoryHeuristics.audit(...)`. Compute `{ eyebrow, title, subtitle }` per status; render as the page header in the right pane (no chrome header in routed pages — per PR #32 D6). Status pill at top with `data-status` Tailwind variants (`data-[status=foreclosed]:bg-red-400`, etc.). Per-status body via switch component. "Show me all paths" escape hatch as React state. "Run sense-making" button calls `state.backend.runTrajectory()`. Disclosure pattern ported to React `<Disclosure>` or Base UI Collapsible.

**Patterns to follow:** U3 (slice + Sheet).

**Test scenarios:**
- Each Marcia status renders the correct panel + header copy + dot color
- Status flip via `IdentityStatusOverride.setOverride(...)` updates header + body + dot live
- "Show me all paths" expands/collapses
- "Run sense-making" calls backend; loading state shows
- `data-preview` attribute reflects override mode
- Deep link `/trajectory` or legacy `?sheet=path-finder` lands on the sheet

**Verification:** `pnpm dev`; SideRail → Path Finder opens; DevPalette status override flips header + body live; all five statuses render.

---

### U6. Migrate HistorySheet (Calendar embed + DayDetailCard + Three.js Growth preview)

**Goal:** Render History as React content. Embed CalendarPane + DayDetailCard inline (per PR #33). Preserve Growth tab's Three.js preview.

**Requirements:** R1, R2, R6, R8, R11

**Dependencies:** U1, U2, U3, U5

**Files:**
- Delete: `src/engine/student-space/Game/View/HistorySheet.js`
- Delete: `src/engine/student-space/Game/View/CalendarSheet.js` (absorbed)
- Delete: `src/engine/student-space/Game/View/DayDetailCard.js` (absorbed)
- New: `src/components/student-space/sheets/HistorySheet.tsx`
- New: `src/components/student-space/sheets/HistorySidenav.tsx`
- New: `src/components/student-space/sheets/HistoryTimelinePane.tsx`
- New: `src/components/student-space/sheets/HistoryGrowthPane.tsx`
- New: `src/components/student-space/sheets/CalendarPane.tsx`
- New: `src/components/student-space/sheets/DayDetailCard.tsx`
- New: `src/components/student-space/sheets/GrowthIslandPreview.tsx`
- New: `src/components/student-space/sheets/yearGrowthApi.ts` (extracted fetch helpers)
- Modify: `src/routes/history.tsx`, `src/routes/history.$tab.tsx` — render `<HistorySheet />`
- Modify: `src/engine/student-space/Game/View/View.js` — remove HistorySheet, CalendarSheet, DayDetailCard
- Modify: `src/engine/student-space/Game/View/OverlayController.js` — `'dayDetail'` and `'calendar'` registrations gone
- Modify: `src/engine/student-space/style.css` — delete `.history-sheet*`, `.calendar-sheet*`, `.calendar-day*`, `.day-detail-card*` rules
- Move/rewrite: `test/engine/student-space-history.test.ts`, `test/engine/student-space-calendar.test.ts` → `test/components/student-space/sheets/history-sheet.test.tsx`

**Approach:**
- Two-pane sheet via `<Sheet>`; left pane = sidenav (Timeline / Growth); right pane = active pane content
- Timeline pane: month grid (`CalendarPane`) on the left half of the right pane; DayDetailCard inline on the right half (per PR #33 layout)
- `CalendarPane`: renders calendar days as React buttons; `selectedDate` state in React; click swaps `.is-selected` (now a `data-selected` Tailwind variant) and propagates the date to `DayDetailCard`
- `DayDetailCard`: pure content renderer; reads captures/mood-pins/events for the selected date via engine slice subscriptions; cross-fade animation on date swap via Tailwind transitions
- Growth pane: stat tile row + `<GrowthIslandPreview year={selectedYear} />`. The preview owns a `<canvas>` mount and a `useEffect` that ports the current `HistorySheet.js:874-1056` Three.js code verbatim
- Year pill scrubber: reads `state.captures.years()`; `tabular-nums`, `data-active`, `data-has-data` Tailwind variants
- `/api/growth/*` fetch helpers extracted to `yearGrowthApi.ts`; consumed via React Query

**Patterns to follow:** U3, U5; `src/components/student-space/IslandProgressionOverlay.tsx` if it has Three.js patterns.

**Test scenarios:**
- Year pills render with correct `data-has-data` flags; clicking a pill updates selected year
- Timeline tab active: calendar renders; clicking a day updates DayDetailCard inline (no overlay)
- Day click preserves keyboard focus on the clicked cell (PR #33 invariant)
- Growth tab active: GrowthIslandPreview mounts a canvas; switching tabs disposes it
- Growth API failure: stat rows show fallback values
- `/history/timeline` and `/history/growth` deep-link work
- Legacy `?sheet=calendar` redirects to `/history/timeline` (verify route-sheets.ts behavior)

**Verification:** `pnpm dev`; History opens; Timeline tab shows inline day detail (no popup); clicking days updates content without jumping focus; Growth tab shows year-by-year preview; switching tabs disposes Three.js cleanly.

---

### U7. Migrate ProfileSheet (six tabs + auth + thumbnails + Share button)

**Goal:** Render Profile as React content. Absorb Relationships and Choices tabs directly (no more bridge). Preserve auth flow.

**Requirements:** R1, R2, R6, R8, R10

**Dependencies:** U1, U2, U3, U5, U6

**Files:**
- Delete: `src/engine/student-space/Game/View/ProfileSheet.js`
- Delete: `src/engine/student-space/profile-tab-react-bridge.tsx`
- Delete (conditional, see D13): `src/engine/student-space/Game/View/profile-tokens.constants.js`
- New: `src/components/student-space/sheets/ProfileSheet.tsx`
- New: `src/components/student-space/sheets/ProfileSidenav.tsx`
- New: `src/components/student-space/sheets/ProfileIdentityHeader.tsx`
- New: `src/components/student-space/sheets/profile/tabs/ValuesTab.tsx`, `InterestsTab.tsx`, `PersonalityTab.tsx`, `SkillsTab.tsx`
- New: `src/components/student-space/sheets/profile/AvatarThumbnail.tsx` (ThumbnailRenderer integration in useEffect)
- New: `src/components/student-space/sheets/profile/QuoteCard.tsx`
- Modify: `src/components/RelationshipsPageView.tsx`, `ChoicesPageView.tsx` — remove deprecated `omitChrome` prop
- Modify: `src/routes/profile.tsx`, `profile.$tab.tsx` — render `<ProfileSheet />`
- Modify: `src/engine/student-space/Game/View/View.js` — remove ProfileSheet
- Modify: `src/engine/student-space/style.css` — delete `.profile-sheet*`, `.profile-id*`, `.bento-tile*`, `.profile-sheet__quote-list*` rules
- Move/rewrite: `test/engine/ProfileSheet.tabs.test.ts`, `ProfileSheet.tldr.test.ts`, `profile-sheet-auth-actions.test.ts`, `profile-sheet-close-css.test.ts` → consolidated `test/components/student-space/sheets/profile-sheet.test.tsx`

**Approach:**
- Two-pane sheet via `<Sheet>`; left pane = `ProfileIdentityHeader` + `ProfileSidenav` (vertical six-tab nav per PR #33); right pane = active tab content
- Identity header: `<AvatarThumbnail>` (Three.js thumbnail in `useEffect`), name, class, Share button, auth slot
- VIPS tabs (Values/Interests/Personality/Skills): port TLDR hero + dimension prose (most-common / quietly-emerging / summary / open-question) + collection bento + timeline + disclosures
- Relationships tab: composes existing `RelationshipsPageView` (without `omitChrome`)
- Choices tab: composes existing `ChoicesPageView` (without `omitChrome`)
- Hero facet wash: `style={{ '--facet-accent': PROFILE_COLORS[facet].accent }}` on wrapper; Tailwind `bg-[var(--facet-accent)]` or `@theme`-defined facet utility classes
- Share button: triggers `<ShareDialog>` via `useEngineOverlay()` (the dialogue itself moves in U10; for now, leave the click as a noop or temp-mount the existing vanilla ShareDialog with a deprecation comment)
- Auth slot: reads `state.auth` via `useEngineSliceVersion`; renders sign-in or sign-out; sign-out sequencing preserved (`window.__studentSpaceGame.dispose()` then submit body-scoped form)

**Patterns to follow:** U3, U5, U6; `src/components/RelationshipsPageView.tsx`, `ChoicesPageView.tsx`.

**Test scenarios:**
- Anonymous auth: sign-in link visible
- Signed-in auth: more menu visible; clicking opens sign-out option
- Sign-out: engine `dispose` called before form submit (spy call order)
- Tab switch Values → Relationships: panel content changes
- Bento tile click on a values claim: opens claim detail; `<AvatarThumbnail>` mock renders
- Forget two-tap: first tap arms, second tap calls forget mutation; outside click cancels
- `/profile/values`, `/profile/relationships`, etc. deep-link work
- Share button click sets the overlay state (until U10 wires the React ShareDialog)

**Verification:** `pnpm dev`; Profile opens via SideRail; all six tabs work; share dialog still triggers (vanilla until U10); sign-in/out work.

---

## Phase C — Capture sheets

### U8. Migrate AskSheet (largest)

**Goal:** Render Ask flow as a React drawer. Preserve every sub-state: capture stage, reframe stage, committed stage, live chat, emoji panel, photo capture, replay.

**Requirements:** R1, R4, R5, R6

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/AskSheet.js`
- New: `src/components/student-space/capture/AskSheet.tsx`
- New: `src/components/student-space/capture/ask/CaptureStage.tsx`
- New: `src/components/student-space/capture/ask/ReframeStage.tsx`
- New: `src/components/student-space/capture/ask/CommittedStage.tsx`
- New: `src/components/student-space/capture/ask/LiveChat.tsx`
- New: `src/components/student-space/capture/ask/EmojiPanel.tsx`
- New: `src/components/student-space/capture/ask/PhotoCapture.tsx`
- New: `src/components/student-space/capture/ask/ReplayView.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove AskSheet
- Modify: `src/components/StudentSpaceHost.tsx` — mount `<AskSheet />` under the overlay provider
- Modify: `src/engine/student-space/style.css` — delete `.ask-sheet*`, `.ask-chat*`, `.ask-live-chat*`, `.ask-reframe*`, `.capture-stage*`, `.half-sheet*` rules
- New: `test/components/student-space/capture/ask-sheet.test.tsx`

**Approach:**
- `<AskSheet>` opens when `useEngineOverlay().activeCapture === 'ask'`. Uses the existing `<Drawer>` primitive (`src/components/ui/drawer.tsx`) with `modal={false}`.
- Step state in React (`useState<'capture' | 'reframe' | 'committed'>`)
- Subscribes to `state.captures.ask` slice (or whatever the ask flow's slice is — verify from current AskSheet.js)
- Live chat: existing WebSocket / realtime hookup stays; only the DOM rendering changes
- Photo capture: `<canvas>` ref + `useEffect` that calls the same media-capture APIs as the current code
- Emoji panel: Tailwind grid; same emoji table
- Replay views: read from slice
- Body class `has-capture-sheet` toggled by overlay provider

**Patterns to follow:** `src/components/ui/drawer.tsx`; existing `AskSheet.js` for state machine + transitions.

**Test scenarios:**
- Open via `useEngineOverlay().setActiveCapture('ask')`: drawer visible
- Capture → reframe → committed transitions work
- Live chat receives messages from a mocked socket
- Emoji panel pick lands in committed payload
- Photo capture mock fires the right slice action
- Replay view renders for a mocked committed entry
- Closing via × resets `activeCapture` to null

**Verification:** `pnpm dev`; CaptureFab → Ask → run a capture end-to-end; replay works.

---

### U9. Migrate MoodSheet

**Goal:** Render Mood flow as a React drawer.

**Requirements:** R1, R4, R5, R6

**Dependencies:** U1, U2 (independent of U8, can run in parallel)

**Files:**
- Delete: `src/engine/student-space/Game/View/MoodSheet.js`
- New: `src/components/student-space/capture/MoodSheet.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove MoodSheet
- Modify: `src/components/StudentSpaceHost.tsx` — mount `<MoodSheet />`
- Modify: `src/engine/student-space/style.css` — delete `.mood-sheet*` rules
- New: `test/components/student-space/capture/mood-sheet.test.tsx`

**Approach:** Drawer with mood selection (existing `EmotionPicker` composed inside or rewritten inline); intensity tile rows; commit button; tags/notes input. Subscribes to `state.moodPins` slice.

**Test scenarios:**
- Mood selection updates internal state
- Intensity selection updates internal state
- Commit calls `moodPins.add(...)`
- Close resets state

**Verification:** `pnpm dev`; CaptureFab → Mood → commit a mood; reflect in MoodHud.

---

### U10. Migrate CaptureChooser + CaptureFab

**Goal:** Render the capture chooser popover and the floating Action button as React.

**Requirements:** R1, R4, R6

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/CaptureChooser.js`
- Delete: `src/engine/student-space/Game/View/CaptureFab.js`
- New: `src/components/student-space/capture/CaptureChooser.tsx`
- New: `src/components/student-space/capture/CaptureFab.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove both
- Modify: `src/components/StudentSpaceHost.tsx` — mount both
- Modify: `src/engine/student-space/style.css` — delete `.capture-chooser*`, `.capture-fab*` rules
- New tests under `test/components/student-space/capture/`

**Approach:**
- `<CaptureFab>`: floating action button (bottom-right or similar dock). On click, sets `useEngineOverlay().activeChooser = true`. Subscribes to engine state for any visibility gates.
- `<CaptureChooser>`: visible when `activeChooser === true`. Lists the three capture types (Ask, Mood, Photo). Clicking one sets `activeCapture` and clears `activeChooser`. Body class `has-chooser` toggled by overlay provider.

**Test scenarios:**
- FAB click opens chooser
- Chooser select Ask: chooser closes, AskSheet opens
- Body classes toggle correctly

**Verification:** `pnpm dev`; FAB → Chooser → each capture type opens.

---

## Phase D — Inline overlays + dialogues

### U11. Migrate ShareDialog

**Goal:** Render ShareDialog as a React Dialog. Wire it to the Share button in ProfileSheet (replacing the temp-mount from U7).

**Requirements:** R1, R6

**Dependencies:** U1, U2, U7

**Files:**
- Delete: `src/engine/student-space/Game/View/ShareDialog.js`
- New: `src/components/student-space/dialogues/ShareDialog.tsx`
- Modify: `src/components/student-space/sheets/ProfileSheet.tsx` — Share button now triggers React ShareDialog via `useEngineOverlay()` or local state
- Modify: `src/engine/student-space/style.css` — delete share-dialog rules
- New: `test/components/student-space/dialogues/share-dialog.test.tsx`

**Approach:** Base UI `Dialog` with `modal={true}` (this IS modal). Reads the share token slice / share state. Click-to-copy URL behavior preserved.

**Verification:** `pnpm dev`; Profile → Share button opens dialog; copy-link works.

---

### U12. Migrate KiraDialogue + KiraNarrator

**Goal:** Render Kira's spoken/written dialogue overlays as React.

**Requirements:** R1, R4, R6

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/KiraDialogue.js`, `KiraNarrator.js`
- New: `src/components/student-space/dialogues/KiraDialogue.tsx`
- New: `src/components/student-space/dialogues/KiraNarrator.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove both
- Modify: `src/engine/student-space/Game/View/Kira.js` — remove DOM dialogue integration; engine Kira (3D mesh) signals dialogue state via a slice or event
- Modify: `src/components/StudentSpaceHost.tsx` — mount both
- Modify: `src/engine/student-space/style.css` — delete kira dialogue rules
- New tests

**Approach:** Kira's 3D mesh stays vanilla. The dialogue text overlay reads from a Kira-state slice and renders speech bubbles or narrator text. Position computed via `useWorldPosition(kiraMeshRef)` for the dialogue bubble.

**Verification:** `pnpm dev`; trigger Kira dialogue (e.g., proximity to Kira mesh); React bubble appears positioned above Kira.

---

## Phase E — HUDs (parallel-safe)

### U13. Migrate all HUDs in a single unit

**Goal:** Render HourHud, MoodHud, ZoomHud, FpsOverlay, StatusPreviewHud as React.

**Requirements:** R1, R6

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/HourHud.js`, `MoodHud.js`, `ZoomHud.js`, `FpsOverlay.js`, `StatusPreviewHud.js`
- New: `src/components/student-space/hud/HourHud.tsx`, `MoodHud.tsx`, `ZoomHud.tsx`, `FpsOverlay.tsx`, `StatusPreviewHud.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove all HUD instantiations
- Modify: `src/components/StudentSpaceHost.tsx` — mount the five HUDs
- Modify: `src/engine/student-space/style.css` — delete `.hour-hud*`, `.mood-hud*`, `.zoom-hud*`, `.fps-overlay*`, `.status-preview-hud*` rules
- New tests under `test/components/student-space/hud/`

**Approach:**
- Each HUD subscribes to its relevant engine slice or signal:
  - `HourHud`: time of day (engine ticks update a slice)
  - `MoodHud`: current mood + intensity (`state.moodPins.current`)
  - `ZoomHud`: camera zoom (subscribe to a camera-zoom signal)
  - `FpsOverlay`: stats.js integration (only in dev) — wraps `stats.js` instance in a `useEffect`
  - `StatusPreviewHud`: status override preview indicator
- All HUDs use the `<Hud>` primitive shell for positioning + ARIA + motion-reduce

**Test scenarios:** each HUD renders, updates on engine state change, hides when appropriate, respects motion preferences.

**Verification:** `pnpm dev`; HUDs render in same positions as current; toggle dev FPS overlay; HUDs disappear on routed pages.

---

## Phase F — In-world labels + pickers

### U14. Migrate in-world labels (ObjectPeek, HoverProbe, HoverCta, Mailbox label, Telescope label)

**Goal:** Render in-world DOM labels as React with `useWorldPosition` projection.

**Requirements:** R1, R7

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/ObjectPeek.js`, `HoverProbe.js`, `HoverCta.js`
- Modify: `src/engine/student-space/Game/View/Mailbox.js`, `Telescope.js` — remove DOM label DOM construction; the 3D meshes stay; React reads mesh position via engine API
- New: `src/components/student-space/world/ObjectPeek.tsx`, `HoverProbe.tsx`, `HoverCta.tsx`, `MailboxLabel.tsx`, `TelescopeLabel.tsx`
- Modify: `src/components/StudentSpaceHost.tsx` — mount all five
- Modify: `src/engine/student-space/style.css` — delete in-world label rules
- New tests

**Approach:**
- Each label component takes a mesh reference from the engine (via context or a per-label engine method like `live.getMeshRef('mailbox')`)
- `useWorldPosition(meshRef)` returns `{ x, y, visible }` on every frame
- Render `<WorldLabel position={{ x, y }}>...</WorldLabel>` with `visible` driving `opacity` / `pointer-events`
- HoverProbe: tracks mouse + raycasts; engine still owns the raycast, React reads the hover-target slice
- ObjectPeek: shows label for the currently-hovered object (Mailbox, Telescope, Tree, etc.); content varies by object type
- HoverCta: action prompt that appears on hover ("click to read")

**Test scenarios:** label position updates on camera move; label hides when target out of frustum; hover state from engine drives visibility.

**Verification:** `pnpm dev`; hover over Mailbox → label appears positioned correctly; navigate around — label follows.

---

### U15. Migrate BirdPicker + TrackPicker

**Goal:** Render the bird + track picker popovers as React.

**Requirements:** R1, R6

**Dependencies:** U1, U2

**Files:**
- Delete: `src/engine/student-space/Game/View/BirdPicker.js`, `TrackPicker.js`
- New: `src/components/student-space/pickers/BirdPicker.tsx`, `TrackPicker.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove both
- Modify: `src/components/StudentSpaceHost.tsx` — mount both (`useEngineOverlay().activePicker === 'bird' | 'track'`)
- Modify: `src/engine/student-space/style.css` — delete `.bird-picker*`, `.track-picker*` rules; also the `body.has-overlay .bird-picker { display: none }` rules that hide pickers when sheets open

**Approach:**
- Base UI `Popover` if appropriate; popups attached to a trigger button
- Subscribe to the bird-set / track-set slice
- `body.has-overlay` consumer logic moves into a React `useEffect` that reads route + overlay state and hides the picker when a routed sheet is open

**Test scenarios:** popover opens, selects a bird/track, mutates the slice, closes.

**Verification:** `pnpm dev`; bird picker + track picker work identically.

---

## Phase G — Onboarding

### U16. Migrate OnboardingFlow orchestrator + Greeting + SkipButton

**Goal:** React state machine for the onboarding flow plus the first step.

**Requirements:** R1, R4, R6

**Dependencies:** U1, U2

**Files:**
- New: `src/components/student-space/onboarding/OnboardingFlow.tsx`
- New: `src/components/student-space/onboarding/Greeting.tsx`
- New: `src/components/student-space/onboarding/SkipButton.tsx`
- Delete: `src/engine/student-space/Game/View/Onboarding/OnboardingFlow.js`, `Greeting.js`, `SkipButton.js`, `OnboardingSkip.js` (consolidate into SkipButton)
- Modify: `src/components/StudentSpaceHost.tsx` — mount `<OnboardingFlow />` when `state.onboarding.isComplete === false`
- Modify: `src/engine/student-space/style.css` — delete `.onb-greeting*`, `.skip-button*` rules
- New tests

**Approach:** State machine in React; each step renders the appropriate subcomponent and accepts an `onNext` callback. Greeting is step 1. SkipButton is a global escape hatch present across multiple steps.

**Test scenarios:** flow boots in Greeting; clicking Continue advances to FirstChat (when U17 lands); Skip jumps to done.

**Verification:** `pnpm dev`; clear onboarding slice; flow starts in Greeting.

---

### U17. Migrate FirstChat + FirstMood

**Goal:** Render the first chat + first mood onboarding steps.

**Requirements:** R1, R6

**Dependencies:** U16

**Files:**
- Delete: `src/engine/student-space/Game/View/Onboarding/FirstChat.js`, `FirstMood.js`
- New: `src/components/student-space/onboarding/FirstChat.tsx`, `FirstMood.tsx`
- Modify: `src/components/student-space/onboarding/OnboardingFlow.tsx` — wire these steps in
- Modify: `src/engine/student-space/style.css` — delete onb-first-chat, onb-first-mood rules
- New tests

**Approach:** Each step reads from / writes to its engine slice; calls `onNext(payload)` when done.

**Verification:** `pnpm dev`; onboarding advances through Greeting → FirstChat → FirstMood.

---

### U18. Migrate EggHatcher + IslandReveal

**Goal:** Render the egg-hatching animation + island reveal steps.

**Requirements:** R1, R7 (IslandReveal may involve world-position label work)

**Dependencies:** U16

**Files:**
- Delete: `src/engine/student-space/Game/View/Onboarding/EggHatcher.js`, `IslandReveal.js`
- New: `src/components/student-space/onboarding/EggHatcher.tsx`, `IslandReveal.tsx`
- Modify: `src/components/student-space/onboarding/OnboardingFlow.tsx` — wire steps in
- Modify: `src/engine/student-space/style.css` — delete onb-egg, onb-reveal rules
- New tests

**Approach:**
- EggHatcher: animation timeline expressed as Tailwind motion utilities or a small framer-motion-style sequence (NO framer-motion dep — use Tailwind animations or CSS keyframes referenced via Tailwind)
- IslandReveal: triggers engine actions (camera fly-in) at certain milestones; React drives the timing

**Verification:** `pnpm dev`; flow completes egg-hatch → island reveal → world.

---

### U19. Migrate EdupassLogin

**Goal:** Render the Edupass sign-in mid-flow as React.

**Requirements:** R1, R10

**Dependencies:** U16

**Files:**
- Delete: `src/engine/student-space/Game/View/Onboarding/EdupassLogin.js`
- New: `src/components/student-space/onboarding/EdupassLogin.tsx`
- Modify: `src/components/student-space/onboarding/OnboardingFlow.tsx` — wire the side-branch entry
- Modify: `src/engine/student-space/style.css` — delete onb-edupass rules
- New tests

**Approach:** Sign-in form; submits to the existing `/api/auth/...` endpoints; preserves the body-scoped form pattern. On success, returns control to the flow state machine.

**Verification:** `pnpm dev`; trigger Edupass during onboarding; sign in; flow resumes.

---

## Phase H — Nav rail + cleanup

### U20. Migrate SideRail to React

**Goal:** Render SideRail as a React component using TanStack `<Link>` for routed sheets.

**Requirements:** R1, R2, R6

**Dependencies:** U3-U7 (all routed sheets migrated first so SideRail's Link targets are React)

**Files:**
- Delete: `src/engine/student-space/Game/View/SideRail.js`
- New: `src/components/student-space/SideRail.tsx`
- Modify: `src/engine/student-space/Game/View/View.js` — remove SideRail
- Modify: `src/components/StudentSpaceHost.tsx` — mount `<SideRail />`
- Modify: `src/engine/student-space/style.css` — delete `.side-rail*` rules
- New: `test/components/student-space/side-rail.test.tsx`

**Approach:**
- Five rail buttons: Home (`/`), Letters (`/letters`), History (`/history`), Profile (`/profile`), Path Finder (`/trajectory`)
- TanStack `<Link>` for each; `data-active` driven by current route match
- Settings entry if applicable (per current SideRail)
- Reads onboarding state to hide the rail during onboarding (existing behavior)

**Test scenarios:** clicking rail buttons navigates; active state matches current route; hidden during onboarding.

**Verification:** `pnpm dev`; rail behaves identically.

---

### U21. Final cleanup: remove SheetChrome, prune style.css, update CLAUDE.md

**Goal:** Delete the remaining stubs; collapse `style.css` to the engine-substrate baseline; rewrite `CLAUDE.md`.

**Requirements:** R6, R8, R9, R13, R14

**Dependencies:** All prior units

**Files:**
- Delete: `src/engine/student-space/Game/View/SheetChrome.js`, `SheetChrome.d.ts`
- Delete (if all consumers gone): `src/engine/student-space/Game/View/OverlayController.js`, `OverlayController.d.ts`
- Delete (if no remaining engine consumer): `src/engine/student-space/Game/View/profile-tokens.constants.js` + drift test
- Modify: `src/engine/student-space/style.css` — final prune. Target end state:
  - `:root` CSS variables that engine Three.js code writes (e.g., `--sky-top`, `--sky-mid`, `--sky-bottom`, `--ink`) — keep
  - Global typography baseline (`html`, `body`) — keep
  - `.game` canvas wrapper + frame inset + mobile overrides — keep
  - Everything else — DELETED
- Modify: `CLAUDE.md` — rewrite end-to-end:
  - New "Engine view architecture" section: routed pages via TanStack Router; non-routed overlays via `<EngineOverlayProvider>` in `StudentSpaceHost.tsx`; in-world labels via `useWorldPosition`
  - Reference paths to new primitives (`src/components/ui/sheet.tsx`, `src/components/ui/hud.tsx`, `src/components/ui/world-label.tsx`)
  - Replace "Sheet chrome contract" with "Sheet primitive contract" (or remove section if it's now redundant with primitive's TypeScript types)
  - Remove all references to `SheetChrome.js`, `TopNav.js`, `OverlayController.js` (if removed)
  - Document the engine ↔ React seam: `useEngineSliceVersion`, `useEngine`, `useWorldPosition`, `useEngineOverlay`
  - Document the CSS policy: Tailwind + `@theme`; `style.css` for canvas only

**Test scenarios (verification gates):**
- `rg "SheetChrome" src/` returns no matches
- `rg "OverlayController" src/` returns matches only in (a) the file being deleted (b) `CLAUDE.md` historic references in deleted sections — verify zero remaining imports
- `rg "profile-tab-react-bridge" src/` returns no matches
- `rg "\.sheet-chrome|\.history-sheet|\.profile-sheet|\.letters-sheet|\.trajectory-sheet|\.path-finder|\.settings-sheet|\.ask-sheet|\.mood-sheet|\.calendar-sheet|\.capture-chooser|\.capture-fab|\.hour-hud|\.mood-hud|\.zoom-hud|\.fps-overlay|\.status-preview-hud|\.bird-picker|\.track-picker|\.day-detail-card|\.share-dialog|\.kira-dialogue|\.kira-narrator|\.object-peek|\.hover-probe|\.hover-cta|\.onb-|\.side-rail" src/` returns no matches in TS/JS files (CSS classes are removed at the source)
- `pnpm check` and `pnpm test` pass
- `src/engine/student-space/style.css` line count under 1,500 (verify via `wc -l`)
- CLAUDE.md no longer references SheetChrome / TopNav / SheetChrome contract by name

**Verification:** Full manual smoke: dev server boots; SideRail buttons navigate cleanly; all sheets work; all HUDs work; capture flows work; onboarding (clear slice and re-run) works; sign-out works; switching to a routed page pauses engine.

---

# System-Wide Impact

| Surface | Before | After | Change shape |
|---|---|---|---|
| Routed sheet rendering | Engine `View.js` constructs sheet classes; route pages render `null` | Route pages render React sheet components directly | Engine `View.js` shrinks; route pages take ownership |
| Non-routed overlay coordination | `OverlayController` JS singleton | `<EngineOverlayProvider>` + `useEngineOverlay()` React context | Body-class toggling moves to React effects |
| Engine slice subscriptions | `slice.subscribe()` called from JS classes | `useEngineSliceVersion(slice)` hook called from React | Same slice API; new consumer pattern |
| In-world DOM labels | JS classes that hand-position via inline `style.transform` | React `<WorldLabel>` + `useWorldPosition(meshRef)` | Same projection math, different consumer |
| Engine update loop | rAF gating via `setRenderActive(boolean)` | Unchanged | No change |
| Three.js scene | Engine renders, materials, shaders | Unchanged | No change |
| `style.css` size | 9,136 lines | < 1,500 lines | -83% |
| `@theme` size | 9 token declarations | ~30-50 token declarations | Canonical token store |
| `CLAUDE.md` | "Sheet chrome contract" section | "Engine view architecture" section | Rewritten |
| `OverlayController.js` | 138 lines | Removed (or shrunk to body-class toggler) | Decided by U21 grep |
| `SheetChrome.js` | 392 lines | Removed | After Phase B |
| `profile-tab-react-bridge.tsx` | 151 lines | Removed | After Phase B U7 |
| `View.js` content | Constructs ~30+ DOM surfaces | Constructs only Three.js scene objects | Shrinks dramatically |
| Vitest test layout | Engine tests in `test/engine/` | React component tests in `test/components/student-space/` | Tests migrate per unit |

---

# Risks

### Risk: Base UI Dialog `modal={false}` quirks at Base UI rc.0 scale
The current `dialog.tsx` and `drawer.tsx` use default `modal={true}`. Spreading `modal={false}` across many sheets exposes any rc.0 bugs.
**Mitigation:** U1's primitive test gates this. If Base UI surprises us, U1 absorbs the workaround before Phase B starts.

### Risk: `useWorldPosition` performance with many in-world labels
~5 in-world labels (ObjectPeek, HoverProbe, HoverCta, Mailbox, Telescope) update on every frame. If implemented naively (React re-render per frame), that's a serious performance cost.
**Mitigation:** `useWorldPosition` writes `style.transform` via `useRef` + direct DOM mutation, NOT via React state. The hook returns `null` from the component perspective (no re-render) but mutates the DOM ref. Mirror the existing imperative implementation's perf characteristics exactly.

### Risk: Onboarding state machine vs engine timing
The current onboarding flow has coupled engine animations (camera fly-in during IslandReveal, scene state changes between steps). Translating the orchestration to React without breaking timing is non-trivial.
**Mitigation:** U16-U19 keep the engine-side animation triggers as direct engine method calls from React `useEffect`s — same timing, different orchestrator. Each step is verified independently in `pnpm dev`.

### Risk: AskSheet's WebSocket / realtime integration
AskSheet has live chat via OpenAI Realtime. The current code likely binds to a singleton WebSocket connection with imperative event listeners.
**Mitigation:** U8 keeps the WebSocket connection logic (in `src/server/` or wherever it lives) untouched; only the React subscribes/unsubscribes via `useEffect`. Treat the realtime layer as an external dependency.

### Risk: `style.css` prune misses an active rule
Deleting 7,500+ lines of CSS across phases creates risk that a needed rule is dropped.
**Mitigation:** Per-unit CSS deletion is scoped to that unit's class prefixes; grep validates that no remaining JS/TSX file references the deleted classes. Final U21 grep is comprehensive.

### Risk: Engine slice notify cascades across many React subscribers
After the refactor, many React surfaces simultaneously subscribe to engine slices. A slice notify could cascade into many re-renders.
**Mitigation:** Each subscriber re-renders only the leaf component that consumes the slice. The version-bump pattern is per-component. Profile during integration if needed; otherwise the dispatch cost is small (slice notify is a synchronous loop over subscribers).

### Risk: `OverlayController` removal breaks an engine consumer I haven't identified
Engine-side code may read `OverlayController.isOpen(key)` for gating (e.g., camera input suspension while a sheet is open).
**Mitigation:** U21 starts with a grep audit. Any engine-side consumer is either (a) replaced by a slice or event that React fills, or (b) the `OverlayController` shrinks to support just that consumer.

### Risk: PR-level reviewability if migrations bundle
A 22-unit refactor in one PR is unreviewable.
**Mitigation:** Each unit is a separate commit (or PR) and ships verifiable behavior. Phases A and B may bundle into ~6 PRs; phases C-H are 1-2 PRs each. The plan does NOT mandate monolithic execution.

### Risk: Three.js renderer / canvas styling accidentally migrated
The user explicitly excluded Three.js styling.
**Mitigation:** Files in scope are exclusively under `Game/View/*Sheet.js`, `Game/View/*Hud.js`, `Game/View/*Picker.js`, `Game/View/Onboarding/`, `SideRail.js`, etc. Three.js scene-object files (`Tree`, `Sprouts`, `Flowers`, `Sky`, `CssSky`, `Aurora`, `Renderer`, `Camera`, `Materials`, `ThumbnailRenderer`) are never touched. Cross-check before deleting any file.

### Risk: CalendarPane keyboard focus retention regression (PR #33 invariant)
PR #33 added `.is-selected` + `aria-selected` swap to preserve keyboard focus when clicking days. The React rewrite must preserve this.
**Mitigation:** U6 test scenarios explicitly cover focus retention. Use `data-selected` Tailwind variant; never re-render the whole calendar on date change — only the selected-day flag flips.

### Risk: AvatarThumbnail (ThumbnailRenderer) integration
ProfileSheet uses ThumbnailRenderer (offscreen Three.js) for the avatar thumbnail. Wrapping in a React `useEffect` requires careful lifecycle management.
**Mitigation:** U7 follows the GrowthIslandPreview pattern from U6 (proven by then). ThumbnailRenderer's API is already imperative-friendly (`renderThumbnail(facet, callback)`).

---

# Test Strategy

- **Primitive tests (U1):** `<Sheet>`, `<Hud>`, `<WorldLabel>` covered in isolation. `useEngineSliceVersion`, `useEngineOverlay`, `useWorldPosition` hooks tested in isolation.
- **Engine host test (U2):** EngineHost survives route changes; engine instance is stable; rAF pause/resume on navigation.
- **Per-surface tests (U3-U20):** every migrated surface gets a React component test that mocks the relevant engine slice singletons (following `test/components/RelationshipsPageView.engine-round-trip.test.tsx`).
- **Engine-side tests in `test/engine/`** are migrated, not deleted — coverage parity is auditable in PR diff.
- **No new E2E.** Behavior is unchanged; existing manual-smoke patterns suffice.
- **Cross-phase smoke (U21):** full manual smoke after final cleanup — every sheet, every HUD, every capture flow, every onboarding step, sign-in, sign-out, route navigation, mobile breakpoints, reduced-motion.

---

# Verification

The refactor is complete when:

1. Every file listed under "In scope" has been deleted or replaced with its React equivalent; every CSS class for those surfaces has been removed from `src/engine/student-space/style.css`.
2. `src/engine/student-space/Game/View/SheetChrome.js`, `SheetChrome.d.ts`, and `src/engine/student-space/profile-tab-react-bridge.tsx` are deleted. `OverlayController.js` is either deleted or shrunk to a body-class toggler (decision made in U21).
3. `src/engine/student-space/style.css` line count is under 1,500.
4. `pnpm check` passes (Biome + tsc).
5. `pnpm test` passes (Vitest).
6. `pnpm dev` boots; SideRail navigates between sheets; each sheet renders identically to current main; each HUD shows correct values; every capture flow works end-to-end; onboarding runs cleanly when the slice is cleared; sign-in / sign-out work; engine rAF pauses on routed pages and resumes on `/`.
7. CLAUDE.md is rewritten end-to-end; no references to `SheetChrome`, `TopNav`, or `OverlayController` remain except in historic plan files; the new contract document references the new primitives and hooks.
8. `pnpm build` output size for the production bundle is not significantly larger than current main (engine JS removed roughly offsets React component code added; CSS is much smaller).
9. Three.js scene content (canvas, meshes, materials, shaders, audio) is untouched — verified by `git diff main` showing zero functional changes to `Renderer.js`, `Camera.js`, `Sky.js`, `CssSky.js`, `Aurora.js`, `Tree.js`, `Sprouts.js`, `Flowers.js`, `Fruits.js`, `Grass.js`, `FacetView.js`, `Particles.js`, `ThumbnailRenderer.js`, `Materials/*`, `renderQuality.js`, `Sound.js`, `Noises.js`, `Rain.js`, `Rainbow.js`, `Butterflies.js`, `Fireflies.js`, `Island.js` (imports may shift if these files imported a removed sheet — verify and adjust).
