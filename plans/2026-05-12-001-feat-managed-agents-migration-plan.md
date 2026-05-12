# Managed Agents Migration — Initial Plan

**Status:** draft (initial)
**Branch:** `claude/research-managed-agents-01ffz`
**Date:** 2026-05-12
**Author:** initial draft by Claude; to be deepened via `/ideate` iterations

---

## 1. Goals

1. Migrate the agent loop from OpenAI Agents SDK (`gpt-5.5`) to **Claude Managed Agents** (beta header `managed-agents-2026-04-01`).
2. Migrate persistence from **SQLite (`better-sqlite3` + `app.db`)** to **PGlite** (`@electric-sql/pglite`) so the same Postgres dialect works in local dev, in tests, and (with a hosted Postgres adapter) on Vercel.
3. Split memory into two tiers:
   - **Structured memory** → SQL (Postgres / PGlite) — facts, audit, state machines.
   - **Unstructured memory** → Managed Agents **Memory Stores** (`/mnt/memory/*.md`) — qualitative, agent-authored notes.
4. Migrate **all four agents** (Mirror, Connector, Cartographer, self-critique sub-agent) plus the deterministic Verifier.
5. Preserve the existing ablation harness (`scripts/ablate.ts`) so we can A/B old vs new at each step.

## 2. Non-goals (explicit)

- **Not** changing the agent semantics (Mirror still produces validation/inferred_meaning/story_reframe; Connector still produces VIPS diffs; Cartographer still produces lead-sheets).
- **Not** removing the deterministic Verifier — it stays in-process.
- **Not** replacing structured SQL state with memory stores. Memory is *additive*.
- **Not** rewriting tenancy semantics — `withStudent()` stays, just operates over Postgres instead of SQLite.

## 3. Target architecture

```
Browser ──► TanStack server fn ──► [Runner abstraction]
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                          (local dev)              (Vercel prod)
                       Claude Agent SDK         Managed Agents API
                       in-process loop         client.beta.sessions
                              │                       │
                              └───────────┬───────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                       PGlite       Memory stores      Tools
                  (Postgres dialect) (/mnt/memory)   (TS, shared)
                          │               │
                  ┌───────┴───────┐   ┌───┴────────────────────────┐
                  │ structured    │   │ unstructured per-student   │
                  │ - mirror_*    │   │ - student-voice.md         │
                  │ - vips_*      │   │ - rejected-diff-patterns.md│
                  │ - cartographer│   │ - exploratory-threads.md   │
                  │ - agent_traces│   │ - counselor-notes.md       │
                  │ - mem_snapshot│   │ - pedagogical-state.md     │
                  └───────────────┘   └────────────────────────────┘
```

### Runner abstraction (key)

Introduce a thin runner interface so the same agent definitions work locally and in cloud:

```ts
// src/agents/runner/types.ts
interface AgentRunner {
  run<T>(opts: {
    agentId: string;          // canonical agent identity (Mirror, Connector, …)
    studentId: string;        // tenancy
    input: AgentInput;        // structured context (corpus, VIPS, etc.)
    schema: ZodSchema<T>;     // output validation
    memoryStore?: string;     // managed-agents memory store id (cloud) / dir (local)
  }): AsyncIterable<RunEvent>;
}
```

- `LocalRunner` → Claude Agent SDK in-process, memory at `./.memory/{studentId}/*.md`.
- `ManagedRunner` → `client.beta.sessions` + SSE stream; memory store bound at session create.

Prompt files, tool definitions, and output schemas are **pure data** shared by both runners.

## 4. Model selection

| Agent | Model | Rationale |
|---|---|---|
| **Mirror** | `claude-sonnet-4-6` | One-shot reframe of a transcript; needs nuance + voice, not deep reasoning. Sonnet is the right cost/quality point. |
| **Connector** | `claude-haiku-4-5` | Pattern-matching across a corpus into structured diffs. High volume (auto-runs after every Mirror), latency-sensitive (30s budget). Haiku first; promote to Sonnet only if Verifier rejection rate is too high. |
| **Cartographer** (sensemaking) | `claude-sonnet-4-6` | Long-running synthesis producing 2–5 pathways with trait combinations + ECG region tags. Quality matters; latency tolerated. |
| **`self_critique` sub-agent** | `claude-haiku-4-5` | Single-pass critique; doesn't need the big model. |
| **Orchestrator** (future) | `claude-opus-4-7` | When introduced, a lead agent that coordinates Mirror → Connector → Cartographer and reasons about *when* to invoke each. Reserved for Opus because the orchestration decisions are the highest-leverage. |
| **Verifier** | n/a — deterministic, no LLM | Stays as-is. |

