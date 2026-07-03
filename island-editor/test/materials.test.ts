// Smoke tests only: constructing a THREE.ShaderMaterial needs no GL context, so
// we assert factory wiring (uniforms, flags, texture setup) — GLSL correctness
// is Step 10's visual QA.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createIslandGroundMaterial } from '../src/scene/materials/IslandGroundMaterial'
import { createSeaMaterial, createShoreDataTexture, updateShoreDataTexture } from '../src/scene/materials/SeaMaterial'
import { shoreDistanceField } from '../src/terrain/shoreField'
import { createOceanGrid } from '../src/terrain/terrainGrid'

const WORLD = 24

describe('IslandGroundMaterial', () => {
  const mat = createIslandGroundMaterial({ sand: new THREE.Texture(), cliff: new THREE.Texture() })

  it('exposes the expected uniforms', () => {
    for (const u of ['uSandTexture', 'uCliffTexture', 'uGrassColor', 'uSunDirection', 'uSeaLevel']) {
      expect(mat.uniforms[u]).toBeDefined()
    }
    expect(mat.uniforms.uGrassColor.value.getHexString()).toBe('4a8f3f')
    expect(mat.uniforms.uSunDirection.value.length()).toBeCloseTo(1, 6) // normalized
  })

  it('ends the fragment shader with the color-space include', () => {
    expect(mat.fragmentShader).toContain('#include <colorspace_fragment>')
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
})
