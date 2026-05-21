---
title: feat: Quiet Mirror Pivot — async reflection, manual sensemaking, live agent visualization
type: feat
status: superseded
date: 2026-05-08
origin: docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md
---

# feat: Quiet Mirror Pivot — async reflection, manual sensemaking, live agent visualization

> **Current status (2026-05-13):** Superseded. The quiet audio capture direction survived, but the plan as written is no longer active: VIPS Wiki Pivot shipped in PR #1, Managed Agents + Postgres + WorkOS shipped in PR #4/#5, and World Studio shipped in PR #6. Do not execute the remaining Connector -> Pathfinder SSE units from this document; use `plans/CURRENT_STATE.md` and the newer plans instead.

## Summary

Replace the `gpt-realtime-2` WebRTC Mirror with a self-directed webcam-as-mirror ritual: MediaRecorder captures audio in-browser, OpenAI Whisper transcribes, an async Mirror agent produces `{validation, inferred_meaning, story_reframe}`. Connector → Pathfinder Handoff fires only on a manual button via a Server-Sent-Events endpoint that streams step-level agent events into a live visualization. Trigger.dev v3 cron and the WebRTC voice path are deleted from v0.1.

---

## Problem Frame

Local testing of the realtime Mirror produced an "interviewed" feeling that broke reflection. The pivot shape and rationale are established in `docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md`; this plan covers the implementation only. The "stuck on queue" Trigger.dev failure mode also drops away once cron is removed.

---

## Assumptions

*This plan was authored without synchronous user confirmation (LFG mode). The items below are agent inferences that fill gaps in the input — un-validated bets that downstream review and the implementing agent should scrutinize.*

