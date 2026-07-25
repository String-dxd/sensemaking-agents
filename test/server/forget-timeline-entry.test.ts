/**
 * U9 — forget-timeline-entry handler tests.
 *
 * The handler delegates the whole soft-forget to `forgetVipsTimelineEntry`,
 * so what belongs here is the orchestration around that one call:
 *
 * - Happy path: delegate under the counselor-context student id, echo the
 *   entry id, and surface the delegate's `dimension` + `forgotten_at`.
 * - Cross-student isolation: the delegate returns `null` when the row does
 *   not belong to this student; the handler must turn that into a
 *   `ForgetTimelineEntryError` rather than a silent no-op.
 * - Defensive: a row that came back without `forgotten_at` fails loud.
 * - Input validation on `entryId`.
 *
 * The R19 (FTS exclusion) and R20 (`vips_forget_count` increment) cases that
 * used to live here assert `forgetVipsTimelineEntry`'s *SQL*, not this
 * handler's orchestration, so they moved to Lane B in `test/db.test.ts`
 * behind the DATABASE_URL gate — see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetTimelineEntryHandler } from '~/server/forget-timeline-entry.handler.server'

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const forgetVipsTimelineEntryMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/queries', () => ({
  forgetVipsTimelineEntry: (studentId: string, entryId: number) =>
    forgetVipsTimelineEntryMock(studentId, entryId),
}))

beforeEach(() => {
  requireCounselorContextMock.mockReset()
  forgetVipsTimelineEntryMock.mockReset()
  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo',
  })
})

describe('forgetTimelineEntryHandler — happy path', () => {
  it('delegates the forget under the context student id and returns dimension + forgotten_at', async () => {
    forgetVipsTimelineEntryMock.mockResolvedValue({
      id: 11,
      dimension: 'values',
      forgotten_at: '2026-05-19T08:00:00.000Z',
    })

    const result = await forgetTimelineEntryHandler({ entryId: 11 })

    expect(forgetVipsTimelineEntryMock).toHaveBeenCalledTimes(1)
    expect(forgetVipsTimelineEntryMock).toHaveBeenCalledWith('demo', 11)
    expect(result).toEqual({
      entry_id: 11,
      dimension: 'values',
      forgotten_at: '2026-05-19T08:00:00.000Z',
    })
  })

  it('takes the student id from the counselor context, never from the caller', async () => {
    // Replaces the old "rejects an empty studentId via Zod" case: the input
    // schema is now `{ entryId }` only. Tenancy comes from
    // `requireCounselorContext`, so a caller-supplied studentId is ignored.
    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: 'demo-a',
    })
    forgetVipsTimelineEntryMock.mockResolvedValue({
      id: 3,
      dimension: 'skills',
      forgotten_at: '2026-05-19T08:00:00.000Z',
    })

    await forgetTimelineEntryHandler({ entryId: 3, studentId: 'attacker' } as never)

    expect(forgetVipsTimelineEntryMock).toHaveBeenCalledWith('demo-a', 3)
  })
})

describe('forgetTimelineEntryHandler — cross-student isolation', () => {
  it("forgetting another student's entry surfaces an error and is a no-op", async () => {
    // `forgetVipsTimelineEntry` returns null when the row is not visible to
    // this student's tenancy envelope. The handler must fail deterministically.
    forgetVipsTimelineEntryMock.mockResolvedValue(null)

    await expect(forgetTimelineEntryHandler({ entryId: 11 })).rejects.toThrow(/not found/)
    expect(forgetVipsTimelineEntryMock).toHaveBeenCalledWith('demo', 11)
  })

  it('fails loud when the delegate returns a row without forgotten_at', async () => {
    forgetVipsTimelineEntryMock.mockResolvedValue({
      id: 11,
      dimension: 'values',
      forgotten_at: null,
    })

    await expect(forgetTimelineEntryHandler({ entryId: 11 })).rejects.toThrow(
      /did not record forgotten_at/,
    )
  })

  it('rejects a non-positive entryId via Zod', async () => {
    await expect(forgetTimelineEntryHandler({ entryId: 0 })).rejects.toThrow()
    // Validation happens before any DB work.
    expect(forgetVipsTimelineEntryMock).not.toHaveBeenCalled()
  })
})
