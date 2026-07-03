import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDIO_LOOK_PRESET,
  MAX_LIGHTS,
  STUDIO_LOOK_PRESET_IDS,
  STUDIO_LOOK_PRESETS,
  StudioLookSchema,
  studioLookFromPreset,
} from '../../../src/core/spec/lighting'

describe('StudioLookSchema — presets', () => {
  it('every named preset validates', () => {
    for (const id of STUDIO_LOOK_PRESET_IDS) {
      const result = StudioLookSchema.safeParse(STUDIO_LOOK_PRESETS[id])
      expect(result.success, `${id}: ${result.success ? '' : result.error?.message}`).toBe(true)
    }
  })

  it('has exactly the four presets the plan specifies', () => {
    expect(new Set(STUDIO_LOOK_PRESET_IDS)).toEqual(
      new Set(['three-point-soft', 'golden-hour', 'cool-studio', 'dramatic-rim']),
    )
  })

  it('defaults to three-point-soft', () => {
    expect(DEFAULT_STUDIO_LOOK_PRESET).toBe('three-point-soft')
  })

  it('studioLookFromPreset returns a fresh, independently-mutable clone', () => {
    const a = studioLookFromPreset('three-point-soft')
    const b = studioLookFromPreset('three-point-soft')
    a.lights[0].intensity = 999
    expect(b.lights[0].intensity).not.toBe(999)
    // the module-level preset table itself must stay pristine too
    expect(STUDIO_LOOK_PRESETS['three-point-soft'].lights[0].intensity).not.toBe(999)
  })

  it('dramatic-rim has a rim light stronger than its key (back-glow separation)', () => {
    const look = STUDIO_LOOK_PRESETS['dramatic-rim']
    const key = look.lights.find((l) => l.type === 'key')
    const rim = look.lights.find((l) => l.type === 'rim')
    expect(key).toBeDefined()
    expect(rim).toBeDefined()
    expect(rim!.intensity).toBeGreaterThan(key!.intensity)
  })
})

describe('StudioLookSchema — validation / bounds', () => {
  function validLook() {
    return studioLookFromPreset('three-point-soft')
  }

  it('rejects 5 lights (over MAX_LIGHTS)', () => {
    expect(MAX_LIGHTS).toBe(4)
    const look = validLook()
    const fiveLights = { ...look, lights: Array(5).fill(look.lights[0]) }
    expect(StudioLookSchema.safeParse(fiveLights).success).toBe(false)
  })

  it('rejects zero lights', () => {
    const invalid = { ...validLook(), lights: [] }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('accepts exactly MAX_LIGHTS (4) lights', () => {
    const look = validLook()
    const four = { ...look, lights: Array(4).fill(look.lights[0]) }
    expect(StudioLookSchema.safeParse(four).success).toBe(true)
  })

  it('rejects a light intensity of 9 (out of 0..8 range)', () => {
    const look = validLook()
    const invalid = { ...look, lights: [{ ...look.lights[0], intensity: 9 }] }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('accepts a light intensity at the boundary (8)', () => {
    const look = validLook()
    const valid = { ...look, lights: [{ ...look.lights[0], intensity: 8 }] }
    expect(StudioLookSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an out-of-range ambientFloor', () => {
    const invalid = { ...validLook(), ambientFloor: 1.5 }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects an out-of-range environment intensity (> 2)', () => {
    const look = validLook()
    const invalid = { ...look, environment: { ...look.environment, intensity: 2.1 } }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects a rotationDeg out of 0..360', () => {
    const look = validLook()
    const invalid = { ...look, environment: { ...look.environment, rotationDeg: 361 } }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects an invalid background mode', () => {
    const look = validLook()
    const invalid = { ...look, environment: { ...look.environment, background: 'neon' } }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects a malformed hex color on a light', () => {
    const look = validLook()
    const invalid = { ...look, lights: [{ ...look.lights[0], color: 'not-a-color' }] }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects a targetHeight above 1.5', () => {
    const look = validLook()
    const invalid = { ...look, lights: [{ ...look.lights[0], targetHeight: 1.6 }] }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects an unknown top-level key (strict)', () => {
    const invalid = { ...validLook(), bogus: true }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects an unknown light key (strict)', () => {
    const look = validLook()
    const invalid = { ...look, lights: [{ ...look.lights[0], bogus: 1 }] }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects an unsupported version number', () => {
    const invalid = { ...validLook(), version: 2 }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })
})

describe('StudioLookSchema — portraitCamera', () => {
  it('is optional', () => {
    const look = studioLookFromPreset('three-point-soft')
    expect(look.portraitCamera).toBeUndefined()
    expect(StudioLookSchema.safeParse(look).success).toBe(true)
  })

  it('round-trips through JSON when set', () => {
    const look = studioLookFromPreset('three-point-soft')
    look.portraitCamera = { position: [0, 1.1, 2.4], target: [0, 0.9, 0], fov: 32 }
    const parsed = StudioLookSchema.parse(JSON.parse(JSON.stringify(look)))
    expect(parsed.portraitCamera).toEqual(look.portraitCamera)
  })

  it('rejects an fov outside 10..120', () => {
    const look = studioLookFromPreset('three-point-soft')
    const invalid = { ...look, portraitCamera: { position: [0, 1, 2], target: [0, 0, 0], fov: 5 } }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects a portraitCamera missing a required field (strict)', () => {
    const look = studioLookFromPreset('three-point-soft')
    const invalid = { ...look, portraitCamera: { position: [0, 1, 2], fov: 30 } }
    expect(StudioLookSchema.safeParse(invalid).success).toBe(false)
  })
})