### Open question on Connector
Haiku is the bet. We **must** keep the ablation harness running on Connector during migration to catch quality regressions. If Verifier rejection rate climbs >15% vs gpt-5.5 baseline, promote Connector to Sonnet.

## 5. Memory architecture

### Structured (SQL, source of truth)

Keep all existing tables, ported to Postgres:

- `mirror_entries` — transcripts + three-part reflection
- `vips_timeline_entries` — verbatim quotes, dimension, strength, parallax_tag
- `vips_pages` — compiled-truth per dimension
- `vips_proposed_diffs` — pending/confirmed/forgotten state machine (R30 partial unique index)
- `connector_outputs`, `cartographer_outputs` — agent outputs
- `agent_traces` — audit log (forever retention)
- `vips_forget_count` — soft-forget tracking

New tables for the Managed Agents layer:

- `agent_sessions` — `(student_id, agent_id, session_id, environment_id, status, started_at, ended_at)`. Bind sessions to students for tenancy + audit.
- `memory_snapshots` — `(student_id, file_path, version, content, captured_at)`. Periodic snapshots of memory store files so we survive the 30-day cloud retention window.

### Unstructured (memory stores, advisory layer)

One memory store per student, mapped from `student_id`. Files:

| File | Read | Write | Purpose |
|---|---|---|---|
| `student-voice.md` | all | Mirror | Qualitative observations on student tone/hedging/voice |
| `rejected-diff-patterns.md` | Connector, Cartographer | Connector | Patterns learned from rejected diffs |
| `exploratory-threads.md` | Cartographer | Cartographer | Pathways floated but dismissed |
| `counselor-notes.md` | all | app (via Memory API) | Why a human edited/rejected agent output |
| `pedagogical-state.md` | all | Cartographer | Where this student is in their sensemaking journey |

**Write discipline:** each agent prompt ends with *"If you learned something that would change future reasoning, append ≤2 sentences to the relevant file. Otherwise do nothing."* — avoids memory bloat.

**Compaction:** every 20 writes, an agent step summarizes the file in place. Enforced by app-side periodic check, not by the agent.

**Tenancy:** `memory_store_id` is bound to `student_id` at session creation. Wrap creation in `withStudent()`. Never let a session attach the wrong student's memory.

**Safety:** extend `src/lib/safety.ts` to scan memory writes (PII / diagnostic language) before they hit the store, same way it currently scans Mirror outputs.

## 6. Database migration (SQLite → PGlite)

### Why PGlite

- Same Postgres dialect everywhere: local dev, CI, prod (with hosted Postgres adapter).
- In-process: no separate service to run for `pnpm dev` or tests.
- Drop-in replacement for `better-sqlite3` mental model (single-file persistence) but with real Postgres semantics (FTS, JSONB, partial indexes, CTEs).

### Migration steps

1. Add `@electric-sql/pglite` to dependencies; remove `better-sqlite3`.
2. Port `src/db/schema.sql`:
   - SQLite `INTEGER PRIMARY KEY` → `BIGSERIAL` or `UUID`.
   - SQLite FTS5 → Postgres `tsvector` columns + GIN indexes (or `pg_trgm` if we want fuzzier match). Specifically:
     - `mirror_entries.story_reframe` → `story_reframe_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', story_reframe)) STORED` + GIN index.
     - `vips_timeline_entries.verbatim_quote` → same pattern.
   - SQLite partial unique index on `vips_proposed_diffs` (R30) → Postgres partial unique index (syntax identical).
3. Port `src/db/queries.ts` — most queries are SQL-portable. Replace `better-sqlite3` prepared statements with PGlite's query API.
4. Adapt `withStudent()` — should be a near-no-op since it's SQL-agnostic.
5. Update `src/agents/tools/search-corpus.server.ts` — FTS5 → `tsvector @@ plainto_tsquery(...)`.
6. Add a migration script in `scripts/` to dump existing SQLite data and load it into PGlite (for any existing dev data; v0.1 is single-tenant so this is small).

### Prod consideration (Vercel)

PGlite in-process **does not solve persistence on Vercel serverless** (ephemeral filesystem). Plan for prod:

- **Option A (recommended first):** PGlite local + hosted Postgres on Vercel (Neon, Supabase, or Vercel Postgres). Same SQL dialect; the connection layer is the only diff. Wrap in a `db.ts` that picks driver by env.
- **Option B (later):** ElectricSQL sync — PGlite client + Postgres source with bidirectional sync. Powerful but adds infra. Defer until there's a real need (offline/edge use cases).

