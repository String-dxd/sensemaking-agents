/**
 * U8 — confirm-diff handler tests.
 *
 * Happy path: confirm 3 admitted entries across 2 dimensions →
 *   3 rows in vips_timeline_entries, 2 vips_pages updated.
 * Partial batch: confirm 2, forget 1 → only 2 timeline rows, status
 *   flips to 'confirmed' on the last resolution, vips_forget_count
 *   unchanged (R20).
 * Last-entry finalization: diff status flips to 'confirmed',
 *   reviewed_at is non-null.
 *
 * This is the verifier-gated review path, so the assertions are about the
 * handler's *orchestration*: which query ran, with which arguments, how many
 * times. `~/db/queries` and `~/db/client` are replaced by a tiny in-memory
 * store (below) that models just enough of the row lifecycle for the payload
 * mutation and the status flip to round-trip. `~/lib/safety` and
 * `~/server/review-payload-shape` are pure and stay real — the safety-guard
 * describe depends on the genuine diagnostic-language patterns.
 *
 * No database — see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmDiffHandler } from '~/server/confirm-diff.handler.server'
import { forgetDiffHandler } from '~/server/forget-diff.handler.server'
import { buildReviewEntryId } from '~/server/review-payload-shape'

// ── the fake store ───────────────────────────────────────────────────────

type Dimension = 'values' | 'interests' | 'personality' | 'skills'

interface StoredDiff {
  id: number
  student_id: string
  mirror_entry_id: number
  payload: unknown
  verifier_result: unknown
  status: 'pending' | 'confirmed' | 'forgotten'
  created_at: string
  reviewed_at: string | null
}

interface StoredTimelineEntry {
  id: number
  student_id: string
  dimension: string
  canonical_claim_id: string
  verbatim_quote: string
  reflection_id: number | null
  strength: string
  parallax_tag: string[]
  reinforces_id: number | null
}

interface StoredPage {
  student_id: string
  dimension: string
  compiled_truth: string
  open_question: string
  /** Monotonic counter, not a clock — equality proves "no second upsert". */
  updated_at: number
}

const store = vi.hoisted(() => {
  return {
    diffs: new Map<number, Record<string, unknown>>(),
    timeline: [] as Record<string, unknown>[],
    pages: new Map<string, Record<string, unknown>>(),
    /** R20 counter. Nothing in the review surface may ever touch this. */
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
  }
})

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())
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
  insertVipsTimelineEntry: async (studentId: string, entry: Record<string, unknown>) => {
    const row = { id: store.next(), student_id: studentId, ...entry }
    store.timeline.push(row)
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
  upsertVipsPage: async (studentId: string, page: Record<string, unknown>) => {
    const key = `${studentId}::${page.dimension}`
    const row = { student_id: studentId, ...page, updated_at: store.next() }
    store.pages.set(key, row)
    return { ...row }
  },
  // Not imported by either handler under test — exported so the R20
  // assertion below ("the review surface never bumps vips_forget_count")
  // fails loudly if someone ever wires it in.
  forgetVipsTimelineEntry: (...args: unknown[]) => forgetVipsTimelineEntryMock(...args),
}))

// ── read helpers (direct store reads; the handlers never call these) ──────

function listVipsTimelineEntries(studentId: string, dimension: Dimension) {
  return store.timeline.filter(
    (e) => e.student_id === studentId && e.dimension === dimension,
  ) as unknown as StoredTimelineEntry[]
}

function getVipsPage(studentId: string, dimension: Dimension) {
  return (store.pages.get(`${studentId}::${dimension}`) ?? null) as unknown as StoredPage | null
}

function getVipsForgetCount(studentId: string, dimension: Dimension) {
  return store.forgetCounts.get(`${studentId}::${dimension}`) ?? 0
}

function getVipsProposedDiff(studentId: string, diffId: number) {
  const row = store.diffs.get(diffId)
  if (!row || row.student_id !== studentId) return null
  return { ...row } as unknown as StoredDiff
}

// ── fixtures ─────────────────────────────────────────────────────────────

function emptyDimDiff(rewrite = '', open = '') {
  return { compiled_truth_rewrite: rewrite, open_question: open, new_timeline_entries: [] }
}

function annotatedEntry(opts: {
  dimension: Dimension
  canonical_claim_id: string
  verbatim_quote: string
  reflection_id: number
  aspirational?: boolean
  partial_match?: boolean
  reinforces_id?: number | null
}) {
  return {
    dimension: opts.dimension,
    canonical_claim_id: opts.canonical_claim_id,
    verbatim_quote: opts.verbatim_quote,
    reflection_id: opts.reflection_id,
    strength: 'medium' as const,
    parallax_tag: ['school' as const],
    reinforces_id: opts.reinforces_id ?? null,
    partial_match: opts.partial_match ?? false,
    aspirational: opts.aspirational ?? false,
    parallax_cap_reason: null,
  }
}

