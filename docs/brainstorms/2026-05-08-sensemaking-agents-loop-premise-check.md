---
date: 2026-05-08
topic: sensemaking-agents-loop-premise-check
---

# Sensemaking Agents — Loop Premise Check and v0.1 Architecture Pivot

## Summary

v0.1 of Sensemaking Agents pivots from the synchronous deterministic-Guide pipeline in `plans/sensemaking-agents.md` to a wiki-style architecture: Mirror as a live `gpt-realtime-2` voice session with one corpus-search tool, hosted on a per-student WebSocket actor; Connector → Pathfinder as a cron-triggered `Handoff` chain of multi-step ToolLoopAgents over the per-student Mirror corpus; single-vendor OpenAI on the OpenAI Agents SDK; Coach removed; Pathfinder absorbs the v1-planned longitudinal self-portrait. A tools-off ablation, run independently for Mirror's live tool and the cron sense-maker tool surface, is the falsifiable validation gate before the loop architecture commits into v1.

---

## Problem Frame

The brainstorm seed (`plans/ideation/2026-05-08-sensemaking-agents-tech-stack-ideation.md`, Survivor 6) was a premise check: *does Sensemaking Agents actually need a multi-step LLM agent loop, or is the existing single-shot per-agent design in `plans/sensemaking-agents.md` line 204 sufficient?* The seed asked for a falsifiable test, not a verdict.

In dialogue, the user reframed the architecture from "synchronous turn-based deterministic Guide" to "wiki-style: Mirror real-time, sense-making bots on cron over recorded Mirrors." That reframing produced an asymmetry the original premise check didn't anticipate: the *user-facing* path (Mirror) and the *async* path (cron sense-makers) have genuinely different loop requirements and live in different vendor and runtime contexts.

The pivot also pulls forward several pieces previously deferred to v1 in `plans/sensemaking-agents.md` — voice input, tool use, longitudinal patterns. Compounding effect: v0.1 is now closer to the full v1 vision in 48 hours rather than the original hackathon-scoped MVP. The risk this introduces — that too many variables change at once for the falsifiable test to interpret cleanly — is mitigated by running the ablation independently for each tool surface.

The product also drops a stated v0.1 capability: Coach. The original "one specific next experiment" emotional close (`plans/sensemaking-agents.md` line 21) is removed; the new emotional close is "patterns to consider and pathways worth exploring," with Mirror's live voice conversation absorbing the "what to try this week" feeling implicitly through dialogue rather than via a formal Coach output. This is a deliberate product positioning decision, not a deferral.

---

## Key Flows

- F1. **Live reflection capture (Mirror).**
  - **Trigger:** Student opens the app and starts a reflection session.
  - **Actors:** Student, Mirror agent.
  - **Steps:** (1) Student speaks via WebRTC/WebSocket session to `gpt-realtime-2`. (2) Mirror conducts a guided voice conversation, optionally calling its single tool — corpus search of past Mirrors — to surface prior reflections during the conversation. (3) Mirror produces structured signals + a transcript at session end. (4) Transcript and structured output persist to the per-student wiki; raw audio is discarded.
  - **Outcome:** A new Mirror entry exists in the per-student corpus. Student's session ends with a felt reflection, not a strategic plan.
  - **Covered by:** R3, R6, R7, R10, R11

- F2. **Async sense-making (cron Handoff chain).**
  - **Trigger:** Scheduled cron tick, scoped per-student.
  - **Actors:** Connector agent, Pathfinder agent.
  - **Steps:** (1) Cron infrastructure invokes the SDK `Runner` for one student's corpus. (2) Connector runs as a multi-step ToolLoopAgent over that corpus, producing patterns. (3) SDK `Handoff` passes Connector's output to Pathfinder. (4) Pathfinder runs as a multi-step ToolLoopAgent producing a `{trajectory, pathways}` output, with access to the same three-tool surface plus Connector's patterns as context. (5) Outputs persist to the wiki.
  - **Outcome:** Per-student wiki has fresh Connector patterns and Pathfinder trajectory + pathways, queryable from the next live Mirror session.
  - **Covered by:** R4, R8, R9, R12, R13

- F3. **Falsifiable ablation (validation gate).**
  - **Trigger:** Manually invoked after v0.1 ships, before v1 commitment.
  - **Actors:** Operator.
  - **Steps:** (1) Run Mirror with corpus-search tool ON over a sample student-session corpus; record outputs. (2) Run the same prompts with the tool OFF; record outputs. (3) Apply v1 audience eval criteria; identify whether the ON variant materially outperforms OFF on Mirror-specific quality dimensions. (4) Repeat the ablation independently for the cron three-tool surface against Connector + Pathfinder outputs. (5) Decide v1 commitment per tool surface based on each ablation's result.
  - **Outcome:** A documented decision per tool surface — keep, drop, or narrow — informing the v1 architecture.
  - **Covered by:** R17, R18, R19

