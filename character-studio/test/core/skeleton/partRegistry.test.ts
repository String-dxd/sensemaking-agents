import { describe, expect, it } from 'vitest'
import { BONE_NAMES, PART_SLOTS, REGIONS } from '../../../src/core/spec/schema'
import type { PartDef } from '../../../src/core/skeleton/partRegistry'
import {
  BODY_MORPHS,
  BODY_REGISTRY,
  getPart,
  PART_IDS,
  PART_REGISTRY,
  partsForSlot,
} from '../../../src/core/skeleton/partRegistry'
import { SPRING_CHAIN_BONES } from '../../../src/core/skeleton/canonical'

describe('part registry', () => {
  it('covers every slot with the plan-006 minimum variety', () => {
    expect(partsForSlot('ears')).toHaveLength(4)
    // 2 mammal muzzles + 4 bird beaks (plan 010 added beak-hooked / bill-duck)
    expect(partsForSlot('muzzle')).toHaveLength(6)
    expect(partsForSlot('tail')).toHaveLength(4)
    expect(partsForSlot('claws')).toHaveLength(2)
    expect(partsForSlot('crest')).toHaveLength(2)
    // ≥14 authored (non-empty) parts committed
    expect(PART_IDS.filter((id) => PART_REGISTRY[id].url !== null).length).toBeGreaterThanOrEqual(14)
  })

  it('every entry has a valid slot and region', () => {
    for (const id of PART_IDS) {
      const def: PartDef = PART_REGISTRY[id]
      expect(PART_SLOTS).toContain(def.slot)
      expect(REGIONS).toContain(def.region)
    }
  })

  it('references only canonical bones', () => {
    for (const id of PART_IDS) {
      const def: PartDef = PART_REGISTRY[id]
      for (const bone of [...(def.skinnedTo ?? []), ...(def.attachTo ?? [])]) {
        expect(BONE_NAMES, `${id} references unknown bone ${bone}`).toContain(bone)
      }
    }
  })

  it('parts are skinned XOR rigid XOR empty', () => {
    for (const id of PART_IDS) {
      const def: PartDef = PART_REGISTRY[id]
      if (def.url === null) {
        expect(def.skinnedTo, id).toBeUndefined()
        expect(def.attachTo, id).toBeUndefined()
        expect(def.maskUrl, id).toBeNull()
      } else {
        expect(Boolean(def.skinnedTo) !== Boolean(def.attachTo), `${id} must be skinned or rigid, not both`).toBe(true)
      }
    }
  })

  it('spring profiles only appear on spring-chain-skinned parts', () => {
    for (const id of PART_IDS) {
      const def: PartDef = PART_REGISTRY[id]
      if (!def.springProfile) continue
      expect(def.skinnedTo, `${id} has springProfile but is not skinned`).toBeDefined()
      for (const bone of def.skinnedTo ?? []) {
        expect(SPRING_CHAIN_BONES, `${id} spring bone ${bone}`).toContain(bone)
      }
      expect(def.springProfile.stiffness).toBeGreaterThan(0)
      expect(def.springProfile.stiffness).toBeLessThanOrEqual(1)
    }
  })

  it('floppy ears are springier than upright ears (관상 of motion)', () => {
    const floppy = getPart('floppy-long')?.springProfile
    const upright = getPart('upright-pointy')?.springProfile
    expect(floppy && upright).toBeTruthy()
    if (floppy && upright) {
      expect(floppy.stiffness).toBeLessThan(upright.stiffness)
      expect(floppy.gravityPower).toBeGreaterThan(upright.gravityPower)
    }
  })

  it('beaks hide the drawn mouth; other muzzles do not', () => {
    expect(getPart('beak-small')?.hidesMouth).toBe(true)
    expect(getPart('beak-round')?.hidesMouth).toBe(true)
    expect(getPart('short-cat')?.hidesMouth).toBeUndefined()
    expect(getPart('boxy-dog')?.hidesMouth).toBeUndefined()
  })

  it('getPart resolves known ids and rejects unknown', () => {
    expect(getPart('floppy-long')?.slot).toBe('ears')
    expect(getPart('nope')).toBeNull()
  })

  it('body registry covers all archetypes with the canonical morph set', () => {
    expect(Object.keys(BODY_REGISTRY).sort()).toEqual(['biped-round', 'biped-slim', 'bird'])
    expect([...BODY_MORPHS]).toEqual(['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall'])
    for (const def of Object.values(BODY_REGISTRY)) {
      expect(def.morphs).toEqual(BODY_MORPHS)
    }
  })
})
