# Ablation report — mirror surface — 2026-05-11T09:55:41.659Z

> **Surface:** mirror
> **Corpus:** `test/ablation/fixtures/seed-multistudent.json`
> **Student scope:** cross-student union (no `--student=` flag passed)
> **Bar (v0.2):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
> **Notes:** Live run against gpt-5.5. Cross-student union over: `demo-a`, `demo-b`, `demo-c`, `demo-d`.

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
"Could you share the new reflection transcript you want me to respond to?"
```

## OFF variant raw output

```json
"{\n  \"validation\": \"Across these reflections, there’s a steady attention to moments where helping, making, explaining, or choosing only feels right when it fits the person and the situation. The student often notices the difference between doing something because it is expected and doing it because it feels alive or true.\",\n  \"inferred_meaning\": \"Maybe the signal is that they are trying to understand what kind of work, care, and effort actually belongs to them. There is also some caution here: they can be quick to step in, solve, or carry things, and the harder question may be when help is wanted, when it fits, and when it becomes too much to take on.\",\n  \"story_reframe\": \"You keep finding yourself in small moments where something clicks: a conversation, a repair, an explanation, a drawing, a handover, a choice that feels more like yours. Sometimes other people notice before you do, and sometimes they push back. You are not just collecting achievements; you are noticing what feels real in your hands and what feels empty when it is only done for the form of it. The pattern is still forming, but it matters that you are paying attention to the difference.\"\n}"
```
