import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadTrajectoryMock = vi.fn()
vi.mock('~/server/load-trajectory.functions', () => ({
  loadTrajectory: (args: unknown) => loadTrajectoryMock(args),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...(props as Record<string, unknown>)}>
      {children}
    </a>
  ),
}))

import { TrajectorySheetView } from '~/components/TrajectorySheetView'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

afterEach(() => loadTrajectoryMock.mockReset())

describe('TrajectorySheetView', () => {
  it('renders the compiled trajectory paragraph and a link to /trajectory', async () => {
    loadTrajectoryMock.mockResolvedValue({
      trajectory: {
        trajectory_text: 'You orient toward STEM with quiet civic instincts.',
        pathways: [],
        open_questions: [],
        disclaimer: '',
        created_at: '2026-05-01',
      },
      pending_diff_present: false,
    })
    render(<TrajectorySheetView studentId="demo" />, { wrapper: makeWrapper() })
    await waitFor(() =>
      expect(screen.getByTestId('trajectory-sheet-paragraph')).toBeInTheDocument(),
    )
    expect(screen.getByText(/STEM with quiet civic instincts/)).toBeInTheDocument()
    expect(screen.getByTestId('trajectory-sheet-link')).toHaveAttribute('href', '/trajectory')
  })

  it('renders an empty-state when no trajectory is available', async () => {
    loadTrajectoryMock.mockResolvedValue({ trajectory: null, pending_diff_present: false })
    render(<TrajectorySheetView studentId="demo" />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByTestId('trajectory-sheet-empty')).toBeInTheDocument())
  })

  it('renders an error message when the query rejects', async () => {
    loadTrajectoryMock.mockRejectedValue(new Error('boom'))
    render(<TrajectorySheetView studentId="demo" />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByTestId('trajectory-sheet-error')).toBeInTheDocument())
  })
})
