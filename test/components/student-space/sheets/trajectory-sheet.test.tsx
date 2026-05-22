/**
 * React TrajectorySheet (U5 of the migration) — replaces
 * `src/engine/student-space/Game/View/TrajectorySheet.js` (874 lines).
 *
 * Tests use a stub engine + IdentityStatusOverride to exercise each Marcia
 * status branch and the escape-hatch toggle. The component imports
 * `trajectoryHeuristics.trajectoryFor` directly; tests provide engine state
 * shaped to drive predictable status outcomes.
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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrajectorySheet } from '~/components/student-space/sheets/TrajectorySheet'
import { EngineContext } from '~/lib/student-space/use-engine'

// Mock the heuristic modules so tests don't depend on engine state shape.
vi.mock('~/engine/student-space/Game/View/trajectoryHeuristics.js', () => ({
  trajectoryFor: vi.fn(() => ({ status: 'searching', reason: 'mocked', isOverride: false })),
}))
vi.mock('~/engine/student-space/Game/View/statusHeuristics.js', () => ({
  statusCopyOf: vi.fn(() => ({
    title: 'Mocked title',
    tldr: 'Mocked tldr',
    lead: 'Mocked lead',
  })),
  statusLabelOf: vi.fn((s: string) => s.charAt(0).toUpperCase() + s.slice(1)),
  actionsForCluster: vi.fn(() => ['action-1', 'action-2', 'action-3']),
  STARTER_PROMPT: { title: 'Start with {companionName}', prompt: 'starter prompt text' },
  FORECLOSED_CHALLENGE_PROMPT: { title: 'Challenge title', prompt: 'challenge prompt text' },
  DIFFUSED_NUDGES: [
    { title: 'Nudge 1', prompt: 'first nudge prompt' },
    { title: 'Nudge 2', prompt: 'second nudge prompt' },
    { title: 'Nudge 3', prompt: 'third nudge prompt' },
  ],
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import { trajectoryFor } from '~/engine/student-space/Game/View/trajectoryHeuristics.js'

function makeEngine(overrides: { capture?: unknown; runTrajectory?: () => Promise<unknown> } = {}) {
  return {
    state: {
      captures: {
        entries: () => (overrides.capture ? [overrides.capture] : []),
        subscribe: () => () => {},
      },
      profile: {
        displayCompanionName: () => 'Mei',
        identity: { name: 'Maya' },
        subscribe: () => () => {},
      },
      choices: { subscribe: () => () => {} },
      backend: overrides.runTrajectory ? { runTrajectory: overrides.runTrajectory } : null,
      backendActive: false,
      identityStatusOverride: { subscribe: () => () => {} },
    },
    view: { overlayController: { open: vi.fn() } },
  }
}

function renderTrajectory(engine: ReturnType<typeof makeEngine>) {
  const rootRoute = createRootRoute({
    component: () => (
      <EngineContext.Provider value={engine as never}>
        <TrajectorySheet />
      </EngineContext.Provider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, catchAllRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/trajectory'] }),
  })
  return render(<RouterProvider router={router} />)
}

afterEach(() => {
  document.body.classList.remove('has-overlay')
  vi.mocked(trajectoryFor).mockClear()
})

describe('TrajectorySheet (React)', () => {
  it('renders the status pill + title/tldr from heuristics', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'searching',
      reason: 'mocked',
      isOverride: false,
    })
    renderTrajectory(makeEngine())
    expect(await screen.findByTestId('trajectory-status-pill')).toBeInTheDocument()
    expect(screen.getByText('Mocked title')).toBeInTheDocument()
    expect(screen.getByText('Mocked tldr')).toBeInTheDocument()
  })

  it('starter branch renders STARTER_PROMPT and CTA opens Ask', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'starter',
      reason: '',
      isOverride: false,
    })
    const engine = makeEngine()
    renderTrajectory(engine)
    const cta = await screen.findByTestId('trajectory-starter-cta')
    await userEvent.click(cta)
    expect(engine.view.overlayController.open).toHaveBeenCalledWith('ask', {
      prompt: 'starter prompt text',
      dismissOnBack: true,
    })
  })

  it('diffused branch renders nudges and clicking one opens Ask', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'diffused',
      reason: '',
      isOverride: false,
    })
    const engine = makeEngine()
    renderTrajectory(engine)
    expect(await screen.findByText('Pick a nudge')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Nudge 2'))
    expect(engine.view.overlayController.open).toHaveBeenCalledWith('ask', {
      prompt: 'second nudge prompt',
      dismissOnBack: true,
    })
  })

  it('searching empty state when no trajectory capture exists', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'searching',
      reason: '',
      isOverride: false,
    })
    renderTrajectory(makeEngine())
    expect(await screen.findByText(/No trajectory has been generated yet/i)).toBeInTheDocument()
  })

  it('searching tabs render bearings; clicking a tab switches the panel', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'searching',
      reason: '',
      isOverride: false,
    })
    const capture = {
      kind: 'trajectory',
      createdAt: '2026-05-21T08:00:00.000Z',
      trajectory: {
        throughLine: 'A through-line',
        bearings: [
          { title: 'Path A', prompt: 'prompt A' },
          { title: 'Path B', prompt: 'prompt B' },
        ],
      },
    }
    renderTrajectory(makeEngine({ capture }))
    expect(await screen.findByText('A through-line')).toBeInTheDocument()
    expect(screen.getByText('prompt A')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /Path B/ }))
    expect(screen.getByText('prompt B')).toBeInTheDocument()
  })

  it('Show me all paths toggles escape-hatch and re-renders as searching', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'foreclosed',
      reason: '',
      isOverride: false,
    })
    const capture = {
      kind: 'trajectory',
      createdAt: '2026-05-21T08:00:00.000Z',
      trajectory: {
        bearings: [
          { title: 'Path A', prompt: 'prompt A' },
          { title: 'Path B', prompt: 'prompt B' },
        ],
      },
    }
    renderTrajectory(makeEngine({ capture }))
    const escape = await screen.findByTestId('trajectory-escape')
    await userEvent.click(escape)
    expect(screen.getByTestId('trajectory-back')).toBeInTheDocument()
  })

  it('Run sense-making button calls backend.runTrajectory', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'searching',
      reason: '',
      isOverride: false,
    })
    const runTrajectory = vi.fn(async () => undefined)
    const capture = {
      kind: 'trajectory',
      createdAt: '2026-05-21T08:00:00.000Z',
      trajectory: { bearings: [{ title: 'A', prompt: '' }] },
    }
    renderTrajectory(makeEngine({ capture, runTrajectory }))
    const btn = await screen.findByTestId('trajectory-run')
    await userEvent.click(btn)
    await waitFor(() => expect(runTrajectory).toHaveBeenCalled())
  })

  it('adds body.has-overlay while mounted', async () => {
    vi.mocked(trajectoryFor).mockReturnValueOnce({
      status: 'searching',
      reason: '',
      isOverride: false,
    })
    const { unmount } = renderTrajectory(makeEngine())
    await waitFor(() => expect(document.body.classList.contains('has-overlay')).toBe(true))
    unmount()
    expect(document.body.classList.contains('has-overlay')).toBe(false)
  })
})