**Decision for v1:** Option A. Local = PGlite file; prod = hosted Postgres. Same schema, same queries.

## 7. Agent-by-agent migration

### Mirror (first; pilot agent)

- Model: `claude-sonnet-4-6`.
- Tools: `search_past_mirrors` (FTS over `mirror_entries`).
- Memory: read `student-voice.md`; write at end if novel.
- Output schema: unchanged — `{validation, inferred_meaning, story_reframe}`.
- Safety: existing diagnostic-language filter (`src/lib/safety.ts`) applied at persist time.
- **Gate:** run new Mirror through ablation harness vs current OpenAI Mirror on the existing fixtures. Quality must not regress (subjective + verifier checks). Cost: a one-day spike.

### Connector

- Model: `claude-haiku-4-5` (with Sonnet escape hatch).
- Tools: `search_past_mirrors`, `lookup_ecg_taxonomy`, `lookup_vips_taxonomy`, `self_critique`.
- Memory: read `rejected-diff-patterns.md` + `student-voice.md`; write rejection patterns.
- Output: `ConnectorDiffSchema` (unchanged).
- Streaming: only post-hoc Verifier needs full output; can run non-streaming for simpler control flow.
- **Gate:** Verifier rejection rate ≤ current baseline + 15%.

### Cartographer (sensemaking)

- Model: `claude-sonnet-4-6`.
- Tools: same as Connector.
- Memory: read `pedagogical-state.md` + `exploratory-threads.md` + `counselor-notes.md`; write to all three as appropriate.
- Output: lead-sheet `{trajectory_paragraph, pathways, open_questions, disclaimer}`.
- Streaming: yes — UI shows live run events. This is where Managed Agents helps most on Vercel (offload long-running loop, function just pipes SSE).
- **Gate:** counselor review of 10 outputs side-by-side vs current Cartographer. Qualitative judgment.

### `self_critique` sub-agent

- Model: `claude-haiku-4-5`.
- Tools: none.
- Memory: none.
- Pattern: invoked as a tool call from Connector/Cartographer. In Managed Agents, this is either (a) a separate session created on-demand, or (b) a custom tool that wraps a Messages API call. Lean toward (b) — simpler, cheaper, no session overhead.

### Verifier

- No change. Stays deterministic, in-process, post-hoc.

### Orchestrator (future, not in v1)

- Model: `claude-opus-4-7`.
- Role: coordinate Mirror → Connector → Cartographer for end-to-end sensemaking flows.
- Decision: don't build until we have a concrete need (e.g., bulk re-processing, counselor "rerun all" button). Today's UI triggers each agent explicitly; no orchestrator needed.

## 8. Tool migration

All tools become TypeScript modules conforming to the Managed Agents custom-tool schema (`agent_toolset_20260401`-compatible).

| Tool | Notes |
|---|---|
| `search_past_mirrors` | FTS port (SQLite FTS5 → Postgres tsvector). Otherwise unchanged. |
| `lookup_ecg_taxonomy` | Pure fixture read from `src/data/ecg-taxonomy.ts`. Trivial port. |
| `lookup_vips_taxonomy` | Same — fixture read. Trivial. |
| `self_critique` | Becomes a tool that calls Messages API directly (Haiku) and returns critique JSON. |
| (new) `read_student_memory` | Convenience wrapper over `/mnt/memory/*.md` reads if we want stricter access control than raw file tools. **Optional** — built-in file tools may suffice. |
| (new) `append_student_memory` | Same — convenience wrapper. **Optional**. |

## 9. Phased rollout

| Phase | Scope | Branch | Exit criteria |
|---|---|---|---|
| **P0** | This plan + `/ideate` deepening | `claude/research-managed-agents-01ffz` | Plan approved |
| **P1** | PGlite migration (no agent changes) | new branch off `main` | All tests green; ablation harness still passes; dev server runs against PGlite |
| **P2** | Runner abstraction + Mirror pilot on Managed Agents | continuation of `claude/research-managed-agents-01ffz` | Mirror ablation results ≥ current; cost data captured |
| **P3** | Connector migration | new branch | Verifier rejection rate within +15% of baseline |
| **P4** | Cartographer migration | new branch | Counselor side-by-side review passes |
| **P5** | Memory stores wired up (start with `student-voice.md` for Mirror) | new branch | One full student journey runs end-to-end with memory contributing to outputs |
| **P6** | Hosted Postgres adapter + Vercel deploy | new branch | Staging deploy works; sessions stream end-to-end |
| **P7** | Cutover: turn off OpenAI Agents path | new branch | Feature flag flip; OpenAI deps removed |

