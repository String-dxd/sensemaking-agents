/**
 * U8 — load-pending-review handler tests.
 *
 * - Returns null when no pending row exists.
 * - Returns the most-recent pending row when one exists.
 * - Ignores non-pending rows (confirmed / forgotten).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  insertMirrorEntry,
  insertVipsProposedDiff,
  updateVipsProposedDiffStatus,
} from '~/db/queries'
import { seed } from '~/db/seed'
import { loadPendingReviewHandler } from '~/server/load-pending-review.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
})

function seedMirror(transcript = 'a reflection') {
  return insertMirrorEntry('demo', {
    transcript,
    validation: 'v',
    inferred_meaning: 'm',
    story_reframe: 's',
    raw_output: {},
    context_type: 'school',
  })
}

function emptyDimDiff() {
  return { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] }
}

function emptyPayload() {
  return {
    diffs: {
      values: emptyDimDiff(),
      interests: emptyDimDiff(),
      personality: emptyDimDiff(),
      skills: emptyDimDiff(),
    },
    admitted: [],
    downgraded: [],
    dropped: [],
  }
}

describe('loadPendingReviewHandler', () => {
  it('returns null when no pending diff exists for the student', () => {
    const result = loadPendingReviewHandler({ studentId: 'demo' })
    expect(result.diff).toBeNull()
  })

  it('returns the most-recent pending diff when one exists', () => {
    const mirror = seedMirror()
    const inserted = insertVipsProposedDiff('demo', {
      mirror_entry_id: mirror.id,
      payload: emptyPayload(),
      verifier_result: { admitted: [], downgraded: [], dropped: [] },
    })

    const result = loadPendingReviewHandler({ studentId: 'demo' })
    expect(result.diff?.id).toBe(inserted.id)
    expect(result.diff?.status).toBe('pending')
  })

  it('does not return diffs that have been confirmed', () => {
    const mirror = seedMirror()
    const inserted = insertVipsProposedDiff('demo', {
      mirror_entry_id: mirror.id,
      payload: emptyPayload(),
      verifier_result: { admitted: [], downgraded: [], dropped: [] },
    })
    updateVipsProposedDiffStatus('demo', inserted.id, 'confirmed')

    const result = loadPendingReviewHandler({ studentId: 'demo' })
    expect(result.diff).toBeNull()
  })

  it('rejects an empty studentId via Zod', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
    expect(() => loadPendingReviewHandler({ studentId: '' } as any)).toThrow()
  })
})
