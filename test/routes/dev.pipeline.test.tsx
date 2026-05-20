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
 *  - end-to-end action controls are visible for manual pipeline checks
 *  - Realtime GPT transcript test uses the same live voice capture as the engine
 *  - connector graph renders mirror-to-claim links from committed timeline rows
 *  - filter pills narrow the mirror list by review_status
 *  - clicking a row toggles the detail panel
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VipsTimelineEntryRow } from '~/db/queries'
import {
  canCreateRealtimeMirrorCapture,
  createRealtimeMirrorCapture,
  type StudentSpaceRealtimeMirrorInput,
} from '~/lib/student-space/realtime-mirror-client'
import { PipelinePageView } from '~/routes/dev.pipeline'
import type { PipelineMirrorRow, PipelineTraceResult } from '~/server/load-pipeline-trace.types'

vi.mock('~/lib/student-space/realtime-mirror-client', () => ({
  canCreateRealtimeMirrorCapture: vi.fn(() => true),
  createRealtimeMirrorCapture: vi.fn(),
}))

const mockCanCreateRealtimeMirrorCapture = vi.mocked(canCreateRealtimeMirrorCapture)
const mockCreateRealtimeMirrorCapture = vi.mocked(createRealtimeMirrorCapture)

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

function timeline(overrides: Partial<VipsTimelineEntryRow> = {}): VipsTimelineEntryRow {
  return {
    id: 101,
    student_id: 'demo-a',
    dimension: 'skills',
    canonical_claim_id: 'skills.analytical_debugging',
    verbatim_quote: 'I liked breaking the problem into small tests.',
    reflection_id: 2,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-10T00:00:00Z',
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
  beforeEach(() => {
    mockCanCreateRealtimeMirrorCapture.mockReturnValue(true)
    mockCreateRealtimeMirrorCapture.mockReset()
  })

  it('renders full end-to-end controls for Mirror, Connector, and sense-making', () => {
    render(<PipelinePageView data={makeData()} />)

    expect(screen.getByRole('button', { name: 'Start Realtime transcript' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop Realtime transcript' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run initial chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run Connector' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run sense-making' })).toBeInTheDocument()
    expect(screen.getByLabelText('Initial chat transcript')).toBeInTheDocument()
    expect(screen.getByTestId('pipeline-action-log')).toHaveTextContent('Ready.')
  })

  it('runs the Realtime GPT transcript test and copies the final transcript into initial chat', async () => {
    const user = userEvent.setup()
    const stop = vi.fn(async () => ({
      localCaptureId: 'dev-pipeline-realtime-1',
      transcript: 'I said this through Realtime.',
      validation: 'The transcript arrived live.',
      inferredMeaning: 'The student was testing the voice path.',
      storyReframe: 'Kira heard the live transcript.',
      contextType: 'school' as const,
      transcription: {
        provider: 'openai_realtime' as const,
        transcript: 'I said this through Realtime.',
      },
    }))
    const abort = vi.fn()
    mockCreateRealtimeMirrorCapture.mockImplementation(
      async (input: StudentSpaceRealtimeMirrorInput) => {
        input.onConversationUpdate?.({
          id: 'student-1',
          role: 'student',
          text: 'I said this through Realtime.',
          status: 'final',
        })
        input.onConversationUpdate?.({
          id: 'kira-1',
          role: 'kira',
          text: 'I can hear you.',
          status: 'final',
        })
        return { stop, abort }
      },
    )

    render(<PipelinePageView data={makeData()} />)

    await user.click(screen.getByRole('button', { name: 'Start Realtime transcript' }))
    await waitFor(() => expect(mockCreateRealtimeMirrorCapture).toHaveBeenCalledTimes(1))
    expect(mockCreateRealtimeMirrorCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        localCaptureId: expect.stringMatching(/^dev-pipeline-realtime-/),
        contextType: 'school',
        onConversationUpdate: expect.any(Function),
      }),
    )
    expect(screen.getByTestId('realtime-transcript-log')).toHaveTextContent(
      'I said this through Realtime.',
    )
    expect(screen.getByTestId('realtime-transcript-log')).toHaveTextContent('I can hear you.')

    await user.click(screen.getByRole('button', { name: 'Stop Realtime transcript' }))
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByLabelText('Initial chat transcript')).toHaveValue(
        'I said this through Realtime.',
      ),
    )
    expect(screen.getByText('The transcript arrived live.')).toBeInTheDocument()
    expect(screen.getByTestId('pipeline-action-log')).toHaveTextContent(
      'Realtime: transcript copied into the initial chat field.',
    )
  })

  it('draws a connector graph from mirror entries to committed claims', () => {
    render(
      <PipelinePageView
        data={makeData({
          mirrors: [
            mirror({
              id: 7,
              review_status: 'confirmed',
              transcript: 'robotics debugging reflection',
              committed_timeline: [timeline({ reflection_id: 7 })],
            }),
            mirror({ id: 8, review_status: 'pending', transcript: 'not linked yet' }),
          ],
          totals: { mirrors: 2, diffs: 0, committed_timeline: 1 },
        })}
      />,
    )

    expect(screen.getByText('Connector graph')).toBeInTheDocument()
    expect(screen.getByTestId('connector-graph')).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.getAllByText('analytical debugging').length).toBeGreaterThan(0)
    expect(screen.getByText('1/2 linked')).toBeInTheDocument()
  })

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
