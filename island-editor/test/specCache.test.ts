import { describe, expect, it } from 'vitest'
import { blurredForSpec, shoreFieldForSpec } from '../src/terrain/specCache'
import { seedIsland } from '../src/terrain/seed'
import { cellIndex } from '../src/terrain/terrainGrid'

describe('specCache', () => {
  it('returns the SAME instance for the same spec object (memoized per identity)', () => {
    const spec = seedIsland()
    expect(blurredForSpec(spec)).toBe(blurredForSpec(spec))
    expect(shoreFieldForSpec(spec)).toBe(shoreFieldForSpec(spec))
  })

  it('a fresh spec identity after a grid mutation gets freshly-computed fields reflecting it', () => {
    const spec = seedIsland()
    const blurredBefore = blurredForSpec(spec)
    const shoreBefore = shoreFieldForSpec(spec)

    // App's edit model: mutate the grid arrays in place, then mint a new spec
    // object identity ({ ...spec }) for the tick. Raise a far-ocean cell high.
    const i = cellIndex(spec.grid, 2, 2)
    spec.grid.tiers[i] = 4
    const next = { ...spec }

    const blurredAfter = blurredForSpec(next)
    const shoreAfter = shoreFieldForSpec(next)
    expect(blurredAfter).not.toBe(blurredBefore)
    expect(shoreAfter).not.toBe(shoreBefore)
    // The fresh fields see the mutation: the raised cell blurs above zero and
    // flips its neighborhood's shore distance toward land (negative).
    expect(blurredAfter[i]).toBeGreaterThan(0)
    expect(blurredBefore[i]).toBe(0) // old snapshot precomputed before the edit
  })
})
