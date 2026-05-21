import { waitFor } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))
const view = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

vi.mock('~/engine/student-space/Game/View/View.js', () => ({
  default: {
    getInstance: () => view.instance,
  },
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import HistorySheet from '~/engine/student-space/Game/View/HistorySheet.js'

describe('Student Space HistorySheet growth degradation', () => {
  let sheet: { dispose?: () => void; _selectYear?: (year: number) => void } | null = null
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    state.instance = {}
    view.instance = {
      sprouts: { setTimelapseSubset: vi.fn() },
      calendarSheet: null,
      overlayController: { noteClosed: vi.fn() },
    }
    fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/api/growth/summary')) {
        return Response.json({
          kind: 'ok',
          year: 2026,
          voiceReflections: 2,
          claimsCrystallised: 1,
          claimsForgotten: 0,
          dominantDimension: 'skills',
          dimensionShift: null,
          narrative: 'Skills stood out this year.',
          isFirstYear: false,
        })
      }
      return Response.json(
        { ok: false, error: { code: 'internal_error', message: 'boom' } },
        { status: 500 },
      )
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    sheet?.dispose?.()
    sheet = null
    state.instance = null
    view.instance = null
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('renders the summary and a degraded island label when island-state fails', async () => {
    sheet = new HistorySheet() as {
      dispose?: () => void
      _selectYear?: (year: number) => void
    }

    sheet._selectYear?.(2026)

    await waitFor(() =>
      expect(document.querySelector('[data-narrative]')).toHaveTextContent(
        'Skills stood out this year.',
      ),
    )
    expect(document.querySelector('[data-source]')).toHaveTextContent('Island snapshot unavailable')
    expect(
      (view.instance as { sprouts: { setTimelapseSubset: ReturnType<typeof vi.fn> } }).sprouts
        .setTimelapseSubset,
    ).toHaveBeenCalledWith([])
  })

  it('renders the snapshot source label when island-state returns a snapshot', async () => {
    const bloomedTrees = [{ id: 'tree-1', dimension: 'skills' }]
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('/api/growth/summary')) {
        return Response.json({
          kind: 'ok',
          year: 2026,
          voiceReflections: 2,
          claimsCrystallised: 1,
          claimsForgotten: 0,
          dominantDimension: 'skills',
          dimensionShift: null,
          narrative: 'Skills stood out this year.',
          isFirstYear: false,
        })
      }
      return Response.json({
        source: 'snapshot',
        capturedAt: '2026-06-01T00:00:00.000Z',
        year: 2026,
        bloomedTrees,
      })
    })
    sheet = new HistorySheet() as {
      dispose?: () => void
      _selectYear?: (year: number) => void
    }

    sheet._selectYear?.(2026)

    await waitFor(() =>
      expect(document.querySelector('[data-source]')).toHaveTextContent('Snapshot from'),
    )
    expect(document.querySelector('[data-source]')).toHaveTextContent('2026')
    expect(
      (view.instance as { sprouts: { setTimelapseSubset: ReturnType<typeof vi.fn> } }).sprouts
        .setTimelapseSubset,
    ).toHaveBeenCalledWith(bloomedTrees)
  })

  it('renders the reconstructed source label when island-state is rebuilt from claims', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('/api/growth/summary')) {
        return Response.json({
          kind: 'ok',
          year: 2026,
          voiceReflections: 2,
          claimsCrystallised: 1,
          claimsForgotten: 0,
          dominantDimension: 'skills',
          dimensionShift: null,
          narrative: 'Skills stood out this year.',
          isFirstYear: false,
        })
      }
      return Response.json({
        source: 'reconstructed',
        capturedAt: null,
        year: 2026,
        bloomedTrees: [],
      })
    })
    sheet = new HistorySheet() as {
      dispose?: () => void
      _selectYear?: (year: number) => void
    }

    sheet._selectYear?.(2026)

    await waitFor(() =>
      expect(document.querySelector('[data-source]')).toHaveTextContent(
        'Reconstructed from your claims',
      ),
    )
  })
})
