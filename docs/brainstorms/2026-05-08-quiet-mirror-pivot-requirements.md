---
date: 2026-05-08
topic: quiet-mirror-pivot
---

# Quiet Mirror Pivot — Sensemaking Agents v0.1

## Summary

v0.1 becomes a self-directed mirror reflection ritual: webcam-as-mirror plus Whisper transcription, no AI interlocutor during the session, async Mirror agent that reflects back as `validate / infer-meaning / story-reframe` at session end. Connector and Pathfinder fire only on a manual button with live step-by-step visualization of the handoff chain. Trigger.dev cron is deferred to v0.2+.

---

## Problem Frame

The original v0.1 (`docs/brainstorms/2026-05-08-sensemaking-agents-loop-premise-check.md`) shipped Mirror as a `gpt-realtime-2` voice agent. Local testing surfaced a clear failure mode: the turn-taking AI made the student feel **interviewed**, which broke the reflective state. The agent's voice introduced performance pressure exactly where stillness was the point.

The deeper observation: most Singapore secondary students don't express what they feel — to anyone. A small fraction confide in a closest friend; the rest suppress. This is symmetric across positive and negative experience: a soccer win, a math result that surprised them, a parent fight all dissolve unprocessed. The wiki is empty by default not because the system fails to capture, but because **expression itself doesn't happen**. The threat to this product isn't another app — it's silence.

A daily-habit framing reintroduces the very pressure we're trying to remove ("another homework"). The product needs to be ambient and uncommitted: always available, never demanded. The "stuck on queue" experience with Trigger.dev surfaced a related point — operational complexity that doesn't pay for itself in v0.1 should leave.

---

## Actors

- A1. **Student**: Singapore secondary school student facing ECG decisions. Opens the app when they feel like thinking out loud. Talks to the mirror; reads the agent's reflection later; optionally triggers sense-making across their corpus.
- A2. **Mirror agent**: Async post-session agent. Receives a transcript and produces `{validation, inferred_meaning, story_reframe}` for the wiki entry. Never speaks during the session.
- A3. **Connector agent**: Manual-fire agent that re-reads the per-student wiki and surfaces patterns with evidence IDs. Backward-looking, corpus-grounded.
- A4. **Pathfinder agent**: Manual-fire agent that receives Connector's patterns via Handoff and produces `{trajectory, pathways}` with SG-ECG mapping.
- A5. **Operator (demo)**: Person running the demo. May press the manual sense-making trigger to showcase the agent chain. In production this is the student.

---

## Key Flows

- F1. **Quiet reflection capture**
  - **Trigger:** Student opens the app and clicks Reflect.
  - **Actors:** A1, A2
  - **Steps:** (1) Webcam stream renders as the mirror surface. UI is silent. (2) If the student stays quiet ~3 seconds, one soft text prompt appears: "Just talk to yourself, naturally." After the first soft prompt the UI stays silent for the rest of the session. (3) Audio is captured locally; volume reactivity and a session timer are ambient cues only. (4) Student presses Stop, or the soft time-box elapses. (5) Audio is sent to Whisper; the transcript and Mirror agent's `{validation, inferred_meaning, story_reframe}` are written to the wiki.
  - **Outcome:** A new mirror entry exists in the per-student corpus. The student sees the validation + inferred meaning + story reframe and may edit any field.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R8

- F2. **Manual sense-making with live visualization**
  - **Trigger:** Student or operator presses "Run sense-making" in the wiki view. Button is disabled until the corpus has at least 3 mirror entries.
  - **Actors:** A1 / A5, A3, A4
  - **Steps:** (1) The wiki view enters a live run mode. (2) Connector starts; the UI streams its step events (started, tool calls, partial output). (3) Connector finishes; Handoff to Pathfinder is rendered as an explicit visual transition. (4) Pathfinder runs with Connector's patterns as input; its steps stream similarly. (5) Final `ConnectorPatternCard` and `PathfinderTrajectoryCard / PathfinderPathwaysCard` render in the wiki when each agent completes. The run can be re-triggered.
  - **Outcome:** The wiki has fresh Connector patterns and Pathfinder trajectory + pathways. The agent chain was visible to the operator and the student throughout.
  - **Covered by:** R7, R9, R10, R11, R12, R13

