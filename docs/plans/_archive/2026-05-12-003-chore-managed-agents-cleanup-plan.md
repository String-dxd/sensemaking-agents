# Managed Agents Cleanup — PR 2

**Status:** completed; PR #5 merged
**Date:** 2026-05-12
**Branch:** `chore/managed-agents-cleanup` off `main`
**Predecessor:** PR 1 (squash `943aa9f`) — managed-agents cutover, prod flipped `USE_MANAGED_AGENTS=true`
**Context:** `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md` §13 — this plan executes that step at full scope (the §13 file list under-counted).

**Current status (2026-05-13):** Complete on `origin/main` via PR #5 (`chore(agents): cleanup — remove @openai/agents runtime + flag`).

---

## 1. Goal

Remove every `@openai/agents` reference from the codebase, delete dead OpenAI-runner code paths, and retire the `USE_MANAGED_AGENTS` feature flag. The migration's two-way door closes here: rollback after merge requires `git revert`, not a config flip.

**User decision baked in:** always managed agents. No dual-runner abstraction, no fallback, no `--runner=openai`. The `openai` npm package stays *only* for `gpt-4o-mini-transcribe` in `src/server/transcribe-mirror.handler.server.ts`.

---

## 2. Scope boundaries

**In scope:**
- All `@openai/agents` imports across `src/`, `scripts/`, `test/` (14 files)
- `USE_MANAGED_AGENTS` flag + `isManagedAgentsEnabled()` helper
- v0.1 sense-making chain (`handoff-chain*.ts`) and its dependent handlers
- `MIRROR_MODEL` / `CONNECTOR_MODEL` / `CARTOGRAPHER_MODEL` / `SELF_CRITIQUE_MODEL` constants (only the OpenAI path consumed them)
- `AGENT_MODEL` env var (only those constants read it)
- `.github/workflows/lint-no-stale-flag.yml` (forcing function satisfied)
- `docs/env-setup.md` + `.env.example` rows that document removed surface

**Out of scope (deferred or non-goals):**
- Anything touching `@anthropic-ai/sdk` or the managed runner (`src/agents/runner.ts`)
- Anything touching `openai` npm package usage (transcription stays)
- Postgres, WorkOS, memory store, or agent prompts/schemas — all preserved verbatim
- The historical migration plan `plans/2026-05-12-002-...` — left as historical artifact
- `pg@9` concurrent-query deprecation + Managed Agents token undercount (tracked in `docs/followups.md`; not blockers for this PR)

---

## 3. Pre-flight surface map

Confirmed by `grep`:

| Symbol / file | Status after cleanup |
|---|---|
| `@openai/agents` (14 import sites) | Zero references in `src/`, `scripts/`, `test/` |
| `USE_MANAGED_AGENTS` / `isManagedAgentsEnabled()` | Removed |
| `src/agents/runner.ts` (managed runner) | Unchanged — imports only `@anthropic-ai/sdk` and `zod`. No agent-file dependency |
| `src/agents/{mirror,connector,cartographer}.ts` | Deleted — only used by handlers, which switch to managed runner |
| `src/agents/handoff-chain*.ts` | Deleted |
| `src/agents/tools/search-corpus.server.ts` | Kept, refactored — `src/server/search-past-mirrors.handler.server.ts` is a live route consumer |
| `src/agents/tools/{lookup-vips-taxonomy,lookup-ecg-taxonomy,self-critique}.ts` | Deleted — only consumed by deleted agent files |
| `src/server/run-sensemaking.handler.server.ts` | Deleted — `src/routes/library.index.tsx` already calls `runCartographer` (the v0.2 replacement) |
| `src/agents/config.ts` | Reduced to `ManagedAgentName`, `ManagedAgentBinding`, `getManagedAgentBinding()` |
| `scripts/ablate.ts` | Stripped of `--runner` and `--model` flags; managed-only |
| `scripts/smoke-sensemaking.ts` | Deleted — `pnpm smoke:managed-{mirror,connector,cartographer}` cover the equivalent surface |
| `.github/workflows/lint-no-stale-flag.yml` | Deleted |

