# sensemaking-agents — repo guardrails

Rules here override default behavior. For deeper context, see `docs/` and `docs/solutions/`.

---

## Commands

- `pnpm dev` — dev server at `http://localhost:3000`
- `pnpm check` — Biome + `tsc --noEmit` (run before declaring a change done)
- `pnpm test` — Vitest (one-shot); `pnpm test:watch` for the loop
- `pnpm build` — production build
- `pnpm db:migrate` / `pnpm seed` — local DB setup
- `pnpm smoke:mirror` / `pnpm smoke:managed-connector` / `pnpm smoke:managed-cartographer` — agent smoke tests
- `pnpm provision:managed-agents -- --update-existing connector,cartographer` — after editing managed-agent prompts or model defaults

Package manager is **pnpm only**. No npm / yarn lockfiles.

---

## Repo conventions

- **Engine is canonical.** `src/engine/student-space/` is the source of truth — edit in place; no upstream sync from `wondopamine/student-space`.
- **No `src/components/world/`.** Deleted 2026-05-21; the world lives in the engine.
- **Base UI for behavior, hand-rolled shadcn-style visuals.** `@base-ui-components/react` for dialogs, drawers, radio groups, focus traps. Visual primitives in `src/components/ui/*` are local. Do **not** install the `shadcn/ui` package.
- **Tenancy via `withStudent`.** Every DB read/write goes through the envelope (`src/db/*`, server handlers). Bypassing it is a tenancy bug.
- **Agents.** Mirror = OpenAI Realtime (browser WebRTC, server-brokered key). Connector / Cartographer / self_critique = Anthropic Managed Agents. Prompts in `src/agents/*.prompt.md`; binding in `src/agents/config.ts`; transport in `src/agents/runner.ts`. The deterministic verifier (`src/agents/verifier.ts`) is the hard gate before any Connector link is persisted.

---

## Engine view architecture

DOM surfaces are React + Tailwind v4 (TanStack Start + TanStack Router). Three.js scene objects, state slices, camera, renderer, audio, and heuristics stay vanilla JS in `src/engine/student-space/`. React owns visible DOM and calls back into the engine for behavior.

**Routed sheets** — TanStack Router file routes; each renders its sheet component directly. All under `src/components/student-space/sheets/`.

- `/` (world canvas) → `src/components/StudentSpaceHost.tsx` mounts overlays
- `/profile`, `/profile/$tab` → `ProfileSheet.tsx`
- `/history`, `/history/$tab` → `HistorySheet.tsx`
- `/letters` → `LettersSheet.tsx`
- `/trajectory` → `TrajectorySheet.tsx`
- `/settings` → `SettingsSheet.tsx`

**Sheet primitive** — every routed sheet composes the same shape on `src/components/ui/sheet.tsx` (Base UI `Dialog.Root`, `modal={false}`):

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

**Side rail** — `src/components/student-space/navigation/SideRail.tsx`. Two groups:

- Top: Island, History, Profile, Path Finder
- Bottom: Letters, Settings

Hidden during onboarding and on `/onboarding`. "Restart onboarding" lives inside `/settings`, not on the rail. `SHEET_HREFS` is the single source of truth for nav paths; round-trip is enforced by `test/engine/SideRail.hrefs.test.ts`.

**Engine ↔ React seam** (`src/lib/student-space/`):

- `use-engine.ts` — `useEngine()` returns the live `Game` (or `null` while booting). Provided by `EngineHost` at the root.
- `use-engine-slice-version.ts` — subscribe to a slice via a version-bump pattern (sidesteps `useSyncExternalStore`'s cached-snapshot warning).
- `use-engine-overlay.ts` — coordinates non-routed overlays via `body.has-capture-sheet`, `body.has-chooser`, `body.is-onboarding` class toggles.
- `use-world-position.ts` — projects a Three.js mesh to screen pixels; ref-callback mutates `style.transform` / `opacity` directly per frame (no React in the hot path). Pair with `<WorldLabel>`.

**Hosts**:

- `EngineHost` (`src/components/student-space/EngineHost.tsx`) — mounts the engine + canvas once at the root layout. Owns boot, backend bridge, URL ↔ engine route sync, rAF gating (`setRenderActive(pathname === '/')`), SideRail, OnboardingFlow.
- `StudentSpaceHost` (`src/components/StudentSpaceHost.tsx`) — world-route composition (mounts only on `/`). Owns HUDs/pickers, Kira/peek/hover overlays (`WorldInteractions.tsx`, re-attached to `view.*` for imperative engine callers), CaptureFab + Ask/Mood sheets, `IslandProgressionOverlay`.

`OverlayController.js` survives only as a compatibility bridge for imperative engine callers that open non-routed capture overlays (`ask`, `mood`, `chooser`). Routed sheets are URL-owned.

**Design tokens** — `@theme` in `src/styles.css` is the canonical store: `--font-sans`, sheet tokens (`--color-sheet-*`, `--blur-sheet`, `--duration-sheet`, `--ease-sheet`), world frame tokens (`--inset-frame`, `--width-rail`, `--radius-frame`, `--color-frame-*`), VIPS facet palette (mirrors `src/lib/profile-tokens.ts`), Marcia identity-status palette, HUD ink, onboarding palette.

`src/engine/student-space/style.css` now carries only engine substrate: `.game` frame geometry, Three.js-adjacent canvas styling, legacy substrate. The half-sheet facet card migrated to React (`FacetSheetCard` + `FacetSheetController` in `WorldInteractions.tsx`). New UI belongs in React + Tailwind — do not add per-surface DOM CSS there.

---

## Historical contracts

- **Sheet chrome contract** (`docs/sheet-chrome-contract.md`) — pre-React-migration. Retained for context only; new routed sheets use `src/components/ui/sheet.tsx`, new non-routed overlays use React host components.
