import { describe, expect, it } from 'vitest'
import { defaultBirdConfig, setSlotItem as setV1SlotItem } from '../src/bird/birdConfig'
import { defaultGenome, isValidGenome } from '../src/bird/genome'
import { migrate } from '../src/bird/migrate'

describe('migrate', () => {
  it('upgrades a v1 masked config into a valid v2 GLB genome', () => {
    const v1 = defaultBirdConfig() // { version:1, baseId:'masked', featherPalette:{body,accent}, slots }
    const g = migrate(v1)
    expect(isValidGenome(g)).toBe(true)
    if (isValidGenome(g) && g.base.kind === 'glb') {
      expect(g.base.species).toBe('masked')
      expect(g.base.palette.back).toBe(v1.featherPalette.body) // body → back
      expect(g.base.palette.accent).toBe(v1.featherPalette.accent) // accent → accent
    }
  })

  it('carries v1 worn accessories through the migration', () => {
    const v1 = setV1SlotItem(defaultBirdConfig(), 'head', 'cap')
    const g = migrate(v1)
    if (isValidGenome(g)) expect(g.slots.head.itemId).toBe('cap')
  })

  it('passes a v2 genome through untouched', () => {
    const g = defaultGenome()
    expect(migrate(g)).toEqual(g)
  })

  it('returns unknown input unchanged (so validation rejects it)', () => {
    expect(migrate({ hello: 'world' })).toEqual({ hello: 'world' })
    expect(isValidGenome(migrate({ hello: 'world' }))).toBe(false)
  })
})
