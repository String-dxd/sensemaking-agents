import { describe, expect, it } from 'vitest'
import {
  ATLAS_GRID,
  BROW_CELLS,
  CELL_UV,
  cellUvOffset,
  EYE_CELLS,
  EYE_CELLS_WITHOUT_PUPIL,
  MOUTH_CELLS,
  PUPIL_CELLS,
} from '../../../src/core/face/atlas'

const PARTS = {
  eye: EYE_CELLS,
  mouth: MOUTH_CELLS,
  brow: BROW_CELLS,
  pupil: PUPIL_CELLS,
} as const

describe('atlas cell maps (permanent layout contract)', () => {
  it.each(Object.entries(PARTS))('%s cells are within the 4×4 grid', (_part, cells) => {
    for (const [name, [col, row]] of Object.entries(cells)) {
      expect(Number.isInteger(col), `${name} col integer`).toBe(true)
      expect(Number.isInteger(row), `${name} row integer`).toBe(true)
      expect(col, `${name} col`).toBeGreaterThanOrEqual(0)
      expect(col, `${name} col`).toBeLessThan(ATLAS_GRID)
      expect(row, `${name} row`).toBeGreaterThanOrEqual(0)
      expect(row, `${name} row`).toBeLessThan(ATLAS_GRID)
    }
  })

  it.each(Object.entries(PARTS))('%s cells have no duplicates', (_part, cells) => {
    const seen = Object.values(cells).map(([c, r]) => `${c},${r}`)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('cellUvOffset returns exact fractional offsets', () => {
    expect(cellUvOffset([0, 0])).toEqual([0, 0])
    expect(cellUvOffset([3, 2])).toEqual([0.75, 0.5])
    expect(CELL_UV).toBe(0.25)
  })

  it('every no-pupil cell names an existing eye cell', () => {
    for (const name of EYE_CELLS_WITHOUT_PUPIL) {
      expect(EYE_CELLS).toHaveProperty(name)
    }
  })
})