Each phase ships independently. We can pause after any of them.

## 10. Cost model

Token costs (per Anthropic pricing, May 2026):
- Opus 4.7: $5 in / $25 out per Mtok
- Sonnet 4.6: $3 in / $15 out per Mtok
- Haiku 4.5: $1 in / $5 out per Mtok

Session runtime: **$0.08 per session-hour, idle excluded.**

Rough per-student-day estimate (assuming 1 Mirror + 1 Connector + 0.3 Cartographer per active day):
- Mirror (Sonnet): ~5k in / 1k out → ~$0.03
- Connector (Haiku): ~15k in / 3k out → ~$0.03
- Cartographer (Sonnet): ~20k in / 5k out → ~$0.14 × 0.3 = $0.04
- Session runtime: ~0.05 session-hours active → ~$0.004
- **Total: ~$0.10 per active student-day** (model-token-dominated).

With prompt caching on the formatted corpus + taxonomy lookups (90% read discount), expect ~40–60% reduction once cache hits stabilize.

## 11. Risks & open questions

1. **Model quality risk** — biggest unknown. Mirror's voice work is the highest qualitative risk; Cartographer's pathway diversity is the second. The ablation harness exists for exactly this; use it before each phase ships.
2. **PGlite ↔ hosted-Postgres parity** — most queries are portable, but watch for any PGlite-only behavior (some extensions are missing). Lock the schema to `tsvector` (universal) not specific extensions.
3. **Memory store concurrency** — if Connector and Mirror both write to the same store concurrently (rare but possible), versioning helps but conflicts are not auto-resolved. Need a simple lock or last-write-wins policy. Open.
4. **Session lifecycle on Vercel** — when a user closes their browser mid-Cartographer, do we archive the session or let it run to completion? Default: let it run, persist output on completion, expire stale ones nightly. Open.
5. **`self_critique` as tool vs sub-session** — leaning tool-via-Messages-API. Confirm during P3.
6. **Beta-header lock-in** — `managed-agents-2026-04-01` is beta. Acceptable for now (Anthropic supports it through GA), but our exit path is the runner abstraction + memory snapshots.
7. **Orchestrator scope** — deferred. When we build it, do we use Managed Agents' multi-agent delegation feature or a lead-agent pattern we control? Open until P5+.

## 12. Out of scope for v1

- Multi-agent orchestration / lead-agent pattern (Opus). Deferred.
- ElectricSQL sync (PGlite ↔ remote Postgres bidirectional). Deferred.
- Replacing `agent_traces` with Managed Agents' built-in event log. Keep both for now; reconcile later.
- Migrating Whisper transcription. Stays on OpenAI for now (separate decision).

---

## Appendix A — Files touched (anticipated)

```
plans/2026-05-12-001-feat-managed-agents-migration-plan.md   (this file)
src/agents/runner/types.ts                                   (new)
src/agents/runner/local.ts                                   (new — Claude Agent SDK)
src/agents/runner/managed.ts                                 (new — Managed Agents)
src/agents/mirror.ts                                         (rewrite)
src/agents/connector.ts                                      (rewrite)
src/agents/cartographer.ts                                   (rewrite)
src/agents/verifier.ts                                       (unchanged)
src/agents/config.ts                                         (model IDs, runner selection)
src/agents/tools/*.ts                                        (port to Managed Agents tool schema)
src/agents/memory/                                           (new — memory store wrappers)
src/db/schema.sql                                            (port to Postgres dialect)
src/db/queries.ts                                            (PGlite driver)
src/db/client.ts                                             (new — driver selection by env)
src/lib/safety.ts                                            (extend to memory writes)
src/server/transcribe-mirror.handler.server.ts               (no LLM change; DB writes updated)
src/server/auto-connector.handler.server.ts                  (runner.run())
src/server/run-cartographer.handler.server.ts                (runner.run() + SSE pipe)
scripts/ablate.ts                                            (extend to compare runners)
scripts/migrate-sqlite-to-pglite.ts                          (new — one-shot)
package.json                                                 (deps: @electric-sql/pglite, @anthropic-ai/sdk; remove openai, @openai/agents, better-sqlite3)
.env.example                                                 (ANTHROPIC_API_KEY, MANAGED_AGENTS_BETA)
```

## Appendix B — Decisions log (to be expanded)

- **2026-05-12** — Initial plan drafted. Default models: Sonnet (Mirror, Cartographer), Haiku (Connector, self_critique), Opus (future orchestrator). PGlite for local; hosted Postgres for prod. Memory stores additive to SQL, not replacement.
