import { describe, expect, it, vi } from 'vitest'

vi.mock('~/engine/student-space/Game/View/View.js', () => ({
  default: {
    getInstance() {
      return {}
    },
  },
}))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance() {
      return {}
    },
  },
}))

import { HoverCtaController } from '~/components/student-space/world/WorldInteractions'

function makeController(setHoverCta = vi.fn()) {
  const controller = Object.assign(Object.create(HoverCtaController.prototype), {
    deps: {},
    target: null,
    _thumbs: null,
    _anchorEl: null,
    _lastX: Number.NaN,
    _lastY: Number.NaN,
    setHoverCta,
  })
  return controller
}

describe('HoverCtaController anchor updates bypass React', () => {
  it('setAnchor never calls the state setter and writes the DOM directly', () => {
    const setHoverCta = vi.fn()
    const controller = makeController(setHoverCta)
    const el = document.createElement('div')
    controller._anchorEl = el

    controller.setAnchor(100, 200)

    expect(setHoverCta).not.toHaveBeenCalled()
    expect(el.style.left).toBe('116px')
    expect(el.style.top).toBe('188px')
  })

  it('is a no-op for identical coordinates', () => {
    const setHoverCta = vi.fn()
    const controller = makeController(setHoverCta)
    const el = document.createElement('div')
    controller._anchorEl = el

    controller.setAnchor(100, 200)
    el.style.left = ''
    el.style.top = ''

    controller.setAnchor(100, 200)

    expect(el.style.left).toBe('')
    expect(el.style.top).toBe('')
    expect(setHoverCta).not.toHaveBeenCalled()
  })

  it('is safe with a null anchor element and applies the stored position once set', () => {
    const controller = makeController()
    controller._anchorEl = null

    expect(() => controller.setAnchor(5, 5)).not.toThrow()

    const el = document.createElement('div')
    controller.setAnchorElement(el)

    expect(el.style.left).toBe('21px')
    expect(el.style.top).toBe('-7px')
  })

  it('showFor still opens via React state', () => {
    const setHoverCta = vi.fn()
    const controller = makeController(setHoverCta)
    const el = document.createElement('div')
    controller._anchorEl = el

    controller.showFor({ kind: 'kira' }, 10, 20)

    expect(setHoverCta).toHaveBeenCalled()
  })
})
