# Plan 012: Studio shell, workflow UI, and roster management

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§1 builder flow, §8). Follow steps in order, verify each, honor STOP
> conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/studio`
> Confirm plans 002–010 landed their panels (Face, Material, Anatomy,
> Wardrobe, Sculpt, Lighting, PlayControls, MotionDebug, Export if 011 done).
> This plan composes them; missing panels shrink scope accordingly (note
> which in your report). `characterStore` (plan 004) must exist — hard
> requirement.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (composition + persistence; little algorithmic risk)
- **Depends on**: plans/004 (hard); 002–010 (composes whatever has landed)
- **Category**: direction
- **Recommended executor**: Sonnet 5
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

Designers experience the studio through this shell: the builder flow from the
brief (choose animal → shape anatomy → dress → materials → freeform → play →
save/export) becomes a coherent tool instead of floating debug panels. Roster
management (save, load, duplicate, thumbnails) is how the team accumulates
the actual product deliverable — a roster of finished companions.

## Current state

- Panels exist as independently-mounted floating components, each built by
  its feature plan with minimal styling; `App.tsx` mounts them ad hoc.
- Known issues to absorb (surfaced during Phase-1 integration, 2026-07-02):
  FacePanel.tsx mixes shorthand `border` with longhand `borderColor` in its
  active-preset button style (React dev warning on preset switch — fix when
  wrapping panels in shared chrome); FacePanel and MotionDebugPanel both dock
  fixed top-right and overlap (the ModeTabs layout in step 1 resolves this).
- Spec store (plan 004) with `serializeSpec`/`parseSpec`
  (`<name>.character.json` contract, stable key order); command stack (plan
  009) exists for sculpt/lighting; `studioLook.portraitCamera` (plan 010) for
  thumbnails.
- No routing, no persistence, no roster. The studio is a Vite SPA (no
  TanStack, no Tailwind configured in this workspace — keep it that way:
  plain CSS modules or a single `styles.css` with CSS custom properties;
  do NOT add UI framework dependencies without need — `zustand` is the only
  state lib).

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev / build | `pnpm dev` / `pnpm build` | serves / exit 0 |

## Scope

**In scope**:
- `character-studio/src/studio/shell/{Shell.tsx, ModeTabs.tsx, TopBar.tsx, Toasts.tsx}` (new)
- `character-studio/src/studio/roster/{rosterStore.ts, RosterView.tsx, thumbnails.ts}` (new)
- `character-studio/src/studio/App.tsx` (recompose), `src/styles.css` (studio theme)
- `character-studio/test/studio/roster.test.ts`
- Light touch-ups to each panel for consistent chrome (className/wrapper only — no behavior changes)

**Out of scope**:
- Any behavior change inside feature panels, server persistence/auth (the
  studio is local-first v1), product-app integration, student UI.

## Git workflow

- Branch: `advisor/012-studio-shell`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: Shell + mode tabs

`Shell.tsx`: left viewport (the Stage, always mounted), right panel column,
top bar. `ModeTabs.tsx` maps the brief's builder flow to modes:
`Animal | Anatomy | Wardrobe | Materials | Sculpt | Lighting | Play` — each
mode shows its panel(s) (Animal = archetype section of AnatomyPanel; Play
swaps the right column for PlayControls and hides gizmos). Keyboard: 1–7
switch modes, ⌘Z routed to the command stack, Space toggles Play. `Toasts.tsx`:
minimal toast queue (store errors — e.g. plan-009 baseMeshVersion mismatch —
surface here).

Theme: dark neutral studio chrome (the character is the color), 13px UI
font, consistent slider/button styles via CSS custom properties in
`styles.css`. Panels get a shared `<PanelSection title>` wrapper.

**Verify**: `pnpm dev` → all landed panels reachable via tabs; no panel
overlaps the viewport; keyboard switching works.

### Step 2: Roster persistence (`rosterStore.ts`)

Local-first: IndexedDB (via a ~30-line typed wrapper on `indexedDB` — no
dependency) storing `{ id, name, updatedAt, specJson, thumbnailBlob }`.
- Autosave: debounced 2 s after any store `patch` when a character is open.
- Explicit actions: New (archetype chooser), Duplicate, Rename, Delete
  (confirm), Import `.character.json` (file input → `parseSpec` → migration
  runs), Export `.character.json` (download serialized).
- `thumbnails.ts`: render the current character from
  `studioLook.portraitCamera` (fallback: default framing) to a 512² offscreen
  canvas → blob (reuse the live renderer with a temporary camera — do not
  create a second WebGL context).

Tests (`roster.test.ts`, with `fake-indexeddb` if needed as a devDep, or a
storage-interface stub): CRUD round-trip, autosave debounce (fake timers),
import of a corrupted JSON surfaces a toast-able typed error, migration
invoked on import.

### Step 3: Roster view

`RosterView.tsx`: entry screen (and top-bar "Roster" button): thumbnail grid
of saved characters, open/duplicate/delete/rename, "New Character" with the
three archetype cards, import/export buttons, and — if plan 011 landed — an
"Export .companion.glb" action per character.

**Verify**: create → edit → autosave → reload page → roster shows the
character with thumbnail → reopen → identical state (spec deep-equal;
verify sculpt deltas and wardrobe survive if those plans landed).

### Step 4: Crash-safety pass

Wrap the viewport in an error boundary (a broken spec must not white-screen
the studio — boundary offers "revert to last autosave"); `beforeunload`
warning when dirty; store versioned autosave slots (keep last 5 per
character, pruned).

**Verify**: `pnpm typecheck && pnpm test && pnpm build` all pass; force an
error in a panel (temporarily) → boundary catches, revert works.

## Test plan

`test/studio/roster.test.ts` (≥ 6 cases per step 2). Existing suites stay
green (panel wrapper touch-ups must not break feature tests). `pnpm test` →
all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test && pnpm build` exit 0
- [ ] Full builder flow walkable via tabs on one character without console errors
- [ ] Reload-safe: autosaved roster restores losslessly (deep-equal test in dev)
- [ ] Thumbnails render from portrait camera
- [ ] No new runtime dependencies beyond (optionally, dev-only) `fake-indexeddb`
- [ ] `plans/README.md` updated

## STOP conditions

- `characterStore` (plan 004) absent — hard dependency, stop.
- Thumbnail capture requires a second WebGL context to avoid corrupting the
  live view — report before adding one (contexts are a scarce resource).
- Any panel needs behavior changes to fit the shell — report, don't refactor
  feature internals here.

## Maintenance notes

- The roster's IndexedDB schema is versioned data — add a `dbVersion` and
  document upgrade policy in `rosterStore.ts` from day one.
- Later server sync (team-shared rosters) replaces `rosterStore` internals
  behind the same interface; keep the interface narrow.
- Reviewer: autosave debounce vs sculpt drags (a 45-minute sculpt session
  must not queue hundreds of 5 MB spec snapshots — deltas make specs big;
  consider autosave skip while pointer is down).
