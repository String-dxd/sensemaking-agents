/**
 * U4 (no-op) — verify the existing VipsPageView renders unchanged when
 * mounted inside the new BottomSheet primitive. The route at
 * `/library/$dimension` is unchanged this plan; the world view's sheet is
 * just a different presentation mode of the same component.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/server/forget-timeline-entry.functions', () => ({
  forgetTimelineEntry: vi.fn().mockResolvedValue({ dimension: 'values' }),
}))

import { BottomSheet } from '~/components/BottomSheet'
import { VipsPageView } from '~/components/VipsPageView'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function makePage(): VipsPageRow {
  return {
    student_id: 'demo',
    dimension: 'values',
    compiled_truth: 'Orients toward self-direction in school.',
    open_question: 'Does the same hold collaboratively?',
    updated_at: '2026-05-10T00:00:00Z',
  }
}

function makeTimeline(): VipsTimelineEntryRow[] {
  return [
    {
      id: 1,
      student_id: 'demo',
      dimension: 'values',
      canonical_claim_id: 'values.independence',
      verbatim_quote: 'i wanted to figure it out without help',
      reflection_id: 7,
      strength: 'medium',
      parallax_tag: ['school'],
      reinforces_id: null,
      forgotten_at: null,
      committed_at: '2026-05-10T00:00:00Z',
    },
  ]
}

describe('VipsPageView rendered inside BottomSheet (U4 no-op)', () => {
  it('renders the Student Space profile IA inside the bottom sheet', () => {
    render(
      <BottomSheet open onOpenChange={vi.fn()}>
        <VipsPageView
          studentId="demo"
          dimension="values"
          page={makePage()}
          timeline={makeTimeline()}
        />
      </BottomSheet>,
      { wrapper: makeWrapper() },
    )

    // Same markers the existing /library/$dimension route asserts via
    // VipsPageView.test.tsx — assert from inside the sheet host.
    expect(screen.getByTestId('vips-page-values')).toBeInTheDocument()
    expect(screen.getByText('What you keep coming back to')).toBeInTheDocument()
    expect(screen.getByTestId('profile-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('compiled-truth')).toHaveTextContent(
      'Orients toward self-direction in school.',
    )
    expect(screen.getByText('Timeline')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-entry-1')).toBeInTheDocument()
  })
})
