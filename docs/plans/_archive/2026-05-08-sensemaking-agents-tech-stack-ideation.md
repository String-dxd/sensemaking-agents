---
date: 2026-05-08
topic: sensemaking-agents-tech-stack
focus: hosted agent loop, students access web app, "just works"
mode: elsewhere-software
---

# Ideation: Sensemaking Agents Tech Stack

## Topic Context

**Subject:** Tech stack for Sensemaking Agents — a multi-agent web app for Singapore secondary / pre-tertiary students reflecting on school experiences. Currently planned in `plans/sensemaking-agents.md` as Next.js 15 + Vercel AI SDK v6 + Anthropic + SQLite (v0.1) → Postgres (v1) + Vercel + Clerk, with a deterministic Guide that sequences Mirror → Connector → Pathfinder → Coach.

**User intent (2026-05-08):** reconsider the stack with three constraints: (1) a true LLM-driven agent loop (not a deterministic pipeline), (2) hosted multi-tenant web app for students, (3) "just works" — minimal ops, no DevOps black holes.

**2026 landscape (from research):** Vercel AI SDK v6 ships `ToolLoopAgent` for native agent loops. Mastra Cloud offers a managed agent runtime + Memory Gateway. Trigger.dev v4 + Inngest provide durable execution wrappers with realtime streaming. Cloudflare Workers + Durable Objects support per-session actors with embedded SQLite. AWS Bedrock AgentCore is enterprise-grade with managed Memory + Identity. Convex offers managed-everything but **no SG region** (PDPA disqualifier). LangGraph Cloud is Python-first, not serverless.

**Top gotchas:** function timeouts on serverless killing 10–30s loops; CDN buffering of SSE; silent stream aborts with no client error; agent-state-loss on crash; multi-tenant data leakage via shared agent context.

**SG region availability:** Supabase ap-southeast-1 (RLS + auth built in), Neon ap-southeast-1 (April 2026, scale-to-zero), AWS Bedrock ap-southeast-1, Vercel sin1 (Pro tier).

## Ranked Ideas

### 1. Compute pivot — Cloudflare Workers + Durable Objects
**Description:** Replace Vercel + Postgres + Clerk with Cloudflare Workers + Durable Objects. Each active student session is a single-writer addressable DO instance owning the agent's working memory, tool-call history, and stream cursor. Agent loop runs in the DO; output streams over WebSocket directly from DO to browser, bypassing CDN buffering entirely.
**Warrant:** `external:` Orleans virtual actor model (MSR 2014); Cloudflare DOs are an explicit reimplementation. `reasoned:` an "agent session with memory" *is* structurally a single-writer addressable actor — Postgres + stateless functions reconstruct that shape on every turn at the cost of an impedance tax.
**Rationale:** Strongest "just works" answer if you accept the Next.js-on-Cloudflare adapter trade-off. Eliminates four of five top gotchas (function timeouts, CDN buffering, agent-state-loss, multi-tenant context bleed) by construction. Per-tenant isolation is a runtime guarantee.
**Downsides:** `@opennextjs/cloudflare` adapter still maturing; team must learn DO design patterns; WebSocket-first streaming is more complex than SSE for one-shot LLM streams.
**Confidence:** 65%
**Complexity:** High
**Status:** Unexplored

