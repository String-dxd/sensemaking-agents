# sensemaking-agents — repo guardrails

This file is loaded as instructions for any agent (Claude Code, Codex, etc.) operating in this repo. Rules here override default behavior; follow them exactly.

For deeper context (architecture, substrate notes, history), see `docs/` and `docs/solutions/`.

---

## Commands

- `pnpm dev` — dev server at `http://localhost:3000`
- `pnpm check` — Biome + `tsc --noEmit` (run before declaring a change done)
- `pnpm test` — Vitest (one-shot); `pnpm test:watch` for the loop
- `pnpm build` — production build
- `pnpm db:migrate` / `pnpm seed` — local DB setup
- `pnpm smoke:mirror` / `pnpm smoke:managed-connector` / `pnpm smoke:managed-cartographer` — agent smoke tests
- `pnpm provision:managed-agents -- --update-existing connector,cartographer` — after editing managed-agent prompts or model defaults

Package manager is **pnpm only**. Do not introduce npm / yarn lockfiles.

---

## Repo conventions

- **Engine is a canonical fork.** `src/engine/student-space/` is the source of truth for the island scene. There is no upstream sync from `wondopamine/student-space` — edit in place.
- **`src/components/world/` was deleted** in the 2026-05-21 cleanup. Don't re-add it; the world lives in the engine.
- **Base UI for behavior, hand-rolled locals for visuals.** Use `@base-ui-components/react` for dialogs, drawers, radio groups, focus traps. Visual primitives in `src/components/ui/*` are hand-written in the shadcn style; do **not** install the `shadcn/ui` package.
- **Tenancy via `withStudent`.** Every DB read/write goes through the `withStudent` envelope (`src/db/*`, server handlers). Bypassing it is a tenancy bug.
- **Agents.** Mirror = OpenAI Realtime (browser WebRTC, server-brokered key). Connector / Cartographer / self_critique = Anthropic Managed Agents. Prompts in `src/agents/*.prompt.md`; binding in `src/agents/config.ts`; transport in `src/agents/runner.ts`. The deterministic verifier (`src/agents/verifier.ts`) is the hard gate before any Connector link is persisted.

---

## Engine view architecture

The engine's DOM-rendering surfaces have moved to React + Tailwind v4
(plan: `docs/plans/2026-05-22-001-refactor-full-dom-react-tailwind-migration-plan.md`).
Three.js scene objects, state slices, camera controls, renderer, audio, and
heuristics remain vanilla JS. React owns the visible DOM surfaces and calls
back into the engine for behavior.

**Routed sheets** — owned by TanStack Router file routes. Each route renders
its React sheet component directly; no engine sheet construction.

- `/profile`, `/profile/$tab` → `src/components/student-space/sheets/ProfileSheet.tsx`
- `/history`, `/history/$tab` → `src/components/student-space/sheets/HistorySheet.tsx`
- `/letters` → `src/components/student-space/sheets/LettersSheet.tsx`
- `/trajectory` → `src/components/student-space/sheets/TrajectorySheet.tsx`
- `/settings` → `src/components/student-space/sheets/SettingsSheet.tsx`
- `/` (world canvas) → `src/components/StudentSpaceHost.tsx` mounts overlays

**Sheet primitive** — every routed sheet composes the same shape on top of
`src/components/ui/sheet.tsx` (Base UI `Dialog.Root` with `modal={false}`):

```tsx
<Sheet open modal={false} onOpenChange={…}>
  <SheetSurface>
    <SheetSidebar>      {/* left pane, ~360px sidenav */}
      <SheetIdentityHeader>…</SheetIdentityHeader>
      <SheetSidenav>…</SheetSidenav>
    </SheetSidebar>
    <SheetContent>      {/* right pane */}
      <SheetPageHeader>…</SheetPageHeader>
      <SheetBody>…</SheetBody>
    </SheetContent>
  </SheetSurface>
</Sheet>
```

