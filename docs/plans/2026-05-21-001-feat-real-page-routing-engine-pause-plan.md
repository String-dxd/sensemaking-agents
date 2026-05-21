---
title: Real page routing, modal-to-page conversion, My Identity layout fix, engine pause on navigation
type: feat
status: active
date: 2026-05-21
---

# Real page routing, modal-to-page conversion, My Identity layout fix, engine pause on navigation

## Overview

Today the app exposes one user-facing route (`/`). "Home / My Identity / History / Letters / Path Finder" are full-viewport `SheetChrome` overlays owned by the vendored engine. Deep-link reads via `?sheet=…` work, but opening a sheet from the `SideRail` never updates the URL, browser back doesn't unwind sheet history, every routed sheet still renders a `×` close button, the My Identity tab strip and tab content read as visually disconnected, and the engine's rAF loop keeps running while a full-viewport sheet covers the world — driving the shaking/perf issues reported when switching pages.

This plan turns the five `SheetChrome` sheets into real nested TanStack routes with bidirectional URL ↔ overlay sync, drops the `×` affordance on routed pages, fixes the Profile tab/content hierarchy, cleans demo-visible Home glitches, and hard-pauses the engine render loop while a non-`/` route is active.

---

## Problem Frame

Four pains stack:

1. **No real routing.** Tapping Profile / History / Letters / Path Finder on the side rail mutates `OverlayController.active` but leaves the URL on `/`. Browser back from inside a sheet returns to whatever page the user was on *before* the app, not to the world. Deep-links to `/?sheet=profile` work, but only on initial load — internal nav doesn't round-trip through the router.
2. **Modal residue on pages-that-are-now-routes.** Every routed sheet still renders the shared `×` close button (via `SheetChrome({ withCloseButton: true })`). On a page that's reached by navigation, the `×` is incoherent — there's nothing modal to dismiss. The SideRail and browser back are the right primitives.
3. **My Identity layout hierarchy.** In `ProfileSheet.js`, the `.profile-sheet__tabs` rail and the per-tab content panels are rendered as siblings of the identity card, with no visual containment that ties a tab to "the content directly under me." The reported bug — "tabs are separate from changing content" — reads as a hierarchy/affordance gap, not a logic bug.
4. **Engine never sleeps.** `Game.js` already cancels its rAF on `visibilitychange`, but not when a routed sheet covers the world. The Three.js scene keeps ticking behind the sheet, costing battery and (per the report) producing visible shaking when switching pages.

The repo already has the structural pieces to fix this cleanly: TanStack Router with file-based routes, `OverlayController` with a single registered-surface map, `SheetChrome` with `withCloseButton` opt-out, and an `_rafId` suspension pattern. The work is connecting them.

---

## Requirements Trace

- **R1.** Tapping a sheet entry (SideRail icon, in-world hotspot link, deep-link) updates `window.location.pathname` to the canonical route (`/profile`, `/profile/values`, `/history`, `/history/timeline`, `/letters`, `/trajectory`). The URL update is visible in the address bar.
- **R2.** Browser back from any routed sheet returns to the previous URL (most commonly `/`, closing the sheet). Browser forward re-opens it.
- **R3.** Direct address-bar entry to `/profile/values`, `/profile/relationships`, `/history/timeline`, etc. opens the corresponding sheet + tab on first paint, after engine boot.
- **R4.** Routed sheets (`/profile`, `/history`, `/letters`, `/trajectory`, and the calendar embed inside History) do not render the `×` close button. Capture sheets (Ask / Photo / Mood / Chooser / KiraDialogue) keep their close affordances unchanged — they are not navigation routes.
- **R5.** Profile (My Identity) renders with the tab strip visually anchored to the content underneath it: a single `tablist + tabpanel` block, no full-bleed identity card or unrelated surface between them. The active tab and the panel below share a containing surface.
- **R6.** Profile gains (or surfaces, depending on current state) the overview/summary block referenced in design — kept light-touch in this plan; the goal is hierarchy correctness, not a full redesign.
- **R7.** Home / `/` no longer shows the demo-visible visual glitches the team flagged (broken lines, spacing, stray chrome). The bar is "demo-safe," not a redesign.
- **R8.** While the active route is anything other than `/` (the world view), the engine's rAF render loop is suspended. Returning to `/` resumes the loop deterministically with no lost state.
- **R9.** No regression in sheet exclusivity, body-class toggles, `body.has-overlay` semantics, child-overlay portaling, or React-mirrored content (Relationships, Choices, FacetView). All of the SheetChrome contract documented in `CLAUDE.md` still holds.
- **R10.** Existing `?sheet=…` deep-links remain reachable (back-compat redirect on `/`) so external links and bookmarks created before this change still land in the right place.

---

## Scope Boundaries

### In scope

