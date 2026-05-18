import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import CalendarSheet from '~/engine/student-space/Game/View/CalendarSheet.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'

describe('Student Space CalendarSheet backend routing', () => {
  let sheet: { open: (opts?: unknown) => void; dispose?: () => void } | null = null

  afterEach(() => {
    sheet?.dispose?.()
    sheet = null
    state.instance = null
    OverlayController.instance = null
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('opens a backend reflection deep link and escapes persisted text in day detail', () => {
    state.instance = {
      moodPins: { pins: [] },
      captures: {
        entries: [
          {
            id: 'mirror:24',
            kind: 'ask',
            text: '<img src=x onerror=alert(1)>',
            entryDate: '2026-05-14',
            createdAt: '2026-05-14T08:00:00.000Z',
            backendMirrorEntryId: 24,
            reviewStatus: 'pending',
          },
        ],
      },
      calendar: { events: [] },
      backend: null,
    }
    OverlayController.instance = new OverlayController()

    const calendar = new CalendarSheet() as { open: (opts?: unknown) => void; dispose?: () => void }
    sheet = calendar
    calendar.open({ entryId: 24 })

    expect(document.querySelector('.day-detail-card')).toHaveClass('is-open')
    expect(document.querySelector('.day-detail-row__primary')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    )
    expect(document.querySelector('.day-detail-row__primary img')).toBeNull()
  })

  it('uses the need-review route filter to open the newest pending reflection', () => {
    state.instance = {
      moodPins: { pins: [] },
      captures: {
        entries: [
          {
            id: 'mirror:24',
            kind: 'ask',
            text: 'old pending',
            entryDate: '2026-05-14',
            createdAt: '2026-05-14T08:00:00.000Z',
            backendMirrorEntryId: 24,
            reviewStatus: 'pending',
          },
          {
            id: 'mirror:25',
            kind: 'ask',
            text: 'new pending',
            entryDate: '2026-05-16',
            createdAt: '2026-05-16T08:00:00.000Z',
            backendMirrorEntryId: 25,
            reviewStatus: 'pending',
          },
        ],
      },
      calendar: { events: [] },
      backend: null,
    }
    OverlayController.instance = new OverlayController()

    const calendar = new CalendarSheet() as { open: (opts?: unknown) => void; dispose?: () => void }
    sheet = calendar
    calendar.open({ filter: 'need-review' })

    expect(document.querySelector('.day-detail-card__title')).toHaveTextContent('16')
    expect(document.querySelector('.day-detail-row__primary')).toHaveTextContent('new pending')
  })
})
