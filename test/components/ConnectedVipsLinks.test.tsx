import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectedVipsLinks } from '~/components/ConnectedVipsLinks'
import type { VipsTimelineEntryRow } from '~/db/queries'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

function entry(overrides: Partial<VipsTimelineEntryRow> = {}): VipsTimelineEntryRow {
  return {
    id: 1,
    student_id: 'demo',
    dimension: 'values',
    canonical_claim_id: 'values.independence',
    verbatim_quote: 'i hated when teacher told us exactly what to do',
    reflection_id: 7,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-13T00:00:00.000Z',
    ...overrides,
  }
}

describe('ConnectedVipsLinks', () => {
  it('groups connected VIPS entries by dimension', () => {
    render(
      <ConnectedVipsLinks
        entries={[
          entry(),
          entry({
            id: 2,
            dimension: 'skills',
            canonical_claim_id: 'skills.analytical',
            verbatim_quote: 'I broke it into parts first',
            parallax_tag: ['school', 'hobby'],
          }),
        ]}
      />,
    )

    expect(screen.getByText('Values')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('values.independence')).toBeInTheDocument()
    expect(screen.getByText('skills.analytical')).toBeInTheDocument()
    expect(screen.getByTestId('connected-vips-entry-1')).toHaveTextContent(
      'i hated when teacher told us exactly what to do',
    )
  })

  it('renders a calm empty state that points back to Library', () => {
    render(<ConnectedVipsLinks entries={[]} />)

    expect(screen.getByText(/No connected VIPS entries yet/)).toBeInTheDocument()
    expect(screen.getByText('Back to Library')).toBeInTheDocument()
  })
})
