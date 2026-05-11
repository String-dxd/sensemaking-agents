# Sensemaking Agents — v0.1 (Quiet Mirror Pivot)

Three OpenAI agents over a per-student SQLite wiki, structured around a quiet self-directed reflection ritual.

- **Mirror** (`gpt-5.5`, async) — runs after the student stops talking. Reads the transcript, returns a three-part reflection: `validation`, `inferred_meaning`, `story_reframe`. No AI voice during the session.
- **Connector** (`gpt-5.5`, manual button) — re-reads the per-student wiki and surfaces patterns with evidence IDs.
- **Pathfinder** (`gpt-5.5`, manual button) — receives Connector's patterns via SDK Handoff, returns trajectory + 2–5 pathways with SG-ECG mapping.

All three agents read their model id from `src/agents/config.ts`. Set `AGENT_MODEL=<id>` in the env to override (e.g. `AGENT_MODEL=gpt-4.1 pnpm ablate:mirror` to score the prior baseline). The ablate script also accepts `--model=<id>` as an inline shortcut.

The reflect path is browser → MediaRecorder → OpenAI Whisper → Mirror agent. The sense-making path is a single in-process Connector → Pathfinder Handoff chain with **live step-event visualization** in the wiki view.

SQLite + FTS5 with a single tenancy boundary (`withStudent`); v0.1 has no auth — `student_id` defaults to `'demo'`.

## What changed in this pivot

The realtime `gpt-realtime-2` Mirror was replaced with the quiet ritual after local testing made the turn-taking voice agent feel like an interview rather than reflection. Trigger.dev cron was deleted from v0.1 — sense-making is now a manual button with a live agent-step visualization that doubles as the demo wow surface.

See `docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md` for the full pivot rationale and `plans/2026-05-08-002-feat-quiet-mirror-pivot-plan.md` for the unit-by-unit implementation plan.

## Setup

Requires Node 20+, pnpm, and an OpenAI key.

```bash
pnpm install
cp .env.example .env   # fill in OPENAI_API_KEY
pnpm seed              # populate app.db with 8 reflections
pnpm dev               # vite dev server on http://localhost:3000
```

If you see a schema mismatch warning on boot, that's the v0.1 → v0.2 schema reshape: the demo db is dropped and recreated automatically (no production data exists in v0.1).

## Demo flow

1. `/` — landing.
2. `/reflect` — click into the mirror. Allow camera + microphone. Look at yourself in the mirror, talk for ~60–90 seconds. The session is silent unless you stay quiet for the first 3 seconds, in which case one soft prompt appears: "Just talk to yourself, naturally."
3. Press **Stop and reflect**. Whisper transcribes; Mirror agent reflects back as `validation` + `inferred_meaning` + `story_reframe`. You land on `/wiki/<id>` with all three fields editable.
4. Repeat until your wiki has at least 3 reflections.
5. `/wiki` — press **Run sense-making**. Watch the live agent chain:
   - Connector lights up, calls `search_past_mirrors`, surfaces patterns.
   - Explicit `↳ handoff to pathfinder` transition row.
   - Pathfinder lights up, calls `lookup_ecg_taxonomy`, returns trajectory + pathways.
   - Final `ConnectorPatternCard`, `PathfinderTrajectoryCard`, `PathfinderPathwaysCard` render below.

Pre-grant camera/microphone permissions for `localhost:3000` before the demo so the prompt doesn't break the flow.

## Quality gates

```bash
pnpm check     # biome lint + tsc --noEmit
pnpm test      # vitest run
pnpm build     # production build
```

## Ablation

Per the prior brainstorm's premise check, two independent ablations on the fixed 8-reflection seed corpus:

```bash
pnpm ablate:mirror     # corpus search ON vs OFF for Mirror
pnpm ablate:sensemake  # full 3-tool surface ON vs OFF for Connector + Pathfinder
```

Reports land under `test/ablation/reports/`. v0.1 bar: 1–2 humans score 0–3 per dimension across (provenance, specificity, novelty, anti-sycophancy); ON beats OFF by ≥2 points across ≥3 dimensions to "pass."

## Layout

```
src/
  routes/         # TanStack Router file-based routes
  server/         # *.functions.ts — TanStack Start server fns
  agents/         # Mirror, Connector, Pathfinder + tools + handoff chain (sync + streamed)
  db/             # better-sqlite3 schema + queries + seed
  data/           # ecg-taxonomy.ts (~30 hand-curated SG entries)
  components/     # MirrorSession, AgentRunVisualizer, WikiEntryCard, primitives
test/             # vitest specs incl. test/ablation/
```

## License

MIT — see [LICENSE](LICENSE).
