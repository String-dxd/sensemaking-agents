import { describe, expect, it } from 'vitest'

import type { VipsTaxonomyEntry } from '~/data/vips-taxonomy'
import { rankClaims } from '~/lib/student-space/rank-claims'

function claim(id: string, label: string): VipsTaxonomyEntry {
  return {
    id,
    dimension: 'values',
    label,
    definition: '',
    behavioral_indicators: [],
  }
}

describe('rankClaims', () => {
  it('returns both null when given an empty claims array', () => {
    expect(rankClaims([], {})).toEqual({ mostCommon: null, quietlyEmerging: null })
  })

  it('picks the highest-count claim as mostCommon and an unseen claim as quietlyEmerging', () => {
    const claims = [claim('a', 'Alpha'), claim('b', 'Beta'), claim('c', 'Gamma')]
    const ranked = rankClaims(claims, { a: 3, b: 0, c: 1 })
    expect(ranked.mostCommon?.id).toBe('a')
    // 'b' is the first unseen (count === 0) in sorted order.
    expect(ranked.quietlyEmerging?.id).toBe('b')
  })

  it('falls back to the lowest-seen claim for quietlyEmerging when every claim has quotes', () => {
    const claims = [claim('a', 'Alpha'), claim('b', 'Beta'), claim('c', 'Gamma')]
    const ranked = rankClaims(claims, { a: 5, b: 3, c: 1 })
    expect(ranked.mostCommon?.id).toBe('a')
    // No unseen; pick the lowest-seen (last entry after descending sort).
    expect(ranked.quietlyEmerging?.id).toBe('c')
  })

  it('falls back to the single claim for both buckets when only one claim exists', () => {
    const only = claim('solo', 'Solo')
    const ranked = rankClaims([only], { solo: 2 })
    expect(ranked.mostCommon?.id).toBe('solo')
    expect(ranked.quietlyEmerging?.id).toBe('solo')
  })

  it('treats claims with no entry in counts as zero (unseen)', () => {
    const claims = [claim('a', 'Alpha'), claim('b', 'Beta')]
    const ranked = rankClaims(claims, { a: 4 })
    expect(ranked.mostCommon?.id).toBe('a')
    // 'b' has no counts entry → treated as 0 → unseen.
    expect(ranked.quietlyEmerging?.id).toBe('b')
  })

  it('returns the same claim for both buckets when only one unseen claim exists', () => {
    const claims = [claim('a', 'Alpha')]
    const ranked = rankClaims(claims, {})
    expect(ranked.mostCommon?.id).toBe('a')
    expect(ranked.quietlyEmerging?.id).toBe('a')
  })
})
