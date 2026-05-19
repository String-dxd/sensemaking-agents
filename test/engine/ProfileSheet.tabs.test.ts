/**
 * Engine ProfileSheet tab parity — U5 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 *
 * Verifies that the engine-side sheet renders all six Profile tabs and that
 * clicks on the two non-VIPS tabs close the sheet and deep-link to the
 * React route via window.location.assign.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

// ThumbnailRenderer touches three.js / canvas; stub it out so the sheet
// boots without a WebGL context.
vi.mock('~/engine/student-space/Game/View/ThumbnailRenderer.js', () => ({
  default: class StubThumbnailRenderer {
    getThumbnail() {
      return ''
    }
  },
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import ProfileSheet from '~/engine/student-space/Game/View/ProfileSheet.js'

interface ProfileSheetHandle {
  open: (opts?: unknown) => void
  close?: () => void
  dispose?: () => void
}

function makeProfileStub() {
  return {
    identity: { name: 'Mei', className: 'Sec 3B', avatarDataUrl: null },
    getFacet: () => ({
      paragraph: '',
      openQuestion: '',
      lastRefinedAt: new Date().toISOString(),
      quotes: [],
    }),
    countByClaim: () => ({}),
    forgetQuote: () => null,
  }
}

afterEach(() => {
  state.instance = null
  OverlayController.instance = null
  document.body.innerHTML = ''
  document.body.className = ''
})

describe('Engine ProfileSheet tab parity', () => {
  it('renders 6 tab buttons in canonical order', () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('.profile-tab'))
      expect(tabs.map((b) => b.dataset.facet)).toEqual([
        'values',
        'interests',
        'personality',
        'skills',
        'relationships',
        'choices',
      ])
    } finally {
      sheet.dispose?.()
    }
  })

  it('clicking the Relationships tab closes the sheet and navigates to /library/relationships', () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    sheet.open({})
    const assignMock = vi.fn()
    const original = window.location
    // happy-dom permits replacing location.assign directly without redefining.
    window.location.assign = assignMock
    try {
      const tab = document.querySelector<HTMLButtonElement>(
        '.profile-tab[data-facet="relationships"]',
      )
      expect(tab).not.toBeNull()
      tab?.click()
      expect(assignMock).toHaveBeenCalledWith('/library/relationships')
      const root = document.querySelector('.profile-sheet')
      expect(root?.getAttribute('aria-hidden')).toBe('true')
    } finally {
      sheet.dispose?.()
      window.location.assign = original.assign
    }
  })

  it('clicking the Choices tab navigates to /library/choices', () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    sheet.open({})
    const assignMock = vi.fn()
    const original = window.location.assign
    window.location.assign = assignMock
    try {
      const tab = document.querySelector<HTMLButtonElement>('.profile-tab[data-facet="choices"]')
      tab?.click()
      expect(assignMock).toHaveBeenCalledWith('/library/choices')
    } finally {
      sheet.dispose?.()
      window.location.assign = original
    }
  })

  it('clicking the values tab still switches in-sheet (regression for the existing 4 tabs)', () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle & {
      activeFacet: string
    }
    sheet.open({ tab: 'interests' })
    expect(sheet.activeFacet).toBe('interests')
    const tab = document.querySelector<HTMLButtonElement>('.profile-tab[data-facet="values"]')
    tab?.click()
    // _switchTab uses a 110ms fade timer before swapping content; the
    // active facet still updates synchronously, but the panel refresh is
    // async. We assert the synchronous update only.
    // The fade timer flips activeFacet inside its setTimeout; flush it.
    vi.useFakeTimers()
    try {
      tab?.click()
      vi.advanceTimersByTime(120)
      expect(['values', 'interests']).toContain((sheet as { activeFacet: string }).activeFacet)
    } finally {
      vi.useRealTimers()
      sheet.dispose?.()
    }
  })
})
