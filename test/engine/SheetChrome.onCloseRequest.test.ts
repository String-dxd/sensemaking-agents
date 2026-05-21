/**
 * SheetChrome `onCloseRequest` callback + `withCloseButton` opt-out (plan unit U4).
 *
 * Routed sheets (Profile, History, Letters, Trajectory) pass an
 * `onCloseRequest` callback so Escape navigates back through the router
 * instead of mutating the controller directly. Capture sheets without the
 * callback keep the legacy `OverlayController.close(key)` path.
 *
 * Covered scenarios:
 *   1. Escape with `onCloseRequest` calls the callback and does NOT touch the
 *      controller's close path.
 *   2. Escape without `onCloseRequest` calls `OverlayController.close(key)`
 *      (legacy capture-sheet behaviour).
 *   3. `withCloseButton: false` produces no `.sheet-chrome__close` element.
 *   4. `withCloseButton: true` (default) DOES produce `.sheet-chrome__close`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
import SheetChrome from '~/engine/student-space/Game/View/SheetChrome.js'

function dispatchEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

describe('SheetChrome onCloseRequest + withCloseButton (U4)', () => {
  // vitest's `spyOn` MockInstance type is overloaded in ways that don't
  // compose cleanly with class instance method signatures. We restore via
  // `mockRestore()` in afterEach, which is all this test needs.
  let closeSpy: { mockRestore(): void; mockClear(): void; mock: { calls: unknown[][] } }

  beforeEach(() => {
    OverlayController.instance = new OverlayController()
    // Spy on the controller's close so we can assert the legacy fallback
    // path runs (and stays uninvoked for routed sheets that supply a
    // callback). The spy lives on the controller instance, not the class.
    closeSpy = vi.spyOn(OverlayController.instance as OverlayController, 'close')
  })

  afterEach(() => {
    closeSpy.mockRestore()
    OverlayController.instance = null
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('Escape calls onCloseRequest and does NOT call OverlayController.close', () => {
    const onCloseRequest = vi.fn()
    const chrome = new SheetChrome({
      key: 'profile',
      sheetClassName: 'profile-sheet',
      onCloseRequest,
    })
    // The chrome registers itself on construction; it must be `open` for the
    // Escape handler to act (chrome guards both `this.isOpen` and the
    // controller's `isOpen(key)` check).
    OverlayController.instance?.open('profile')
    expect(chrome.isOpen).toBe(true)

    dispatchEscape()

    expect(onCloseRequest).toHaveBeenCalledTimes(1)
    expect(closeSpy).not.toHaveBeenCalled()

    chrome.dispose()
  })

  it('Escape without onCloseRequest calls OverlayController.close (legacy capture-sheet behaviour)', () => {
    const chrome = new SheetChrome({
      key: 'ask',
      sheetClassName: 'ask-sheet',
    })
    OverlayController.instance?.open('ask')
    expect(chrome.isOpen).toBe(true)

    // Clear the spy — the open() above runs close() for any active previous
    // sheet, which on a fresh controller is a no-op but still records as 0;
    // be defensive.
    closeSpy.mockClear()

    dispatchEscape()

    expect(closeSpy).toHaveBeenCalledWith('ask')

    chrome.dispose()
  })

  it('withCloseButton: false produces no .sheet-chrome__close element', () => {
    const chrome = new SheetChrome({
      key: 'profile',
      sheetClassName: 'profile-sheet',
      withCloseButton: false,
    })
    expect(document.querySelector('.sheet-chrome__close')).toBeNull()
    expect(chrome.closeBtn).toBeNull()
    chrome.dispose()
  })

  it('withCloseButton: true (default) produces the .sheet-chrome__close button', () => {
    const chrome = new SheetChrome({
      key: 'ask',
      sheetClassName: 'ask-sheet',
    })
    const closeBtn = document.querySelector('.sheet-chrome__close')
    expect(closeBtn).not.toBeNull()
    expect(chrome.closeBtn).toBe(closeBtn)
    chrome.dispose()
  })

  it('clicking the × button routes through onCloseRequest when provided', () => {
    const onCloseRequest = vi.fn()
    const chrome = new SheetChrome({
      key: 'profile',
      withCloseButton: true,
      onCloseRequest,
    })
    OverlayController.instance?.open('profile')
    closeSpy.mockClear()
    chrome.closeBtn?.click()
    expect(onCloseRequest).toHaveBeenCalledTimes(1)
    expect(closeSpy).not.toHaveBeenCalled()
    chrome.dispose()
  })
})
