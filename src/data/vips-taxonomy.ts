/**
 * VIPS canonical taxonomy fixture for the wiki-pivot (v0.2).
 *
 * 22 hand-curated entries covering the four VIPS dimensions:
 *   - Values (8): Schwartz-aligned, framed for MOE ECG / CCE counsellor use.
 *   - Interests (6): Holland's RIASEC.
 *   - Personality (2): Big5 Extraversion + Neuroticism only — the two
 *     dimensions empirically reliable to infer from short reflection text
 *     (no MBTI, no further Big5 facets, per A9 / Scope Boundaries).
 *   - Skills (6): MOE ECG counsellor-recognizable skill clusters.
 *
 * Used by `lookup_vips_taxonomy` (Connector when proposing diffs;
 * Cartographer when assembling pathway `trait_combination` references).
 * Mirror never reads this — VIPS canonicalization is a Connector concern.
 *
 * Sources (MOE ECG / CCE materials):
 *   - MOE "Discovering Purpose" CCE pillar — Values vocabulary framing.
 *   - MOE ECG counsellor materials (Temasek JC, Kranji, BPGHS, Peicai) —
 *     RIASEC interest framing for SG secondary / JC students.
 *   - Holland (1997) — RIASEC interest types definitions.
 *   - Schwartz (2012, refined theory of basic values) — Values mapping
 *     into the counsellor-facing 8 above; not a direct copy of Schwartz's
 *     19 — collapsed for v0.2 to keep the closed vocabulary tractable.
 *   - Costa & McCrae (NEO-PI-R) — Big5 E + N definitions.
 *
 * Behavioral indicators are short phrases tied to behaviors a counsellor
 * could plausibly observe in reflections or 1:1 sessions; they are not
 * exhaustive and are intentionally concrete (R4 "canonical IDs"
 * enforceability depends on them being recognizable to a reviewer).
 *
 * v1 promotes this fixture to a proper content workstream with a
 * counsellor-savvy reviewer in the loop; v0.2 ships the curated slice.
 */

export type VipsDimension = 'values' | 'interests' | 'personality' | 'skills'

export interface VipsTaxonomyEntry {
  id: string
  dimension: VipsDimension
  label: string
  definition: string
  behavioral_indicators: string[]
}

