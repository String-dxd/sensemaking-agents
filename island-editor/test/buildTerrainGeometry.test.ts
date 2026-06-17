import { describe, expect, it } from 'vitest'
import { buildBaseField } from '../src/terrain/buildTerrainGeometry'
import { seedFromCurrentIsland } from '../src/terrain/islandSpec'

describe('buildBaseField — resolution', () => {
  const spec = seedFromCurrentIsland()
  it('honors a reduced segment count (drag preview)', () => {
    const f = buildBaseField(spec, 32)
    expect(f.segments).toBe(32)
    expect(f.n).toBe(33)
    expect(f.xs.length).toBe(33 * 33)
    expect(f.indices.length).toBe(32 * 32 * 6)
  })
  it('builds the full-resolution field', () => {
    const f = buildBaseField(spec, 80)
    expect(f.n).toBe(81)
    expect(f.xs.length).toBe(81 * 81)
  })
})
