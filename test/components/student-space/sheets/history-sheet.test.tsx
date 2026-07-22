/**
 * React HistorySheet (U6 of the migration) — replaces 1,926 lines of engine
 * code split across HistorySheet.js, CalendarSheet.js, and DayDetailCard.js.
 *
 * Tests focus on the tab routing + calendar/day-detail wiring. The Three.js
 * GrowthIslandPreview is exercised in isolation by mocking `three` and
 * `three/examples/jsm/controls/OrbitControls.js`; full WebGL behavior is
 * out of scope for happy-dom.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistorySheet } from '~/components/student-space/sheets/HistorySheet'
import { EngineContext } from '~/lib/student-space/use-engine'

// Stub three.js so the GrowthIslandPreview's dynamic import resolves in
// happy-dom without instantiating a real WebGL context.
vi.mock('three', () => ({
  WebGLRenderer: vi.fn(() => ({
    domElement: document.createElement('canvas'),
    setClearAlpha: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  })),
  PerspectiveCamera: vi.fn(() => ({
    position: { set: vi.fn() },
    layers: { set: vi.fn() },
    aspect: 1,
    updateProjectionMatrix: vi.fn(),
  })),
}))
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn(() => ({
    enableDamping: false,
    enablePan: false,
    minDistance: 0,
    maxDistance: 0,
    minPolarAngle: 0,
    maxPolarAngle: 0,
    target: { set: vi.fn() },
    update: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispose: vi.fn(),
  })),
}))

const TODAY = '2026-05-22'

type TestCapture = {
  id: string
  entryDate: string
  kind: string
  text?: string
  createdAt?: string
  backendMirrorEntryId?: number
  reviewStatus?: string
  syncStatus?: string
  syncError?: string
  contextType?: string
}

type TestEvent = {
  id?: string
  date?: string
  entryDate?: string
  kind?: string
  label?: string
  title?: string
}

function makeEngine(
  overrides: {
    pins?: Array<{ entryDate: string; emotion?: string }>
    captures?: TestCapture[]
    events?: TestEvent[]
    backend?: Record<string, unknown>
  } = {},
) {
  const captures = [...(overrides.captures ?? [])]
  const captureSubscribers = new Set<() => void>()
  const capturePatch = vi.fn((id: string, updates: Partial<TestCapture>) => {
    const capture = captures.find((entry) => entry.id === id)
    if (!capture) return null
    Object.assign(capture, updates)
    for (const subscriber of captureSubscribers) subscriber()
    return capture
  })

  return {
    state: {
      backend: overrides.backend ?? null,
      applyBackendSnapshot: vi.fn(),
      moodPins: {
        pins: overrides.pins ?? [],
        subscribe: () => () => {},
      },
      captures: {
        entries: captures,
        findById: (id: string) => captures.find((capture) => capture.id === id) ?? null,
        patch: capturePatch,
        subscribe: (cb: () => void) => {
          captureSubscribers.add(cb)
          return () => captureSubscribers.delete(cb)
        },
      },
      calendar: { events: overrides.events ?? [], subscribe: () => () => {} },
      sprouts: {
        years: () => [2026, 2025, 2024],
        setTimelapseSubset: vi.fn(),
      },
    },
    view: {
      scene: {},
    },
  }
}

function renderHistory(engine: ReturnType<typeof makeEngine>, initialPath = '/history') {
  const rootRoute = createRootRoute({
    component: () => (
      <EngineContext.Provider value={engine as never}>
        <HistorySheet />
      </EngineContext.Provider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/history',
    component: () => null,
  })
  const historyTabRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/history/$tab',
    component: () => null,
  })
  const catchAll = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, historyRoute, historyTabRoute, catchAll])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  // Default fetch responses so the components don't error out.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/api/growth/summary')) {
      return {
        ok: true,
        json: async () => ({
          year: 2026,
          reflections: 3,
          crystallised: 1,
          forgotten: 0,
          dominant: 'values',
        }),
      } as Response
    }
    if (url.includes('/api/growth/island-state-at')) {
      return { ok: true, json: async () => ({ bloomedTrees: [] }) } as Response
    }
    return { ok: false } as Response
  })
})

afterEach(() => {
  document.body.classList.remove('has-overlay')
  vi.restoreAllMocks()
})

describe('HistorySheet (React)', () => {
  it('opens with the Timeline tab by default; calendar and day detail render', async () => {
    renderHistory(makeEngine({ pins: [{ entryDate: TODAY, emotion: 'joy' }] }))
    expect(await screen.findByTestId('calendar-pane')).toBeInTheDocument()
    expect(screen.getByTestId('day-detail-card')).toBeInTheDocument()
  })

  it('clicking a day cell selects it and updates day detail', async () => {
    renderHistory(makeEngine())
    const cal = await screen.findByTestId('calendar-pane')
    // Default is Month view, so "15" is already on-screen.
    const fifteen = (await screen.findAllByRole('button', { name: /15/ }))[0]
    expect(fifteen).toBeDefined()
    await userEvent.click(fifteen as Element)
    expect((fifteen as HTMLElement).getAttribute('data-selected')).toBe('true')
    expect(cal).toBeInTheDocument()
  })

  it('selects a linked reflection day from the route hash', async () => {
    renderHistory(
      makeEngine({
        captures: [
          {
            id: 'mirror:24',
            entryDate: '2026-04-03',
            createdAt: '2026-04-03T08:00:00.000Z',
            kind: 'ask',
            text: 'Linked reflection',
            backendMirrorEntryId: 24,
          },
        ],
      }),
      '/history#reflection-24',
    )

    expect(await screen.findByText(/Friday, April 3, 2026/)).toBeInTheDocument()
    expect(screen.getByText('Linked reflection')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Wednesday, April 15, 2026/ }))
    expect(await screen.findByText(/Wednesday, April 15, 2026/)).toBeInTheDocument()
    expect(screen.queryByText('Linked reflection')).not.toBeInTheDocument()
  })

  it('selects the newest pending reflection from the need-review filter and advances after confirm', async () => {
    const updateReflectionReview = vi.fn(async () => ({
      reviewStatus: 'confirmed',
      transcript: 'Confirmed latest',
      contextType: 'school',
    }))
    const engine = makeEngine({
      backend: { updateReflectionReview },
      captures: [
        {
          id: 'mirror:23',
          entryDate: '2026-04-03',
          createdAt: '2026-04-03T08:00:00.000Z',
          kind: 'ask',
          text: 'Older pending',
          backendMirrorEntryId: 23,
          reviewStatus: 'pending',
        },
        {
          id: 'mirror:24',
          entryDate: TODAY,
          createdAt: '2026-05-22T08:00:00.000Z',
          kind: 'ask',
          text: 'Newest pending',
          backendMirrorEntryId: 24,
          reviewStatus: 'pending',
        },
      ],
    })

    renderHistory(engine, '/history?filter=need-review')

    expect(await screen.findByText('Newest pending')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('Older pending')).toBeInTheDocument())
    expect(screen.queryByText('Newest pending')).not.toBeInTheDocument()
  })

  it('renders school events from the engine date/label shape', async () => {
    renderHistory(
      makeEngine({
        events: [{ id: 'event-1', date: TODAY, kind: 'class', label: 'Mathematics - Sec 3.4' }],
      }),
    )

    expect(await screen.findByText('Mathematics - Sec 3.4')).toBeInTheDocument()
  })

  it('can confirm pending backend reflections from day detail', async () => {
    const updateReflectionReview = vi.fn(async () => ({
      reviewStatus: 'confirmed',
      transcript: 'Confirmed transcript',
      contextType: 'school',
    }))
    const engine = makeEngine({
      backend: { updateReflectionReview },
      captures: [
        {
          id: 'mirror:24',
          entryDate: TODAY,
          createdAt: '2026-05-22T08:00:00.000Z',
          kind: 'ask',
          text: 'Needs review',
          backendMirrorEntryId: 24,
          reviewStatus: 'pending',
        },
      ],
    })
    renderHistory(engine)

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(updateReflectionReview).toHaveBeenCalledWith({ entryId: 24, status: 'confirmed' }),
    )
    expect(engine.state.captures.patch).toHaveBeenCalledWith(
      'mirror:24',
      expect.objectContaining({
        reviewStatus: 'confirmed',
        text: 'Confirmed transcript',
        contextType: 'school',
      }),
    )
  })

  it('can retry failed local reflection syncs from day detail', async () => {
    const submitReflection = vi.fn(async () => ({
      mirrorEntry: {
        id: 91,
        transcript: 'Synced reflection',
        reviewStatus: 'pending',
        contextType: 'school',
      },
    }))
    const engine = makeEngine({
      backend: { submitReflection },
      captures: [
        {
          id: 'local-ask-1',
          entryDate: TODAY,
          createdAt: '2026-05-22T08:00:00.000Z',
          kind: 'ask',
          text: 'Needs sync',
          syncStatus: 'failed',
          syncError: 'offline',
          contextType: 'home',
        },
      ],
    })
    renderHistory(engine)

    await userEvent.click(await screen.findByRole('button', { name: 'Retry sync' }))
    await waitFor(() =>
      expect(submitReflection).toHaveBeenCalledWith({
        localCaptureId: 'local-ask-1',
        transcript: 'Needs sync',
        contextType: 'home',
      }),
    )
    expect(engine.state.captures.patch).toHaveBeenCalledWith('local-ask-1', {
      syncStatus: 'syncing',
      syncError: '',
    })
    expect(engine.state.captures.patch).toHaveBeenCalledWith(
      'local-ask-1',
      expect.objectContaining({
        backendMirrorEntryId: 91,
        text: 'Synced reflection',
        reviewStatus: 'pending',
        syncStatus: 'synced',
      }),
    )
  })

  it('switches to Growth tab and loads /api/growth/summary', async () => {
    renderHistory(makeEngine())
    await userEvent.click(await screen.findByRole('button', { name: 'Growth' }))
    await waitFor(() => expect(screen.queryByTestId('calendar-pane')).toBeNull())
    expect(await screen.findByText('Voice reflections')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
  })

  it('Growth tab renders the Three.js island preview canvas', async () => {
    renderHistory(makeEngine(), '/history/growth')
    expect(await screen.findByTestId('growth-island-preview')).toBeInTheDocument()
  })

  it('adds body.has-overlay while mounted', async () => {
    const { unmount } = renderHistory(makeEngine())
    await waitFor(() => expect(document.body.classList.contains('has-overlay')).toBe(true))
    unmount()
    expect(document.body.classList.contains('has-overlay')).toBe(false)
  })
})
