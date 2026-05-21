---
title: "fix: Backend wire hardening and direct OpenAI transcript capture"
type: fix
status: completed
date: 2026-05-19
completed: 2026-05-19
origin: docs/ideation/2026-05-19-backend-wire-hardening-ideation.md
---

# fix: Backend wire hardening and direct OpenAI transcript capture

## Problem Frame

The live Student Space pass showed several product wires that pass static checks but fail or degrade at runtime:

- Growth can blank because `island-state-at` assumes `vips_island_snapshots` exists.
- Review confirmation has no visible failure state and can leave the day detail card looking unchanged.
- Student Space audio falls back to browser live captions while the authoritative OpenAI transcript only arrives inside the later Mirror preparation result.

This plan implements the first hardening slice from the ideation artifact plus the requested transcript-flow change. It is not the full agent dependency ledger or Cartographer quarantine work.

## Requirements Trace

- R1. `island-state-at` must return a typed usable result when the snapshot table is missing, falling back to reconstruction from timeline entries.
- R2. Growth UI must not silently blank on a failed island-state fetch; it should render the summary plus a deliberate fallback island state.
- R3. Day-detail Confirm/Forget must update visible local state from the returned backend row, refresh the server snapshot when possible, and show a user-visible error if the mutation fails.
- R4. Student Space audio capture must call OpenAI transcription directly before Mirror preparation, update the live dialogue transcript immediately after transcription, then prepare Mirror from that transcript instead of sending the audio again.
- R5. Existing Realtime Mirror remains the preferred live path when available; this change hardens the MediaRecorder fallback path.
- R6. Managed-agent output parsing must tolerate fenced JSON and recoverable wrapper text before marking best-effort self-critique as failed.

## Scope

In scope:

- `src/server/island-state-at.handler.server.ts`
- `src/engine/student-space/Game/View/HistorySheet.js`
- `src/engine/student-space/Game/View/DayDetailCard.js`
- `src/lib/student-space/backend-bridge.ts`
- `src/engine/student-space/Game/View/AskSheet.js`
- `src/agents/runner.ts`
- Focused tests under `test/server`, `test/engine`, and `test/lib/student-space`

Out of scope:

- New database migrations or a durable dependency ledger.
- Blocking Cartographer persistence on self-critique warnings.
- Replacing the existing OpenAI Realtime Mirror path.
- Changing the sprout `1/2` badge behavior, which is expected for a first Skills capture because fruit sprouts bloom at two captures.

## Implementation Units

### U1. Growth Snapshot Fallback

Files:

- `src/server/island-state-at.handler.server.ts`
- `test/server/island-state-at.test.ts`

Approach:

- Detect Postgres missing-relation failures from the snapshot query.
- If the snapshot table is missing, continue to timeline reconstruction instead of throwing.
- Keep all other snapshot query failures as real errors.

Test scenarios:

- Missing snapshot table still returns reconstructed trees from timeline rows.
- Missing snapshot table plus no timeline rows returns `source: "empty"`.
- Non-missing snapshot query errors still reject.

### U2. Growth UI Degraded State

Files:

- `src/engine/student-space/Game/View/HistorySheet.js`
- `test/engine/student-space-history.test.ts`

Approach:

- When `island-state-at` fails, render summary anyway and pass an empty degraded state to `_renderIsland`.
- Show a compact source label such as "Island snapshot unavailable" instead of leaving the panel blank.

Test scenarios:

- Summary success plus island-state failure renders summary copy and source label.
- Full success still renders snapshot or reconstructed source labels.

### U3. Review Mutation Feedback

Files:

- `src/engine/student-space/Game/View/DayDetailCard.js`
- `test/engine/student-space-calendar.test.ts`

Approach:

- Disable the clicked review buttons while the mutation is in flight.
- Patch local capture state immediately from the returned backend row.
- Refresh the backend snapshot afterward when available.
- Render a row-level error message when the mutation fails.

Test scenarios:

- Confirm patches review status to `confirmed` and removes Confirm/Forget actions.
- Failed Confirm leaves actions available and shows the error text.

### U4. Direct OpenAI Transcript For MediaRecorder Audio

Files:

- `src/lib/student-space/backend-bridge.ts`
- `src/engine/student-space/Game/View/AskSheet.js`
- `test/lib/student-space/backend-bridge.test.ts`
- `test/engine/student-space-ask-audio.test.ts`

Approach:

- Add a backend bridge method that wraps `transcribeMirror`.
- In `AskSheet._prepareMirrorDraft`, when an audio blob exists and the bridge exposes transcription, call it first.
- Update `recCommitted`, `reviewTextEl`, and the live dialogue with the OpenAI transcript immediately after transcription returns.
- Call `prepareReflection` with `transcript` rather than `audioBase64`.
- Fall back to the old audio-to-prepare path if the bridge lacks direct transcription.

Test scenarios:

- MediaRecorder audio path calls direct transcription, paints the transcript into the live dialogue, and prepares Mirror from text.
- Fallback path still sends audio to `prepareReflection` when no direct transcription bridge exists.
- Backend bridge maps the transcription server function result without leaking audio into persistence.

### U5. Managed-Agent JSON Extraction

Files:

- `src/agents/runner.ts`
- `test/agents/managed-mirror.test.ts`

Approach:

- Try multiple JSON candidates from agent text: full text, fenced block, and first-brace-to-last-brace object.
- Keep schema validation unchanged.

Test scenarios:

- Closed fenced JSON still parses.
- JSON inside wrapper text or an unclosed fence parses from the object body.
- Non-JSON still throws `PARSE_ERROR`.

## Sequencing

1. Implement U1 and U2 so Growth stops blanking.
2. Implement U3 so review mutations become observable.
3. Implement U4 so capture transcript state is immediate and OpenAI-authored.
4. Implement U5 to reduce false self-critique parse failures.
5. Run targeted tests, then `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check`.

## Completion Notes

Completed the scoped hardening slice:

- Growth falls back when `vips_island_snapshots` is missing and the UI renders summary content plus an explicit unavailable/reconstructed/snapshot source label.
- Day-detail review mutations now show in-flight state, patch returned backend rows locally, refresh snapshots best-effort, and render row-level errors.
- MediaRecorder capture now calls OpenAI transcription directly before Mirror preparation, updates the live dialogue state with the transcript, and prepares Mirror from text.
- Managed-agent parsing now tries full text, fenced text, and first-object candidates before returning `PARSE_ERROR`.

Verification:

- Focused hardening suite passed during implementation.
- `pnpm check` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `git diff --check` passed.
- Computer Use smoke verified Growth renders the degraded island state instead of blanking.
- Follow-up gap check added normal Growth source-label coverage in `test/engine/student-space-history.test.ts`; the focused test now passes with three scenarios.

Still out of scope for this plan:

- Durable dependency ledger for memory/eval failures.
- Cartographer quarantine for self-critique safety/taxonomy warnings.
- Full runtime contract smoke matrix.