---

## 4. Dependency graph

```
U1 (delete agent files + orphan tools)   ┐
U2 (refactor search-corpus tool)         ├──▶ U4 (flag + handler collapse) ──▶ U7 (drop dep + CI guard + docs)
U3 (delete handoff-chain surface)        ┤                                  ▲
U6 (delete smoke-sensemaking.ts)         ┘                                  │
                                            U5 (ablate.ts managed-only) ───┘
```

Batch 1 (parallel-safe — distinct file sets): U1, U2, U3, U6
Batch 2 (depends on U1): U4
Batch 3 (depends on U1): U5
Batch 4 (depends on all): U7

---

## 5. Implementation units

### U1. Delete agent files + orphan tool files

**Goal:** Remove the OpenAI-Agents-SDK-built agents and the three tools that exclusively serve them.

**Files (delete):**
- `src/agents/mirror.ts`
- `src/agents/connector.ts`
- `src/agents/cartographer.ts`
- `src/agents/tools/lookup-vips-taxonomy.ts`
- `src/agents/tools/lookup-ecg-taxonomy.ts`
- `src/agents/tools/self-critique.ts`
- `test/agents/mirror.test.ts`
- `test/agents/cartographer.test.ts`
- `test/tools/lookup-vips-taxonomy.test.ts`
- `test/tools/lookup-ecg-taxonomy.test.ts`
- `test/tools/self-critique.test.ts`

**Approach:** Pure deletion. Verify with `grep -rln "agents/mirror\|agents/connector\|agents/cartographer\|tools/lookup-\|tools/self-critique" src/ scripts/ test/` that the only remaining hits are the about-to-be-edited handler files (U4) and ablate/scripts (U5). The runner (`src/agents/runner.ts`) does not import any of these — its self-critique reference is a comment, not an import. Connector tests for `test/agents/connector.test.ts` do not exist; no test file to delete there.

**Patterns to follow:** None — pure deletion.

**Test scenarios:** none — deletion-only unit. Verification is via the typecheck pass in U7 catching any missed import, and the post-U4/U5 test suite confirming behavior parity.

**Verification:** Files no longer exist. Subsequent units (U4, U5) will surface compile errors if any reference was missed; that's the intended check.

---

### U2. Refactor `search-corpus` tool to drop `@openai/agents` wrapper

**Goal:** Keep the search-corpus capability available to its live consumer (`src/server/search-past-mirrors.handler.server.ts`) while removing the `tool()` wrapper that depends on `@openai/agents`.

**Files (modify):**
- `src/agents/tools/search-corpus.server.ts` — export the underlying function (no `tool()` wrapper, no `@openai/agents` import)
- `src/server/search-past-mirrors.handler.server.ts` — import the plain function instead of the tool factory
- `test/tools/search-corpus.test.ts` — assert against the plain function

