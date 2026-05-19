---
title: "feat: In-world auth wiring (sign-in, sign-out, demo) for the game world scene"
type: feat
status: active
date: 2026-05-20
origin: docs/ideation/2026-05-19-backend-wire-hardening-ideation.md
---

# feat: In-world auth wiring (sign-in, sign-out, demo) for the game world scene

## Problem Frame

The home route `/` mounts `StudentSpaceHost` → the live Student Space engine
(`src/engine/student-space/Game/`). The backend agent pipeline (managed
Mirror/Connector/Cartographer + OpenAI Realtime Mirror) already flows through
`createStudentSpaceBackendBridge()` and is gated server-side by
`requireCounselorContext()`. The auth identity layer, however, never reaches
the engine — three concrete gaps make the live flow feel disconnected from
real or demo data:

1. **Onboarding "Login with Edupass" is a dummy.**
   `src/engine/student-space/Game/View/Onboarding/EdupassLogin.js` shows a
   600 ms "Connecting…" affordance and advances to the greeting; it never
   touches `/api/auth/sign-in`, never sets the demo cookie, and never reads
   the auth menu. Re-arriving students who already have a session see the
   same dummy login every cold engine boot until `state.onboarding.stage`
   reaches `done`.

2. **The engine never knows whether the user is signed in.**
   `loadAuthMenu()` exists at `src/server/auth-menu.functions.ts` and is
   consumed by `ProfileSheetView` / `ProfileSheetChrome` (the React surfaces
   that only mount inside the engine's Relationships/Choices tabs). The
   live engine `ProfileSheet.js` shows a hardcoded `Profile.identity` (name
   "Mei", className "Sec 3B") and has no sign-in/sign-out affordance.

3. **Identity hydration falls back to "Me" for real WorkOS users.**
   `mapVipsPagesToStudentSpaceProfile()` (`src/lib/student-space/backend-snapshot.ts:208-213`)
   uses `snapshot.student_profile?.name ?? 'Me'`. `student_profile` is sourced
   from `loadStudentSpaceShellData(studentId)` which only resolves seeded demo
   students. A real WorkOS user with a private student namespace ends up with
   `identity.name = 'Me'`, ignoring their available WorkOS `firstName`/`email`
   from `auth-menu.handler.server.ts`.

The Connector → Cartographer → persist round-trip works under `DEV_BYPASS_AUTH=demo-a`
(verified in `docs/ideation/2026-05-19-backend-wire-hardening-ideation.md` and
the completed `2026-05-19-003-fix-backend-wire-hardening-plan.md` smoke pass).
What does not yet "work" is the journey *from the front door*: an anonymous
visitor cannot demo or sign in without leaving the world (Cmd-K palette,
manual URL, or going through the React-mounted Profile tabs that don't render
on `/`). This plan closes the auth-to-world seam while preserving the
existing onboarding ceremony and the engine's own first-run rules.

## Requirements Trace

- R1. **In-world sign-in surface.** The engine's onboarding login screen must
  offer real sign-in paths (WorkOS Google, demo account) plus an explicit
  "Continue offline" fallback that preserves today's behavior. Returning
  signed-in students must skip the login stage entirely on first cold boot.
- R2. **Auth-aware engine identity.** When a WorkOS or demo cookie session is
  active, `state.profile.identity` should reflect the authenticated label
  (from `loadAuthMenu()`) rather than the engine's hardcoded `'Mei'`. A
  user-set identity (set later via `Profile.setIdentity`) still wins because
  it is what the student deliberately wrote.
- R3. **Sign-out reachable from inside the world.** Engine `ProfileSheet.js`
  identity header must expose a sign-out button (when signed-in) routing
  through the existing `signOutEngine() + clearStudentSpaceLocalState() +
  POST /api/auth/sign-out` pattern. Existing React `ProfileSheetChrome`
  sign-out behavior is unchanged.
- R4. **Signed-out chip on TopNav.** When `auth.status === 'signed-out'`, the
  engine `TopNav` shows a compact "Sign in" chip alongside Letters / History
  / Profile / Path Finder. Hidden when signed in; behaves identically across
  WorkOS and demo paths.
- R5. **Backend bridge carries the auth menu.** `StudentSpaceBackendBridge`
  gains an optional `loadAuthMenu?()` method that wraps the existing server
  function. `StudentSpaceHost` fetches the menu once during boot and passes
  it to the engine alongside the existing `backend` arg.
- R6. **Identity hydration prefers auth label over `'Me'` fallback.**
  `mapVipsPagesToStudentSpaceProfile()` accepts an optional `authMenu`
  argument; when `student_profile` is `null` and the menu is signed-in,
  the snapshot identity name is taken from `authMenu.label` and detail
  from `authMenu.detail`. The seed-resolved `student_profile` still wins
  when present so demo students keep their seed name (e.g. "Mei (Sec 4, NA)").
- R7. **No regression to the existing flow.** The engine still boots and is
  fully playable in `DEV_BYPASS_AUTH=demo-a` (current dev mode), in cookie
  demo mode, in WorkOS auth mode, and signed-out (where backend calls fail
  silently and localStorage state is the only durable layer — as today).
- R8. **Live validation with `agent-browser`.** The four auth modes above
  are confirmed by an agent-browser pass before merge: open `/`, exercise
  each sign-in path, verify identity surfacing in the ProfileSheet, sign
  out, verify the demo cookie is cleared and signed-out chrome returns.

(see origin: `docs/ideation/2026-05-19-backend-wire-hardening-ideation.md` —
this plan complements the completed `2026-05-19-003-fix-backend-wire-hardening-plan.md`
by adding the auth-to-world seam left out of that hardening slice.)

## Scope

In scope:

- `src/engine/student-space/Game/View/Onboarding/EdupassLogin.js`
- `src/engine/student-space/Game/View/Onboarding/copy.js` (login copy + new
  affordance strings; offline-only demo list preserved as fallback)
- `src/engine/student-space/Game/View/Onboarding/OnboardingFlow.js` (skip
  the login stage when already signed-in)
- `src/engine/student-space/Game/View/TopNav.js` (signed-out chip)
- `src/engine/student-space/Game/View/ProfileSheet.js` (identity header
  sign-in / sign-out actions; identity reads `state.auth`)
- `src/engine/student-space/Game/State/State.js` (new `auth` slice; thread
  `opts.authMenu` through constructor)
- `src/engine/student-space/Game/State/Auth.js` *(new — small subscribable
  state slice modeled on `MoodPins.js` / `Captures.js`)*
- `src/engine/student-space/Game/index.js` and `Game.js` (accept and forward
  the optional `authMenu` arg from the host)
- `src/components/StudentSpaceHost.tsx` (fetch `loadAuthMenu` once during
  boot; pass into `createGame`)
- `src/lib/student-space/backend-bridge.ts` (`loadAuthMenu?` method)
- `src/lib/student-space/backend-snapshot.ts`
  (`mapVipsPagesToStudentSpaceProfile` accepts optional `authMenu` and prefers
  it over the `'Me'` fallback)
- Focused tests under `test/engine/`, `test/components/`, `test/lib/student-space/`,
  and one new `test/server/auth-menu.test.ts`

Out of scope:

- Real Edupass / SLS / MOE single-sign-on hardening (the dummy Edupass
  wordmark remains a demo placeholder; the live target is still WorkOS Google
  + demo cookie + `DEV_BYPASS_AUTH`).
- WorkOS dashboard or production OAuth hardening (organization invite, `hd`
  claim validation, email allowlist) — flagged in `src/auth/workos.ts` as a
  follow-up.
- Replacing the engine's localStorage adapter with a per-student-key prefix
  or Postgres-backed `StorageAdapter` (the larger fix tracked in
  `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md`).
- Touching Mirror/Connector/Cartographer agent behavior, prompts, schemas,
  or `runManagedAgent`.
- Reviving `FloatingWorldActions.tsx` (dormant component slated for deletion).
- The deferred items from the completed `2026-05-19-003` plan: durable
  dependency ledger, Cartographer self-critique quarantine, full smoke matrix.
- New database migrations, schema changes, or seed-corpus changes.

### Deferred to Follow-Up Work

- Per-student localStorage key prefixing so signed-in users carry distinct
  `ss:v1:*` namespaces (currently the wipe in `clearStudentSpaceLocalState`
  hides cross-student bleed but doesn't prevent it under fast user switching).
- Real Edupass / SLS / Singpass integration when the MOE pilot opens.
- Surfacing degraded auth-menu states (e.g. `loadAuthMenu` 500) as a banner
  rather than a silent fallback to signed-out chrome.

---

## High-Level Technical Design

This illustrates the intended approach and is directional guidance for review,
not implementation specification. The implementing agent should treat it as
context, not code to reproduce.

```text
                                         ┌──────────────────────────────┐
                                         │  /api/auth/sign-in (existing)│
                                         │  /api/auth/sign-out (existing)│
                                         └────────────▲─────────────────┘
                                                      │ POST form submit
                                                      │
  ┌─────────────────┐    loadAuthMenu()    ┌──────────┴──────────────┐
  │ auth-menu.      │◄────────────────────│ StudentSpaceHost.tsx     │
  │ functions.ts    │                     │ (passes authMenu+backend) │
  │ (existing)      │                     └──────────┬──────────────┘
  └─────────────────┘                                │ createGame({
                                                     │   backend,
                                                     │   authMenu  // NEW
                                                     │ })
                                                     ▼
                            ┌─────────────────────────────────────────┐
                            │  Game / State / State.js                │
                            │     this.auth = new Auth(opts.authMenu) │   // NEW slice
                            └────────────┬────────────────────────────┘
                                         │ subscribe()
                                         ▼
       ┌──────────────────────────┬──────────────────────────────────┐
       │ View / TopNav.js         │ View / ProfileSheet.js           │
       │ adds "Sign in" chip      │ identity header adds sign-in /   │
       │ when signed-out          │ sign-out button (auth-aware)     │
       └──────────────────────────┴──────────────────────────────────┘

       ┌─────────────────────────────────────────────────────────────┐
       │ View / Onboarding / EdupassLogin.js (REPLACED CONTENT)       │
       │                                                              │
       │   ▸ If state.auth.status === 'signed-in'  →  skip stage       │
       │   ▸ Else render three actions:                                │
       │       1. Sign in with Google  →  /api/auth/sign-in            │
       │       2. Use a demo account   →  POST /api/auth/sign-in?demo=1│
       │       3. Continue offline     →  legacy random OFFLINE_DEMO   │
       │                                  → advance to greeting        │
       └─────────────────────────────────────────────────────────────┘
```

The engine `Auth` slice is intentionally minimal — it holds the same
`{ status, label, detail, kind }` shape that `loadAuthMenu()` already returns,
adds a subscribe/notify pattern matching `MoodPins.js`, and **never** mutates
`Profile.identity`. The identity name surfaced in `state.profile.identity` is
controlled by `Profile.setIdentity()` (user-driven) and `Profile.hydrateBackend()`
(snapshot-driven); the auth slice is read separately by the chrome (TopNav,
ProfileSheet, EdupassLogin) so that signing in does not silently overwrite a
deliberate user-set name.

---

## Implementation Units

### U1. Engine `Auth` state slice + bridge wiring

**Goal.** Carry the existing `loadAuthMenu()` payload from the React host
into the engine as a subscribable singleton state slice, modeled on
`MoodPins.js` and `Captures.js`.

**Requirements.** R5, R7.

**Dependencies.** None.

**Files.**

- `src/engine/student-space/Game/State/Auth.js` (new)
- `src/engine/student-space/Game/State/State.js`
- `src/engine/student-space/Game/index.js` (and `index.d.ts` if exported)
- `src/engine/student-space/Game/Game.js`
- `src/lib/student-space/backend-bridge.ts`
- `src/components/StudentSpaceHost.tsx`
- `test/engine/auth-state-slice.test.ts` (new)
- `test/components/StudentSpaceHost.test.tsx`

**Approach.**

- Add `Auth` singleton slice. Holds `{ status, label, detail, kind }` defaulting
  to `{ status: 'signed-out' }`. Constructor takes optional initial value;
  `setMenu(next)` replaces the slot and fans to subscribers; `subscribe(cb)`
  returns an unsubscribe function. No persistence — auth is a server fact, not
  a client fact, so reload re-reads it from the host.
- `State.js`: construct `this.auth = new Auth(opts.authMenu)` early (before
  `Onboarding` and `Profile` so onboarding's first `_renderStage` reads it).
  Add `Auth.instance = null` to `Game.dispose()` block so StrictMode double-
  mount boots a clean slice. Do not hydrate from `Persistence.load()` — the
  slice is intentionally non-persistent.
- `createGame({ backend, authMenu })`: pass through to `new State({ ..., authMenu })`.
- `backend-bridge.ts`: add `loadAuthMenu?: () => Promise<AuthMenuState>` to the
  bridge interface; default implementation calls `loadAuthMenu({ data: {} })`
  from `~/server/auth-menu.functions`.
- `StudentSpaceHost.tsx`: in the `useEffect` boot, `await backend.loadAuthMenu?.()`
  before calling `createGame`, so the engine boots with the correct initial slice
  rather than racing the snapshot.

**Patterns to follow.**

- Singleton + subscribe shape: `src/engine/student-space/Game/State/MoodPins.js`.
- React-into-engine bridge dispose handshake: `src/engine/student-space/Game/State/State.js`
  dispose() pattern + `signOutEngine()` in `src/lib/sign-out-engine.ts`.

**Test scenarios.**

- `state.auth.menu` reflects the `authMenu` arg passed into `createGame`
  (signed-in / signed-out / dev-bypass / demo).
- `state.auth.setMenu({status:'signed-in', ...})` fans to a registered subscriber
  exactly once with the new value.
- Disposing the Game nulls the `Auth.instance` so a fresh `createGame` boots
  a new slice (StrictMode parity).
- `backend.loadAuthMenu` failure surfaces as `auth.status='signed-out'`
  rather than aborting the engine boot (mirrors `refreshSnapshot` failure
  handling already in `StudentSpaceHost`).
- `StudentSpaceHost` integration test: the engine receives `authMenu` from
  the bridge before `createGame` returns.

### U2. Onboarding `EdupassLogin` → real auth surface

**Goal.** Replace the dummy `Login with Edupass` button with three explicit
paths (Google sign-in / demo account / continue offline) and skip the login
stage entirely when the host already reports a signed-in session.

**Requirements.** R1, R7.

**Dependencies.** U1.

**Files.**

- `src/engine/student-space/Game/View/Onboarding/EdupassLogin.js`
- `src/engine/student-space/Game/View/Onboarding/copy.js`
- `src/engine/student-space/Game/View/Onboarding/OnboardingFlow.js`
- `test/engine/onboarding-edupass-login.test.ts` (new)

**Approach.**

- `OnboardingFlow.start()`: when `stage === 'login'` AND
  `state.auth?.status === 'signed-in'`, immediately `_setStage('greeting')`
  instead of mounting `EdupassLogin`. Returning signed-in students go straight
  to greeting; signed-out students still see the login surface.
- `EdupassLogin.mount()`: render three actions in a stacked column:
  1. **Sign in with Google** — `<a href="/api/auth/sign-in?returnPathname=/">`
     (full navigation; WorkOS handles the rest).
  2. **Use a demo account** — same-origin `<form method="post"
     action="/api/auth/sign-in?demo=1&returnPathname=/">` with a submit button.
  3. **Continue offline** — keeps today's behavior: pick a random
     `OFFLINE_DEMO_STUDENTS` entry, call `ctx.profile.setIdentity(...)`,
     advance to greeting.
- Both navigating actions (1) and (2) tear down the engine *before* the page
  unload so Persistence's debounced writes flush cleanly. Reuse the
  `signOutEngine()` pattern from `src/lib/sign-out-engine.ts` via a small
  shim — call `window.__studentSpaceGame?.dispose()` before the form submit
  / link navigation. Localstorage clear is NOT called on the sign-in path
  (no prior session to drain).
- `copy.js`: add three labeled strings (`google`, `demo`, `offline`) under
  `login.actions`. Preserve `login.demoNote` as a small footer.
- Visual style: keep the existing `.onb-login__cta` shape for the primary
  Google action; secondary buttons use a lighter pill variant matching the
  cream/coral palette already used by `ProfileSheetChrome` ("rounded-full
  bg-[#f1ede5]" equivalent in CSS).

**Patterns to follow.**

- Same-origin demo POST form: `src/components/ProfileSheetView.tsx`'s
  `SignedOutActions` (lines 151-170).
- Form-based sign-in/out from inside dynamic UI: `DevPalette.tsx` lines 61-86
  (form construction + submit pattern).
- Onboarding stage transitions: `OnboardingFlow.js` `_setStage` + `_advance`.

**Test scenarios.**

- Renders three actions when `state.auth.status === 'signed-out'`.
- Renders zero actions and immediately advances to greeting when
  `state.auth.status === 'signed-in'`.
- Click "Sign in with Google" → engine `dispose()` called, then
  `window.location.href` set to `/api/auth/sign-in?returnPathname=/`.
- Click "Use a demo account" → engine `dispose()` called, then a form POST
  to `/api/auth/sign-in?demo=1` is submitted (assert on the form's `action`
  + `method` and the dispatched submit event).
- Click "Continue offline" → no navigation; `Profile.setIdentity` called with
  a random `OFFLINE_DEMO_STUDENTS` entry; `_advance('greeting')` invoked.
- `_onClick` ignores re-entrancy while `_connecting` is true (preserves
  existing guard).

### U3. ProfileSheet identity header → sign-in / sign-out actions

**Goal.** Surface auth state inside the live engine `ProfileSheet`. Add a
small sign-in button when signed-out and a sign-out button when signed-in,
both routed through the existing `/api/auth/sign-*` handlers via the
established engine-dispose-then-POST pattern.

**Requirements.** R3, R7.

**Dependencies.** U1.

**Files.**

- `src/engine/student-space/Game/View/ProfileSheet.js`
- `test/engine/profile-sheet-auth-actions.test.ts` (new)

**Approach.**

- Extend `_mountShareButton` / the identity header HTML to include an
  `[data-auth-slot]` next to `[data-share-slot]`.
- Read `state.auth` once in `_render()`'s identity pass; subscribe in the
  constructor and re-render the identity header on `auth` changes.
- When `auth.status === 'signed-in'`: render a `profile-auth-button
  profile-auth-button--signout` button labeled "Sign out". Click handler
  mirrors `DevPalette`'s sign-out command — `signOutEngine()` →
  `clearStudentSpaceLocalState()` → POST form to `/api/auth/sign-out`.
- When `auth.status === 'signed-out'`: render a `profile-auth-button
  profile-auth-button--signin` link/button labeled "Sign in" that navigates
  to `/api/auth/sign-in?returnPathname=/?sheet=profile`. Sign-in does NOT
  drain localStorage (no prior session) but still calls
  `window.__studentSpaceGame?.dispose()` before navigation.
- Preserve the existing `_mountShareButton` slot; auth button sits to its
  right inside `.profile-id__actions`.
- The two-tap forget pattern, the share dialog, and the React-bridge tabs
  remain untouched.

**Patterns to follow.**

- Engine sign-out plumbing: `src/components/DevPalette.tsx` (lines 61-86) and
  `src/lib/sign-out-engine.ts`.
- Auth-aware chrome shape: `src/components/ProfileSheetChrome.tsx`'s
  `AuthAction` (lines 127-152).
- Engine subscribe + re-render: `_renderIdentity()` already in
  `ProfileSheet.js`; wrap its caller to fire when `auth` changes.

**Test scenarios.**

- Signed-in: renders the Sign out button labeled "Sign out" inside the
  identity header.
- Signed-out: renders the Sign in button/link with `href` pointing at
  `/api/auth/sign-in?returnPathname=/?sheet=profile`.
- Clicking Sign out: `window.__studentSpaceGame.dispose` is called *before*
  the form submits (assert order via spy timing or a synchronous wrapper).
- Clicking Sign out clears `ss:v1:*` localStorage keys (assert pre/post call
  to the bundled `clearStudentSpaceLocalState`).
- Updating `state.auth.menu` after the sheet is open swaps the button
  without re-mounting the sheet (subscribe-driven re-render path).
- Disposing the ProfileSheet unsubscribes from `state.auth` (no leak under
  StrictMode remount).

### U4. TopNav signed-out chip

**Goal.** Add a fifth pill chip to the engine `TopNav` that appears only
when signed-out, opening a tiny prompt with "Sign in" + "Use demo account"
links. Keeps the existing four chips untouched in the signed-in state.

**Requirements.** R1, R4.

**Dependencies.** U1.

**Files.**

- `src/engine/student-space/Game/View/TopNav.js`
- `src/engine/student-space/Game/style.css` (chip variant CSS)
- `test/engine/top-nav-auth-chip.test.ts` (new)

**Approach.**

- `TopNav` constructor: read `State.getInstance().auth` and append a fifth
  chip when `status === 'signed-out'`. Chip label "Sign in", with a small
  user-circle icon. Subscribe to `auth` changes; show/hide the chip without
  re-creating siblings.
- Click handler: the chip opens a tiny inline popover (two action buttons,
  inline-styled like the existing chips' hover state) rather than a full
  sheet — this matches the lightweight TopNav idiom and avoids competing
  with `OverlayController` for the global overlay slot. Actions:
  - "Sign in with Google" → `<a href="/api/auth/sign-in?returnPathname=/">`
  - "Use demo account" → POST form to `/api/auth/sign-in?demo=1&returnPathname=/`
- Hide via the existing `body.has-overlay` rule that other chips already
  respect, so the chip doesn't compete with sheets.
- When `status === 'signed-in'`, the chip is removed from the DOM (not just
  hidden) so screen readers don't announce a non-actionable element.

**Patterns to follow.**

- TopNav chip construction + delegated click handler: `TopNav.js` lines 14-83.
- Popover-from-chip: keep simple — no `OverlayController` integration; use a
  positioned child element with inline styles or a CSS class toggle so the
  chip surface stays under TopNav's z-index.
- Form-based demo POST: `ProfileSheetView`'s `SignedOutActions`.

**Test scenarios.**

- Renders four chips when `auth.status === 'signed-in'` (no extra chip).
- Renders five chips when `auth.status === 'signed-out'` (Letters, History,
  Profile, Path Finder, Sign in).
- Click the Sign in chip → popover opens with both Google + demo actions.
- Click "Use demo account" → submits a POST form to
  `/api/auth/sign-in?demo=1&returnPathname=/` (assert form construction).
- Subscribe-driven update: signing in (mutating `state.auth`) removes the
  chip; signing out re-adds it without breaking the four primary chips.
- Dispose detaches all listeners (no stale `auth` subscriber on remount).

### U5. Identity hydration prefers auth label over `'Me'`

**Goal.** Use the auth menu label for `state.profile.identity.name` when no
seed `student_profile` exists. Seed students continue to take their seed
identity unchanged.

**Requirements.** R2, R6.

**Dependencies.** U1.

**Files.**

- `src/lib/student-space/backend-snapshot.ts`
- `src/components/StudentSpaceHost.tsx` (pass `authMenu` into the snapshot
  pipeline, not just the engine `auth` slice)
- `test/lib/student-space/backend-snapshot.test.ts` (new — or extend an
  existing snapshot test if one is colocated)

**Approach.**

- `createStudentSpaceBackendSnapshot({ vips, wiki, trajectory, authMenu? })`
  threads the auth menu through `mapVipsPagesToStudentSpaceProfile(vips,
  authMenu?)`.
- Inside the mapper:
  - If `snapshot.student_profile` is non-null → use its `name` / `detail`
    as today.
  - Else if `authMenu?.status === 'signed-in'` → use `authMenu.label` for
    `name` and `authMenu.detail ?? ''` for `className`.
  - Else → fall back to `'Me'` / `''` as today (signed-out engines never
    hit the snapshot path because the server functions throw, but the
    test path covers the contract).
- Demo dev-bypass case is unchanged (seed resolves, `student_profile` wins).
- The `Profile.hydrateBackend` consumer already exists; nothing changes on
  the engine side beyond the value of the snapshot.

**Patterns to follow.**

- Existing snapshot mapper: `backend-snapshot.ts` lines 190-213.
- Auth menu shape: `auth-menu.handler.server.ts`.

**Test scenarios.**

- `student_profile` non-null + auth signed-in: snapshot identity name comes
  from `student_profile.name` (seed wins).
- `student_profile` null + auth signed-in (WorkOS): snapshot identity name
  equals `authMenu.label`; className equals `authMenu.detail ?? ''`.
- `student_profile` null + auth signed-in with empty `detail`: className
  is `''` (not `null`, not `undefined`).
- `student_profile` null + auth signed-out: identity name falls back to
  `'Me'` (existing behavior preserved).
- `student_profile` null + auth dev-bypass with student `'demo-a'`: hits
  the same signed-in path; label `'Dev bypass'` and detail `'demo-a'` are
  surfaced (acceptable for dev — same student switching uses demo cookie).

### U6. Auth-menu server smoke + live agent-browser validation

**Goal.** Lock the contract `loadAuthMenu()` exposes to the engine and
verify the four auth modes end-to-end against a running dev server.

**Requirements.** R7, R8.

**Dependencies.** U1–U5.

**Files.**

- `test/server/auth-menu.test.ts` (new — handler-shape tests covering
  signed-in / signed-out / dev-bypass / demo).
- `docs/plans/2026-05-20-001-feat-in-world-auth-wire-plan.md` (this plan;
  Completion Notes get filled in by `ce-work`).
- No new code; this unit captures the cross-system verification.

**Approach.**

- Unit tests for `loadAuthMenuHandler` cover all four branches (mock
  `getDevBypassAuth`, `getDemoBypassAuthFromCookie`, `getAuth`,
  `hasWorkosEnv`). The existing `test/auth/identity.test.ts` covers
  context resolution; this is the menu-shape contract that the engine
  now depends on.
- Live agent-browser pass (operator runs after `pnpm dev`):
  1. `DEV_BYPASS_AUTH=demo-a` (current dev mode) → engine boots straight
     to greeting; ProfileSheet shows seed-identity "Mei (Sec 4, NA)" with
     a Sign out button (note: under DEV_BYPASS_AUTH, sign-out only clears
     the demo cookie; restart is still required to flip identity).
  2. Cookie demo path: open `/` signed-out → click "Use a demo account"
     in EdupassLogin → identity comes back signed-in as `demo-a` → engine
     greeting → ProfileSheet shows Sign out → click Sign out → re-arrive
     signed-out, with TopNav showing the Sign in chip.
  3. WorkOS path (only if local WorkOS env present): open `/` → click
     "Sign in with Google" → hosted WorkOS login → callback creates the
     private student namespace → engine identity reflects WorkOS label.
  4. Signed-out continue-offline: open `/` → click "Continue offline" →
     engine continues with the legacy OFFLINE_DEMO_STUDENTS random pick;
     ProfileSheet shows "Sign in" button (because `state.auth.status` is
     still signed-out).

**Patterns to follow.**

- Existing route handler tests: `test/auth/routes.test.ts`.
- Identity context tests: `test/auth/identity.test.ts`.

**Test scenarios.**

- `loadAuthMenuHandler` returns `{ status: 'signed-in', kind: 'dev-bypass',
  detail: 'demo-a' }` when `getDevBypassAuth` resolves.
- Returns `{ status: 'signed-in', kind: 'workos', label, detail }` when
  WorkOS env is present and `getAuth()` returns a user.
- Returns `{ status: 'signed-in', kind: 'demo', label: 'Demo account',
  detail }` when demo cookie resolves (no WorkOS env path).
- Returns `{ status: 'signed-out' }` when nothing resolves.
- `AuthKit middleware is not configured` errors are swallowed into
  `signed-out` (existing behavior — pin it as a contract).
- Agent-browser run logged into a follow-up file (e.g.
  `test/manual/agent-browser-auth-flows.md`) or recorded in the plan's
  Completion Notes — not a CI test (browser-driven).

---

## Sequencing

1. **U1** lands first (the `Auth` slice + bridge wiring) — every other unit
   depends on it. No UI change yet; engine continues to render the dummy
   login until U2.
2. **U5** lands second (identity hydration) — small, isolated, lets us
   verify the auth label flows through the snapshot before any UI changes.
3. **U2** replaces the dummy `EdupassLogin` with real sign-in paths.
4. **U3** adds the ProfileSheet sign-out button.
5. **U4** adds the TopNav signed-out chip.
6. **U6** runs the cross-cutting validation (unit tests + agent-browser).

Tests for each unit ship in the same commit as the implementation. Final
verification: `pnpm check && pnpm test && pnpm build && git diff --check`
plus the manual agent-browser pass documented in U6.

---

## Key Technical Decisions

- **`Auth` is a state slice, not just a prop.** Modeled on `MoodPins.js` so
  the engine's existing subscribe/notify lifecycle and dispose pattern apply.
  This keeps the auth-aware chrome reactive (TopNav chip appears/disappears
  on sign-out) without bolting a separate event bus onto the engine.
- **Non-persistent auth slice.** Auth is a server-resolved fact; we do not
  add it to `Persistence.SLICES`. Reload re-reads from `loadAuthMenu()`.
  This avoids the cross-student stale-auth bug that per-student-key
  localStorage prefixing is the long-term fix for.
- **Identity name decoupled from auth label.** `Profile.setIdentity()`
  remains the authoritative path for the *student's chosen name*. Auth label
  only fills the `'Me'` fallback for real WorkOS users without seed data.
  This preserves the demo-a seed name, future user-set names, and avoids
  silently rewriting identity on every sign-in.
- **Engine dispose before navigation, on both sign-in and sign-out.** Today
  only the sign-out path drains Persistence's debounce queue. Sign-in needs
  the same drain (the new engine will boot from scratch under a new
  identity) but does NOT need the localStorage clear (no prior session to
  evict).
- **TopNav sign-in chip uses a chip-local popover, not OverlayController.**
  The Sign in chip's tiny popover would conflict with `OverlayController`'s
  single-overlay-at-a-time invariant if it registered as a sheet.
  Chip-local UI sidesteps the controller entirely and matches the existing
  TopNav idiom.
- **The dummy "Edupass" wordmark stays on the onboarding surface.** The
  visual identity is a Singapore-school cue; the *behavior* under that
  wordmark is what changes. Renaming "Edupass" is out of scope (cosmetic,
  needs MOE-aligned brand decision).
- **`Continue offline` is preserved.** Removing it would lock a developer
  with no WorkOS env and no demo cookie out of the engine entirely. Keeping
  it documents the offline mode as a deliberate fallback rather than a
  forgotten code path.

---

## Risks & Mitigations

- **Risk:** Engine boot races the `loadAuthMenu()` fetch and shows the
  signed-out login surface to a signed-in user briefly.
  **Mitigation.** `StudentSpaceHost` awaits `backend.loadAuthMenu?.()`
  *before* `createGame`. The host already awaits the dynamic engine import,
  so adding one more `await` does not change the user-visible boot order;
  the auth fetch is one short server function call. If `loadAuthMenu`
  rejects, the slice defaults to `signed-out` and the user sees the login
  surface — the same behavior as today.
- **Risk:** Sign-in redirect drops Persistence pending writes.
  **Mitigation.** U2 and U3 call `window.__studentSpaceGame?.dispose()`
  before any link or form navigation, matching the documented pattern in
  `src/lib/sign-out-engine.ts`. Tests assert the dispose call fires.
- **Risk:** `state.auth` subscribers leak across remounts (StrictMode).
  **Mitigation.** `Auth.instance = null` in `Game.dispose()`; subscribers
  use the same `Set` + unsubscribe-returning pattern as `MoodPins.js`.
  Tests cover the dispose path.
- **Risk:** Under `DEV_BYPASS_AUTH`, signing out clears the demo cookie but
  the next request still resolves via the env var — the user thinks they're
  signed out but is not.
  **Mitigation.** This is documented behavior of `DEV_BYPASS_AUTH` (see
  `src/auth/middleware.ts:32-39`); we are not changing it. The dev
  experience is "sign-out is for inspecting signed-out chrome under the
  cookie demo path; restart the dev server to flip dev-bypass." Plan
  Completion Notes call this out.
- **Risk:** WorkOS callback creates a private student namespace with no
  seed data → snapshot identity name was previously `'Me'`. With U5 it
  becomes the WorkOS label. If WorkOS returns no `firstName`/`lastName` and
  only an `email`, the identity reads as the email address. Acceptable for
  v0.2; flagged as a polish item.

---

## Dependencies / Prerequisites

- `pnpm dev` runs against a populated Neon Postgres branch (the dev DB used
  for the prior smoke pass). No schema changes; no migrations.
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` already configured (existing
  prereq for Mirror/Realtime Mirror smoke).
- For the WorkOS leg of U6 only: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`,
  `WORKOS_REDIRECT_URI`, `WORKOS_COOKIE_PASSWORD` populated. The other
  three legs (demo cookie, dev-bypass, signed-out) run without WorkOS env.
- `agent-browser` CLI on PATH (verified at `/opt/homebrew/bin/agent-browser`).

---

## Verification

- `pnpm check` (Biome + tsc) green on the new + modified files.
- `pnpm test` green, including the new unit tests under
  `test/engine/auth-state-slice.test.ts`,
  `test/engine/onboarding-edupass-login.test.ts`,
  `test/engine/profile-sheet-auth-actions.test.ts`,
  `test/engine/top-nav-auth-chip.test.ts`,
  `test/lib/student-space/backend-snapshot.test.ts` (or merge into the
  existing file), and `test/server/auth-menu.test.ts`.
- `pnpm build` succeeds.
- `git diff --check` clean.
- Agent-browser pass (U6) — four-mode matrix completed and noted in the
  plan's Completion Notes section.
