import { Document, NodeIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import {
  parseSenCompanion,
  SEN_COMPANION_EXT_VERSION,
  SEN_COMPANION_EXTENSION_NAME,
  SENCompanionExtension,
  type SenCompanionData,
} from '../../../src/core/export/senCompanion'

function minimalData(overrides: Partial<SenCompanionData> = {}): SenCompanionData {
  return {
    extVersion: SEN_COMPANION_EXT_VERSION,
    character: { id: 'dog-1', name: 'Dog', archetype: 'biped-round', personality: 'gentle' },
    springRig: [
      {
        name: 'earL',
        boneNames: ['earL.1', 'earL.2'],
        joints: [
          { stiffness: 0.25, gravityPower: 30, gravityDir: [0, -1, 0], dragForce: 0.12, hitRadius: 0.02 },
          { stiffness: 0.25, gravityPower: 30, gravityDir: [0, -1, 0], dragForce: 0.12, hitRadius: 0.02 },
        ],
        colliderGroupRefs: ['head'],
      },
    ],
    colliderGroups: [{ name: 'head', colliders: [{ boneName: 'head', offset: [0, 0.19, 0], radius: 0.2 }] }],
    boneNodeIndices: { 'earL.1': 7, 'earL.2': 8, head: 5 },
    face: {
      planeNodeIndices: { eyeWhiteL: 40, mouth: 46 },
      atlasTextureIndices: { eye: 0, pupil: 1, brow: 2, mouth: 3 },
      cellMaps: {
        eye: { open: [0, 0], closed: [2, 0] },
        mouth: { neutral: [0, 0] },
        brow: { neutral: [0, 0] },
        pupil: { round: [0, 0] },
      },
      eyeCellsWithoutPupil: ['closed'],
      expressionPresets: { neutral: { eyeL: 'open', eyeR: 'open', brow: 'neutral', mouth: 'neutral' } },
      mirroredPlanes: ['eyeWhiteR', 'pupilR', 'browR'],
      defaultExpression: 'neutral',
      cellUv: 0.25,
      gazeMaxOffset: 0.06,
      pupilCell: 'round',
      blink: { meanIntervalS: 4.5, enabled: true },
      gaze: { mode: 'idle', intensity: 0.5 },
    },
    procedural: { breathAmpl: 0.5, swayAmpl: 0.5, blinkEnabled: true, gazeEnabled: true },
    palette: { primary: '#e8a15c', belly: '#fdf1e0' },
    materialsMeta: {
      body: { rampSoftness: 0.2, rimStrength: 0.3, shadowTint: '#b8a8c8', maskTextureIndex: 4 },
    },
    clips: { setId: 'core-v1', names: ['idle', 'walk'] },
    studioLook: null,
    ...overrides,
  }
}

describe('SEN_companion schema', () => {
  it('validates a minimal, hand-built instance', () => {
    const parsed = parseSenCompanion(minimalData())
    expect(parsed.extVersion).toBe(SEN_COMPANION_EXT_VERSION)
    expect(parsed.springRig[0].boneNames).toEqual(['earL.1', 'earL.2'])
    expect(parsed.face.cellMaps.eye.open).toEqual([0, 0])
  })

  it('rejects an unknown extVersion with a clear, actionable error', () => {
    expect(() => parseSenCompanion(minimalData({ extVersion: 99 }))).toThrowError(/unsupported extVersion 99/)
    expect(() => parseSenCompanion(minimalData({ extVersion: 99 }))).toThrowError(/version 1/)
  })

  it('rejects a missing / non-object blob clearly', () => {
    expect(() => parseSenCompanion(null)).toThrowError(/missing or not an object/)
    expect(() => parseSenCompanion(42)).toThrowError(/missing or not an object/)
  })

  it('rejects unknown top-level keys (strict schema keeps the contract honest)', () => {
    expect(() => parseSenCompanion({ ...minimalData(), rogueKey: true })).toThrow()
  })

  it('round-trips through a GLB via the gltf-transform extension', async () => {
    const doc = new Document()
    doc.getRoot().setDefaultScene(doc.createScene('s'))
    doc.createExtension(SENCompanionExtension).setData(minimalData())

    const io = new NodeIO().registerExtensions([SENCompanionExtension])
    const glb = await io.writeBinary(doc)

    const doc2 = await io.readBinary(glb)
    const ext = doc2
      .getRoot()
      .listExtensionsUsed()
      .find((e) => e.extensionName === SEN_COMPANION_EXTENSION_NAME) as SENCompanionExtension | undefined
    expect(ext).toBeDefined()
    const data = ext?.getData()
    expect(data?.extVersion).toBe(SEN_COMPANION_EXT_VERSION)
    expect(data?.clips.names).toEqual(['idle', 'walk'])
    expect(data?.face.mirroredPlanes).toContain('eyeWhiteR')
  })
})
