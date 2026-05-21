import { describe, expect, it, vi } from 'vitest'

// @ts-expect-error — engine source is JavaScript without companion declarations.
import { getQualitySettings } from '~/engine/student-space/Game/State/Performance.js'
// @ts-expect-error — engine source is JavaScript without companion declarations.
import { applyRendererSize } from '~/engine/student-space/Game/View/renderQuality.js'

describe('Student Space renderer quality sizing', () => {
  it('resizes the renderer using the active quality DPR cap', () => {
    const renderer = {
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
    }
    const viewport = {
      width: 1280,
      height: 720,
      pixelRatio: 3,
    }

    const appliedRatio = applyRendererSize(renderer, viewport, {
      settings: getQualitySettings('medium'),
    })

    expect(renderer.setSize).toHaveBeenCalledWith(1280, 720)
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5)
    expect(appliedRatio).toBe(1.5)
  })
})
