# Ablation report — sensemake surface — 2026-05-12T13:29:25.758Z

> **Surface:** sensemake
> **Corpus:** `test/ablation/fixtures/seed-multistudent.json`
> **Student scope:** cross-student union (no `--student=` flag passed)
> **Bar (v0.2):** ON beats OFF by ≥2 points across ≥3 dimensions to "pass."
> **Notes:** Live run via runner=`managed` against agent_01RAZPy7HzkWo3h8Mch4D55F:v1 (Mirror) / agent_016ry7E3JmHcMS9qbYuockvu:v1 (Connector). Cross-student union over: `demo-a`, `demo-b`, `demo-c`, `demo-d`.

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
  "diffs": {
    "values": {
      "compiled_truth_rewrite": "Has a long-standing pattern of helping neighbors with practical problems; frames this helping as intrinsically meaningful rather than obligatory.",
      "open_question": "Does this helping orientation extend to wider community contexts (volunteering, service organizations), or is it primarily rooted in personal relationships (family, neighbors)?",
      "new_timeline_entries": [
        {
          "canonical_claim_id": "values.contribution",
          "verbatim_quote": "ive been doing this since sec 1 it never felt like a chore",
          "reflection_id": 8,
          "strength": "medium",
          "parallax_tag": ["hobby"]
        }
      ]
    },
    "interests": {
      "compiled_truth_rewrite": "Drawn to helping and supporting people, demonstrating sustained engagement and comfort across age differences.",
      "open_question": "Does this social interest extend to peer-support, mentoring, or group-facing roles, or is it primarily anchored in one-to-one, family-like support contexts?",
      "new_timeline_entries": [
        {
          "canonical_claim_id": "interests.social",
          "verbatim_quote": "helped my neighbour auntie suria with her phone today",
          "reflection_id": 8,
          "strength": "medium",
          "parallax_tag": ["hobby"]
        }
      ]
    },
    "personality": {
      "compiled_truth_rewrite": "",
      "open_question": "",
      "new_timeline_entries": []
    },
    "skills": {
      "compiled_truth_rewrite": "Practices building rapport and trust with adults across age differences, listening carefully to their concerns and responding with patient problem-solving.",
      "open_question": "Does this interpersonal capacity extend to mediating conflict or working across differences in peer or group settings, or is it primarily evident in supportive, one-to-one relationships?",
      "new_timeline_entries": [
        {
          "canonical_claim_id": "skills.interpersonal",
          "verbatim_quote": "she gave me kuih lapis and we talked about her son in australia for half an hour",
          "reflection_id": 8,
          "strength": "medium",
          "parallax_tag": ["hobby"]
        }
      ]
    }
  }
}
```
```

## OFF variant raw output

```json
{"placeholder":true,"reason":"runner-comparison era: OFF retired; see JSON for per-row metrics"}
```
