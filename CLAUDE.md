# sensemaking-agents — repo guardrails

Rules here override default behavior. For deeper context, see `docs/` and `docs/solutions/`.

---

## Commands

- `pnpm dev` — dev server at `http://localhost:3000`
- `pnpm dev:editor` — standalone island editor (r3f/drei) at `http://localhost:5180` (alias for `pnpm --filter island-editor dev`)
- `pnpm dev:character-studio` — standalone character studio at `http://localhost:5190` (alias for `pnpm -C character-studio dev`)
- `pnpm check` — Biome + `tsc --noEmit` (run before declaring a change done)
- `pnpm check:island-editor` — typecheck + tests for the island editor (a pnpm workspace member; still **not** covered by `pnpm check`)
- `pnpm check:character-studio` — typecheck + tests for character-studio (isolated pnpm root, own lockfile; **not** covered by `pnpm check` or `pnpm check:all`)
- `pnpm check:all` — runs `pnpm check` then `pnpm check:island-editor` (does **not** include character-studio or bird-builder — run their checks separately)
- `pnpm test` — Vitest (one-shot); `pnpm test:watch` for the loop
- `pnpm build` — production build
- `pnpm db:migrate` / `pnpm seed` — local DB setup
- `pnpm smoke:mirror` / `pnpm smoke:managed-connector` / `pnpm smoke:managed-cartographer` — agent smoke tests
- `pnpm provision:managed-agents -- --update-existing connector,cartographer` — after editing managed-agent prompts or model defaults

Package manager is **pnpm only**. No npm / yarn lockfiles.

**Standalone studios.** `island-editor/` (island shape designer, port `5180`), `bird-builder/` (bird dress-up studio), and `character-studio/` (animated 3D animal companion authoring, port `5190`) are separate creative tools outside the main app.

- `bird-builder/` and `character-studio/` are **fully isolated pnpm workspace roots** — own `pnpm-workspace.yaml` + lockfile + modern `three` (r3f/drei) — deliberately separate from the product app's pinned `three@0.149`. Root tooling never sees them (`biome.json`/`vitest.config.ts`/`tsconfig.json` are scoped to `src`+`test`), so `pnpm check`/`test`/`build` are unaffected. `bird-builder` has no root alias — run it from its own dir (`cd bird-builder && pnpm install && pnpm dev`). `character-studio` has root aliases instead (`pnpm dev:character-studio`, `pnpm check:character-studio`); never add it to the root `pnpm-workspace.yaml#packages` or to any root `three` override — that would collapse the deliberate per-package version split.
- `island-editor/` is **not** isolated the same way — it's a member of the root pnpm workspace (`pnpm-workspace.yaml#packages`), sharing the root lockfile/install; only its `three` runtime version (`0.171`) is split from the app's.

The bird-builder is a **procedural-parametric** bird character creator (V2): variety from our own primitives (`BirdGenome` + `src/rig/buildProceduralBird.ts`, ported from the engine's `Kira.js`), with an authored-GLB upgrade lane (`bird-builder/ASSET-CONTRACT.md`). See `docs/plans/2026-06-17-002-feat-bird-builder-procedural-variety-refactor-plan.md`.

character-studio authors animated animal companions (drawn-face toon aesthetic, spring-bone secondary motion) behind a versioned `CharacterSpec` (`src/core/spec/schema.ts`, `SPEC_VERSION`) — every schema change (field added/removed/renamed, range tightened, enum member added) must bump `SPEC_VERSION` and add a matching entry to `MIGRATIONS` in `src/core/spec/migrate.ts`, even when the migration is an identity transform. See `character-studio/README.md`.

---

## Repo conventions

- **Engine is canonical.** `src/engine/student-space/` is the source of truth — edit in place; no upstream sync from `wondopamine/student-space`.
- **No `src/components/world/`.** Deleted 2026-05-21; the world lives in the engine.
- **Base UI for behavior, hand-rolled shadcn-style visuals.** `@base-ui-components/react` for dialogs, drawers, radio groups, focus traps. Visual primitives in `src/components/ui/*` are local. Do **not** install the `shadcn/ui` package.
- **Tenancy via `withStudent`.** Every DB read/write goes through the envelope (`src/db/*`, server handlers). Bypassing it is a tenancy bug.
- **Agents.** Mirror = OpenAI Realtime (browser WebRTC, server-brokered key). Connector / Cartographer / self_critique = Anthropic Managed Agents. Prompts in `src/agents/*.prompt.md`; binding in `src/agents/config.ts`; transport in `src/agents/runner.ts`. The deterministic verifier (`src/agents/verifier.ts`) is the hard gate before any Connector link is persisted.
- **pnpm monorepo (one lockfile).** Members are the root app (`.`) and `island-editor` (`pnpm-workspace.yaml#packages`). `three` **runtime** is intentionally split per-package — `0.149` (app engine) vs `0.171` (editor r3f) — and pnpm isolates them, so that's fine. But `@types/three` (`0.184`) and `vite` (`7`) are pinned to **one** version repo-wide: two copies of those produce TS type-identity splits (e.g. `BufferGeometry`/`Camera`/vite `Plugin` mismatches) because the editor's transitive deps fall through to the root's hoisted copy. **Never** add `three` to `overrides` — overrides are workspace-global and would collapse the deliberate runtime split. (`@types/three` and `vite` are already single-version; keep them aligned via each `package.json`, not via an override — which is redundant at best and risks the same global collapse.)

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
