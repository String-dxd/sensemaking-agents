import { describe, expect, it } from 'vitest'
import {
  executeLookupVipsTaxonomy,
  LOOKUP_VIPS_TAXONOMY_NAME,
  lookupVipsTaxonomyTool,
} from '~/agents/tools/lookup-vips-taxonomy'
import { VIPS_TAXONOMY } from '~/data/vips-taxonomy'

describe('lookup-vips-taxonomy', () => {
  it('returns values.contribution with full definition + behavioral indicators on happy path', () => {
    const out = executeLookupVipsTaxonomy({ query: 'contribution', dimension: 'values' })
    const entry = out.entries.find((e) => e.id === 'values.contribution')
    expect(entry).toBeDefined()
    expect(entry?.definition.length).toBeGreaterThan(0)
    expect(entry?.behavioral_indicators.length).toBeGreaterThanOrEqual(2)
    expect(out.entries.every((e) => e.dimension === 'values')).toBe(true)
  })

  it('returns all entries within the requested dimension on empty query', () => {
    const out = executeLookupVipsTaxonomy({ query: '', dimension: 'interests' })
    expect(out.entries).toHaveLength(6)
    expect(out.entries.every((e) => e.dimension === 'interests')).toBe(true)
    // RIASEC IDs all present
    const ids = out.entries.map((e) => e.id).sort()
    expect(ids).toEqual([
      'interests.artistic',
      'interests.conventional',
      'interests.enterprising',
      'interests.investigative',
      'interests.realistic',
      'interests.social',
    ])
  })

  it('rejects a dimension outside the closed enum at the schema boundary', () => {
    expect(() =>
      executeLookupVipsTaxonomy({
        query: 'x',
        dimension: 'made-up' as unknown as 'values',
      }),
    ).toThrow()
  })

  it('returns empty entries when the query matches nothing', () => {
    const out = executeLookupVipsTaxonomy({ query: '__no_such_thing__' })
    expect(out.entries).toEqual([])
  })

  it('fixture has exactly 22 entries with the expected dimension breakdown', () => {
    expect(VIPS_TAXONOMY).toHaveLength(22)
    const byDim = VIPS_TAXONOMY.reduce<Record<string, number>>((acc, e) => {
      acc[e.dimension] = (acc[e.dimension] ?? 0) + 1
      return acc
    }, {})
    expect(byDim).toEqual({ values: 8, interests: 6, personality: 2, skills: 6 })
  })

  it('every fixture entry has a non-empty definition and ≥2 behavioral indicators', () => {
    for (const entry of VIPS_TAXONOMY) {
      expect(entry.definition.trim().length).toBeGreaterThan(0)
      expect(entry.behavioral_indicators.length).toBeGreaterThanOrEqual(2)
      for (const ind of entry.behavioral_indicators) {
        expect(ind.trim().length).toBeGreaterThan(0)
      }
      expect(entry.id).toMatch(/^(values|interests|personality|skills)\./)
    }
  })

  it('SDK tool has the right name', () => {
    expect(lookupVipsTaxonomyTool.name).toBe(LOOKUP_VIPS_TAXONOMY_NAME)
  })
})
