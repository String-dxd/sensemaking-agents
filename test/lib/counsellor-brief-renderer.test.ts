/**
 * U12 — Counsellor brief markdown renderer tests.
 *
 * The renderer is a pure function: no DB, no fetches, no environment reads
 * beyond the optional `today` override. These tests exercise each U12
 * Approach guarantee and edge case from the plan:
 *   - happy path: four `## ` sections + Trajectory + disclaimer
 *   - no Trajectory yet → placeholder section
 *   - dimension with zero claims → empty-state line
 *   - forgotten exclusion happens upstream (renderer trusts the caller)
 *   - top-3 selection by `committed_at` DESC, with <3 entries falling through
 *   - markdown safety on verbatim quotes
 *   - Personality compiled-truth diagnostic-language fallback
 *   - open-questions dedup across VIPS + trajectory
 */
import { describe, expect, it } from 'vitest'
import type { CartographerOutputDraft } from '~/agents/schemas'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'
import { escapeForMarkdownBlockquote, renderCounsellorBrief } from '~/lib/counsellor-brief-renderer'

const TODAY = '2026-05-11'

function page(dim: VipsDimension, overrides: Partial<VipsPageRow> = {}): VipsPageRow {
  return {
    student_id: 'demo-a',
    dimension: dim,
    compiled_truth: `Compiled truth for ${dim}.`,
    open_question: `Open question for ${dim}?`,
    updated_at: '2026-05-10T12:00:00Z',
    ...overrides,
  }
}

let nextId = 1
function entry(
  dim: VipsDimension,
  quote: string,
  overrides: Partial<VipsTimelineEntryRow> = {},
): VipsTimelineEntryRow {
  const id = nextId++
  return {
    id,
    student_id: 'demo-a',
    dimension: dim,
    canonical_claim_id: `${dim}.fake_${id}`,
    verbatim_quote: quote,
    reflection_id: null,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-09T00:00:00Z',
    ...overrides,
  }
}

function trajectory(overrides: Partial<CartographerOutputDraft> = {}): CartographerOutputDraft {
  return {
    trajectory_paragraph:
      'Your reflections point toward applied engineering paths anchored by team-based maker work.',
    pathways: [
      {
        label: 'Mechatronics-leaning engineering',
        trait_combination: [{ claim_id: 'values.contribution', dimension: 'values' }],
        ecg_region_tags: ['cluster.engineering'],
        risks_tradeoffs: 'JC delays hands-on time by two years.',
        exploration_prompt: 'What would a Friday afternoon at a robotics lab feel like?',
      },
      {
        label: 'Computing + applied sciences',
        trait_combination: [{ claim_id: 'skills.analytical', dimension: 'skills' }],
        ecg_region_tags: ['cluster.computing'],
        risks_tradeoffs: 'Computing pathways reward solo work over team energy.',
        exploration_prompt: 'Where does your team energy live if the day-job is solo coding?',
      },
    ],
    open_questions: ['Does CCA energy carry into solo work?'],
    disclaimer:
      'This is a rough sketch from a small reflection corpus — not a prediction, not a recommendation.',
    ...overrides,
  }
}

function fourPages(): VipsPageRow[] {
  return [page('values'), page('interests'), page('personality'), page('skills')]
}

function emptyTimelines(): Record<VipsDimension, VipsTimelineEntryRow[]> {
  return { values: [], interests: [], personality: [], skills: [] }
}

describe('renderCounsellorBrief — happy path', () => {
  it('emits all four dimension headings + Trajectory + disclaimer + header', () => {
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: {
        values: [entry('values', 'i lit up working through the wiring with my team')],
        interests: [entry('interests', 'i kept asking why until the teacher gave up')],
        personality: [entry('personality', 'i recharge by being around my CCA friends')],
        skills: [entry('skills', 'i decomposed the maths problem into three steps')],
      },
      trajectory: trajectory(),
    })

    expect(md).toMatch(/^# Counsellor Brief — demo-a — 2026-05-11/)
    expect(md).toContain('## Values')
    expect(md).toContain('## Interests')
    expect(md).toContain('## Personality')
    expect(md).toContain('## Skills')
    expect(md).toContain('## Trajectory')
    expect(md).toContain('### Top pathways')
    expect(md).toContain('## Open questions')
    expect(md).toContain('## Disclaimer')
    expect(md).toContain('Developer/demo debugging artifact')
    // Verbatim quote rendered as blockquote with strength badge.
    expect(md).toContain('> "i lit up working through the wiring with my team" — medium strength')
  })
})

