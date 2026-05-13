# VIPS Taxonomy

Last verified against `src/data/vips-taxonomy.ts` on 2026-05-13.

The implementation's canonical VIPS taxonomy lives in
`src/data/vips-taxonomy.ts`. It contains 22 canonical claim IDs across the four
VIPS dimensions:

- Values: 8
- Interests: 6 Holland RIASEC interests
- Personality: 2 Big Five reference dimensions, rendered as behavioral
  patterns rather than identity labels
- Skills: 6 compact skill clusters, with SkillsFuture Critical Core Skills as
  an explicit source-family/crosswalk reference

Connector does not invent free-text labels. `src/agents/context/index.ts`
formats the taxonomy into the managed-agent prompt as `# Inlined VIPS taxonomy
(closed canonical claim IDs)`, and `src/agents/connector.prompt.md` tells
Connector to choose `canonical_claim_id` values from that inlined list. The
deterministic verifier in `src/agents/verifier.ts` then gates canonical taxonomy
membership, quoted evidence, reflection identity, single-context parallax caps,
and structural `reinforces_id` assignment.

One implementation detail worth keeping explicit: `ConnectorDiffSchema` still
accepts `canonical_claim_id` as a non-empty string so the managed-agent response
schema stays simple. Closed-label behavior is enforced after parsing by
`isKnownVipsTaxonomyId({ dimension, id })`; invalid IDs, including valid IDs
under the wrong dimension, are verifier drops with reason
`unknown_canonical_claim_id` and are never inserted into `vips_timeline_entries`.

## Source Basis

The runtime taxonomy is intentionally compact. It does not expose every
possible values or skills list item as a canonical label; instead, broad source
vocabularies inform a smaller set of student-facing claim IDs.

- Values are framed through MOE ECG / CCE language and Schwartz-aligned value
  families. Broad values word-banks, such as the University of Toronto values
  list, are useful as synonym/crosswalk material rather than as a replacement
  taxonomy.
- Interests use Holland's RIASEC set.
- Personality uses Big Five Extraversion and Neuroticism as backend reference
  dimensions only. The app should render behavior-shape language, not "you are
  an extrovert" or "you are neurotic" labels.
- Skills use 6 compact clusters for the canonical IDs, with SkillsFuture
  Singapore's Critical Core Skills as a source-family reference. The full
  SkillsFuture CCS list is not copied into the runtime IDs; it is better used
  to explain and audit how our smaller clusters map to recognizable
  Singapore career-readiness language.

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
facets. These are not intended as student-facing identity labels. They are
reference dimensions that let Connector tag repeated behavioral evidence in a
known psychology vocabulary while the compiled-truth prose stays concrete and
non-diagnostic.

Neuroticism means emotional reactivity and sensitivity to stress, worry, or
setbacks. In Big Five language, "higher neuroticism" usually means stronger or
more frequent negative emotional responses; "lower neuroticism" is often
described as emotional stability. In this product, do not call a student
"neurotic" or "emotionally stable" as an outcome. Say what the evidence shows:
for example, "assessment changes seem to hit hard before they recover" or
"they tend to regain footing quickly after setbacks."

Extraversion means social energy, assertiveness, and positive affect in group
settings. Again, avoid labeling the student as "an extrovert" or "an
introvert." The acceptable output is behavioral: "speaks up readily in group
discussion" or "seems to think most clearly after solo preparation."

| ID | Label | Definition |
| --- | --- | --- |
| `personality.extraversion` | Extraversion | Big Five dimension capturing energy from social interaction, assertiveness, and positive affect in group settings. |
| `personality.neuroticism` | Neuroticism | Big Five dimension capturing emotional reactivity, worry, and sensitivity to stress; high N reflects more intense negative affect. |

| Backend reference | Avoid saying | Prefer saying |
| --- | --- | --- |
| `personality.extraversion` | "You are an extrovert/introvert." | "You seem to gain energy in group discussion" or "solo preparation appears to help you contribute more clearly." |
| `personality.neuroticism` | "You are neurotic" or "you have high neuroticism." | "High-stakes changes seem to trigger strong worry before recovery" or "you tend to regain steadiness after setbacks." |

## Skills

The 6 skill IDs are the product's compact canonical layer. SkillsFuture
Singapore's Critical Core Skills should be referenced as a crosswalk/source
family when explaining or refining these labels, especially for terms such as
Creative Thinking, Decision Making, Problem Solving, Sense Making,
Collaboration, Communication, Developing People, Influence, Adaptability,
Digital Fluency, Learning Agility, and Self Management.

Do not replace the 6 runtime IDs with all 16 SkillsFuture CCS labels unless the
product intentionally shifts from a compact reflective taxonomy to a more
workforce-skills inventory. The current design favors fewer labels with stronger
evidence and clearer student-facing prose.

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
