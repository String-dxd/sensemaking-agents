# Managed Agents Full Migration — single-cutover plan

**Status:** reviewed; P0 + P3 + P1 fixes applied 2026-05-12; ready for ce-work
**Replaces:** `plans/2026-05-12-001-feat-managed-agents-migration-plan.md` (phased v1)
**Date:** 2026-05-12
**Source:** `docs/ideation/2026-05-12-managed-agents-migration-ideation.md`

---

## 1. Framing

This is **one migration project**, not seven phases. The deliverable is a single feature branch that lands as two PRs:

- **PR 1 — cutover** flips `USE_MANAGED_AGENTS=true`. All four agents now run on Claude Managed Agents (beta `managed-agents-2026-04-01`). Postgres (Neon) replaces `better-sqlite3`. Real auth (WorkOS + Google) is live. Feature flag stays in place.
- **PR 2 — cleanup** (7-14 days after PR 1, after prod observation) removes `@openai/agents`, deletes `handoff-chain*.ts`, removes the feature flag.

Cutover (PR 1) is gated by **dev self-review of ablation harness JSON + fixture outputs**. There is no counselor side-by-side review and no student-facing export feature for the cutover gate. Until PR 1 lands, `main` continues to run the existing OpenAI path unchanged.

**Atomic merge units within PR 1:** Steps 2-3-4 (Neon adapter → reseed → auth + remove `'demo'` literal) **must land as one merge** — the interim state has every route querying a non-existent student.

## 2. Non-goals

- **No dual-runner abstraction.** No `LocalRunner | ManagedRunner` interface. Managed-only. The existing `@openai/agents` code is deleted in PR 2.
- **No PGlite intermediate.** Dev points at a Neon dev branch (or a shared `dev` branch with copy-on-write per developer). Same Postgres dialect everywhere from commit 1.
- **No MCP server in v0.2.** Custom tools are dropped or inlined; the agent reads pre-fetched context from the prompt. Revisit if ablation shows quality regression that needs live tool use.
- **No semantic agent changes.** Mirror still produces `{validation, inferred_meaning, story_reframe}`; Connector still produces VIPS diffs; Cartographer still produces lead-sheets. Prompts, Zod schemas, and the deterministic Verifier are unchanged.
- **No Multiagent / Outcomes primitives.** Both are research preview as of May 2026. Use stable beta only.
- **No CRDT memory layer.** First version writes flat `.md` files with app-side Postgres advisory locks per `(studentId, file)`. CRDT op-log is a follow-up if concurrency conflicts surface.
- **No counselor-facing review UI built for cutover.** Existing `src/routes/reflect.review.tsx` diff surface remains; no new review tooling added.
- **No data migration script.** Drop dev `app.db`; reseed from the multistudent fixture against Neon.

## 3. Target architecture

```
Browser
   │  (Google OAuth via WorkOS AuthKit; encrypted session cookie)
   ▼
Vercel function (Node runtime, Fluid Compute, maxDuration=800 on Cartographer route)
   │  WorkOS authkitMiddleware → resolves counselor identity
   │    → resolves activeStudentId from session.activeStudentId (NOT from request body)
   │    → verifies counselor has access via counselor_students table
   │    → withStudent(studentId, fn):
   │      → BEGIN
   │      → SET LOCAL app.student_id = $1   (FIRST statement in transaction)
   │      → ── DB queries (RLS enforced) ──
   │      → ── pg.Pool via Neon pooled URL (prepare: false for PgBouncer transaction mode) ──
   │      → COMMIT
   │
   │  Server fn pre-fetches relevant context:
   │    - new Mirror reflection
   │    - recent FTS-relevant past mirrors (top-N by tsvector match)
   │    - current VIPS pages + non-forgotten timeline entries
   │    - inlined VIPS + ECG taxonomies (from src/data/*-taxonomy.ts)
   │
   ▼  packs context into prompt
Managed Agents session (Anthropic cloud)
   │  agent + environment pinned by version
   │  self_critique invoked as Messages API tool (Haiku, no MCP)
   │
   ▼  one-shot or streaming response
Vercel function
   │  Verifier (in-process, deterministic) post-processes
   │  Persists to Neon (cartographer_outputs, vips_proposed_diffs, etc.)
   │  Snapshots memory store writes to memory_snapshots
   ▼
Client (Cartographer: SSE + hand-rolled EventSource wrapper with Last-Event-ID)

Background: Nightly Vercel cron at /api/cron/sweep-agent-sessions (CRON_SECRET-gated)
  - Queries Anthropic for each `running` session
  - On status=idle: writes ended_at, persists final output (parsed against output schema)
                   to cartographer_outputs / connector_outputs if not already present
  - Marks abandoned sessions (>24h) as archived
```

Three resources live in Anthropic:
- **4 agents** — `mirror`, `connector`, `cartographer`, `self_critique` (the last is invoked as a Messages API tool, not as a Managed Agent — see §7.2). Each pinned by version in `.env`.
- **1 environment** — `sensemaking-prod`, cloud networking. Shared by all four agents.
- **Per-student memory stores** — bound at session creation via `withStudent`.

## 4. Model selection

| Agent | Model | Notes |
|---|---|---|
| Mirror | `claude-sonnet-4-6` | One-shot reframe; voice matters more than reasoning depth |
| Connector | `claude-haiku-4-5` | Pattern-matching across pre-fetched corpus. Promote to Sonnet only if Verifier rejection rate climbs >15% over OpenAI baseline |
| Cartographer | `claude-sonnet-4-6` | Long-running synthesis; streaming pipe |
| self_critique | `claude-haiku-4-5` | Messages API tool, not a separate Managed Agent (saves session overhead + sidesteps egress-MITM bug) |
| Verifier | none | Deterministic, in-process, post-hoc |

## 5. Persistence

### 5.1 Database — Neon Postgres + `pg` + Drizzle Kit

**Driver:**
- `pg` (node-postgres) with `attachDatabasePool` for Vercel Fluid Compute idle observation.
- Neon **pooled URL** (PgBouncer transaction mode) for app runtime.
- `pg.Pool` config: `{ max: 5, prepare: false }` — `prepare: false` is required because PgBouncer transaction mode does not preserve named prepared statements across pooled connections. `max: 5` accommodates concurrent Cartographer SSE streams holding pool connections for up to 800s.
- Direct (non-pooled) URL only for migration CLI.

