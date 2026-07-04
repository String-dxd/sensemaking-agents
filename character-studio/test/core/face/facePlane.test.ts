import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  FACE_LAYER_RADIAL_OFFSET,
  FACE_LAYER_RADIAL_STEP,
  GAZE_MAX,
  makeAtlasMaterial,
  makeFacePlaneGeometry,
  makePupilMaterial,
  setCell,
  setGaze,
  setMaskCell,
} from '../../../src/core/face/facePlane'

function makeTexture(): THREE.Texture {
  return new THREE.Texture()
}

describe('makeFacePlaneGeometry', () => {
  it('projects every vertex onto the offset head sphere (within [r+0.001, r+0.003])', () => {
    const headRadius = 0.28
    for (const radialOffset of [FACE_LAYER_RADIAL_OFFSET, FACE_LAYER_RADIAL_OFFSET + FACE_LAYER_RADIAL_STEP]) {
      const geometry = makeFacePlaneGeometry(headRadius, 0.5, 0.6, radialOffset)
      const pos = geometry.getAttribute('position')
      expect(pos.count).toBe(25) // 4×4 segments
      for (let i = 0; i < pos.count; i++) {
        const d = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))
        expect(d).toBeGreaterThanOrEqual(headRadius + 0.001)
        expect(d).toBeLessThanOrEqual(headRadius + 0.003)
      }
    }
  })

  it('mirrorU flips only the u coordinate', () => {
    const plain = makeFacePlaneGeometry(0.28, 0.5, 0.5)
    const mirrored = makeFacePlaneGeometry(0.28, 0.5, 0.5, undefined, true)
    const uv = plain.getAttribute('uv')
    const muv = mirrored.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      expect(muv.getX(i)).toBeCloseTo(1 - uv.getX(i))
      expect(muv.getY(i)).toBeCloseTo(uv.getY(i))
    }
    expect(mirrored.getIndex()!.array).toEqual(plain.getIndex()!.array)
  })
})

describe('makeAtlasMaterial + setCell', () => {
  it('is unlit, transparent, non-depth-writing, and cell-selected via texture offset', () => {
    const material = makeAtlasMaterial({ map: makeTexture(), cell: [2, 1], layerOffset: 1 })
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.alphaTest).toBeCloseTo(0.01)
    expect(material.polygonOffset).toBe(true)
    expect(material.polygonOffsetFactor).toBeLessThan(0)
    expect(material.map!.repeat.x).toBeCloseTo(0.25)
    expect(material.map!.offset.x).toBe(0.5)
    expect(material.map!.offset.y).toBe(0.25)
  })

  it('setCell writes the exact fractional offsets', () => {
    const material = makeAtlasMaterial({ map: makeTexture(), cell: [0, 0] })
    setCell(material, [3, 2])
    expect(material.map!.offset.x).toBe(0.75)
    expect(material.map!.offset.y).toBe(0.5)
  })

  it('does not mutate the shared source texture', () => {
    const source = makeTexture()
    const material = makeAtlasMaterial({ map: source, cell: [1, 1] })
    expect(material.map).not.toBe(source)
    expect(source.offset.x).toBe(0)
    expect(source.repeat.x).toBe(1)
  })
})

describe('makePupilMaterial + setGaze', () => {
  function makePupil() {
    return makePupilMaterial({
      pupilMap: makeTexture(),
      maskMap: makeTexture(),
      pupilCell: [1, 0],
      maskCell: [0, 0],
    })
  }

  it('selects pupil and mask cells via uniforms', () => {
    const material = makePupil()
    expect(material.uniforms.pupilOffset.value.x).toBe(0.25)
    setCell(material, [2, 0])
    expect(material.uniforms.pupilOffset.value.x).toBe(0.5)
    setMaskCell(material, [1, 0])
    expect(material.uniforms.maskOffset.value.x).toBe(0.25)
    expect(material.uniforms.maskOffset.value.y).toBe(0)
  })

  it('setGaze clamps to ±GAZE_MAX', () => {
    const material = makePupil()
    setGaze(material, 0.5, -0.5)
    expect(material.uniforms.gaze.value.x).toBe(GAZE_MAX)
    expect(material.uniforms.gaze.value.y).toBe(-GAZE_MAX)
    setGaze(material, 0.01, 0.02)
    expect(material.uniforms.gaze.value.x).toBeCloseTo(0.01)
    expect(material.uniforms.gaze.value.y).toBeCloseTo(0.02)
  })

  it('masks with the eye-white texture, not its own', () => {
    const pupilMap = makeTexture()
    const maskMap = makeTexture()
    const material = makePupilMaterial({ pupilMap, maskMap, pupilCell: [0, 0], maskCell: [0, 0] })
    expect(material.uniforms.maskMap.value).toBe(maskMap)
    expect(material.uniforms.maskMap.value).not.toBe(pupilMap)
    expect(material.fragmentShader).toContain('texture2D(maskMap, maskUv).a')
  })
})
