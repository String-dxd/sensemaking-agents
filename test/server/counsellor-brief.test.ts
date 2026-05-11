/**
 * U12 — Counsellor brief server handler integration test.
 *
 * Seeds the in-memory DB through the v0.2 multi-student fixture, upserts a
 * minimal set of `vips_pages` + `vips_timeline_entries` + a
 * `cartographer_outputs` row for `demo-a`, then calls
 * `counsellorBriefHandler` and runs a markdown sanity check on the response
 * (first line starts with `# Counsellor Brief`, all four `## ` dimension
 * headers appear, Trajectory + Disclaimer sections appear).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertCartographerOutput, insertVipsTimelineEntry, upsertVipsPage } from '~/db/queries'
import { seed } from '~/db/seed'
import { counsellorBriefHandler } from '~/server/counsellor-brief.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
})

function seedDemoAWiki(): void {
  // Four compiled-truth pages + one timeline entry per dimension. Voice
  // calibration here is illustrative — the renderer doesn't grade tone, only
  // that the Personality compiled_truth is non-diagnostic.
  upsertVipsPage('demo-a', {
    dimension: 'values',
    compiled_truth:
      'You orient toward helping others one-to-one and notice when that work feels different from group work.',
    open_question: 'When does helping become "doing the Mei thing" — and how do you tell?',
  })
  upsertVipsPage('demo-a', {
    dimension: 'interests',
    compiled_truth:
      'Behaviour shape: drawn to person-facing settings (mentoring, befriending, group-facing CCA roles).',
    open_question: 'Where does the same pull show up outside school?',
  })
  upsertVipsPage('demo-a', {
    dimension: 'personality',
    compiled_truth:
      'Sustains attention longer in person-facing tasks than in solo-doodling settings.',
    open_question: 'Does the energy hold in roles where you cannot see who you are helping?',
  })
  upsertVipsPage('demo-a', {
    dimension: 'skills',
    compiled_truth:
      'Competencies practiced: reading the room, mediating, translating between adults and peers.',
    open_question: 'Which competency feels like reach versus comfort?',
  })

  for (const dim of ['values', 'interests', 'personality', 'skills'] as const) {
    insertVipsTimelineEntry('demo-a', {
      dimension: dim,
      canonical_claim_id: `${dim}.contribution`,
      verbatim_quote: `quote for ${dim}`,
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['school'],
    })
  }

  // v0.2 lead-sheet pathways are persisted verbatim in `pathways_json`; the
  // row's typed `CartographerPathway` field is the legacy v0.1 shape and is
  // narrowed by the handler before render. We funnel the v0.2 lead-sheet
  // through `unknown` once, then back into the legacy-typed `pathways`
  // parameter, to mirror the production path.
  const v02Pathways: unknown = [
    {
      label: 'School counselling / peer support',
      trait_combination: [{ claim_id: 'values.contribution', dimension: 'values' }],
      ecg_region_tags: ['cluster.social_services'],
      risks_tradeoffs: 'Emotionally demanding; sustainability depends on supervision and breaks.',
      exploration_prompt: 'What would shadowing the school counsellor for an hour feel like?',
    },
  ]
  insertCartographerOutput('demo-a', {
    trajectory_text:
      'Your reflections point toward person-facing helping roles — counselling, peer support, social work — anchored by a steady pull toward one-to-one work.',
    pathways: v02Pathways as Parameters<typeof insertCartographerOutput>[1]['pathways'],
    open_questions: ['Does the same energy show up outside CCAs?'],
    disclaimer: 'These are paths the pattern points toward, not careers to choose.',
    raw_output: {},
  })
}

describe('counsellorBriefHandler — integration round trip', () => {
  it('renders a markdown brief for demo-a that contains all four ## dimension headers + Trajectory + Disclaimer', () => {
    seedDemoAWiki()
    const result = counsellorBriefHandler({ studentId: 'demo-a' })

    expect(typeof result.markdown).toBe('string')
    const firstLine = result.markdown.split('\n', 1)[0] ?? ''
    expect(firstLine.startsWith('# Counsellor Brief')).toBe(true)
    expect(firstLine).toContain('demo-a')

    expect(result.markdown).toContain('## Values')
    expect(result.markdown).toContain('## Interests')
    expect(result.markdown).toContain('## Personality')
    expect(result.markdown).toContain('## Skills')
    expect(result.markdown).toContain('## Trajectory')
    expect(result.markdown).toContain('### Top pathways')
    expect(result.markdown).toContain('## Open questions')
    expect(result.markdown).toContain('## Disclaimer')

    // Compiled truths surface verbatim.
    expect(result.markdown).toContain('orient toward helping others one-to-one')
    // Pathway label + exploration prompt surface in the Top pathways list.
    expect(result.markdown).toContain('**School counselling / peer support**')
    expect(result.markdown).toContain('shadowing the school counsellor')
    // Timeline quote rendered as blockquote with strength badge.
    expect(result.markdown).toContain('> "quote for values" — medium strength')
  })

  it('renders the "Trajectory not yet generated" placeholder when no cartographer_outputs row exists', () => {
    // No cartographer_outputs row — just a couple of pages + entries so the
    // dimension sections still have content.
    upsertVipsPage('demo-a', {
      dimension: 'values',
      compiled_truth: 'You orient toward helping others.',
      open_question: 'Where does helping become a habit?',
    })
    insertVipsTimelineEntry('demo-a', {
      dimension: 'values',
      canonical_claim_id: 'values.contribution',
      verbatim_quote: 'i made her teh-o and asked her to sit',
      reflection_id: null,
      strength: 'medium',
      parallax_tag: ['family'],
    })

    const result = counsellorBriefHandler({ studentId: 'demo-a' })
    expect(result.markdown).toContain('## Trajectory')
    expect(result.markdown).toContain(
      '_Trajectory not yet generated — run sense-making to populate._',
    )
    expect(result.markdown).not.toContain('### Top pathways')
  })

  it('rejects an empty studentId via Zod', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
    expect(() => counsellorBriefHandler({ studentId: '' } as any)).toThrow()
  })

  it('isolates across students — demo-b sees only its own (empty) wiki', () => {
    seedDemoAWiki()
    const result = counsellorBriefHandler({ studentId: 'demo-b' })
    // demo-b has no upserted vips_pages or timeline entries, so every
    // dimension renders the empty-state line and trajectory is absent.
    expect(result.markdown).toContain('_No verified claims yet for values._')
    expect(result.markdown).toContain(
      '_Trajectory not yet generated — run sense-making to populate._',
    )
    // And demo-a's compiled truth must NOT leak across.
    expect(result.markdown).not.toContain('orient toward helping others one-to-one')
  })
})
