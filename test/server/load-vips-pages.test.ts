/**
 * U9 — load-vips-pages handler tests.
 *
 * Happy path: returns four page rows in canonical dimension order +
 * per-dimension timelines + claim counts.
 *
 * R19: forgotten timeline entries are excluded from
 * `timeline_by_dimension` and from `claim_count_by_dimension`.
 *
 * R20 boundary: the response does NOT contain `vips_forget_count` data
 * even after some entries are forgotten. The count exists server-side
 * but never crosses the server-fn boundary.
 *
 * The DB surfaces (`~/db/client`, `~/db/queries`) are mocked; everything
 * pure stays real — the input schema, `./mood-tags`, the sibling
 * `loadCounsellorBriefStatusForStudent`, and
 * `loadStudentSpaceShellData` (a seed-corpus reader, not a DB call). The
 * R19 assertion is expressed the way the handler actually owns it: the
 * all-dimensions query must never be asked for forgotten rows. No
 * database — see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadVipsPagesInputSchema } from '~/server/function-schemas'
import { loadVipsPagesHandler } from '~/server/load-vips-pages.handler.server'

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())
const listVipsPagesMock = vi.hoisted(() => vi.fn())
const listVipsTimelineEntriesAllDimensionsMock = vi.hoisted(() => vi.fn())
const listMirrorEntriesMock = vi.hoisted(() => vi.fn())
const latestCartographerOutputMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

vi.mock('~/db/queries', () => ({
  listVipsPages: (studentId: string, opts: unknown) => listVipsPagesMock(studentId, opts),
  listVipsTimelineEntriesAllDimensions: (studentId: string, opts: unknown) =>
    listVipsTimelineEntriesAllDimensionsMock(studentId, opts),
  listMirrorEntries: (studentId: string, opts: unknown) => listMirrorEntriesMock(studentId, opts),
  latestCartographerOutput: (studentId: string, opts: unknown) =>
    latestCartographerOutputMock(studentId, opts),
}))

const CTX = { db: {}, studentId: 'demo' }

let nextEntryId = 0

function timelineEntry(dimension: string, canonical_claim_id: string) {
  nextEntryId += 1
  return {
    id: nextEntryId,
    student_id: 'demo',
    dimension,
    canonical_claim_id,
    verbatim_quote: canonical_claim_id,
    reflection_id: null,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-19T08:00:00.000Z',
  }
}

beforeEach(() => {
  nextEntryId = 0
  requireCounselorContextMock.mockReset()
  withStudentMock.mockReset()
  listVipsPagesMock.mockReset()
  listVipsTimelineEntriesAllDimensionsMock.mockReset()
  listMirrorEntriesMock.mockReset()
  latestCartographerOutputMock.mockReset()

  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo',
  })
  withStudentMock.mockImplementation(async (_studentId: string, fn: (ctx: unknown) => unknown) =>
    fn(CTX),
  )
  listVipsPagesMock.mockResolvedValue([])
  listVipsTimelineEntriesAllDimensionsMock.mockResolvedValue([])
  listMirrorEntriesMock.mockResolvedValue([])
  latestCartographerOutputMock.mockResolvedValue(null)
})

describe('loadVipsPagesHandler — happy path', () => {
  it('returns exactly four pages in canonical dimension order even with zero upserted rows', async () => {
    const result = await loadVipsPagesHandler({})

    expect(result.pages).toHaveLength(4)
    expect(result.pages.map((p) => p.dimension)).toEqual([
      'values',
      'interests',
      'personality',
      'skills',
    ])
    // Stubs for dimensions with no upserted row.
    expect(result.pages.every((p) => p.compiled_truth === '' && p.open_question === '')).toBe(true)
    expect(result.pages.every((p) => p.updated_at === null)).toBe(true)
    expect(result.total_claim_count).toBe(0)
  })

  it('returns persisted page rows with their compiled_truth + open_question + updated_at', async () => {
    listVipsPagesMock.mockResolvedValue([
      {
        student_id: 'demo',
        dimension: 'values',
        compiled_truth: 'Practices self-direction in school settings.',
        open_question: 'Does the same hold collaboratively?',
        updated_at: '2026-05-19T08:00:00.000Z',
      },
    ])

    const result = await loadVipsPagesHandler({})

    const values = result.pages.find((p) => p.dimension === 'values')
    expect(values?.compiled_truth).toBe('Practices self-direction in school settings.')
    expect(values?.open_question).toBe('Does the same hold collaboratively?')
    expect(values?.updated_at).toBeTruthy()
    // The other three are still stubbed, so the grid is always four cards.
    expect(result.pages).toHaveLength(4)
  })

  it('groups non-forgotten timeline entries by dimension and reports per-dimension counts', async () => {
    listVipsTimelineEntriesAllDimensionsMock.mockResolvedValue([
      timelineEntry('values', 'values.independence'),
      timelineEntry('values', 'values.autonomy'),
      timelineEntry('interests', 'interests.investigative'),
    ])

    const result = await loadVipsPagesHandler({})

    expect(result.timeline_by_dimension.values).toHaveLength(2)
    expect(result.timeline_by_dimension.interests).toHaveLength(1)
    expect(result.timeline_by_dimension.personality).toHaveLength(0)
    expect(result.timeline_by_dimension.skills).toHaveLength(0)
    expect(result.claim_count_by_dimension).toEqual({
      values: 2,
      interests: 1,
      personality: 0,
      skills: 0,
    })
    expect(result.total_claim_count).toBe(3)
    // One query for all four dimensions, not four serial round-trips.
    expect(listVipsTimelineEntriesAllDimensionsMock).toHaveBeenCalledTimes(1)
  })

  it('cross-student isolation: every read is scoped to the counselor-context student', async () => {
    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: 'other-student',
    })

    const result = await loadVipsPagesHandler({})

    // The tenancy envelope is opened for the context student, and every read
    // shares that one transaction — so no other student's rows can reach the
    // response.
    expect(withStudentMock.mock.calls[0]?.[0]).toBe('other-student')
    expect(listVipsPagesMock).toHaveBeenCalledWith('other-student', { ctx: CTX })
    expect(listVipsTimelineEntriesAllDimensionsMock).toHaveBeenCalledWith('other-student', {
      ctx: CTX,
    })
    expect(result.total_claim_count).toBe(0)
    expect(result.timeline_by_dimension.values).toHaveLength(0)
  })
})

describe('loadVipsPagesHandler — R19 / R20 boundaries', () => {
  it('never asks for forgotten timeline entries, so they cannot reach the response (R19)', async () => {
    // The exclusion itself lives in `listVipsTimelineEntriesAllDimensions`,
    // which drops forgotten rows unless `includeForgotten: true` is passed.
    // The handler's own R19 obligation is to never pass that flag — an admin
    // view would, and this handler must not.
    listVipsTimelineEntriesAllDimensionsMock.mockResolvedValue([
      timelineEntry('values', 'values.b'),
    ])

    const result = await loadVipsPagesHandler({})

    const opts = listVipsTimelineEntriesAllDimensionsMock.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >
    expect(opts.includeForgotten).toBeUndefined()
    expect(result.timeline_by_dimension.values).toHaveLength(1)
    expect(result.timeline_by_dimension.values[0]?.canonical_claim_id).toBe('values.b')
    expect(result.claim_count_by_dimension.values).toBe(1)
  })

  it('does NOT include vips_forget_count in the response shape (R20)', async () => {
    listVipsTimelineEntriesAllDimensionsMock.mockResolvedValue([
      timelineEntry('values', 'values.b'),
    ])

    const result = await loadVipsPagesHandler({})

    // The result shape must not leak the counter under any plausible key.
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/forget_count/i)
    expect(serialized).not.toMatch(/vips_forget/i)
    // Belt-and-braces: walk the object and assert no field named
    // `*forget*` exists.
    const keys = collectAllKeys(result as unknown as Record<string, unknown>)
    expect(keys.some((k) => /forget/i.test(k))).toBe(false)
  })
})

describe('loadVipsPagesHandler — input validation', () => {
  it('accepts an empty input object', () => {
    // Pure schema check — no mocking needed.
    expect(loadVipsPagesInputSchema.parse({})).toEqual({})
  })

  it('takes the student id from the counselor context, never from the caller', async () => {
    // Replaces the old "rejects an empty studentId via Zod" case: the input
    // schema is now `z.object({})` and carries no studentId at all, so a
    // caller-supplied one must be ignored rather than honoured.
    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: 'demo-b',
    })

    await loadVipsPagesHandler({ studentId: 'attacker' } as never)

    expect(withStudentMock.mock.calls[0]?.[0]).toBe('demo-b')
    expect(listVipsPagesMock).toHaveBeenCalledWith('demo-b', { ctx: CTX })
  })
})

function collectAllKeys(obj: unknown, acc: string[] = []): string[] {
  if (obj === null || typeof obj !== 'object') return acc
  if (Array.isArray(obj)) {
    for (const item of obj) collectAllKeys(item, acc)
    return acc
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    acc.push(k)
    collectAllKeys(v, acc)
  }
  return acc
}
