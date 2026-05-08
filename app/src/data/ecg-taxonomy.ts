/**
 * ECG (Education and Career Guidance) taxonomy fixture for v0.1.
 *
 * ~30 hand-curated entries spanning subject combinations, CCAs, post-PSLE/
 * post-O-Level/post-A-Level pathways, and MOE career clusters. Used by
 * `lookup_ecg_taxonomy` (Connector + Pathfinder only — Mirror never reads
 * this) and never as a substitute for general knowledge.
 *
 * v1 promotes this to a proper content workstream; v0.1 ships a slice.
 */

export type EcgCategory = 'subject' | 'cca' | 'pathway' | 'cluster'

export interface EcgTaxonomyEntry {
  id: string
  label: string
  category: EcgCategory
  description: string
  links?: string[]
}

export const ECG_TAXONOMY: EcgTaxonomyEntry[] = [
  // ── Subject combinations (JC H2 — illustrative, not exhaustive) ─────────────
  {
    id: 'subject.h2-pcme',
    label: 'H2 PCME (Physics, Chemistry, Maths, Econs)',
    category: 'subject',
    description:
      'Classic JC science combination with strongest pull toward engineering and physical-science degrees.',
  },
  {
    id: 'subject.h2-bcme',
    label: 'H2 BCME (Biology, Chemistry, Maths, Econs)',
    category: 'subject',
    description: 'Bio-leaning combination preserving most life-science and medicine pathways.',
  },
  {
    id: 'subject.h2-arts-tripleh',
    label: 'H2 triple humanities (e.g. History, Literature, Econs)',
    category: 'subject',
    description:
      'Humanities-forward combination preserving law, social-science, and policy pathways.',
  },
  {
    id: 'subject.h2-bio-art',
    label: 'H2 mixed (e.g. Biology + Literature + Maths)',
    category: 'subject',
    description:
      'Cross-disciplinary combination that keeps both bio-life and humanities pathways open.',
  },
  {
    id: 'subject.h1-art',
    label: 'H1 contrasting subject (e.g. H1 Literature alongside science block)',
    category: 'subject',
    description:
      'A contrasting subject taken at H1 to widen exposure without committing the H2 weight.',
  },

  // ── CCAs (Co-Curricular Activities) ──────────────────────────────────────
  {
    id: 'cca.robotics',
    label: 'Robotics club',
    category: 'cca',
    description:
      'Hands-on engineering CCA. Strong signal for mechatronics, ECE, or computing pathways.',
  },
  {
    id: 'cca.debate',
    label: 'Debate / public speaking',
    category: 'cca',
    description:
      'Argument construction CCA. Common antecedent for law, policy, and communications pathways.',
  },
  {
    id: 'cca.community-service',
    label: 'Community service / VIA',
    category: 'cca',
    description:
      'Sustained service involvement. Surfaces in social work, education, and healthcare narratives.',
  },
  {
    id: 'cca.musicensemble',
    label: 'Music ensemble (orchestra, band, choir)',
    category: 'cca',
    description:
      'Long-form discipline CCA. Often correlated with arts-leaning humanities pathways.',
  },
  {
    id: 'cca.sports',
    label: 'Sports team',
    category: 'cca',
    description:
      'Team-sport CCA. Surfaces alongside sports science, kinesiology, and military leadership pathways.',
  },
  {
    id: 'cca.maths-olympiad',
    label: 'Maths or science olympiad',
    category: 'cca',
    description: 'Competition CCA pointing to elite STEM pathways and research-track scholarships.',
  },
  {
    id: 'cca.entrepreneurship',
    label: 'Entrepreneurship / business club',
    category: 'cca',
    description:
      'Hands-on commerce CCA. Surfaces alongside SMU, business-school, and founder pathways.',
  },

  // ── Post-secondary pathways (SG context) ───────────────────────────────────
  {
    id: 'pathway.jc',
    label: 'Junior College (JC, A-Levels)',
    category: 'pathway',
    description:
      '2-year academic-track pathway leading to local universities (NUS, NTU, SMU, SUTD, SUSS, SIT) and overseas applications.',
  },
  {
    id: 'pathway.poly',
    label: 'Polytechnic (3-year diploma)',
    category: 'pathway',
    description:
      'Applied-skill pathway leading to direct industry entry or articulation into local universities (typically into year 2 or 3).',
  },
  {
    id: 'pathway.ite',
    label: 'ITE (Institute of Technical Education)',
    category: 'pathway',
    description:
      'Skills-first pathway leading into industry or articulation into polytechnic diploma programs.',
  },
  {
    id: 'pathway.ip',
    label: 'Integrated Programme (IP)',
    category: 'pathway',
    description: 'Through-train 6-year academic pathway in selected schools, bypassing O-Levels.',
  },
  {
    id: 'pathway.uni-nus',
    label: 'NUS undergraduate',
    category: 'pathway',
    description:
      'NUS faculties span medicine, law, computing, engineering, science, business, arts and social sciences, and design.',
  },
  {
    id: 'pathway.uni-ntu',
    label: 'NTU undergraduate',
    category: 'pathway',
    description:
      'NTU is strong in engineering, business, education (NIE), and an interdisciplinary college.',
  },
  {
    id: 'pathway.uni-smu',
    label: 'SMU undergraduate',
    category: 'pathway',
    description:
      'Seminar-style university focused on business, accountancy, economics, law, computing, and social sciences.',
  },
  {
    id: 'pathway.uni-sutd',
    label: 'SUTD undergraduate',
    category: 'pathway',
    description:
      'Project-based design-and-engineering university with majors spanning architecture, engineering, and computing.',
  },
  {
    id: 'pathway.uni-sit',
    label: 'SIT undergraduate (applied learning)',
    category: 'pathway',
    description:
      'Applied-degree university with industry attachment built into many majors; strong articulation from polytechnics.',
  },
  {
    id: 'pathway.uni-suss',
    label: 'SUSS undergraduate (social sciences)',
    category: 'pathway',
    description:
      'Social-science-focused university, including part-time and full-time degrees in social work, business, and humanities.',
  },
  {
    id: 'pathway.gap-year',
    label: 'Gap year / NS (national service)',
    category: 'pathway',
    description:
      'Mandatory NS for SG male citizens; gap year for others. Common time to consolidate direction before further study.',
  },

  // ── MOE-aligned career clusters ──────────────────────────────────────────
  {
    id: 'cluster.engineering',
    label: 'Engineering and infrastructure',
    category: 'cluster',
    description:
      'Civil, mechanical, electrical, mechatronic, and systems engineering across public and private sectors.',
  },
  {
    id: 'cluster.computing',
    label: 'Computing and information sciences',
    category: 'cluster',
    description:
      'Software engineering, data science, cybersecurity, AI/ML, and product engineering roles across industries.',
  },
  {
    id: 'cluster.healthcare',
    label: 'Healthcare and life sciences',
    category: 'cluster',
    description: 'Medicine, nursing, allied health, biomedical research, and pharmacy.',
  },
  {
    id: 'cluster.education',
    label: 'Education and training',
    category: 'cluster',
    description:
      'Teaching (MOE), early childhood, special needs, training and adult education, and curriculum work.',
  },
  {
    id: 'cluster.business-finance',
    label: 'Business, finance and economics',
    category: 'cluster',
    description: 'Accountancy, banking, consulting, economics, supply-chain, and operations roles.',
  },
  {
    id: 'cluster.creative-arts',
    label: 'Creative arts, media and design',
    category: 'cluster',
    description: 'Design, fine art, performing arts, journalism, film, and digital-media roles.',
  },
  {
    id: 'cluster.public-service',
    label: 'Public service and policy',
    category: 'cluster',
    description:
      'Civil service, policy research, community development, foreign service, and public-sector leadership tracks.',
  },
  {
    id: 'cluster.legal',
    label: 'Legal services',
    category: 'cluster',
    description:
      'Practice law, in-house counsel, judiciary, and policy roles. Most pathways route through NUS Law or SMU Law.',
  },
  {
    id: 'cluster.applied-sciences',
    label: 'Applied sciences and research',
    category: 'cluster',
    description:
      'Research-track careers (A*STAR, university research, R&D in industry), spanning physical, life, and computational sciences.',
  },
]

export function lookupEcgTaxonomy(opts: {
  query: string
  category?: EcgCategory
}): EcgTaxonomyEntry[] {
  const q = opts.query.trim().toLowerCase()
  return ECG_TAXONOMY.filter((entry) => {
    if (opts.category && entry.category !== opts.category) return false
    if (!q) return true
    return (
      entry.label.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.id.toLowerCase().includes(q)
    )
  })
}
