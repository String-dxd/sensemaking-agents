import { describe, expect, it } from 'vitest'
import {
  executeLookupEcgTaxonomy,
  LOOKUP_ECG_TAXONOMY_NAME,
  lookupEcgTaxonomyTool,
} from '~/agents/tools/lookup-ecg-taxonomy'

describe('lookup-ecg-taxonomy', () => {
  it('returns ≥1 entry of the requested category', () => {
    const out = executeLookupEcgTaxonomy({ query: 'engineering', category: 'cluster' })
    expect(out.entries.length).toBeGreaterThan(0)
    expect(out.entries.every((e) => e.category === 'cluster')).toBe(true)
  })

  it('returns empty entries when the query matches nothing', () => {
    const out = executeLookupEcgTaxonomy({ query: '__no_such_thing__' })
    expect(out.entries).toEqual([])
  })

  it('rejects an unknown category at the schema boundary', () => {
    expect(() =>
      executeLookupEcgTaxonomy({
        query: 'x',
        category: 'made-up' as unknown as 'cluster',
      }),
    ).toThrow()
  })

  it('SDK tool has the right name', () => {
    expect(lookupEcgTaxonomyTool.name).toBe(LOOKUP_ECG_TAXONOMY_NAME)
  })
})
