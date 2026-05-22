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

The engine's DOM-rendering surfaces are being migrated to React + Tailwind v4
(plan: `docs/plans/2026-05-22-001-refactor-full-dom-react-tailwind-migration-plan.md`).
The migration is **in-flight** as of this commit — 16 of 21 units shipped on
this branch; onboarding (U16–U19) and final cleanup (U21) remain.

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
- `useStudentSpaceRouteSync(game, …)` — URL ↔ surface mirroring
- `setRenderActive(pathname === '/')` — rAF gating for routed pages
- SideRail lifecycle (engine widget; persists across every route)

**StudentSpaceHost** — `src/components/StudentSpaceHost.tsx` is the world-
route React composition (mounts only on `/`). It owns the lifecycle for
every engine widget that was previously constructed in `View.js`:

- HUDs (HourHud, StatusPreviewHud, ZoomHud, FpsOverlay)
- Pickers (BirdPicker, TrackPicker)
- Kira overlays (KiraDialogue, KiraNarrator — re-attached to `view.*` so
  engine code that reaches them at `view.kiraDialogue` etc. keeps working)
- In-world interaction widgets (ObjectPeek, HoverCta, HoverProbe — same
  view re-attach pattern, dependency-order constructed)
- CaptureFab (which owns CaptureChooser, AskSheet, MoodSheet internally)
- IslandProgressionOverlay (existing React component)

These engine widgets continue to render their own DOM + CSS until a future
per-widget React rewrite pass; what U10/U12–U15/U20 changed is **lifecycle
ownership** (React mounts + disposes; engine still draws).

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

`src/engine/student-space/style.css` carries only what the engine substrate
still uses: Three.js canvas wrapper (`.game` frame inset + rounded corners),
the still-alive engine widget classes (HUDs, pickers, Kira overlays, in-
world labels, capture sheets, onboarding), the sheet-chrome shared
selectors that capture sheets and onboarding still consume. It shrank from
9,136 → ~5,000 lines as routed sheets and dead code came out.

**Sheet chrome contract** (legacy) — the original
`docs/sheet-chrome-contract.md` rule said "every full-viewport sheet in the
engine MUST be built on the shared SheetChrome primitive." That rule is now
**partial**: routed sheets use the React `<Sheet>` primitive; capture sheets
(Ask, Mood) and onboarding still use the engine `SheetChrome.js` class.
Once U16–U19 (onboarding) and full Ask/Mood React rewrites land, the engine
SheetChrome can be removed in the U21 final cleanup pass.

---

## Topic guardrails

Read these before touching the relevant area:

- **[Sheet chrome contract](docs/sheet-chrome-contract.md)** — the contract
  applies to the few engine surfaces (capture sheets, onboarding) that
  still use `SheetChrome.js`. Routed sheets use the React `<Sheet>`
  primitive in `src/components/ui/sheet.tsx` instead.
