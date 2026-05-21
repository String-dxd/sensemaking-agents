/**
 * Engine ProfileSheet tab parity for the six Profile tabs.
 *
 * The two non-VIPS tabs (relationships, choices) swap content inside the
 * engine sheet — the engine hides its VIPS body and mounts a React subtree
 * into the panel area, so the user experience matches the VIPS tabs.
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

// Stub the React bridge module so we can observe mount/unmount without
// dragging the full React render path into this unit test.
const bridge = vi.hoisted(() => ({
  mount: vi.fn(),
  unmount: vi.fn(),
}))

vi.mock('~/engine/student-space/profile-tab-react-bridge.tsx', () => ({
  mountProfileTabReactPanel: bridge.mount,
  unmountProfileTabReactPanel: bridge.unmount,
}))

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

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  state.instance = null
  OverlayController.instance = null
  bridge.mount.mockClear()
  bridge.unmount.mockClear()
  document.body.innerHTML = ''
  document.body.className = ''
})

describe('Engine ProfileSheet tab parity', () => {
  it('wraps tabs and panel in a shared .profile-sheet__tabbed container (U7)', () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      // U7 introduced a shared wrapper so the tab strip and the active
      // panel read as one block (instead of being siblings of the identity
      // card with no visual containment). The wrapper must contain BOTH
      // the tablist and the content panel.
      const wrapper = document.querySelector('.profile-sheet__tabbed')
      expect(wrapper).toBeTruthy()
      expect(wrapper?.querySelector('.profile-sheet__tabs')).toBeTruthy()
      expect(wrapper?.querySelector('.profile-sheet__panel')).toBeTruthy()
    } finally {
      sheet.dispose?.()
    }
  })

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

  it('opening directly to relationships hides the VIPS body and shows the React mount', async () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'relationships' })
      await flushMicrotasks()
      const vipsBody = document.querySelector<HTMLElement>('.profile-sheet__vips-body')
      const reactMount = document.querySelector<HTMLElement>('.profile-sheet__react-mount')
      expect(vipsBody?.hidden).toBe(true)
      expect(reactMount?.hidden).toBe(false)
      expect(bridge.mount).toHaveBeenCalledWith('relationships', reactMount)
    } finally {
      sheet.dispose?.()
    }
  })

  it('opening directly to choices mounts the choices panel', async () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'choices' })
      await flushMicrotasks()
      expect(bridge.mount).toHaveBeenCalledWith(
        'choices',
        document.querySelector('.profile-sheet__react-mount'),
      )
    } finally {
      sheet.dispose?.()
    }
  })

  it('clicking values from a relationships panel unmounts React and restores the VIPS body', async () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle & { activeFacet: string }
    try {
      sheet.open({ tab: 'relationships' })
      await flushMicrotasks()
      vi.useFakeTimers()
      const tab = document.querySelector<HTMLButtonElement>('.profile-tab[data-facet="values"]')
      tab?.click()
      vi.advanceTimersByTime(120)
      vi.useRealTimers()
      await flushMicrotasks()
      expect(sheet.activeFacet).toBe('values')
      const vipsBody = document.querySelector<HTMLElement>('.profile-sheet__vips-body')
      const reactMount = document.querySelector<HTMLElement>('.profile-sheet__react-mount')
      expect(vipsBody?.hidden).toBe(false)
      expect(reactMount?.hidden).toBe(true)
      expect(bridge.unmount).toHaveBeenCalled()
    } finally {
      sheet.dispose?.()
    }
  })

  it('dispose() unmounts the React panel if one is active', async () => {
    state.instance = { profile: makeProfileStub(), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    sheet.open({ tab: 'choices' })
    await flushMicrotasks()
    sheet.dispose?.()
    expect(bridge.unmount).toHaveBeenCalled()
  })
})