---

## Requirements

**Architecture shape**
- R1. v0.1 ships exactly three specialist agents: **Mirror** (live), **Connector** (cron), **Pathfinder** (cron). No Coach, no separate Portrait agent.
- R2. The architecture is **wiki-style**: Mirror entries are durable, addressable, append-only per-student records; Connector and Pathfinder are cron-driven readers of that corpus.
- R3. **Per-student wiki scope only.** Every read and write is scoped to a single `student_id`. No cross-student inference at any tier in v0.1 or v1.
- R4. **Vendor**: single-vendor OpenAI for all agents. **Runtime**: OpenAI Agents SDK for live and cron paths, using `Agent`, `Tool`, `Handoff`, `Runner` primitives.

**Mirror live path**
- R5. Mirror is implemented as an OpenAI Agents SDK voice agent backed by `gpt-realtime-2`, reachable from the browser via WebRTC or WebSocket.
- R6. Mirror has exactly one tool: **corpus search of past Mirrors** for the current student. No external lookup, no self-critique, no other tools in v0.1.
- R7. Mirror's session is per-student and stateful for the duration of one reflection. State does not persist across sessions in the live agent itself; persistence happens via wiki writes at session end.
- R8. Audio retention: **transcripts only**. Raw audio is discarded after the `gpt-realtime-2` session ends.

**Cron sense-makers**
- R9. Connector is a multi-step ToolLoopAgent. Role: backward-looking, corpus-grounded; finds patterns within the student's own Mirror history.
- R10. Pathfinder is a multi-step ToolLoopAgent. Role: outward-looking SG-ECG mapping (MOE / JC / poly / uni / career-cluster taxonomy) **and** longitudinal trajectory across the Mirror corpus. Pathfinder's output schema spans `{trajectory, pathways}`.
- R11. Connector and Pathfinder share an **identical tool surface**: corpus retrieval, external lookup (MOE / ECG / web), iterative self-critique. Tool surface is identical; role specialization lives in prompt and output schema, not in tool access.
- R12. Connector and Pathfinder run as a **`Handoff` chain in one cron pass** (Connector → Pathfinder), not as independent scheduled jobs. Per-student. Cadence to be specified in planning.
- R13. The cron infrastructure that invokes the SDK `Runner` is external to the SDK. Choice of cron infrastructure is a planning concern.

**v0.1 amendments to `plans/sensemaking-agents.md`**
- R14. Voice input ships in v0.1. Amends line 67 ("Skip for v0.1") and R1 line 92 ("v0.1 = text only").
- R15. Tool use ships in v0.1. Amends line 204 ("No tool-use in v0.1").
- R16. **OpenAI Agents SDK** is the runtime, not Vercel AI SDK. Supersedes line 201 ("Vercel AI SDK over Claude Agent SDK").
- R17. Coach is removed from v0.1. Amends R2 line 93 ("at least four specialist agents") to "three specialist agents (Mirror, Connector, Pathfinder)" and removes R7 line 98 ("One next experiment"). Product description on lines 15 and 21 amends to drop "one specific next experiment" and "walks away with one concrete next step."

**Falsifiable validation gate**
- R18. The premise — that the agent loop is load-bearing — is validated only via an explicit **tools-off ablation** run after v0.1 ships and before v1 commitment.
- R19. The ablation runs **independently per tool surface**: one ablation for Mirror's single live tool (corpus search ON vs OFF), one for the cron three-tool surface (full surface ON vs OFF). Results are interpreted per tool surface; the v1 commitment for live and cron is independent.
- R20. The ablation evaluation rubric is a planning concern. The rubric must distinguish v0.1 evaluation bar (hackathon-credible: judge plus friendly tester) from v1 evaluation bar (real Singapore secondary students making ECG decisions). v1 commitment requires passing the v1 bar, not the v0.1 bar.

---

## Acceptance Examples

- AE1. **Covers R6, R11.** Given Mirror is configured with one tool (corpus search) and Connector or Pathfinder is configured with three tools (retrieval + external + self-critique), when an end-to-end student session runs, then Mirror's tool-call trace contains only `search_past_mirrors` invocations, while Connector's and Pathfinder's traces contain calls across all three tool types as the agent's reasoning warrants.
- AE2. **Covers R8.** Given a `gpt-realtime-2` Mirror session completes, when the session ends, then the persisted record contains the transcript and structured signals; no raw audio waveform is retained in storage of any tier.
- AE3. **Covers R12.** Given the cron `Handoff` chain runs on a per-student corpus, when Connector completes, then Pathfinder receives Connector's patterns as input via SDK `Handoff` (not via a separately scheduled cron tick reading from the wiki). Pathfinder's run is bound to the same scheduled pass as Connector's.
- AE4. **Covers R18, R19.** Given the v0.1 build runs in production, when the ablation is performed, then two separate decisions are produced — one for Mirror's live tool surface and one for the cron three-tool surface — each accompanied by the failure-mode evidence that justifies keeping, dropping, or narrowing that surface in v1.

