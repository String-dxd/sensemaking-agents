import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import TrajectorySheet from '~/engine/student-space/Game/View/TrajectorySheet.js'

const trajectoryCapture = {
  id: 'cartographer:9',
  kind: 'trajectory',
  createdAt: '2026-05-16T08:00:00.000Z',
  backendCartographerOutputId: 9,
  trajectory: {
    throughLine: 'Backend Cartographer through-line',
    bearings: [{ id: 'backend-path', title: 'Backend', prompt: '', traitTags: [], ecgTags: [] }],
  },
}

describe('Student Space TrajectorySheet backend preference', () => {
  afterEach(() => {
    state.instance = null
    OverlayController.instance = null
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('prefers backend Cartographer output over newer local heuristic trajectory rows', () => {
    state.instance = {
      captures: {
        entries: [
          {
            id: 'local-trajectory',
            kind: 'trajectory',
            createdAt: '2026-05-18T10:00:00.000Z',
            trajectory: {
              throughLine: 'Local heuristic through-line',
              bearings: [
                { id: 'local-path', title: 'Local', prompt: '', traitTags: [], ecgTags: [] },
              ],
            },
          },
          trajectoryCapture,
        ],
        add: vi.fn(),
      },
      profile: { facets: {}, identity: {} },
      backend: {},
    }
    OverlayController.instance = new OverlayController()

    const sheet = new TrajectorySheet() as { open: () => void }
    sheet.open()

    expect(document.querySelector('.trajectory-sheet__throughline')).toHaveTextContent(
      'Backend Cartographer through-line',
    )
  })
})

describe('Student Space TrajectorySheet — identity status override', () => {
  afterEach(() => {
    state.instance = null
    OverlayController.instance = null
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('renders the Starter starter card when the override is set to "starter", even with a backend Cartographer reading present', () => {
    state.instance = {
      captures: {
        entries: [trajectoryCapture],
        add: vi.fn(),
      },
      profile: { facets: {}, identity: { name: 'Mei' } },
      choices: null,
      identityStatusOverride: { current: 'starter', subscribe: () => () => {} },
      backend: {},
    }
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as { open: () => void }
    sheet.open()
    // Starter card is unique to the starter quadrant; bearings sheet body is absent.
    expect(document.querySelector('.trajectory-sheet__starter')).not.toBeNull()
    expect(document.querySelector('.trajectory-sheet__bearings')).toBeNull()
  })

  it('renders the Diffused nudge list when the override is set to "diffused"', () => {
    state.instance = {
      captures: { entries: [trajectoryCapture], add: vi.fn() },
      profile: { facets: {}, identity: { name: 'Mei' } },
      choices: null,
      identityStatusOverride: { current: 'diffused', subscribe: () => () => {} },
      backend: {},
    }
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as { open: () => void }
    sheet.open()
    expect(document.querySelector('.trajectory-sheet__nudges')).not.toBeNull()
  })

  it('renders the Achieved action-list layout when the override is set to "achieved"', () => {
    state.instance = {
      captures: { entries: [trajectoryCapture], add: vi.fn() },
      profile: { facets: {}, identity: { name: 'Mei' } },
      choices: null,
      identityStatusOverride: { current: 'achieved', subscribe: () => () => {} },
      backend: {},
    }
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as { open: () => void }
    sheet.open()
    expect(document.querySelector('.trajectory-sheet__achieved')).not.toBeNull()
    expect(document.querySelector('.trajectory-achieved__actions-label')).toHaveTextContent(
      /NEXT CONCRETE STEPS/i,
    )
  })

  it('renders the Foreclosed framing when the override is set to "foreclosed"', () => {
    state.instance = {
      captures: { entries: [trajectoryCapture], add: vi.fn() },
      profile: { facets: {}, identity: { name: 'Mei' } },
      choices: { decisions: [], intentions: [{ change: 'Pharmacy at NUS', byWhen: null }] },
      identityStatusOverride: { current: 'foreclosed', subscribe: () => () => {} },
      backend: {},
    }
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as { open: () => void }
    sheet.open()
    const frame = document.querySelector('.trajectory-sheet__foreclosed-frame')
    expect(frame).not.toBeNull()
    expect(document.querySelector('.trajectory-foreclosed__direction-text')).toHaveTextContent(
      'Pharmacy at NUS',
    )
  })

  it('marks the status pill as a preview when the override is active', () => {
    state.instance = {
      captures: { entries: [trajectoryCapture], add: vi.fn() },
      profile: { facets: {}, identity: { name: 'Mei' } },
      choices: null,
      identityStatusOverride: { current: 'achieved', subscribe: () => () => {} },
      backend: {},
    }
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as { open: () => void }
    sheet.open()
    const pillLabel = document.querySelector('.trajectory-sheet__status-label')
    expect(pillLabel?.textContent).toMatch(/PREVIEW/i)
    const root = document.querySelector('.trajectory-sheet') as HTMLElement | null
    expect(root?.dataset.preview).toBe('on')
  })
})
