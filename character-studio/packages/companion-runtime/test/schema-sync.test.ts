import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSenCompanion, SEN_COMPANION_EXT_VERSION } from '../src/senCompanion'

// STOP-condition bookkeeping (plan 011): three pure modules are DUPLICATED from
// the studio `core/` (sharing would drag a bare-three import + studio build
// graph into this version-agnostic package). The two VERBATIM copies (noise,
// talkDriver) are checksum-synced here; the PORTED modules (springSolver,
// proceduralIdle, clipStateMachine) diverge only by the injected-three edit and
// are covered behaviourally by solver-parity + the load-companion matrix, and
// the schema is covered by the conformance round-trip (studio compiles → here
// parses). If a verbatim copy drifts from its studio source, this fails loudly.

const runtime = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8')
const studio = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../src/core/motion/${rel}`, import.meta.url)), 'utf8')

describe('duplicated pure modules stay in sync with the studio', () => {
  it('noise.ts is a verbatim copy', () => {
    expect(runtime('noise.ts')).toBe(studio('noise.ts'))
  })

  it('talkDriver.ts is a verbatim copy', () => {
    expect(runtime('talkDriver.ts')).toBe(studio('talkDriver.ts'))
  })
})

describe('SEN_companion schema (duplicated) still validates', () => {
  it('rejects an unknown extVersion', () => {
    expect(() => parseSenCompanion({ extVersion: 99 })).toThrowError(/unsupported extVersion 99/)
  })

  it('accepts the current extVersion in a minimal instance', () => {
    const data = {
      extVersion: SEN_COMPANION_EXT_VERSION,
      character: { id: 'x', name: 'X', archetype: 'biped-round' },
      springRig: [],
      colliderGroups: [],
      boneNodeIndices: { head: 5 },
      face: {
        planeNodeIndices: {},
        atlasTextureIndices: {},
        cellMaps: { eye: {}, mouth: {}, brow: {}, pupil: {} },
        eyeCellsWithoutPupil: [],
        expressionPresets: {},
        mirroredPlanes: [],
        defaultExpression: 'neutral',
        cellUv: 0.25,
        gazeMaxOffset: 0.06,
        pupilCell: 'round',
        blink: { meanIntervalS: 4, enabled: true },
        gaze: { mode: 'idle', intensity: 0.5 },
      },
      procedural: { breathAmpl: 0.5, swayAmpl: 0.5, blinkEnabled: true, gazeEnabled: true },
      palette: { primary: '#e8a15c' },
      materialsMeta: {},
      clips: { setId: 'core-v1', names: [] },
      studioLook: null,
    }
    expect(parseSenCompanion(data).extVersion).toBe(SEN_COMPANION_EXT_VERSION)
  })
})