### 2. Stay on Vercel, wrap in durable execution + idempotency keys
**Description:** Keep Next.js + Vercel + Anthropic, but route every agent loop invocation through Trigger.dev v4 or Inngest from v0.1. Each tool call is a checkpointed step; failures retry from the last step. Add idempotency keys (`hash(student_id, turn_id, step_index)`) to every tool call so retries return cached results.
**Warrant:** `external:` Stripe idempotency-key pattern (Brandur Leach 2017); Trigger.dev v4 / Inngest "Durable Endpoints" purpose-built for LLM tool loops. `reasoned:` Vercel function-timeout ceiling + AI SDK's `stopWhen` (a step counter, not a durability boundary) means a true agent loop is one network blip from losing 30s of work.
**Rationale:** One seam absorbs every future async need — voice transcription, scheduled weekly reflections, longitudinal Sense-Maker batches in v2, PDPA export jobs. Trigger.dev Realtime streams to browser via React hooks. Additive, not replacing.
**Downsides:** One more vendor + billing meter; one more network hop; requires designing tools as idempotent from day one; 2026 vendor pricing at scale unclear.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 3. Persist the full agent trace as source of truth (content-addressed)
**Description:** Store every turn of every agent loop as structured rows (messages + tool calls + tool results + timing + tokens), not just final outputs. Content-address each step's output by `hash(prompt + tools + model_version + tenant_id)` so replay is a deterministic GET.
**Warrant:** `reasoned:` agent traces are write-once, append-only, high-value; marginal cost of persisting is ~KB per session, marginal cost of recreating later is infinite. `external:` Git's content-addressed object store; Nix derivation hashing.
**Rationale:** One write path enables five future capabilities: replay-driven debugging, eval datasets from real sessions, prompt regression tests, longitudinal Sense-Maker corpus for v2, PDPA audit trails. Eliminates the case for buying separate observability tooling.
**Downsides:** Storage grows linearly (mitigable: archive after 90 days); schema must anticipate replay needs; PII retention/erasure must scope across the trace table.
**Confidence:** 90%
**Complexity:** Low-Medium
**Status:** Unexplored

### 4. Postgres + RLS + SG-region from day one (Supabase or Neon)
**Description:** Drop "SQLite (v0.1) → Postgres (v1)". Start on Postgres on a managed SG-region service: Supabase ap-southeast-1 (built-in RLS + auth) or Neon ap-southeast-1 (scale-to-zero). Add `tenant_id` to every table from migration 1; write RLS policies even pre-auth (hardcoded dev tenant). Region-pin all PII; no replication outside SG.
**Warrant:** `direct:` `plans/sensemaking-agents.md` commits to "SQLite (v0.1) → Postgres (v1)" but SQLite-on-Vercel has no story for multi-tenant agent state. `external:` Supabase RLS thesis; Neon SG region (April 2026 changelog); telemedicine region-pinning (Doctolib FOSDEM 2022). `reasoned:` SQLite→Postgres is a correctness audit, not a config change; tenancy added late is the most expensive refactor in SaaS.
**Rationale:** Three compounding wins: v1 multi-tenant integration becomes "set the JWT claim" not "rewrite the data layer"; v2 vector search reuses the same hardened engine; PDPA right-to-erasure is one DELETE per student. SG region pre-empts a school-pilot DPO blocker.
**Downsides:** Slightly more setup overhead than SQLite; free-tier storage caps; RLS policies need careful testing.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 5. Keep the agent runtime in your repo, not a managed agent platform
**Description:** Use Vercel AI SDK v6's `ToolLoopAgent` (or hand-rolled equivalent) in your own compute, instead of Bedrock AgentCore / Mastra Cloud / LangGraph Cloud. Wrap the LLM provider in a thin port (typed request/response + tool schema + streaming events) so model swaps and cost optimizations (Haiku for routing, Sonnet for synthesis) are config changes.
**Warrant:** `reasoned:` managed agent platforms compound *their* leverage, not yours. When the abstraction doesn't fit (Sensemaking Agents' v2 longitudinal self-portrait won't fit a generic platform in 2026), you're stuck.
**Rationale:** Sensemaking Agents' product DNA — Singapore PDPA + voice + longitudinal patterns + multi-agent visibility UX — has no managed-platform fit in 2026. Owning the loop in v0.1 means v2 is a feature, not a migration.
**Downsides:** You give up out-of-box features (memory gateway, hosted observability, prebuilt agent network primitives); cognitive load of agent-loop debugging falls on you.
**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

