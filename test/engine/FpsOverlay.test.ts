import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  time: { elapsed: 0, delta: 1 / 60 },
  performance: { smoothedFrameMs: 1000 / 60, tier: 'high' },
}

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => mockState,
  },
}))

// @ts-expect-error — engine source is JavaScript without companion declarations.
const { default: FpsOverlay } = await import('~/engine/student-space/Game/View/FpsOverlay.js')

describe('Student Space FPS overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockState.time.elapsed = 0
    mockState.time.delta = 1 / 60
    mockState.performance.smoothedFrameMs = 1000 / 60
    mockState.performance.tier = 'high'
  })

  it('renders smoothed FPS and quality tier', () => {
    const overlay = new FpsOverlay()

    overlay.update()

    expect(document.querySelector('.fps-overlay__value')).toHaveTextContent('60')
    expect(document.querySelector('.fps-overlay__label')).toHaveTextContent('fps · high')

    overlay.dispose()
    expect(document.querySelector('.fps-overlay')).not.toBeInTheDocument()
  })

  it('throttles text updates between sampling intervals', () => {
    const overlay = new FpsOverlay()

    overlay.update()
    mockState.performance.smoothedFrameMs = 1000 / 30
    mockState.time.elapsed = 0.1
    overlay.update()

    expect(document.querySelector('.fps-overlay__value')).toHaveTextContent('60')

    mockState.time.elapsed = 0.3
    overlay.update()
    expect(document.querySelector('.fps-overlay__value')).toHaveTextContent('30')
  })

  it('can mount inside another HUD surface', () => {
    const hud = document.createElement('div')
    hud.className = 'hour-hud'
    document.body.appendChild(hud)

    const overlay = new FpsOverlay({ mount: hud })

    expect(hud.firstElementChild).toBe(document.querySelector('.fps-overlay'))

    overlay.dispose()
  })
})