- F3. **Falsifiable ablation (validation gate)**
  - **Trigger:** Operator runs `pnpm ablate:mirror` or `pnpm ablate:cron` against the seed corpus.
  - **Actors:** A5
  - **Steps:** (1) Run Mirror's tool surface (corpus search) ON vs OFF; record outputs. (2) Run Connector + Pathfinder full tool surface ON vs OFF; record outputs. (3) Score per dimension; produce a per-surface decision.
  - **Outcome:** A documented decision per tool surface — keep, drop, or narrow — informing v0.2.
  - **Covered by:** R20, R21

---

## Requirements

**Reflection ritual**
- R1. Mirror sessions are **self-directed and time-boxed**. The student sees their own webcam stream as the mirror. There is no AI voice during the session. The agent never speaks while the student is talking.
- R2. The session opens silent. After ~3 seconds of silence at the start, a single soft text prompt appears once: "Just talk to yourself, naturally." After that the UI stays silent for the remainder of the session.
- R3. The session has a soft time-box (default ~60-90 seconds) and an always-available Stop button. The student controls when the session ends.
- R4. The webcam is **visual-only**. The video stream is rendered locally for the student. Frames are not sent to any AI service and no still photos are captured or stored in v0.1.

**Capture and transcription**
- R5. Audio is captured in-browser with `MediaRecorder`. On stop the audio blob is sent to a server function and transcribed with **OpenAI Whisper**. The audio blob is discarded after transcription succeeds; only the transcript is persisted.
- R6. **Both positive and negative experiences are first-class.** Mirror's prompt scaffolding and the agent's `validation` output do not assume distress. A soccer win and a parent fight are equally valid reflection contents.

**Mirror agent**
- R7. The Mirror agent runs **async** at session end against the transcript. It produces three fields per session: `validation` (acknowledges the feeling), `inferred_meaning` (a candidate articulation of what the student may have meant, since they may not have words), and `story_reframe` (a short narrative retelling). The wiki entry shows all three.
- R8. The student can edit `validation`, `inferred_meaning`, and `story_reframe` via the existing edit-and-confirm primitives. Edits persist; the original Mirror agent output is not overwritten in storage so the ablation can still inspect un-edited output.

**Manual sense-making**
- R9. Connector and Pathfinder fire **only when the user presses a manual trigger** in the wiki UI. They do not run on cron, on save, or on any background schedule in v0.1.
- R10. The trigger button is **gated**: it is disabled until the per-student corpus has at least 3 mirror entries.
- R11. Connector → Pathfinder runs as a single SDK `Handoff` chain in one call. Connector's structured patterns are passed to Pathfinder as input.
- R12. The UI **streams live agent steps** during a sense-making run: agent started, tool call started, tool call finished, partial output, agent completed, handoff occurred. Granularity is step-level, not token-level.
- R13. The visualization is **persistent in the wiki view** while the run is active and reverts to the standard cards layout when the run completes. A failed step renders the error inline; the run can be retried.

**Architecture cleanup**
- R14. `gpt-realtime-2`, the WebRTC client, and OpenAI Agents SDK voice paths are **removed** from v0.1. The realtime token-mint server function is deleted along with the WebRTC client component.
- R15. The Trigger.dev v3 cron task and the per-student schedule onboarding are **deferred to v0.2+**. The `trigger/sense-make.ts` task and `schedule-onboard.*` server functions are removed from v0.1.
- R16. The "Run sense-making now" button in the wiki view replaces its current `tasks.trigger(...)` call with a direct in-process call that streams agent events back to the UI.
- R17. Per-student tenancy (`student_id` + `withStudent`), transcripts-only audio policy, single-vendor OpenAI, and FTS5 corpus search all carry forward unchanged from the prior brainstorm.

**Demo wow factor**
- R18. The wiki view's live agent visualization is **demo-grade**: each step appears with a clear label, the active agent is highlighted, the handoff transition is visually explicit, and tool calls show their query and result preview as they occur.
- R19. The mirror UI provides ambient feedback during capture: subtle volume reactivity (a calm visual that responds to voice amplitude) and a non-aggressive countdown for the soft time-box. No tally, no score, no streak.

