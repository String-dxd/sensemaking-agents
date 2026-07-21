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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrajectorySheet } from '~/components/student-space/sheets/TrajectorySheet'
import type {
  IdentityStatusAudit,
  IdentityStatusId,
} from '~/engine/student-space/Game/View/statusHeuristics.js'
import { EngineContext } from '~/lib/student-space/use-engine'

// Mock the heuristic modules so tests don't depend on engine state shape.
vi.mock('~/engine/student-space/Game/View/trajectoryHeuristics.js', () => ({
  trajectoryFor: vi.fn(() => ({
    throughLine: 'Generated through-line',
    bearings: [{ title: 'Generated Path', prompt: 'Generated prompt' }],
  })),
  traitChipOf: vi.fn((id: string) => ({
    kicker: 'Trait',
    label: id,
    title: id,
  })),
  ecgChipOf: vi.fn((id: string) => ({
    label: id,
    title: id,
  })),
}))
vi.mock('~/engine/student-space/Game/View/statusHeuristics.js', () => ({
  STATUS_IDS: ['starter', 'diffused', 'searching', 'foreclosed', 'achieved'],
  statusFor: vi.fn(() => ({
    status: 'searching',
    reason: 'mocked',
    exploration: {
      score: 4,
      band: 'high',
      inputs: {
        distinctClaims: 4,
        weightedQuotes: 4,
        askCount: 0,
        hasBackendCartographer: false,
      },
    },
    commitment: {
      score: 0,
      band: 'low',
      inputs: {
        decisionCount: 0,
        intentionCount: 0,
        dominantPatternTag: null,
      },
    },
  })),
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

import { statusFor } from '~/engine/student-space/Game/View/statusHeuristics.js'
import { trajectoryFor } from '~/engine/student-space/Game/View/trajectoryHeuristics.js'

function statusAudit(status: IdentityStatusId, reason = ''): IdentityStatusAudit {
  return {
    status,
    reason,
    exploration: {
      score: status === 'starter' ? 0 : 4,
      band:
        status === 'starter' || status === 'diffused' || status === 'foreclosed' ? 'low' : 'high',
      inputs: {
        distinctClaims: status === 'starter' ? 0 : 4,
        weightedQuotes: status === 'starter' ? 0 : 4,
        askCount: 0,
        hasBackendCartographer: false,
      },
    },
    commitment: {
      score: status === 'achieved' || status === 'foreclosed' ? 2 : 0,
      band: status === 'achieved' || status === 'foreclosed' ? 'high' : 'low',
      inputs: {
        decisionCount: status === 'achieved' || status === 'foreclosed' ? 1 : 0,
        intentionCount: status === 'achieved' || status === 'foreclosed' ? 1 : 0,
        dominantPatternTag: null,
      },
    },
  }
}

function makeEngine(
  overrides: {
    capture?: unknown
    runTrajectory?: () => Promise<unknown>
    backendActive?: boolean
    statusOverride?: IdentityStatusId | null
    setStatusOverride?: (status: IdentityStatusId | null) => void
  } = {},
) {
  return {
    state: {
      captures: {
        entries: () => (overrides.capture ? [overrides.capture] : []),
        subscribe: () => () => {},
      },
      profile: {
        displayCompanionName: () => 'Mei',
        identity: { name: 'Maya' },
        facets: {},
        subscribe: () => () => {},
      },
      choices: { decisions: [], intentions: [], subscribe: () => () => {} },
      backend: overrides.runTrajectory
        ? { runTrajectory: overrides.runTrajectory, refreshSnapshot: vi.fn(async () => undefined) }
        : null,
      backendActive: Boolean(overrides.backendActive),
      identityStatusOverride: {
        current: overrides.statusOverride ?? null,
        setOverride: overrides.setStatusOverride ?? vi.fn(),
        subscribe: () => () => {},
      },
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

beforeEach(() => {
  vi.mocked(statusFor).mockReturnValue(statusAudit('searching', 'mocked'))
  vi.mocked(trajectoryFor).mockReturnValue({
    throughLine: 'Generated through-line',
    bearings: [{ title: 'Generated Path', prompt: 'Generated prompt' }],
  })
})

afterEach(() => {
  document.body.classList.remove('has-overlay')
  vi.mocked(statusFor).mockReset()
  vi.mocked(trajectoryFor).mockReset()
})

describe('TrajectorySheet (React)', () => {
  it('renders the status pill + title/tldr from heuristics', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching', 'mocked'))
    renderTrajectory(makeEngine())
    expect(await screen.findByTestId('trajectory-status-pill')).toBeInTheDocument()
    expect(screen.getByText('Mocked title')).toBeInTheDocument()
    expect(screen.getByText('Mocked tldr')).toBeInTheDocument()
  })

  it('lets Path Finder own the identity-status preview selector', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching', 'mocked'))
    const setStatusOverride = vi.fn()
    renderTrajectory(makeEngine({ setStatusOverride }))

    await userEvent.click(await screen.findByTestId('trajectory-status-pill'))
    await userEvent.click(screen.getByRole('button', { name: 'Achieved' }))

    expect(setStatusOverride).toHaveBeenCalledWith('achieved')
  })

  it('starter branch renders STARTER_PROMPT and CTA opens Ask', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('starter'))
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
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('diffused'))
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
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
    renderTrajectory(makeEngine({ backendActive: true }))
    expect(
      await screen.findByText(/No backend trajectory has been generated yet/i),
    ).toBeInTheDocument()
  })

  it('searching tabs render bearings; clicking a tab switches the panel', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
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

  it('supports live engine captures.entries as an array', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
    const capture = {
      kind: 'trajectory',
      createdAt: '2026-05-21T08:00:00.000Z',
      trajectory: {
        throughLine: 'Array-backed through-line',
        bearings: [{ title: 'Array Path', prompt: 'array prompt' }],
      },
    }
    const engine = makeEngine()
    engine.state.captures.entries = [capture] as never
    renderTrajectory(engine)

    expect(await screen.findByText('Array-backed through-line')).toBeInTheDocument()
    expect(screen.getByText('array prompt')).toBeInTheDocument()
  })

  it('Show me all paths toggles escape-hatch and re-renders as searching', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('foreclosed'))
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
    const escapeButton = await screen.findByTestId('trajectory-escape')
    await userEvent.click(escapeButton)
    expect(screen.getByTestId('trajectory-back')).toBeInTheDocument()
  })

  it('changing the preview status clears the escape-hatch view', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('foreclosed'))
    const setStatusOverride = vi.fn()
    renderTrajectory(makeEngine({ setStatusOverride }))

    await userEvent.click(await screen.findByTestId('trajectory-escape'))
    expect(screen.getByTestId('trajectory-back')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('trajectory-status-pill'))
    await userEvent.click(screen.getByRole('button', { name: 'Achieved' }))

    expect(setStatusOverride).toHaveBeenCalledWith('achieved')
    expect(screen.queryByTestId('trajectory-back')).not.toBeInTheDocument()
  })

  it('Run sense-making button calls backend.runTrajectory', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
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

  it('trait chips with resolved evidence link to the mirror detail page', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
    const capture = {
      kind: 'trajectory',
      createdAt: '2026-05-21T08:00:00.000Z',
      backendCartographerOutputId: 9,
      trajectory: {
        throughLine: 'Evidence-backed through-line',
        bearings: [
          {
            title: 'Community design',
            prompt: 'prompt A',
            traitTags: ['values.contribution', 'skills.communication'],
            traitRefs: [
              { claimId: 'values.contribution', mirrorEntryId: 42 },
              { claimId: 'skills.communication' },
            ],
          },
        ],
      },
    }
    renderTrajectory(makeEngine({ capture, backendActive: true }))

    await userEvent.click(await screen.findByRole('button', { name: /See evidence/i }))

    const link = screen.getByTestId('trait-evidence-42')
    expect(link).toHaveAttribute('href', expect.stringContaining('/mirror/42'))
    expect(link).toHaveTextContent('values.contribution')

    // Ref without a mirrorEntryId stays a static chip (no link).
    expect(screen.getByText('skills.communication').closest('a')).toBeNull()
  })

  it('legacy bearings with only traitTags render static chips', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
    const capture = {
      kind: 'trajectory',
      createdAt: '2026-05-21T08:00:00.000Z',
      trajectory: {
        throughLine: 'Legacy through-line',
        bearings: [
          {
            title: 'Legacy path',
            prompt: 'legacy prompt',
            traitTags: ['values.contribution'],
          },
        ],
      },
    }
    renderTrajectory(makeEngine({ capture }))

    await userEvent.click(await screen.findByRole('button', { name: /See evidence/i }))

    const chip = screen.getByText('values.contribution')
    expect(chip).toBeInTheDocument()
    expect(chip.closest('a')).toBeNull()
  })

  it('adds body.has-overlay while mounted', async () => {
    vi.mocked(statusFor).mockReturnValueOnce(statusAudit('searching'))
    const { unmount } = renderTrajectory(makeEngine())
    await waitFor(() => expect(document.body.classList.contains('has-overlay')).toBe(true))
    unmount()
    expect(document.body.classList.contains('has-overlay')).toBe(false)
  })
})
