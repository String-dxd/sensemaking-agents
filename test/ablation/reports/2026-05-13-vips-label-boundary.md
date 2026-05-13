# VIPS label-boundary evaluation note — 2026-05-13

> **Fixture:** `test/ablation/fixtures/vips-label-boundary.json`
> **Scope:** Values/Skills label generation and verifier enforcement
> **Status:** Static fixture + focused verifier/score tests; no live managed-agent run in this report.

## Purpose

This slice checks the question behind "where do the values and skills come from?": Connector should map evidence into the compact VIPS runtime taxonomy, not emit labels copied from broad source lists. The University of Toronto values list remains a values word-bank/crosswalk source, and SkillsFuture Critical Core Skills remains a skills source-family/crosswalk reference. Neither expands the runtime canonical IDs in this pass.

## Boundary Cases

| Case | Expected result |
| --- | --- |
| Known value ID with matching quote | Admit or downgrade through normal evidence/parallax gates. |
| Real quote with invented value ID, e.g. `values.service` | Drop as `unknown_canonical_claim_id`. |
| Known skill ID under the wrong dimension, e.g. `skills.analytical` as a value | Drop as `unknown_canonical_claim_id`. |
| Skill-vs-interest ambiguity | Prefer the claim whose dimension is directly evidenced; do not infer a stable interest from one communication act. |
| SkillsFuture-style term | Map into a compact runtime skill such as `skills.practical`; do not emit `skillsfuture.*` runtime IDs. |

## Verification

- `test/agents/verifier.test.ts` proves invalid canonical IDs drop even when the quote matches.
- `test/ablation/sensemake-tools-off.test.ts` now asserts the ablation counters include `dropped_unknown_canonical_claim_id` and that invalid labels do not inflate admitted claim distributions.
- `scripts/ablate.ts` now increments the same drop bucket for live sensemaking reports.

## Current Verdict

Keep the compact taxonomy. The next useful evaluation pass is not "add more runtime labels"; it is scoring label fit in ambiguous rows and adding source-aware crosswalk metadata for UofT values terms and SkillsFuture CCS terms.
