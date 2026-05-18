---
date: 2026-05-18
title: "feat: Port Student Space app shell as the new home surface"
type: feat
status: completed
origin: "User request 2026-05-18: replace world stage with Student Space's; backend wired later; Cmd-K dev palette to toggle UI vs backend table view"
---

# feat: Port Student Space app shell as the new home surface

## Premise

The Student Space repo (`github.com/wondopamine/student-space`, cloned to `~/Developer/student-space`) shipped two changes that unblock a wholesale shell port: (a) a public `createGame()` entrypoint with `dispose()` lifecycle and pluggable `StorageAdapter`; (b) an onboarding ceremony (3D egg shatter, Kira emerges, click-gated reveal, Plus Jakarta typography). ENGINE.md is the host contract.

This plan replaces our current home-route surface (Three.js scene we wrote + Sheets we wrote) with their engine mounted via `createGame()`. The agent pipeline (Mirror/Connector/Cartographer), DB, RLS, auth, and ablation evals are untouched. Backend wiring was deferred in this shell-port plan and is now covered by `docs/plans/2026-05-18-002-feat-student-space-backend-bridge-plan.md`.

A new developer surface — Cmd-K command palette — toggles between two app modes:
1. **UI mode** (default): their engine fills the screen.
2. **Backend mode**: a one-page table view of the agent pipeline against our Postgres data (transcript → Mirror → Connector proposals → verifier outcome → Cartographer).

## Policy reversal noted

Prior plans (`2026-05-13-001-feat-student-space-world-stage-plan.md`) explicitly forbade porting Student Space UI overlays — the boundary was "asset-only" (just `oakTreesVisual.glb`, `cherryTreesVisual.glb`, `foliageSDF.png`). The rationale was avoiding the singleton Game/View/State architecture and the in-Student-Space sheets/calendar/letters/Kira. That rationale is now superseded by their engine refactor: `createGame()` makes the singletons rentable per-mount, `dispose()` makes them disposable, and the `StorageAdapter` makes the persistence backend swappable. This plan acknowledges the reversal explicitly so the institutional rule "no Student Space at runtime" can be marked superseded by "yes, via the documented engine contract."

## Scope boundaries

### In scope
- Replace `src/routes/index.tsx` rendering tree with a single component that mounts `createGame()` inside a `useEffect` and tears down on cleanup.
- Bring over Student Space engine source under `src/engine/student-space/` (vendored copy of `sources/Game/` from their `student-space-v1/`) OR — preferred — import from sibling repo via a workspace-style alias in `tsconfig.json`. Decide in U1.
- Copy `public/trees/oakTreesVisual.glb`, `public/trees/cherryTreesVisual.glb`, `public/trees/foliageSDF.png` from their repo into our `public/trees/`.
- Self-host the DRACO decoder under `public/draco/` and patch their `Tree.js` to read from a host-overridable path (ENGINE.md Roadmap item — they intended to expose this). Reason: Singapore MOE school networks routinely whitelist-block gstatic.com.
- Add `vite-plugin-glsl` to our Vite config so their shader imports resolve at build time.
- Add a Cmd-K command palette (Base UI dialog + `cmdk` library) with two routes: UI mode and Backend mode.
- Build a single-route `/dev/pipeline` page that renders agent pipeline data as a table-based one-pager, joined per student event.
- Keep all of `src/agents/`, `src/server/`, `src/db/`, `src/auth/`, `test/` untouched.