function stageDiff(payload: Record<string, unknown>): number {
  const id = store.next()
  store.diffs.set(id, {
    id,
    student_id: 'demo',
    mirror_entry_id: 1,
    payload,
    verifier_result: {
      admitted: payload.admitted,
      downgraded: payload.downgraded,
      dropped: [],
    },
    status: 'pending',
    created_at: '2026-05-19T08:00:00.000Z',
    reviewed_at: null,
  })
  return id
}

interface SeededDiff {
  diffId: number
  /** Tuple of the three entry IDs in the order they were seeded. */
  entryIds: readonly [string, string, string]
}

function seedDiff(): SeededDiff {
  const valuesEntry1 = annotatedEntry({
    dimension: 'values',
    canonical_claim_id: 'values.independence',
    verbatim_quote: 'i hated when teacher told us',
    reflection_id: 1,
  })
  const valuesEntry2 = annotatedEntry({
    dimension: 'values',
    canonical_claim_id: 'values.autonomy',
    verbatim_quote: 'exactly what to do',
    reflection_id: 1,
  })
  const interestsEntry = annotatedEntry({
    dimension: 'interests',
    canonical_claim_id: 'interests.problem_solving',
    verbatim_quote: 'told us exactly',
    reflection_id: 1,
  })

  const diffId = stageDiff({
    diffs: {
      values: emptyDimDiff(
        'Practices self-direction in school settings.',
        'Does the same pattern hold collaboratively?',
      ),
      interests: emptyDimDiff(
        'Drawn to problem-solving where steps are not pre-baked.',
        'Where does this curiosity come from?',
      ),
      personality: emptyDimDiff(),
      skills: emptyDimDiff(),
    },
    admitted: [valuesEntry1, valuesEntry2, interestsEntry],
    downgraded: [],
    dropped: [],
  })

  return {
    diffId,
    entryIds: [
      buildReviewEntryId(valuesEntry1),
      buildReviewEntryId(valuesEntry2),
      buildReviewEntryId(interestsEntry),
    ] as const,
  }
}

const CTX = { db: {}, studentId: 'demo' }

beforeEach(() => {
  store.reset()
  requireCounselorContextMock.mockReset()
  withStudentMock.mockReset()
  forgetVipsTimelineEntryMock.mockReset()
  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo',
  })
  withStudentMock.mockImplementation(async (_studentId: string, fn: (ctx: unknown) => unknown) =>
    fn(CTX),
  )
})

