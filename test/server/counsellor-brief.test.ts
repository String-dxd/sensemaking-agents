/**
 * U12 — Counsellor brief server handler tests.
 *
 * The handler's job is orchestration: bind one `withStudent` transaction,
 * read the four VIPS pages + per-dimension non-forgotten timeline entries +
 * the latest `cartographer_outputs` row *through that same ctx*, stub any
 * missing dimension, and hand the assembled input to the pure
 * `renderCounsellorBrief`.
 *
 * So the DB surfaces are mocked and `renderCounsellorBrief` is kept real —
 * that way the markdown sanity checks (first line starts with
 * `# Counsellor Brief`, all four `## ` dimension headers, Trajectory +
 * Disclaimer) still exercise the genuine renderer, while the assertions
 * about *which* queries ran, under which student id, and sharing which
 * transaction, exercise the handler. No database — see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { counsellorBriefHandler } from '~/server/counsellor-brief.handler.server'

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())
const listVipsPagesMock = vi.hoisted(() => vi.fn())
const listVipsTimelineEntriesMock = vi.hoisted(() => vi.fn())
const latestCartographerOutputMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

vi.mock('~/db/queries', () => ({
  listVipsPages: (studentId: string, opts: unknown) => listVipsPagesMock(studentId, opts),
  listVipsTimelineEntries: (studentId: string, dim: string, opts: unknown) =>
    listVipsTimelineEntriesMock(studentId, dim, opts),
  latestCartographerOutput: (studentId: string, opts: unknown) =>
    latestCartographerOutputMock(studentId, opts),
}))

/** The stand-in transaction handed to the handler by the mocked `withStudent`. */
const CTX = { db: {}, studentId: 'demo-a' }

function page(dimension: string, compiled_truth: string, open_question: string) {
  return {
    student_id: 'demo-a',
    dimension,
    compiled_truth,
    open_question,
    updated_at: '2026-05-19T08:00:00.000Z',
  }
}

function entry(dimension: string, verbatim_quote: string) {
  return {
    id: 1,
    student_id: 'demo-a',
    dimension,
    canonical_claim_id: `${dimension}.contribution`,
    verbatim_quote,
    reflection_id: null,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-19T08:00:00.000Z',
  }
}

/** The four compiled-truth pages the old fixture upserted for demo-a. */
function demoAPages() {
  return [
    page(
      'values',
      'You orient toward helping others one-to-one and notice when that work feels different from group work.',
      'When does helping become "doing the Alice thing" — and how do you tell?',
    ),
    page(
      'interests',
      'Behaviour shape: drawn to person-facing settings (mentoring, befriending, group-facing CCA roles).',
      'Where does the same pull show up outside school?',
    ),
    page(
      'personality',
      'Sustains attention longer in person-facing tasks than in solo-doodling settings.',
      'Does the energy hold in roles where you cannot see who you are helping?',
    ),
    page(
      'skills',
      'Competencies practiced: reading the room, mediating, translating between adults and peers.',
      'Which competency feels like reach versus comfort?',
    ),
  ]
}

const demoACartographerRow = {
  id: 5,
  trajectory_text:
    'Your reflections point toward person-facing helping roles — counselling, peer support, social work — anchored by a steady pull toward one-to-one work.',
  pathways: [
    {
      label: 'School counselling / peer support',
      trait_combination: [{ claim_id: 'values.contribution', dimension: 'values' }],
      ecg_region_tags: ['cluster.social_services'],
      risks_tradeoffs: 'Emotionally demanding; sustainability depends on supervision and breaks.',
      exploration_prompt: 'What would shadowing the school counsellor for an hour feel like?',
    },
  ],
  open_questions: ['Does the same energy show up outside CCAs?'],
  disclaimer: 'These are paths the pattern points toward, not careers to choose.',
}