export const VIPS_TAXONOMY: VipsTaxonomyEntry[] = [
  // ── Values (8) — MOE "Discovering Purpose" + Schwartz-aligned ───────────
  {
    id: 'values.contribution',
    dimension: 'values',
    label: 'Contribution',
    definition:
      'Orientation toward making a positive difference for others or the community, treating impact as a primary measure of meaningful work.',
    behavioral_indicators: [
      'volunteers for service work when not asked',
      'frames choices in terms of impact on others',
      'prefers meaningful work over higher-paying alternatives',
    ],
  },
  {
    id: 'values.achievement',
    dimension: 'values',
    label: 'Achievement',
    definition:
      'Orientation toward demonstrated competence and visible accomplishment, drawn to setting and surpassing high standards.',
    behavioral_indicators: [
      'sets concrete personal goals and tracks progress',
      'seeks competitive or measurable settings',
      'speaks about mastery, rankings, or records',
    ],
  },
  {
    id: 'values.tradition',
    dimension: 'values',
    label: 'Tradition',
    definition:
      'Orientation toward continuity, cultural or familial expectations, and the wisdom of established practice.',
    behavioral_indicators: [
      'cites family or cultural expectations when making decisions',
      'values being part of a long-standing institution',
      'prefers proven pathways over experimental ones',
    ],
  },
  {
    id: 'values.security',
    dimension: 'values',
    label: 'Security',
    definition:
      'Orientation toward stability, predictability, and risk-managed pathways for self and family.',
    behavioral_indicators: [
      'weighs job stability and income heavily in decisions',
      'prefers structured pathways with known outcomes',
      'considers parental peace of mind explicitly',
    ],
  },
  {
    id: 'values.independence',
    dimension: 'values',
    label: 'Independence',
    definition:
      'Orientation toward autonomy, self-direction, and shaping work and life on one’s own terms.',
    behavioral_indicators: [
      'resists pathways chosen primarily by others',
      'speaks about wanting to "do my own thing"',
      'prefers self-paced or self-led work',
    ],
  },
  {
    id: 'values.relationships',
    dimension: 'values',
    label: 'Relationships',
    definition:
      'Orientation toward close connection, belonging, and the quality of interpersonal bonds at work and outside it.',
    behavioral_indicators: [
      'rates team or environment as decisive in past choices',
      'invests effort in maintaining friendships and family ties',
      'prefers collaborative work over solo work',
    ],
  },
  {
    id: 'values.wellbeing',
    dimension: 'values',
    label: 'Wellbeing',
    definition:
      'Orientation toward sustainable pace, mental and physical health, and a life that holds together outside of work.',
    behavioral_indicators: [
      'speaks about work-life balance unprompted',
      'pulls back from environments that feel unsustainable',
      'values rest, hobbies, or family time as non-negotiable',
    ],
  },
  {
    id: 'values.learning',
    dimension: 'values',
    label: 'Learning',
    definition:
      'Orientation toward growth, curiosity, and continuous development as a primary reward of work and study.',
    behavioral_indicators: [
      'reads or explores beyond the syllabus',
      'frames a job’s appeal as "what I’ll learn there"',
      'seeks feedback and revisits past work',
    ],
  },

  // ── Interests (6) — Holland RIASEC ────────────────────────────────────
  {
    id: 'interests.realistic',
    dimension: 'interests',
    label: 'Realistic',
    definition:
      'Preference for hands-on, practical, tool- or machine-oriented activities and tangible outcomes (Holland’s R).',
    behavioral_indicators: [
      'enjoys building, fixing, or working with physical tools',
      'prefers outdoor, lab, or workshop settings',
      'describes satisfaction in seeing a finished, tangible result',
    ],
  },
  {
    id: 'interests.investigative',
    dimension: 'interests',
    label: 'Investigative',
    definition:
      'Preference for analysis, research, and understanding how things work through inquiry and evidence (Holland’s I).',
    behavioral_indicators: [
      'asks why questions and pursues them past surface answers',
      'enjoys puzzles, problem sets, and experiments',
      'reads about scientific or technical topics for fun',
    ],
  },
  {
    id: 'interests.artistic',
    dimension: 'interests',
    label: 'Artistic',
    definition:
      'Preference for creative expression, aesthetics, and open-ended self-directed creation (Holland’s A).',
    behavioral_indicators: [
      'makes art, music, writing, or design outside class',
      'is drawn to ambiguity and original work',
      'expresses ideas through visual or narrative form',
    ],
  },
  {
    id: 'interests.social',
    dimension: 'interests',
    label: 'Social',
    definition:
      'Preference for teaching, helping, counselling, or otherwise working with and for people (Holland’s S).',
    behavioral_indicators: [
      'takes on tutoring, mentoring, or peer-support roles',
      'is sought out by friends for advice',
      'enjoys group-facing roles in CCAs and projects',
    ],
  },
  {
    id: 'interests.enterprising',
    dimension: 'interests',
    label: 'Enterprising',
    definition:
      'Preference for leading, persuading, and organizing people or ventures toward a goal (Holland’s E).',
    behavioral_indicators: [
      'starts initiatives, clubs, or small businesses',
      'enjoys negotiation, sales, or pitching',
      'naturally takes lead roles in group work',
    ],
  },
  {
    id: 'interests.conventional',
    dimension: 'interests',
    label: 'Conventional',
    definition:
      'Preference for structured, detail-oriented work with clear rules, records, and procedures (Holland’s C).',
    behavioral_indicators: [
      'keeps organized notes, calendars, or trackers',
      'enjoys data-entry, accounting, or admin-style tasks',
      'prefers clear instructions and well-defined deliverables',
    ],
  },

  // ── Personality (2) — Big5 E + N only (per A9 / Scope Boundaries) ──────
  {
    id: 'personality.extraversion',
    dimension: 'personality',
    label: 'Extraversion',
    definition:
      'Big5 dimension capturing energy from social interaction, assertiveness, and positive affect in group settings.',
    behavioral_indicators: [
      'is energized rather than drained by group activity',
      'speaks up readily in class or group discussion',
      'seeks out social events and high-stimulation settings',
    ],
  },
  {
    id: 'personality.neuroticism',
    dimension: 'personality',
    label: 'Neuroticism',
    definition:
      'Big5 dimension capturing emotional reactivity, worry, and sensitivity to stress; high N reflects more intense negative affect.',
    behavioral_indicators: [
      'reports worry or anxiety around evaluation or change',
      'reacts strongly to setbacks before recovering',
      'is more sensitive to interpersonal tension than peers',
    ],
  },

  // ── Skills (6) — MOE ECG counsellor-recognizable skill clusters ────────
  {
    id: 'skills.interpersonal',
    dimension: 'skills',
    label: 'Interpersonal',
    definition:
      'Capacity to read social situations, build trust, and work productively with people across differences.',
    behavioral_indicators: [
      'is named by peers as easy to work with',
      'mediates conflict in group settings',
      'builds rapport with adults and unfamiliar peers',
    ],
  },
  {
    id: 'skills.analytical',
    dimension: 'skills',
    label: 'Analytical',
    definition:
      'Capacity to decompose problems, reason with evidence, and reach defensible conclusions from data.',
    behavioral_indicators: [
      'breaks complex problems into smaller parts',
      'cites evidence when arguing a point',
      'spots flaws in reasoning that peers miss',
    ],
  },
  {
    id: 'skills.creative',
    dimension: 'skills',
    label: 'Creative',
    definition:
      'Capacity to generate novel ideas and connections, and to produce original work where the path is not pre-specified.',
    behavioral_indicators: [
      'proposes ideas that surprise the group',
      'connects ideas across unrelated subjects',
      'produces original work outside assignments',
    ],
  },
  {
    id: 'skills.practical',
    dimension: 'skills',
    label: 'Practical',
    definition:
      'Capacity to get things done in the real world — execution, follow-through, and adapting plans to constraints.',
    behavioral_indicators: [
      'finishes what they start, including unglamorous parts',
      'adapts when the original plan breaks',
      'is the one peers ask to make things actually happen',
    ],
  },
  {
    id: 'skills.leadership',
    dimension: 'skills',
    label: 'Leadership',
    definition:
      'Capacity to set direction, coordinate others, and take responsibility for outcomes in group settings.',
    behavioral_indicators: [
      'takes captain, head, or chair roles in CCAs',
      'is trusted by peers to make calls under pressure',
      'follows through on responsibility for the group’s outcome',
    ],
  },
  {
    id: 'skills.communication',
    dimension: 'skills',
    label: 'Communication',
    definition:
      'Capacity to express ideas clearly in speech and writing, calibrated to audience and purpose.',
    behavioral_indicators: [
      'explains complex ideas simply to non-experts',
      'writes essays or reports that need little revision',
      'is selected to present on behalf of the group',
    ],
  },
]

export function lookupVipsTaxonomy(opts: {
  query: string
  dimension?: VipsDimension
}): VipsTaxonomyEntry[] {
  const q = opts.query.trim().toLowerCase()
  return VIPS_TAXONOMY.filter((entry) => {
    if (opts.dimension && entry.dimension !== opts.dimension) return false
    if (!q) return true
    return (
      entry.label.toLowerCase().includes(q) ||
      entry.definition.toLowerCase().includes(q) ||
      entry.id.toLowerCase().includes(q)
    )
  })
}
