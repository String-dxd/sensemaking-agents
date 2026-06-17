import { describe, expect, it } from 'vitest'
import { isValidConfig } from '../src/bird/birdConfig'
import { randomizeConfig } from '../src/bird/randomize'
import { itemsForSlot, NONE_ITEM, SLOTS } from '../src/bird/slots'

// Deterministic PRNG so the test is reproducible without Math.random.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('randomizeConfig', () => {
  it('is deterministic for a given seed', () => {
    expect(randomizeConfig(mulberry32(42))).toEqual(randomizeConfig(mulberry32(42)))
  })

  it('always produces a valid config within the curated catalog', () => {
    for (let seed = 0; seed < 100; seed++) {
      const c = randomizeConfig(mulberry32(seed))
      expect(isValidConfig(c)).toBe(true)
      for (const slot of SLOTS) {
        const valid = [NONE_ITEM, ...itemsForSlot(slot.id).map((i) => i.id)]
        expect(valid).toContain(c.slots[slot.id].itemId)
      }
    }
  })
})
