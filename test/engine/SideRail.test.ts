/**
 * SideRail click → navigate (plan unit U3).
 *
 * The rail is the primary in-engine navigation source. After U3 landed it
 * stops calling `OverlayController.open` directly and instead asks
 * `Game.getInstance().navigate(href)` so the router stays the URL source
 * of truth. These tests exercise:
 *
 *   - each sheet button emits its canonical `/<surface>` pathname
 *   - the Home button emits `/`
 *   - re-tap-to-close: clicking the rail entry for the currently-active
 *     surface emits `/` instead of re-opening
 *   - restart-onboarding fires its own path and does NOT call navigate
 *
 * The rail imports `Game` from `~/engine/student-space/Game/Game.js`. We
 * mock that module before importing SideRail so `Game.getInstance()`
 * returns a vi.fn-equipped stub instead of triggering full engine boot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gameInstance = vi.hoisted(() => ({
  navigate: vi.fn(),
}))

vi.mock('~/engine/student-space/Game/Game.js', () => ({
  default: {
    getInstance: () => gameInstance,
  },
}))

// State.getInstance is called from the restart action; mock so the test
// doesn't depend on a real Onboarding slice.
const onboardingResetSpy = vi.fn()
const persistenceFlushSpy = vi.fn()
vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => ({
      onboarding: { reset: onboardingResetSpy },
      persistence: { flush: persistenceFlushSpy },
    }),
  },
}))

import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
// @ts-expect-error internal JS engine module is intentionally untyped.
import SideRail from '~/engine/student-space/Game/View/SideRail.js'

interface SideRailHandle {
  root: HTMLElement | null
  dispose: () => void
}

function clickButton(selector: string) {
  const btn = document.querySelector<HTMLButtonElement>(selector)
  expect(btn).not.toBeNull()
  btn?.click()
}

describe('SideRail click → navigate (U3)', () => {
  let rail: SideRailHandle | null = null
  let originalHref: string

  beforeEach(() => {
    OverlayController.instance = new OverlayController()
    gameInstance.navigate.mockClear()
    onboardingResetSpy.mockClear()
    persistenceFlushSpy.mockClear()
    originalHref = window.location.pathname
    rail = new SideRail() as SideRailHandle
  })

  afterEach(() => {
    rail?.dispose()
    rail = null
    OverlayController.instance = null
    document.body.innerHTML = ''
    document.body.className = ''
    window.history.replaceState({}, '', originalHref)
  })

  it('emits /profile when the Profile button is clicked', () => {
    clickButton('.side-rail__btn[data-sheet="profile"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/profile')
  })

  it('emits /letters when the Letters button is clicked', () => {
    clickButton('.side-rail__btn[data-sheet="letters"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/letters')
  })

  it('emits /trajectory when the Path Finder button is clicked', () => {
    clickButton('.side-rail__btn[data-sheet="trajectory"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/trajectory')
  })

  it('emits /history when the History button is clicked', () => {
    clickButton('.side-rail__btn[data-sheet="history"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/history')
  })

  it('emits / when the Home (Island) button is clicked', () => {
    clickButton('.side-rail__btn[data-sheet="home"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/')
  })

  it('re-tap-to-close: clicking Profile while pathname starts with /profile emits /', () => {
    window.history.replaceState({}, '', '/profile')
    clickButton('.side-rail__btn[data-sheet="profile"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/')
  })

  it('re-tap-to-close: clicking History while pathname starts with /history emits /', () => {
    window.history.replaceState({}, '', '/history/growth')
    clickButton('.side-rail__btn[data-sheet="history"]')
    expect(gameInstance.navigate).toHaveBeenCalledWith('/')
  })

  it('restart-onboarding button does NOT call navigate (separate side-effect path)', () => {
    // The restart action calls into State and then tries to reload the
    // window. happy-dom no-ops `location.reload()`; we just need to assert
    // that navigate was not called and the reset path fired.
    const reloadSpy = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => undefined as unknown as void)
    clickButton('.side-rail__btn[data-action="restart"]')
    expect(gameInstance.navigate).not.toHaveBeenCalled()
    expect(onboardingResetSpy).toHaveBeenCalledTimes(1)
    reloadSpy.mockRestore()
  })
})
