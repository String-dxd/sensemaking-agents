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
