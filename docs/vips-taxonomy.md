# VIPS Taxonomy

Last verified against `src/data/vips-taxonomy.ts` on 2026-05-13.

The implementation's canonical VIPS taxonomy lives in
`src/data/vips-taxonomy.ts`. It contains 22 canonical claim IDs across the four
VIPS dimensions:

- Values: 8
- Interests: 6 Holland RIASEC interests
- Personality: 2 Big Five dimensions
- Skills: 6 skill clusters

Connector does not invent free-text labels. `src/agents/context/index.ts`
formats the taxonomy into the managed-agent prompt as `# Inlined VIPS taxonomy
(closed canonical claim IDs)`, and `src/agents/connector.prompt.md` tells
Connector to choose `canonical_claim_id` values from that inlined list. The
deterministic verifier in `src/agents/verifier.ts` then gates quoted evidence,
reflection identity, single-context parallax caps, and structural
`reinforces_id` assignment.

One implementation detail worth keeping explicit: `ConnectorDiffSchema` and
the verifier input schema currently validate `canonical_claim_id` as a non-empty
string, not as a generated enum over `VIPS_TAXONOMY`. The closed-label behavior
comes from the inlined taxonomy and prompt contract.

## Values

| ID | Label | Definition |
| --- | --- | --- |
| `values.contribution` | Contribution | Orientation toward making a positive difference for others or the community, treating impact as a primary measure of meaningful work. |
| `values.achievement` | Achievement | Orientation toward demonstrated competence and visible accomplishment, drawn to setting and surpassing high standards. |
| `values.tradition` | Tradition | Orientation toward continuity, cultural or familial expectations, and the wisdom of established practice. |
| `values.security` | Security | Orientation toward stability, predictability, and risk-managed pathways for self and family. |
| `values.independence` | Independence | Orientation toward autonomy, self-direction, and shaping work and life on one's own terms. |
| `values.relationships` | Relationships | Orientation toward close connection, belonging, and the quality of interpersonal bonds at work and outside it. |
| `values.wellbeing` | Wellbeing | Orientation toward sustainable pace, mental and physical health, and a life that holds together outside of work. |
| `values.learning` | Learning | Orientation toward growth, curiosity, and continuous development as a primary reward of work and study. |

## Interests

The interest taxonomy is Holland's RIASEC set.

| ID | Label | RIASEC letter | Definition |
| --- | --- | --- | --- |
| `interests.realistic` | Realistic | R | Preference for hands-on, practical, tool- or machine-oriented activities and tangible outcomes. |
| `interests.investigative` | Investigative | I | Preference for analysis, research, and understanding how things work through inquiry and evidence. |
| `interests.artistic` | Artistic | A | Preference for creative expression, aesthetics, and open-ended self-directed creation. |
| `interests.social` | Social | S | Preference for teaching, helping, counselling, or otherwise working with and for people. |
| `interests.enterprising` | Enterprising | E | Preference for leading, persuading, and organizing people or ventures toward a goal. |
| `interests.conventional` | Conventional | C | Preference for structured, detail-oriented work with clear rules, records, and procedures. |

## Personality

The personality taxonomy intentionally uses only Big Five Extraversion and
Neuroticism. It does not include MBTI, the other Big Five dimensions, or finer
facets.

| ID | Label | Definition |
| --- | --- | --- |
| `personality.extraversion` | Extraversion | Big Five dimension capturing energy from social interaction, assertiveness, and positive affect in group settings. |
| `personality.neuroticism` | Neuroticism | Big Five dimension capturing emotional reactivity, worry, and sensitivity to stress; high N reflects more intense negative affect. |

## Skills

| ID | Label | Definition |
| --- | --- | --- |
| `skills.interpersonal` | Interpersonal | Capacity to read social situations, build trust, and work productively with people across differences. |
| `skills.analytical` | Analytical | Capacity to decompose problems, reason with evidence, and reach defensible conclusions from data. |
| `skills.creative` | Creative | Capacity to generate novel ideas and connections, and to produce original work where the path is not pre-specified. |
| `skills.practical` | Practical | Capacity to get things done in the real world: execution, follow-through, and adapting plans to constraints. |
| `skills.leadership` | Leadership | Capacity to set direction, coordinate others, and take responsibility for outcomes in group settings. |
| `skills.communication` | Communication | Capacity to express ideas clearly in speech and writing, calibrated to audience and purpose. |

## Behavioral Indicators

Each taxonomy entry also carries behavioral indicators in
`src/data/vips-taxonomy.ts`. These are short observable cues that help Connector
choose a canonical claim ID without turning the label itself into a diagnosis or
free-form inference.
