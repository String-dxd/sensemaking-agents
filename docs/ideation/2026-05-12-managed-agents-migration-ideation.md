---
date: 2026-05-12
topic: managed-agents-migration
focus: Tighter Vercel-deploy-ready migration plan from OpenAI Agents SDK to Claude Managed Agents
mode: repo-grounded
---

# Ideation: Managed Agents migration (Vercel-deploy-ready)

## Grounding Context

**Codebase shape:** TanStack Start + React 19 + better-sqlite3 + `@openai/agents` (`gpt-5.5`). Four agents — Mirror (1-shot reframe), Connector (auto-after-Mirror VIPS diff), Cartographer (manual lead-sheets, streams SSE), self_critique (sub-agent tool). Deterministic Verifier in-process. `withStudent(studentId, fn)` tenancy. FTS5 search via `search_past_mirrors`. Ablation harness in `scripts/ablate.ts`. Zod schemas portable as-is.

**Initial plan reviewed:** `plans/2026-05-12-001-feat-managed-agents-migration-plan.md` — 7 phases (P0 plan → P1 PGlite → P2 Runner+Mirror → P3 Connector → P4 Cartographer → P5 Memory → P6 Postgres+Vercel → P7 Cutover). Dual `LocalRunner | ManagedRunner` abstraction. Memory stores additive to SQL. ~$0.10/student-day cost estimate.