describe('renderCounsellorBrief — Trajectory absent', () => {
  it('replaces the Trajectory body with the "not yet generated" placeholder', () => {
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: {
        values: [entry('values', 'q')],
        interests: [],
        personality: [],
        skills: [],
      },
      trajectory: null,
    })
    expect(md).toContain('## Trajectory')
    expect(md).toContain('_Trajectory not yet generated — run sense-making to populate._')
    expect(md).not.toContain('### Top pathways')
    // Disclaimer placeholder lives in the disclaimer section.
    expect(md).toContain('## Disclaimer')
    expect(md).toContain('_Disclaimer will appear once sense-making has been run._')
  })
})

describe('renderCounsellorBrief — empty dimension', () => {
  it('renders the empty-state line for a dimension with zero claims', () => {
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: {
        values: [entry('values', 'q1')],
        interests: [],
        personality: [entry('personality', 'q2')],
        skills: [entry('skills', 'q3')],
      },
      trajectory: trajectory(),
    })
    expect(md).toContain('_No verified claims yet for interests._')
    // Other dimensions still render their quote.
    expect(md).toContain('> "q1" — medium strength')
  })
})

describe('renderCounsellorBrief — forgotten exclusion (caller responsibility)', () => {
  it('renders only entries the caller passes in (no inspection of forgotten_at)', () => {
    // Caller has already excluded the forgotten entry; the renderer must not
    // re-introduce it. We deliberately do NOT pass the forgotten row in.
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: {
        values: [entry('values', 'still here')],
        interests: [],
        personality: [],
        skills: [],
      },
      trajectory: null,
    })
    expect(md).toContain('> "still here" — medium strength')
    expect(md).not.toContain('forgotten quote')
  })
})

describe('renderCounsellorBrief — top-3 selection', () => {
  it('selects the 3 most-recent entries by committed_at DESC when a dimension has > 3', () => {
    const entries: VipsTimelineEntryRow[] = [
      entry('values', 'oldest', { committed_at: '2026-04-01T00:00:00Z' }),
      entry('values', 'newest', { committed_at: '2026-05-01T00:00:00Z' }),
      entry('values', 'middle-1', { committed_at: '2026-04-20T00:00:00Z' }),
      entry('values', 'second-newest', { committed_at: '2026-04-30T00:00:00Z' }),
      entry('values', 'middle-2', { committed_at: '2026-04-15T00:00:00Z' }),
    ]
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: { ...emptyTimelines(), values: entries },
      trajectory: null,
    })
    expect(md).toContain('> "newest"')
    expect(md).toContain('> "second-newest"')
    expect(md).toContain('> "middle-1"')
    expect(md).not.toContain('> "middle-2"')
    expect(md).not.toContain('> "oldest"')
  })

  it('renders all entries when the dimension has ≤ 3', () => {
    const entries: VipsTimelineEntryRow[] = [
      entry('values', 'a', { committed_at: '2026-04-01T00:00:00Z' }),
      entry('values', 'b', { committed_at: '2026-05-01T00:00:00Z' }),
    ]
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: { ...emptyTimelines(), values: entries },
      trajectory: null,
    })
    expect(md).toContain('> "a"')
    expect(md).toContain('> "b"')
  })
})

