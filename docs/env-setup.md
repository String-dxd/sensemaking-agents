# Env setup — Step 11 cutover gate

Single-source guide for filling in `.env.local` so you can run the Step 11
ablation gate (`pnpm ablate:mirror --runner=managed` and
`pnpm ablate:sensemake --runner=managed`) end-to-end.

## Quick start

1. Copy the template at the bottom of this doc into `.env.local` at the repo root.
2. Walk through the five sections below in order — Anthropic → Postgres →
   Managed Agents → OpenAI → flag.
3. Run `pnpm db:migrate` once to apply the Step 10 migration baseline.
4. Run `pnpm provision:managed-agents` once to create the four agents +
   environment in Anthropic.
5. Smoke-test: `pnpm smoke:managed-mirror`. If that prints a parsed Mirror
   output, the wiring is healthy and you're ready for Step 11.

---

## Section 1 — Anthropic (`ANTHROPIC_API_KEY`)

**Required.** One key powers Managed Agents, memory stores, and the
`self_critique` Messages-API tool.

1. Sign in at <https://console.anthropic.com>.
2. **Settings → API Keys → Create Key.** Name it `sensemaking-dev`.
3. Copy the `sk-ant-api03-...` value. **You only see it once.**
4. Paste into `.env.local` as `ANTHROPIC_API_KEY=sk-ant-api03-...`.

The Managed Agents beta header (`managed-agents-2026-04-01`) is applied
per-call by the SDK — you don't set it explicitly.

---

## Section 2 — Postgres (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`)

**Both required.** Neon gives you two URLs per branch — the app uses the
pooled one; `db:migrate` uses the direct one.

1. Sign in at <https://console.neon.tech>.
2. Pick your project (or create one named `sensemaking-dev`).
3. **Branches → main → Connection details.**
4. Copy **Pooled connection** → paste as `DATABASE_URL`. Host contains
   `-pooler` (e.g. `ep-xxx-pooler.us-east-2.aws.neon.tech`).
5. Switch to **Direct connection**, copy that URL → paste as
   `DATABASE_URL_UNPOOLED`. Same project, no `-pooler` in the host.

Both URLs end with `?sslmode=require`. Keep it.

After both URLs are in:

```bash
pnpm db:migrate
```

This applies `0000_illegal_sunset_bain.sql` — all 16 tables including Step
10's `student_memory_stores` + `student_memory_files`. If your branch
already has the older tables from manual schema runs, the migration will
fail with "relation already exists" — in that case, ask me to walk you
through marking it applied in `__drizzle_migrations` instead of running it.

---

## Section 3 — Managed Agents provisioning

**Required.** The four agents + one environment must exist in your
Anthropic workspace before you can run them.

```bash
pnpm provision:managed-agents
```

This script (idempotent) calls `client.beta.agents.create` and
`environments.create` and prints something like:

```
env: env_AbCdEf123456
mirror:        agent_M1rR0r...   (version 1)
connector:     agent_C0nNeC...   (version 1)
cartographer:  agent_C4rT0g...   (version 1)
self_critique: NOT a managed agent — invoked as a Messages-API tool
```

Paste each id into the matching env var:

```
MANAGED_AGENT_ENV_ID=env_AbCdEf123456
MANAGED_AGENT_MIRROR_ID=agent_M1rR0r...
MANAGED_AGENT_CONNECTOR_ID=agent_C0nNeC...
MANAGED_AGENT_CARTOGRAPHER_ID=agent_C4rT0g...
```

The `_VERSION` fields are optional but recommended. Pin them to the version
the provision script printed so a future re-provision doesn't silently
change this build's behavior:

```
MANAGED_AGENT_MIRROR_VERSION=1
MANAGED_AGENT_CONNECTOR_VERSION=1
MANAGED_AGENT_CARTOGRAPHER_VERSION=1
```

---

## Section 4 — OpenAI (`OPENAI_API_KEY`)

**Required for Step 11** even though Step 11 is testing the *managed*
path. Reasons:

- The ablation harness compares `--runner=managed` against `--runner=openai`
  for the baseline.
- `gpt-4o-mini-transcribe` is still used for STT (stays after cutover).

1. <https://platform.openai.com> → **API Keys → Create new secret key.**
2. Paste as `OPENAI_API_KEY=sk-proj-...`.

---

## Section 5 — Routing flag (`USE_MANAGED_AGENTS`)

```
USE_MANAGED_AGENTS=false
```

Keep `false` through Step 11. The ablation CLI flips runners explicitly
via `--runner=managed`, so this flag's only job during the gate is to keep
the *app* on the OpenAI path. Step 12 flips it to `true`.

---

## Skip these for Step 11

| Var | Why skip |
|---|---|
| `WORKOS_*` | Step 11 doesn't hit HTTP/auth |
| `DEV_BYPASS_AUTH` | Same |
| `CRON_SECRET` | Nightly sweep cron not deployed yet |
| `AGENT_MODEL` | Override only — defaults are fine |
| `ANTHROPIC_SELF_CRITIQUE_MODEL` | Same |
| `DATABASE_POOL_MAX` | Default of 5 is fine for solo dev |

---

## Verification checklist

Before invoking the ablation harness, confirm:

```bash
# Should succeed silently:
pnpm db:migrate

# Should print parsed Mirror JSON without an "ANTHROPIC_API_KEY is not set"
# or "MANAGED_AGENT_MIRROR_ID is not set" error:
pnpm smoke:managed-mirror

# Should also succeed:
pnpm smoke:managed-connector
```

If any of those fail, fix that var before proceeding to Step 11.

---

## Template

Copy everything between the markers into `.env.local`.

```dotenv
# ── BEGIN .env.local template ──

# Section 1 — Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-REPLACE_ME

# Section 2 — Postgres (Neon)
DATABASE_URL=postgresql://USER:PASS@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://USER:PASS@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# Section 3 — Managed Agents (from `pnpm provision:managed-agents`)
MANAGED_AGENT_ENV_ID=env_REPLACE_ME
MANAGED_AGENT_MIRROR_ID=agent_REPLACE_ME
MANAGED_AGENT_MIRROR_VERSION=1
MANAGED_AGENT_CONNECTOR_ID=agent_REPLACE_ME
MANAGED_AGENT_CONNECTOR_VERSION=1
MANAGED_AGENT_CARTOGRAPHER_ID=agent_REPLACE_ME
MANAGED_AGENT_CARTOGRAPHER_VERSION=1

# Section 4 — OpenAI
OPENAI_API_KEY=sk-proj-REPLACE_ME

# Section 5 — Routing flag (keep false through Step 11)
USE_MANAGED_AGENTS=false

# ── END .env.local template ──
```
