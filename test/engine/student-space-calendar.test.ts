import { waitFor } from '@testing-library/dom'
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
  let sheet: { open: (opts?: unknown) => void; close?: () => void; dispose?: () => void } | null =
    null

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

    const calendar = new CalendarSheet() as {
      open: (opts?: unknown) => void
      close: () => void
      dispose?: () => void
    }
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

    const calendar = new CalendarSheet() as {
      open: (opts?: unknown) => void
      close: () => void
      dispose?: () => void
    }
    sheet = calendar
    calendar.open({ filter: 'need-review' })

    expect(document.querySelector('.day-detail-card__title')).toHaveTextContent('16')
    expect(document.querySelector('.day-detail-row__primary')).toHaveTextContent('new pending')
  })

  it('closes an opened day detail when the calendar closes', () => {
    state.instance = {
      moodPins: { pins: [] },
      captures: {
        entries: [
          {
            id: 'mirror:24',
            kind: 'ask',
            text: 'pending',
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

    const calendar = new CalendarSheet() as {
      open: (opts?: unknown) => void
      close: () => void
      dispose?: () => void
    }
    sheet = calendar
    calendar.open({ entryId: 24 })
    expect(document.querySelector('.day-detail-card')).toHaveClass('is-open')

    calendar.close()

    expect(document.querySelector('.day-detail-card')).not.toHaveClass('is-open')
  })

  it('surfaces failed reflection sync and retries through the backend bridge', async () => {
    const entry = {
      id: 'mirror:1',
      kind: 'ask',
      text: 'please sync me',
      entryDate: '2026-05-14',
      createdAt: '2026-05-14T08:00:00.000Z',
      syncStatus: 'failed',
      syncError: 'network down',
    }
    const submitReflection = vi.fn(async () => ({
      mirrorEntry: {
        id: 88,
        storyReframe: 'A synced reading',
        inferredMeaning: 'You want the durable path.',
        contextType: 'school',
        reviewStatus: 'pending',
      },
    }))
    const captures = {
      entries: [entry],
      findById: (id: string) => captures.entries.find((capture) => capture.id === id) ?? null,
      patch: (id: string, updates: Record<string, unknown>) => {
        const capture = captures.entries.find((item) => item.id === id)
        if (!capture) return null
        Object.assign(capture, updates)
        return capture
      },
    }
    state.instance = {
      moodPins: { pins: [] },
      captures,
      calendar: { events: [] },
      backend: { submitReflection },
    }
    OverlayController.instance = new OverlayController()

    const calendar = new CalendarSheet() as {
      open: (opts?: unknown) => void
      close: () => void
      dispose?: () => void
    }
    sheet = calendar
    calendar.open({ entryId: 1 })

    expect(document.querySelector('.day-detail-row__sub')).toHaveTextContent(
      'sync failed: network down',
    )
    document.querySelector<HTMLButtonElement>('[data-sync-action="retry"]')?.click()

    await waitFor(() => expect(submitReflection).toHaveBeenCalledTimes(1))
    expect(entry).toMatchObject({
      backendMirrorEntryId: 88,
      reviewStatus: 'pending',
      syncStatus: 'synced',
      syncError: '',
    })
  })

  it('runs Connector from confirmed reflections and shows real batch counts', async () => {
    const runConnector = vi.fn(async () => ({
      status: 'partial',
      processed: 2,
      succeeded: 1,
      failed: 1,
      remaining: 0,
      entries: [],
    }))
    const applyBackendSnapshot = vi.fn()
    state.instance = {
      moodPins: { pins: [] },
      captures: {
        entries: [
          {
            id: 'mirror:24',
            kind: 'ask',
            text: 'confirmed',
            entryDate: '2026-05-14',
            createdAt: '2026-05-14T08:00:00.000Z',
            backendMirrorEntryId: 24,
            reviewStatus: 'confirmed',
          },
        ],
      },
      calendar: { events: [] },
      backend: {
        runConnector,
        refreshSnapshot: vi.fn(async () => ({ profile: {}, reflections: [] })),
      },
      applyBackendSnapshot,
    }
    OverlayController.instance = new OverlayController()

    const calendar = new CalendarSheet() as {
      open: (opts?: unknown) => void
      close: () => void
      dispose?: () => void
    }
    sheet = calendar
    calendar.open()

    const connector = document.querySelector<HTMLButtonElement>('.cal-connector')
    expect(connector).toHaveTextContent('Run Connector')
    connector?.click()

    await waitFor(() => expect(runConnector).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(connector).toHaveTextContent('Connector: 1/2 applied, 1 failed'))
    expect(applyBackendSnapshot).toHaveBeenCalled()
  })
})