**Validation gate**
- R20. The premise check from the prior brainstorm carries forward, reshaped: an ablation runs over the new Mirror agent surface (with vs without corpus search of past mirrors) and over the manual Connector + Pathfinder surface (with vs without the three-tool surface). Both run independently.
- R21. Ablation reports land under `test/ablation/reports/`. The v0.1 evaluation bar (1-2 humans score 0-3 per dimension across provenance, specificity, novelty, anti-sycophancy; ON beats OFF by ≥2 points across ≥3 dimensions to "pass") carries forward unchanged.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a student opens the reflect view and stays silent for 3 seconds, when no further audio is detected, then exactly one soft text prompt appears in-UI; subsequent silences during the session do not trigger additional prompts.
- AE2. **Covers R4.** Given the reflect view is active with the webcam stream visible, when the student talks for the full session, then no video frame is uploaded to any external service and no still photo is written to storage.
- AE3. **Covers R7, R8.** Given a session ends and the transcript is persisted, when the Mirror agent completes, then the wiki entry has three editable fields (`validation`, `inferred_meaning`, `story_reframe`) and the un-edited agent output is still accessible for the ablation harness.
- AE4. **Covers R9, R10.** Given the per-student corpus has fewer than 3 mirror entries, when the wiki view renders, then the "Run sense-making" button is visible but disabled with a tooltip explaining the threshold.
- AE5. **Covers R11, R12, R13.** Given the user presses "Run sense-making" with ≥3 mirror entries, when the Connector → Pathfinder handoff chain executes, then the wiki view shows step-by-step agent events as they occur, the handoff transition is visually distinct, and final pattern + pathways cards render when each agent completes.
- AE6. **Covers R14, R15.** Given the v0.1 build is checked out and `pnpm check && pnpm test` runs, then no source file imports the OpenAI Realtime API, no WebRTC code remains, no Trigger.dev task is registered, and no test references `gpt-realtime-2`.

---

## Success Criteria

- A Singapore secondary student can open the app, see themselves in the mirror, talk for ~60 seconds without an AI interrupting, stop, and read back a `validation / inferred_meaning / story_reframe` triple that feels like it heard them — not interviewed them.
- The "Run sense-making" button produces a visible, demo-grade live agent chain that takes a corpus from cold to fresh patterns + pathways within a single button press, with no queue, no cron, no operational state to debug.
- A new contributor can read this doc plus the prior `loop-premise-check` brainstorm and identify exactly which decisions are superseded without re-reading the conversation that produced this doc.
- Implementation choices (silence-detection threshold tuning, exact visualization styling, Whisper model variant, Mirror prompt wording) are explicitly the planner's job, not this doc's.

---

## Scope Boundaries

- `gpt-realtime-2` / WebRTC voice path / OpenAI Agents SDK voice agent shape — fully removed
- Trigger.dev v3 cron infrastructure — deferred to v0.2+; the `trigger/` directory and schedule-onboard server functions are removed in v0.1
- Auto-running Connector + Pathfinder on save — explicitly rejected; manual trigger only
- Daily-habit framing, streaks, push notifications, "due today" UI — explicitly anti-pattern under the no-commitment frame
- Video frames sent to AI; still-photo capture; portrait-tracking-over-time — out for v0.1 (possible v0.2 with explicit consent flow)
- TTS / voice playback of Mirror's reflection — out for v0.1
- Coach agent and `next_experiment` output — stay removed (per prior brainstorm)
- Auth, multi-tenant infra beyond `student_id` row scoping — unchanged; v0.1 stays demo-only with `student_id = 'demo'`
- Cross-student inference — unchanged from prior brainstorm
- The "one careful question" Mirror schema — removed; replaced by `{validation, inferred_meaning, story_reframe}`
- Token-level streaming of agent reasoning — out; step-level events only
- Mid-session silence-break prompts beyond the initial 3-second one — out (would re-introduce interview pressure)

---

## Key Decisions

