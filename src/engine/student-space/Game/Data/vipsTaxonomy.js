/**
 * Canonical VIPS taxonomy — 22 closed claim IDs across the four facets.
 *
 * Source of truth lives in /Users/jeongwondo/Desktop/vips-taxonomy.md. Per the
 * doc, every observation (Quote in this app) carries a `canonicalClaimId`
 * drawn from this set — Connector/Verifier in v1.2 will pick from the same
 * list inlined into its prompt context. v1.1 hand-authors the values.
 *
 * Each entry also carries an `object` field — the on-island species or
 * artefact that maps to the claim. Trees for Values, Flowers for Interests
 * (with butterflies sharing the same RIASEC space as recent observations),
 * fruits for Skills, two ambient objects for Personality (Phase G).
 *
 *  - Personality is intentionally constrained to Extraversion + Neuroticism
 *    only. Do not invent the other three Big-Five dimensions in any view or
 *    seed copy.
 */

export const VIPS_TAXONOMY = [
    // ─── Values (8) ── trees ──────────────────────────────────────────────
    {
        id:         'values.contribution',
        facet:      'values',
        label:      'Contribution',
        definition: 'Orientation toward making a positive difference for others or the community, treating impact as a primary measure of meaningful work.',
        object:     { kind: 'tree', species: 'mangrove' },
    },
    {
        id:         'values.achievement',
        facet:      'values',
        label:      'Achievement',
        definition: 'Orientation toward demonstrated competence and visible accomplishment, drawn to setting and surpassing high standards.',
        object:     { kind: 'tree', species: 'oak' },
    },
    {
        id:         'values.tradition',
        facet:      'values',
        label:      'Tradition',
        definition: 'Orientation toward continuity, cultural or familial expectations, and the wisdom of established practice.',
        object:     { kind: 'tree', species: 'cherry' },
    },
    {
        id:         'values.security',
        facet:      'values',
        label:      'Security',
        definition: 'Orientation toward stability, predictability, and risk-managed pathways for self and family.',
        object:     { kind: 'tree', species: 'pine' },
    },
    {
        id:         'values.independence',
        facet:      'values',
        label:      'Independence',
        definition: 'Orientation toward autonomy, self-direction, and shaping work and life on one’s own terms.',
        object:     { kind: 'tree', species: 'palm' },
    },
    {
        id:         'values.relationships',
        facet:      'values',
        label:      'Relationships',
        definition: 'Orientation toward close connection, belonging, and the quality of interpersonal bonds at work and outside it.',
        object:     { kind: 'tree', species: 'maple' },
    },
    {
        id:         'values.wellbeing',
        facet:      'values',
        label:      'Wellbeing',
        definition: 'Orientation toward sustainable pace, mental and physical health, and a life that holds together outside of work.',
        object:     { kind: 'tree', species: 'willow' },
    },
    {
        id:         'values.learning',
        facet:      'values',
        label:      'Learning',
        definition: 'Orientation toward growth, curiosity, and continuous development as a primary reward of work and study.',
        // Banyan is a Phase-G addition. Until then, the Values bento renders
        // a banyan silhouette for this claim; the 3D scene shows nothing for
        // it (the species is simply absent from Tree.js until the new builder
        // lands). No view should crash on the missing species.
        object:     { kind: 'tree', species: 'banyan' },
    },

    // ─── Interests (6 RIASEC) ── flowers + butterflies ────────────────────
    {
        id:         'interests.realistic',
        facet:      'interests',
        label:      'Realistic',
        riasec:     'R',
        definition: 'Preference for hands-on, practical, tool- or machine-oriented activities and tangible outcomes.',
        object:     { kind: 'flower', species: 'daisy' },
    },
    {
        id:         'interests.investigative',
        facet:      'interests',
        label:      'Investigative',
        riasec:     'I',
        definition: 'Preference for analysis, research, and understanding how things work through inquiry and evidence.',
        object:     { kind: 'flower', species: 'pansy' },
    },
    {
        id:         'interests.artistic',
        facet:      'interests',
        label:      'Artistic',
        riasec:     'A',
        definition: 'Preference for creative expression, aesthetics, and open-ended self-directed creation.',
        object:     { kind: 'flower', species: 'rose' },
    },
    {
        id:         'interests.social',
        facet:      'interests',
        label:      'Social',
        riasec:     'S',
        definition: 'Preference for teaching, helping, counselling, or otherwise working with and for people.',
        object:     { kind: 'flower', species: 'lily' },
    },
    {
        id:         'interests.enterprising',
        facet:      'interests',
        label:      'Enterprising',
        riasec:     'E',
        definition: 'Preference for leading, persuading, and organizing people or ventures toward a goal.',
        object:     { kind: 'flower', species: 'tulip' },
    },
    {
        id:         'interests.conventional',
        facet:      'interests',
        label:      'Conventional',
        riasec:     'C',
        definition: 'Preference for structured, detail-oriented work with clear rules, records, and procedures.',
        object:     { kind: 'flower', species: 'hyacinth' },
    },

    // ─── Personality (2 Big-5) ── wind-stone + reflecting pool ─────────────
    {
        id:         'personality.extraversion',
        facet:      'personality',
        label:      'Extraversion',
        definition: 'Big Five dimension capturing energy from social interaction, assertiveness, and positive affect in group settings.',
        object:     { kind: 'windStone' },
    },
    {
        id:         'personality.neuroticism',
        facet:      'personality',
        label:      'Neuroticism',
        definition: 'Big Five dimension capturing emotional reactivity, worry, and sensitivity to stress; high N reflects more intense negative affect.',
        object:     { kind: 'pool' },
    },

    // ─── Skills (6) ── fruits on value-trees ──────────────────────────────
    {
        id:         'skills.interpersonal',
        facet:      'skills',
        label:      'Interpersonal',
        definition: 'Capacity to read social situations, build trust, and work productively with people across differences.',
        object:     { kind: 'fruit', species: 'fig' },
    },
    {
        id:         'skills.analytical',
        facet:      'skills',
        label:      'Analytical',
        definition: 'Capacity to decompose problems, reason with evidence, and reach defensible conclusions from data.',
        object:     { kind: 'fruit', species: 'pear' },
    },
    {
        id:         'skills.creative',
        facet:      'skills',
        label:      'Creative',
        definition: 'Capacity to generate novel ideas and connections, and to produce original work where the path is not pre-specified.',
        object:     { kind: 'fruit', species: 'plum' },
    },
    {
        id:         'skills.practical',
        facet:      'skills',
        label:      'Practical',
        definition: 'Capacity to get things done in the real world: execution, follow-through, and adapting plans to constraints.',
        object:     { kind: 'fruit', species: 'apple' },
    },
    {
        id:         'skills.leadership',
        facet:      'skills',
        label:      'Leadership',
        definition: 'Capacity to set direction, coordinate others, and take responsibility for outcomes in group settings.',
        object:     { kind: 'fruit', species: 'citrus' },
    },
    {
        id:         'skills.communication',
        facet:      'skills',
        label:      'Communication',
        definition: 'Capacity to express ideas clearly in speech and writing, calibrated to audience and purpose.',
        object:     { kind: 'fruit', species: 'berry' },
    },
]

// ── Convenience lookups (single import point for everything view-side) ────

export const VIPS_BY_ID    = Object.fromEntries(VIPS_TAXONOMY.map((c) => [c.id, c]))
export const VIPS_BY_FACET = VIPS_TAXONOMY.reduce((acc, c) =>
{
    if(!acc[c.facet]) acc[c.facet] = []
    acc[c.facet].push(c)
    return acc
}, {})

export const FACET_IDS = ['values', 'interests', 'personality', 'skills']

/** Membership check used by mergeQuote — warn-and-drop unknown claim IDs. */
export const isCanonicalClaim = (id) => Object.prototype.hasOwnProperty.call(VIPS_BY_ID, id)

/** Resolve a claim's human label for chip rendering. Falls back to the raw id. */
export const claimLabel = (id) => (VIPS_BY_ID[id]?.label ?? id)
