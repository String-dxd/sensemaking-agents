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

describe('confirmDiffHandler — compiled_truth safety guard (#1, #3)', () => {
  /**
   * Helper: seed a diff with a *single* admitted entry in `dimension` whose
   * `compiled_truth_rewrite` is the supplied string. Returns the diff +
   * entryId so the test can confirm the only entry in one call.
   */
  function seedSingleDimDiff(opts: {
    dimension: 'values' | 'interests' | 'personality' | 'skills'
    compiled_truth_rewrite: string
    canonical_claim_id?: string
  }) {
    const mirror = insertMirrorEntry('demo', {
      transcript: 't',
      validation: 'v',
      inferred_meaning: 'm',
      story_reframe: 's',
      raw_output: {},
      context_type: 'school',
    })
    const entry = annotatedEntry({
      dimension: opts.dimension,
      canonical_claim_id: opts.canonical_claim_id ?? `${opts.dimension}.fake`,
      verbatim_quote: 'student speech here',
      reflection_id: mirror.id,
    })
    const payload = {
      diffs: {
        values: emptyDimDiff(),
        interests: emptyDimDiff(),
        personality: emptyDimDiff(),
        skills: emptyDimDiff(),
      },
      admitted: [entry],
      downgraded: [],
      dropped: [],
    }
    // Inject the rewrite into the right dimension.
    payload.diffs[opts.dimension] = emptyDimDiff(opts.compiled_truth_rewrite, 'open?')
    const diff = insertVipsProposedDiff('demo', {
      mirror_entry_id: mirror.id,
      payload,
      verifier_result: { admitted: payload.admitted, downgraded: [], dropped: [] },
    })
    return { diff, entryId: buildReviewEntryId(entry) }
  }

  it('happy: clean compiled_truth_rewrite for Values → page is updated', () => {
    const { diff, entryId } = seedSingleDimDiff({
      dimension: 'values',
      compiled_truth_rewrite: 'Practices self-direction in school settings.',
    })

    const result = confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId })

    expect(result.compiled_truth_safety_skip).toBeUndefined()
    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(1)
    expect(getVipsPage('demo', 'values')?.compiled_truth).toBe(
      'Practices self-direction in school settings.',
    )
  })

  it('edge: flagged compiled_truth_rewrite for Values → page NOT updated, timeline entry still inserted', () => {
    // "you are a leader" trips the base diagnostic-language pattern set.
    const { diff, entryId } = seedSingleDimDiff({
      dimension: 'values',
      compiled_truth_rewrite: 'You are a leader at heart and your true self is collaborative.',
    })

    const result = confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId })

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

  it('edge: flagged compiled_truth_rewrite for Personality (stricter regex) → page NOT updated, entry inserted', () => {
    // The third-person rewrite-aware pattern catches "they are an introvert".
    const { diff, entryId } = seedSingleDimDiff({
      dimension: 'personality',
      canonical_claim_id: 'personality.team_energy',
      compiled_truth_rewrite: 'They are an introvert by nature and recharge alone.',
    })

    const result = confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId })

    expect(listVipsTimelineEntries('demo', 'personality')).toHaveLength(1)
    expect(getVipsPage('demo', 'personality')).toBeNull()
    expect(result.compiled_truth_safety_skip?.dimension).toBe('personality')
    expect(result.compiled_truth_safety_skip?.matches.length ?? 0).toBeGreaterThan(0)
  })

  it('edge: clean Personality compiled_truth_rewrite (behavior-shape) → page updated', () => {
    // Behavior-shape language stays admitted per safety.ts comments.
    const { diff, entryId } = seedSingleDimDiff({
      dimension: 'personality',
      canonical_claim_id: 'personality.team_energy',
      compiled_truth_rewrite: 'They sustain attention longer in argument-driven tasks with a team.',
    })

    const result = confirmDiffHandler({ studentId: 'demo', diffId: diff.id, entryId })

    expect(result.compiled_truth_safety_skip).toBeUndefined()
    expect(getVipsPage('demo', 'personality')?.compiled_truth).toContain(
      'sustain attention longer in argument-driven tasks',
    )
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
