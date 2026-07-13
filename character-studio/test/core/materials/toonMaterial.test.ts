import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { hexToLinear, type Palette } from '../../../src/core/materials/palette'
import {
  applyMaterialAssign,
  applyPalette,
  applyTextureId,
  createToonMaterial,
  injectToonShader,
  toonProgramCacheKey,
} from '../../../src/core/materials/toonMaterial'
import type { MaterialAssign } from '../../../src/core/spec/schema'

const PALETTE: Palette = {
  primary: '#e8a15c',
  secondary: '#f0b06a',
  belly: '#fdf1e0',
  accentA: '#8a5a34',
  accentB: '#3a2a20',
  padsNose: '#5a3a2a',
}

const BASE_ASSIGN: MaterialAssign = {
  rampSoftness: 0.2,
  rimStrength: 0.3,
  shadowTint: '#b8a8c8',
}

function freshShader() {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
  }
}

describe('createToonMaterial', () => {
  it('returns a MeshToonMaterial with the recipe uniforms mapped from the assign', () => {
    const material = createToonMaterial(BASE_ASSIGN, PALETTE)
    expect(material).toBeInstanceOf(THREE.MeshToonMaterial)
    const u = material.userData.toonUniforms
    expect(u.uSoftness.value).toBeCloseTo(0.2 * 0.5, 6) // softness = rampSoftness * 0.5
    expect(u.uRimStrength.value).toBe(0.3)
    expect(u.uWrap.value).toBeCloseTo(0.35, 6)
    const [r, g, b] = hexToLinear('#b8a8c8')
    expect(u.uShadowTint.value.r).toBeCloseTo(r, 6)
    expect(u.uShadowTint.value.g).toBeCloseTo(g, 6)
    expect(u.uShadowTint.value.b).toBeCloseTo(b, 6)
    expect(u.uPaletteColors.value).toHaveLength(6)
  })

  it('clamps softness above zero (smoothstep(0.5, 0.5, x) is undefined GLSL)', () => {
    const material = createToonMaterial({ ...BASE_ASSIGN, rampSoftness: 0 }, PALETTE)
    expect(material.userData.toonUniforms.uSoftness.value).toBeGreaterThan(0)
  })

  it('enables the palette-mask define for textureId=debug-spots and not otherwise', () => {
    const masked = createToonMaterial({ ...BASE_ASSIGN, textureId: 'debug-spots' }, PALETTE)
    expect(masked.userData.toonDefines.paletteMask).toBe(true)
    expect(masked.defines).toHaveProperty('USE_PALETTE_MASK')
    expect(masked.userData.toonUniforms.uMaskMap.value).not.toBeNull()

    const plain = createToonMaterial(BASE_ASSIGN, PALETTE)
    expect(plain.userData.toonDefines.paletteMask).toBe(false)
    expect(plain.defines ?? {}).not.toHaveProperty('USE_PALETTE_MASK')
    // Unmasked path renders a flat primary coat.
    expect(plain.color.r).toBeCloseTo(hexToLinear(PALETTE.primary)[0], 6)
  })

  it('always carries a map so vMapUv exists for the mask path', () => {
    expect(createToonMaterial(BASE_ASSIGN, PALETTE).map).not.toBeNull()
    expect(createToonMaterial({ ...BASE_ASSIGN, textureId: 'debug-spots' }, PALETTE).map).not.toBeNull()
  })
})

describe('variant cache key', () => {
  it('is identical for identical define sets across material instances', () => {
    const a = createToonMaterial({ ...BASE_ASSIGN, textureId: 'debug-spots' }, PALETTE)
    const b = createToonMaterial({ ...BASE_ASSIGN, rampSoftness: 0.9, textureId: 'debug-spots' }, PALETTE)
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
  })

  it('differs when the define set differs, and covers every define', () => {
    const masked = createToonMaterial({ ...BASE_ASSIGN, textureId: 'debug-spots' }, PALETTE)
    const plain = createToonMaterial(BASE_ASSIGN, PALETTE)
    expect(masked.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey())
    // Key covers every boolean define (stale-variant control): flipping each
    // entry of the define set must change the key.
    expect(toonProgramCacheKey({ paletteMask: true })).not.toBe(toonProgramCacheKey({ paletteMask: false }))
    expect(toonProgramCacheKey({ paletteMask: false, paletteVertex: true })).not.toBe(
      toonProgramCacheKey({ paletteMask: false, paletteVertex: false }),
    )
  })

  it('tracks runtime mask toggles (applyTextureId)', () => {
    const material = createToonMaterial(BASE_ASSIGN, PALETTE)
    const before = material.customProgramCacheKey()
    applyTextureId(material, { ...BASE_ASSIGN, textureId: 'debug-spots' }, PALETTE)
    expect(material.customProgramCacheKey()).not.toBe(before)
    expect(material.needsUpdate === undefined || material.version > 0).toBe(true)
  })
})

