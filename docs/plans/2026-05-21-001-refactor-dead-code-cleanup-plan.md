---
title: Dead code cleanup — legacy world scene, engine port finalization, root plans archive
type: refactor
status: active
date: 2026-05-21
---

# Dead code cleanup — legacy world scene, engine port finalization, root plans archive

## Summary

Three-track cleanup of dead code in `sensemaking-agents`. **Track 1** retires the dormant legacy world scene (~6,800 LOC across `src/components/world/`, the React shims `WorldStage.tsx`/`WorldHud.tsx`/`VoiceButton.tsx`, their tests, and stale entries in the `/dev/design` registry and `vitest.config.ts` exclude list). **Track 2** finalizes the engine port: `src/engine/student-space/` is the canonical fork and the external `~/Developer/student-space/` clone can be deleted by the user — no in-repo action. **Track 3** archives the legacy root `plans/` directory by moving its 13 entries to `docs/plans/_archive/` and rewriting the seven in-code comment references that point at the old root paths.

---

## Problem Frame

The repo has carried three categories of post-merge debris for several iterations:

1. The legacy React/Three world scene is dormant per `CLAUDE.md` and per the `docs/solutions/2026-05-18-island-progression-engine-substrate.md` rule of thumb, but its files, tests, vitest exclusions, and dev-design registry entries are still present. `world-studio` (PR #25) merged as orphans on 2026-05-21 favoring main; the surviving files have no live consumers.
2. The engine was ported into `src/engine/student-space/` and has since diverged substantially from `~/Developer/student-space/`. The external clone is no longer the source of truth and is not being kept in sync (see auto-memory: `project_engine_is_canonical_fork`).
3. The root `plans/` directory predates the `docs/plans/` convention. It is no longer the active plan home but seven `src/` files still reference plan paths via the old `plans/...` prefix, so simply deleting it would leave dangling comments.

---

## Requirements

- R1. All files listed in Track 1 deletion manifest are removed; `pnpm test`, `pnpm build`, and biome lint all pass.
- R2. `vitest.config.ts` exclude list no longer references any deleted file; only legitimate excludes remain.
- R3. `src/routes/dev.design.tsx` registry contains no entries pointing at deleted components.
- R4. `docs/solutions/2026-05-18-island-progression-engine-substrate.md` and `CLAUDE.md` no longer make present-tense claims about files that have been deleted.
- R5. Root `plans/*.md`, `plans/_archive/voice-wiki.md`, `plans/ideation/`, and `plans/CURRENT_STATE.md` are moved under `docs/plans/_archive/` preserving filenames; `git mv` is used so history is intact.
- R6. Every `src/` comment referencing the old root `plans/...` path is rewritten to point at the new `docs/plans/_archive/...` path; `grep -rn "plans/2026\|plans/_archive\|plans/sensemaking-agents" src/` returns no bare-`plans/` matches after the change.
- R7. The plan documents that the external clone at `~/Developer/student-space/` is safe to delete; no in-repo action is required.

---

## Scope Boundaries

- Not touching `src/lib/student-space/` — actively used by handlers, components, and tests.
- Not removing `three`, `@types/three`, `lil-gui`, or `stats.js` from `package.json` — all are consumed by the engine under `src/engine/student-space/`.
- Not modifying `src/engine/student-space/` internals; the engine is in scope only as a reference point for Track 2.
- Not touching `.DS_Store`, `dist/`, `.output/` or other gitignored build artefacts.
- Not consolidating, renaming, or rewriting any of the historical plan files being moved — content stays as-is, only their location changes.
- Not deleting the external clone at `~/Developer/student-space/` — that is a user-executed action outside this repo.

### Deferred to Follow-Up Work

- Writing the three institutional learnings the original port plan flagged but never produced (`engine-import-strategy`, `three-engine-react-mount`, `draco-self-host`) — track in a separate `/ce-compound` pass once this cleanup lands.
- Reconciling the `plans/CURRENT_STATE.md` PR-list (stops at PR #10) with current reality — content edit, separate from this physical move.

---

## Context & Research

### Relevant Code and Patterns

- `src/routes/index.tsx:2,9` — the only live entry point; mounts `StudentSpaceHost` which uses the engine, not the legacy world.
- `src/routes/dev.design.tsx:2310-2314, 2360-2375` — registry entries to remove (lines for `VoiceButton`, `WorldHud`, `WorldStage`; an already-stale `FloatingWorldActions` row at line ~2371 should also be trimmed while we're there).
- `vitest.config.ts:18-30` — exclude list already quarantines `test/world/**` and three of the four `test/components/World*.test.tsx` files; comment block on lines 21-25 explicitly anticipates this cleanup milestone.
- `src/engine/student-space/Game/View/SheetChrome.js`, `OverlayController.js` — active overlay primitives; they do not import from `src/components/world/` and are unaffected.
- Commit `45d2bd98 chore(design): drop refs to legacy components removed in main` — canonical pattern for Track 1's second commit (registry entry removal).
- Commit `b0fdfd66` / `c4edc3ab` style — `chore(<scope>):` prefix when purely removing dead refs; body explains *why removal is safe* before listing what is deleted.

### Institutional Learnings

- `docs/solutions/2026-05-18-island-progression-engine-substrate.md` — explicitly authorizes Track 1: "we can delete them alongside the source files in the cleanup milestone." After deletion, update the present-tense claims in its "Those files exist" section so the rule-of-thumb doc stays accurate; the rule itself is timeless and stays.
- `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md` lines 53-58 — explicit inventory of files set aside during the port. Use as the deletion manifest for Track 1. Line 56 caveat (`vipsWorldMapping.ts` retained for VIPS translation) has been resolved: `IslandProgressionOverlay.tsx`, `StudentSpaceHost.tsx`, and `src/engine/` no longer reference its exports; the bridge work landed in `src/lib/student-space/` instead. Safe to delete.
- Auto-memory `project_world_studio_branch_obsolete` — confirms the force-favor-main merge means no unique value lives under `src/components/world/` that isn't already in the engine.
- Auto-memory `project_engine_is_canonical_fork` — the engine is the source of truth; no upstream sync ceremony is required for Track 2.

---

## Key Technical Decisions

- **Two-commit shape for Track 1**, mirroring `45d2bd98`. First commit removes source files, tests, and the vitest exclude entries together (single atomic deletion). Second commit removes the now-dangling `/dev/design` registry rows. Keeps the diff reviewable and the rollback granular.
- **`git mv` for Track 3, not `mv`**. Git tracks the rename and preserves blame across the archive. Apply within the same commit as the comment rewrites so the references travel with the files.
- **`_archive` subdir layout**: flatten root `plans/_archive/voice-wiki.md` and `plans/ideation/2026-05-08-...md` into `docs/plans/_archive/` with their original filenames rather than preserving the nested `_archive/` and `ideation/` directories. Single archive layer is easier to discover; the prefixes in filenames already carry enough context.
- **External clone deletion is informational, not an Implementation Unit.** It is outside the working tree and outside git's reach; the plan only records the recommendation under Documentation / Operational Notes.

---

## Open Questions

### Resolved During Planning

- *Should the external `~/Developer/student-space/` clone be removed in this plan?* — No. User confirmed (2026-05-21) the in-repo engine is canonical and they don't need to manage the other repo anymore. Plan recommends deletion as a one-line note; no in-repo action.
- *Should the root `plans/` directory be deleted or archived?* — Archived. User chose "Move to `docs/plans/_archive/`" to preserve history; the 6 in-code comment references will be rewritten in the same commit so nothing rots.
- *Is `vipsWorldMapping.ts` still needed for VIPS state translation?* — No. Grep confirms no consumers outside `src/components/world/` and `test/world/`. Bridge work landed in `src/lib/student-space/`.

### Deferred to Implementation

- Whether to delete the already-stale `FloatingWorldActions` row at `dev.design.tsx:~2371` (file referenced by string but does not exist on disk) — trivial to confirm and trim at execution time.
- Exact final state of the `vitest.config.ts` exclude block after the deletions — the implementer should leave only `test/ablation/reports/**` and `node_modules/**` (per the repo-research finding), but final shape is best confirmed by running `pnpm test` after pruning.

---

## Implementation Units

### U1. Delete legacy world scene + tests + vitest excludes

**Goal:** Remove all dormant world-scene source files, their tests, and the vitest exclude entries that quarantine those tests, in a single atomic commit.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**

- Delete: `src/components/WorldStage.tsx`
- Delete: `src/components/WorldHud.tsx`
- Delete: `src/components/VoiceButton.tsx`
- Delete: `src/components/world/WorldScene.tsx`
- Delete: `src/components/world/assets.ts`
- Delete: `src/components/world/butterflies.ts`
- Delete: `src/components/world/createWorldScene.ts`
- Delete: `src/components/world/disposeThree.ts`
- Delete: `src/components/world/flowers.ts`
- Delete: `src/components/world/fruits.ts`
- Delete: `src/components/world/grass.ts`
- Delete: `src/components/world/hotspots.ts`
- Delete: `src/components/world/island.ts`
- Delete: `src/components/world/mailbox.ts`
- Delete: `src/components/world/moodPins.ts`
- Delete: `src/components/world/promptBird.ts`
- Delete: `src/components/world/sky.ts`
- Delete: `src/components/world/trees.ts`
- Delete: `src/components/world/vipsWorldMapping.ts`
- Delete: `src/components/world/worldStyle.ts`
- Delete: `src/components/world/sceneEffects/aurora.ts`
- Delete: `src/components/world/sceneEffects/fireflies.ts`
- Delete: `src/components/world/sceneEffects/particles.ts`
- Delete: `src/components/world/sceneEffects/rain.ts`
- Delete: `src/components/world/sceneEffects/rainbow.ts`
- Delete: `src/components/world/sceneEffects/stars.ts`
- Delete: `src/components/world/sceneEffects/weather.ts`
- Delete: `src/components/world/` (directory removed via the file deletions)
- Delete: `test/components/VoiceButton.test.tsx`
- Delete: `test/components/WorldHud.test.tsx`
- Delete: `test/components/WorldScene.test.tsx`
- Delete: `test/components/WorldStage.test.tsx`
- Delete: `test/world/createWorldScene.test.ts`
- Delete: `test/world/fruits.test.ts`
- Delete: `test/world/vipsWorldMapping.test.ts`
- Delete: `test/world/worldStyle.test.ts`
- Delete: `test/world/` (directory removed via the file deletions)
- Modify: `vitest.config.ts` — drop the world-scene exclude entries (lines 21-30 in the current file) and the leading explanatory comment block; leave the legitimate excludes (`test/ablation/reports/**`, `node_modules/**`) intact.

**Approach:**

- Delete files first, then prune `vitest.config.ts`. The order matters because the substrate doc and the vitest config currently document that the excludes will go away "alongside the source files."
- `VoiceButton.test.tsx` is the riskiest item: it is **not** currently excluded by vitest, so deleting the source file without deleting the test (or vice versa) will break CI. Delete both in the same commit.
- Note that `test/components/FloatingWorldActions.test.tsx` (currently listed in the `vitest.config.ts` exclude) is already absent from the filesystem — the exclude entry is stale and gets removed by the same prune as the world-scene entries.
- Do **not** touch `package.json` dependencies. The engine still consumes `three`, `@types/three`, `lil-gui`, and `stats.js` — confirmed by grep across `src/engine/student-space/`.
- Commit message convention: `chore(world): drop dormant world scene + shims`. Body explains *why removal is safe* (engine substrate is the active home; world layer has had no consumers since the port shipped) before listing the deletions in summary form. Co-author trailer per repo convention.

**Patterns to follow:**

- Commit `45d2bd98 chore(design): drop refs to legacy components removed in main` — body shape.
- `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md` lines 53-58 — exact file inventory (source of this Files list).

**Test scenarios:**

- Integration: `pnpm test` runs to completion with no failures and no "module not found" errors from the legacy test paths.
- Happy path: `pnpm build` (or `vite build`) completes with no resolution errors for `~/components/WorldStage`, `~/components/WorldHud`, `~/components/VoiceButton`, or anything under `~/components/world/`.
- Happy path: `pnpm exec biome check src/` reports no new errors.
- Edge case: `grep -rn "from.*components/world\|from.*'./WorldStage\|from.*'./WorldHud\|from.*'./VoiceButton\|from.*'./WorldScene" src/ test/` returns no matches after the deletion.
- Edge case: `git status` shows the `src/components/world/` and `test/world/` directories removed entirely (no `.DS_Store` or other leftovers).

**Verification:**

- All four commands above succeed.
- `vitest.config.ts` `exclude` block contains only legitimate excludes (no references to deleted files).

---

### U2. Trim `/dev/design` registry entries for removed components

**Goal:** Remove the dangling registry rows in the dev-design browser that reference the legacy world components deleted in U1.

**Requirements:** R1, R3

**Dependencies:** U1

**Files:**

- Modify: `src/routes/dev.design.tsx`
  - Remove the `VoiceButton` entry (current lines ~2309-2314).
  - Remove the `WorldHud` entry (current lines ~2360-2365).
  - Remove the `WorldStage` entry (current lines ~2366-2370).
  - Remove the already-stale `FloatingWorldActions` entry (current lines ~2371-2375) — the file it references does not exist on disk.
  - Update the surrounding sub-header at line ~1257 if it mentions `VoiceButton`: rewrite "every button-shaped affordance … and the product-specific VoiceButton" to drop the trailing clause; or drop the subtitle line entirely if the entire button category is no longer product-specific.

**Approach:**

- Pure registry edit. No imports change because the dev-design browser references these files only as string paths in a registry array — there are no `import` statements to remove.
- Commit message convention: `chore(design): drop refs to legacy world components`. Body lists the four entries removed and links back to U1's commit for context.
- Render `/dev/design` locally (Vite dev server) and confirm the page still loads and the remaining component cards display without console errors.

**Patterns to follow:**

- Commit `45d2bd98 chore(design): drop refs to legacy components removed in main` — exact precedent for this registry trim.

**Test scenarios:**

- Happy path: `pnpm dev`, navigate to `/dev/design`, confirm the page loads with no console errors and the remaining categories render.
- Edge case: search `dev.design.tsx` for any leftover string references to `WorldHud`, `WorldStage`, `VoiceButton`, `FloatingWorldActions`, or `components/world/` — none should remain.
- Edge case: `pnpm test` still passes (no test file directly imports `dev.design.tsx`, but a Tanstack route-tree regeneration could surface an issue — confirm `src/routeTree.gen.ts` is untouched).

**Verification:**

- `/dev/design` renders cleanly with no missing-file warnings in dev or build.
- `grep -n "World\|VoiceButton\|FloatingWorldActions" src/routes/dev.design.tsx` returns no matches (or only matches in unrelated identifier contexts).

---

### U3. Update docs/solutions and CLAUDE.md to match post-cleanup reality

**Goal:** Rewrite present-tense claims about deleted files so the rule-of-thumb docs stay accurate without becoming dangling references.

**Requirements:** R4

**Dependencies:** U1

**Files:**

- Modify: `docs/solutions/2026-05-18-island-progression-engine-substrate.md` — rewrite the section that lists "Those files exist" (current lines ~14-27) to past tense: the world layer existed only to host quarantined tests until the cleanup milestone (this plan); both have been removed. Keep the timeless "Rule of thumb" section (lines ~29-42) as-is.
- Modify: `CLAUDE.md` — update the existing note "`src/components/world/*` is dormant; no new code goes there" to "`src/components/world/` was deleted in the 2026-05-21 cleanup; do not re-add it." Keep the rest of the sheet-chrome contract intact.

**Approach:**

- Pure doc rewrites; no behavior change.
- Avoid expanding either doc — these are surgical edits to keep the existing guardrails accurate.
- Bundle into the U1 commit if size allows, or land as a separate `docs(cleanup): …` commit immediately after U1.

**Test scenarios:**

- Test expectation: none — pure documentation update with no behavioral or build-output impact.

**Verification:**

- `grep -n "src/components/world" CLAUDE.md docs/solutions/2026-05-18-island-progression-engine-substrate.md` returns only past-tense references.
- The CLAUDE.md sheet-chrome contract is otherwise unchanged.

---

### U4. Archive root `plans/` to `docs/plans/_archive/` + rewrite in-code comment refs

**Goal:** Move the 13 entries under root `plans/` into `docs/plans/_archive/` using `git mv` (preserves history), and rewrite the seven `src/` comments that reference the old root paths in the same commit.

**Requirements:** R5, R6

**Dependencies:** None (independent of Tracks 1/2)

**Files:**

- Move (via `git mv`): root `plans/*.md` → `docs/plans/_archive/` (8 dated plan files plus `CURRENT_STATE.md`, `sensemaking-agents.md`, `sensemaking-agents-ecg-reflection-architecture-plan.md`).
- Move (via `git mv`): `plans/_archive/voice-wiki.md` → `docs/plans/_archive/voice-wiki.md` (flatten — no nested `_archive/` under archive).
- Move (via `git mv`): `plans/ideation/2026-05-08-sensemaking-agents-tech-stack-ideation.md` → `docs/plans/_archive/2026-05-08-sensemaking-agents-tech-stack-ideation.md` (flatten).
- Remove: empty root `plans/` directory after the moves complete.
- Modify: `src/auth/middleware.ts` line 14 — rewrite `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md` → `docs/plans/_archive/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
- Modify: `src/agents/runner.ts` line 3 — same rewrite.
- Modify: `src/agents/memory/index.ts` line 3 — same rewrite.
- Modify: `src/agents/tools/schemas.ts` line 5 — rewrite `plans/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md` → `docs/plans/_archive/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md`.
- Modify: `src/db/schema.ts` line 2 — rewrite `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md` → `docs/plans/_archive/...`. Lines 531 and 574 already use `docs/plans/...` and need no change.
- Modify: `src/db/queries.ts` line 2 — rewrite same.
- Modify: `src/lib/safety.ts` line 10 — rewrite `plans/_archive/voice-wiki.md` → `docs/plans/_archive/voice-wiki.md`.
- Modify: `docs/plans/_archive/CURRENT_STATE.md` (post-move) — rewrite the bare `plans/...` paths in its body to `docs/plans/_archive/...`. This file's content lists historical plans by path and will otherwise carry dangling references.

**Approach:**

- Use `git mv` for every move so blame/history travel with the files.
- Bundle the moves and the comment rewrites into a **single commit** so the references stay valid at every revision in history. Suggested message: `refactor(plans): archive root plans/ to docs/plans/_archive/`.
- Sed pass to rewrite comments — confirm with `grep -rn "plans/2026" src/` before committing that no bare-`plans/` matches remain.
- Verify post-move directory state: `plans/` no longer exists; `docs/plans/_archive/` contains 13 entries plus `CURRENT_STATE.md`.

**Test scenarios:**

- Happy path: `pnpm test` and `pnpm build` succeed (no test or build touches these comment strings, but run as a smoke check).
- Edge case: `grep -rn "plans/2026\|plans/sensemaking-agents\|plans/_archive\|plans/ideation" src/ docs/` returns no matches except inside the archived doc bodies themselves (which is fine — they reference each other historically).
- Edge case: `git log --follow docs/plans/_archive/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md` shows the full pre-move history (validates that `git mv` preserved blame).
- Edge case: the empty root `plans/` directory does not survive the commit (`ls plans/ 2>&1` returns "No such file or directory").

**Verification:**

- All grep checks above pass.
- The repo no longer has a top-level `plans/` directory.
- `docs/plans/_archive/` contains all 13 entries plus `CURRENT_STATE.md`.

---

## System-Wide Impact

- **Interaction graph:** No runtime interaction changes. The only edges into the deleted files were the dev-design registry strings (U2) and the documentation references (U3, U4). No tests, no routes, no engine code crosses the boundary into the deleted surface.
- **Error propagation:** N/A — pure deletion, no error-handling surface changes.
- **State lifecycle risks:** None. The world scene held no persistent state and was not registered with any controller.
- **API surface parity:** No exported APIs change. The engine's public surface (`src/engine/student-space/Game/index.d.ts`) is unaffected.
- **Integration coverage:** `pnpm test` after U1 is the primary integration check — confirms no hidden cross-references survive in the test corpus.
- **Unchanged invariants:** The sheet-chrome contract, OverlayController exclusivity, IslandProgressionOverlay, StudentSpaceHost, the backend bridge in `src/lib/student-space/`, and every active route remain untouched. `package.json` dependencies remain unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `VoiceButton.test.tsx` is not in the vitest exclude list — deleting the source without the test (or vice versa) breaks CI. | U1 deletes both in the same commit; verification step runs `pnpm test` before the commit lands. |
| `vipsWorldMapping.ts` was originally retained for VIPS translation per the port plan; deleting it could break a forgotten consumer. | Repo-research grep confirms no consumers outside `src/components/world/` and `test/world/`; bridge work landed in `src/lib/student-space/`. |
| Root `plans/` move with stale in-code comments leaves dangling references that grep tooling can no longer follow. | U4 bundles `git mv` and the six comment rewrites into a single commit; grep-based verification step gates the commit. |
| `docs/solutions/2026-05-18-island-progression-engine-substrate.md` is a long-lived rule-of-thumb doc; over-aggressive edits could invalidate the timeless guidance. | U3 explicitly preserves the "Rule of thumb" section unchanged; only the time-sensitive "Those files exist" claim is rewritten to past tense. |
| `pnpm-lock.yaml` could drift if the implementer over-eagerly tries to remove `three` or `@types/three` from `package.json`. | Scope Boundaries and Key Technical Decisions explicitly exclude dependency removal; the engine still consumes those packages. |
| `routeTree.gen.ts` is generated and ignored — but a Vite dev run could regenerate it if `dev.design.tsx` edits trigger a route change. | U2 only edits the body of the existing route, not the route definition; no regeneration expected. |

---

## Documentation / Operational Notes

- **External clone deletion (informational, no in-repo action):** The repo at `/Users/rezailmi/Developer/student-space/` (remote `wondopamine/student-space.git`, branch `main`) is no longer the source of truth and no upstream sync is intended. Per user direction (2026-05-21), it can be deleted at the user's convenience: `rm -rf /Users/rezailmi/Developer/student-space/`. No git work in this repo is required.
- **Post-merge follow-up:** Run `/ce-compound` on this cleanup once it lands. Two first-time learnings worth capturing — "retiring a dormant subsystem that came in via force-favor merge" and "convention for moving plans to `_archive/`" (which becomes the precedent future archival passes can mirror).
- **Substrate doc evolution:** `docs/solutions/2026-05-18-island-progression-engine-substrate.md` becomes the canonical reference once its present-tense claims are corrected. The three flagged-but-unwritten learnings from the original port plan (`engine-import-strategy`, `three-engine-react-mount`, `draco-self-host`) remain TODO; see "Deferred to Follow-Up Work."

---

## Sources & References

- Auto-memory: `project_world_studio_branch_obsolete.md`, `project_engine_is_canonical_fork.md`.
- Original port plan: `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md` (lines 53-58 for the deletion inventory, U1 at lines 84-90 for the engine-port authorization).
- Substrate doc: `docs/solutions/2026-05-18-island-progression-engine-substrate.md`.
- Repo guardrails: `CLAUDE.md` (sheet chrome contract + dormant world directive).
- Convention reference: commit `45d2bd98 chore(design): drop refs to legacy components removed in main`.
- Active engine entry point: `src/engine/student-space/Game/index.d.ts`, `Game/Game.js`, `Game/index.js`.
- Vitest exclude block: `vitest.config.ts` lines 18-30 (with explanatory comment lines 21-25).