- New routes: `/profile`, `/profile/$tab`, `/history`, `/history/$tab`, `/letters`, `/trajectory`. Each backed by a thin route component that drives `OverlayController` via the URL.
- Lifting `StudentSpaceHost` mount point so the engine survives navigation (mount it at `__root.tsx` or an equivalent shared layout, not at `/`).
- A URL ↔ overlay sync layer (new `src/lib/student-space/route-sync.ts`) that subscribes to router location and bridges in both directions.
- A new `onNavigate(href)` host hook on the engine boot contract, so `SideRail` and other in-engine nav sources can ask the router to navigate instead of calling `OverlayController` directly.
- Toggling `withCloseButton: false` on the five routed `SheetChrome` consumers and removing/hiding the `×` styling for those instances. Wire Escape on those sheets to navigate back to `/` (matching the existing Escape-to-close UX semantically).
- ProfileSheet layout refactor inside the engine: re-group tabs and panels so they share a container; preserve the React-backed tab bridge for Relationships/Choices.
- Optional/light Home cleanup pass — identify and fix the specific demo-visible glitches (no broader redesign).
- Engine render-loop gating: extend the `_rafId` suspension to react to a host-controlled "render active" flag.
- Update hotspots and any remaining `/?sheet=…` literals in app code (`src/components/world/hotspots.ts`, `ProfileSheet.js` sign-in return URLs) to canonical paths.
- Back-compat redirect for legacy `?sheet=…` query strings hitting `/`.

### Out of scope

- Refactoring the `SideRail` visual design or its iconography. Click handlers change; visuals don't.
- Reworking the `SheetChrome` contract beyond the `withCloseButton: false` opt-in. The chrome rules in `CLAUDE.md` still apply unchanged.
- Capture-sheet routing or close-button changes. Ask/Photo/Mood/Chooser stay inline.
- Auth / onboarding routing (`/login`, `/onboarding`). Sign-in flows continue to use the existing in-engine onboarding surface.
- A full Profile redesign. R5–R6 are layout hierarchy + the missing summary block; nothing more.
- Performance work beyond the rAF pause. No texture LOD changes, no scene graph reorganization.
- Migrating to a different router or building a server-side prerender for the engine routes.

### Deferred to Follow-Up Work

- Nesting capture sheets under routes if they grow page-like behavior (e.g. a dedicated `/ask` route). Not needed today.
- Per-tab prefetch / route loader work for Profile tabs. Engine already loads everything client-side; route loaders would be an optimization, not a correctness fix.
- Replacing the SideRail with `<Link>` semantics natively. The `onNavigate` callback hook is enough for v1; a full React rewrite of the rail is a separate refactor.

---

## Key Technical Decisions

### D1. Engine mounts at `__root.tsx`, not at `/`

If `StudentSpaceHost` stays inside `routes/index.tsx`, every navigation away from `/` would unmount the engine — losing in-memory state, throwing away the WebGL context, and forcing a re-boot on every back-press. Moving the host to the root layout (or an equivalent layout route) means the engine instance survives route changes. Routed sheet pages then render an `<Outlet />`-style slot that contributes nothing visible — they exist only to drive URL state.

### D2. Nested tab routes (`/profile/$tab`)

Per user choice. Tabs become real URLs (`/profile/values`, `/profile/relationships`, …). Trade-off: more route files, but each tab is bookmarkable and the tab strip can use TanStack `<Link>` semantics naturally. Default tab on bare `/profile` is `values` (matches current `ProfileSheet` default).

### D3. URL is the source of truth; `OverlayController` follows it

A new `useStudentSpaceRouteSync(game)` hook subscribes to router location. On every change, it derives the surface + tab from the URL and calls `game.openSurface({ surface, tab })`. On `/` it calls `controller.close(active)` via a thin engine helper. In-engine nav sources (SideRail, hotspots) call a host-injected `onNavigate(href)` instead of touching `OverlayController.open` — the URL change then drives the open. This guarantees one direction of authority and removes the double-fire risk.

### D4. `OverlayController.close` from inside the engine (Escape, future shortcut) navigates back to `/`

Escape on a routed sheet today calls `controller.close(key)`. With routing live, "close" semantically equals "go back." Escape will call `onNavigate('/')` instead of `controller.close(...)`. The controller still arbitrates exclusivity and writes body classes; it just gets driven by the URL.

### D5. Render loop gating via `game.setRenderActive(boolean)`

Mirror the existing `visibilitychange` suspension. The host calls `live.setRenderActive(pathname === '/')` on every location change. Inside `Game.js`, set a `_renderActive` flag; `update()` early-returns and `cancelAnimationFrame` runs when the flag flips false. Resume schedules a new rAF on flip-true. The engine still ticks state once on resume to repaint, matching the documented `visibilitychange` re-entry behavior at `src/engine/student-space/Game/Game.js`.

### D6. Routed sheets opt out of `withCloseButton`; capture sheets keep theirs

`ProfileSheet`, `HistorySheet`, `LettersSheet`, `TrajectorySheet`, and the embedded `CalendarSheet` (when used as a standalone route) pass `withCloseButton: false`. The `.sheet-chrome__close` CSS rules at `src/engine/student-space/style.css:1096` already cover the case where the button doesn't render. Capture sheets (`AskSheet`, `MoodSheet`, `CaptureChooser`, etc.) remain unchanged.