### 6. Premise check — do you actually need a multi-step agent loop?
**Description:** Before committing infrastructure, name *one* concrete student interaction that *requires* multi-step LLM tool use within a single turn (not just multiple agents called in sequence — that's a pipeline). If reflection conversations are turn-based and bounded, a single Anthropic call per turn returning a strict JSON schema replaces the entire `ToolLoopAgent` + Trigger.dev stack. "Tool" calls become regular server functions invoked by Next.js after parsing the JSON.
**Warrant:** `reasoned:` reflection conversations are turn-based by design; there's no sub-goal decomposition that demands >1 LLM call per student turn; if true, the "agent loop" is decorative and a structured-output prompt is strictly simpler with identical UX.
**Rationale:** This is the most uncomfortable bet because it questions whether Sensemaking Agents needs an agent framework at all. Worth 30 minutes *before* writing the first agent code. The answer determines whether the rest of the survivors apply, or whether the stack collapses to Next.js + Anthropic + Postgres + Clerk.
**Downsides:** Uncomfortable to ask after you said "I want an agent loop." But the answer determines whether everything else is real engineering or theatre.
**Confidence:** 70%
**Complexity:** Trivial (a 30-min meeting, not a build)
**Status:** **Explored** (selected for ce-brainstorm 2026-05-08)

## Rejection Summary

| # | Idea | Reason |
|---|------|--------|
| F1.1–1.5, 1.7–1.8 | Pain findings (Vercel timeout, SSE buffering, SQLite multi-tenant, Clerk PDPA, etc.) | Subsumed by Survivors 1, 2, 3, 4 — they propose solutions to the same gaps |
| F1.6 | Deterministic Guide masks router prompt cost | Scope drift — planning concern, not tech stack |
| F2.1, F2.7 | Erlang/OTP supervisor trees, ATC strips | Same conclusion as Survivor 2 framed via analogy |
| F2.2 | HLS/DASH chunked manifest | Survivor 1's DO storage subscriptions implement it naturally |
| F2.4 | Idempotency keys for agent steps | Merged into Survivor 2 as the tool-call contract |
| F2.5 | MMO per-session authoritative actor | Merged into Survivor 1 (DO is the canonical implementation) |
| F2.6 | Google Workspace SSO for schools | Strong but tactical — auth choice, not architectural; defer to v1 |
| F2.8 | CDN content-addressed artifacts | Merged into Survivor 3 as implementation detail |
| F3.1 | Local-first Tauri | Fails "hosted" and "students access web app" constraints |
| F3.2 | Cloudflare Workers only | Merged into Survivor 1 |
| F3.3 | Convex single-platform | Fails PDPA — no SG region as of May 2026 |
| F3.4 | DIY single VPS | Fails "just works" |
| F3.6 | WhatsApp/Telegram bot | Frontend pivot, scope drift from "tech stack" |
| F3.7 | Scale to 10 students ever | Product judgment, not tech-stack candidate |
| F3.8 | 30-min durable workflow | Subsumed by Survivor 2 |
| F4.6 | SSE with named events + heartbeats | Tactical — absorbed into Survivors 1 and 2 streaming stories |
| F4.8 | TS end-to-end with shared schema | Already implicit in current plan; folded into Survivor 5's "wrap LLM provider as port" |

## Notes on Selected Idea (S6)

The user picked Survivor 6 ("premise check") for `ce-brainstorm` because it's the load-bearing question that determines whether the rest of the survivors are real engineering or theatre. If the answer is "we genuinely need a multi-step LLM agent loop within a single turn," everything in S1–S5 applies. If the answer is "we don't strictly need it; agents-as-pipeline is fine," the stack collapses dramatically and the entire DO-vs-Vercel-Trigger.dev debate evaporates.

Brainstorm seed: characterize the concrete student interactions that would require multi-step LLM tool use within a single turn (vs sequential structured-output calls), and produce a falsifiable test for whether Sensemaking Agents needs a true agent loop.
