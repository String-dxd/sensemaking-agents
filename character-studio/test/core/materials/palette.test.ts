import { describe, expect, it } from 'vitest'
import {
  DEBUG_MASK_SIZE,
  hexToLinear,
  makeDebugMaskTexture,
  MASK_CHANNEL_SLOTS,
  PALETTE_SLOT_INDEX,
  type Palette,
  paletteWeightsFromMask,
  resolvePalette,
  srgbChannelToLinear,
} from '../../../src/core/materials/palette'
import { PALETTE_SLOTS } from '../../../src/core/spec/schema'

const PALETTE: Palette = {
  primary: '#e8a15c',
  secondary: '#f0b06a',
  belly: '#fdf1e0',
  accentA: '#8a5a34',
  accentB: '#3a2a20',
  padsNose: '#5a3a2a',
}

describe('PALETTE_SLOT_INDEX', () => {
  it('maps every slot to a stable index in PALETTE_SLOTS order', () => {
    expect(PALETTE_SLOT_INDEX).toEqual({
      primary: 0,
      secondary: 1,
      belly: 2,
      accentA: 3,
      accentB: 4,
      padsNose: 5,
    })
  })

  it('mask channels R/G/B/A select primary/secondary/belly/accentA', () => {
    expect(MASK_CHANNEL_SLOTS).toEqual(['primary', 'secondary', 'belly', 'accentA'])
  })
})

describe('hex → linear-sRGB conversion', () => {
  it('converts #ffffff and #000000 to the exact endpoints', () => {
    expect(hexToLinear('#ffffff')).toEqual([1, 1, 1])
    expect(hexToLinear('#000000')).toEqual([0, 0, 0])
  })

  it('converts #808080 through the gamma segment (known value)', () => {
    // srgb 128/255 = 0.50196; linear = ((0.50196+0.055)/1.055)^2.4 ≈ 0.21586
    const [r, g, b] = hexToLinear('#808080')
    expect(r).toBeCloseTo(0.21586, 4)
    expect(g).toBe(r)
    expect(b).toBe(r)
  })

  it('uses the linear segment below the 0.04045 knee (known value)', () => {
    // srgb 10/255 = 0.039216 ≤ 0.04045 → /12.92 = 0.0030352
    expect(srgbChannelToLinear(10 / 255)).toBeCloseTo(0.0030352, 6)
    expect(hexToLinear('#0a0a0a')[0]).toBeCloseTo(0.0030352, 6)
  })
})

describe('resolvePalette', () => {
  it('returns six linear colors in PALETTE_SLOT_INDEX order', () => {
    const colors = resolvePalette(PALETTE)
    expect(colors).toHaveLength(6)
    for (const slot of PALETTE_SLOTS) {
      const [r, g, b] = hexToLinear(PALETTE[slot])
      const color = colors[PALETTE_SLOT_INDEX[slot]]
      expect(color.r).toBeCloseTo(r, 6)
      expect(color.g).toBeCloseTo(g, 6)
      expect(color.b).toBeCloseTo(b, 6)
    }
  })
})

describe('paletteWeightsFromMask', () => {
  it('routes channels to their slots and the remainder to primary', () => {
    const w = paletteWeightsFromMask(0.2, 0.3, 0.4, 0)
    expect(w[PALETTE_SLOT_INDEX.primary]).toBeCloseTo(0.2 + 0.1, 6) // rest = 0.1
    expect(w[PALETTE_SLOT_INDEX.secondary]).toBeCloseTo(0.3, 6)
    expect(w[PALETTE_SLOT_INDEX.belly]).toBeCloseTo(0.4, 6)
    expect(w[PALETTE_SLOT_INDEX.accentA]).toBe(0)
    expect(w[PALETTE_SLOT_INDEX.accentB]).toBe(0)
    expect(w[PALETTE_SLOT_INDEX.padsNose]).toBe(0)
  })

  it('clamps the remainder at zero when channels oversum', () => {
    const w = paletteWeightsFromMask(0.6, 0.6, 0.3, 0.2)
    expect(w[PALETTE_SLOT_INDEX.primary]).toBeCloseTo(0.6, 6) // rest clamped to 0
    const total = w.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(0.6 + 0.6 + 0.3 + 0.2, 6)
  })

  it('an all-zero mask falls back entirely to primary', () => {
    const w = paletteWeightsFromMask(0, 0, 0, 0)
    expect(w[PALETTE_SLOT_INDEX.primary]).toBe(1)
    expect(w.reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('makeDebugMaskTexture', () => {
  it('is deterministic (seeded — two calls produce identical data)', () => {
    const a = makeDebugMaskTexture(64)
    const b = makeDebugMaskTexture(64)
    expect(a.image.data).toEqual(b.image.data)
  })

  it('has the expected size and RGBA layout, and exercises G and B channels', () => {
    const tex = makeDebugMaskTexture()
    expect(tex.image.width).toBe(DEBUG_MASK_SIZE)
    expect(tex.image.height).toBe(DEBUG_MASK_SIZE)
    const data = tex.image.data as Uint8Array
    expect(data.length).toBe(DEBUG_MASK_SIZE * DEBUG_MASK_SIZE * 4)
    let maxG = 0
    let maxB = 0
    for (let i = 0; i < data.length; i += 4) {
      maxG = Math.max(maxG, data[i + 1])
      maxB = Math.max(maxB, data[i + 2])
      expect(data[i + 3]).toBe(0) // accentA unused in the debug mask
    }
    expect(maxG).toBeGreaterThan(200) // spots present
    expect(maxB).toBeGreaterThan(200) // belly present
  })
})