**Approach:** The current file exports `searchCorpusToolFor(studentId)` which returns a `tool()` object. After this unit, it exports the underlying async query function directly (suggested name: `searchPastMirrorsFor(studentId)` to match the handler's intent). The handler currently wraps the tool's invocation; switching to direct function call simplifies its code path.

**Patterns to follow:** Adjacent server tools that do not use `@openai/agents`-style tool wrappers — e.g., the way `src/server/load-vips-pages.handler.server.ts` exposes its data-fetch primitive.

**Test scenarios:**
- Happy path: searching with a known student returns expected mirrors ordered by recency
- Edge case: empty query string returns the most-recent N regardless
- Edge case: non-existent student returns empty array (RLS-isolated, no leak)
- Integration: `search-past-mirrors.handler.server.ts` route returns same payload shape before and after the refactor

**Verification:** Direct function callable; handler tests pass; the only `@openai/agents` reference removed from `src/agents/tools/`.

---

### U3. Delete v0.1 handoff-chain + sensemaking handler surface

**Goal:** Remove the v0.1 Connector→Cartographer chain code. The library route already uses the v0.2 `runCartographer` replacement.

**Files (delete):**
- `src/agents/handoff-chain.ts`
- `src/agents/handoff-chain-streamed.ts`
- `src/server/run-sensemaking.handler.server.ts`
- `src/server/run-sensemaking.functions.ts`
- `test/agents/handoff-chain.test.ts`
- `test/agents/handoff-chain-streamed.test.ts`

**Approach:** Pure deletion. Confirmed `src/routes/library.index.tsx:35` imports `runCartographer` from `~/server/run-cartographer.functions`, not `runSensemaking` — so deleting the v0.1 path will not break the library route. Confirm with grep that nothing else in `src/routes/`, `src/server/`, or `src/components/` imports `run-sensemaking` after deletion.

**Patterns to follow:** None.

**Test scenarios:** none — deletion-only.

**Verification:** Files gone; library route renders and "Run sense-making" button still invokes `runCartographer`; no broken imports surface in `pnpm typecheck` (run in U7).

---

### U4. Remove `USE_MANAGED_AGENTS` flag + collapse handler branches to managed-only

**Goal:** Strip the feature flag and the now-dead OpenAI branches from the three handler files. Reduce `config.ts` to managed-only types and the binding accessor.

**Files (modify):**
- `src/agents/config.ts` — delete `isManagedAgentsEnabled()`, delete `MIRROR_MODEL` / `CONNECTOR_MODEL` / `CARTOGRAPHER_MODEL` / `SELF_CRITIQUE_MODEL` constants, keep `ManagedAgentName`, `ManagedAgentBinding`, `getManagedAgentBinding()`
- `src/server/run-mirror.handler.server.ts` — remove flag branch, drop `~/agents/mirror` import, retain only the `runManagedAgent('mirror', ...)` call path
- `src/server/auto-connector.handler.server.ts` — same shape; drop `~/agents/connector` and `@openai/agents` imports
- `src/server/run-cartographer.handler.server.ts` — same shape; drop `~/agents/cartographer` and `@openai/agents` imports
- `test/agents/managed-mirror.test.ts` — remove any `USE_MANAGED_AGENTS` env-mocking setup; the flag is always-on now
- `test/agents/config.test.ts` — remove tests for deleted constants and `isManagedAgentsEnabled()`; add coverage for `getManagedAgentBinding()` edge cases if missing

**Approach:** Each handler today has a `isManagedAgentsEnabled() ? managedPath() : openaiPath()` ternary or `if/else`. Delete the OpenAI side and unwrap the conditional. Verify no other code depends on the deleted exports by running `pnpm typecheck` after.

**Patterns to follow:** Existing managed-path code already lives in these handlers — preserve it verbatim, just strip the conditional shell.

**Test scenarios:**
- Happy path: each handler's managed call path returns expected output shape (existing `test/agents/managed-*.test.ts` should cover this)
- Edge case: missing `MANAGED_AGENT_*_ID` env vars produce the same clear error message as today (the `getManagedAgentBinding` throw)
- Regression: `test/agents/config.test.ts` no longer references deleted constants

**Verification:** `pnpm typecheck` passes; `pnpm test` passes; `grep -rln "isManagedAgentsEnabled\|USE_MANAGED_AGENTS\|MIRROR_MODEL\|CONNECTOR_MODEL\|CARTOGRAPHER_MODEL\|SELF_CRITIQUE_MODEL" src/ scripts/ test/` returns zero hits.

---

### U5. Strip OpenAI runner from `scripts/ablate.ts`

**Goal:** Make the ablation harness managed-only. No more `--runner=openai`.

**Files (modify):**
- `scripts/ablate.ts` — remove `--runner` and `--model` CLI flags; remove `@openai/agents` import + OpenAI-runner code paths; default to managed-only flow
- `package.json` — confirm `ablate:mirror` / `ablate:sensemake` script entries do not pass `--runner=...` (they don't today, per current package.json)

**Approach:** The current file branches on `args.runner === 'managed'`. After this unit, only the managed branch survives. The dynamic import of `~/agents/runner` becomes a static import. Remove the `--model` flag parsing and the `AGENT_MODEL` env-write side effect (managed agents pin their model on Anthropic's side via version). Update the usage string accordingly.

**Patterns to follow:** Existing managed-path code in `scripts/ablate.ts` — the file already has full managed implementation for both `mirror` and `sensemake` surfaces.

**Test scenarios:**
- Happy path: `pnpm ablate:mirror --limit=1` runs end-to-end against the multistudent fixture and produces a parseable JSON report
- Happy path: `pnpm ablate:sensemake --limit=1` runs end-to-end and produces a Connector + Cartographer report
- Edge case: passing the now-removed `--runner=openai` flag errors with a clear "unknown argument" message (or is silently ignored — pick one and document)

**Verification:** Ablation harness runs against managed path; report JSON shape unchanged from PR 1 baseline; no `@openai/agents` references in the file.

---

### U6. Delete obsolete `scripts/smoke-sensemaking.ts`

**Goal:** Remove the v0.1 OpenAI-path smoke script. The managed equivalents already ship as `pnpm smoke:managed-{mirror,connector,cartographer}`.

**Files (delete):**
- `scripts/smoke-sensemaking.ts`

**Approach:** Pure deletion. The file is documented as "v0.2 (U11) replaces the v0.1 Connector → Pathfinder smoke" — the replacement (`pnpm smoke:managed-cartographer`) already exists in `package.json` (added in commit `721c831`).

**Patterns to follow:** None.

**Test scenarios:** none — deletion-only.

**Verification:** File gone; no `package.json` script references it (none do today).

---

### U7. Drop `@openai/agents` dependency + delete CI guard + clean env docs

**Goal:** The closing unit — only safe to land after U1–U6 have removed every consumer. This is the unit that flips the project to a one-way door.

**Files (modify):**
- `package.json` — remove `"@openai/agents": "^0.11.0"` from `dependencies`
- `pnpm-lock.yaml` — regenerated by `pnpm install`
- `docs/env-setup.md` — remove the `USE_MANAGED_AGENTS` section (Section 5) and the `AGENT_MODEL` row in the "Skip these" table
- `.env.example` — remove `USE_MANAGED_AGENTS` and `AGENT_MODEL` lines if present

**Files (delete):**
- `.github/workflows/lint-no-stale-flag.yml`

**Approach:** Run `pnpm remove @openai/agents` to update both `package.json` and `pnpm-lock.yaml` deterministically. Run `pnpm install` to confirm a clean install. The CI guard is now redundant — its sole purpose was to fail the build on day 21 if the flag remained; the flag is gone.

**Patterns to follow:** None.

**Test scenarios:**
- Verification: `grep -rln "@openai/agents" src/ scripts/ test/` returns zero hits
- Verification: `grep -rln "USE_MANAGED_AGENTS\|isManagedAgentsEnabled\|AGENT_MODEL" src/ scripts/ test/ docs/ .env.example` returns zero hits (treating `.env.example` as live config; `docs/` for the env-setup doc)
- Verification: `pnpm install` completes; `pnpm typecheck` passes; `pnpm test` passes; `pnpm build` succeeds
- Smoke: `pnpm smoke:managed-mirror` produces parsed output

**Verification:** Above grep returns empty; typecheck/test/build green; smoke succeeds against a real Anthropic key.

---

## 6. Key technical decisions

1. **Delete agent files entirely vs. reduce to stubs.** Decision: delete. The managed runner (`src/agents/runner.ts`) is self-contained — it does not import from `mirror.ts`, `connector.ts`, or `cartographer.ts`. Schemas and prompts are loaded from their own files (`src/agents/schemas.ts`, `src/agents/*.prompt.md`). Keeping stub files would be dead code.

2. **Refactor `search-corpus.server.ts` rather than delete.** It has a live non-agent consumer (`src/server/search-past-mirrors.handler.server.ts`). Refactoring to expose the underlying function is a tiny change and avoids inlining a multi-line FTS query into the handler.

3. **Delete `src/server/run-sensemaking.handler.server.ts` entirely.** Its replacement (`run-cartographer.handler.server.ts`) is already in use by the library route. Confirmed: `src/routes/library.index.tsx:35` calls `runCartographer`, not `runSensemaking`.

4. **Remove `--runner` flag from `ablate.ts` rather than alias.** The user's directive is "always managed." Preserving the flag as a no-op accepts ergonomics debt for no benefit (no other code calls it; no users exist).

5. **Remove `MIRROR_MODEL` / `CONNECTOR_MODEL` / etc. constants entirely.** They only encoded the OpenAI runner's model id. Managed agents pin their model server-side via the agent version. Keeping them as dead exports is noise.

6. **Land as a single PR, not split.** The cleanup is mechanical and the units are tightly coupled (U7 fails without U1–U6 complete). One PR is reviewable and reverts cleanly if needed.

---

## 7. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missed `@openai/agents` import surfaces a broken build at U7 | Low | U1–U6 all run `pnpm typecheck` before commit; U7's verification grep is the final gate |
| Hidden runtime dependency on `MIRROR_MODEL`/etc. that grep doesn't catch (e.g., dynamic `require`, string concatenation) | Very low | Codebase doesn't use dynamic requires for these; full test suite runs at U4 and U7 |
| `search-corpus` refactor breaks the search-past-mirrors route | Low | U2's integration test scenario covers route behavior; manual smoke via library route after merge |
| Rollback needed after PR 2 merges | Low (observation window already running) | `git revert <PR-2-merge>`. Caveat: any code that drifted in `handoff-chain*.ts` against post-PR-1 `src/db/queries.ts` will need forward-fix (per plan §13). Mitigated by: PR 2 ships in the same week as PR 1, drift surface minimal |
| Ablation harness JSON shape changes accidentally | Low | U5's verification compares against PR 1 baseline reports in `test/ablation/reports/` |

---

## 8. Done criteria

- [x] All 7 implementation units shipped
- [x] `grep -rln "@openai/agents" src/ scripts/ test/` returns zero hits
- [x] `grep -rln "USE_MANAGED_AGENTS\|isManagedAgentsEnabled" src/ scripts/ test/` returns zero hits
- [x] `pnpm typecheck && pnpm test && pnpm build` all green for the merged cleanup scope
- [x] `pnpm smoke:managed-mirror` produces parsed JSON output
- [x] `pnpm ablate:mirror --limit=1` produces a parseable report against the multistudent fixture
- [x] `.github/workflows/lint-no-stale-flag.yml` deleted
- [x] PR opened and merged against `main` with a clear description and rollback caveat

---

## 9. Out of plan — defer to follow-up

Surfaced during planning, intentionally not included:

- **`pg@9` concurrent-query deprecation** — runtime warning, no behavior change. Tracked in `docs/followups.md`.
- **Managed Agents token undercount** — Anthropic SDK reports fewer tokens than actually consumed for managed runs. Tracked in `docs/followups.md`.
- **`src/agents/schemas.ts` audit** — after agent file deletion, some Zod schemas may become unused if only the OpenAI path imported them. Worth a follow-up pass; not blocking this PR (dead exports are noise, not bugs).
- **Plan `002` historical-status flip** — `plans/2026-05-12-002-...` could have its status flipped to `completed` once PR 2 merges. Trivial doc edit, not in critical path.
