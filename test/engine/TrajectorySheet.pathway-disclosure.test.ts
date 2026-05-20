/**
 * Engine TrajectorySheet — "See evidence" disclosure inside the Searching
 * panel.
 *
 * Plan: docs/plans/2026-05-20-003-refactor-profile-path-finder-tldr-progressive-disclosure-plan.md (U6)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: { getInstance: () => state.instance },
}))

import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
// @ts-expect-error — engine module is plain JS
import TrajectorySheet from '~/engine/student-space/Game/View/TrajectorySheet.js'

interface SheetHandle {
  open: (opts?: unknown) => void
  dispose?: () => void
  _renderSearching: (capture: unknown) => void
}

function makeStateWithSearching() {
  return {
    profile: { identity: { name: 'Mei' } },
    captures: {
      asks:   { recent: () => [] },
      photos: { recent: () => [] },
      moods:  { recent: () => [] },
    },
    choices: null,
    backend: null,
    identityStatusOverride: null,
  }
}

function fakeCapture() {
  return {
    trajectory: {
      throughLine: 'A through-line.',
      bearings: [
        {
          title:      'Public service',
          prompt:     'A people-facing direction worth probing.',
          traitTags:  ['interpersonal-trust'],
          ecgTags:    ['cluster.public-service'],
          risk:       'Could feel emotionally heavy on hard weeks.',
          clusterId:  'cluster.public-service',
          msfUrl:     '',
        },
      ],
    },
  }
}

afterEach(() => {
  state.instance = null
  OverlayController.instance = null
  document.body.innerHTML = ''
  document.body.className = ''
})

describe('TrajectorySheet — pathway evidence disclosure', () => {
  it('renders the "See evidence" disclosure when Searching renders a pathway with evidence', () => {
    state.instance = makeStateWithSearching()
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as SheetHandle
    try {
      sheet._renderSearching(fakeCapture())
      const evidence = document.querySelector<HTMLElement>('[data-role="panel-evidence"]')
      expect(evidence).not.toBeNull()
      expect(evidence?.classList.contains('disclosure')).toBe(true)
      expect(evidence?.getAttribute('data-expanded')).toBe('false')
      const toggle = evidence?.querySelector<HTMLElement>('.disclosure__toggle')
      expect(toggle?.getAttribute('aria-expanded')).toBe('false')
      expect(toggle?.querySelector('.disclosure__summary')?.textContent).toBe('See evidence')
    } finally {
      sheet.dispose?.()
    }
  })

  it('shows the disclosure when there is evidence to reveal', () => {
    state.instance = makeStateWithSearching()
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as SheetHandle
    try {
      sheet._renderSearching(fakeCapture())
      const evidence = document.querySelector<HTMLElement>('[data-role="panel-evidence"]')
      // Evidence present (trait + ecg + risk) → disclosure visible.
      expect(evidence?.hidden).toBe(false)
    } finally {
      sheet.dispose?.()
    }
  })

  it('hides the disclosure when the active pathway has no evidence', () => {
    state.instance = makeStateWithSearching()
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as SheetHandle
    try {
      const capture = {
        trajectory: {
          throughLine: '',
          bearings: [
            { title: 'A path', prompt: 'A prompt', traitTags: [], ecgTags: [], risk: '', clusterId: '', msfUrl: '' },
          ],
        },
      }
      sheet._renderSearching(capture)
      const evidence = document.querySelector<HTMLElement>('[data-role="panel-evidence"]')
      expect(evidence?.hidden).toBe(true)
    } finally {
      sheet.dispose?.()
    }
  })

  it('disclosure wraps all three evidence groups (trait / ECG / risk)', () => {
    state.instance = makeStateWithSearching()
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as SheetHandle
    try {
      sheet._renderSearching(fakeCapture())
      const panel = document.querySelector<HTMLElement>(
        '[data-role="panel-evidence"] .disclosure__panel',
      )
      expect(panel?.querySelector('[data-role="panel-trait-group"]')).not.toBeNull()
      expect(panel?.querySelector('[data-role="panel-ecg-group"]')).not.toBeNull()
      expect(panel?.querySelector('[data-role="panel-risk-group"]')).not.toBeNull()
    } finally {
      sheet.dispose?.()
    }
  })

  it('resets to collapsed when switching pathways', () => {
    state.instance = makeStateWithSearching()
    OverlayController.instance = new OverlayController()
    const sheet = new TrajectorySheet() as SheetHandle
    try {
      const capture = {
        trajectory: {
          throughLine: '',
          bearings: [
            { title: 'A', prompt: 'p', traitTags: ['t'], ecgTags: [], risk: '', clusterId: '', msfUrl: '' },
            { title: 'B', prompt: 'p', traitTags: ['t'], ecgTags: [], risk: '', clusterId: '', msfUrl: '' },
          ],
        },
      }
      sheet._renderSearching(capture)
      const evidence = document.querySelector<HTMLElement>('[data-role="panel-evidence"]')
      const toggle = evidence?.querySelector<HTMLButtonElement>('.disclosure__toggle')
      toggle?.click()
      expect(evidence?.getAttribute('data-expanded')).toBe('true')

      // Switch to the second pathway tab.
      const tabB = document.querySelector<HTMLElement>('.trajectory-tab[data-index="1"]')
      tabB?.click()
      // Reset to collapsed on switch.
      expect(evidence?.getAttribute('data-expanded')).toBe('false')
    } finally {
      sheet.dispose?.()
    }
  })
})