### Out of scope (deferred)
- Wiring `StorageAdapter` to Postgres (their state.profile / state.moodPins / state.captures / state.onboarding all save to `localStorage` for now; backend sync is a follow-up).
- Bridging student `state.captures` events into our Mirror agent (today our flow goes through `MirrorSession.tsx` → `transcribe-mirror.handler.server.ts`; their captures go to localStorage). The bridge is a follow-up plan once shell is mounted.
- Removing or hiding our existing routes (`/library.*.tsx`, `/me.tsx`, `/reflect.*.tsx`). They stay reachable by URL for now; can be retired after the shell mode is validated.
- Onboarding/Kira data integration with our VIPS schema (today Kira speaks lines from `KiraDialogue.js`; our taxonomy doesn't drive that). Follow-up.
- Multi-instance (StrictMode double-mount works via `dispose()`; we don't need parallel games).
- Wrapping their localStorage namespace (`ss:v1:*`) with student-scoped namespacing yet — single-student local dev only until backend wiring.

### Constraints inherited from ENGINE.md
- **One game per page.** `createGame()` throws if a previous instance is live. Our React mount must call `dispose()` in cleanup. React StrictMode double-mount is the known case; their docs say this works.
- **Body class contract.** Engine owns `is-onboarding`, `is-onb-landing`, `is-night`, `has-overlay`, `has-capture-sheet`, `has-chooser`. Our Tailwind/shadcn must not overwrite `document.body.className`.
- **SSR-safe import, SSR-unsafe construction.** TanStack Start renders this route SSR by default. The mount must be in `useEffect` (or `'use client'` equivalent + dynamic import).
- **Persistence is sync.** `StorageAdapter.setItem` returns void; the `beforeunload`/`pagehide` flush can't await. When we eventually replace localStorage with a server-backed adapter, durability requires `navigator.sendBeacon` or `fetch(..., { keepalive: true })` internally.

## Affected and untouched

### Files replaced / set aside
- `src/routes/index.tsx` — rewrite as thin mount point.
- `src/components/WorldStage.tsx` — set aside; not imported anywhere after the rewrite.
- `src/components/world/` — entire directory becomes dormant (`createWorldScene.ts`, `flowers.ts`, `trees.ts`, `promptBird.ts`, `mailbox.ts`, `island.ts`, `sky.ts`, `vipsWorldMapping.ts`, `worldStyle.ts`, `WorldScene.tsx`, etc.). Do not delete in this PR — backend wiring may want some of these (especially `vipsWorldMapping.ts` for translating VIPS state into their engine's mood/capture shape).
- `src/components/FloatingWorldActions.tsx`, `WorldHud.tsx`, `CaptureActionMenu.tsx`, `EnvironmentPanel.tsx`, `EmotionPicker.tsx`, `VoiceButton.tsx`, `MirrorSession.tsx`, `VoicePhaseOverlay`, `BottomSheet.tsx`, `ProfileSheetView.tsx`, `ReflectionsSheetView.tsx`, `TrajectorySheetView.tsx`, `VipsPageView.tsx` — not imported by the new home route. Some will be reused by the backend table view (e.g. `BottomSheet`). Others get retired after the shell is validated.
- The in-flight `2026-05-15-001-fix-world-stage-real-data` plan — most of its units (U1–U3 decorative tree fixes, U5 prompt bird determinism) target files that are now dormant. **Decision point:** finish that plan first (keeps history clean) OR mark its remaining units `superseded` because the surface is replaced. Recommend: mark superseded and reference this plan as the reason.

### Files untouched
- `src/agents/` — Mirror, Connector, Cartographer, runner, verifier, prompts.
- `src/server/` — all handlers, auth, loaders, transcribe-mirror, auto-connector, counsellor-brief, runMirror/runConnector/runCartographer/runSelfCritique.
- `src/db/` — schema, queries, seed, migrations.
- `src/auth/` — WorkOS + Google OAuth.
- `test/` — ablation, agent tests, db tests, server tests.
- `vercel.json` — auto-connector cron still runs (no functional change).

### Files added
- `src/engine/student-space/` — vendored or aliased copy of `student-space-v1/sources/Game/`.
- `public/trees/oakTreesVisual.glb`, `cherryTreesVisual.glb`, `foliageSDF.png` — already present in our `public/`; verify versions match.
- `public/draco/` — self-hosted DRACO decoder (gltf-pipeline ships these or copy from three.js examples).
- `src/components/StudentSpaceHost.tsx` — React component that mounts/disposes `createGame()`.
- `src/components/DevPalette.tsx` — Cmd-K command palette (Base UI dialog + cmdk).
- `src/routes/dev.pipeline.tsx` — backend table view route.
- `src/server/load-pipeline-trace.functions.ts` — loader for backend table view data.

### Tests to add
- `test/engine/StudentSpaceHost.test.tsx` — mount + dispose lifecycle, StrictMode double-mount behavior.
- `test/components/DevPalette.test.tsx` — keybinding (Cmd-K opens), routing.
- `test/routes/dev.pipeline.test.tsx` — table renders for seeded student.

## Sequencing

### U1. Vendor the engine into `src/engine/student-space/`

**Decision (2026-05-18):** clean-cut copy — `cp -R` from upstream `~/Developer/student-space/student-space-v1/sources/Game/` (commit `cd30172`). No future upstream sync intended. The code is ours to edit freely; engine bugs are in-PR fixes, not "patches against upstream."

- Copy `Game/` → `src/engine/student-space/Game/`.
- Copy `style.css` → `src/engine/student-space/style.css`.
- Biome: add `src/engine/student-space/` to ignore list — engine source is JS with 4-space Bruno-Simon style; preserving the original formatting is more useful than retro-fitting our 2-space convention across ~26k LOC of working code.

### U2. Verify the engine constructs in our Vite + TanStack Start environment
- Install `vite-plugin-glsl@^1.3` (latest compatible with Vite 7); add to `vite.config.ts` plugin list.
- Verify Three 0.184 vs their 0.149 — diff-check `Tree.js` for deprecated three.js APIs (the `KHR_draco_mesh_compression` interface, `GLTFLoader.setDRACOLoader`, BufferGeometry merging). Quick smoke: just `npm run dev` and watch console.
- Verify their `import.meta.url` / `new URL('trees/...')` asset paths resolve under TanStack Start. May need a small base-path patch.

DoD: a throwaway test page can import `createGame` without bundler errors. Construction can fail at runtime — that's fine, U3 fixes it.

### U3. Build `StudentSpaceHost.tsx` — mount + dispose
- `'use client'`-equivalent route boundary (TanStack Start's `clientOnly` HOC or guarded `useEffect`).
- `useEffect` on a `ref.current` div: `const game = createGame({ container: ref.current, persistence: { storage: localStorageAdapter() } })`. Cleanup: `game.dispose()`.
- React StrictMode double-mount: their docs say `dispose()` handles it. Add a dev-only assertion that logs warn if `createGame` throws (means StrictMode dispose path is broken).
- Self-host DRACO: edit `src/engine/student-space/Game/View/Tree.js` to read from `/draco/` instead of `gstatic.com`. Under clean-cut policy this is just our code, not a "patch."

DoD: `/` renders Student Space island; mood pins, captures via their UI, day cycle work; localStorage persists across reloads; HMR doesn't double-mount.

### U4. Rewrite `src/routes/index.tsx`
- Replace the entire LandingPage component with `<StudentSpaceHost />`.
- Strip imports for retired components.
- Loader: drop the `vips-pages` prefetch (we're not rendering it in UI mode); keep `auth-menu` loader so auth state is available for the dev palette.

DoD: `/` is their engine, period. Sheet/library URLs (`/library.*`, `/me`) still reachable by direct URL.

### U5. Cmd-K dev palette
- Install `cmdk` (or build minimal palette directly on Base UI's `Dialog`). The user's auto-memory says "Use shadcn + Base UI for all components" — Base UI's `Dialog` + custom keybinding listener is the clean fit.
- Keybinding: `Cmd+K` (macOS) / `Ctrl+K` (other) opens; `Esc` closes.
- Initial commands:
  - "Switch to backend table view" → `/dev/pipeline`
  - "Switch to UI mode" → `/`
  - "Sign out" → existing auth menu logout
  - **Legacy routes (decision 2026-05-18: surface via Cmd-K, don't 404)**:
    - "Open legacy library" → `/library`
    - "Open legacy profile (`/me`)" → `/me`
    - "Open legacy reflect flow" → `/reflect`
- Gate visibility: dev-only (`import.meta.env.DEV`) OR always-on with auth-menu role check (`counsellor` or `dev`). Recommend dev-only for now; counsellor-role gate is a follow-up.

DoD: pressing Cmd-K from `/` opens a palette with the four commands; selecting one navigates.

### U6. Backend table view `/dev/pipeline`
- New route `src/routes/dev.pipeline.tsx`. Loader: `loadPipelineTrace({ data: { studentId } })`.
- New server function `src/server/load-pipeline-trace.functions.ts` that joins:
  - `mirror_entries` (transcript, validation, inferred_meaning, story_reframe, context_type, created_at, review_status)
  - `connector_outputs` (link to mirror_entry; pattern; verifier action: admitted/downgraded/dropped; reject reason)
  - `vips_proposed_diffs` (audit trail with verifier outcomes)
  - `pathfinder_outputs` / `cartographer_outputs` (the Trajectory synthesis)
  - `vips_pages` (current page state per dimension)
- Page layout: one big HTML table, one row per mirror entry, columns: `id | created_at | transcript (truncated) | Mirror review_status | Connector proposals (count) | verifier admitted | verifier downgraded | verifier dropped | reached pages | last Cartographer touch`.
- Each row expandable into a detail strip with full transcript, full Connector pattern JSON, the verifier audit payload, and links into any reached `vips_pages`.
- Filter: by student (single demo student fine until backend wiring).
- Style: utilitarian; no Three.js; tabular monospace data. The dev palette should be reachable from this page too (so you can flip back to UI mode without going to `/`).

DoD: a seeded student (demo-a) renders a full pipeline trace; rows match what's in `vips_proposed_diffs` audit; expanding a row shows full JSON.

### U7. Mark superseded; archive prior plan

**Decision (2026-05-18): discard the uncommitted modifications.** They target `src/components/world/`, `FloatingWorldActions`, `seed.ts`, and `routes/index.tsx` — all about to be dormant or rewritten. None touch agents/db/server.

- Discard tracked modifications from `2026-05-15-001`'s working files (executed at start of port).
- Add `docs/plans/2026-05-15-001-fix-world-stage-real-data-plan.md` to git and update frontmatter: `status: superseded`, add `superseded_by: 2026-05-18-001`.
- Leave the untracked test files (`test/world/flowers.test.ts`, `test/world/promptBird.test.ts`) where they are — they're harmless until we retire `src/components/world/`.

### U8. Smoke + browser test
- Start dev server. Verify:
  - `/` renders Student Space onboarding + island; reload preserves state; HMR doesn't double-mount.
  - Cmd-K opens palette; backend mode navigates; UI mode returns.
  - `/dev/pipeline` for `demo-a` shows seeded data.
  - Three known constraints: gstatic DRACO replaced by `/draco/` (no third-party requests in network tab); body classes are owned by engine; localStorage namespace `ss:v1:*` is populated.

DoD: manual smoke pass; tests in U3/U5/U6 green; biome/tsc clean.

## Risks

- **TanStack Start + Vite 7 + their Vite 4 GLSL plugin.** The `vite-plugin-glsl` versions diverged. If 1.3+ breaks on their shaders, we may need a tighter pin or a pre-inline step. Mitigation: U2 verifies before any other work.
- **Three 0.149 → 0.184 surface area.** Five minor versions of Three.js can move asset-loading APIs (Draco, GLTF). Risk is mostly the loader chain in `Tree.js`. Mitigation: U2 also smokes this. If it breaks, downgrade our `three` to `0.149.x` for the duration of the port — we don't use Three elsewhere after the shell switch.
- **Singletons collide with React StrictMode dev double-mount.** ENGINE.md says `dispose()` handles it; verify in U3 by running with strict mode on (TanStack Start uses React 19, StrictMode is opt-in).
- **DRACO from gstatic.com.** Their default fetches the Draco decoder from `gstatic.com/draco/v1/decoders/` — Singapore MOE networks routinely block third-party CDNs. ENGINE.md flags this. U3 self-hosts.
- **Backend table view scope creep.** Easy to over-design. Constraint: one HTML table; one expandable detail strip; no charts. If we want richer analytics, add a second route, don't enrich this one.
- **Existing routes (`/library/*`, `/me`, `/reflect/*`) still work but are orphaned.** Confusing for QA. Either gate them with the dev palette ("Open legacy library") or 404 them. Decision in U5.
- **Audio context unlock collides with our voice recording (MirrorSession).** Their engine registers `window.pointerdown` listeners to unlock AudioContext for engine sound; we have separate MediaRecorder code. Since UI mode doesn't currently expose our voice button (their CaptureFab/Capture sheets take over), this is moot for now. When we bridge captures, watch for AudioContext conflicts.
- **Their `is-night` body class vs our Tailwind dark mode.** They write `is-night` to body; we use Tailwind's `dark:` selector via the `dark` class on `<html>`. No collision (different attribute targets), but theming behavior will look mixed until we decide whose theme wins.

## Definition of Done

- `/` renders Student Space engine + onboarding + island.
- `Cmd-K` opens the dev palette from anywhere.
- `/dev/pipeline` renders the full agent pipeline trace as a one-page table for a seeded student.
- All existing agent/server/db tests still pass (`pnpm test`).
- biome + tsc clean.
- This plan's status moves to `active` then `completed`; prior `2026-05-15-001` is marked `superseded` (decision in U7).
- No third-party CDN requests on initial page load (DRACO self-hosted).
- Browser console clean on initial mount; dispose path tested via HMR + StrictMode toggle.

## Institutional learnings (to capture in `docs/solutions/` once landed)

- Vendored vs sibling-imported engine: the lesson is which option survived contact with reality (loader resolution, type-checking, upstream merge friction). Capture in `docs/solutions/engine-import-strategy.md`.
- StrictMode singleton survival: precise sequence that made `dispose()` work cleanly across React 19 StrictMode double-mount. Capture in `docs/solutions/three-engine-react-mount.md`.
- DRACO self-hosting: copy decoders from `three/examples/jsm/libs/draco/gltf/` to `public/draco/` and set `dracoLoader.setDecoderPath('/draco/')` in `Tree.js`. Capture in `docs/solutions/draco-self-host.md`.
