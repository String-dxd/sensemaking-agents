/**
 * U9 — VipsPageView component tests.
 *
 * Mock the forget-timeline-entry server fn so the component test runs
 * entirely in happy-dom. The contract:
 *   - Renders compiled_truth + open_question + a timeline list.
 *   - Forget click → inline confirm → confirm click fires the mutation.
 *   - Forgotten entries are not in the rendered timeline (because the
 *     loader filters them; the component just renders what it's given).
 *   - R3: timeline entries are read-only (no edit affordances rendered).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VipsPageView } from '~/components/VipsPageView'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'

// Mock the server fn — we don't want to hit the DB from a component test.
const forgetMock = vi
  .fn()
  .mockResolvedValue({ dimension: 'values', forgotten_at: '2026-05-11T00:00:00Z' })

vi.mock('~/server/forget-timeline-entry.functions', () => ({
  forgetTimelineEntry: (args: unknown) => forgetMock(args),
}))

afterEach(() => {
  forgetMock.mockClear()
})

function makePage(overrides: Partial<VipsPageRow> = {}): VipsPageRow {
  return {
    student_id: 'demo',
    dimension: 'values',
    compiled_truth: 'Practices self-direction in school settings.',
    open_question: 'Does the same hold collaboratively?',
    updated_at: '2026-05-10T00:00:00Z',
    ...overrides,
  }
}

function makeEntry(overrides: Partial<VipsTimelineEntryRow> = {}): VipsTimelineEntryRow {
  return {
    id: 1,
    student_id: 'demo',
    dimension: 'values',
    canonical_claim_id: 'values.self_direction',
    verbatim_quote: 'i hated when teacher told us exactly what to do',
    reflection_id: 7,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-10T00:00:00Z',
    ...overrides,
  }
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('VipsPageView', () => {
  it('renders dimension label, compiled_truth, open_question, and timeline list', () => {
    const page = makePage()
    const timeline = [makeEntry({ id: 1 }), makeEntry({ id: 2, canonical_claim_id: 'values.b' })]
    render(<VipsPageView studentId="demo" dimension="values" page={page} timeline={timeline} />, {
      wrapper: makeWrapper(),
    })

    expect(screen.getByTestId('vips-page-values')).toBeInTheDocument()
    expect(screen.getByText('Values')).toBeInTheDocument()
    expect(screen.getByTestId('compiled-truth')).toHaveTextContent(/Practices self-direction/i)
    expect(screen.getByTestId('open-question')).toHaveTextContent(/Does the same/i)
    expect(screen.getByTestId('timeline-entry-1')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-entry-2')).toBeInTheDocument()
  })

  it('renders the empty-state copy when compiled_truth is empty', () => {
    render(
      <VipsPageView
        studentId="demo"
        dimension="values"
        page={makePage({ compiled_truth: '', open_question: '', updated_at: null })}
        timeline={[]}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByTestId('compiled-truth-empty')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
  })

  it('forget click reveals inline confirm; confirming fires the mutation with the entry id', async () => {
    const entry = makeEntry({ id: 42 })
    render(
      <VipsPageView studentId="demo" dimension="values" page={makePage()} timeline={[entry]} />,
      { wrapper: makeWrapper() },
    )

    // No inline confirm initially.
    expect(screen.queryByTestId('forget-inline-confirm')).toBeNull()

    await userEvent.click(screen.getByTestId('forget-button-42'))
    expect(screen.getByTestId('forget-inline-confirm')).toBeInTheDocument()
    expect(screen.getByText(/you can't undo/i)).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('forget-confirm-42'))

    await waitFor(() => expect(forgetMock).toHaveBeenCalledTimes(1))
    expect(forgetMock).toHaveBeenCalledWith({ data: { studentId: 'demo', entryId: 42 } })
  })

  it('cancel inline confirm hides it without firing the mutation', async () => {
    const entry = makeEntry({ id: 7 })
    render(
      <VipsPageView studentId="demo" dimension="values" page={makePage()} timeline={[entry]} />,
      { wrapper: makeWrapper() },
    )

    await userEvent.click(screen.getByTestId('forget-button-7'))
    expect(screen.getByTestId('forget-inline-confirm')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('forget-cancel-7'))
    expect(screen.queryByTestId('forget-inline-confirm')).toBeNull()
    expect(forgetMock).not.toHaveBeenCalled()
  })

  it('does not render entries that the loader filtered out (component renders what it is given)', () => {
    // The handler filters forgotten rows; the component just renders the
    // list. This test pins the contract: if the timeline is empty (because
    // the only entry was forgotten), the empty-state shows and the
    // forgotten entry is nowhere on the page.
    render(<VipsPageView studentId="demo" dimension="values" page={makePage()} timeline={[]} />, {
      wrapper: makeWrapper(),
    })
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
    expect(screen.queryByText(/i hated when teacher/i)).toBeNull()
  })

  it('R3: timeline entries render no edit affordance (only forget)', () => {
    render(
      <VipsPageView
        studentId="demo"
        dimension="values"
        page={makePage()}
        timeline={[makeEntry({ id: 1 })]}
      />,
      { wrapper: makeWrapper() },
    )
    // No "Edit" or "Confirm" buttons from EditableField — only the forget
    // affordance + inline confirm flow.
    expect(screen.queryByTestId('edit-button')).toBeNull()
    expect(screen.queryByTestId('editable-textarea')).toBeNull()
    expect(screen.getByTestId('forget-button-1')).toBeInTheDocument()
  })
})
