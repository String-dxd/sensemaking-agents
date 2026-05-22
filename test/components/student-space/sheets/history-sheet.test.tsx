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

function makeEngine(
  overrides: {
    pins?: Array<{ entryDate: string; emotion?: string }>
    captures?: Array<{ id: string; entryDate: string; kind: string }>
  } = {},
) {
  return {
    state: {
      moodPins: {
        pins: overrides.pins ?? [],
        subscribe: () => () => {},
      },
      captures: {
        entries: overrides.captures ?? [],
        subscribe: () => () => {},
      },
      calendar: { events: [], subscribe: () => () => {} },
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
    // Click any cell labeled "15" — every visible month has a 15th.
    const fifteen = (await screen.findAllByRole('gridcell', { name: /15/ }))[0]
    expect(fifteen).toBeDefined()
    await userEvent.click(fifteen as Element)
    expect((fifteen as HTMLElement).getAttribute('data-selected')).toBe('true')
    expect(cal).toBeInTheDocument()
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
