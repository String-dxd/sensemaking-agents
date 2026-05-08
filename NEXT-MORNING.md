# Quiet Mirror Pivot — Status for tomorrow morning

Reza — overnight summary. Read top to bottom; everything below the first heading is for context.

## TL;DR

Pivot from realtime `gpt-realtime-2` voice Mirror to a self-directed quiet reflection ritual is **shipped to local `main`** in 7 atomic commits (U1–U6 implementation + U7 wrap-up). Trigger.dev cron is gone. Sense-making is now a manual button with a live agent-step visualization that doubles as the demo wow surface.

**Quality gate:** `pnpm check && pnpm test && pnpm build` all green; **64 tests pass**, production build succeeds.

**Not pushed.** `main` is 22 commits ahead of `origin/main`. Run `git push origin main` when you're ready.

## Two things you must do before the demo

1. **Set `OPENAI_API_KEY`** in `.env`. (Trigger.dev env vars can stay or go — they're unused now.)
2. **Pre-grant browser permissions** for `localhost:3000`: camera + microphone. Otherwise the prompt will break the demo flow on first session.

## What works (verified)

- **Dev server boots cleanly.** `pnpm dev` → curl probe of `/`, `/wiki`, `/reflect` returns HTTP 200 on all three.
- **Production build succeeds.** `pnpm build` produces `.output/` artifacts; nothing dangling from the deletions.
- **Typecheck clean.** `pnpm check` passes (one informational note about a template-literal style nit in `test/ablation/score.ts:60` — pre-existing, not introduced by the pivot).
- **All tests pass (64).** New surfaces covered:
  - `test/server/transcribe-mirror.test.ts` (5 tests, mocked OpenAI client)
  - `test/agents/handoff-chain-streamed.test.ts` (3 tests, stub agents)
  - `test/components/AgentRunVisualizer.test.tsx` (5 tests, render + active-state + handoff transition + error)
  - `test/agents/mirror.test.ts` rewritten for the new schema; the deleted realtime-event-router suite is gone.
- **Schema migration is automatic.** The first time you run `pnpm dev` after pulling, the `_meta.schema_version` mismatch detector drops `app.db` and the seed regenerates with the new shape. You'll see a `[db] schema_version mismatch on ...` warning once on boot — that's expected.

## What is NOT verified end-to-end (manual smoke test still pending)

Because the in-browser smoke test needs a real `OPENAI_API_KEY` plus camera/mic permissions, I did not run a live end-to-end pass. Specifically un-verified:

- **Whisper round trip.** The handler is mocked-tested. Real-world: the `audio/webm; codecs=opus` MIME type from `MediaRecorder` should be accepted by Whisper via the OpenAI SDK's `toFile` helper, but I haven't confirmed against a live API call.
- **`@openai/agents` streaming event mapping.** The streaming wrapper at `src/agents/handoff-chain-streamed.ts` runs `run(agent, input, { stream: true })` and iterates `StreamedRunResult`. The defensive `mapSdkEventToStep` reads SDK event fields by name, but I haven't confirmed the exact field shapes against a live run. **If tool call previews come up empty in the demo, the field-reading needs an adjustment in `mapSdkEventToStep`.** The agent_started / handoff / agent_completed / run_completed events are emitted by the orchestrator directly and will work regardless.
- **Visualizer playback timing.** Replay floor is 220ms, ceiling 1100ms. If a real run produces too many tool events to follow, bump `MIN_GAP_MS` in `src/components/AgentRunVisualizer.tsx`.
- **Camera mirror flip orientation.** I applied `transform: scaleX(-1)` in `MirrorSession.tsx` so the student sees themselves the way a real mirror would. If anything looks off, flip the sign.
- **3-second silence threshold.** The RMS threshold (`SILENCE_RMS_THRESHOLD = 0.012`) was a reasonable guess for a typical laptop mic. If the soft prompt fires too eagerly or never fires, retune.

## What's deferred to after the demo

- **Component test for `MirrorSession`.** happy-dom's lack of full WebAudio support made the test mock-heavy and brittle. Skipped per the plan's Execution note. Browser smoke test will catch regressions for now.
- **Token-level agent streaming.** Step-level only by design (R12). If you want tighter streaming later, swap the synchronous server fn for an SSE API route.
- **Re-deepening the ablation rubric.** The rubric carries forward from the prior brainstorm unchanged; reshape if the new Mirror schema (`validation`, `inferred_meaning`, `story_reframe`) demands different scoring axes.
- **`.env.example` cleanup.** I couldn't read the dotfile via tooling on this run (denied by permissions). The `TRIGGER_*` env vars are now unused — strip them when you're in the file.

## How to verify the demo end-to-end (manual checklist)

1. `pnpm install && pnpm seed && pnpm dev`
2. Open `http://localhost:3000/reflect`. Allow camera + microphone.
3. Confirm: webcam mirror appears, flipped, with a soft pulsing ring.
4. Stay quiet ~3 seconds. The single soft prompt should appear once. Then talk for 30–60 seconds about anything (good or bad — both are first-class).
5. Press **Stop and reflect**. Wait ~5–15s for transcribe → reflect → persist. You should land on `/wiki/<id>`.
6. Confirm the wiki entry shows three editable fields: validation, inferred_meaning, story_reframe. Try editing one and Confirm — it should persist and the edit should not blow away `raw_output_json` (the un-edited output).
7. Repeat steps 2–5 until your wiki has at least 3 reflections. (Or seed gives you 8 already; just open `/wiki` directly.)
8. From `/wiki`: press **Run sense-making**. Watch the live agent chain animate. Confirm:
   - Connector card glows ("thinking…"), then logs `search_past_mirrors` tool calls with the query and a result preview.
   - `↳ handoff to pathfinder` row appears.
   - Pathfinder card glows, logs its tool calls.
   - "run complete" line appears, then ConnectorPatternCard / PathfinderTrajectoryCard / PathfinderPathwaysCard render below.

If anything breaks: the most likely culprit is the SDK event-name mapping in `src/agents/handoff-chain-streamed.ts`. Worst case, the orchestrator events (started/handoff/completed) will still render — you just won't see the tool-call rows.

## Commits landed (on local `main`, not pushed)

```
6dcbe07  feat(u6): live agent visualization + manual sense-making button + 3-entry gate
        # Above this commit U7 also lands (this NEXT-MORNING.md and the AgentRunVisualizer test)
        # Top-of-tree commit message will be feat(u7): tests + README + smoke baseline
        # The plan said atomic-per-unit; U7 is a single commit.
[u5]   feat(u5): step-event streaming for Connector → Pathfinder
[u4]   feat(u4): quiet mirror reflection UI (webcam + Whisper + Mirror agent)
[u3]   feat(u3): Whisper transcription server function
[u2]   feat(u2): reshape Mirror to {validation, inferred_meaning, story_reframe}
[u1]   chore(u1): remove realtime voice + Trigger.dev surfaces
[plan] (the requirements doc + plan landed in the U1 commit body)
```

If you want a clean revert, the pre-pivot SHA is `f8313d3` (the merge from `feat/v0.1-sensemaking-agents`). Run `git reset --hard f8313d3` while on `main` to undo the entire pivot.

## Where the docs are

- `docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md` — the requirements that drove this pivot (locked product decisions, Out-of-Scope items, Acceptance Examples).
- `plans/2026-05-08-002-feat-quiet-mirror-pivot-plan.md` — unit-by-unit implementation plan with test scenarios, dependencies, risks. The `## Assumptions` section lists 14 un-validated bets I made (Whisper variant, time-box, silence threshold, etc.) that are worth a pass.
- `README.md` — fully rewritten for the new flow.
- `docs/brainstorms/2026-05-08-sensemaking-agents-loop-premise-check.md` — the prior brainstorm; per-student tenancy, ablation gate, and OpenAI single-vendor decision still hold.

— Sleep tight. Demo should sing.
