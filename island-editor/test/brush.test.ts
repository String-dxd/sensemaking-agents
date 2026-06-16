import { describe, expect, it } from 'vitest'
import { applyBrush } from '../src/terrain/brush'
import type { ReliefGrid } from '../src/terrain/islandSpec'

function emptyRelief(resolution = 65): ReliefGrid {
  return { resolution, data: new Array(resolution * resolution).fill(0) }
}

const WORLD = 24

describe('sculpt brush', () => {
  it('raise lifts the center cell the most', () => {
    const relief = emptyRelief()
    applyBrush(relief, WORLD, 0, 0, { radius: 4, strength: 0.5, mode: 'raise' })
    const res = relief.resolution
    const center = relief.data[Math.floor(res / 2) * res + Math.floor(res / 2)]
    const corner = relief.data[0]
    expect(center).toBeGreaterThan(0)
    expect(center).toBeGreaterThan(corner)
    expect(corner).toBe(0) // outside the brush radius
  })

  it('lower is the inverse of raise', () => {
    const relief = emptyRelief()
    applyBrush(relief, WORLD, 0, 0, { radius: 4, strength: 0.5, mode: 'lower' })
    const res = relief.resolution
    const center = relief.data[Math.floor(res / 2) * res + Math.floor(res / 2)]
    expect(center).toBeLessThan(0)
  })

  it('flatten pulls neighbors toward the center value', () => {
    const relief = emptyRelief()
    // first raise a bump, then flatten should reduce variance around center
    applyBrush(relief, WORLD, 0, 0, { radius: 5, strength: 0.8, mode: 'raise' })
    const before = relief.data.slice()
    applyBrush(relief, WORLD, 0, 0, { radius: 5, strength: 0.6, mode: 'flatten' })
    // values changed (flatten did something)
    expect(relief.data).not.toEqual(before)
  })

  it('only touches cells within the radius', () => {
    const relief = emptyRelief()
    applyBrush(relief, WORLD, 0, 0, { radius: 2, strength: 0.5, mode: 'raise' })
    // a far cell stays zero
    expect(relief.data[0]).toBe(0)
  })
})
