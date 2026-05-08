# Sensemaking Agents — v0.1

Three OpenAI agents over a per-student SQLite wiki.

- **Mirror** (`gpt-realtime-2`, voice in browser) — listens, surfaces signals, asks one careful question.
- **Connector** (`gpt-4.1`, nightly) — rereads the wiki, surfaces patterns with evidence IDs.
- **Pathfinder** (`gpt-4.1`, nightly) — receives Connector's patterns via SDK Handoff, returns trajectory + 2–5 pathways.

Voice is direct browser → OpenAI Realtime via WebRTC; cron is Trigger.dev v3.
SQLite + FTS5 with a single tenancy boundary (`withStudent`); v0.1 has no auth — `student_id` defaults to `'demo'`.

## Setup

Requires Node 20+, pnpm, and an OpenAI key.

```bash
pnpm install
cp .env.example .env   # fill in OPENAI_API_KEY (TRIGGER_* needed for U8)
pnpm seed              # populate app.db with 8 reflections + ~30 ECG entries
pnpm dev               # vite dev server on http://localhost:3000
```

## Demo flow

1. `/` — landing.
2. `/reflect` — click "Start a reflection," speak for ~60 s.
3. `/wiki` — your Mirror entry appears with signals + caution.
4. Click "Run sense-making now" (dev-only) — Connector + Pathfinder cards appear within ~90 s.
5. Edit any field, click "Confirm" — change persists.

## Quality gates

```bash
pnpm check     # biome lint + tsc --noEmit
pnpm test      # vitest run
pnpm build     # production build
```

## Ablation

Per K.T.D. #6 — two independent ablations on the fixed 8-reflection seed corpus:

```bash
pnpm ablate:mirror   # corpus search ON vs OFF for Mirror
pnpm ablate:cron     # full 3-tool surface ON vs OFF for Connector + Pathfinder
```

Reports land under `test/ablation/reports/`. v0.1 bar: 1–2 humans score 0–3 per dimension across (provenance, specificity, novelty, anti-sycophancy); ON beats OFF by ≥2 points across ≥3 dimensions to "pass."

## Layout

```
src/
  routes/         # TanStack Router file-based routes
  server/         # *.functions.ts — TanStack Start server fns
  agents/         # Mirror, Connector, Pathfinder + tools
  db/             # better-sqlite3 schema + queries + seed
  data/           # ecg-taxonomy.ts (~30 hand-curated SG entries)
  components/     # shadcn primitives + agent-specific cards
trigger/          # Trigger.dev v3 task definitions
test/             # vitest specs incl. test/ablation/
```

See `plans/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md` for the full unit-by-unit plan.
