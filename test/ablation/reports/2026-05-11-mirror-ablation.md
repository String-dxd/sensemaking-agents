# Ablation report — mirror surface — 2026-05-11T09:09:36.475Z

> **Surface:** mirror
> **Corpus:** `test/ablation/fixtures/seed-multistudent.json`
> **Student scope:** cross-student union (no `--student=` flag passed)
> **Bar (v0.2):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
> **Notes:** Placeholder run — OPENAI_API_KEY not set; populate ON/OFF blocks before scoring. Cross-student union over: `demo-a`, `demo-b`, `demo-c`, `demo-d`.

## Scoring (0–3 Likert per dimension; fill in by hand)

| Dimension | ON score | OFF score | Δ (ON − OFF) | Pass on this dimension? |
|-----------|---------:|----------:|-------------:|:------------------------|
| provenance |   |   |   |   |
| specificity |   |   |   |   |
| novelty |   |   |   |   |
| anti-sycophancy |   |   |   |   |
| parallax_discipline |   |   |   |   |

## Verdict per dimension (Δ ≥2 to "pass" individually)

- provenance: <pass | fail>
- specificity: <pass | fail>
- novelty: <pass | fail>
- anti-sycophancy: <pass | fail>
- parallax_discipline: <pass | fail>

## Overall verdict

- Dimensions passed: <count>
- Surface verdict: <KEEP | DROP | NARROW>

## ON variant raw output

```json
{
  "placeholder": true,
  "reason": "OPENAI_API_KEY not set — run live to populate. See plan U13 / K.T.D. #6.",
  "surface": "mirror",
  "variant": "on"
}
```

## OFF variant raw output

```json
{
  "placeholder": true,
  "reason": "OPENAI_API_KEY not set — run live to populate. See plan U13 / K.T.D. #6.",
  "surface": "mirror",
  "variant": "off"
}
```