### D7. Back-compat redirect for `?sheet=…`

The existing `studentSpaceSurfaceFromLocation` in `src/lib/student-space/route-sheets.ts` already maps the legacy params. Reuse it inside an `/` route loader (or a `beforeLoad` hook) that issues a `throw redirect({ to: pathnameForSurface(...) })` when `?sheet=` is present. Old bookmarks land cleanly on the new path.

---

## High-Level Technical Design

This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.

```
                  ┌────────────────────────┐
URL change ─────► │  TanStack Router       │
                  └──────────┬─────────────┘
                             │ useLocation()
                             ▼
                  ┌────────────────────────┐
                  │ useStudentSpaceRoute   │  derives { surface, tab } from pathname
                  │ Sync(game)             │  calls game.openSurface(...) or close
                  └──────────┬─────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │ Engine OverlayController│ register / open / close (existing)
                  └──────────┬─────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │  SheetChrome consumers │ ProfileSheet, HistorySheet, …
                  │  (withCloseButton:false│
                  │   on routed sheets)    │
                  └────────────────────────┘

                  ▲
                  │ onNavigate(href)
                  │
        SideRail / Hotspots / Escape ── instead of calling OverlayController.open directly
```

Render-loop gate (separate concern, same host):

```
useLocation() ──► game.setRenderActive(pathname === '/')
                      │
                      ▼
                Game.update() early-returns when _renderActive is false;
                cancelAnimationFrame on flip-false; schedule rAF on flip-true.
```

---

## Output Structure

```
src/
  routes/
    __root.tsx              (modified — mounts StudentSpaceHost at the layout level)
    index.tsx               (modified — drops StudentSpaceHost, becomes home placeholder + ?sheet= redirect)
    profile.tsx             (new — parent route; default-routes to /profile/values)
    profile.$tab.tsx        (new — dynamic tab segment; validates against known tabs)
    history.tsx             (new)
    history.$tab.tsx        (new)
    letters.tsx             (new)
    trajectory.tsx          (new)
  lib/
    student-space/
      route-sheets.ts       (modified or replaced — split into pathname helpers + legacy ?sheet= parser)
      route-sync.ts         (new — useStudentSpaceRouteSync hook + onNavigate plumbing)
  components/
    StudentSpaceHost.tsx    (modified — accepts router-driven surface, exposes onNavigate)
    world/
      hotspots.ts           (modified — canonical paths)
  engine/
    student-space/
      Game/
        Game.js             (modified — _renderActive gate, setRenderActive method)
        index.js / index.d.ts (modified — onNavigate option, setRenderActive on Game)
        View/
          SideRail.js       (modified — onNavigate() instead of OverlayController.open)
          ProfileSheet.js   (modified — withCloseButton:false, tab/panel hierarchy fix)
          HistorySheet.js   (modified — withCloseButton:false, Escape → onNavigate)
          LettersSheet.js   (modified — withCloseButton:false)
          TrajectorySheet.js (modified — withCloseButton:false)
          CalendarSheet.js  (modified when standalone — embed case unchanged)
      style.css             (modified — Profile tab/panel layout fix, Home cleanup)
```

The tree is a scope declaration. The implementer may adjust if a better layout emerges; per-unit `**Files:**` sections remain authoritative.

---

## Implementation Units

### U1. Lift engine mount to the root layout and add a router-driven open hook

**Goal:** Mount `StudentSpaceHost` once at the layout level so it survives navigation, and accept a router-driven `surface` signal in addition to the existing initial-overlay read.

**Requirements:** R1, R2, R3, R9.

**Dependencies:** None.

