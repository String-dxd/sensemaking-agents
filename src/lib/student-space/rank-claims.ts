import type { VipsTaxonomyEntry } from '~/data/vips-taxonomy'

export interface RankedClaims {
  mostCommon: VipsTaxonomyEntry | null
  quietlyEmerging: VipsTaxonomyEntry | null
}

export function rankClaims(
  claims: VipsTaxonomyEntry[],
  counts: Record<string, number>,
): RankedClaims {
  const ranked = claims
    .map((claim) => ({ claim, count: counts[claim.id] ?? 0 }))
    .sort((a, b) => b.count - a.count)
  if (ranked.length === 0) return { mostCommon: null, quietlyEmerging: null }
  const seen = ranked.filter((entry) => entry.count > 0)
  const unseen = ranked.filter((entry) => entry.count === 0)
  return {
    mostCommon: ranked[0]?.claim ?? null,
    quietlyEmerging: unseen[0]?.claim ?? seen.at(-1)?.claim ?? ranked[0]?.claim ?? null,
  }
}
