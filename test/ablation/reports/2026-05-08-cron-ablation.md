# Ablation report — cron surface — 2026-05-08T13:35:39.370Z

> **Surface:** cron
> **Corpus:** `test/ablation/fixtures/seed-corpus.json`
> **Bar (v0.1):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
> **Notes:** Placeholder run — OPENAI_API_KEY not set; populate ON/OFF blocks before scoring.

## Scoring (0–3 Likert per dimension; fill in by hand)

| Dimension | ON score | OFF score | Δ (ON − OFF) | Pass on this dimension? |
|-----------|---------:|----------:|-------------:|:------------------------|
| provenance |   |   |   |   |
| specificity |   |   |   |   |
| novelty |   |   |   |   |
| anti-sycophancy |   |   |   |   |

## Verdict per dimension (≥2 to "pass" individually)

- provenance: <pass | fail>
- specificity: <pass | fail>
- novelty: <pass | fail>
- anti-sycophancy: <pass | fail>

## Overall verdict

- Dimensions passed: <count>
- Surface verdict: <KEEP | DROP | NARROW>

## ON variant raw output

```json
{
  "placeholder": true,
  "reason": "OPENAI_API_KEY not set — run live to populate. See plans K.T.D. #6.",
  "surface": "cron",
  "variant": "on"
}
```

## OFF variant raw output

```json
{
  "placeholder": true,
  "reason": "OPENAI_API_KEY not set — run live to populate. See plans K.T.D. #6.",
  "surface": "cron",
  "variant": "off"
}
```
