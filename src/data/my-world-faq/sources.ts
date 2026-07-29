import type { FaqProductProvenance, FaqSource } from './types'

/**
 * External sources are limited to official guidance/policy, publisher records
 * for research syntheses, and original study records. Community conversations
 * deliberately do not appear here: they shape questions, not factual claims.
 */
export const FAQ_SOURCES = [
  {
    id: 'moe-ai-education-2025',
    kind: 'official-policy',
    title: 'Artificial intelligence in education',
    publisher: 'Singapore Ministry of Education',
    authors: ['Singapore Ministry of Education'],
    published: 'Last updated 5 December 2025',
    url: 'https://www.moe.gov.sg/education-in-sg/educational-technology-journey/edtech-masterplan/artificial-intelligence-in-education',
    populationContext: 'Singapore students and educators using AI for teaching and learning.',
    method: 'Official policy and ethics framework.',
    fit: 'Sets the relevant principles of Agency, Inclusivity, Fairness and Safety, with age- and development-appropriate use.',
    limitations:
      'It is a governance framework, not an evaluation of My World and not evidence of MOE endorsement.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'moe-purposeful-screen-use-2025',
    kind: 'official-guidance',
    title:
      'What you need to know about MOE’s views on Digital Devices and Purposeful and Healthy Screen Use',
    publisher: 'Singapore Ministry of Education',
    authors: ['Singapore Ministry of Education'],
    published: 'Last updated 28 March 2025',
    url: 'https://www.moe.gov.sg/news/edtalks/what-you-need-to-know-about-moes-views-on-digital-devices-and-purposeful-and-healthy-screen-use',
    populationContext: 'Singapore school students, including secondary students using PLDs.',
    method: 'Official guidance summarising MOE’s calibrated, purposeful-use posture.',
    fit: 'Directly informs the question of adding another digital activity to a student’s day.',
    limitations:
      'Purpose does not cancel cumulative screen burden, and the page does not evaluate My World usage.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'moh-screen-use-2025',
    kind: 'official-guidance',
    title: 'Guidance on screen use in children',
    publisher: 'Singapore Ministry of Health',
    authors: ['Singapore Ministry of Health'],
    published: '21 January 2025',
    url: 'https://www.moh.gov.sg/others/resources-and-statistics/guidance-on-screen-use/',
    populationContext: 'Children aged 0–12 and their families in Singapore.',
    method: 'Official health guidance developed with healthcare, social and education experts.',
    fit: 'Supports treating cumulative screen use and family involvement as real design considerations.',
    limitations:
      'Its age-specific limits apply to children aged 0–12 and must not be transferred directly to secondary students.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'pdpc-childrens-data-2024',
    kind: 'official-guidance',
    title:
      'Advisory Guidelines on the PDPA for Children’s Personal Data in the Digital Environment',
    publisher: 'Personal Data Protection Commission Singapore',
    authors: ['Personal Data Protection Commission Singapore'],
    published: '27 March 2024',
    url: 'https://www.pdpc.gov.sg/guidelines-and-consultation/2024/03/advisory-guidelines-on-the-pdpa-for-childrens-personal-data-in-the-digital-environment',
    populationContext:
      'Online products and services likely to be accessed by people under 21 in Singapore.',
    method: 'Official advisory guidance interpreting PDPA obligations for children’s data.',
    fit: 'Supports data-protection-by-design, understandable notices and higher care for student data.',
    limitations:
      'It does not verify this deployment’s contracts, access list, retention, residency or deletion path.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'unicef-ai-children-v3-2025',
    kind: 'official-guidance',
    title: 'Guidance on AI and children, version 3.0',
    publisher: 'UNICEF Office of Strategy and Evidence – Innocenti',
    authors: ['UNICEF Office of Strategy and Evidence – Innocenti'],
    published: 'December 2025',
    url: 'https://www.unicef.org/innocenti/reports/policy-guidance-ai-children',
    populationContext: 'Children worldwide and organisations developing or governing AI they use.',
    method:
      'Child-rights policy guidance informed by expert consultation, peer review and a twelve-country study.',
    fit: 'Supports safety, privacy, fairness, transparency, agency and child-development requirements.',
    limitations:
      'It is global policy guidance, not product-specific outcome evidence or a Singapore legal determination.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'who-digital-youth-2025',
    kind: 'official-guidance',
    title: 'Addressing the digital determinants of youth mental health and well-being',
    publisher: 'World Health Organization Regional Office for Europe',
    authors: ['World Health Organization Regional Office for Europe'],
    published: '23 May 2025',
    url: 'https://www.who.int/europe/publications/i/item/WHO-EURO-2025-12187-51959-79685',
    identifier: 'WHO/EURO:2025-12187-51959-79685',
    populationContext: 'Young people in the WHO European Region.',
    method: 'Policy brief based on an evidence review and policy mapping.',
    fit: 'Supports measuring content, context, displacement and subgroup vulnerability, not duration alone.',
    limitations:
      'The evidence is mixed, bidirectional and regionally broader than Singapore secondary students.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'stanford-k12-ai-review-2026',
    kind: 'evidence-review',
    title: 'The Evidence Base on AI in K-12: A 2026 Review',
    publisher: 'SCALE Initiative, Stanford University',
    authors: ['Lily Fesler', 'JP Martinez', 'Chris Agnew', 'Susanna Loeb'],
    published: '2026',
    url: 'https://scale.stanford.edu/sites/default/files/The%20Evidence%20Base%20on%20AI%20in%20K-12%20Report.pdf',
    populationContext:
      'Research relevant to K–12 students and educators, with many studies outside US K–12 settings.',
    method:
      'Review of 818 repository papers, with human review of 20 studies judged to offer strong causal evidence.',
    fit: 'Supports the conclusion that K–12 social, emotional and equity evidence remains limited.',
    limitations:
      'The repository is preprint-heavy, searches a bounded corpus, and does not evaluate reflective companions like My World.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'adolescent-expressive-writing-meta-2015',
    kind: 'meta-analysis',
    title:
      'How effective are expressive writing interventions for adolescents? A meta-analytic review',
    publisher: 'Clinical Psychology Review',
    authors: ['Gabriele Travagin', 'Davide Margola', 'Tracey A. Revenson'],
    published: '2015',
    url: 'https://pubmed.ncbi.nlm.nih.gov/25656314/',
    identifier: 'doi:10.1016/j.cpr.2015.01.003',
    populationContext: 'Adolescents aged 10–18 across 21 independent expressive-writing studies.',
    method: 'Meta-analysis of expressive-writing interventions.',
    fit: 'Supports reflection as a plausible educational hypothesis with small, promising effects.',
    limitations:
      'The evidence was not decisive, interventions varied, and none tested My World, voice capture or Kira.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'gamified-learning-review-2023',
    kind: 'systematic-review',
    title:
      'The role of gamified learning strategies in student’s motivation in high school and higher education',
    publisher: 'Heliyon',
    authors: ['Elias Ratinho', 'Cátia Martins'],
    published: '2023',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37636393/',
    identifier: 'doi:10.1016/j.heliyon.2023.e19033',
    populationContext: 'High-school and higher-education learners across 40 reviewed studies.',
    method: 'PRISMA systematic review of gamification and motivation research.',
    fit: 'Supports separating individual game elements and short-term motivation from durable outcomes.',
    limitations:
      'Designs and populations varied; it neither proves the island helps nor that omitting points prevents dependency.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'mit-stanford-adult-chatbot-rct-2025',
    kind: 'primary-study',
    title: 'How AI and Human Behaviors Shape Psychosocial Effects of Chatbot Use',
    publisher: 'MIT Media Lab and Stanford SCALE Initiative',
    authors: [
      'Cathy Mengying Fang',
      'Auren R. Liu',
      'Valdemar Danry',
      'Eunhae Lee',
      'Samantha W. T. Chan',
      'Pat Pataranutaporn',
      'Pattie Maes',
      'Jason Phang',
      'Michael Lampe',
      'Lama Ahmad',
      'Sandhini Agarwal',
    ],
    published: 'March 2025',
    url: 'https://scale.stanford.edu/ai/repository/how-ai-and-human-behaviors-shape-psychosocial-effects-chatbot-use-longitudinal',
    populationContext:
      'Adults in a four-week randomised study (n=981; more than 300,000 messages).',
    method:
      'Longitudinal randomised controlled study of text/voice modes, conversation types and psychosocial outcomes.',
    fit: 'An adult risk signal for measuring usage intensity, trust, dependence and human socialisation.',
    limitations:
      'Adult, general-chatbot findings are not evidence of effects on Singapore secondary students or on My World.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'adolescent-bot-limit-study-2025',
    kind: 'primary-study',
    title: 'The Ability of AI Therapy Bots to Set Limits With Distressed Adolescents',
    publisher: 'JMIR Mental Health',
    authors: ['Andrew Clark'],
    published: '18 August 2025',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40825182/',
    identifier: 'doi:10.2196/78414',
    populationContext:
      'Ten public therapy or companion bots responding to six fictional adolescent distress proposals.',
    method: 'Simulation-based comparison study using fictional case vignettes.',
    fit: 'Identifies harmful endorsement and weak boundary-setting as failure modes to red-team.',
    limitations:
      'It did not involve real students, did not test My World and sampled a small convenience set of bots.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'us-youth-chatbot-risk-survey-2026',
    kind: 'primary-study',
    title: 'Risks and Harms of Conversational Artificial Intelligence Chatbot Use Among US Youth',
    publisher: 'Journal of Adolescence',
    authors: ['Sameer Hinduja', 'Justin W. Patchin'],
    published: '2026',
    url: 'https://pubmed.ncbi.nlm.nih.gov/42076960/',
    identifier: 'doi:10.1002/jad.70164',
    populationContext: 'A nationally representative online sample of 3,466 US youth aged 13–17.',
    method: 'Cross-sectional anonymous survey of use, motivations and reported unsafe experiences.',
    fit: 'Provides age-relevant risk categories for safety, disclosure, manipulation and subgroup testing.',
    limitations:
      'Self-report and cross-sectional design cannot establish causation; US general-chatbot use is not My World use.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'adolescent-chatbot-meta-2025',
    kind: 'meta-analysis',
    title:
      'The Effectiveness of AI Chatbots in Alleviating Mental Distress and Promoting Health Behaviors Among Adolescents and Young Adults',
    publisher: 'Journal of Medical Internet Research',
    authors: ['Xinyu Feng', 'Lidan Tian', 'Grace W. K. Ho', 'Janelle Yorke', 'Vivian Hui'],
    published: '26 November 2025',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41313175/',
    identifier: 'doi:10.2196/79850',
    populationContext:
      '31 randomised trials with 29,637 participants aged 15–39 in mental-health and health-behaviour contexts.',
    method: 'Systematic review and meta-analysis of randomised controlled trials.',
    fit: 'Shows that chatbot outcomes vary by population, control and design, and that safety protocols matter.',
    limitations:
      'The age range includes adults; most systems and outcomes differ from My World, and generative-system evidence was inconclusive.',
    lastChecked: '2026-07-28',
  },
] as const satisfies readonly FaqSource[]