---

## Success Criteria

- A reader of this doc can stop here and start `ce-plan` for v0.1 without inventing product behavior, agent boundaries, vendor choice, runtime choice, tool surfaces per agent, audio retention policy, or the validation gate's shape. Implementation choices (cron vendor, live compute layer, per-agent model, tool schemas, prompt wording, eval rubric) are explicitly the planner's job.
- The user's three brainstorm constraints — true LLM-driven agent loop, hosted multi-tenant web app, "just works" / minimal ops — are each addressable by at least one explicit decision in this doc, with the trade-off named.
- The falsifiable test is specific enough that a reasonable engineer could execute it after v0.1 ships and produce a defensible per-surface decision for v1, without re-litigating which premise is being tested.
- A future reviewer can compare this doc against `plans/sensemaking-agents.md` and identify exactly which lines are amended, superseded, or removed without reading the conversation that produced this doc.

---

## Scope Boundaries

- Cross-student or cohort-wide sense-making — per-student forever, at least through v1. Cohort-level inference would require explicit consent gates and a different architecture; not in scope here.
- A fifth Portrait agent or a separate longitudinal-self-portrait agent — explicitly rejected. Longitudinal lives in Pathfinder's output schema as `trajectory`.
- Coach agent or `next_experiment` output — explicitly removed from v0.1. Mirror's live voice conversation is the implicit channel for "what to try this week"; no formal Coach agent enforces it.
- Mirror with a full three-tool surface — explicitly rejected. Mirror's live tool surface is one tool only (corpus search). External lookup and self-critique live in the cron path.
- Raw audio retention — transcripts only. Voice biometrics, voice-aware downstream agents, and v2 re-analysis from raw waveforms are explicitly out of scope.
- Anthropic models in v0.1 — explicitly rejected; full OpenAI consolidation. Reconsidering vendor mix is a separate brainstorm.
- Vercel AI SDK as runtime — superseded by OpenAI Agents SDK. The earlier `plans/sensemaking-agents.md` decision (line 201) does not apply.
- Multi-tenant infrastructure beyond `student_id` row scoping — RLS policies, hard isolation guarantees, and consent flows are v1 concerns, not v0.1.
- Live compute layer choice (Cloudflare Durable Objects vs. Vercel WebSocket vs. Render vs. Fly.io vs. OpenAI's direct WebRTC from browser) — planning concern.
- Cron infrastructure choice (Trigger.dev vs. Inngest vs. Vercel Cron vs. SDK background mode) — planning concern.
- Per-agent model choice (`gpt-4.1` vs. `gpt-5` vs. `o3` for Connector, Pathfinder; latency-vs-quality tuning for Mirror) — planning concern.
- Tool schema, prompt wording, eval rubric specifics — planning concern.
- Splitting the tool surface by sense-maker agent (e.g., Connector gets only retrieval, Pathfinder gets only external) — explicitly rejected. Both share the full surface; role specialization lives in prompt and output schema.
- Polishing the duplicate "sensemaking" in the title of the renamed `plans/sensemaking-agents.md` — separate copy-edit pass, not a brainstorm output.
- Renaming the planned app subdirectory beyond the mechanical default of `app/` and `app.db` chosen during the rename — happy to override on user instruction; otherwise the defaults stand.

---

## Key Decisions

- **Wiki + cron architecture replaces the synchronous Guide pipeline.** Rationale: separating the user-facing path (Mirror) from the async sense-making path (Connector + Pathfinder) lets each path optimize for its own constraints — latency and conversational naturalness for Mirror, depth and tool richness for the sense-makers. The original synchronous pipeline forced both onto the same critical path.
- **Per-student wiki scope.** Rationale: cross-student inference would multiply the PDPA surface, require consent flows, and force cohort-level architecture decisions that are unrelated to the v0.1 product hypothesis. Per-student is the smallest scope that lets the loop premise be tested honestly.
- **Connector and Pathfinder kept as two distinct agents under role specialization.** Rationale: Connector is backward-looking and corpus-grounded; Pathfinder is outward-looking and SG-ECG-grounded. Different reasoning style, different output schema. Tools overlap; roles do not.
- **Pathfinder absorbs longitudinal trajectory rather than a 5th Portrait agent.** Rationale: longitudinal patterns are forward-looking from the corpus, which is Pathfinder's role. A separate agent would duplicate prompt and eval surface for marginal benefit.
- **Coach removed.** Rationale: the "one specific next experiment" output is editorially distinct from "patterns + pathways," but the product positioning works without it — Mirror's live voice conversation absorbs the tactical "what to try this week" feeling implicitly. Dropping Coach removes one prompt, one schema, one eval, and one UI surface from a 48-hour build.
- **Mirror has one live tool (corpus search), not the full three-tool surface.** Rationale: external lookup and self-critique mid-conversation introduce latency and unpredictability into the live voice path. Corpus search alone enables real-time reference to prior reflections without those costs.
- **Cron sense-makers run as a `Handoff` chain in one scheduled pass, not as independent jobs.** Rationale: Pathfinder's quality depends on Connector's patterns. Independent cron jobs would re-fragment corpus reads and force coordination via the wiki. SDK `Handoff` is the first-class primitive for this shape.
- **Single-vendor OpenAI; OpenAI Agents SDK as runtime.** Rationale: simpler mental model, one tracing system, one billing meter, one set of vendor failure modes to plan around. Trade: Survivor 5 ("own the agent runtime") is reframed — the SDK is the runtime, and the user's compounding leverage now lives in the cron infrastructure, persistence layer, WebSocket actor, and corpus tools that wrap the SDK rather than in a thin LLM provider port.
- **Audio retention: transcripts only.** Rationale: cleanest PDPA story, smallest blob layer in v0.1, no v2 dependency on raw waveforms. Override is a separate decision with explicit consent and storage architecture.
- **Falsifiable test runs as two independent ablations, not one combined test.** Rationale: Mirror's live tool surface and the cron three-tool surface are architecturally separate. A single ablation would conflate two decisions; per-surface ablation lets v1 commit live and cron paths independently.

---

## Dependencies / Assumptions

- Assumes `gpt-realtime-2`'s tool-calling capability is reliable enough for production student sessions in the v0.1 timeframe. If the model's tool-call reliability is materially worse than text-only completion, R6 (Mirror's corpus-search tool) becomes a liability.
- Assumes the OpenAI Agents SDK's `Handoff` primitive supports the shape required by the Connector → Pathfinder cron chain — specifically that an agent can return structured output that the next agent reads as context, with the SDK preserving the trace across the handoff. If not, the chain falls back to manual orchestration.
- Assumes OpenAI rate limits at the chosen tier accommodate per-student-session live audio plus per-student cron sense-making within reasonable concurrency. Concurrency budget is a planning concern but the brainstorm assumes feasibility.
- Assumes single-shot Mirror and single-shot sense-makers are not yet known to be insufficient — i.e., the falsifiable ablation has not been run. Decisions here are conditional on the ablation's eventual result; v1 architecture is gated.
- Assumes the Singapore PDPA scope for v0.1 covers transcripts only and does not require raw audio retention or deletion mechanisms beyond standard transcript-level deletion. v1's PDPA review may impose additional constraints.

---

## Outstanding Questions

### Resolve Before Planning

*(none — all open product questions surfaced in the brainstorm were resolved into Stated decisions or explicit Out-of-Scope items.)*

### Deferred to Planning

- [Affects R5, R7][Technical] What live compute layer hosts Mirror's WebSocket actor — Cloudflare Durable Objects, Vercel WebSocket, Render / Fly.io, or OpenAI's direct WebRTC from browser? `plans/ideation/2026-05-08-sensemaking-agents-tech-stack-ideation.md` Survivor 1 (Durable Objects) is now a serious candidate again.
- [Affects R12, R13][Technical] What cron infrastructure invokes the per-student `Runner` — Trigger.dev, Inngest, Vercel Cron, OpenAI Agents SDK background mode? Per-student cadence (real-time, after each Mirror; nightly; weekly) is also a planning concern.
- [Affects R4, R9, R10][Needs research] Per-agent model choice: `gpt-4.1` vs. `gpt-5` vs. `o3` for Connector and Pathfinder; latency-vs-quality tuning for `gpt-realtime-2`'s reasoning effort setting on Mirror. Cost and latency budgets per student session and per cron pass are inputs.
- [Affects R11][Technical] Tool schemas for the three-tool surface (retrieval, external lookup, self-critique) — input/output shapes, error semantics, idempotency keys.
- [Affects R5, R9, R10][Needs research] Prompt wording and output-schema design for Mirror, Connector, and Pathfinder, including the editorial constraints carried over from `plans/sensemaking-agents.md` (patterns to consider, not labels; preserve student agency).
- [Affects R20][Needs research] Evaluation rubric for both ablations — what counts as "materially better" output at the v0.1 hackathon bar versus the v1 SG-student bar.
- [Affects R3][Technical] Postgres + Row Level Security policy design for the `student_id` scoping invariant. SG region pinning on Supabase, Neon, or another managed Postgres provider.
- [Affects R1, R17][Technical] Migration shape from `plans/sensemaking-agents.md`'s `experiments` table (referenced at line 206) given Coach is removed — drop the table, retain it for v1 reintroduction, or repurpose.