describe('shader injection', () => {
  it('replaces the toon lighting chunk with the wrap/soft-step/rim recipe', () => {
    const shader = freshShader()
    const material = createToonMaterial(BASE_ASSIGN, PALETTE)
    injectToonShader(shader, material.userData.toonUniforms)
    expect(shader.fragmentShader).not.toContain('#include <lights_toon_pars_fragment>')
    for (const name of ['uWrap', 'uSoftness', 'uRimStrength', 'uTerminatorWarmth', 'uShadowTint', 'uGrainStrength']) {
      expect(shader.fragmentShader).toContain(name)
      expect(shader.uniforms).toHaveProperty(name)
    }
    expect(shader.fragmentShader).toContain('USE_PALETTE_MASK')
    expect(shader.uniforms).toHaveProperty('uPaletteColors')
    expect(shader.uniforms).toHaveProperty('uMaskMap')
  })

  it('keeps the vertex chain intact — skinning and morph targets survive', () => {
    const shader = freshShader()
    injectToonShader(shader, createToonMaterial(BASE_ASSIGN, PALETTE).userData.toonUniforms)
    // The only vertex-side addition is the define-guarded paletteChannels
    // plumbing; the skinning/morph chunks stay byte-identical.
    expect(shader.vertexShader).toContain('#include <skinning_vertex>')
    expect(shader.vertexShader).toContain('#include <morphtarget_vertex>')
    expect(shader.vertexShader).toContain('#include <begin_vertex>')
    expect(shader.vertexShader).toContain('#include <common>')
    expect(shader.vertexShader).toContain('USE_PALETTE_VERTEX')
    expect(shader.vertexShader).toContain('vGrainPosition = transformed')
  })

  it('adds the vertex-channel palette branch to the fragment shader', () => {
    const shader = freshShader()
    injectToonShader(shader, createToonMaterial(BASE_ASSIGN, PALETTE).userData.toonUniforms)
    expect(shader.fragmentShader).toContain('USE_PALETTE_VERTEX')
    expect(shader.fragmentShader).toContain('vPaletteChannels')
  })

  it('adds stable object-space micro-grain without touching map UV transforms', () => {
    const shader = freshShader()
    const material = createToonMaterial(BASE_ASSIGN, PALETTE, { grainStrength: 0.055 })
    injectToonShader(shader, material.userData.toonUniforms)
    expect(shader.fragmentShader).toContain('toonGrainHash')
    expect(shader.fragmentShader).toContain('vGrainPosition')
    expect(material.userData.toonUniforms.uGrainStrength.value).toBeCloseTo(0.055)
    expect(material.map?.offset.toArray()).toEqual([0, 0])
    expect(material.map?.repeat.toArray()).toEqual([1, 1])
  })
})

describe('live updates', () => {
  it('applyMaterialAssign updates uniforms in place on the same material', () => {
    const material = createToonMaterial(BASE_ASSIGN, PALETTE)
    applyMaterialAssign(material, { rampSoftness: 0.8, rimStrength: 0.05, shadowTint: '#334455' })
    const u = material.userData.toonUniforms
    expect(u.uSoftness.value).toBeCloseTo(0.4, 6)
    expect(u.uRimStrength.value).toBe(0.05)
    expect(u.uShadowTint.value.b).toBeCloseTo(hexToLinear('#334455')[2], 6)
  })

  it('applyPalette recolors uPaletteColors in place (uniform identity kept)', () => {
    const material = createToonMaterial({ ...BASE_ASSIGN, textureId: 'debug-spots' }, PALETTE)
    const colorsRef = material.userData.toonUniforms.uPaletteColors.value
    applyPalette(material, { ...PALETTE, primary: '#ff0000' })
    expect(material.userData.toonUniforms.uPaletteColors.value).toBe(colorsRef)
    expect(colorsRef[0].r).toBeCloseTo(1, 6)
    expect(colorsRef[0].g).toBeCloseTo(0, 6)
  })

  it('applyPalette also recolors the flat coat on the unmasked path', () => {
    const material = createToonMaterial(BASE_ASSIGN, PALETTE)
    applyPalette(material, { ...PALETTE, primary: '#ffffff' })
    expect(material.color.r).toBeCloseTo(1, 6)
  })
})