**Engine ↔ React seam** (`src/lib/student-space/`):

- `use-engine.ts` — `EngineContext` + `useEngine()` returns the live `Game`
  instance (or `null` while booting). `EngineHost` provides this at the root
  layout so any descendant can read the engine without prop drilling.
- `use-engine-slice-version.ts` — `useEngineSliceVersion(slice)` subscribes
  to an engine slice's mutation events via a version-bump pattern (sidesteps
  React's cached-snapshot warning that `useSyncExternalStore` triggers).
- `use-engine-overlay.ts` — `EngineOverlayProvider` + `useEngineOverlay()`
  coordinates non-routed overlays (capture sheets, chooser, pickers,
  onboarding). Toggles `body.has-capture-sheet`, `body.has-chooser`,
  `body.is-onboarding` via React effects.
- `use-world-position.ts` — `useWorldPosition(mesh, source)` projects a
  Three.js mesh position to screen pixels; returns a ref-callback that
  mutates `style.transform` / `opacity` directly per frame (keeps React
  out of the hot path). Pair with `<WorldLabel>` primitive.

**EngineHost** — `src/components/student-space/EngineHost.tsx` mounts the
engine once at the root layout. It owns:

- Engine boot (`createGame({…})`) + canvas DOM (`.game` div)
- Backend bridge construction + snapshot hydration
- Auth menu fetch (with 3s timeout)
- `useStudentSpaceRouteSync(game, …)` — URL → engine compatibility mirroring
- `setRenderActive(pathname === '/')` — rAF gating for routed pages
- SideRail lifecycle (React navigation rail; persists across every route)
- OnboardingFlow lifecycle (React ceremony orchestrator; runs across
  every route — `body.is-onboarding` and the floating skip button span the
  world and routed surfaces alike, matching legacy posture)

**StudentSpaceHost** — `src/components/StudentSpaceHost.tsx` is the world-
route React composition (mounts only on `/`). It owns the lifecycle for
non-routed world overlays:

- HUDs and pickers (`StudentSpaceHud.tsx`)
- Kira overlays, hover CTA, object peek/pickup, and hover probe
  (`WorldInteractions.tsx`, re-attached to `view.*` so engine code that
  reaches `view.kiraDialogue`, `view.objectPeek`, etc. keeps working)
- CaptureFab, CaptureChooser, AskSheet, MoodSheet
- IslandProgressionOverlay (existing React component)

`OverlayController.js` remains only as a compatibility bridge for imperative
engine callers that open non-routed capture overlays (`ask`, `mood`,
`chooser`). Routed sheets are URL-owned; opening a routed key through the
controller just closes active capture state.

**Design tokens** — canonical store is `@theme` in `src/styles.css`:

- Font stack: `--font-sans` set to Plus Jakarta Sans (engine canon)
- Sheet motion: `--color-sheet-bg`, `--color-sheet-pane-left`,
  `--color-sheet-ink`, `--color-sheet-divider`, `--blur-sheet`,
  `--duration-sheet`, `--ease-sheet`
- World frame: `--inset-frame`, `--width-rail`, `--radius-frame`,
  `--color-frame-outer-chrome`, `--color-frame-border`
- VIPS facet palette (mirrors `src/lib/profile-tokens.ts`)
- Marcia identity status palette (--color-status-{starter,diffused,…})
- HUD ink palette, onboarding palette

`src/engine/student-space/style.css` carries only the remaining engine
substrate: `.game` frame geometry, Three.js-adjacent half-sheet/FacetView
styling, substrate utilities, and legacy canvas support. Do not add new
per-surface DOM CSS there; new UI belongs in React components with Tailwind.

---

## Topic guardrails

Read these before touching the relevant area:

- **[Historical sheet chrome contract](docs/sheet-chrome-contract.md)** —
  retained for context only. New routed sheets use `src/components/ui/sheet.tsx`;
  new non-routed overlays use React host components and Tailwind.
