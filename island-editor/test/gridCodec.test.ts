import { describe, expect, it } from 'vitest'
import { decodeGrid, encodeGrid, type SerializedGrid } from '../src/editor/gridCodec'
import { createOceanGrid, MAX_TIER, SURFACE_GRASS } from '../src/terrain/terrainGrid'

function sampleGrid() {
  const grid = createOceanGrid(4, 3)
  grid.tiers[0] = 4
  grid.tiers[5] = 2
  grid.surface[5] = SURFACE_GRASS
  return grid
}

function encoded(): SerializedGrid {
  return encodeGrid(sampleGrid())
}

describe('gridCodec', () => {
  it('round-trips a grid through encode/decode', () => {
    const grid = sampleGrid()
    const back = decodeGrid(encodeGrid(grid))
    expect(back).toEqual(grid)
  })

  it('encodes rows as digit strings of the right shape', () => {
    const s = encodeGrid(createOceanGrid(4, 3))
    expect(s.cols).toBe(4)
    expect(s.rows).toBe(3)
    expect(s.tiers).toEqual(['0000', '0000', '0000'])
    expect(s.surface).toEqual(['0000', '0000', '0000'])
  })

  it('throws on wrong row count', () => {
    const s = encoded()
    s.tiers = s.tiers.slice(0, 2)
    expect(() => decodeGrid(s)).toThrow(/must have 3 rows/)
  })

  it('throws on wrong row length', () => {
    const s = encoded()
    s.tiers[1] = '00000'
    expect(() => decodeGrid(s)).toThrow(/must be 4 chars/)
  })

  it('throws on non-digit chars', () => {
    const s = encoded()
    s.tiers[0] = 'x000'
    expect(() => decodeGrid(s)).toThrow(/not a digit/)
  })

  it('throws when a tier digit exceeds MAX_TIER', () => {
    const s = encoded()
    s.tiers[0] = String(MAX_TIER + 1) + '000'
    expect(() => decodeGrid(s)).toThrow(/exceeds max/)
  })

  it('throws when a surface digit exceeds SURFACE_GRASS', () => {
    const s = encoded()
    s.surface[0] = '2000'
    expect(() => decodeGrid(s)).toThrow(/exceeds max/)
  })

  it('throws on missing cols/rows', () => {
    expect(() => decodeGrid({ tiers: [], surface: [] })).toThrow(/cols must be a positive integer/)
  })
})