**ORM + Migrations:**
- Drizzle Kit. Schema as TypeScript source of truth (`src/db/schema.ts`).
- `drizzle-kit generate` emits forward-only SQL files committed to `src/db/migrations/`.
- `drizzle-kit migrate` applies via `__drizzle_migrations` tracking table.
- `drizzle-kit push` banned in production.
- **`src/db/schema.sql` is deleted in Step 2.** Drizzle TS is the only schema source-of-truth.

**Dev/preview branches:** Each developer gets a copy-on-write Neon branch off `main`. Vercel-Neon GitHub Action creates branches per PR + cleans up on close. Migrations run against preview branches in CI before deploy.

**Schema port:**
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL`
- SQLite FTS5 contentless tables → `tsvector` generated columns (`story_reframe_tsv`, `verbatim_quote_tsv`) + GIN indexes
- `vips_proposed_diffs` partial unique index (R30) → Postgres partial unique index
- All `WHERE student_id = ?` predicates → RLS policies (see §6.2)

**New tables:**
- `counselor_students(counselor_id, student_id, attached_at, PRIMARY KEY(counselor_id, student_id))` — many-to-many counselor↔student mapping. The authoritative source for "does this counselor have access to this student" before setting the RLS GUC.
- `agent_sessions(student_id, counselor_id, agent_id, agent_version, env_version, anthropic_session_id, status, started_at, ended_at)` — every session records the agent version it started against + the counselor who triggered it (PDPA audit).
- `memory_snapshots(student_id, file_path, version, content, captured_at)` — periodic snapshot of `/mnt/memory/*.md` (insurance against 30-day Anthropic retention).

**Data migration:** None. Drop the dev `app.db`; rerun `pnpm seed` against Neon after migrations. FTS5 → tsvector translation is handled inside the seed (the tsvector generated column populates on insert; no separate translation script needed).

### 5.2 Memory stores

- One memory store per student, bound at session creation via `withStudent`.
- **Initial files:** `student-voice.md`, `rejected-diff-patterns.md`, `exploratory-threads.md`, `counselor-notes.md`, `pedagogical-state.md`. Read/write split per `docs/ideation/2026-05-12-managed-agents-migration-ideation.md`.
- **Concurrency v1:** Postgres advisory lock per `(studentId, file)`. `appendStudentMemory(studentId, file, op)` opens its OWN transaction (not the caller's — avoids holding the lock for the 60-800s `withStudent` envelope), runs `SELECT pg_advisory_xact_lock(hashtextextended(studentId || file, 0))`, re-establishes RLS via `SET LOCAL app.student_id = $1`, reads current content, appends, writes, commits (releases lock). Snapshot to `memory_snapshots` every 20 writes.
- **Safety extension:** `src/lib/safety.ts` gains `checkMemoryWriteForDiagnosticLanguage()` applied before every memory append.

## 6. Tenancy + auth

### 6.1 Auth — WorkOS AuthKit, Google sign-in

- **SDK:** `@workos/authkit-tanstack-react-start` (v0.8.2 or later, May 2026). First-party TanStack Start integration.
- **Sign-in surface:** Google as the only social provider for v0.2. Single "Sign in with Google" button, configured in AuthKit dashboard.
- **Session shape:** Encrypted `wos-session` cookie (sealed JWT), `HttpOnly`, `SameSite=Lax`. Decoded server-side in loaders via `getAuth()` — no network call per request after sign-in.
- **`activeStudentId` storage:** On the server-side session (NOT in a client-readable cookie). When a counselor switches students via the picker, the server updates `session.activeStudentId` via a signed server-fn call. The client never controls this value.
- **Demo seeding:** Server-side bootstrap: when a Google-authenticated counselor first signs in, attach them to the 4 demo students (`demo-a`, `demo-b`, `demo-c`, `demo-d`) by inserting rows into `counselor_students`. Idempotent on subsequent sign-ins (skip if already attached).
- **Open-signup acceptance (demo only):** For v0.2 demo, any Google-authenticated user becomes a counselor with access to the 4 demo students. The demo data is synthetic (multistudent fixture). For production, this must be replaced with: (a) WorkOS organization invitation flow, (b) `hd` claim validation against an allowed Google Workspace domain, or (c) a server-side email allowlist. Documented as known scope; see §16 Deferred review findings #P1.
- **Six route files migrate off hardcoded `'demo'`:** `src/routes/__root.tsx` (AuthKit middleware registration), `src/routes/library.$dimension.tsx`, `library.trajectory.tsx`, `library.index.tsx`, `library.$entryId.tsx`, `reflect.review.tsx`, `reflect.index.tsx`. Each resolves `studentId` from `getAuth().session.activeStudentId`.

### 6.2 `withStudent` identity envelope + Postgres RLS

```ts
withStudent(studentId, async (ctx) => {
  // ctx.db — Drizzle client bound to a transaction with SET LOCAL app.student_id = $1
  // ctx.session — Managed Agents session, memory_store_id bound to studentId
  // ctx.counselor — WorkOS user (counselor identity) for audit
})
```

**Source of `studentId`:** Server-resolved from `getAuth().session.activeStudentId` ONLY. The legacy pattern where `studentId` came from the client request body (`runMirrorInputSchema`, `runCartographerInputSchema`, etc.) is removed in Step 4 — all `studentId: z.string()` fields are stripped from request schemas. The handler reads from session, validates counselor↔student access, then calls `withStudent`.

**Authorization check before RLS:** Before opening the transaction + setting the GUC, the server fn verifies access:
```sql
SELECT 1 FROM counselor_students WHERE counselor_id = $1 AND student_id = $2
```
If no row, return 403. RLS enforces row isolation per student, but NOT per counselor — the `counselor_students` check is what prevents Counselor A from passing Counselor B's studentId.

**Transaction-wrapped pattern:**
1. `BEGIN` the Drizzle transaction.
2. **First statement** (before any other query): `SET LOCAL app.student_id = $1`. Critical — any earlier query runs without the GUC, returns zero rows under RLS, app sees ghost-empty results.
3. Execute `fn` (which uses `ctx.db`).
4. `COMMIT` (releases the transaction-scoped GUC).

Required because Neon's pooled URL uses PgBouncer transaction mode (session-scope GUCs reset between transactions, but `SET LOCAL` correctly scopes to the active transaction).

**RLS policies:** Every table with `student_id` has `USING (student_id = current_setting('app.student_id'))`. Query without the GUC set returns zero rows — sane failure mode.

**Capacity reservation:** Deferred. Anthropic concurrency limits are not hit at counselor-demo scale; revisit when traffic warrants.

## 7. Tool surface

### 7.1 No MCP server — pre-fetch context + inline taxonomies

Custom tools (`search_past_mirrors`, `lookup_vips_taxonomy`, `lookup_ecg_taxonomy`) are not exposed to the agent. Instead:

- **Inlined taxonomies:** `src/data/vips-taxonomy.ts` (~16 closed claim IDs) and `src/data/ecg-taxonomy.ts` (~20 cluster IDs) are formatted into the system prompt prefix of Connector and Cartographer. Closed vocabularies; cache-friendly.
- **Pre-fetched corpus (Connector):** Server fn runs the existing FTS query in `src/agents/tools/search-corpus.server.ts` (ported to tsvector) with the new reflection's content as the query. Top 5 FTS matches are packed into prompt context under a "Recent reflections" heading.
- **Pre-fetched corpus (Cartographer):** Same FTS infrastructure, expanded query set — runs FTS against the new reflection's content AND each of the four VIPS pages' `open_question` text. Results are deduped and packed under "Recent reflections". This is Cartographer's compensation for losing dynamic agent-side search; long-horizon synthesis needs broader recall than Connector's per-reflection diff.
- **Pre-fetched VIPS state:** Connector and Cartographer receive the current `vips_pages` + non-forgotten `vips_timeline_entries` in the prompt — same as the existing handler does today.

This pattern is **prompt-as-context, not agent-as-runtime.** The agent doesn't decide what to look up; the server pre-decides. The agent produces the structured diff/output.

Eliminated surfaces vs original plan: `/api/mcp` route, `mcp-tanstack-start` dependency, bearer-token mechanics, Streamable HTTP wiring, capability descriptors, egress-MITM concerns.

### 7.2 `self_critique` as a Messages API tool

- Not a Managed Agent. A custom tool the Connector/Cartographer agents call mid-loop via Anthropic's Messages API (Haiku, no further tool use). Returns critique JSON.
- Lives in `src/agents/tools/self-critique.ts`. Rewritten to use the `@anthropic-ai/sdk` Messages API directly. No module-load agent construction (current bug fixed).
- Sidesteps the egress-MITM bug — Messages API goes through Anthropic's own API surface, not via the agent container egress.

## 8. Runtime + session lifecycle

### 8.1 Provisioning — `scripts/managed-agents/provision.ts`

- Run locally / in CI, idempotent. Creates the four agents + one environment via `client.beta.agents.create` and `environments.create`.
- Writes `MANAGED_AGENT_*_ID` and `MANAGED_AGENT_*_VERSION` to `.env.local` (and to Vercel env vars in deployed environments).
- **Version pinning:** sessions reference `${AGENT_ID}:${VERSION}` — prod doesn't drift when someone re-provisions.
- **Re-provisioning workflow:** bump prompts in `src/agents/*.prompt.md`, re-run `provision.ts`, commit the new `.env` entries with the prompt diff in the same PR.

### 8.2 Session creation + lifecycle + nightly sweep cron

- One session per logical workflow (Mirror call, Connector call, Cartographer call). Sessions are scoped to one workflow and allowed to idle freely while awaiting tool results.
- **Row lifecycle:**
  - On session create: server fn `INSERT INTO agent_sessions (..., status='running', counselor_id=<wos-user-id>, started_at=NOW())` immediately after `client.beta.sessions.create`.
  - Server fn does **not** try to write `ended_at` (it may have disconnected before `session.status_idle` fires).

**Nightly sweep cron — `/api/cron/sweep-agent-sessions`:**
- **Auth:** the route handler verifies `request.headers.get('authorization') === 'Bearer ' + process.env.CRON_SECRET` BEFORE any logic. Vercel Cron injects this header automatically per its docs. Without the check, the route is publicly reachable.
- **Status sweep:** for each `agent_sessions` row with `status='running'`, query Anthropic for the session's current status (`client.beta.sessions.get(anthropic_session_id)`). On `status=idle`, write `ended_at` + final status.
- **Output persistence:** on `status=idle`, ALSO check whether the corresponding output row exists (`cartographer_outputs` for Cartographer sessions; `connector_outputs` for Connector). If not present: fetch the final assistant message via Anthropic's session API, parse against the output schema, run the deterministic Verifier, persist to the right table. This is how Cartographer outputs survive client disconnect AND server function timeout (800s overruns).
- **Abandoned sessions:** mark rows with `status='running'` older than 24h as `archived` (the underlying Anthropic session has expired or been abandoned).
- `maxDuration` 300s should accommodate iteration over all idled sessions for the demo. Revisit at scale.

### 8.3 Streaming + abandonment (Cartographer)

- Cartographer streams via SSE through the Vercel function. Route config: `export const maxDuration = 800` (Pro Fluid Compute).
- **Client-side reconnect:** A small hand-rolled EventSource wrapper (~50 LoC, lives at `src/lib/sse-client.ts`) tracks the last received event id and reconnects with `Last-Event-ID` header on disconnect. No new npm dep.
- **Server-side replay:** Cartographer route honors `Last-Event-ID` header by resuming the SSE pipe from that cursor via Anthropic's session event log. (Note: Anthropic event-log cursor-resume needs verification during step 9 — see §16 P1 deferred findings.)
- **Abandonment:** If the client disconnects, the server function detects it. The Anthropic session continues. Output persistence on `status=idle` is handled by the nightly sweep cron (§8.2 above) — NOT by the request handler. This means the worst case after a Cartographer 800s overrun is a ~24h delay before the output is visible to the next browser load.

### 8.4 Cost ceilings

- Per-agent `max_tokens` set in agent config: Sonnet 4096 (Mirror, Cartographer); Haiku 2048 (Connector, self_critique).
- Server-side hard timeout: 600s wall-clock per Cartographer session. Server function aborts the SSE pipe; the Anthropic session continues to idle (free).
- **Prompt caching enabled** on the formatted corpus + inlined taxonomies. Cache prefix is stable per agent → target 40-60% read-discount after first 5-10 sessions.

## 9. Quality validation

### 9.1 Verifier

Unchanged: deterministic, in-process, post-hoc. Frozen as `Verifier-v1` for this migration. Any change requires its own PR + new golden trajectory set.

### 9.2 Ablation harness

`scripts/ablate.ts` extended to:
- Accept a `--runner=openai|managed` flag (default: read from env or fail loudly).
- Emit a single structured JSON output (`test/ablation/reports/<timestamp>-<runner>.json`) per run: per-fixture-row + per-agent token counts, latency, Verifier verdicts (rejected/admitted/aspirational/no_quote_match counters), claim-ID stats.
- Existing markdown report preserved for human reading.
- CI integration: GitHub Action runs on every PR against a Neon preview branch seeded with the fixture; posts a delta vs the last `main` JSON as a PR comment.

### 9.3 Cutover gate (PR 1)

**Dev self-review** — no counselor in the loop. Three pass conditions:
1. **Ablation JSON parity** — `pnpm ablate:mirror --runner=managed` and `pnpm ablate:sensemake --runner=managed` produce structured outputs whose Verifier verdict distributions are within ±10% of the OpenAI baseline.
2. **Connector Verifier rejection rate** — `dropped_count / total_emitted` is within +15% of the OpenAI baseline across the full multistudent fixture.
3. **Manual fixture review (~30 min) with structured per-output capture** — dev opens both `<run>-openai.json` and `<run>-managed.json` and reviews 10 Mirror outputs + 5 Cartographer outputs against the existing 5-dimension rubric (provenance, specificity, novelty, anti-sycophancy, parallax_discipline). For each of the 15 outputs, dev records `pass / fail / concern` + a one-line note in a checklist in the PR description — not a summary, not "no obvious regressions". Post-hoc audit can detect rubber-stamping. Pass = no `fail` rows; `concern` rows have an explicit "shipping anyway because…" rationale.

If pass: ship PR 1. If fail: identify which agent/prompt + iterate. The gate is dev judgment; no formal review board (acceptable risk because there are no real users yet — see §13 for the rollback-window safety net).

## 10. Vercel deploy specifics

| Setting | Value | Reason |
|---|---|---|
| Plan | Pro | Fluid Compute up to 800s |
| Function runtime | Node | Edge has 25s first-byte requirement; long SSE incompatible |
| `maxDuration` (Cartographer route) | 800 | Hold SSE pipe through full Cartographer runs |
| `maxDuration` (Mirror, Connector routes) | 60 | Plenty for one-shot calls |
| `maxDuration` (cron `/api/cron/sweep-agent-sessions`) | 300 | Nightly batch tolerates the cap |
| Postgres | Neon (Vercel-Postgres integration) | Same dialect everywhere; copy-on-write preview branches |
| Pooled `DATABASE_URL` | PgBouncer transaction mode | App runtime; `pg.Pool` with `max:5, prepare:false` |
| Direct `DATABASE_URL` | non-pooled | Migration CLI only |
| Auth | WorkOS AuthKit | Google sign-in, encrypted cookie session |
| Cron | Vercel Cron | Daily session sweep + output persistence |
| Secrets (Vercel env vars) | `ANTHROPIC_API_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `MANAGED_AGENT_*_ID/VERSION`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `CRON_SECRET`, `OPENAI_API_KEY` (transcription only) | All server-side |
| Dev-only env var | `DEV_BYPASS_AUTH=demo-a` | Set in `.env.local` only. Skips `authkitMiddleware` and injects a fake counselor identity with `activeStudentId=demo-a`. Production Vercel env vars never include this. Preserves `pnpm dev` inner loop during steps 6-10 |
| CI workflows | `.github/workflows/ablation.yml`, `.github/workflows/lint-no-stale-flag.yml` | Ablation diff on every PR; flag-rot guard starting day 21 post-PR-1 |

## 11. Files touched

```
plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md      (this file)
docs/ideation/2026-05-12-managed-agents-migration-ideation.md        (source)

# New
scripts/managed-agents/provision.ts                                  (Step 5)
scripts/managed-agents/smoke-mirror.ts                               (Step 6)
scripts/managed-agents/smoke-connector.ts                            (Step 8)
scripts/managed-agents/smoke-cartographer.ts                         (Step 9)
src/agents/runner.ts                                                 (Step 6 — thin Managed Agents wrapper)
src/agents/memory/index.ts                                           (Step 10 — per-student append + snapshot + advisory lock)
src/agents/context/index.ts                                          (Step 8 — pre-fetch + format helpers; replaces tool calls)
src/auth/workos.ts                                                   (Step 4 — AuthKit setup; Google provider config)
src/auth/middleware.ts                                               (Step 4 — authkitMiddleware integration; demo-student attach via counselor_students; DEV_BYPASS_AUTH escape hatch)
src/db/migrations/                                                   (Step 2 — Drizzle Kit-generated SQL)
src/db/drizzle.config.ts                                             (Step 2 — Drizzle Kit config)
src/db/schema.ts                                                     (Step 2 — Drizzle TypeScript schema; replaces schema.sql)
src/lib/sse-client.ts                                                (Step 9 — hand-rolled EventSource wrapper with Last-Event-ID)
src/routes/api/cron/sweep-agent-sessions.ts                          (Step 8 — nightly Vercel cron with CRON_SECRET auth + output persistence)
.github/workflows/ablation.yml                                       (Step 1 — CI ablation harness wire-up)
.github/workflows/lint-no-stale-flag.yml                             (Step 12 — flag-rot guard; fails after day 21 if USE_MANAGED_AGENTS remains)
test/agents/managed-mirror.test.ts                                   (Step 6)
test/agents/managed-connector.test.ts                                (Step 8)
test/agents/managed-cartographer.test.ts                             (Step 9)

# Rewritten
src/routes/__root.tsx                                                (Step 4 — register AuthKit middleware)
src/routes/library.$dimension.tsx                                    (Step 4 — resolve studentId from session)
src/routes/library.trajectory.tsx                                    (Step 4 — resolve studentId from session)
src/routes/library.index.tsx                                         (Step 4 — resolve studentId from session)
src/routes/library.$entryId.tsx                                      (Step 4 — resolve studentId from session)
src/routes/reflect.review.tsx                                        (Step 4 — resolve studentId from session)
src/routes/reflect.index.tsx                                         (Step 4 — resolve studentId from session)
src/agents/mirror.ts                                                 (Step 6 — Managed Agents call + Sonnet; no tools)
src/agents/connector.ts                                              (Step 8 — Managed Agents call + Haiku; inlined taxonomies + pre-fetched context)
src/agents/cartographer.ts                                           (Step 9 — Managed Agents call + Sonnet; SSE + inlined taxonomies)
src/agents/tools/self-critique.ts                                    (Step 7 — Messages API tool; no module-load Agent)
src/agents/config.ts                                                 (Step 6 — model IDs + USE_MANAGED_AGENTS flag)
src/db/client.ts                                                     (Step 2 — pg + attachDatabasePool; pooled URL by env; prepare:false)
src/db/queries.ts                                                    (Step 2 — Drizzle queries; transaction-wrapped withStudent with SET LOCAL ordering)
src/db/seed.ts                                                       (Step 3 — pg; FTS5→tsvector via generated columns)
src/lib/safety.ts                                                    (Step 10 — extend to memory writes)
src/server/transcribe-mirror.handler.server.ts                       (Step 6 — unchanged transcribe; reads studentId from session; calls Managed Agents Mirror)
src/server/auto-connector.handler.server.ts                          (Step 8 — Managed Agents Connector with pre-fetched context; reads studentId from session)
src/server/run-cartographer.handler.server.ts                        (Step 9 — Managed Agents Cartographer + SSE event mapper; reads studentId from session)
scripts/ablate.ts                                                    (Step 1 — CI-callable; --runner flag; structured JSON output)

# Removed in PR 1
src/db/schema.sql                                                    (Step 2 — Drizzle TS replaces it)
app.db                                                               (Step 3 — local dev DB; reseed from fixture against Neon)

# Removed in PR 2 (cleanup, 7-14 days after PR 1)
src/agents/handoff-chain.ts
src/agents/handoff-chain-streamed.ts
better-sqlite3 (deps)
@openai/agents (deps)
src/agents/config.ts USE_MANAGED_AGENTS flag
```

The `openai` npm dep stays pinned in PR 2 for `src/server/transcribe-mirror.handler.server.ts` (gpt-4o-mini-transcribe). See `memory/project_transcription_is_dumb_capture.md`.

## 12. Build order (12 steps + cleanup follow-up)

Each step is mergeable to `main` and leaves the app working until step 12 flips the flag — **except Steps 2-3-4, which must merge as a single atomic unit** because the interim state has every route querying a non-existent student.

### Step 1. Extend ablation harness + CI wire-up
**Files:** `scripts/ablate.ts`, `.github/workflows/ablation.yml`
**Dependencies:** none
**Done when:**
- `pnpm ablate:mirror --runner=openai` produces `test/ablation/reports/<ts>-openai-mirror.json` with structured per-row + per-agent fields.
- Same script invoked from a GitHub Action against a Neon preview branch posts a delta vs `main` as a PR comment.
- Existing markdown report still emitted alongside JSON.
- `--runner=managed` exists in the CLI but errors with "managed runner not implemented" (placeholder; wired in step 6).

### Step 2. Neon adapter + Drizzle schema port + RLS policies + counselor_students
**Files:** `src/db/drizzle.config.ts`, `src/db/schema.ts`, `src/db/migrations/*`, `src/db/client.ts`, `src/db/queries.ts`. Removed: `src/db/schema.sql`.
**Dependencies:** Step 1 (CI infrastructure for migration runs)
**Atomic merge unit with Steps 3 + 4.**
**Done when:**
- `src/db/schema.ts` declares every table from `src/db/schema.sql` in Drizzle's TypeScript syntax including tsvector generated columns + GIN indexes.
- `counselor_students(counselor_id, student_id, attached_at)` table added.
- `agent_sessions` includes `counselor_id` column.
- `drizzle-kit generate` produces initial migration; `drizzle-kit migrate` runs against a local Neon dev branch with no errors.
- Every table with `student_id` has a `CREATE POLICY` enforcing `current_setting('app.student_id')`.
- `withStudent(studentId, fn)` wraps a Drizzle transaction where `SET LOCAL app.student_id = $1` is the **first** statement executed before any query in `fn`.
- `pg.Pool` configured with `prepare: false, max: 5`.
- **Concurrency test:** integration test in `test/db/rls-concurrency.test.ts` runs two `withStudent(A, ...)` + `withStudent(B, ...)` calls in parallel; asserts no cross-tenant rows visible.
- **FTS query helpers filter on `forgotten_at IS NULL`** — every FTS query in `src/db/queries.ts` that previously relied on SQLite's contentless-FTS trigger semantics now explicitly adds `WHERE forgotten_at IS NULL` before the tsvector match. Verified by existing forget tests.
- All existing queries in `src/db/queries.ts` work against Postgres (verified by running existing tests against the Neon dev branch).
- `src/db/schema.sql` deleted from repo; CI lint rejects re-adding `.sql` schema files outside `src/db/migrations/`.

### Step 3. Drop `app.db`; reseed from fixture against Neon
**Files:** `src/db/seed.ts`, `package.json` (remove `better-sqlite3`-dependent test scaffolding), `app.db` (deleted)
**Dependencies:** Step 2
**Atomic merge unit with Steps 2 + 4.**
**Done when:**
- `pnpm seed` against `DATABASE_URL` populates the multistudent fixture into Neon — 24 reflections across 4 students (`demo-a`, `demo-b`, `demo-c`, `demo-d`).
- tsvector columns auto-populate on insert via generated-column definition (no separate translation in seed).
- `app.db` deleted from repo + added to `.gitignore`. `better-sqlite3` removed from runtime deps (kept as dev dep until PR 2 if any test fixture needs it).

### Step 4. WorkOS AuthKit + Google sign-in + remove `'demo'` hardcoding + counselor_students attach
**Files:** `src/auth/workos.ts`, `src/auth/middleware.ts`, `src/routes/__root.tsx`, `src/routes/library.$dimension.tsx`, `src/routes/library.trajectory.tsx`, `src/routes/library.index.tsx`, `src/routes/library.$entryId.tsx`, `src/routes/reflect.review.tsx`, `src/routes/reflect.index.tsx`
**Dependencies:** Step 2 (`counselor_students` table)
**Atomic merge unit with Steps 2 + 3.**
**Done when:**
- WorkOS Dashboard configured with Google as social provider; AuthKit URL + redirect set.
- `authkitMiddleware()` registered in `src/routes/__root.tsx`.
- Six route files (`library.$dimension.tsx`, `library.trajectory.tsx`, `library.index.tsx`, `library.$entryId.tsx`, `reflect.review.tsx`, `reflect.index.tsx`) resolve `studentId` from `getAuth().session.activeStudentId`, not from a literal.
- First sign-in by an unknown Google account inserts 4 rows into `counselor_students` mapping the new counselor to `demo-a` through `demo-d` (idempotent on subsequent sign-ins).
- Before each `withStudent` call, server fns verify `counselor_students` row exists for the authenticated counselor's intended studentId. Returns 403 if not.
- All `*.handler.server.ts` request schemas have `studentId: z.string()` REMOVED — server reads from session only.
- **`DEV_BYPASS_AUTH=demo-a` env-var path** — when set in `.env.local` (never in Vercel prod env), `src/auth/middleware.ts` skips `authkitMiddleware` and injects a fake counselor identity with `activeStudentId=demo-a`. Preserves `pnpm dev` inner loop during steps 6-10 without forcing Google OAuth on every fresh browser session. Production never sets this var; CI lint check fails the build if `DEV_BYPASS_AUTH` is referenced outside `src/auth/middleware.ts`.
- App still uses OpenAI agents.

### Step 5. Provisioning script for managed agents
**Files:** `scripts/managed-agents/provision.ts`, `.env.example` (new MANAGED_AGENT_* keys)
**Dependencies:** none (independent of Steps 1-4)
**Done when:**
- Running `tsx scripts/managed-agents/provision.ts` creates 4 agents (mirror, connector, cartographer, self_critique — though self_critique is created but unused as a Managed Agent; kept for symmetry) + 1 environment via `client.beta.agents.create` and `environments.create`.
- IDs + versions are written to `.env.local`; instructions print for Vercel env-var setup.
- Re-running with existing `.env.local` is idempotent (skips create, prints existing IDs).

### Step 6. Mirror on Managed Agents (behind flag)
**Files:** `src/agents/runner.ts`, `src/agents/mirror.ts`, `src/agents/config.ts`, `src/server/transcribe-mirror.handler.server.ts`, `scripts/managed-agents/smoke-mirror.ts`, `scripts/ablate.ts`, `test/agents/managed-mirror.test.ts`
**Dependencies:** Step 5 (agent IDs in env)
**Done when:**
- `src/agents/runner.ts` exposes `runManagedAgent(agentId, version, input, schema)` wrapping `client.beta.sessions.*`.
- `src/agents/mirror.ts` rewritten to call `runManagedAgent` when `USE_MANAGED_AGENTS=true`, fall back to OpenAI path otherwise. Output schema unchanged.
- Smoke script `smoke-mirror.ts` runs one fixture transcript end-to-end and prints the JSON output.
- `pnpm ablate:mirror --runner=managed` produces a real JSON report.

### Step 7. `self_critique` as Messages API tool
**Files:** `src/agents/tools/self-critique.ts`
**Dependencies:** none
**Done when:**
- No `Agent` constructor at module scope — lazy init only.
- Function-style API: `selfCritique({content, dimension}) → CritiqueResult` calls Anthropic Messages API with Haiku, no further tool use.
- Existing tests pass (call sites in Connector and Cartographer don't change — they still call `selfCritique(...)`).

### Step 8. Connector on Managed Agents (with inlined taxonomy + pre-fetched corpus + sweep cron)
**Files:** `src/agents/connector.ts`, `src/agents/connector.prompt.md`, `src/agents/context/index.ts`, `src/server/auto-connector.handler.server.ts`, `src/routes/api/cron/sweep-agent-sessions.ts`, `scripts/managed-agents/smoke-connector.ts`, `test/agents/managed-connector.test.ts`
**Dependencies:** Step 6 (`runManagedAgent`), Step 7 (`selfCritique`)
**Done when:**
- `src/agents/context/buildConnectorContext(studentId, newReflectionId)` returns a formatted string: new reflection + recent FTS-matching mirrors (top 5) + current VIPS pages + inlined vips_taxonomy section.
- Connector prompt prefix references the inlined taxonomy (no `lookup_vips_taxonomy` tool reference).
- `src/agents/connector.ts` calls `runManagedAgent(connectorId, ..., context, ConnectorDiffSchema)` behind the flag.
- `auto-connector.handler.server.ts` wires `buildConnectorContext` before `runManagedAgent`.
- **`/api/cron/sweep-agent-sessions` route handler** ships here: verifies `CRON_SECRET` header → queries Anthropic for each running session → on `status=idle` writes `ended_at` + persists output via output schema parse if not already present → marks abandoned sessions >24h as archived.
- `pnpm ablate:sensemake --runner=managed` produces a JSON report showing Verifier rejection rate within +15% of OpenAI baseline on the full fixture.

### Step 9. Cartographer on Managed Agents + SSE event mapper + Last-Event-ID wrapper
**Files:** `src/agents/cartographer.ts`, `src/agents/cartographer.prompt.md`, `src/agents/context/index.ts`, `src/server/run-cartographer.handler.server.ts`, `src/lib/sse-client.ts`, `scripts/managed-agents/smoke-cartographer.ts`, `test/agents/managed-cartographer.test.ts`
**Dependencies:** Step 6 (`runManagedAgent`), Step 7 (`selfCritique`), Step 8 (sweep cron exists for output persistence on 800s overrun)
**Done when:**
- `buildCartographerContext(studentId)` returns the four VIPS pages + recent corpus (FTS against the new reflection's content AND against each of the four VIPS pages' `open_question`, deduped) + inlined vips + ecg taxonomies.
- **Verify** Anthropic's beta supports `Last-Event-ID` cursor resume on `client.beta.sessions.events.stream`. Two paths:
  - **If supported:** ship `src/lib/sse-client.ts` (~50 LoC) wrapper that tracks last event id and reconnects with the header. `run-cartographer.handler.server.ts` honors the header and resumes from cursor.
  - **If not supported:** drop the wrapper from this step's file list. UX becomes "Cartographer running, this can take 1-3 minutes; reload to see results." Sweep cron (Step 8) handles output persistence regardless.
- Smoke script streams a full Cartographer run end-to-end + parses against `CartographerOutputSchema`.

### Step 10. Memory stores wired (advisory locks, snapshots)
**Files:** `src/agents/memory/index.ts`, `src/agents/mirror.ts`, `src/agents/connector.ts`, `src/agents/cartographer.ts`, `src/lib/safety.ts`
**Dependencies:** Step 6 (`runManagedAgent` + session creation has memory binding)
**Done when:**
- `appendStudentMemory(studentId, file, op)` opens its OWN transaction (separate from caller's `withStudent` envelope), acquires `pg_advisory_xact_lock` on `hashtextextended(studentId || file, 0)`, re-establishes RLS via `SET LOCAL app.student_id`, reads current content, appends, writes, commits.
- `checkMemoryWriteForDiagnosticLanguage()` runs on every write.
- `memory_snapshots` row written every 20 ops per file.
- Mirror appends to `student-voice.md` after each run when novel.
- Connector appends to `rejected-diff-patterns.md` on Verifier rejection.
- Cartographer appends to `pedagogical-state.md` + `exploratory-threads.md` as designed.

### Step 11. Cutover gate run (dev review of ablation JSON + fixture outputs)
**Files:** none (validation step)
**Dependencies:** Steps 1, 6, 8, 9, 10 (all migration code paths exist and work)
**Done when:**
- `pnpm ablate:mirror --runner=managed` and `pnpm ablate:sensemake --runner=managed` both succeed end-to-end.
- Verifier verdict distributions within ±10% of OpenAI baseline (Mirror) and Verifier rejection rate within +15% (Connector).
- Dev has manually reviewed 10 Mirror outputs + 5 Cartographer outputs against the 5-dim rubric (provenance, specificity, novelty, anti-sycophancy, parallax_discipline). For each of the 15 outputs, the PR description includes a per-output line: `pass | fail | concern` + a one-line note. Summary lines like "spot-checked, no regressions" are not acceptable — the structured capture is what makes the gate auditable post-hoc.
- No `fail` rows. Any `concern` rows carry an explicit "shipping anyway because…" rationale.
- No diagnostic-language leaks; no sycophancy creep.

### Step 12. Cutover PR — flip `USE_MANAGED_AGENTS=true`
**Files:** `src/agents/config.ts`
**Dependencies:** Step 11 (gate passed)
**Done when:**
- `USE_MANAGED_AGENTS=true` in production env vars.
- Production traffic flows through Managed Agents.
- Feature flag stays in code (can be flipped back as rollback during the PR 2 observation window).
- `@openai/agents` dep still present (removed in PR 2).
- `handoff-chain*.ts` files still present (deleted in PR 2).
- **PR 2 opened as a draft against the feature branch on the same day as PR 1** — pre-stages the cleanup so it's not forgotten.
- **`.github/workflows/lint-no-stale-flag.yml` shipped** — starts failing on day 21 post-PR-1 if `USE_MANAGED_AGENTS` is still referenced in `src/agents/config.ts`. Forces an explicit decision (ship PR 2 or extend the flag in code with a comment).

### Step 13 (PR 2, follow-up). Cleanup PR — remove OpenAI Agents SDK
**Files:** `package.json`, `src/agents/config.ts`, `src/agents/handoff-chain.ts`, `src/agents/handoff-chain-streamed.ts`
**Dependencies:** Step 12 + observation window
**Done when:**
- PR 2 lands when: (a) dev has run `pnpm ablate:sensemake --runner=managed` against the multistudent fixture 3+ times across 7 days post-cutover with consistent JSON output, AND (b) no rollback flip in that window. Hard backstop: day 21 CI guard.
- `@openai/agents` removed from `package.json`.
- `handoff-chain.ts` and `handoff-chain-streamed.ts` deleted.
- `USE_MANAGED_AGENTS` feature flag removed.
- `.github/workflows/lint-no-stale-flag.yml` deleted (its job is done).
- `openai` npm dep stays pinned for `gpt-4o-mini-transcribe` call site only.

## 13. Rollback strategy

**Between PR 1 and PR 2** (the two-way door — gated by signal, not calendar):
- PR 2 ships when: (a) dev has run `pnpm ablate:sensemake --runner=managed` against the multistudent fixture 3+ times across 7 days post-cutover with consistent JSON output, AND (b) no rollback flip (`USE_MANAGED_AGENTS` toggled back) in that window. Since there are no real users yet, the signal is dev-driven repeat verification + a quiet observation window.
- Hard backstop: `.github/workflows/lint-no-stale-flag.yml` starts failing on day 21 if `USE_MANAGED_AGENTS` still exists. Either ship PR 2 or explicitly extend the flag in code (signaling the team that the migration is genuinely problematic, not just forgotten).
- Rollback during this window = flip `USE_MANAGED_AGENTS=false` in Vercel env vars + redeploy.
- All OpenAI Agents SDK code still present + functional.
- Postgres + WorkOS auth stay (they're additive; no rollback needed for those).
- No data migration to reverse (we never moved the data; we only reseeded).

**After PR 2 lands** (the door closes):
- Rollback requires `git revert` of PR 2 + forward-fix of any code in `handoff-chain*.ts` that drifted against `src/db/queries.ts` post-refactor (the Drizzle + transaction-wrapped pattern is NOT backwards-compatible with the synchronous `better-sqlite3` interface those files were written against).
- Postgres + auth stay regardless.

**Hard limits:**
- If Postgres data has diverged from OpenAI-era schema in incompatible ways (e.g., new fields not in old schema), rollback requires a forward-fix not a revert. This isn't expected because the schema port preserves all existing columns.
- If WorkOS auth state has accumulated (counselors signed up, demo students attached), rollback doesn't lose this — it lives in Postgres.

## 14. Risks + decisions still open

1. **Cartographer 800s tail** — Output persistence is now handled by the nightly sweep cron (§8.2) — first 800s overrun no longer = data loss. Worst case is ~24h delay before output visible. Webhook-receiver pattern remains the long-term answer if real-time persistence becomes critical.
2. **Memory concurrency under future load** — advisory locks work for single-counselor / single-active-student. CRDT op-log is the follow-up if conflicts surface.
3. **Egress proxy MITM (GH #46629)** — irrelevant now that we have no MCP. Self_critique uses Messages API (not container egress). The transcribe call uses OpenAI's API (server-side, not from inside the agent).
4. **Voice transcription stays on OpenAI `gpt-4o-mini-transcribe`** — STT is intentionally dumb capture; all sense-making lives downstream in Mirror/Connector/Cartographer. The `openai` npm dep stays pinned only for `src/server/transcribe-mirror.handler.server.ts`. `@openai/agents` and the full Agents SDK go; bare `openai` stays. Reconsider only on vendor-consolidation pressure or a product pivot back to realtime voice (currently out per commit `9f90b1d`).
5. **Beta header lock-in** — `managed-agents-2026-04-01` is beta. Anthropic supports it through GA. If GA shape diverges, the runner wrapper in `src/agents/runner.ts` is the single seam to update.
6. **Inlined-taxonomy update workflow** — closed vocabulary changes require a code redeploy (not an admin-panel update). Acceptable for v0.2; revisit if taxonomies start changing weekly. **Note:** during the active PR 1 → PR 2 observation window, taxonomy changes require a hotfix redeploy, not just a note to revisit.
7. **WorkOS APAC latency** — no documented APAC data center. Auth redirect routes through US/EU. One-time cost per session; acceptable for SG demo. If districts demand SG residency, revisit auth provider in a future PR.
8. **`agent_sessions` nightly sweep timing** — if the cron job fails or skips a night, `ended_at` is null longer than expected. Monitoring: ensure Vercel Cron run history is reviewed during prod observation window.
9. **Anthropic session event-log cursor resume** — Step 9 verifies whether `Last-Event-ID` replay is actually supported in beta. If not, mid-stream disconnect = reload-to-see-output, not seamless reconnect. Sweep cron makes the output persistence resilient regardless.

## 15. Out of scope

- Multi-tenant / multi-counselor SaaS scale (the auth layer is the seam; productization is later)
- ElectricSQL sync (PGlite ↔ remote Postgres bidirectional)
- Multiagent + Outcomes research-preview primitives
- Replacing OpenAI Whisper / `gpt-4o-mini-transcribe` for transcription
- Cost dashboards beyond ablation-harness JSON output
- MCP server (defer until ablation shows a quality gap that requires live tool use)
- CRDT-based memory write protocol (defer until concurrency conflicts surface)
- Counselor-facing review UI tooling beyond existing `reflect.review.tsx`
- Student-facing export feature
- Anthropic capacity reservation / airline-seat overbooking (defer until concurrency limits become a constraint)
- Production-grade Google sign-in restriction (WorkOS organization invite / `hd` domain validation / email allowlist) — v0.2 accepts open Google sign-in as documented in §6.1

## 16. Deferred review findings (from 2026-05-12 doc review)

Findings flagged by the ce-doc-review pass that are NOT applied to PR 1 — captured here so they're addressed at the right time.

### P1 items resolved during 2026-05-12 walkthrough
- **Verifier drift gate permeability** — accepted ±10% as-is; rollback window is the safety net (no real users yet).
- **Step 11 single-reviewer gate** — resolved via structured per-output checklist in §9.3 + Step 11; no second reviewer required.
- **Voice regression detection latency > rollback window** — PR 2 gated on dev-driven repeat ablation runs + zero-rollback signal (see §13), not calendar.
- **PR 2 forcing function** — PR 2 opened as draft on day-0 of PR 1; `lint-no-stale-flag.yml` CI guard starts failing day 21.
- **Connector pre-fetch top-N** — accepted N=5 without OpenAI-baseline calibration (no users yet; ablation is sanity check, not precision target).
- **Cartographer-specific pre-fetch context** — resolved via §7.1 + Step 9: FTS expands to use each VIPS page's `open_question` as additional query inputs.
- **Auth-mandatory breaks dev inner loop** — `DEV_BYPASS_AUTH=demo-a` env-var path added to Step 4 + §10.
- **FTS5 → tsvector forget semantics** — `WHERE forgotten_at IS NULL` filter requirement added to Step 2 done-when.
- **Anthropic event-log cursor resume** — verified during Step 9 implementation; explicit fallback to reload-to-see-output documented if beta doesn't support cursor resume.
- **counselor_id flow into agent_traces** — column added to `agent_sessions` in §5.1; threading into existing queries verified during Step 2.

### Deferred to follow-up PR (after PR 1 lands)
- **Counselor picker UI** — multi-student session-state switching exceeds v0.2 scope (Scope finding); Step 4 attaches a counselor to 4 demo students with a fixed activeStudentId (first attached) for v0.2.
- **Memory stores (Step 10)** — not on the cutover gate; could ship as a follow-up PR after PR 1 observation window.
- **Nightly sweep cron operational tuning** — CRON_SECRET auth + output persistence in PR 1 (P0 fix); finer-grained alerting on sweep failures is follow-up.
- **Step 1 as standalone PR before migration branch** — bundle vs separate is a sequencing preference, not a correctness issue.

### Advisory / FYI (no plan change required)
- **WorkOS APAC DPA existence** — confirm a DPA is in place with WorkOS before processing real counselor PII in production (synthetic-only data is acceptable for the v0.2 demo).
- **`OPENAI_API_KEY` rotation strategy** — define a rotation cadence + blast-radius procedure before any real-user audio is transcribed in production.
- **Partial memory writes on session abandonment** — `appendStudentMemory` uses its own transaction (advisory lock auto-releases on rollback); cross-store divergence between Anthropic memory store and `memory_snapshots` is a future risk.
- **Drop-and-reseed loses non-fixture dev data** — devs with locally-generated reflections should export before running Step 3.
- **`self_critique` call-site stability** — Step 7's rewrite preserves the `selfCritique(...)` signature; verify during implementation.
- **Pre-fetch latency vs 60s/800s budget** — benchmark during Steps 8/9 with the multistudent fixture; capture in ablation JSON.
- **Advisory-locks single-counselor-only callout** — add `// single-counselor only` comment in `appendStudentMemory` at implementation.
- **Taxonomy hotfix during PR 1→PR 2 window** — documented in §14.6.