beforeEach(() => {
  requireCounselorContextMock.mockReset()
  withStudentMock.mockReset()
  listVipsPagesMock.mockReset()
  listVipsTimelineEntriesMock.mockReset()
  latestCartographerOutputMock.mockReset()

  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo-a',
  })
  withStudentMock.mockImplementation(async (_studentId, fn) => fn(CTX))
  // Defaults: an empty wiki. Individual tests override.
  listVipsPagesMock.mockResolvedValue([])
  listVipsTimelineEntriesMock.mockResolvedValue([])
  latestCartographerOutputMock.mockResolvedValue(null)
})

describe('counsellorBriefHandler — integration round trip', () => {
  it('renders a markdown brief for demo-a that contains all four ## dimension headers + Trajectory + Disclaimer', async () => {
    listVipsPagesMock.mockResolvedValue(demoAPages())
    listVipsTimelineEntriesMock.mockImplementation(async (_sid, dim) => [
      entry(dim, `quote for ${dim}`),
    ])
    latestCartographerOutputMock.mockResolvedValue(demoACartographerRow)

    const result = await counsellorBriefHandler({})

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

    // Orchestration: one transaction, and every read shares it.
    expect(withStudentMock).toHaveBeenCalledTimes(1)
    expect(withStudentMock.mock.calls[0]?.[0]).toBe('demo-a')
    expect(listVipsPagesMock).toHaveBeenCalledWith('demo-a', { ctx: CTX })
    expect(latestCartographerOutputMock).toHaveBeenCalledWith('demo-a', { ctx: CTX })
    // One timeline read per dimension, in canonical VIPS order.
    expect(listVipsTimelineEntriesMock.mock.calls.map((c) => c[1])).toEqual([
      'values',
      'interests',
      'personality',
      'skills',
    ])
    for (const call of listVipsTimelineEntriesMock.mock.calls) {
      expect(call[0]).toBe('demo-a')
      // R19: no `includeForgotten` — forgotten rows must stay out of the brief.
      expect(call[2]).toEqual({ ctx: CTX })
    }
  })

  it('renders the "Trajectory not yet generated" placeholder when no cartographer_outputs row exists', async () => {
    listVipsPagesMock.mockResolvedValue([
      page('values', 'You orient toward helping others.', 'Where does helping become a habit?'),
    ])
    listVipsTimelineEntriesMock.mockImplementation(async (_sid, dim) =>
      dim === 'values' ? [entry('values', 'i made her teh-o and asked her to sit')] : [],
    )
    latestCartographerOutputMock.mockResolvedValue(null)

    const result = await counsellorBriefHandler({})

    expect(result.markdown).toContain('## Trajectory')
    expect(result.markdown).toContain(
      '_Trajectory not yet generated — run sense-making to populate._',
    )
    expect(result.markdown).not.toContain('### Top pathways')
  })

  it('takes the student id from the counselor context, never from the caller', async () => {
    // Replaces the old "rejects an empty studentId via Zod" case: the input
    // schema is now `z.object({})`. Tenancy comes from
    // `requireCounselorContext`, so a caller-supplied studentId is ignored —
    // it must not reach `withStudent` or any query.
    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: 'demo-b',
    })

    const result = await counsellorBriefHandler({ studentId: 'demo-a' } as never)

    expect(withStudentMock.mock.calls[0]?.[0]).toBe('demo-b')
    expect(listVipsPagesMock).toHaveBeenCalledWith('demo-b', { ctx: CTX })
    expect(result.markdown.split('\n', 1)[0]).toContain('demo-b')
    expect(result.markdown.split('\n', 1)[0]).not.toContain('demo-a')
  })

  it('isolates across students — demo-b sees only its own (empty) wiki', async () => {
    // The tenancy envelope is what keeps demo-a's rows out; here the mocked
    // queries return the empty result that a correctly-scoped read yields,
    // and we assert the handler still emits four coherent stub sections
    // rather than leaking or crashing.
    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: 'demo-b',
    })

    const result = await counsellorBriefHandler({})

    expect(result.markdown).toContain('_No verified claims yet for values._')
    expect(result.markdown).toContain(
      '_Trajectory not yet generated — run sense-making to populate._',
    )
    // And demo-a's compiled truth must NOT leak across.
    expect(result.markdown).not.toContain('orient toward helping others one-to-one')
  })
})