**Files:**
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/components/StudentSpaceHost.tsx`

**Approach:**
- Move the `<StudentSpaceHost />` mount from `routes/index.tsx` into `routes/__root.tsx`, rendered behind the `<Outlet />`. The host's `<div className="game" />` should remain absolutely positioned so route components render on top.
- `routes/index.tsx` becomes a minimal home component (returns `null` or a small overlay-aware placeholder). The engine is already visible behind it.
- Extend `StudentSpaceHost` to accept a router-driven `surface` prop (or rely on the route-sync hook from U2 reading from `useLocation()` directly — preferred). The existing `readInitialOverlayFromLocation` path becomes legacy-only and is replaced by the URL-driven hook from U2.
- Verify `StrictMode` double-mount behavior still works via the documented `dispose()` lifecycle. The engine is one-game-per-page; the layout mount must follow the same guard.

**Patterns to follow:** existing `createGame` boot in `src/components/StudentSpaceHost.tsx:30-115`; existing `__root.tsx` outlet pattern.

**Test scenarios:**
- Navigating from `/` to `/profile` and back does not call `createGame` a second time (assert mount counts via a spy or a render-counter).
- Engine `dispose()` is called exactly once on full unmount (route mount, then close the app).
- StrictMode double-render in dev still results in exactly one live engine instance.
- Files modified: `src/test/student-space-host.test.ts` (new or extended) covers mount lifecycle across route changes.

**Verification:** Manual: navigate `/` → `/profile` → back → `/history` → back. Engine canvas stays visible behind sheets; no flash, no re-init.

---

### U2. Build URL ↔ overlay sync layer

**Goal:** Single source-of-truth bridge — URL drives `OverlayController`, in-engine nav drives router.

**Requirements:** R1, R2, R3, R9, R10.

**Dependencies:** U1.

**Files:**
- `src/lib/student-space/route-sync.ts` (new)
- `src/lib/student-space/route-sheets.ts` (refactor — split legacy `?sheet=` parser from new pathname helpers)
- `src/components/StudentSpaceHost.tsx`

**Approach:**
- Add pure helpers in `route-sync.ts`:
  - `surfaceFromPathname(pathname: string): { surface: StudentSpaceSurface; tab?: string } | null`
  - `pathnameForSurface({ surface, tab? }): string`
  - Known mapping: `/` → null; `/profile` → `{ surface: 'profile', tab: 'values' }` (default); `/profile/$tab` → `{ surface: 'profile', tab }`; same shape for `/history/$tab` (timeline default), `/letters`, `/trajectory`.
- Export `useStudentSpaceRouteSync(game: Game | null)` hook that:
  1. Reads `useLocation()` from TanStack Router.
  2. On every change, calls `game.openSurface(parsed)` when parsed is non-null, or `game.closeActiveSurface()` (new thin method on `Game` that calls `OverlayController.close(active)` when active is exclusive) when parsed is null.
  3. Guards re-entry with a `lastApplied` ref so a single URL change can't double-fire.
- Keep `route-sheets.ts`'s legacy `studentSpaceSurfaceFromLocation` (used by the back-compat redirect in U9) but stop using it for the live sync path.
- Plumb `onNavigate: (href: string) => void` from the host into `createGame({ onNavigate })`. The host implementation calls `router.navigate({ to: href })`. This is the channel SideRail/hotspots/Escape use in U3 and U4.

**Patterns to follow:** existing surface-parsing logic in `src/lib/student-space/route-sheets.ts:1-50`; existing `StudentSpaceSurface` union in `src/lib/student-space/backend-bridge.ts:32`.

**Test scenarios:**
- `surfaceFromPathname('/profile/relationships')` returns `{ surface: 'profile', tab: 'relationships' }`.
- `surfaceFromPathname('/history')` returns `{ surface: 'history', tab: 'timeline' }`.
- `surfaceFromPathname('/')` returns `null`.
- `surfaceFromPathname('/profile/bogus-tab')` returns `null` (or `{ surface: 'profile', tab: 'values' }` — pick one and assert it).
- `pathnameForSurface({ surface: 'profile', tab: 'choices' })` returns `/profile/choices`.
- `pathnameForSurface({ surface: 'history' })` returns `/history` (no tab when default).
- Hook test: feeding location changes through a test router calls `openSurface` with the expected args; re-feeding the same location does not re-call.
- Hook test: navigating to `/` calls `closeActiveSurface`.
- Files: `src/lib/student-space/route-sync.test.ts` (new).

**Verification:** Unit tests pass. In-app: address-bar entry of `/profile/relationships` opens Profile on the Relationships tab on first paint.

---

### U3. Add `onNavigate` host hook to the engine and route SideRail through it

**Goal:** In-engine click handlers stop calling `OverlayController.open` directly; they ask the host router to navigate, and the URL drives the open.

**Requirements:** R1, R2, R9.

**Dependencies:** U2.

**Files:**
- `src/engine/student-space/Game/index.js`
- `src/engine/student-space/Game/index.d.ts`
- `src/engine/student-space/Game/Game.js`
- `src/engine/student-space/Game/View/SideRail.js`
- `src/lib/student-space/backend-bridge.ts` (type extension for `GameOptions`)

**Approach:**
- Add `onNavigate?: (href: string) => void` to `GameOptions` and to the engine's public type declaration.
- Plumb the callback from `createGame` → `Game` → `View` → `SideRail`. Existing pattern: `authMenu` is plumbed the same way; mirror it.
- `SideRail._onClick`: replace the `controller.open/close(sheet)` calls with `this._onNavigate(href)` where `href` is built via the new `pathnameForSurface` helper (or a small in-engine constant map mirroring it). The `home` button calls `this._onNavigate('/')`.
- Re-tap-to-close (the existing `controller.isOpen(sheet) → close` branch) becomes `controller.isOpen(sheet) → onNavigate('/')`. The router navigation then triggers the close via U2.
- Leave `_setActive` / `update()` highlight logic unchanged. The rail still observes `OverlayController.active`; only the click side moves.

**Patterns to follow:** existing `authMenu` plumbing in `src/engine/student-space/Game/index.js` and the documented engine option contract.

**Test scenarios:**
- SideRail click on Profile fires `onNavigate('/profile/values')` (or `'/profile'`, whichever is canonical) and does **not** call `OverlayController.open` synchronously.
- Re-tapping the active sheet's rail icon fires `onNavigate('/')`.
- Home button click fires `onNavigate('/')`.
- When `onNavigate` is absent (engine boots without a host router, e.g. in a unit test harness), SideRail falls back to its old behavior or silently no-ops — pick one and document the choice in the type declaration.
- Files: `src/engine/student-space/Game/View/SideRail.test.js` (new) using JSDOM.

**Verification:** Click each rail entry; the URL bar updates; the sheet opens via the URL → overlay path.

---

### U4. Drop `×` close on routed sheets; wire Escape to navigate back

**Goal:** Routed sheets read as pages, not modals. No `×` button; Escape returns to `/`.

**Requirements:** R4, R9.

**Dependencies:** U2, U3.

**Files:**
- `src/engine/student-space/Game/View/ProfileSheet.js`
- `src/engine/student-space/Game/View/HistorySheet.js`
- `src/engine/student-space/Game/View/LettersSheet.js`
- `src/engine/student-space/Game/View/TrajectorySheet.js`
- `src/engine/student-space/Game/View/CalendarSheet.js` (standalone case only)
- `src/engine/student-space/Game/View/SheetChrome.js` (add an `onCloseRequest` option that takes priority over the controller-close default)

**Approach:**
- For each routed sheet's `SheetChrome({...})` call, change `withCloseButton: true` → `withCloseButton: false`.
- Add `onCloseRequest: () => onNavigate('/')` (or a callback the sheet receives from the engine wiring) to `SheetChrome`. The chrome's Escape handler currently calls `OverlayController.close(key)`; route it through `onCloseRequest` when provided so Escape on routed sheets navigates back instead of bypassing the URL.
- Capture sheets are not changed.
- Verify no CSS regression: `.sheet-chrome__close` rules at `src/engine/student-space/style.css:1096` already cover the not-rendered case. Confirm no per-sheet CSS hard-depends on the close button existing (grep for `.sheet-chrome__close` in per-sheet selectors — the embedded calendar inside History already has a special rule at `src/engine/student-space/style.css:7680`; preserve its embed semantics).

**Patterns to follow:** existing `withCloseButton: false` opt-out documented in `src/engine/student-space/Game/View/SheetChrome.js:30,46,65,90-100`.

**Test scenarios:**
- Open `/profile`; no `×` button is present in the DOM (assert via `querySelector('.sheet-chrome__close')` is null on the profile sheet root).
- Press Escape inside `/profile`; router navigates to `/`; engine canvas is visible and overlay is closed.
- Open `/ask` (capture sheet) — `×` button is still present (regression guard).
- Files: `src/engine/student-space/Game/View/SheetChrome.test.js` (new or extended).

**Verification:** Click around each routed sheet; verify no `×`; verify Escape closes via the router. Verify capture sheets (Ask/Photo/Mood) still close with their `×` unchanged.

---

### U5. Add nested file routes for profile, history, letters, trajectory

**Goal:** Real route components exist for each routed surface and tab.

**Requirements:** R1, R3, R9.

**Dependencies:** U1, U2.

**Files:**
- `src/routes/profile.tsx` (new)
- `src/routes/profile.$tab.tsx` (new)
- `src/routes/history.tsx` (new)
- `src/routes/history.$tab.tsx` (new)
- `src/routes/letters.tsx` (new)
- `src/routes/trajectory.tsx` (new)
- `src/routeTree.gen.ts` (regenerated by TanStack — never hand-edited)

**Approach:**
- Each route component renders `null` (or a thin `<Outlet />` for parent routes) — the engine, mounted at the root layout, owns the visible UI.
- Parent routes (`profile.tsx`, `history.tsx`) `beforeLoad`-redirect to the default tab when navigated to the bare path: `/profile` → `/profile/values`, `/history` → `/history/timeline`. Alternative: keep the bare path valid and let `surfaceFromPathname` resolve the default tab. Pick one approach and document.
- `$tab` routes validate the segment via TanStack's `params` validation (or a `beforeLoad` that calls `surfaceFromPathname`); unknown tabs throw a `notFound()` or redirect to the default tab.
- Use the route's `loader` / `component` lifecycle to call `game.openSurface(...)` only as a fallback — the route-sync hook from U2 is the primary path. Route loaders stay light.
- Regenerate `routeTree.gen.ts` via the build script the repo already uses.

**Patterns to follow:** existing file routes in `src/routes/index.tsx`, `src/routes/dev.design.tsx`, `src/routes/share.$token.tsx`.

**Test scenarios:**
- Navigate to `/profile`; URL canonicalizes to `/profile/values` (or stays at `/profile` with default tab opened — assert which).
- Navigate to `/profile/bogus`; the route either redirects to `/profile/values` or 404s — assert and pick.
- Navigate to `/history/growth`; History opens on the Growth tab.
- Browser back from `/profile/values` returns to `/`.
- Files: `src/test/routes-student-space.test.ts` (new) — driving the router with `MemoryHistory` and asserting overlay state mutations.

**Verification:** Each canonical route renders the right surface on hard reload. Browser back/forward unwinds correctly.

---

### U6. Pause engine render loop on non-`/` routes

**Goal:** Suspend rAF when a routed sheet is active; resume on return to `/`. Eliminates the shaking and reduces idle GPU usage.

**Requirements:** R8.

**Dependencies:** U1.

**Files:**
- `src/engine/student-space/Game/Game.js`
- `src/engine/student-space/Game/index.d.ts`
- `src/components/StudentSpaceHost.tsx` (call site)

**Approach:**
- Add a `_renderActive` flag on `Game`, default `true`. Add a public method `setRenderActive(active: boolean)` exported through the engine surface.
- Mirror the existing `visibilitychange` pattern (`src/engine/student-space/Game/Game.js:113-160`):
  - On flip-false: `cancelAnimationFrame(this._rafId); this._rafId = null;` and have `update()` short-circuit when `_renderActive` is false.
  - On flip-true: schedule a single rAF if none is scheduled; tick state + view once on resume to repaint.
- From the host (`StudentSpaceHost` or the route-sync hook), call `live.setRenderActive(pathname === '/')` on every location change.
- Be careful with onboarding: if onboarding flows render into the world view while pathname is `/`, the loop must stay alive (it does — pathname `/` → render active). If a future onboarding route exists outside `/`, the pause still applies and the onboarding overlay should be route-local.
- Keep `visibilitychange` suspension orthogonal — tab hidden still pauses regardless of route.

**Test scenarios:**
- Boot at `/`; render loop is active (`_rafId` non-null after first frame).
- Navigate to `/profile`; within one tick, `_rafId` is null and `update()` early-returns.
- Navigate back to `/`; `_rafId` is rescheduled within one tick.
- Pause survives StrictMode double-mount: no leaked rAF after mount/unmount/mount.
- `visibilitychange` to hidden while on `/profile` is a no-op (already paused). Return to visible while on `/profile` does **not** resume (route gate still says false).
- Return to visible while on `/` resumes.
- Files: `src/engine/student-space/Game/Game.test.js` (new or extended) using fake timers.

**Verification:** Open dev tools Performance tab; navigate `/` → `/profile`; rAF callbacks stop firing. Navigate back; they resume. Spot-check the reported shaking is gone.

---

### U7. Fix Profile (My Identity) tab/panel hierarchy and add the summary block

**Goal:** Tab strip and the active tab's content read as one block; add the missing overview/summary block per design.

**Requirements:** R5, R6, R9.

**Dependencies:** U5 (so `$tab` route is the truth driving `activeFacet`).

**Files:**
- `src/engine/student-space/Game/View/ProfileSheet.js`
- `src/engine/student-space/style.css`
- `src/engine/student-space/profile-tab-react-bridge.tsx` (only if the bridge mount target needs to move under the new container)

**Approach:**
- In `ProfileSheet._buildRoot` / `_render` (around `src/engine/student-space/Game/View/ProfileSheet.js:155-200`), restructure the DOM so the tab strip and the panel share a wrapping element. Today: identity card → `<nav class="profile-sheet__tabs">` → panel container as siblings. Target: identity card → `<section class="profile-sheet__tabbed">` containing `<nav class="profile-sheet__tabs">` + `<div class="profile-sheet__panel">` — the panel always sits visually directly below the strip, sharing background/elevation.
- Update `style.css` to give the new wrapper a single surface (subtle border or shared padding so the active tab and panel read as connected). The tab strip's active state should visually flow into the panel (e.g. shared border-bottom-of-tab + border-top-of-panel resolved to no seam).
- Drive `activeFacet` from the URL: `useStudentSpaceRouteSync` sets it via the existing `openSurface({ surface: 'profile', tab })` path, which calls `_setTab` internally. Clicking a tab calls `onNavigate(pathnameForSurface({ surface: 'profile', tab }))` instead of swapping `activeFacet` locally — URL stays canonical.
- Add the overview/summary block referenced in the brief. Scope it tightly: a small block at the top of the panel area (or below the tab strip) that surfaces "what this dimension is about" — content sourced from existing facet labels and the current header content rather than a new data shape. Light-touch only.
- React-backed tabs (Relationships, Choices) keep their mount target; just confirm `mountProfileTabReactPanel` mounts into the new `.profile-sheet__panel` element, not the old wrapper.

**Patterns to follow:** existing `_switchTab` and `_render` shape in `src/engine/student-space/Game/View/ProfileSheet.js`; existing per-sheet CSS scoping convention (`.profile-sheet .sheet-chrome__content`) from `CLAUDE.md`.

**Test scenarios:**
- After mounting Profile, `document.querySelector('.profile-sheet__tabbed')` exists and contains both the tablist and the active panel as direct children.
- Switching tabs via URL (`/profile/relationships` → `/profile/choices`) does not unmount/remount the wrapper; only the panel content swaps.
- Clicking a tab fires `onNavigate('/profile/<tab>')` (not a local `_setTab`).
- React-backed Relationships tab renders inside `.profile-sheet__panel` (assert via `querySelector` after mount).
- Visual smoke: take a screenshot in dev; tab strip and panel share a visual surface, no orphan card between them.
- Files: `src/test/profile-sheet-layout.test.js` (new), plus a visual check noted in the verification.

**Verification:** Manual click-through of every tab in `/profile/*`. Screenshot diff or eyeball against the latest design.

---

### U8. Update hotspots and in-engine links to canonical paths

**Goal:** Internal links stop emitting `/?sheet=…` and use the new nested paths.

**Requirements:** R1, R10.

**Dependencies:** U5.

**Files:**
- `src/components/world/hotspots.ts`
- `src/engine/student-space/Game/View/ProfileSheet.js` (sign-in/return path around line 475 — `/?sheet=profile` literal)
- Any other grep hit on `?sheet=` in non-doc, non-test code

**Approach:**
- Replace each `/?sheet=<surface>` (and `#reflection-<id>` variants) with the canonical path via a shared helper. The helper lives in `route-sync.ts` and accepts `{ surface, tab?, entryId? }`.
- Preserve hash deep-links (`#reflection-N`) where they exist — they continue to scroll/focus the right entry after the route opens.
- Sign-in return URLs (`profileReturnPathname` in `src/engine/student-space/Game/View/ProfileSheet.js:475`) get rewritten via the same helper.

**Test scenarios:**
- Grep for `?sheet=` in `src/` returns zero matches outside test fixtures and the legacy redirect handler.
- Hotspot href for a value tree returns `/profile/values` (or `/profile/values#entry-<id>` when an entry is involved).
- Sign-in return path resolves to `/profile/values` (or `/profile` — pick one).

**Verification:** Click a value tree hotspot in the world; URL becomes `/profile/values`. Click a reflection butterfly; URL becomes `/history/timeline#reflection-<id>` (or chosen canonical form).

---

### U9. Back-compat redirect for legacy `?sheet=…` query strings

**Goal:** Old bookmarks and externally-shared links continue to land on the right page.

**Requirements:** R10.

**Dependencies:** U5.

**Files:**
- `src/routes/index.tsx` (or `src/routes/__root.tsx` — pick whichever is the cleanest place for a `beforeLoad` redirect)

**Approach:**
- In the home route's `beforeLoad`: if `search.sheet` is set and resolves via the legacy `studentSpaceSurfaceFromLocation` to a known surface, `throw redirect({ to: pathnameForSurface(...), hash })`. Otherwise continue.
- Preserve hash (`#reflection-N`) and filter (`?filter=need-review`) parameters by re-encoding them on the redirect target.

**Test scenarios:**
- Hitting `/?sheet=profile` redirects to `/profile/values` (or `/profile`).
- Hitting `/?sheet=growth` redirects to `/history/growth`.
- Hitting `/?sheet=reflections#reflection-42` redirects to `/history/timeline#reflection-42`.
- Hitting `/?sheet=bogus` falls through to `/` and does not error.
- Files: `src/test/legacy-sheet-redirect.test.ts` (new).

**Verification:** Paste a legacy URL into the address bar; you land on the canonical path.

---

### U10. Home / My World demo-safe visual cleanup

**Goal:** Identify and fix the visual glitches blocking the demo. Not a redesign.

**Requirements:** R7, R9.

**Dependencies:** U1, U6 (clean baseline post-mount-move and post-pause).

**Files:**
- `src/engine/student-space/style.css`
- `src/components/StudentSpaceHost.tsx` (only if container styles are part of the glitch)
- `src/components/WorldHud.tsx` (only if HUD-specific)

**Approach:**
- Run a visual audit on `/` immediately after U1–U6 land. The mount move and pause gate often expose or fix latent visual issues; the audit happens against the new baseline.
- Catalogue concrete glitches: broken lines, spacing, stray chrome, z-index conflicts, hover artifacts, scroll bleed-through. Fix each one in place. The plan does not pre-enumerate fixes because the visible bugs depend on the post-refactor baseline.
- Constrain scope: each fix is a targeted CSS or DOM tweak. If a fix would require a structural rework, defer it.

**Execution note:** Capture a before/after screenshot for each fix, attached to the PR description — the brief says "demo-safe," and the demo signoff is visual.

**Test expectation:** none — pure visual cleanup with no behavior change. Use screenshot review in the PR for signoff.

**Verification:** Demo walkthrough on `/`: scroll, interact with hotspots, open and close each routed sheet via SideRail, confirm no visible glitches.

---

## System-Wide Impact

- **`OverlayController`** stays the in-engine arbiter of which sheet is open. It changes from "click → controller.open" to "URL → controller.open." Callers other than SideRail (KiraDialogue's sign-in flow, internal "open profile" CTAs if any) must be updated to call `onNavigate` rather than `controller.open` directly. Grep for `controller.open(` and `OverlayController.getInstance().open(` to enumerate.
- **`SheetChrome`** gains an optional `onCloseRequest` callback. Default behavior (`OverlayController.close(key)`) is preserved when the callback is absent — capture sheets are unaffected.
- **TanStack route tree** grows by 6 routes. The generated `src/routeTree.gen.ts` will be regenerated by the build script; do not hand-edit.
- **`StudentSpaceHost`** owns the `onNavigate` callback wiring and the `setRenderActive` call. The host becomes the integration seam between TanStack and the engine.
- **Tests:** new test files in `src/test/` for route ↔ overlay sync, redirect behavior, and engine pause; new unit tests inside `src/engine/student-space/Game/View/` for SideRail click handling.

---

## Risks

- **Risk:** Route changes fire `openSurface` mid-engine-boot, before `OverlayController` is ready. **Mitigation:** the route-sync hook reads `game` (null until boot completes); guard with `if (!game) return`. The initial URL is re-applied after boot via the same hook running again.
- **Risk:** Render-pause deadlock — engine doesn't tick on resume because the `_rafId` schedule path has a latent bug. **Mitigation:** mirror the existing `visibilitychange` pattern (which works today) line-for-line. Tick state + view exactly once on resume.
- **Risk:** Profile layout refactor breaks the React-backed Relationships/Choices tabs. **Mitigation:** the React bridge mounts into a host element provided by `ProfileSheet`; update the bridge's mount-target lookup to match the new wrapper, and assert mount in a test.
- **Risk:** Legacy `?sheet=…` redirect loops if `surfaceFromPathname('/?sheet=profile')` is fed back to itself. **Mitigation:** the redirect issues a normalized path (no `?sheet=`) — the loop is structurally impossible.
- **Risk:** Browser back from `/profile/relationships` to `/profile/values` re-runs `openSurface` and re-mounts the React panel unnecessarily. **Mitigation:** `_switchTab` already guards against re-applying the same tab; assert no React remount happens in the panel test.
- **Risk:** Hard pause on every non-`/` route means in-world animations the user expects to see "peeking" behind a translucent sheet stop animating. **Mitigation:** sheets are opaque enough at `rgba(253,250,243,0.92)` that backdrop motion is barely visible. If product wants ambient motion behind sheets, switch to a low-throttle render rather than a hard pause. Out of scope for v1.

---

## Test Strategy

- **Route ↔ overlay sync (unit):** test `surfaceFromPathname` / `pathnameForSurface` round-trips, hook behavior with a `MemoryHistory` router, no double-fires.
- **Engine pause (unit):** Vitest with fake timers; assert rAF scheduled / cancelled on flag flip; mirror `visibilitychange` tests.
- **SideRail click (unit):** JSDOM-driven click on each rail entry; assert `onNavigate` fired with correct path.
- **Sheet close affordance (unit):** mount each routed sheet; assert no `.sheet-chrome__close` in DOM; mount Ask; assert `.sheet-chrome__close` is present.
- **Profile layout (unit):** assert DOM structure has `.profile-sheet__tabbed` wrapping tablist + panel.
- **Legacy redirect (unit):** drive the home route with `?sheet=…` search params; assert redirect target.
- **End-to-end demo walkthrough (manual):** open each route via the address bar, via SideRail, via browser back/forward, and via an external `/?sheet=…` link. Confirm engine survives all transitions, render loop pauses/resumes, no `×` on routed sheets, Profile layout reads as one block.

---

## Sequencing

U1 → U2 → U3 → U5 → U4 (depends on having a router so Escape can navigate)
                     ↘ U6 (independent of U4 but easier with U1's mount move)
                     ↘ U7 (depends on U5 for URL-driven `activeFacet`)
U5 → U8 → U9 (back-compat redirect comes last so it can use the new helpers)
After all of the above: U10 (visual cleanup against the clean baseline).

A reasonable PR split is one PR per unit, with U7 (Profile layout) and U10 (Home cleanup) potentially deferred to a follow-up if scope grows. U1+U2+U3 can ship together as the routing foundation if the diff stays readable.

---

## Open Questions Deferred to Implementation

- Should `/profile` redirect to `/profile/values` or render with `values` as the default tab without changing the URL? Both behave the same for users; the redirect form is slightly cleaner for analytics. Decide during U5.
- Does the Profile summary block need new copy or content data, or can it be assembled from existing facet headers? Decide during U7 after seeing the latest design.
- For `/history`, is the default tab `timeline` or `growth`? Today `HistorySheet.open({tab:'timeline'})` is the default. Confirm during U5.
- Hotspot path for reflections — `/history/timeline#reflection-N` vs `/history#reflection-N`? Decide during U8 based on the URL-shape preference.