describe('renderCounsellorBrief — markdown safety', () => {
  it('escapes markdown special characters in verbatim quotes', () => {
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages: fourPages(),
      timelineByDimension: {
        ...emptyTimelines(),
        values: [entry('values', 'this is *emphasis* and `code` and [link] and > nest')],
      },
      trajectory: null,
    })
    // The literal `*emphasis*` would render as italics; escaped form keeps it visible.
    expect(md).toContain('\\*emphasis\\*')
    expect(md).toContain('\\`code\\`')
    expect(md).toContain('\\[link\\]')
    expect(md).toContain('\\> nest')
    // And the raw unescaped sequence should NOT appear.
    expect(md).not.toContain('this is *emphasis*')
  })

  it('escapeForMarkdownBlockquote handles backslashes first and collapses newlines', () => {
    expect(escapeForMarkdownBlockquote('back\\slash')).toBe('back\\\\slash')
    expect(escapeForMarkdownBlockquote('line one\nline two')).toBe('line one line two')
    expect(escapeForMarkdownBlockquote('he said "hi"')).toBe('he said \\"hi\\"')
  })
})

describe('renderCounsellorBrief — Personality safety', () => {
  it('replaces the Personality compiled_truth when diagnostic-language flagged', () => {
    const pages = fourPages()
    const personalityIdx = pages.findIndex((p) => p.dimension === 'personality')
    pages[personalityIdx] = page('personality', {
      // This phrasing trips `PERSONALITY_REWRITE_PATTERNS` in `src/lib/safety.ts`
      // (`(?:they|she|he) (?:is|are) an? (?:\w+ )?(introvert|...|conscientious|...)`).
      compiled_truth: 'They are an introvert who recharges alone.',
    })
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages,
      timelineByDimension: {
        ...emptyTimelines(),
        personality: [entry('personality', 'i recharge alone after CCAs')],
      },
      trajectory: null,
    })
    expect(md).toContain('_Personality summary withheld pending review._')
    expect(md).not.toContain('They are an introvert')
    // Timeline quote is direct student speech — must still render.
    expect(md).toContain('> "i recharge alone after CCAs" — medium strength')
  })

  it('passes through a clean Personality compiled_truth unchanged', () => {
    const pages = fourPages()
    const personalityIdx = pages.findIndex((p) => p.dimension === 'personality')
    pages[personalityIdx] = page('personality', {
      compiled_truth: 'Sustains longer attention in argument-driven group tasks.',
    })
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages,
      timelineByDimension: emptyTimelines(),
      trajectory: null,
    })
    expect(md).toContain('Sustains longer attention in argument-driven group tasks.')
    expect(md).not.toContain('withheld pending review')
  })
})

describe('renderCounsellorBrief — open-questions dedup', () => {
  it('dedups across VIPS + trajectory case-insensitively, preserving VIPS-first order', () => {
    const pages: VipsPageRow[] = [
      page('values', { open_question: 'What does meaning look like in a job?' }),
      page('interests', { open_question: 'Where does curiosity pull you next?' }),
      page('personality', { open_question: 'When does solitude help vs hurt?' }),
      page('skills', { open_question: 'Which competency feels like reach?' }),
    ]
    const traj = trajectory({
      open_questions: [
        // Exact duplicate (case-insensitive) of the values open_question
        'WHAT DOES MEANING LOOK LIKE IN A JOB?',
        'Does the same energy show up outside CCAs?',
      ],
    })
    const md = renderCounsellorBrief({
      studentId: 'demo-a',
      today: TODAY,
      pages,
      timelineByDimension: emptyTimelines(),
      trajectory: traj,
    })
    // Open-questions section is the dedup target.
    const openQuestionsSection = md.split('## Open questions')[1]?.split('## Disclaimer')[0] ?? ''
    expect(openQuestionsSection).toContain('What does meaning look like in a job?')
    expect(openQuestionsSection).not.toContain('WHAT DOES MEANING LOOK LIKE IN A JOB?')
    expect(openQuestionsSection).toContain('Does the same energy show up outside CCAs?')
    // VIPS-first ordering: the values question precedes the trajectory question.
    expect(openQuestionsSection.indexOf('What does meaning look like in a job?')).toBeLessThan(
      openQuestionsSection.indexOf('Does the same energy show up outside CCAs?'),
    )
  })
})
