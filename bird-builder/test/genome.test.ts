import { describe, expect, it } from 'vitest'
import {
  defaultGenome,
  genomeError,
  isValidGenome,
  NAME_MAX,
  setGlbSpecies,
  setName,
  setPart,
  setSpecies,
  setZoneColor,
} from '../src/bird/genome'
import { SPECIES_BY_ID } from '../src/bird/morphology'
import { NONE_ITEM, SLOTS } from '../src/bird/slots'

describe('genome', () => {
  it('defaultGenome is a valid procedural Flame Bower with empty slots', () => {
    const g = defaultGenome()
    expect(g.version).toBe(2)
    expect(g.base.kind).toBe('procedural')
    if (g.base.kind === 'procedural') expect(g.base.species).toBe('flame')
    for (const s of SLOTS) expect(g.slots[s.id].itemId).toBe(NONE_ITEM)
    expect(isValidGenome(g)).toBe(true)
  })

  it('setSpecies seeds parts + palette from the species and resets morph', () => {
    const g = setSpecies(setPart(defaultGenome(), 'crest', 'fan'), 'emerald')
    expect(g.base.kind).toBe('procedural')
    if (g.base.kind === 'procedural') {
      expect(g.base.species).toBe('emerald')
      expect(g.base.parts).toEqual(SPECIES_BY_ID.emerald.shape)
      expect(g.base.palette.back).toBe(SPECIES_BY_ID.emerald.palette.back)
      expect(g.base.morph).toEqual({})
    }
  })

  it('setZoneColor updates one zone immutably', () => {
    const g0 = defaultGenome()
    const g1 = setZoneColor(g0, 'belly', '#123456')
    expect(g1.base.palette.belly).toBe('#123456')
    expect(g0.base.palette.belly).not.toBe('#123456')
  })

  it('setName caps at NAME_MAX', () => {
    const g = setName(defaultGenome(), 'x'.repeat(50))
    expect(g.identity.name.length).toBe(NAME_MAX)
  })

  it('setGlbSpecies switches into the GLB lane', () => {
    const g = setGlbSpecies(defaultGenome())
    expect(g.base.kind).toBe('glb')
    if (g.base.kind === 'glb') expect(g.base.glbUrl).toContain('.glb')
  })

  it('genomeError pinpoints problems and passes a valid genome', () => {
    expect(genomeError(defaultGenome())).toBeNull()
    expect(genomeError(null)).toMatch(/object/)
    expect(genomeError({ ...defaultGenome(), version: 1 })).toMatch(/version/)
    const badZone = defaultGenome()
    badZone.base.palette.back = 'red'
    expect(genomeError(badZone)).toMatch(/palette\.back/)
    const badName = defaultGenome()
    badName.identity.name = 'x'.repeat(NAME_MAX + 1)
    expect(genomeError(badName)).toMatch(/name/)
  })
})