describe('confirmDiffHandler — happy path', () => {
  it('confirms 3 entries across 2 dimensions: 3 timeline rows, 2 pages updated', async () => {
    const { diffId, entryIds } = seedDiff()

    await confirmDiffHandler({ diffId, entryId: entryIds[0] })
    await confirmDiffHandler({ diffId, entryId: entryIds[1] })
    const last = await confirmDiffHandler({ diffId, entryId: entryIds[2] })

    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(2)
    expect(listVipsTimelineEntries('demo', 'interests')).toHaveLength(1)

    expect(getVipsPage('demo', 'values')?.compiled_truth).toBe(
      'Practices self-direction in school settings.',
    )
    expect(getVipsPage('demo', 'interests')?.compiled_truth).toBe(
      'Drawn to problem-solving where steps are not pre-baked.',
    )
    // Personality and skills had no entries → no page row.
    expect(getVipsPage('demo', 'personality')).toBeNull()
    expect(getVipsPage('demo', 'skills')).toBeNull()

    // Last-entry finalization: status flips to 'confirmed' + reviewed_at stamped.
    expect(last.diff.status).toBe('confirmed')
    expect(last.diff.reviewed_at).not.toBeNull()

    // Orchestration: every write shared the one tenancy transaction, and the
    // student id came from the counselor context on each call.
    expect(withStudentMock).toHaveBeenCalledTimes(3)
    for (const call of withStudentMock.mock.calls) expect(call[0]).toBe('demo')
  })

  it('only writes the compiled-truth rewrite once per dimension (on first confirm)', async () => {
    const { diffId, entryIds } = seedDiff()

    await confirmDiffHandler({ diffId, entryId: entryIds[0] })
    const updatedAtFirst = getVipsPage('demo', 'values')?.updated_at

    // Second confirm in same dimension should NOT re-write the page
    // (and certainly should not change compiled_truth — same string).
    await confirmDiffHandler({ diffId, entryId: entryIds[1] })
    const pageAfterSecond = getVipsPage('demo', 'values')

    expect(pageAfterSecond?.compiled_truth).toBe('Practices self-direction in school settings.')
    // `updated_at` is the store's monotonic upsert counter, so an unchanged
    // value is proof that no second upsert was issued.
    expect(pageAfterSecond?.updated_at).toBe(updatedAtFirst)
  })

  // The first-confirm-in-dimension check must scan BOTH `admitted` and
  // `downgraded` lists. If an admitted entry has already committed the
  // dimension's compiled_truth_rewrite, confirming a downgraded entry in
  // the same dimension must not overwrite it.
  it('does not re-upsert compiled_truth when admitted and downgraded share a dimension', async () => {
    const admittedValues = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.independence',
      verbatim_quote: 'i hated when teacher told us',
      reflection_id: 1,
    })
    const downgradedValues = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.autonomy',
      verbatim_quote: 'exactly what to do',
      reflection_id: 1,
      partial_match: true,
    })

    const diffId = stageDiff({
      diffs: {
        values: emptyDimDiff('Practices self-direction in school settings.', 'q?'),
        interests: emptyDimDiff(),
        personality: emptyDimDiff(),
        skills: emptyDimDiff(),
      },
      admitted: [admittedValues],
      downgraded: [downgradedValues],
      dropped: [],
    })

    await confirmDiffHandler({ diffId, entryId: buildReviewEntryId(admittedValues) })
    const updatedAtFirst = getVipsPage('demo', 'values')?.updated_at

    await confirmDiffHandler({ diffId, entryId: buildReviewEntryId(downgradedValues) })
    const pageAfterCross = getVipsPage('demo', 'values')

    expect(pageAfterCross?.compiled_truth).toBe('Practices self-direction in school settings.')
    expect(pageAfterCross?.updated_at).toBe(updatedAtFirst)
  })
})

describe('confirmDiffHandler — partial batch + forget interaction', () => {
  it('confirm 2 + forget 1 → 2 timeline rows; vips_forget_count unchanged; status confirmed', async () => {
    const { diffId, entryIds } = seedDiff()
    const forgetBefore = getVipsForgetCount('demo', 'values')

    await confirmDiffHandler({ diffId, entryId: entryIds[0] })
    await forgetDiffHandler({ diffId, entryId: entryIds[1] })
    const last = await confirmDiffHandler({ diffId, entryId: entryIds[2] })

    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)
    expect(listVipsTimelineEntries('demo', 'interests')).toHaveLength(1)

    // R20: forgetting on review surface MUST NOT bump vips_forget_count —
    // the entry never committed, so there is nothing to subtract from.
    expect(getVipsForgetCount('demo', 'values')).toBe(forgetBefore)
    expect(forgetVipsTimelineEntryMock).not.toHaveBeenCalled()

    expect(last.diff.status).toBe('confirmed')
    expect(last.diff.reviewed_at).not.toBeNull()
  })

  it('mid-batch: status remains pending until every entry is resolved', async () => {
    const { diffId, entryIds } = seedDiff()

    await confirmDiffHandler({ diffId, entryId: entryIds[0] })
    const after1 = getVipsProposedDiff('demo', diffId)
    expect(after1?.status).toBe('pending')
    expect(after1?.reviewed_at).toBeNull()

    await confirmDiffHandler({ diffId, entryId: entryIds[1] })
    const after2 = getVipsProposedDiff('demo', diffId)
    expect(after2?.status).toBe('pending')

    await confirmDiffHandler({ diffId, entryId: entryIds[2] })
    const after3 = getVipsProposedDiff('demo', diffId)
    expect(after3?.status).toBe('confirmed')
    expect(after3?.reviewed_at).not.toBeNull()
  })
})

