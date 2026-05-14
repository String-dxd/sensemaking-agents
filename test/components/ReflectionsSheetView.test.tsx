import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReflectionsSheetView } from '~/components/ReflectionsSheetView'
import type { MirrorEntryRow } from '~/db/queries'

const loadWikiMock = vi.fn()
const updateMirrorReviewMock = vi.fn()
const bulkUpdateMirrorReviewMock = vi.fn()
const runConnectorMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, className }: LinkMockProps) => (
    <a href={buildMockHref(to, params)} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('~/server/load-wiki.functions', () => ({
  loadWiki: (args: unknown) => loadWikiMock(args),
}))

vi.mock('~/server/update-mirror-review.functions', () => ({
  updateMirrorReview: (args: unknown) => updateMirrorReviewMock(args),
  bulkUpdateMirrorReview: (args: unknown) => bulkUpdateMirrorReviewMock(args),
}))

vi.mock('~/server/run-connector.functions', () => ({
  runConnector: (args: unknown) => runConnectorMock(args),
}))

afterEach(() => {
  loadWikiMock.mockReset()
  updateMirrorReviewMock.mockReset()
  bulkUpdateMirrorReviewMock.mockReset()
  runConnectorMock.mockReset()
})

describe('ReflectionsSheetView', () => {
  it('invalidates the world scene data when a reflection is forgotten', async () => {
    const entry = makeMirrorEntry({ id: 25, review_status: 'pending' })
    loadWikiMock.mockResolvedValue({ entries: [entry] })
    updateMirrorReviewMock.mockResolvedValue({ ...entry, review_status: 'forgotten' })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    render(<ReflectionsSheetView studentId="me" filter="all" onFilterChange={vi.fn()} />, {
      wrapper: makeWrapper(qc),
    })

    await screen.findByTestId('sheet-mirror-entry-25')
    await userEvent.click(screen.getByRole('button', { name: 'Forget' }))

    await waitFor(() => expect(updateMirrorReviewMock).toHaveBeenCalledTimes(1))
    expect(updateMirrorReviewMock).toHaveBeenCalledWith({
      data: { entryId: 25, status: 'forgotten' },
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['wiki', 'me'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['vips-pages', 'me'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trajectory', 'me'] })
  })
})

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function makeMirrorEntry(overrides: Partial<MirrorEntryRow> = {}): MirrorEntryRow {
  return {
    id: 1,
    student_id: 'me',
    transcript: 'I stayed up building the island.',
    validation: 'You stayed with something personal.',
    inferred_meaning: 'This may point toward self-expression and care.',
    story_reframe: 'You are making a place that grows with attention.',
    raw_output_json: '{}',
    context_type: 'hobby',
    review_status: 'pending',
    tags: [],
    created_at: '2026-05-14T07:22:13.000Z',
    ...overrides,
  }
}

function buildMockHref(to: string, params?: { entryId?: string }) {
  return to.replace('$entryId', params?.entryId ?? '')
}

interface LinkMockProps {
  to: string
  params?: { entryId?: string }
  children: React.ReactNode
  className?: string
}
