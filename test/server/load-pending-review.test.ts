/**
 * U8 — load-pending-review handler tests.
 *
 * - Returns null when no pending row exists.
 * - Returns the most-recent pending row when one exists.
 * - Ignores non-pending rows (confirmed / forgotten).
 *
 * The handler is a single-query orchestration seam: it derives the student
 * id from the counselor context and asks `listVipsProposedDiffs` for the
 * `pending` slice, which orders by `created_at DESC`. The "ignores
 * non-pending rows" and "most recent first" semantics live in that query's
 * SQL, so here we assert the handler asks for exactly that slice and picks
 * the head of the result. Mock-based; no database — see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPendingReviewHandler } from '~/server/load-pending-review.handler.server'

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const listVipsProposedDiffsMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/queries', () => ({
  listVipsProposedDiffs: (studentId: string, opts: unknown) =>
    listVipsProposedDiffsMock(studentId, opts),
}))

function diffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    student_id: 'demo',
    mirror_entry_id: 10,
    payload: {},
    verifier_result: { admitted: [], downgraded: [], dropped: [] },
    status: 'pending',
    created_at: '2026-05-19T08:00:00.000Z',
    reviewed_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  requireCounselorContextMock.mockReset()
  listVipsProposedDiffsMock.mockReset()
  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo',
  })
})

describe('loadPendingReviewHandler', () => {
  it('returns null when no pending diff exists for the student', async () => {
    listVipsProposedDiffsMock.mockResolvedValue([])

    const result = await loadPendingReviewHandler({})

    expect(result.diff).toBeNull()
    expect(listVipsProposedDiffsMock).toHaveBeenCalledWith('demo', { status: 'pending' })
  })

  it('returns the most-recent pending diff when one exists', async () => {
    // `listVipsProposedDiffs` orders created_at DESC, so the head of the
    // list is the most recent — the handler must take [0], not [-1].
    listVipsProposedDiffsMock.mockResolvedValue([
      diffRow({ id: 42, created_at: '2026-05-20T08:00:00.000Z' }),
      diffRow({ id: 7, created_at: '2026-05-19T08:00:00.000Z' }),
    ])

    const result = await loadPendingReviewHandler({})

    expect(result.diff?.id).toBe(42)
    expect(result.diff?.status).toBe('pending')
  })

  it('does not return diffs that have been confirmed', async () => {
    // Confirmed rows are excluded by the query, not by the handler — so the
    // load-bearing assertion is that the handler always constrains the query
    // to `status: 'pending'` and never post-filters a wider result set.
    listVipsProposedDiffsMock.mockResolvedValue([])

    const result = await loadPendingReviewHandler({})

    expect(result.diff).toBeNull()
    expect(listVipsProposedDiffsMock).toHaveBeenCalledTimes(1)
    expect(listVipsProposedDiffsMock.mock.calls[0]?.[1]).toEqual({ status: 'pending' })
  })

  it('takes the student id from the counselor context, never from the caller', async () => {
    // Replaces the old "rejects an empty studentId via Zod" case: the input
    // schema is now `z.object({})` and carries no studentId at all. Tenancy
    // comes from `requireCounselorContext`, so a caller-supplied studentId
    // must be ignored rather than honoured.
    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: 'demo-a',
    })
    listVipsProposedDiffsMock.mockResolvedValue([])

    await loadPendingReviewHandler({ studentId: 'attacker' } as never)

    expect(listVipsProposedDiffsMock).toHaveBeenCalledWith('demo-a', { status: 'pending' })
  })
})
