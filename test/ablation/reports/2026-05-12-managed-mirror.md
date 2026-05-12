# Ablation report — mirror surface — 2026-05-12T12:44:26.940Z

> **Surface:** mirror
> **Corpus:** `test/ablation/fixtures/seed-multistudent.json`
> **Student scope:** cross-student union (no `--student=` flag passed)
> **Bar (v0.2):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
> **Notes:** Live run via runner=`managed` against agent_01RAZPy7HzkWo3h8Mch4D55F:v1. Cross-student union over: `demo-a`, `demo-b`, `demo-c`, `demo-d`.

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
```json
{
  "validation": "You navigated something genuinely delicate — you wanted Daryl to feel like a peer, not a project, and you made a choice that let that happen. The care you put into that before the session even started is real.",
  "inferred_meaning": "Maybe what you noticed is that you have an instinct for how to open a door for someone without making them feel like they need to walk through it. The question you chose, the book you brought — those weren't accidents. It sounds like Daryl talking for 20 minutes mattered to you not as a result you produced, but as something you got to witness.",
  "story_reframe": "You went into the pairing already thinking about Daryl's dignity — that he shouldn't feel looked down on. So instead of filling the space, you brought a question that had no right answer and stepped back. He filled it himself, 20 minutes worth. Afterward he paid you a compliment, and you held it loosely — you didn't claim the label he offered, but you did claim the feeling underneath it: that this is the kind of thing you want more of."
}
```
```

## OFF variant raw output

```json
{"placeholder":true,"reason":"runner-comparison era: OFF retired; see JSON for per-row metrics"}
```