- A1. **Whisper model variant: `whisper-1`.** Stable, present in `openai` ^6 SDK, accepts `webm/opus` blobs. Newer transcribe models (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`) are nicer but variant-detection in older SDK versions is uncertain. Tunable later.
- A2. **Streaming transport: SSE via a TanStack Start API route.** A new `src/routes/api/sensemake.ts` returns a `Response` with `Content-Type: text/event-stream` and a `ReadableStream` body. The browser consumes via `EventSource`. `createServerFn` returns JSON-only and is unsuitable for streaming. SSE is unidirectional which exactly matches our need (server → client step events).
- A3. **Soft time-box default: 90 seconds.** Brainstorm range was 60-90s. 90s is the more permissive default; Stop button remains always available.
- A4. **Silence threshold: 3 seconds at opening only.** Single soft prompt. No mid-session prompts.
- A5. **DB schema migration strategy: drop-and-reseed on mismatch.** A `schema_version` row is added; bump it; on boot if mismatch is detected, the demo db is dropped and reseeded. Acceptable for v0.1 demo. Production migration is out of scope (no production data exists yet).
- A6. **Mirror agent model: `gpt-4.1`.** Matches Connector and Pathfinder. Async, single Runner call, no streaming on the Mirror path (the Mirror surface is small enough that one synchronous call suffices).
- A7. **Mirror keeps `searchPastMirrors` corpus-search tool.** The brainstorm's R20 ablation runs Mirror with vs without that tool; preserving it is required.
- A8. **Webcam display flips horizontally** (CSS `transform: scaleX(-1)`) so the student perceives a real mirror.
- A9. **Audio container: `audio/webm; codecs=opus`** from `MediaRecorder`. Whisper SDK accepts via FormData with this MIME type.
- A10. **No raw audio retained.** Blob is uploaded to the Whisper server fn; transcript persisted; blob is discarded by garbage collection. This carries forward the prior brainstorm's transcripts-only policy.
- A11. **Volume reactivity is a single calming visual** — a soft pulsing ring around the mirror frame whose scale tracks RMS amplitude with a low-pass filter so it never feels jittery. No waveform, no meter, no numeric display.
- A12. **3-entry gating reads from existing `listMirrorEntries` length.** No new query helper needed.
- A13. **Live visualizer renders inline in `wiki.index.tsx`** above the entry list while a run is active; reverts to the standard cards layout when complete. Not a separate route.
- A14. **Step event types are an enum:** `agent_started`, `tool_call_started`, `tool_call_completed`, `partial_output`, `handoff`, `agent_completed`, `run_completed`, `error`. Mapped from the OpenAI Agents SDK `Runner` event stream — the precise SDK event-name mapping is verified during U5 implementation against the installed SDK version (`@openai/agents` ^0.11), which is a defensible execution-time discovery.

---

## Requirements

Carried from `docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md`. R-IDs match origin.

- R1. Mirror sessions self-directed and time-boxed; no AI voice during session.
- R2. Silent open; one soft text prompt after ~3s of opening silence; no further prompts.
- R3. Soft 90s time-box with always-available Stop button.
- R4. Webcam visual-only; no frames sent to AI; no still photos stored.
- R5. Browser MediaRecorder → server fn → OpenAI Whisper → transcript persisted; audio discarded.
- R6. Positive and negative experiences first-class.
- R7. Mirror agent runs async at session end; output `{validation, inferred_meaning, story_reframe}`.
- R8. Edit-and-confirm primitives for all three fields; un-edited Mirror output preserved for ablation.
- R9. Manual trigger only for Connector + Pathfinder; no cron, no on-save.
- R10. Trigger button gated until corpus has ≥3 mirror entries.
- R11. Single Handoff chain (Connector → Pathfinder) in one Runner call.
- R12. UI streams step-level events; not token-level.
- R13. Visualization persistent during run; reverts to cards on completion; failed steps inline with retry.
- R14. WebRTC + `gpt-realtime-2` + voice agent surfaces removed.
- R15. Trigger.dev cron + schedule-onboard removed; deferred to v0.2+.
- R16. "Run sense-making" button replaces `tasks.trigger(...)` with direct in-process call streaming events.
- R17. Tenancy, transcripts-only policy, single-vendor OpenAI, FTS5 unchanged.
- R18. Demo-grade live visualization: labels, active-agent highlight, explicit handoff transition, tool query + result preview.
- R19. Ambient mirror UI: subtle volume reactivity, non-aggressive countdown, no streaks/scores.
- R20. Reshaped ablation surface: Mirror with/without `searchPastMirrors`; Connector+Pathfinder with/without three-tool surface; independent.
- R21. Reports under `test/ablation/reports/`; v0.1 bar unchanged.

**Origin actors:** A1 Student, A2 Mirror agent, A3 Connector agent, A4 Pathfinder agent, A5 Operator (demo).
**Origin flows:** F1 Quiet reflection capture (R1-R6, R8), F2 Manual sense-making with live visualization (R7, R9-R13), F3 Falsifiable ablation (R20-R21).
**Origin acceptance examples:** AE1 (R1, R2), AE2 (R4), AE3 (R7, R8), AE4 (R9, R10), AE5 (R11-R13), AE6 (R14, R15).

---

## Scope Boundaries

- WebRTC voice path, `gpt-realtime-2`, OpenAI Agents SDK voice agent shape — fully removed in this plan
- Trigger.dev v3 cron infrastructure — deleted in this plan; not deferred-deferred (deferred-to-later as a product capability for v0.2+, but in code terms, gone)
- Auto-running Connector + Pathfinder on save — not built; manual only
- Daily-habit framing, streaks, push notifications, "due today" UI — not built
- Video-frame upload, still-photo capture, vision-modality Mirror input — not built
- TTS playback of Mirror's reflection — not built (possible v0.2+)
- Coach agent / `next_experiment` — stay removed (per prior brainstorm)
- Token-level agent streaming — not built; step-level only
- Auth + multi-tenant infra beyond `student_id` row scoping — unchanged; v0.1 stays demo-only with `student_id = 'demo'`
- Migration tooling for `mirror_entries` — out; drop-and-reseed for v0.1 demo
- Cross-browser Safari shims for `MediaRecorder` / `getUserMedia` — out for v0.1; Chrome current is the demo target

### Deferred to Follow-Up Work

- Capture chosen Whisper variant + streaming transport + Trigger.dev removal pattern as durable learnings under `docs/solutions/` (the directory does not exist yet) — can land as a separate PR after the pivot stabilizes.

---

## Context & Research

### Relevant Code and Patterns

- **Server-fn split convention** (load-bearing): every server endpoint is `*.functions.ts` (TanStack `createServerFn` thin wrapper) + `*.handler.server.ts` (pure handler + Zod input schema + custom error class). Examples: `src/server/persist-mirror.{functions,handler.server}.ts`, `src/server/edit-wiki.{functions,handler.server}.ts`. New endpoints in this plan follow this exactly.
- **Streaming endpoint shape (greenfield)**: TanStack Start API route at `src/routes/api/<name>.ts` exporting handlers that return a `Response`. SSE means `Content-Type: text/event-stream` + `ReadableStream` body. No precedent in the repo; pattern is universal.
- **Agent Runner pattern**: `src/agents/handoff-chain.ts` `runSenseMakingForStudent(studentId, deps?)` — uses `run()` from `@openai/agents` with optional dependency injection for tests. The new SSE endpoint wraps this with `Runner.runStream()` (or equivalent SDK streaming call) and emits step events to the SSE stream.
- **Tenancy**: `src/server/tenancy.server.ts` `withStudent(studentId, fn)` — every DB-touching handler must wrap. New endpoints obey this.
- **Edit-and-confirm**: `src/components/EditableField.tsx` (display↔textarea toggle, draft state, Confirm/Cancel) + `src/components/ConfirmAndSave.tsx` (mutation wrapper with optimistic state + invalidation). Caller passes `buildInput(next)` and the server fn as `mutationFn`.
- **Tool factory**: `src/agents/tools/search-corpus.ts` `searchCorpusToolFor(studentId)` — closure carries studentId. The Mirror agent retains this in v0.1 per origin R20.
- **Safety gating**: `src/lib/safety.ts` `checkPayloadForDiagnosticLanguage` / `checkOutputForDiagnosticLanguage` — every persist + edit boundary calls these. New persist + edit handlers extend the field list to `{validation, inferred_meaning, story_reframe}`.
- **Zod schemas as enforcement**: `src/agents/schemas.ts` is also Agents SDK `outputType` so failures retry. The reshaped Mirror schema lives here.
- **TanStack Query keys**: `['wiki', STUDENT_ID]`, `['wiki', STUDENT_ID, entryId]` — composed by callers.

### Institutional Learnings

- No `docs/solutions/` exists. After this pivot stabilizes, capture: chosen Whisper variant, SSE-via-API-route shape, Trigger.dev removal pattern.
- The 8-reflection seed corpus + 4-dimension scoring rubric (provenance, specificity, novelty, anti-sycophancy; ON beats OFF by ≥2 points across ≥3 dims) carries forward unchanged for the reshaped ablations.

### External References

- OpenAI Whisper API: `openai.audio.transcriptions.create({ file, model: 'whisper-1' })` accepts a `File`/`Blob` from FormData.
- OpenAI Agents SDK TS streaming: `Runner.runStream(...)` (or `run(..., { stream: true })`) emits an event stream with agent lifecycle + tool-call events. Exact event-name mapping is verified at U5 implementation time against the installed `@openai/agents` ^0.11 version.

---

## Key Technical Decisions

- **Server-Sent Events for live agent visualization.** Unidirectional (server → client) matches our need. `EventSource` is dead simple in the browser. WebSocket would add reconnection logic and bidirectional surface we do not need. `ReadableStream` over fetch is also viable but `EventSource` has built-in reconnection and is the standard for this exact pattern.
- **TanStack Start API route, not `createServerFn`, for the SSE endpoint.** `createServerFn` returns JSON. API routes return `Response` and accept arbitrary headers + streaming bodies. This is the only place in the codebase that bypasses the server-fn split convention; the convention still applies to the Whisper transcribe endpoint and all DB-touching endpoints.
- **Mirror agent reuses the existing handoff-chain Runner pattern.** No new agent factory shape. `src/agents/mirror.ts` becomes an `Agent({...})` factory mirroring `connector.ts` / `pathfinder.ts`, plus a `runMirrorOnTranscript(transcript, studentId)` helper that wraps `run()` and persists. This keeps the codebase coherent.
- **Drop-and-reseed for schema migration.** `schema_version` row in `_meta` table; on boot, if version mismatches, `app.db` is deleted and reseeded. Acceptable because v0.1 has no production data. Saves us from writing a migration framework just for a demo pivot.
- **Step-event enum is shared between server and client.** Single source of truth in `src/agents/run-events.ts` (exported type). Server emits, client consumes, no drift.
- **Mirror agent runs synchronously after Whisper transcription.** No streaming on the Mirror path — the response is small (three short fields), the latency is acceptable (~3-5s after audio stops), and adding streaming here would multiply complexity for marginal UX gain. Streaming is reserved for the Connector → Pathfinder run, which is the demo wow surface.

---

## Open Questions

### Resolved During Planning

- **Whisper model variant**: `whisper-1` per A1.
- **Streaming transport**: SSE via API route per A2.
- **Soft time-box**: 90s default per A3.
- **Silence threshold**: 3s at opening only per A4.
- **Mirror tool surface**: keeps `searchPastMirrors` per A7.
- **Mirror model**: `gpt-4.1` per A6.

### Deferred to Implementation

- **Exact SDK event-name mapping for `@openai/agents` ^0.11.** Verified by reading the installed package's type definitions during U5. The plan defines the *shape* of step events; the SDK call shape is the implementing agent's call.
- **Volume reactivity smoothing constant.** Tuned at U4 implementation in the browser; the plan only commits to "calm, non-jittery."
- **Whisper FormData precise field name** (`file` vs `audio` vs other) — verified against the openai SDK at U3 implementation.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                      QUIET REFLECTION                                   MANUAL SENSEMAKING (demo wow)
   ┌──────────────────────────────────────────┐         ┌──────────────────────────────────────────────┐
   │  Browser /reflect                        │         │  Browser /wiki                               │
   │                                          │         │                                              │
   │  ┌─ <video> mirror (flipped) ─┐          │         │  [Run sense-making] ── disabled if <3 entries│
   │  │   getUserMedia(audio+video)│          │         │           │                                  │
   │  └────────────────────────────┘          │         │           ▼  EventSource → /api/sensemake    │
   │  WebAudio analyser ──────► volume ring   │         │  ┌─────────────────────────────────────────┐ │
   │  3s opening silence ─────► soft prompt   │         │  │ AgentRunVisualizer                      │ │
   │  MediaRecorder ───────► audio/webm Blob  │         │  │  • Connector card (active glow)         │ │
   │  Stop ─► POST /transcribe-mirror ────────┼──┐      │  │  • tool: search_corpus(query=…) → preview│ │
   │                                          │  │      │  │  • ─── HANDOFF ──→                       │ │
   └──────────────────────────────────────────┘  │      │  │  • Pathfinder card (active glow)        │ │
                                                 │      │  │  • tool: lookup_ecg(…)                  │ │
                                  ┌──────────────▼──┐   │  │  • run_completed                        │ │
                                  │ Whisper API     │   │  └─────────────────────────────────────────┘ │
                                  └──────┬──────────┘   │     ▲                                        │
                                         │              │     │ SSE step events                        │
                                  ┌──────▼──────────┐   │  ┌──┴──────────────────────────────────────┐ │
                                  │ Mirror agent    │   │  │ /api/sensemake (TanStack API route)     │ │
                                  │ run() →         │   │  │ runSenseMakingForStudentStreamed()      │ │
                                  │ {validation,    │   │  │   ↳ Runner stream events → SSE chunks   │ │
                                  │  inferred,      │   │  │   ↳ persists Connector + Pathfinder rows │ │
                                  │  story}         │   │  └─────────────────────────────────────────┘ │
                                  └──────┬──────────┘   │                                              │
                                         │              │                                              │
                                  ┌──────▼──────────┐   │     ConnectorPatternCard / Pathfinder cards │
                                  │ persistMirror   │   │     render in the wiki list when each agent │
                                  │ → mirror_entries│   │     completes (existing components)         │
                                  └─────────────────┘   └──────────────────────────────────────────────┘
```

Two mostly-independent paths. The reflection path is synchronous-after-stop (Whisper → Mirror → persist) and uses the standard server-fn split. The sensemaking path is streamed (SSE) and uses an API route. The two paths share `mirror_entries` as the corpus.

---

## Implementation Units

### U1. Remove realtime + Trigger.dev surfaces

**Goal:** Delete the WebRTC voice path, the `gpt-realtime-2` constants, the Trigger.dev v3 task, and the cron scheduling endpoints. Land first so subsequent units start from a clean baseline.

**Requirements:** R14, R15

**Dependencies:** None

**Files:**
- Delete: `src/agents/mirror-event-router.ts`
- Delete: `src/server/mirror-session.functions.ts`, `src/server/mirror-session.handler.server.ts`
- Delete: `src/server/schedule-onboard.functions.ts`, `src/server/schedule-onboard.handler.server.ts`
- Delete: `src/server/trigger-cron.functions.ts`, `src/server/trigger-cron.handler.server.ts`
- Delete: `trigger/sense-make.ts`, `trigger.config.ts`, `trigger/` directory entirely
- Delete: `src/components/MirrorSession.tsx` (current WebRTC version — file path will be reused by U4 with new contents)
- Delete: `test/server/mirror-session.test.ts`, `test/trigger/sense-make.test.ts`, `test/trigger/` directory
- Modify: `package.json` — remove `@trigger.dev/sdk` dependency; remove `pnpm`-only build entry for `protobufjs` (was a Trigger.dev transitive); remove the `ablate:cron` script if it points at the now-removed cron path (verify before removing)
- Modify: `pnpm-lock.yaml` — regenerate via `pnpm install`
- Modify: `.env.example` — strip `TRIGGER_*` env vars
- Modify: `src/agents/mirror.ts` — empty out current contents (the `MIRROR_MODEL = 'gpt-realtime-2'` constants module); will be repopulated by U2 as an Agent factory
- Modify: `README.md` — strip realtime/cron references; will be rewritten in U7

**Approach:**
- Pure deletion; no behavior change. `pnpm tsc --noEmit` will fail on dangling imports — that's expected and tells us where call sites need fixing in later units.
- After deletion, run `pnpm install` to regenerate the lock file.
- Do NOT delete `scripts/ablate.ts` or `test/ablation/cron-tools-off.test.ts` yet — those are reshaped in U7, not deleted.

**Operational note:** Trigger.dev SaaS-side cleanup (paused schedules, archived project) is the operator's responsibility post-merge; this unit only removes the local code path. Audit `.env` for any `TRIGGER_*` vars and verify no unreferenced cache directories remain under repo root.

**Patterns to follow:**
- The single existing convention these files follow is the server-fn split — deleting both halves of a pair together.

**Test scenarios:**
- Test expectation: none — deletion-only unit. Verification is purely build-level: `pnpm install && pnpm tsc --noEmit` produces only errors that point at code U2-U6 will rewrite (no stranded imports of `gpt-realtime-2`, `@trigger.dev/sdk`, `MirrorSession`, etc. that aren't covered by a planned later unit).

**Verification:**
- `grep -r "gpt-realtime-2\|@trigger.dev\|MirrorSession\|mirror-session\|schedule-onboard\|trigger-cron" src test` returns no results except in `package.json` (which has been modified) and old plan/brainstorm docs in `plans/` and `docs/brainstorms/` (which are historical artifacts, not source).
- `pnpm install` succeeds and removes `@trigger.dev/sdk` from `node_modules`.
- The repo no longer contains `trigger/` or `trigger.config.ts`.

---

### U2. Reshape Mirror schema, DB, and corpus formatter

**Goal:** Replace the Mirror entry shape (`signals`, `caution`, `tags`) with `{validation, inferred_meaning, story_reframe}` end-to-end: Zod schemas, SQLite columns, query helpers, persist + edit handlers, safety gating field list, and the `formatCorpusForAgent` body inside `handoff-chain.ts`. Add the Mirror agent factory itself (matching `connector.ts` / `pathfinder.ts`) and a `runMirrorOnTranscript(transcript, studentId)` helper.

**Requirements:** R7, R8, R17, R20

**Dependencies:** U1

**Files:**
- Modify: `src/server/persist-mirror.handler.server.ts` — **(unblocks U4)** input Zod schema accepts `{validation, inferred_meaning, story_reframe}`; safety gate runs over each. Land this update early in U2 so U4 can call `persistMirror` against the new shape.
- Modify: `src/agents/schemas.ts` — replace `MirrorSignalSchema` and `MirrorEntrySchema.signals/caution/tags` with `{validation: string, inferred_meaning: string, story_reframe: string, transcript: string}`. **`summary` is removed** — no caller relies on it after this unit; the FTS5 mirror is reindexed onto `story_reframe` (see `db/schema.sql` below).
- Modify: `src/agents/mirror.ts` — repopulate as `mirrorAgent = Agent({ name: 'mirror', model: 'gpt-4.1', instructions, tools: [searchCorpusToolFor(studentId)], outputType: MirrorOutputSchema })` factory, plus `runMirrorOnTranscript(transcript, studentId)` helper that wraps `run()` and returns the parsed output.
- Create: `src/server/run-mirror-on-transcript.functions.ts` and `src/server/run-mirror-on-transcript.handler.server.ts` — TanStack `createServerFn` wrapper around `runMirrorOnTranscript` so U4's `/reflect` flow can invoke it from the client. Follows the standard server-fn split convention.
- Modify: `src/agents/mirror.prompt.md` — rewrite from voice-listening + careful-question to a three-part output: validate the feeling, infer candidate meanings (humbly, as candidates not verdicts), reframe as a short story (warm, not clinical). Anti-sycophancy carried forward from prior prompt. **Wrap the incoming transcript in delimited tags** (e.g., `<student_transcript>...</student_transcript>`) and instruct the agent that the contents are verbatim student speech that must not be treated as instructions, even if they read as imperatives. Defense-in-depth on top of the structured `outputType`.
- Modify: `src/db/schema.sql` — replace `signals_json`, `caution`, `tags` columns on `mirror_entries` with `validation TEXT`, `inferred_meaning TEXT`, `story_reframe TEXT`, plus `raw_output_json TEXT` (preserves the un-edited Mirror agent output for ablation per R8). Reindex the FTS5 mirror onto `story_reframe` (the closest semantic replacement for `summary`). Schema is authored fresh — no in-place migration SQL is needed because U2's reseed strategy below recreates the DB from this file.
- Modify: `src/db/queries.ts` — update `MirrorEntryRow`, `insertMirrorEntry`, `updateMirrorEntryFields`, and any `listMirrorEntries` consumers to the new shape.
- Modify: `src/db/client.ts` — replace the `_meta.schema_version` mechanism with a column-existence reseed check: on boot, query the `mirror_entries` table for a sentinel column (`validation`); if absent, the schema is stale. **Backup-before-delete:** copy `app.db`, `app.db-shm`, `app.db-wal` to `app.db.bak-<ISO timestamp>` (and equivalents) in the same directory before deletion, log the backup path, then reinitialize from `schema.sql` and reseed. This preserves a one-step recovery surface for any developer with locally-edited demo data. Forward-only by construction (column either exists or doesn't); no `version > current` failure mode to handle.
- Modify: `src/db/seed.ts` — update the 8 seed reflections to populate the new fields (validation/inferred_meaning/story_reframe) instead of signals/caution.
- Modify: `src/server/edit-wiki.handler.server.ts` — `field` enum updated to `'validation' | 'inferred_meaning' | 'story_reframe'`. **Run `checkPayloadForDiagnosticLanguage` on the incoming `value` before the UPDATE query** (matches the persist-time gate); the gate is not a one-time check at persist boundary but applies at every write boundary.
- Modify: `src/agents/handoff-chain.ts` — `formatCorpusForAgent` body reads new fields; everything else unchanged.

**Approach:**
- Schema is the spine; do this all in one unit so no intermediate state leaves the codebase unbuildable.
- Preserve `raw_output_json` so the ablation harness in U7 can inspect un-edited output even after student edits.
- The `_meta.schema_version` table + drop-and-reseed strategy is documented inline in `db/client.ts` with a comment pointing at the rationale (no production data; demo posture).

**Patterns to follow:**
- `src/agents/connector.ts` for the Agent factory shape.
- `src/agents/handoff-chain.ts` for the `run()` wrapping, output parsing, and persistence ordering.
- `src/lib/safety.ts` `checkPayloadForDiagnosticLanguage` / `checkOutputForDiagnosticLanguage` field iteration.

**Test scenarios:**
- Happy path: `runMirrorOnTranscript('I won my soccer match today and felt proud', 'demo')` (with mocked `run()` via injected `deps.runMirror`) returns parsed `{validation, inferred_meaning, story_reframe}` and `MirrorEntrySchema.parse` accepts it.
- Happy path: `insertMirrorEntry(...)` with the new field shape persists; `listMirrorEntries('demo')` returns rows with the new fields populated.
- Edge case: `editWiki({entryId, field: 'inferred_meaning', value: '...'})` updates only that column; `raw_output_json` stays untouched (Covers AE3, R8).
- Edge case: `editWiki({entryId, field: 'inferred_meaning', value: '<text containing diagnostic language>'})` is rejected by `checkPayloadForDiagnosticLanguage` before the UPDATE query fires (verifies the safety gate is wired at the edit boundary, not just at persist).
- Edge case: stale schema on boot — manually delete the `validation` column from `mirror_entries` (or pre-stage a v1-shaped `app.db`), restart, observe `app.db.bak-<timestamp>` artifacts created and a fresh DB reseeded with 8 entries.
- Error path: empty `validation` field rejected by Zod input schema in `persist-mirror`.
- Integration: `formatCorpusForAgent` over a 3-entry seeded corpus produces a string that contains all three fields per entry, and `runSenseMakingForStudent('demo')` (with injected stub `runConnector`/`runPathfinder`) still completes end-to-end.

**Verification:**
- `pnpm tsc --noEmit` passes (the schema change forces every consumer to update; the type system enforces lock-step).
- Existing tests for handoff-chain still pass after fixture updates.
- A fresh boot deletes any pre-existing `app.db` and reseeds without manual intervention.

---

### U3. Whisper transcription server function

**Goal:** Accept an audio blob from the browser, transcribe via OpenAI Whisper, return the transcript string. Self-contained; no DB writes (the caller persists separately).

**Requirements:** R5, R17

**Dependencies:** None

**Files:**
- Create: `src/server/transcribe-mirror.functions.ts` — `createServerFn` accepting `FormData` (audio blob) and returning `{ transcript: string }`.
- Create: `src/server/transcribe-mirror.handler.server.ts` — Zod input schema (audio file present, < 25 MB Whisper limit), pure handler that calls `openai.audio.transcriptions.create({ file, model: 'whisper-1' })` and returns the transcript. Custom error class `WhisperTranscriptionError`.
- Create: `test/server/transcribe-mirror.test.ts` — handler tests with mocked OpenAI client.

**Approach:**
- TanStack Start `createServerFn` accepts `FormData` (bypasses Zod for the file part; validates the metadata separately). Reference: existing `persist-mirror` for the split shape.
- Whisper accepts `File`-like objects directly via the openai SDK; the server fn passes the FormData file part through.
- Reject if file size > 25 MB **or MIME type ≠ exactly `audio/webm`** (narrow allowlist matching A9, not "any audio type" — narrower allowlist limits the format surface that ffmpeg/Whisper sees in the demo). Magic-byte validation and per-IP rate limiting are deferred to v0.2 multi-tenant hardening; document that deferral in an inline comment in the handler. Surface a typed error the UI can catch.

**Patterns to follow:**
- `src/server/persist-mirror.{functions,handler.server}.ts` for split + custom error + Zod input.
- Existing OpenAI client construction (look in `src/agents/` for the canonical instantiation).

**Test scenarios:**
- Happy path: a 1-second mock audio blob → OpenAI mock returns `{ text: 'I had a good day' }` → handler returns `{ transcript: 'I had a good day' }`.
- Edge case: empty file → `WhisperTranscriptionError` with code `EMPTY_AUDIO`.
- Edge case: file >25 MB → rejected before OpenAI call.
- Error path: OpenAI returns 4xx/5xx → handler raises `WhisperTranscriptionError` with the upstream status code preserved.
- Error path: `OPENAI_API_KEY` missing → typed error, not a hang.

**Verification:**
- Test suite passes.
- A real-browser smoke test (U6) confirms the round-trip with an actual MediaRecorder blob.

---

### U4. Quiet mirror reflection UI

**Goal:** Replace `src/components/MirrorSession.tsx` with a self-directed mirror UI: webcam stream (visual-only, horizontally flipped), MediaRecorder audio capture, 3-second opening-silence detection with single soft prompt, 90-second soft time-box with calm countdown, volume-reactive ring, Stop button. On stop: upload blob to U3, call Mirror agent helper from U2, persist via `persistMirror`, navigate to the new wiki entry.

**Requirements:** R1, R2, R3, R4, R6, R19

**Dependencies:** U2 (Mirror agent helper, persistMirror schema), U3 (transcribe endpoint)

**Files:**
- Create: `src/components/MirrorSession.tsx` (replaces the deleted WebRTC version) — the full reflection ritual UI.
- Modify: `src/routes/reflect.tsx` — re-import the new component; tweak the surrounding layout if needed.
- Create: `test/components/MirrorSession.test.tsx` — component-level tests for state transitions (idle → recording → silenced-prompt → recording → stopped → transcribing → mirroring → persisted).

**Approach:**
- `useEffect` to acquire `getUserMedia({ audio: true, video: true })` on mount; render `<video autoPlay muted srcObject={stream}>` flipped via CSS `transform: scaleX(-1)` (per A8). **After resolution, inspect track-level permission:** if `stream.getAudioTracks().length === 0` or the audio track's `readyState !== 'live'`, enter a **mic-denied** state — webcam mirror still renders, but a non-blocking callout overlays it ("Microphone not available — please allow microphone access and refresh.") and the Stop button is replaced with "Refresh." The mic-denied state is distinct from full getUserMedia rejection; partial-permission must not silently produce empty blobs.
- An `aria-live="assertive"` text indicator ("Recording active") confirms audio capture independent of the volume ring, so deaf/hard-of-hearing students have non-audio confirmation that the session is live. The `<video>` mirror remains the dominant element; the indicator is small and below the mirror.
- A WebAudio `AnalyserNode` over the audio track produces a low-pass-filtered RMS amplitude per animation frame; that amplitude drives the scale of a soft pulsing ring around the mirror frame (per A11). **Reduced-motion accommodation:** under `@media (prefers-reduced-motion: reduce)`, substitute a static border color-shift across 3 discrete amplitude bands instead of scale animation — same calm-feedback intent, no continuous transform.
- Silence detection: at session start, accumulate frames where RMS is below a threshold; at 3 seconds of continuous silence, render a single soft text prompt below the mirror ("Just talk to yourself, naturally."). Latch — no further prompts even if silence resumes. **Prompt fade:** the prompt fades out as soon as the student's RMS crosses the speaking threshold for the first time, OR after 8 seconds (whichever comes first). It does not persist for the full session — the goal is invitation, not instruction-overlay.
- `MediaRecorder` started immediately on mount with `mimeType: 'audio/webm; codecs=opus'`, chunks accumulated in a ref array.
- 90-second soft time-box: a thin countdown arc rendered below the mirror, **hidden until the final 30 seconds**, draining from 100% to 0% opacity. **Color shift only in the final 10 seconds** as a gentle salience increase. Carries `aria-label="Time remaining"` and `aria-live="polite"` so screen-reader users get periodic announcements. At 0, the Stop button auto-clicks (but the student can also press it earlier). Under `prefers-reduced-motion`, replace the draining-arc transition with a static text countdown in the final 10 seconds only.
- On Stop: compose the audio Blob, submit to `transcribeMirror` server fn → call `runMirrorOnTranscript` server fn (declared in U2's Files: `src/server/run-mirror-on-transcript.{functions,handler.server}.ts`) → call `persistMirror` with the result. Show "Transcribing… (Whisper)" then "Reading your reflection… (Mirror agent)" state with an animated ellipsis (or static text under reduced-motion). **20-second timeout on the Mirror agent call:** on timeout, persist the transcript-only entry and navigate to `/wiki/{newEntryId}` where the wiki entry detail's "Reflection pending — Retry" affordance handles re-invocation. **Navigate-away mid-Mirror:** if the component unmounts before Mirror completes, the transcript-only entry should still persist; the wiki entry detail handles the null-fields rendering (see U6).
- All component cleanup in a single effect-cleanup function: stop tracks, close MediaRecorder, disconnect AnalyserNode (this is the only reusable piece from the deleted WebRTC component — the cleanup pattern).

**Execution note:** `MediaRecorder` and AnalyserNode behavior is browser-side only. Component tests use `happy-dom` which lacks full WebAudio; mock `MediaRecorder` and `AnalyserNode` in the test file. The browser smoke test in U6 is the real verification.

**Technical design:** *(directional only)*

```
state machine (zustand-style or useReducer):
  idle ──getUserMedia ok (full)──► recording ──3s silence──► recording-with-prompt
       ──getUserMedia partial (no mic)──► mic-denied
       ──getUserMedia rejected──► permission-denied
                                       └─stop press / 90s elapsed──► stopped
  stopped ──upload──► transcribing ──ok──► mirroring ──ok──► persisting ──ok──► done(navigate)
                                   └─err──► transcribe-error ──retry──► transcribing
                            mirroring ──err / 20s timeout──► mirror-error
                                       └─persist transcript-only, navigate, retry from wiki entry
```

**Patterns to follow:**
- Cleanup ref pattern from the deleted `MirrorSession.tsx` (stop tracks on unmount).
- `ConfirmAndSave.tsx` mutation + invalidation pattern for the persist call.
- `wiki.index.tsx` for `useNavigate()` + `useQueryClient()` invalidation of `['wiki', STUDENT_ID]`.

**Test scenarios:**
- Happy path: getUserMedia mock resolves → component renders mirror; 3s of silence triggers the soft prompt exactly once.
- Edge case: getUserMedia rejects (full permission denied) → component renders a friendly fallback message and a "Try again" button.
- Edge case: getUserMedia partial (camera granted, mic denied) → mic-denied state renders; webcam visible, callout shown, Stop replaced with Refresh; no MediaRecorder upload attempted.
- Edge case: MediaRecorder produces an empty blob (student stopped immediately) → upload is skipped, an explanatory state is shown, no entry is persisted.
- Edge case: 90s elapses while student is still talking → time-box auto-stops; the persisted transcript still includes everything captured before the cutoff.
- Edge case: silence-then-talk-then-silence sequence — soft prompt fires exactly once on opening silence, fades when the student begins speaking, and a subsequent mid-session silence does NOT re-render the prompt. Asserts both halves of AE1.
- **Edge case (AE2 hard verification):** mount MirrorSession with a stub `fetch` that records every request; run through a record → stop sequence; assert (a) no recorded fetch carries a body whose Content-Type starts with `video/`, (b) no `<canvas>` `toBlob` / `toDataURL` was invoked anywhere in the component subtree, and (c) the only network calls during the flow target `transcribeMirror`, `runMirrorOnTranscript`, and `persistMirror` with audio-only or text-only payloads. Converts AE2 from architectural intent into regression-checked behavior.
- Error path: transcribeMirror fails → "transcription failed, retry?" inline; pressing Retry retries the upload without re-recording.
- Error path: Mirror agent fails or 20s timeout → persisted entry has only the transcript; the three reflection fields stay null, navigation lands on `/wiki/<id>` where U6's "Reflection pending — Retry" affordance handles re-invocation. Covers R6 (positive and negative experiences are first-class — failure mode is visible without erasing the recording).
- Integration: state transitions all fire in order; the component never renders an AI prompt or any voice output during the recording phase. Covers AE1.

**Verification:**
- Component tests pass.
- A real-browser smoke test in U6 confirms the full mirror experience including the flipped webcam display and the 3-second silence prompt.

---

### U5. SSE streaming endpoint for the Connector → Pathfinder run

**Goal:** New TanStack Start API route at `/api/sensemake` that runs `runSenseMakingForStudent` with SDK streaming and emits step-level Server-Sent Events. Each event is one JSON-encoded line with a `type` discriminator.

**Requirements:** R9, R11, R12, R13, R16, R17

**Dependencies:** U2 (handoff-chain still wires Connector → Pathfinder; nothing structural to change there)

**Files:**
- Create: `src/agents/run-events.ts` — exported TypeScript type union for step events: `agent_started | tool_call_started | tool_call_completed | partial_output | handoff | agent_completed | run_completed | error`. Each variant carries the relevant fields (agent name, tool name, query, result preview, etc.). Shared between server emitter and U6 client consumer — single source of truth.
- Create: `src/routes/api/sensemake.ts` — TanStack Start API route. Streaming-orchestration logic lives **inline** in this file (no separate `handoff-chain-streamed.ts` module — only one consumer exists, the abstraction does not earn a separate file yet). The route wraps `runSenseMakingForStudent` with the SDK streaming primitive (verified against the installed `@openai/agents` shape at U5 implementation time per A14), emits encoded `data: <json>\n\n` lines for each `RunEvent`, persists Connector + Pathfinder rows after each agent completes, and closes the stream on `run_completed` or `error`. Three operational guards required:
  1. **Allowlist guard:** the handler rejects any request whose `studentId` ≠ `'demo'` with HTTP 403 in v0.1. Documented inline as the demo-only enforcement point that the v0.2 auth roadmap replaces.
  2. **`run_id` correlation + dedup:** generate a server-side `run_id` on first request and emit it as the first event. The handler tracks an in-process map of active `studentId → run_id`; if a new request arrives while a prior run is in flight (e.g., EventSource auto-reconnect after a network blip), the handler either resumes-and-streams-cached-events for the existing `run_id` or rejects the duplicate with a typed error. No double-persistence of Connector + Pathfinder rows under reconnect.
  3. **`AbortController` timeout:** wrap the SDK streaming call in an `AbortController` with a 120s wall-clock ceiling (comfortably above any expected Connector + Pathfinder run). On timeout, emit an `error` event and close the stream — held connections cannot pile up under SDK hangs.
- Create: `test/routes/api/sensemake.test.ts` — test the API route with injected stub agents that emit synthetic events. Cover allowlist-rejection, run_id dedup on reconnect, and timeout-fires-error-then-closes.

**Approach:**
- `Runner.runStream` (or equivalent) emits agent and tool events. We adapt those events to our enum directly inside the API route so the route is the only place SDK shape is touched.
- Tenancy: the API route reads `studentId` from the request body, validates it (Zod), and wraps every DB operation in `withStudent`. The allowlist guard above runs before any tool call — invalid studentId returns 403 without invoking the SDK.
- On error inside the streamed run, emit an `error` event then close the stream gracefully (no thrown exceptions across the SSE boundary).

**Execution note:** Verify the exact SDK streaming API and event-name mapping at implementation time by reading `node_modules/@openai/agents/dist/*.d.ts` (per A14). Plan-time bet is `Runner.runStream`; if the installed version uses a different shape, adapt without changing the public step-event enum.

**Patterns to follow:**
- `src/agents/handoff-chain.ts` for orchestration and persistence ordering.
- TanStack Start API route conventions — see `node_modules/@tanstack/react-start/dist` for the API-route shape if the official docs are ambiguous.

**Test scenarios:**
- Happy path: stub agents emit `[agent_started(connector), tool_call_started(search_corpus), tool_call_completed, agent_completed(connector), handoff, agent_started(pathfinder), agent_completed(pathfinder), run_completed]` → wrapper yields all 8 events in order.
- Edge case: corpus < 3 entries — the wrapper still runs (gating is UI-side per U6), but emits a `partial_output` warning. Note: gating responsibility lives in U6's button-disable logic per R10.
- Error path: Connector throws → wrapper emits `error` with the agent name + message, no Pathfinder events fire, run_completed is replaced by error close.
- Error path: Pathfinder throws → Connector pattern row is still persisted (carrying forward `partial: true` semantics from `handoff-chain.ts`), `error` event emitted, run_completed not emitted.
- Integration: a manual call to `/api/sensemake` from a `curl --no-buffer` consumer receives `data:` lines as expected.

**Verification:**
- Test suite passes.
- `curl -N -X POST http://localhost:3000/api/sensemake -H 'content-type: application/json' -d '{"studentId":"demo"}'` (or the equivalent from the browser smoke test) yields a sequence of `data:` lines that decode to valid `RunEvent` values.

---

### U6. Live agent visualization + manual trigger button + wiki UI updates

**Goal:** Replace the "Run sense-making" button's `tasks.trigger(...)` call with an `EventSource` to `/api/sensemake`, render the live agent run inline in `wiki.index.tsx` via a new `AgentRunVisualizer` component, gate the button until corpus has ≥3 mirror entries, and update `WikiEntryCard` + `wiki.$entryId.tsx` to render the new `{validation, inferred_meaning, story_reframe}` fields with edit-and-confirm.

**Requirements:** R7, R8, R9, R10, R11, R12, R13, R16, R18

**Dependencies:** U2 (new schema + edit handler), **U5 (SSE endpoint AND `run-events.ts` enum — U5 must complete before U6 begins so the enum is verified against the installed SDK shape, not provisional).**

**Files:**
- Create: `src/components/AgentRunVisualizer.tsx` — consumes `RunEvent` stream (passed in via prop, callsite owns the EventSource); renders Connector and Pathfinder as labeled cards with **a static active-agent highlight** (border / background tint keyed by `data-active="true"` — no pulse / breathing animation; matches R18's "the active agent is highlighted" wording, no animation called for), explicit `--- HANDOFF ---` transition line when `handoff` event fires, tool calls show `<tool_name>(<query>) → <result preview>` truncated to ~120 chars. Tool-call rows render with a spinner on `tool_call_started` (replaced with the result on `tool_call_completed`); under `prefers-reduced-motion`, the spinner becomes the text label `running…`. Final state: all events replaced by the existing `ConnectorPatternCard` + `PathfinderTrajectoryCard` + `PathfinderPathwaysCard` reading from the freshly persisted rows.
- Modify: `src/routes/wiki.index.tsx` — replace the existing `triggerSenseMakeNow` button handler with: (1) check corpus length; (2) open `EventSource('/api/sensemake?studentId=demo')` (or POST + ReadableStream variant if EventSource doesn't support POST in the browser — A2 fallback); (3) accumulate events into local state; (4) render `<AgentRunVisualizer events={events}>` inline above the entry list while running. Disable the button with a tooltip ("Add at least 3 reflections to enable sense-making") when corpus < 3. **Retry-on-error:** when an `error` event fires, render an inline error row with a Retry button. On Retry, **clear the accumulated events from local state, close the existing EventSource, and open a new one** — this keeps the visualizer fresh; server-side dedup (U5) handles the duplicate-run risk.
- Modify: `src/routes/wiki.$entryId.tsx` — render the three fields with `ConfirmAndSave` for each (replacing the current caution + summary fields). **Add a "Reflection pending" UI state** for entries where all three fields are null (Mirror agent failed or timed out): render copy like "Your Mirror agent is still thinking — come back in a moment, or retry now." with a "Retry reflection" button that calls `runMirrorOnTranscript` against the entry's transcript and updates the row in place. Also render the `transcript` field (so deaf/HoH students can verify what was captured and so the corpus surface is fully transparent).
- Modify: `src/components/WikiEntryCard.tsx` — render `validation`, `inferred_meaning`, `story_reframe` (replacing the current `signals` + `caution` rendering).
- Create: `test/components/AgentRunVisualizer.test.tsx` — component renders correctly across event sequences.

**Approach:**
- `EventSource` is GET-only; if the SSE endpoint takes parameters, encode them in the query string. (Alternative: use `fetch` with a `ReadableStream` reader — slightly more code but supports POST. Implementing agent picks at U5/U6 boundary; I'm betting GET is fine since the only param is `studentId`.)
- The visualizer is purely presentational; it owns no fetch logic. The route owns the EventSource.
- **Active-agent highlight is a static visual state** (border color shift or background tint) keyed by `data-active="true"` on the agent card. R18 calls for "the active agent is highlighted" — a state, not an animation. No pulse, no breathing.
- The `--- HANDOFF ---` transition is a visually distinct row inserted between Connector and Pathfinder cards when the `handoff` event fires.
- Tool call rows show progressively: when `tool_call_started` fires, render the row with a spinner (or the text `running…` under reduced-motion); when `tool_call_completed` fires, replace it with the result preview.
- On `run_completed`, invalidate `['wiki', STUDENT_ID]` so the freshly persisted Connector + Pathfinder rows render via the existing card components.
- 3-entry gating: `useQuery(['wiki', STUDENT_ID])` already provides the entry list; check `data.entries.filter(e => e.kind === 'mirror').length >= 3` so Connector/Pathfinder rows don't accidentally satisfy the gate. Tooltip text: "Add at least 3 reflections to enable sense-making".

**Patterns to follow:**
- `src/components/ConnectorPatternCard.tsx` and `src/components/PathfinderPathwaysCard.tsx` for card visual idiom.
- `src/components/EditableField.tsx` + `ConfirmAndSave.tsx` for the wiki entry edit affordances.
- The original `triggerSenseMakeNow` call site in `wiki.index.tsx` for the integration point.

**Test scenarios:**
- Happy path: a synthetic event sequence renders Connector card glowing → tool row appearing → handoff transition → Pathfinder card glowing → all events done; matches snapshot.
- Edge case: an `error` event renders an inline error row with a Retry button that reopens the EventSource.
- Edge case: corpus < 3 — button is disabled with a tooltip; clicking does nothing.
- Edge case: tool call result preview is exactly 120 chars and contains a newline — the truncation is graceful.
- Integration: clicking "Run sense-making" with corpus ≥ 3 opens an EventSource and the visualizer mounts within one render. (Covers AE5)
- Edit-and-confirm: editing `inferred_meaning` on a wiki entry persists and the edit doesn't touch `raw_output_json`. (Covers AE3, R8)
- Edit-and-confirm: gating tooltip text matches the requirement ("Add at least 3 reflections to enable sense-making"). (Covers AE4)

**Verification:**
- Test suite passes.
- The browser smoke test in U7 confirms the full live visualization end-to-end with real agent calls.

---

### U7. Tests, ablation harness reshape, README, browser smoke test

**Goal:** Update the ablation harness, refresh the seed corpus, rewrite the README, and run an end-to-end browser smoke test with screenshots for the demo. Final commit-ready state.

**Requirements:** R20, R21, plus all prior R-IDs verified end-to-end

**Dependencies:** U1-U6

**Files:**
- Modify: `test/agents/mirror.test.ts` — reshape for the new `{validation, inferred_meaning, story_reframe}` schema.
- Modify: `test/ablation/mirror-tools-off.test.ts` — Mirror with vs without `searchPastMirrors` tool; same 4-dimension rubric; 8-reflection seed.
- Modify: `test/ablation/cron-tools-off.test.ts` — rename to `test/ablation/sensemake-tools-off.test.ts` (the surface is no longer cron, it's the manual sense-make handoff chain). Connector + Pathfinder with vs without the three-tool surface.
- Modify: `test/ablation/fixtures/seed-corpus.json` — regenerate with the new field shape; same 8 reflections, same emotional spread (positive + negative + ambiguous per R6).
- Modify: `scripts/ablate.ts` — update the `--surface=cron` flag to `--surface=sensemake`.
- Modify: `package.json` scripts — rename `ablate:cron` → `ablate:sensemake`. **Keep `ablate:cron` as a deprecated alias** that prints a one-line "renamed to ablate:sensemake; alias removed in v0.2" warning then invokes the new script. Origin F3 names `pnpm ablate:cron` as the operator command, so a hard rename is a user-visible breaking change for any documented runbook.
- Modify: `README.md` — full rewrite. Demo flow now: open `/`, click Reflect, see yourself in the mirror, talk for ~60-90 seconds, stop, see your three-field reflection in the wiki; with ≥3 entries click "Run sense-making" and watch the live agent chain. Setup unchanged in shape but `TRIGGER_*` env vars removed.
- Modify: `test/db.test.ts`, `test/tenancy.test.ts` — update fixture rows for the new schema (mechanical).
- Modify: `test/agents/handoff-chain.test.ts` — corpus formatter assertions updated for new field shape.

**Approach:**
- Run the full quality gate locally: `pnpm install && pnpm check && pnpm test && pnpm build`.
- **Rubric pilot before full ablation:** the 4-dimension rubric (provenance, specificity, novelty, anti-sycophancy) was tuned for the prior `signals + caution + tags` shape. The new `{validation, inferred_meaning, story_reframe}` fields have different semantics — `validation` is affirming-by-design (specificity may pull against it), `inferred_meaning` is interpretive (provenance dominates), `story_reframe` is narrative (novelty/specificity dominate). Before running the full ablation, score 1–2 sample outputs from the new schema against the rubric to confirm each dimension still discriminates. If any dimension is consistently maxed or zeroed across both ON and OFF conditions, refine to field-specific weights (e.g., score `inferred_meaning` against provenance only) and document the refinement in the ablation report header.
- Use `ce-test-browser` (or equivalent browse tool) to drive the dev server through the demo flow:
  1. Open `/`, navigate to `/reflect`.
  2. Verify webcam mirror is visible (note: in headless browser, `getUserMedia` will need a fake-media flag or mock).
  3. Verify silent state for ~3s, then a soft prompt appears once.
  4. Press Stop, verify navigation to `/wiki/<id>` with three reflection fields populated.
  5. Repeat to seed corpus to ≥3, then click "Run sense-making".
  6. Verify live agent steps render in order: Connector → tool calls → handoff transition → Pathfinder → completion.
  7. Capture screenshots at each step for the demo.

**Execution note:** Browser smoke test mock-friendliness is a real risk for the webcam/audio path. If the headless browser can't grant microphone/camera permissions, fall back to a code-level walkthrough: run the dev server, manually verify in a real browser, capture screenshots, document anything broken in `NEXT-MORNING.md`.

**Patterns to follow:**
- The existing ablation harness shape in `scripts/ablate.ts`.
- The README's existing voice and brevity.

**Test scenarios:**
- Test expectation: the combined test scenarios from U2-U6 plus the ablation reshape are the tests for this unit. The "wow" surface here is the demo flow itself; the verification is the browser walkthrough.

**Verification:**
- `pnpm check && pnpm test && pnpm build` all green.
- `pnpm ablate:mirror` and `pnpm ablate:sensemake` produce reports under `test/ablation/reports/<date>-mirror-ablation.md` and `<date>-sensemake-ablation.md`.
- A browser smoke test (or manual fallback) confirms the demo flow end-to-end.
- Atomic commits are made per unit (one per U-number) on `main` locally. **No push.**
- A `NEXT-MORNING.md` at the repo root summarizes (a) what shipped, (b) what's working in the browser, (c) any critical questions the user should answer when they wake up.

---

## System-Wide Impact

- **Interaction graph:** Reflect path (`/reflect` → `transcribeMirror` → `runMirrorOnTranscript` → `persistMirror` → `/wiki/<id>`) and Sensemake path (`/wiki` → `EventSource('/api/sensemake')` → `handoff-chain-streamed` → `persistConnectorOutput` + `persistPathfinderOutput`) are independent and only share the `mirror_entries` table.
- **Error propagation:** Whisper failures, Mirror agent failures, MediaRecorder failures, and SSE stream failures each propagate as typed errors with retry affordances in the UI. No silent failures.
- **State lifecycle risks:** `MediaRecorder` + WebAudio nodes must be torn down on unmount or the camera light stays on. The cleanup pattern from the deleted MirrorSession (stop tracks on unmount) carries forward.
- **API surface parity:** No external API contracts exist for v0.1 (no auth, no webhook). The internal API route shape (`/api/sensemake`) is new and is documented inline.
- **Integration coverage:** The browser smoke test in U7 is the only integration check that covers the full Reflect path and the full Sensemake path end-to-end; unit tests stop at component or handler level.
- **Unchanged invariants:** `withStudent` tenancy, transcripts-only audio policy, single-vendor OpenAI, edit-and-confirm, FTS5 search, Connector + Pathfinder agent shapes, the per-student wiki scope. The prior brainstorm's Key Decisions on these all still hold.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `Runner.runStream` (or equivalent) doesn't exist in the installed `@openai/agents` ^0.11 — A14 is wrong | U5 verifies SDK shape at implementation time; if streaming isn't supported, fall back to polling: run `runSenseMakingForStudent` synchronously, emit `agent_started`/`agent_completed`/`handoff` events bracketing the call, no intermediate tool events. The visualization still works, just with less granularity. Document the fallback in `NEXT-MORNING.md`. |
| `getUserMedia` permission denied or microphone/camera unavailable in headless browser smoke test | U7 falls back to manual verification in a real browser; `NEXT-MORNING.md` notes whether the smoke test ran headlessly or required manual confirm |
| TanStack Start API-route shape differs from assumed `Response` + `ReadableStream` pattern | U5 verifies at implementation time by reading `node_modules/@tanstack/react-start/dist/*.d.ts`; SSE pattern via `Response` is universal so even if the framework wraps it differently, the shape is portable |
| Whisper SDK call shape (FormData field name) differs from assumed `file` | U3 verifies at implementation time; the openai SDK has been stable on this for years |
| `whisper-1` is deprecated or rejected by the API | Fall back to `gpt-4o-mini-transcribe`; the openai ^6 SDK supports it. Document in `NEXT-MORNING.md` if the swap was needed |
| Schema migration drop-and-reseed loses dev data the user cared about | The user's `app.db` only contains demo data on `student_id = 'demo'`. Risk is acceptable. |
| 90s soft time-box auto-stop happens mid-sentence | Stop button is always available so the student can stop earlier. Auto-stop persists everything captured up to the cutoff (no truncation of the audio blob mid-recording). Per A3, 90s is permissive. |
| `MediaRecorder` produces an empty blob if Stop is pressed within ~50 ms of start | U4 detects empty blobs and shows an explanatory state; no entry persisted |
| EventSource doesn't support POST → can't pass arbitrary input to `/api/sensemake` | Encode `studentId` as a query string param. Only one param needed in v0.1. If the future requires a body, swap to fetch + ReadableStream. |
| Demo browser blocks the microphone/camera prompt and the demo stalls | Pre-grant permissions via Chrome's `chrome://settings/content/siteDetails?site=http://localhost:3000` before the demo. README notes this. |

---

## Documentation / Operational Notes

- README.md fully rewritten in U7. Setup instructions reflect Whisper-only path (no `TRIGGER_*` env vars).
- No production deployment changes — v0.1 stays local-dev only.
- A new `NEXT-MORNING.md` at repo root documents what shipped, what was verified, what is open for the user to confirm when they wake up.
- **OpenAI data-processing chain (PDPA / care-boundary surface).** Audio blobs and Whisper transcripts transit OpenAI's API. The default Whisper API retention is 30 days unless the project is configured for zero-data-retention; verify ZDR eligibility for `audio.transcriptions.create` against the openai ^6 SDK's project-level configuration before any non-developer user accesses the app. Additionally, the TanStack Start / Node multipart parser may buffer the FormData blob to a temp file path; configure the parser for memory-only buffering (or document the disk-buffering behavior + cleanup expectation) so `A10`'s "no raw audio retained" claim holds end-to-end. Until a PDPA-compliant data-processing agreement with OpenAI is in place, this tool is demo-only — v0.1 ships with `student_id = 'demo'` and is not used with real students.

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md`
- **Prior brainstorm (architecture baseline):** `docs/brainstorms/2026-05-08-sensemaking-agents-loop-premise-check.md`
- **Superseded plan (realtime path):** `plans/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md` — already marked completed; this plan supersedes its R5-R8, R14, R15 (realtime), R12, R13 (cron) requirements.
- Related code (anchor patterns):
  - `src/agents/handoff-chain.ts` — Runner orchestration shape
  - `src/agents/connector.ts`, `src/agents/pathfinder.ts` — Agent factory shape
  - `src/server/persist-mirror.{functions,handler.server}.ts` — server-fn split convention
  - `src/components/EditableField.tsx`, `src/components/ConfirmAndSave.tsx` — edit-and-confirm
  - `src/server/tenancy.server.ts` — `withStudent` invariant
- External docs (verified during implementation, not at plan time):
  - OpenAI Agents SDK TS: `@openai/agents` ^0.11 type definitions in `node_modules`
  - OpenAI Whisper API: `openai.audio.transcriptions.create`
  - TanStack Start API routes: framework type definitions

---

## Deferred / Open Questions

### From 2026-05-09 review

- **SSE-via-TanStack-Start-API-route bet was unverified at plan time** — Plan A2 / U5 (P1, feasibility, confidence 75)

  The plan committed to SSE via a `Response` + `ReadableStream` API route as "the standard for this exact pattern" while admitting "no precedent in repo" — never validated against the installed `@tanstack/react-start` API-route export shape at planning time. The shipped implementation fell back to a `createServerFn`-style handler that returns the entire accumulated event log post-hoc; client renders events from `sensemake.data?.events` after the run completes. Result: R12 ("UI streams step-level events") and R13 ("Visualization persistent during run") degrade to post-hoc replay. The demo-wow visualization either replays with synthetic delays or animates instantly, which is a different UX from "live during run." Decision needed: accept post-hoc replay as v0.1 reality and update R12/R13 to match, or restore real streaming (TanStack `createServerFileRoute` or framework-specific export, verified against installed package).

  <!-- dedup-key: section="plan a2  u5" title="ssevia tanstack start api route bet was unverified at plan time" evidence="a new srcroutesapisensemakets returns a response with content type texteventstream and a readablestream body the brows" -->

- **90s auto-stop "Stop button is always available" is not a mitigation for the auto-stop case** — Risks & Dependencies (P1, adversarial, confidence 75)

  By definition the auto-stop fires when the student didn't press Stop. The Risks-table line offers "Stop button is always available so the student can stop earlier" as the mitigation, which is a non-answer for the truncated-mid-sentence failure mode it claims to address. The "non-aggressive countdown" (R19) makes the cutoff less anticipated, not more. The current shape is a soft time-box with a hard cutoff and a soft countdown — the worst of both. Decision: make the time-box truly soft (at 90s, render a "still listening — press Stop when you're ready" affordance and keep recording with a 5-min outer ceiling), or accept the truncation risk explicitly with a 5–10s pre-cutoff salience indicator so students who care can wrap up.

  <!-- dedup-key: section="risks  dependencies" title="90s auto stop stop button is always available is not a mitigation for the auto stop case" evidence="90s soft time-box auto-stop happens mid-sentence stop button is always available so the student can stop earlie" -->

- **TanStack server fns don't accept FormData natively; impl shipped base64-over-JSON** — U3 (P2, feasibility, confidence 75)

  U3 commits `createServerFn accepting FormData (audio blob)` and `bypasses Zod for the file part`. The installed `@tanstack/react-start` server-fn pipeline JSON-serializes inputs and doesn't pass `FormData` through; the shipped handler accepts `{ studentId, audioBase64: string, mimeType: string }` over JSON, so the browser must base64-encode before posting. Two consequences: (a) the request size inflates ~33% so the 25 MB cap should account for it on the client (a 19 MB raw blob already breaches the limit after encoding), (b) the plan-vs-code gap means anyone reading the plan to add a second audio surface gets stale architectural guidance. Decision: update U3 Approach + Files to commit base64-over-JSON as the primary path (or pivot to an actual API route for binary uploads, matching what U5 should have been). The plan-as-spec needs to match shipped reality.

  <!-- dedup-key: section="u3" title="tanstack server fns dont accept formdata natively impl shipped base64 over json" evidence="create srcservertranscribe mirrorfunctionsts createserverfn accepting formdata audio blob and returning trans" -->

- **R10 hard 3-entry gate has no escape hatch for cleared-corpus / demo-reseed / ablation-operator cases** — R10 / U6 (P2, adversarial, confidence 75)

  R10 disables the sense-making button until corpus has ≥3 mirror entries. The gate is binary with no operator override, which fails on three concrete cases: (1) a returning student who deleted their entries to start fresh has 0 entries and is blocked from the very feature that motivated returning; (2) the operator running a demo wants to show the agent chain but the demo machine had its DB drop-and-reseeded by U2 (also part of this plan) — until they hand-author 3 entries the button is dead; (3) an ablation operator wants to test Connector with edge-case corpus shapes. The brainstorm motivation ("Connector's pattern-finding is meaningless on a corpus of 1–2 entries") is about pattern quality, not a strict invariant. Decision: keep the hard gate (and ensure U2's drop-and-reseed populates ≥3 entries by default for demo workflows), or replace the disable with a confirm dialog ("Your corpus has only N entries — patterns may be weak. Run anyway?").

  <!-- dedup-key: section="r10  u6" title="r10 hard 3 entry gate has no escape hatch for cleared corpus  demo reseed  ablation operator cases" evidence="r10 the trigger button is gated it is disabled until the per student corpus has at least 3 mirror entries" -->
