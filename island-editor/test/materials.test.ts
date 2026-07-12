// Smoke tests only: constructing a THREE.ShaderMaterial needs no GL context, so
// we assert factory wiring (uniforms, flags, texture setup) — GLSL correctness
// is Step 10's visual QA.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createGrassBladeMaterial } from '../src/scene/materials/GrassBladeMaterial'
import { createIslandGroundMaterial } from '../src/scene/materials/IslandGroundMaterial'
import { createSeaMaterial, createShoreDataTexture, updateShoreDataTexture } from '../src/scene/materials/SeaMaterial'
import { shoreDistanceField } from '../src/terrain/shoreField'
import { createOceanGrid } from '../src/terrain/terrainGrid'

const WORLD = 24

describe('IslandGroundMaterial', () => {
  const mat = createIslandGroundMaterial({ sand: new THREE.Texture(), cliff: new THREE.Texture() })

  it('exposes the expected uniforms', () => {
    for (const u of [
      'uSandTexture',
      'uCliffTexture',
      'uGrassColor',
      'uSunDirection',
      'uSunColor',
      'uSkyColor',
      'uSeaLevel',
    ]) {
      expect(mat.uniforms[u]).toBeDefined()
    }
    expect(mat.uniforms.uGrassColor.value.getHexString()).toBe('4a8f3f')
    expect(mat.uniforms.uSunDirection.value.length()).toBeCloseTo(1, 6) // normalized
    expect(mat.uniforms.uSunColor.value.getHexString()).toBe('ffedcc')
    expect(mat.uniforms.uSkyColor.value.getHexString()).toBe('8fa8c8')
  })

  it('is light-aware and shadow-receiving', () => {
    expect(mat.lights).toBe(true)
  })

  it('ends the fragment shader with the color-space include', () => {
    expect(mat.fragmentShader).toContain('#include <colorspace_fragment>')
  })
})

describe('GrassBladeMaterial', () => {
  const mat = createGrassBladeMaterial()

  it('exposes the expected uniforms with the BOTW palette defaults', () => {
    for (const u of [
      'uTime',
      'uWindDir',
      'uWindStrength',
      'uGustBend',
      'uBaseColor',
      'uTipColor',
      'uWidenStart',
      'uWidenEnd',
      'uWidenMax',
      'uHideStart',
      'uHideEnd',
      'uDirSpread',
      'uCharPos',
      'uCharRadius',
      'uCharBend',
      'uCharFadeInner',
      'uCharFadeOuter',
    ]) {
      expect(mat.uniforms[u]).toBeDefined()
    }
    expect(mat.uniforms.uBaseColor.value.getHexString()).toBe('2e6b2a')
    expect(mat.uniforms.uTipColor.value.getHexString()).toBe('a8d84f')
    expect(mat.uniforms.uWindDir.value.length()).toBeCloseTo(1, 6) // normalized
    expect(mat.uniforms.uWindStrength.value).toBeCloseTo(0.12, 6)
    expect(mat.uniforms.uGustBend.value).toBeCloseTo(1.25, 6)
    expect(mat.uniforms.uWidenStart.value).toBeCloseTo(8, 6)
    expect(mat.uniforms.uWidenEnd.value).toBeCloseTo(20, 6)
    expect(mat.uniforms.uWidenMax.value).toBeCloseTo(1.5, 6)
    expect(mat.uniforms.uHideStart.value).toBeCloseTo(22, 6)
    expect(mat.uniforms.uHideEnd.value).toBeCloseTo(32, 6)
    expect(mat.uniforms.uDirSpread.value).toBeCloseTo(0.6, 6)
    expect(mat.uniforms.uCharRadius.value).toBeCloseTo(1.4, 6)
    expect(mat.uniforms.uCharBend.value).toBeCloseTo(0.9, 6)
    expect(mat.uniforms.uCharFadeInner.value).toBeCloseTo(0.35, 6)
    expect(mat.uniforms.uCharFadeOuter.value).toBeCloseTo(0.9, 6)
    expect(mat.uniforms.uCharPos.value.w).toBe(0) // no character by default
    expect(mat.uniforms.uTime.value).toBe(0)
  })

  it('renders blade cards double-sided with alpha-to-coverage, never alpha blending', () => {
    expect(mat.side).toBe(THREE.DoubleSide)
    expect(mat.transparent).toBe(false)
    expect(mat.alphaToCoverage).toBe(true)
  })

  it('ends the fragment shader with the color-space include', () => {
    expect(mat.fragmentShader).toContain('#include <colorspace_fragment>')
  })

  it('reads the per-instance attributes the GrassLayer geometry provides', () => {
    for (const attr of ['aOffset', 'aYawScale', 'aShadePhase']) {
      expect(mat.vertexShader).toContain(`attribute`)
      expect(mat.vertexShader).toContain(attr)
    }
  })

  it('bends blades as a rotation about the base — gust crests sweep tips toward the ground', () => {
    // sin moves the tip along the composed bend vector, 1-cos drops it: strong
    // gusts lay susceptible blades nearly flat instead of stretching sideways.
    expect(mat.vertexShader).toContain('bendDir * sin(bend) * p.y')
    expect(mat.vertexShader).toContain('(1.0 - cos(bend)) * p.y')
    expect(mat.vertexShader).toContain('uGustBend * gust')
  })

  it('composes per-blade wind direction and the character push into one bend vector', () => {
    expect(mat.vertexShader).toContain('uDirSpread')
    expect(mat.vertexShader).toContain('uCharBend')
    expect(mat.vertexShader).toContain('smoothstep(uCharFadeInner, uCharFadeOuter,')
  })

  it('feathers the blade edges softly via uv.x for the alpha-to-coverage look', () => {
    expect(mat.fragmentShader).toContain('smoothstep(0.0, 0.18, vUv.x)')
    expect(mat.fragmentShader.trimEnd().endsWith('#include <colorspace_fragment>\n}')).toBe(true)
  })

  it('widens blade cards at mid distance, then hides them entirely past the hide band', () => {
    expect(mat.vertexShader).toContain('smoothstep(uWidenStart, uWidenEnd,')
    expect(mat.vertexShader).toContain('smoothstep(uHideStart, uHideEnd,')
  })
})

