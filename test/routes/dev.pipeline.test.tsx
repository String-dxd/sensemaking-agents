/**
 * `/dev/pipeline` route view tests.
 *
 * The route entry point reads loader data via `Route.useLoaderData()` — not
 * directly testable in isolation. The route file exports `PipelinePageView`
 * for tests, which renders the same body with explicit data. The route
 * binding itself (`beforeLoad` 404 in production, `loader` wiring) is
 * exercised in integration; here we cover the user-visible behavior.
 *
 * Coverage:
 *  - filter pills narrow the mirror list by review_status
 *  - clicking a row toggles the detail panel
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PipelinePageView } from '~/routes/dev.pipeline'
import type { PipelineMirrorRow, PipelineTraceResult } from '~/server/load-pipeline-trace.types'

function mirror(overrides: Partial<PipelineMirrorRow> = {}): PipelineMirrorRow {
  return {
    id: 1,
    created_at: '2026-05-10T00:00:00Z',
    context_type: 'school',
    review_status: 'pending',
    transcript: 'walked through what mattered today',
    validation: 'val',
    inferred_meaning: 'inf',
    story_reframe: 'reframe',
    diffs: [],
    committed_timeline: [],
    ...overrides,
  }
}

function makeData(overrides: Partial<PipelineTraceResult> = {}): PipelineTraceResult {
  return {
    activeStudentId: 'demo-a',
    mirrors: [
      mirror({ id: 1, review_status: 'pending', transcript: 'pending one' }),
      mirror({ id: 2, review_status: 'confirmed', transcript: 'confirmed one' }),
    ],
    pages: [],
    cartographer: null,
    totals: { mirrors: 2, diffs: 0, committed_timeline: 0 },
    ...overrides,
  }
}

describe('/dev/pipeline PipelinePageView', () => {
  it('filters mirror rows when a status pill is selected', async () => {
    const user = userEvent.setup()
    render(<PipelinePageView data={makeData()} />)
    expect(screen.getByText('pending one')).toBeInTheDocument()
    expect(screen.getByText('confirmed one')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'confirmed' }))
    expect(screen.queryByText('pending one')).not.toBeInTheDocument()
    expect(screen.getByText('confirmed one')).toBeInTheDocument()
  })

  it('expands a mirror row when its show button is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelinePageView data={makeData()} />)
    const [firstShow] = screen.getAllByRole('button', { name: 'show' })
    if (!firstShow) throw new Error('expected at least one show button')
    await user.click(firstShow)
    // After expansion, the row shows the validation/inferred-meaning labels.
    expect(screen.getByText(/Mirror . validation/i)).toBeInTheDocument()
  })
})