**Surprising findings from research:**
- Session billing meter pauses during idle (free) — long-lived sessions are economical
- Vercel Pro Fluid Compute = **800s** (not 300s); Edge has 25s first-byte requirement, unsuitable for proxying agent streams
- Anthropic persists session event log server-side; client SSE can reconnect via `last-event-id`
- Egress proxy TLS MITM bug (GH #46629) silently blocks some external domains even with `unrestricted` networking
- Opus 4.7 tokenizer can consume 35% more tokens than Sonnet for identical text
- Vercel Postgres IS Neon natively; copy-on-write branching = preview DBs per deployment
- PGlite single-user, incompatible with Vercel Edge (128MB cap); local-dev only
- `mcp-handler` (Vercel) + `mcp-tanstack-start` (Cody De Arkland) reference impls exist
- Streamable HTTP (not SSE) is correct MCP transport for cloud-agent reachability
- Tool OAuth credentials live in Anthropic vault; never reach sandbox
- `student_id='demo-a'` hardcoded in 3 route files (no auth)
- `self-critique.ts` builds Agent at module-load (holds global ref)
- Batch API 50% discount NOT available on Managed Agent sessions

## Topic Axes

1. Runtime + session lifecycle
2. Persistence migration
3. Tool surface
4. Tenancy + auth
5. Quality validation + cutover

## Ranked Ideas

### 1. Smallest first-shippable slice: Mirror as a Skill, Console-paste prototype, no tools
**Description:** First Managed Agents shipment is pure prompt-in / JSON-out via Console paste. Package Mirror as a Skill in the workspace library; same Skill version is consumed by the eventual Vercel app. Zero MCP infrastructure on day one.
**Axis:** 1
**Basis:** direct: Mirror prompt marks `search_past_mirrors` as optional ("Use it sparingly"); external: Skills are a Managed Agents primitive that bundle prompt + tools + schema.
**Rationale:** Decouples "validate Sonnet on Mirror's prompt" from the rest of the migration. Tools and Vercel come later when load-bearing.
**Downsides:** Deferred validation of tool-surface decisions.
**Confidence:** 85% | **Complexity:** Low | **Status:** Unexplored

### 2. Drop the dual runner: Managed-only, cloud-first dev loop
**Description:** Delete plan §3's `LocalRunner | ManagedRunner` abstraction. Dev points at a `staging` Managed Agents workspace with idle-free sessions; each PR gets a Vercel preview deploy + a seeded Neon branch. The "runner" becomes a thin server handler.
**Axis:** 1
**Basis:** direct: idle billing free; Anthropic event log persisted; Vercel preview branches make staging trivial; egress-MITM hurts local more than prod; reasoned: LocalRunner is speculative generality.
**Rationale:** Cuts ~30-40% of plan scope (no parity tests, no two implementations).
**Downsides:** Dev requires network + workspace token; loses step-debugging.
**Confidence:** 80% | **Complexity:** Low (removal) | **Status:** Explored

### 3. Phase 1 reshape: hosted-Postgres-first; PGlite is optional, not mandatory
**Description:** Skip PGlite as a mandatory intermediate. Port directly to Neon (Vercel Postgres). Each developer gets a personal copy-on-write branch off `main`; same SQL runs in dev, preview, prod.
**Axis:** 2
**Basis:** direct: PGlite single-user + Edge-incompatible; plan §6 names Neon as the prod target; external: copy-on-write branching is millisecond-fast.
**Rationale:** Eliminates FTS5 → tsvector dual-port; one dialect from commit 1.
**Downsides:** Dev requires network.
**Confidence:** 75% | **Complexity:** Medium | **Status:** Explored

### 4. Tenancy composite: auth-first, vault identity, RLS, capacity reservation
**Description:** Real auth (passkey/Clerk/WorkOS) lands before the Vercel deploy. `withStudent(studentId, fn)` becomes the identity envelope wrapping DB queries + session creation + vault tokens. Postgres RLS enforces isolation at the DB layer. Anthropic concurrency modeled as inventory with TTL holds.
**Axis:** 4
**Basis:** direct: `student_id='demo-a'` hardcoded across 3 route files; plan binds `memory_store_id` to `student_id` (§5) but P6 ships deploy with no auth; external: vault stores OAuth tokens per-user; GDS inventory pattern.
**Rationale:** Memory binding on top of `demo-a` is permanent audit-log corruption; every Managed Agents primitive (sessions, memory, skills, vault) expects user identity.
**Downsides:** Auth is its own project; RLS adds policy surface.
**Confidence:** 85% | **Complexity:** High | **Status:** Explored

### 5. Cutover composite: shadow-traffic from week 1 + ablation as CI + Verifier ratchet
**Description:** Phase 7 disappears. From the first Managed Agents call, dual-write outputs behind a per-student flag. Promote `scripts/ablate.ts` to CI-callable. Each phase's verifier suite is a one-way ratchet. Auto-promote 1% → 100% when KL delta + Verifier-pass-rate clear thresholds.
**Axis:** 5
**Basis:** direct: ablation harness exists, Verifier deterministic, `withStudent` enables per-tenant flagging; external: Stripe "scientist" pattern, Raft view-change ratchet.
**Rationale:** Cutover becomes a percentile dial, not a meeting.
**Downsides:** CI infra investment; shadow-write doubles inference cost during rollout.
**Confidence:** 80% | **Complexity:** Medium | **Status:** Explored

### 6. One MCP server with capability-descriptor metadata
**Description:** When tools come back post-Mirror-MVP, build ONE Streamable-HTTP MCP server at `/api/mcp` exposing all four custom tools with Zod-derived schemas + standard capability descriptors (auth scope, idempotency, latency band, side-effect class).
**Axis:** 3
**Basis:** direct: `mcp-handler` + `mcp-tanstack-start` reference impls exist; Zod schemas portable; external: Streamable HTTP is correct cloud-agent transport; USB-C capability negotiation.
**Rationale:** One auth/telemetry/rate-limit surface; per-tenant tool gating becomes structural.
**Downsides:** Capability metadata is over-engineering for four tools.
**Confidence:** 70% | **Complexity:** Medium | **Status:** Unexplored

### 7. Memory store as CRDT op-log, not flat `.md` files
**Description:** Closes plan §11.3. Each agent appends typed ops to a per-student log (`add-fact`, `supersede-fact`, `link-fact`); rendered `.md` is a projection. Free time-travel debugging + per-agent attribution.
**Axis:** 2
**Basis:** external: Automerge/Yjs/Riak CRDT literature; direct: plan §11.3 lists concurrency as open.
**Rationale:** Structural parity with the session WAL means reuse of the same append-only infra.
**Downsides:** Custom write protocol; rendering on every read.
**Confidence:** 65% | **Complexity:** Medium | **Status:** Unexplored

### 8. Sessions: explicit restart policy + DNS-style agent-version pinning
**Description:** Closes plan §11.4. Pick a restart strategy (`one_for_one` / `rest_for_one` / `one_for_all`) for mid-stream failures. Every session records the `(agent_version, env_version)` it was started against so mid-day redefs don't silently drift.
**Axis:** 1
**Basis:** external: OTP supervisor strategies, DNS RFC 1035/2308; direct: plan §11.4 + §4 don't specify either policy.
**Rationale:** Formalizes recovery + version-drift into policies instead of ad-hoc reconnect logic.
**Downsides:** Paperwork until something fails.
**Confidence:** 70% | **Complexity:** Low | **Status:** Explored

## Rejection Summary

| # | Idea | Reason rejected |
|---|------|-----------------|
| F1-2 | Drop `agent_traces` entirely | Duplicates F4-1 (canonical eval substrate) — stronger framing |
| F1-3 | Lazy self_critique + lint rule | Tactical fix; absorbed into MCP/Skill decisions |
| F1-8 | Cut `pathfinder` legacy in P1 | Sub-task; absorbed into survivor #3 |
| F2-3 | Merge self_critique into Mirror as follow-up turn | Better as brainstorm topic on survivor #1's evolution |
| F2-5 | Drop Phase 5 — Anthropic holds conversation memory | Conflates session context (free) with cross-session memory |
| F3-2 | Mirror stays on OpenAI; partial migration | Contradicts user's "migrate to Managed Agents" constraint |
| F3-3 | Replace VIPS tables with Memory primitive | Conflates flat qualitative .md with structured closed-vocab claims |
| F3-8 | Migration as a fork | Scope overrun — multi-tenant-SaaS-scale move applied to v0.2-demo |
| F5-8 | Vercel proxy as SIP signaling vs RTP media | Premium scaling concern; over-engineering for v0.2 |
| F6-2 | Ship in 3 quarters — multi-tenant SaaS | Useful constraint check; not actionable; insight in survivor #4 |
| F6-3 | $0.001/student-day commodity Haiku-only | Alternative product positioning, not migration plan |
| F6-4 | $1/student-day premium — Multiagent + Outcomes | Multiagent is research preview; too speculative |
| F6-5 | Zero humans — self_critique as gate | Subject-replacement: removes human-in-loop product premise |
| F6-6 | Zero Vercel — Hetzner self-host | Contradicts explicit user constraint |
| F6-7 | One mega-agent — Mirror eats everything | Useful brainstorm question, not actionable survivor |
| F6-8 | 20 micro-agents | Too speculative; intuition captured in survivor #5 |

## Next step

User picked "Brainstorm a selected idea" and overrode the seed selection with: "i want this plan to be full migration not multi phase". Survivors #1, #2, #3, #4, #5, #8 mark as Explored on that basis; the resulting plan written to `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
