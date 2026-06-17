import { describe, expect, it } from 'vitest'
import { type ProceduralBase, SPECIES_IDS } from '../src/bird/genome'
import { getCharacter, resolveCharacter } from '../src/bird/morphology'

// The CRITICAL gate (stress-test risk #1): a sparse MorphDelta must deep-merge —
// scaling exactly the targeted nested field and leaving every other sub-object at
// the species default. A regression here silently clobbers whole sub-objects.

function baseFor(species: ProceduralBase['species'], morph: ProceduralBase['morph'] = {}): ProceduralBase {
  return {
    kind: 'procedural',
    species,
    parts: { crest: 'pointed', tail: 'long-fan', beak: 'slender' },
    morph,
    palette: { back: '#fff', belly: '#fff', accent: '#fff', beak: '#222', legs: '#222', eye: '#111' },
    face: { eye: 'sweet' },
    pattern: null,
  }
}

describe('resolveCharacter', () => {
  it('with empty morph preserves every species nested sub-object exactly', () => {
    for (const id of SPECIES_IDS) {
      const ch = getCharacter(id)
      const c = resolveCharacter(baseFor(id))
      for (const key of ['body', 'belly', 'headScale', 'beak', 'wing', 'leg', 'tail'] as const) {
        expect(c[key]).toEqual(ch[key])
      }
    }
  })

  it('a sparse delta scales ONLY its field and never clobbers siblings', () => {
    const ch = getCharacter('flame')
    const c = resolveCharacter(baseFor('flame', { body: { x: 1.5 } }))
    expect(c.body.x).toBeCloseTo(ch.body.x * 1.5)
    // siblings untouched
    expect(c.body.y).toBe(ch.body.y)
    expect(c.body.z).toBe(ch.body.z)
    // unrelated sub-objects fully intact (the clobber footgun)
    expect(c.beak).toEqual(ch.beak)
    expect(c.wing).toEqual(ch.wing)
    expect(c.tail).toEqual(ch.tail)
    expect(c.leg).toEqual(ch.leg)
    expect(c.headScale).toEqual(ch.headScale)
  })

  it('applies scalar morph multipliers', () => {
    const ch = getCharacter('lilac')
    const c = resolveCharacter(baseFor('lilac', { headSize: 1.2, crestScale: 0.5 }))
    expect(c.headSize).toBeCloseTo(ch.headSize * 1.2)
    expect(c.crestScale).toBeCloseTo(ch.crestScale * 0.5)
  })

  it('the eye archetype overrides eye params (wide → big whites)', () => {
    const c = resolveCharacter({ ...baseFor('emerald'), face: { eye: 'wide' } })
    expect(c.eyeWhite).toBe(0.25) // EYE_ARCHETYPE_PARAMS.wide.eyeWhite
  })

  it('bounded face deltas override brow / upper lid', () => {
    const c = resolveCharacter({ ...baseFor('satin'), face: { eye: 'sweet', browAngle: -0.25, lidAperture: 0.42 } })
    expect(c.brow).toBe(-0.25)
    expect(c.upperLid).toBe(0.42)
  })
})
