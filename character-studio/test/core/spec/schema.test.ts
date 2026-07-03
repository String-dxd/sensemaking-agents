import { describe, expect, it } from 'vitest'
import { ARCHETYPES, createDefaultCharacter, PERSONALITIES } from '../../../src/core/spec'
import { CharacterSpecSchema } from '../../../src/core/spec/schema'

describe('CharacterSpecSchema — default specs', () => {
  it('parses createDefaultCharacter for every archetype × personality combination', () => {
    for (const archetype of ARCHETYPES) {
      for (const personality of PERSONALITIES) {
        const spec = createDefaultCharacter(archetype, personality)
        const result = CharacterSpecSchema.safeParse(spec)
        expect(result.success, `${archetype} × ${personality}: ${result.success ? '' : result.error?.message}`).toBe(
          true,
        )
        expect(spec.meta.archetype).toBe(archetype)
        expect(spec.meta.personality).toBe(personality)
      }
    }
  })

  it('personality changes face defaults: gruff blinks less often than gentle, and pupil scale differs', () => {
    const gentle = createDefaultCharacter('biped-round', 'gentle')
    const gruff = createDefaultCharacter('biped-round', 'gruff')

    expect(gruff.face.blink.meanIntervalS).toBeGreaterThan(gentle.face.blink.meanIntervalS)
    expect(gruff.face.eyes.pupilScale).not.toBe(gentle.face.eyes.pupilScale)
    expect(gruff.face.atlasId).not.toBe(gentle.face.atlasId)
  })

  it('bird archetype default spring rig has no ear chains', () => {
    const bird = createDefaultCharacter('bird', 'calm')
    const chainNames = bird.motion.springRig.map((c) => c.name)
    expect(chainNames).not.toContain('earL')
    expect(chainNames).not.toContain('earR')
    expect(chainNames.length).toBeGreaterThan(0)
  })

  it('biped archetypes default spring rig has ear + tail chains', () => {
    const dog = createDefaultCharacter('biped-round', 'gentle')
    const chainNames = dog.motion.springRig.map((c) => c.name)
    expect(chainNames).toEqual(expect.arrayContaining(['earL', 'earR', 'tail']))
  })
})

describe('CharacterSpecSchema — validation', () => {
  function validSpec() {
    return createDefaultCharacter('biped-round', 'gentle')
  }

  it('rejects an unknown top-level key', () => {
    const spec = { ...validSpec(), bogusField: 'nope' }
    const result = CharacterSpecSchema.safeParse(spec)
    expect(result.success).toBe(false)
  })

  it('rejects an unknown key nested in a strict object (meta)', () => {
    const spec = validSpec()
    const withBogusMeta = { ...spec, meta: { ...spec.meta, bogus: true } }
    const result = CharacterSpecSchema.safeParse(withBogusMeta)
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range body morph weight', () => {
    const spec = validSpec()
    const invalid = { ...spec, anatomy: { ...spec.anatomy, bodyMorphs: { chubby: 1.5 } } }
    const result = CharacterSpecSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range morph weight inside a part entry', () => {
    const spec = validSpec()
    const invalid = {
      ...spec,
      anatomy: {
        ...spec.anatomy,
        parts: { ears: { partId: 'floppy', morphs: { droop: -0.1 } } },
      },
    }
    const result = CharacterSpecSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects a bad bone name in boneScales', () => {
    const spec = validSpec()
    const invalid = {
      ...spec,
      anatomy: {
        ...spec.anatomy,
        parts: {
          ears: {
            partId: 'floppy',
            morphs: {},
            boneScales: { notARealBone: { x: 1, y: 1, z: 1 } },
          },
        },
      },
    }
    const result = CharacterSpecSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('accepts a valid bone name in boneScales within range', () => {
    const spec = validSpec()
    const valid = {
      ...spec,
      anatomy: {
        ...spec.anatomy,
        parts: {
          ears: {
            partId: 'floppy',
            morphs: {},
            boneScales: { 'earL.1': { x: 1.2, y: 1.2, z: 1.2 } },
          },
        },
      },
    }
    const result = CharacterSpecSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('rejects an out-of-range bone scale value', () => {
    const spec = validSpec()
    const invalid = {
      ...spec,
      anatomy: {
        ...spec.anatomy,
        parts: {
          ears: {
            partId: 'floppy',
            morphs: {},
            boneScales: { 'earL.1': { x: 10, y: 1, z: 1 } },
          },
        },
      },
    }
    const result = CharacterSpecSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects a malformed hex color', () => {
    const spec = validSpec()
    const invalid = { ...spec, palette: { ...spec.palette, primary: 'not-a-color' } }
    const result = CharacterSpecSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects a palette missing a required slot', () => {
    const spec = validSpec()
    const { primary: _primary, ...rest } = spec.palette
    const invalid = { ...spec, palette: rest }
    const result = CharacterSpecSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects arbitrary studioLook data now that plan 010 gives it a real schema', () => {
    const spec = validSpec()
    const withStudioLook = { ...spec, studioLook: { anything: 'goes', nested: { a: 1 } } }
    const result = CharacterSpecSchema.safeParse(withStudioLook)
    expect(result.success).toBe(false)
  })

  it('accepts a valid studioLook (default preset comes from createDefaultCharacter)', () => {
    const spec = validSpec()
    expect(spec.studioLook).toBeDefined()
    const result = CharacterSpecSchema.safeParse(spec)
    expect(result.success).toBe(true)
  })

  it('allows studioLook to be omitted (optional field)', () => {
    const spec = validSpec()
    const { studioLook: _studioLook, ...rest } = spec
    const result = CharacterSpecSchema.safeParse(rest)
    expect(result.success).toBe(true)
  })
})
