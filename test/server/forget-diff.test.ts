/**
 * U8 — forget-diff handler tests.
 *
 * - Forget-only path: entries never reach vips_timeline_entries.
 * - vips_forget_count unchanged (R20 boundary — forget on review surface
 *   never bumps the count; the count is for "previously committed, then
 *   forgotten" only).
 * - Last-entry finalization flips status to 'confirmed' even when every
 *   entry was forgotten.
 *
 * `~/db/queries` and `~/db/client` are replaced by a tiny in-memory store
 * that models the staged-diff row lifecycle, so the payload mutation and
 * the status flip round-trip exactly as they would against Postgres.
 * `~/server/review-payload-shape` is pure and stays real. No database —
 * see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetDiffHandler } from '~/server/forget-diff.handler.server'
import { buildReviewEntryId } from '~/server/review-payload-shape'

type Dimension = 'values' | 'interests' | 'personality' | 'skills'

const store = vi.hoisted(() => ({
  diffs: new Map<number, Record<string, unknown>>(),
  /** Nothing in the forget-on-review path may ever append here. */
  timeline: [] as Record<string, unknown>[],
  /** Nothing in the forget-on-review path may ever upsert here. */
  pages: new Map<string, Record<string, unknown>>(),
  /** R20 counter. The review surface must never bump it. */
  forgetCounts: new Map<string, number>(),
  seq: 0,
  reset() {
    this.diffs.clear()
    this.timeline.length = 0
    this.pages.clear()
    this.forgetCounts.clear()
    this.seq = 0
  },
  next() {
    this.seq += 1
    return this.seq
  },
}))

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())
const insertVipsTimelineEntryMock = vi.hoisted(() => vi.fn())
const upsertVipsPageMock = vi.hoisted(() => vi.fn())
const forgetVipsTimelineEntryMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

vi.mock('~/db/queries', () => ({
  getVipsProposedDiff: async (studentId: string, diffId: number) => {
    const row = store.diffs.get(diffId)
    if (!row || row.student_id !== studentId) return null
    return { ...row }
  },
  updateVipsProposedDiffPayload: async (studentId: string, diffId: number, payload: unknown) => {
    const row = store.diffs.get(diffId)
    if (!row || row.student_id !== studentId) return null
    row.payload = payload
    return { ...row }
  },
  updateVipsProposedDiffStatus: async (studentId: string, diffId: number, status: string) => {
    const row = store.diffs.get(diffId)
    if (!row || row.student_id !== studentId) return null
    row.status = status
    row.reviewed_at = '2026-05-19T08:00:00.000Z'
    return { ...row }
  },
  // None of these three are imported by `forget-diff.handler.server.ts`.
  // They are exported here so that if anyone ever wires one in, the
  // "never called" assertions below fail loudly rather than silently
  // regressing the R20 boundary.
  insertVipsTimelineEntry: (...args: unknown[]) => insertVipsTimelineEntryMock(...args),
  upsertVipsPage: (...args: unknown[]) => upsertVipsPageMock(...args),
  forgetVipsTimelineEntry: (...args: unknown[]) => forgetVipsTimelineEntryMock(...args),
}))

function listVipsTimelineEntries(studentId: string, dimension: Dimension) {
  return store.timeline.filter((e) => e.student_id === studentId && e.dimension === dimension)
}

function getVipsPage(studentId: string, dimension: Dimension) {
  return store.pages.get(`${studentId}::${dimension}`) ?? null
}

function getVipsForgetCount(studentId: string, dimension: Dimension) {
  return store.forgetCounts.get(`${studentId}::${dimension}`) ?? 0
}

function emptyDimDiff(rewrite = '', open = '') {
  return { compiled_truth_rewrite: rewrite, open_question: open, new_timeline_entries: [] }
}

function annotatedEntry(opts: { dimension: Dimension; canonical_claim_id: string }) {
  return {
    dimension: opts.dimension,
    canonical_claim_id: opts.canonical_claim_id,
    verbatim_quote: 'some quote',
    reflection_id: 1,
    strength: 'medium' as const,
    parallax_tag: ['school' as const],
    reinforces_id: null,
    partial_match: false,
    aspirational: false,
    parallax_cap_reason: null,
  }
}

interface Seeded {
  diffId: number
  entryIds: readonly [string, string]
}

