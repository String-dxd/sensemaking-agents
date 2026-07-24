import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: {
    weather: { rain: 1 },
    time: { delta: 1 / 60 },
    day: {
      currentState: {
        hour: 12,
        sunInt: 1,
        skyTop: [26, 74, 130],
        skyBottom: [255, 240, 80],
      },
    },
    performance: {
      settings: {
        rainGlassCadence: 1,
        rainStreakScale: 1,
      },
    },
  },
  view: {},
}))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance() {
      return mocks.state
    },
  },
}))

vi.mock('~/engine/student-space/Game/View/View.js', () => ({
  default: {
    getInstance() {
      return mocks.view
    },
  },
}))

// @ts-expect-error — engine source is JavaScript without companion declarations.
import Rain from '~/engine/student-space/Game/View/Rain.js'

function rendererStub() {
  return {
    autoClear: true,
    getDrawingBufferSize: vi.fn((target) => target.set(800, 600)),
    copyFramebufferToTexture: vi.fn(),
    render: vi.fn(),
  }
}

describe('Rain performance quality', () => {
  beforeEach(() => {
    mocks.state.performance.settings = {
      rainGlassCadence: 1,
      rainStreakScale: 1,
    }
  })

  it('preserves the glass framebuffer pass on high quality', () => {
    const rain = new Rain()
    const renderer = rendererStub()
    rain._currentWeight = 1
    rain.dropsMesh.visible = true

    rain.render(renderer)

    expect(renderer.copyFramebufferToTexture).toHaveBeenCalledTimes(1)
    expect(renderer.render).toHaveBeenCalledWith(rain.dropsScene, rain.orthoCam)
    expect(renderer.autoClear).toBe(true)
  })

  it('draws drops every frame on medium quality but throttles the framebuffer copy (no strobe)', () => {
    // Medium tier used to gate the WHOLE drops pass on `frame % cadence`, so
    // the refraction was drawn on 1 frame in 3 over a scene that clears every
    // frame — a visible ~20Hz strobe. The drops must now draw every frame;
    // only the costly framebuffer copy stays throttled.
    mocks.state.performance.settings = {
      rainGlassCadence: 3,
      rainStreakScale: 0.58,
    }
    const rain = new Rain()
    const renderer = rendererStub()
    rain._currentWeight = 1
    rain.dropsMesh.visible = true

    const FRAMES = 6
    for (let i = 0; i < FRAMES; i++) rain.render(renderer)

    // Drops drawn on EVERY frame — the anti-strobe invariant.
    const dropsRenders = renderer.render.mock.calls.filter(
      (call) => call[0] === rain.dropsScene,
    ).length
    expect(dropsRenders).toBe(FRAMES)

    // Framebuffer copy still throttled to the cadence (far fewer than 1/frame).
    expect(renderer.copyFramebufferToTexture).toHaveBeenCalled()
    expect(renderer.copyFramebufferToTexture.mock.calls.length).toBeLessThan(FRAMES)
  })

  it('skips the framebuffer copy and glass pass on low quality', () => {
    mocks.state.performance.settings = {
      rainGlassCadence: 0,
      rainStreakScale: 0.32,
    }
    const rain = new Rain()
    const renderer = rendererStub()
    rain._currentWeight = 1
    rain.dropsMesh.visible = true

    rain.render(renderer)

    expect(renderer.copyFramebufferToTexture).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalledWith(rain.dropsScene, rain.orthoCam)
    expect(renderer.autoClear).toBe(true)
  })
})
