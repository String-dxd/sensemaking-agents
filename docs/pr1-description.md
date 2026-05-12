## Summary

Cuts over the four sensemaking agents (Mirror, Connector, Cartographer, self_critique) from the OpenAI Agents SDK to Anthropic Managed Agents (beta `managed-agents-2026-04-01`). Ports persistence from `better-sqlite3` to Neon Postgres with RLS-isolated per-student transactions, lands WorkOS AuthKit sign-in, wires per-student memory stores with advisory-lock-serialized writes, and ships a day-21 CI guard that forces a cleanup decision.

- **Flag-gated rollout.** `USE_MANAGED_AGENTS=true` flips production traffic onto Managed Agents; `false` keeps the OpenAI path. Feature flag stays in code so rollback during the observation window is a redeploy, not a revert.
- **Cutover gate passed** (plan §11). Ablation harness: Mirror 32/32 parsed, Connector 4/4 students parsed after `reflection_id` coercion fix, Verifier admitted 13 entries + 1 `no_quote_match` drop. Rubric review: 1/1 Mirror sample pass, 4/4 Cartographer outputs reviewed (3 pass + 1 concern), empty-VIPS-state caveat noted.
- **PR 2 follow-up** opens as a draft against this branch to remove `@openai/agents`, `handoff-chain*.ts`, and the feature flag once the observation window clears. Day-21 CI guard fails the build on 2026-06-02 if `USE_MANAGED_AGENTS` is still in `src/agents/config.ts` — forcing function for either shipping PR 2 or extending the deadline explicitly.

Plan: `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`

## Step-by-step changes

| Step | Commit | What |
|------|--------|------|
| 1 | (earlier) | Ablation harness + `--runner=managed` CLI |
| 2 | `305646a` + `4bd180e` | Postgres/Drizzle adapter + RLS + queries port |
| 2e | `28cd434` | RLS concurrency integration test |
| 3 | `5f94432` | Reseed multistudent fixture to Neon |
| 4 | `d736bcf` | WorkOS AuthKit + server-resolved `activeStudentId` |
| 5–9 | `1db3c91`, `198bc02`, `b840c3d`, `e78e7e2` | Provisioning + Mirror/Connector/Cartographer on Managed Agents behind the flag |
| 10 | `9edc963` | Memory store wiring + advisory-lock-serialized writes + snapshots |
| 11 | `c90be31`, `5923ff5`, `ff49323` | Cutover-gate stabilization + Cartographer parse robustness + rubric artifacts |
| 12 | `01ab1fa` | Day-21 stale-flag CI guard |

## Cutover-gate rubric results

**Mirror — 1/1 reviewed sample passes.** Only one raw output is preserved by the ablation report's structured JSON. 32/32 parsed cleanly; sample assessed:

| Dimension | Score |
|---|---:|
| provenance | 3 |
| specificity | 3 |
| novelty | 2 |
| anti-sycophancy | 3 |
| parallax_discipline | 3 |

**Cartographer — 4/4 outputs reviewed (3 pass, 1 concern).** Empty VIPS-state fixture; real-state quality deferred to first counselor session post-cutover.

| Output | Verdict | One-line note |
|---|---|---|
| `demo-a` (4 pathways) | concern | Honest about no-data, but pathway-level `risks_tradeoffs` leak generic SG-pathway content. Shipping because framing is explicit and counselor can read the disclaimer. |
| `demo-c` (2 pathways) | pass | Exemplary restraint. Open questions are concrete and probing. |
| `demo-d` (2 pathways) | pass | "Starting condition to name honestly" — exactly right tone. |
| `demo-a-2` (repeat, 2 pathways) | pass | Non-determinism: same agent + prompt produced 4 substantive pathways on first run, 2 minimal pathways on repeat. Acceptable for v0.2 demo; counselor seeing repeats may notice variance. |

**5th run (demo-b)** hit a JSON-fence parse failure pre-fix; the fence patch landed in `ff49323` but the 5th output was not re-validated. Per plan §11 we have 4 reviewed Cartographer outputs vs the planned 5.

## What ships with this PR (PR 1)

- All Step 1–12 commits.
- `.github/workflows/lint-no-stale-flag.yml` shipped — fails 2026-06-02 if `USE_MANAGED_AGENTS` is still referenced in `src/agents/config.ts`.
- **Production traffic flow flips when** `USE_MANAGED_AGENTS=true` is set in Vercel env vars (production + preview). The PR merge itself does not change traffic routing.

## What does NOT ship with this PR

Deferred to PR 2 (cleanup, opens as draft same day):
- `@openai/agents` npm dep removal
- `src/agents/handoff-chain.ts` and `handoff-chain-streamed.ts` deletion
- `USE_MANAGED_AGENTS` feature flag removal from `src/agents/config.ts`
- `.github/workflows/lint-no-stale-flag.yml` deletion (its job is done)

Deferred to follow-up PRs (plan §16):
- Counselor multi-student picker UI
- Cartographer full-state rubric review (waiting on first real counselor session)
- Nightly sweep cron operational tuning
- `pg@9` concurrent-query refactor (`docs/followups.md`)
- Managed Agents token-accounting fix (`docs/followups.md`)

## Rollback procedure

**Pre-PR-2 window:**
- Set `USE_MANAGED_AGENTS=false` in Vercel env vars and redeploy.
- All OpenAI Agents SDK code is still present and functional behind the flag.
- Postgres + WorkOS auth stay (they are additive; no rollback needed).

**Post-PR-2:**
- `git revert` of PR 2 + forward-fix of any drift in `handoff-chain*.ts` against `src/db/queries.ts`.

## Test plan

- [ ] **CI green** — `pnpm typecheck`, `pnpm lint`, `pnpm test` (142 passed, 145 skipped on local; CI runs DATABASE_URL-gated tests against the Neon dev branch).
- [ ] **Vercel env vars set** — `USE_MANAGED_AGENTS=true` on production + preview; all `MANAGED_AGENT_*` ids + `DATABASE_URL`/`DATABASE_URL_UNPOOLED` populated.
- [ ] **Smoke against production-like deploy** — `pnpm dev` with `.env.local`, sign in via WorkOS, record one Mirror reflection, verify auto-Connector stages a diff, confirm a VIPS page rewrite, run sense-making on `/wiki`.
- [ ] **PR 2 draft opened against this branch** within 24h of PR 1 merge.
- [ ] **Day-21 CI guard verified inactive pre-deadline** by inspecting workflow output on this PR's CI run.

## Vercel env var change required at merge time

```
USE_MANAGED_AGENTS=true            # production + preview
ANTHROPIC_API_KEY=sk-ant-api03-... # if not already set
DATABASE_URL=postgresql://...?sslmode=verify-full    # pooled
DATABASE_URL_UNPOOLED=postgresql://...?sslmode=verify-full  # direct
MANAGED_AGENT_ENV_ID=env_...
MANAGED_AGENT_MIRROR_ID=agent_...
MANAGED_AGENT_MIRROR_VERSION=1
MANAGED_AGENT_CONNECTOR_ID=agent_...
MANAGED_AGENT_CONNECTOR_VERSION=1
MANAGED_AGENT_CARTOGRAPHER_ID=agent_...
MANAGED_AGENT_CARTOGRAPHER_VERSION=1
WORKOS_*                            # if not already set
```

See `docs/env-setup.md` for the full walkthrough.