- **No AI voice during the session, ever.** Rationale: local testing with `gpt-realtime-2` produced an "interviewed" feeling that broke reflection. A live AI voice in this ritual is the failure mode, not the feature. Async-only is non-negotiable.
- **Mirror's output schema becomes `{validation, inferred_meaning, story_reframe}`.** Rationale: students often lack words for what they feel. Validation acknowledges the experience; inferred meaning offers candidate articulations the student can confirm or correct; story reframe gives the experience narrative shape. The original "one careful question" pattern re-introduces homework feeling.
- **Manual sense-making trigger replaces cron.** Rationale: Trigger.dev's value is fan-out and scheduling, neither of which v0.1 needs. The "stuck on queue" failure mode revealed real operational drag. A manual button with live step streaming is simpler, more demoable, and gives the student agency over when patterns get computed.
- **Live step-level visualization is the demo wow factor.** Rationale: showing Connector → Pathfinder's intermediate steps (tool calls, partial outputs, the explicit handoff transition) makes the multi-agent orchestration visible and visceral. Token-level streaming would be too noisy at demo distance; step-level is legible and meaningful.
- **3-entry gating on the sense-making button.** Rationale: Connector's pattern-finding is meaningless on a corpus of 1-2 entries. Disabling the button below threshold prevents disappointing first-runs and signals the longitudinal nature of the value.
- **Webcam is visual-only.** Rationale: the mirror metaphor is for the student's own eyes — that's what makes self-talk feel possible. Sending video to AI or saving frames adds PDPA surface and detection-y feel for zero v0.1 product gain.
- **Anti-streak, anti-habit, anti-daily-prompt.** Rationale: the threat to this product is silence, not retention. Treating reflection like a habit re-introduces homework pressure exactly where the win is "always available, never demanded."

---

## Dependencies / Assumptions

- Assumes OpenAI Whisper API latency at the chosen model variant is fast enough for a 60-90 second clip to transcribe in under ~5 seconds end-to-end. Acceptable UX shows a "transcribing…" state during the wait.
- Assumes the OpenAI Agents SDK exposes step-level run events suitable for streaming to the UI (e.g., `Runner.runStreamed` or equivalent). Verified by `ce-plan` against the SDK's TS docs before implementation.
- Assumes `MediaRecorder` + `getUserMedia` work in the demo browser (Chrome/Safari current). No Safari-specific shim work in v0.1.
- Assumes the ablation harness's existing seed corpus (8 reflections, ~30 ECG entries) is still the right v0.1 evaluation surface; reshaping is mechanical (new Mirror schema; same scoring rubric).
- Assumes per-student SQLite remains the v0.1 storage layer; no Postgres migration in this scope.

---

## Outstanding Questions

### Resolve Before Planning

*(none — all open product questions surfaced in the brainstorm were resolved into Stated decisions or explicit Out-of-Scope items.)*

### Deferred to Planning

- [Affects R5][Technical] Whisper model variant and request shape (`whisper-1` vs `gpt-4o-transcribe` vs `gpt-4o-mini-transcribe`); `multipart/form-data` upload path from the browser to the server function.
- [Affects R7][Needs research] Mirror agent prompt wording for the three-part output. Voice and tone discipline (validation must not be sycophantic; inferred_meaning must be a candidate not a verdict; story_reframe must avoid clinical framing).
- [Affects R12, R13][Technical] Streaming transport from server function to browser (Server-Sent Events vs `ReadableStream` vs custom WebSocket). TanStack Start's preferred shape for streaming server functions.
- [Affects R12][Technical] Mapping OpenAI Agents SDK `Runner` events to UI step types. What counts as a "step" the user sees vs what stays internal.
- [Affects R3][Technical] Soft time-box exact value (60s vs 90s vs adaptive); silence-detection threshold (3 seconds is the brainstorm default; tuning is a planning concern).
- [Affects R15][Technical] Migration path for the existing `trigger/` directory and `schedule-onboard.*` server functions — straight delete vs feature flag. Probably straight delete.
- [Affects R20, R21][Technical] Reshape `test/ablation/mirror-tools-off.test.ts` and `test/ablation/cron-tools-off.test.ts` to the new Mirror schema and the manual-trigger Connector + Pathfinder surface.
- [Affects R18, R19][Needs research] Visualization styling — what does a calm-but-demo-grade live agent chain look like? Reference patterns to consider.
