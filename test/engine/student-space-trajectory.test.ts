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
          {
            id: 'cartographer:9',
            kind: 'trajectory',
            createdAt: '2026-05-16T08:00:00.000Z',
            backendCartographerOutputId: 9,
            trajectory: {
              throughLine: 'Backend Cartographer through-line',
              bearings: [
                { id: 'backend-path', title: 'Backend', prompt: '', traitTags: [], ecgTags: [] },
              ],
            },
          },
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
