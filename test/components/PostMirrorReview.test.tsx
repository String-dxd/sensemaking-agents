/**
 * U8 — PostMirrorReview component tests.
 *
 * Mock the confirm-diff / forget-diff server fns so the component test
 * runs entirely in happy-dom. The plan's contract: Done is disabled
 * until every admitted+downgraded entry is resolved; dropped entries
 * appear in a collapsed section and don't count toward the gate.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PostMirrorReview } from '~/components/PostMirrorReview'
import type { VipsProposedDiffRow } from '~/db/queries'
import { buildReviewEntryId } from '~/server/review-payload-shape'

// Mock the server fns. The real handlers run server-side; in component
// tests we only care about what the buttons fire.
const confirmMock = vi.fn().mockResolvedValue({ diff: { id: 1, status: 'pending' } })
const forgetMock = vi.fn().mockResolvedValue({ diff: { id: 1, status: 'pending' } })

vi.mock('~/server/confirm-diff.functions', () => ({
  confirmDiff: (args: unknown) => confirmMock(args),
}))
vi.mock('~/server/forget-diff.functions', () => ({
  forgetDiff: (args: unknown) => forgetMock(args),
}))

afterEach(() => {
  confirmMock.mockClear()
  forgetMock.mockClear()
})

function emptyDimDiff(rewrite = '', open = '') {
  return { compiled_truth_rewrite: rewrite, open_question: open, new_timeline_entries: [] }
}

function annotatedEntry(opts: {
  dimension: 'values' | 'interests' | 'personality' | 'skills'
  canonical_claim_id: string
  verbatim_quote: string
  aspirational?: boolean
  partial_match?: boolean
  resolved?: 'pending' | 'confirmed' | 'forgotten'
}) {
  return {
    dimension: opts.dimension,
    canonical_claim_id: opts.canonical_claim_id,
    verbatim_quote: opts.verbatim_quote,
    reflection_id: 1,
    strength: 'medium' as const,
    parallax_tag: ['school' as const],
    reinforces_id: null,
    partial_match: opts.partial_match ?? false,
    aspirational: opts.aspirational ?? false,
    parallax_cap_reason: null,
    resolved: opts.resolved ?? 'pending',
  }
}

function makeDiff(overrides?: {
  admitted?: ReturnType<typeof annotatedEntry>[]
  downgraded?: ReturnType<typeof annotatedEntry>[]
  dropped?: {
    entry: {
      dimension: string
      canonical_claim_id: string
      verbatim_quote: string
      reflection_id: number
      strength: 'low' | 'medium' | 'high'
      parallax_tag: ('school' | 'family' | 'peer' | 'hobby' | 'civic')[]
    }
    reason: 'no_quote_match' | 'unknown_reflection'
  }[]
}): VipsProposedDiffRow {
  const admitted = overrides?.admitted ?? [
    annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'quote one',
    }),
    annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.b',
      verbatim_quote: 'quote two',
    }),
  ]
  return {
    id: 1,
    student_id: 'demo',
    mirror_entry_id: 1,
    payload: {
      diffs: {
        values: emptyDimDiff('Values rewrite.', 'Values open question?'),
        interests: emptyDimDiff(),
        personality: emptyDimDiff(),
        skills: emptyDimDiff(),
      },
      admitted,
      downgraded: overrides?.downgraded ?? [],
      dropped: overrides?.dropped ?? [],
    } as VipsProposedDiffRow['payload'],
    verifier_result: {
      admitted,
      downgraded: [],
      dropped: [],
    } as VipsProposedDiffRow['verifier_result'],
    status: 'pending',
    created_at: '2026-05-11T00:00:00Z',
    reviewed_at: null,
  }
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('PostMirrorReview', () => {
  it('renders one DimensionGroup per VIPS dimension with entries and shows the compiled-truth preview', () => {
    const diff = makeDiff()
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    expect(screen.getByTestId('dimension-group-values')).toBeInTheDocument()
    // Empty dimensions render nothing.
    expect(screen.queryByTestId('dimension-group-interests')).toBeNull()
    expect(screen.getByText('Values rewrite.')).toBeInTheDocument()
    expect(screen.getByText(/Values open question/)).toBeInTheDocument()
  })

  it('Done is disabled while admitted entries are pending and enables when all are resolved', async () => {
    const a = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'q1',
    })
    const b = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.b',
      verbatim_quote: 'q2',
      resolved: 'confirmed',
    })
    const diff = makeDiff({ admitted: [a, b] })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    expect(screen.getByTestId('review-done')).toBeDisabled()

    // Now flip the second entry's diff into a fully-resolved state.
    const allResolvedDiff = makeDiff({
      admitted: [
        { ...a, resolved: 'confirmed' as const },
        { ...b, resolved: 'confirmed' as const },
      ],
    })
    render(<PostMirrorReview studentId="demo" diff={allResolvedDiff} />, {
      wrapper: makeWrapper(),
    })
    const doneButtons = screen.getAllByTestId('review-done')
    // Second mount's button (allResolved=true) is the last rendered.
    expect(doneButtons[doneButtons.length - 1]).not.toBeDisabled()
  })

  it('confirm button fires the confirm mutation with the right entry id', async () => {
    const a = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'q1',
    })
    const diff = makeDiff({ admitted: [a] })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    const expectedEntryId = buildReviewEntryId(a)
    await userEvent.click(screen.getByTestId(`confirm-${expectedEntryId}`))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    expect(confirmMock).toHaveBeenCalledWith({
      data: { studentId: 'demo', diffId: 1, entryId: expectedEntryId },
    })
  })

  it('forget button fires the forget mutation with the right entry id', async () => {
    const a = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'q1',
    })
    const diff = makeDiff({ admitted: [a] })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    const expectedEntryId = buildReviewEntryId(a)
    await userEvent.click(screen.getByTestId(`forget-${expectedEntryId}`))

    await waitFor(() => expect(forgetMock).toHaveBeenCalledTimes(1))
    expect(forgetMock).toHaveBeenCalledWith({
      data: { studentId: 'demo', diffId: 1, entryId: expectedEntryId },
    })
  })

  it('renders dropped entries in a collapsed section with their reason', () => {
    const dropped = [
      {
        entry: {
          dimension: 'values' as const,
          canonical_claim_id: 'values.fabricated',
          verbatim_quote: 'something never said',
          reflection_id: 1,
          strength: 'medium' as const,
          parallax_tag: ['school' as const],
        },
        reason: 'no_quote_match' as const,
      },
    ]
    const diff = makeDiff({ dropped })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    expect(screen.getByTestId('dropped-section')).toBeInTheDocument()
    expect(screen.getByTestId('dropped-entry')).toBeInTheDocument()
    expect(screen.getByText(/no quote match/i)).toBeInTheDocument()
    expect(screen.getByText(/something never said/)).toBeInTheDocument()
  })

  it('Confirm all button fires confirm for every pending entry sequentially', async () => {
    const a = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'q1',
    })
    const b = annotatedEntry({
      dimension: 'interests',
      canonical_claim_id: 'interests.b',
      verbatim_quote: 'q2',
    })
    const c = annotatedEntry({
      dimension: 'skills',
      canonical_claim_id: 'skills.c',
      verbatim_quote: 'q3',
      // Pre-resolved entries should NOT be re-confirmed by the bulk button.
      resolved: 'forgotten',
    })
    const diff = makeDiff({ admitted: [a, b, c] })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    const bulkButton = screen.getByTestId('review-confirm-all')
    expect(bulkButton).toHaveTextContent(/Confirm all 2/)
    await userEvent.click(bulkButton)

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(2))
    expect(confirmMock).toHaveBeenNthCalledWith(1, {
      data: { studentId: 'demo', diffId: 1, entryId: buildReviewEntryId(a) },
    })
    expect(confirmMock).toHaveBeenNthCalledWith(2, {
      data: { studentId: 'demo', diffId: 1, entryId: buildReviewEntryId(b) },
    })
  })

  it('Confirm all button is absent when every entry is already resolved', () => {
    const a = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'q1',
      resolved: 'confirmed',
    })
    const diff = makeDiff({ admitted: [a] })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    expect(screen.queryByTestId('review-confirm-all')).toBeNull()
  })

  it('renders the right verdict badge per entry (verified / aspirational / partial-match)', () => {
    const verified = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.v',
      verbatim_quote: 'v',
    })
    const aspirational = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.a',
      verbatim_quote: 'a',
      aspirational: true,
    })
    const partial = annotatedEntry({
      dimension: 'values',
      canonical_claim_id: 'values.p',
      verbatim_quote: 'p',
      partial_match: true,
    })
    const diff = makeDiff({ admitted: [verified, aspirational, partial] })
    render(<PostMirrorReview studentId="demo" diff={diff} />, { wrapper: makeWrapper() })

    expect(screen.getAllByTestId('verdict-verified')).toHaveLength(1)
    expect(screen.getAllByTestId('verdict-aspirational')).toHaveLength(1)
    expect(screen.getAllByTestId('verdict-partial')).toHaveLength(1)
  })
})
