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
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  getVipsForgetCount,
  getVipsPage,
  getVipsProposedDiff,
  insertMirrorEntry,
  insertVipsProposedDiff,
  listVipsTimelineEntries,
  type VipsProposedDiffRow,
} from '~/db/queries'
import { seed } from '~/db/seed'
import { confirmDiffHandler } from '~/server/confirm-diff.handler.server'
import { forgetDiffHandler } from '~/server/forget-diff.handler.server'
import { buildReviewEntryId } from '~/server/review-payload-shape'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
})

function emptyDimDiff(rewrite = '', open = '') {
  return { compiled_truth_rewrite: rewrite, open_question: open, new_timeline_entries: [] }
}

function annotatedEntry(opts: {
  dimension: 'values' | 'interests' | 'personality' | 'skills'
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

interface SeededDiff {
  diff: VipsProposedDiffRow
  /** Tuple of the three entry IDs in the order they were seeded. */
  entryIds: readonly [string, string, string]
}

function seedDiff(): SeededDiff {
  const mirror = insertMirrorEntry('demo', {
    transcript: 'i hated when teacher told us exactly what to do',
    validation: 'v',
    inferred_meaning: 'm',
    story_reframe: 's',
    raw_output: {},
    context_type: 'school',
  })

  const valuesEntry1 = annotatedEntry({
    dimension: 'values',
    canonical_claim_id: 'values.self_direction',
    verbatim_quote: 'i hated when teacher told us',
    reflection_id: mirror.id,
  })
  const valuesEntry2 = annotatedEntry({
    dimension: 'values',
    canonical_claim_id: 'values.autonomy',
    verbatim_quote: 'exactly what to do',
    reflection_id: mirror.id,
  })
  const interestsEntry = annotatedEntry({
    dimension: 'interests',
    canonical_claim_id: 'interests.problem_solving',
    verbatim_quote: 'told us exactly',
    reflection_id: mirror.id,
  })

  const payload = {
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
  }

  const diff = insertVipsProposedDiff('demo', {
    mirror_entry_id: mirror.id,
    payload,
    verifier_result: { admitted: payload.admitted, downgraded: [], dropped: [] },
  })

  const entryIds = [
    buildReviewEntryId(valuesEntry1),
    buildReviewEntryId(valuesEntry2),
    buildReviewEntryId(interestsEntry),
  ] as const
  return { diff, entryIds }
}

describe('confirmDiffHandler — happy path', () => {
  it('confirms 3 entries across 2 dimensions: 3 timeline rows, 2 pages updated', () => {
    const { diff, entryIds } = seedDiff()

    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[0] })
    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[1] })
    const last = confirmDiffHandler({
      studentId: 'demo',
      diffId: diff.id,
      entryId: entryIds[2],
    })

    const valuesTimeline = listVipsTimelineEntries('demo', 'values')
    const interestsTimeline = listVipsTimelineEntries('demo', 'interests')
    expect(valuesTimeline).toHaveLength(2)
    expect(interestsTimeline).toHaveLength(1)

    const valuesPage = getVipsPage('demo', 'values')
    const interestsPage = getVipsPage('demo', 'interests')
    expect(valuesPage?.compiled_truth).toBe('Practices self-direction in school settings.')
    expect(interestsPage?.compiled_truth).toBe(
      'Drawn to problem-solving where steps are not pre-baked.',
    )
    // Personality and skills had no entries → no page row.
    expect(getVipsPage('demo', 'personality')).toBeNull()
    expect(getVipsPage('demo', 'skills')).toBeNull()

    // Last-entry finalization: status flips to 'confirmed' + reviewed_at stamped.
    expect(last.diff.status).toBe('confirmed')
    expect(last.diff.reviewed_at).not.toBeNull()
  })

  it('only writes the compiled-truth rewrite once per dimension (on first confirm)', () => {
    const { diff, entryIds } = seedDiff()

    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[0] })
    const pageAfterFirst = getVipsPage('demo', 'values')
    const updatedAtFirst = pageAfterFirst?.updated_at

    // Second confirm in same dimension should NOT re-write the page
    // (and certainly should not change compiled_truth — same string).
    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[1] })
    const pageAfterSecond = getVipsPage('demo', 'values')
    expect(pageAfterSecond?.compiled_truth).toBe('Practices self-direction in school settings.')
    // updated_at should be the same — no second upsert.
    expect(pageAfterSecond?.updated_at).toBe(updatedAtFirst)
  })
})

describe('confirmDiffHandler — partial batch + forget interaction', () => {
  it('confirm 2 + forget 1 → 2 timeline rows; vips_forget_count unchanged; status confirmed', () => {
    const { diff, entryIds } = seedDiff()

    const forgetBefore = getVipsForgetCount('demo', 'values')

    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[0] })
    forgetDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[1] })
    const last = confirmDiffHandler({
      studentId: 'demo',
      diffId: diff.id,
      entryId: entryIds[2],
    })

    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)
    expect(listVipsTimelineEntries('demo', 'interests')).toHaveLength(1)

    // R20: forgetting on review surface MUST NOT bump vips_forget_count.
    expect(getVipsForgetCount('demo', 'values')).toBe(forgetBefore)

    expect(last.diff.status).toBe('confirmed')
    expect(last.diff.reviewed_at).not.toBeNull()
  })

  it('mid-batch: status remains pending until every entry is resolved', () => {
    const { diff, entryIds } = seedDiff()

    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[0] })
    const after1 = getVipsProposedDiff('demo', diff.id)
    expect(after1?.status).toBe('pending')
    expect(after1?.reviewed_at).toBeNull()

    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[1] })
    const after2 = getVipsProposedDiff('demo', diff.id)
    expect(after2?.status).toBe('pending')

    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[2] })
    const after3 = getVipsProposedDiff('demo', diff.id)
    expect(after3?.status).toBe('confirmed')
    expect(after3?.reviewed_at).not.toBeNull()
  })
})

describe('confirmDiffHandler — error paths', () => {
  it('throws when the diff is not pending', () => {
    const { diff, entryIds } = seedDiff()
    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[0] })
    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[1] })
    confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[2] })

    expect(() =>
      confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId: entryIds[0] }),
    ).toThrow(/not pending/)
  })

  it('throws when the entryId is not present in the diff', () => {
    const { diff } = seedDiff()
    expect(() =>
      confirmDiffHandler({
        studentId: 'demo',
        diffId: diff.id,
        entryId: 'values::nonexistent',
      }),
    ).toThrow(/not found/)
  })
})