function seedDiff(): Seeded {
  const e1 = annotatedEntry({ dimension: 'values', canonical_claim_id: 'values.a' })
  const e2 = annotatedEntry({ dimension: 'values', canonical_claim_id: 'values.b' })

  const payload = {
    diffs: {
      values: emptyDimDiff('Some rewrite.', 'Some open?'),
      interests: emptyDimDiff(),
      personality: emptyDimDiff(),
      skills: emptyDimDiff(),
    },
    admitted: [e1, e2],
    downgraded: [],
    dropped: [],
  }

  const diffId = store.next()
  store.diffs.set(diffId, {
    id: diffId,
    student_id: 'demo',
    mirror_entry_id: 1,
    payload,
    verifier_result: { admitted: payload.admitted, downgraded: [], dropped: [] },
    status: 'pending',
    created_at: '2026-05-19T08:00:00.000Z',
    reviewed_at: null,
  })

  return { diffId, entryIds: [buildReviewEntryId(e1), buildReviewEntryId(e2)] as const }
}

const CTX = { db: {}, studentId: 'demo' }

beforeEach(() => {
  store.reset()
  requireCounselorContextMock.mockReset()
  withStudentMock.mockReset()
  insertVipsTimelineEntryMock.mockReset()
  upsertVipsPageMock.mockReset()
  forgetVipsTimelineEntryMock.mockReset()
  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo',
  })
  withStudentMock.mockImplementation(async (_studentId: string, fn: (ctx: unknown) => unknown) =>
    fn(CTX),
  )
})

describe('forgetDiffHandler — basic behavior', () => {
  it('forgetting on the review surface never inserts into vips_timeline_entries', async () => {
    const { diffId, entryIds } = seedDiff()

    await forgetDiffHandler({ diffId, entryId: entryIds[0] })
    await forgetDiffHandler({ diffId, entryId: entryIds[1] })

    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(0)
    expect(insertVipsTimelineEntryMock).not.toHaveBeenCalled()
  })

  it('R20: forgetting on the review surface does NOT bump vips_forget_count', async () => {
    const { diffId, entryIds } = seedDiff()
    const before = getVipsForgetCount('demo', 'values')

    await forgetDiffHandler({ diffId, entryId: entryIds[0] })
    await forgetDiffHandler({ diffId, entryId: entryIds[1] })

    expect(getVipsForgetCount('demo', 'values')).toBe(before)
    // The counter is only ever bumped inside `forgetVipsTimelineEntry`, so
    // the load-bearing guard is that the handler never reaches for it.
    expect(forgetVipsTimelineEntryMock).not.toHaveBeenCalled()
  })

  it('all-forgotten batch: no vips_pages row is upserted for the dimension', async () => {
    const { diffId, entryIds } = seedDiff()

    await forgetDiffHandler({ diffId, entryId: entryIds[0] })
    await forgetDiffHandler({ diffId, entryId: entryIds[1] })

    expect(getVipsPage('demo', 'values')).toBeNull()
    expect(upsertVipsPageMock).not.toHaveBeenCalled()
  })
})

describe('forgetDiffHandler — last-entry finalization', () => {
  it('flips status to confirmed and stamps reviewed_at on the final resolution', async () => {
    const { diffId, entryIds } = seedDiff()

    const after1 = await forgetDiffHandler({ diffId, entryId: entryIds[0] })
    expect(after1.diff.status).toBe('pending')
    expect(after1.diff.reviewed_at).toBeNull()

    const after2 = await forgetDiffHandler({ diffId, entryId: entryIds[1] })
    expect(after2.diff.status).toBe('confirmed')
    expect(after2.diff.reviewed_at).not.toBeNull()
  })
})

describe('forgetDiffHandler — error paths', () => {
  it('throws when entry was already forgotten', async () => {
    const { diffId, entryIds } = seedDiff()

    await forgetDiffHandler({ diffId, entryId: entryIds[0] })

    await expect(forgetDiffHandler({ diffId, entryId: entryIds[0] })).rejects.toThrow(
      /already forgotten/,
    )
  })

  it('throws when entryId is not present in the diff', async () => {
    const { diffId } = seedDiff()

    await expect(forgetDiffHandler({ diffId, entryId: 'values::nonexistent' })).rejects.toThrow(
      /not found/,
    )
  })
})