describe('confirmDiffHandler — compiled_truth safety guard (#1, #3)', () => {
  /**
   * Helper: stage a diff with a *single* admitted entry in `dimension` whose
   * `compiled_truth_rewrite` is the supplied string. Returns the diff id +
   * entryId so the test can confirm the only entry in one call.
   */
  function seedSingleDimDiff(opts: {
    dimension: Dimension
    compiled_truth_rewrite: string
    canonical_claim_id?: string
  }) {
    const entry = annotatedEntry({
      dimension: opts.dimension,
      canonical_claim_id: opts.canonical_claim_id ?? `${opts.dimension}.fake`,
      verbatim_quote: 'student speech here',
      reflection_id: 1,
    })
    const diffs: Record<Dimension, ReturnType<typeof emptyDimDiff>> = {
      values: emptyDimDiff(),
      interests: emptyDimDiff(),
      personality: emptyDimDiff(),
      skills: emptyDimDiff(),
    }
    // Inject the rewrite into the right dimension.
    diffs[opts.dimension] = emptyDimDiff(opts.compiled_truth_rewrite, 'open?')

    const diffId = stageDiff({ diffs, admitted: [entry], downgraded: [], dropped: [] })
    return { diffId, entryId: buildReviewEntryId(entry) }
  }

  it('happy: clean compiled_truth_rewrite for Values → page is updated', async () => {
    const { diffId, entryId } = seedSingleDimDiff({
      dimension: 'values',
      compiled_truth_rewrite: 'Practices self-direction in school settings.',
    })

    const result = await confirmDiffHandler({ diffId, entryId })

    expect(result.compiled_truth_safety_skip).toBeUndefined()
    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)
    expect(getVipsPage('demo', 'values')?.compiled_truth).toBe(
      'Practices self-direction in school settings.',
    )
  })

  it('edge: flagged compiled_truth_rewrite for Values → page NOT updated, timeline entry still inserted', async () => {
    // "you are a leader" trips the base diagnostic-language pattern set.
    const { diffId, entryId } = seedSingleDimDiff({
      dimension: 'values',
      compiled_truth_rewrite: 'You are a leader at heart and your true self is collaborative.',
    })

    const result = await confirmDiffHandler({ diffId, entryId })

    // Timeline entry still commits — student speech is canonical.
    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)
    // Page is NOT upserted (no prior row → still null).
    expect(getVipsPage('demo', 'values')).toBeNull()
    // Result advertises the skip so callers can show a "summary kept previous" notice.
    expect(result.compiled_truth_safety_skip).toBeDefined()
    expect(result.compiled_truth_safety_skip?.dimension).toBe('values')
    expect(result.compiled_truth_safety_skip?.matches.length ?? 0).toBeGreaterThan(0)
    // Diff still finalizes (all entries resolved → status confirmed).
    expect(result.diff.status).toBe('confirmed')
  })

  it('edge: flagged compiled_truth_rewrite for Personality (stricter regex) → page NOT updated, entry inserted', async () => {
    // The third-person rewrite-aware pattern catches "they are an introvert".
    const { diffId, entryId } = seedSingleDimDiff({
      dimension: 'personality',
      canonical_claim_id: 'personality.team_energy',
      compiled_truth_rewrite: 'They are an introvert by nature and recharge alone.',
    })

    const result = await confirmDiffHandler({ diffId, entryId })

    expect(listVipsTimelineEntries('demo', 'personality')).toHaveLength(1)
    expect(getVipsPage('demo', 'personality')).toBeNull()
    expect(result.compiled_truth_safety_skip?.dimension).toBe('personality')
    expect(result.compiled_truth_safety_skip?.matches.length ?? 0).toBeGreaterThan(0)
  })

  it('edge: clean Personality compiled_truth_rewrite (behavior-shape) → page updated', async () => {
    // Behavior-shape language stays admitted per safety.ts comments.
    const { diffId, entryId } = seedSingleDimDiff({
      dimension: 'personality',
      canonical_claim_id: 'personality.team_energy',
      compiled_truth_rewrite: 'They sustain attention longer in argument-driven tasks with a team.',
    })

    const result = await confirmDiffHandler({ diffId, entryId })

    expect(result.compiled_truth_safety_skip).toBeUndefined()
    expect(getVipsPage('demo', 'personality')?.compiled_truth).toContain(
      'sustain attention longer in argument-driven tasks',
    )
  })
})

describe('confirmDiffHandler — error paths', () => {
  it('throws when the diff is not pending', async () => {
    const { diffId, entryIds } = seedDiff()
    await confirmDiffHandler({ diffId, entryId: entryIds[0] })
    await confirmDiffHandler({ diffId, entryId: entryIds[1] })
    await confirmDiffHandler({ diffId, entryId: entryIds[2] })

    await expect(confirmDiffHandler({ diffId, entryId: entryIds[0] })).rejects.toThrow(
      /not pending/,
    )
  })

  it('throws when the entryId is not present in the diff', async () => {
    const { diffId } = seedDiff()

    await expect(confirmDiffHandler({ diffId, entryId: 'values::nonexistent' })).rejects.toThrow(
      /not found/,
    )
  })
})