/**
 * Repository evidence is intentionally narrower than a marketing claim. Each
 * item names what the inspected source can establish and what it cannot.
 */
export const FAQ_PRODUCT_PROVENANCE = [
  {
    id: 'faq-origin-requirements',
    title: 'My World Signals → Sensemaking FAQ requirements',
    repoPaths: ['docs/brainstorms/2026-07-28-my-world-signals-faq-requirements.md'],
    claimScope: 'Committed concerns, evidence labels, known unknowns and proposed pilot posture.',
    populationContext: 'The intended MOE/DXD audience and affected Singapore secondary students.',
    fit: 'Authoritative source for what this FAQ must cover and which claims remain unsettled.',
    limitations: 'A requirements document does not prove product behavior or external outcomes.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-current-product-shape',
    title: 'Current product shape and agent handoff',
    repoPaths: [
      'README.md',
      'CLAUDE.md',
      'src/components/student-space/capture/AskSheet.tsx',
      'src/server/mirror-function-schemas.ts',
    ],
    claimScope: 'Current routes, capture flow, agent roles and signed-in product boundaries.',
    populationContext: 'The current My World prototype repository.',
    fit: 'Establishes the high-level Capture → Reflect → Sensemake → Review flow.',
    limitations: 'Documentation can drift; publication still requires a live product review.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-kira-live-role',
    title: 'Live Kira and Mirror prompt boundaries',
    repoPaths: [
      'src/agents/openai-realtime/mirror-realtime-live.prompt.md',
      'src/agents/mirror.prompt.md',
      'src/agents/openai-realtime/mirror-payloads.ts',
    ],
    claimScope:
      'Short turns, one question at a time, warm friend-like language and prompt prohibitions.',
    populationContext: 'The current Kira voice and structured Mirror paths.',
    fit: 'Shows both the intended bounded role and the companion-like warmth readers are asking about.',
    limitations:
      'Prompt instructions influence behavior but do not guarantee every model response.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-review-log-forget',
    title: 'Student review, Log and Forget controls',
    repoPaths: [
      'src/components/student-space/capture/AskSheet.tsx',
      'src/lib/student-space/backend-bridge.ts',
      'src/components/student-space/sheets/MirrorDetailSheet.tsx',
      'src/server/forget-timeline-entry.handler.server.ts',
    ],
    claimScope:
      'Students can review a prepared reflection, Log or Forget it, and forget committed timeline evidence.',
    populationContext: 'Current capture, History and VIPS evidence paths.',
    fit: 'Establishes real agency controls available in the prototype.',
    limitations:
      'It does not establish deletion from every processor, log, backup or downstream system.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-connector-verifier',
    title: 'Deterministic Connector evidence gate',
    repoPaths: [
      'src/agents/verifier.ts',
      'src/server/auto-connector.handler.server.ts',
      'README.md',
    ],
    claimScope:
      'Canonical taxonomy IDs and transcript-quote matching gate proposed VIPS timeline links before persistence.',
    populationContext: 'The later Connector-to-VIPS linking path.',
    fit: 'Establishes a concrete structural evidence check for admitted timeline links.',
    limitations:
      'The gate does not verify every sentence generated by Mirror, Connector or Cartographer.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-self-critique-best-effort',
    title: 'Best-effort self-critique behavior',
    repoPaths: [
      'src/agents/self-critique-eval.ts',
      'src/agents/self_critique.prompt.md',
      'README.md',
    ],
    claimScope:
      'Self-critique reviews quality and safety but returns null on missing binding or failure.',
    populationContext: 'Mirror, Connector and Cartographer draft evaluation.',
    fit: 'Establishes that the evaluator is an advisory lens rather than a blocking safety gate.',
    limitations: 'It does not prevent unsafe output when absent, failing or incomplete.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-island-progression',
    title: 'Current capture-driven island progression',
    repoPaths: [
      'src/engine/student-space/Game/State/Sprouts.js',
      'src/engine/student-space/Game/View/Sprouts.js',
      'docs/brainstorms/2026-05-18-island-object-progression-requirements.md',
    ],
    claimScope:
      'Capture and mood references grow a sprout toward a threshold; the student triggers the bloom.',
    populationContext: 'The current visual island progression in the prototype.',
    fit: 'Answers honestly how capturing affects the world today.',
    limitations:
      'The visual threshold counts capture references, not a validated measure of reflection quality.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-engagement-mechanics-audit',
    title: 'Current engagement-mechanics posture',
    repoPaths: [
      'docs/brainstorms/2026-05-18-island-object-progression-requirements.md',
      'src/engine/student-space/Game/State/Sprouts.js',
      'src/components/student-space/navigation/SideRail.tsx',
    ],
    claimScope:
      'No generic XP, streak, leaderboard, ranking or student-comparison system appears in the current product surface.',
    populationContext: 'The current prototype repository as reviewed on 28 July 2026.',
    fit: 'Establishes omitted mechanics as a present design choice.',
    limitations:
      'Absence of these mechanics does not establish low use, healthy use or freedom from dependency.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-capture-sensemaking-timing',
    title: 'Capture-time versus later sensemaking timing',
    repoPaths: [
      'README.md',
      'docs/solutions/2026-07-23-connector-at-capture-spike.md',
      'src/lib/student-space/backend-bridge.ts',
    ],
    claimScope:
      'Mirror saves a thought first; Connector links evidence later, with capture-time Connector behavior feature-controlled.',
    populationContext: 'Current production-default and demo-flagged Connector paths.',
    fit: 'Prevents the FAQ from presenting all sensemaking as immediate.',
    limitations: 'Live latency remains unmeasured and feature flags can vary by deployment.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-raw-audio-path-gap',
    title: 'Raw-audio and provider-contract verification gap',
    repoPaths: [
      'README.md',
      'src/lib/student-space/realtime-mirror-client.ts',
      'src/server/transcribe-mirror.handler.server.ts',
      'docs/brainstorms/2026-07-28-my-world-signals-faq-requirements.md',
    ],
    claimScope:
      'The app code contains transient audio paths and persisted transcripts, while end-to-end provider terms remain unverified for publication.',
    populationContext: 'Current Realtime capture plus legacy/support transcription utilities.',
    fit: 'Supports keeping retention, training, residency, access and deletion claims as Team checks.',
    limitations:
      'Repository inspection cannot establish provider-side handling or deployed contractual terms.',
    lastChecked: '2026-07-28',
  },
  {
    id: 'repo-field-signals-unverified',
    title: 'Undocumented field-signal report',
    repoPaths: ['docs/brainstorms/2026-07-28-my-world-signals-faq-requirements.md'],
    claimScope:
      'The team reports student engagement, teacher support and school field-research learning without documented sample, method or caveats.',
    populationContext: 'Unspecified students, teachers and schools where the concept was explored.',
    fit: 'Permits the signals to be named only as prompts for further verification.',
    limitations: 'No sample, method, permission, scope or causal interpretation is attached.',
    lastChecked: '2026-07-28',
  },
] as const satisfies readonly FaqProductProvenance[]