describe('SeaMaterial', () => {
  const field = shoreDistanceField(createOceanGrid(), WORLD)
  const shoreTex = createShoreDataTexture(field)
  const mat = createSeaMaterial(
    { foamCells: new THREE.Texture(), shortBubbles: new THREE.Texture() },
    shoreTex,
    { worldSize: WORLD },
  )

  it('exposes the expected uniforms with the product palette defaults', () => {
    for (const u of ['uSea', 'uDeep', 'uFoam', 'uShoreTex', 'uWorldSize', 'uFoamCells', 'uShortBubbles', 'uTime']) {
      expect(mat.uniforms[u]).toBeDefined()
    }
    expect(mat.uniforms.uSea.value.getHexString()).toBe('2a8ca0')
    expect(mat.uniforms.uDeep.value.getHexString()).toBe('1560a0')
    expect(mat.uniforms.uFoam.value.getHexString()).toBe('b3ffff')
    expect(mat.uniforms.uWorldSize.value).toBe(WORLD)
    expect(mat.transparent).toBe(true)
  })

  it('ends the fragment shader with the color-space include', () => {
    expect(mat.fragmentShader).toContain('#include <colorspace_fragment>')
  })

  it('contains no TinySkies-derived provenance signatures', () => {
    const all = mat.vertexShader + mat.fragmentShader
    expect(all).not.toMatch(/w3 \* w5 \* w7/)
    expect(all).not.toMatch(/spMask/)
    expect(all).not.toMatch(/noiseOff\) \* 4\.0/)
  })

  it('builds a single-channel float shore DataTexture and updates it in place', () => {
    expect(shoreTex.image.width).toBe(field.res)
    expect(shoreTex.image.height).toBe(field.res)
    expect(shoreTex.format).toBe(THREE.RedFormat)
    expect(shoreTex.type).toBe(THREE.FloatType)

    const grid = createOceanGrid()
    grid.tiers[32 * grid.cols + 32] = 4
    const next = shoreDistanceField(grid, WORLD)
    const versionBefore = shoreTex.version
    updateShoreDataTexture(shoreTex, next)
    expect(shoreTex.version).toBeGreaterThan(versionBefore) // needsUpdate bumped
    // negative (land) values now present in the texture data
    const data = shoreTex.image.data as unknown as Float32Array
    let hasLand = false
    for (const v of data) if (v < 0) hasLand = true
    expect(hasLand).toBe(true)
  })

  it('reallocates the DataTexture image when the field resolution changes', () => {
    const small = { res: 8, data: new Float32Array(8 * 8).fill(1) }
    const tex = createShoreDataTexture(small)
    const versionBefore = tex.version

    const larger = { res: 16, data: new Float32Array(16 * 16).fill(-2) }
    expect(() => updateShoreDataTexture(tex, larger)).not.toThrow()
    expect(tex.image.width).toBe(16)
    expect(tex.image.height).toBe(16)
    expect((tex.image.data as Float32Array).length).toBe(256)
    expect(tex.version).toBeGreaterThan(versionBefore) // needsUpdate bumped
  })

  it('updates the DataTexture buffer in place when the field resolution is unchanged', () => {
    const field = { res: 8, data: new Float32Array(8 * 8).fill(1) }
    const tex = createShoreDataTexture(field)
    const versionBefore = tex.version

    const sameSize = { res: 8, data: new Float32Array(8 * 8).fill(-3) }
    const dataBefore = tex.image.data
    updateShoreDataTexture(tex, sameSize)
    expect(tex.image.data).toBe(dataBefore) // same buffer identity: in-place path
    expect((tex.image.data as Float32Array)[0]).toBe(-3)
    expect(tex.version).toBeGreaterThan(versionBefore) // needsUpdate bumped
  })
})
