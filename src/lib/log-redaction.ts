/**
 * Structural (PII-free) log payloads for ops triage. Student reflection
 * text, identity prose, and quote content must NEVER reach console output
 * — Vercel function logs sit outside the RLS/forget envelope. Log counts,
 * IDs, dimensions, and closed-enum reasons only.
 */

/** For verifier-rejection summaries: counts + reasons, no quote text. */
export function rejectionLogFacts(input: {
  mirrorEntryId: number
  dropped: readonly { reason: string }[]
  downgraded: readonly unknown[]
}): { mirrorEntryId: number; droppedCount: number; downgradedCount: number; reasons: string[] } {
  return {
    mirrorEntryId: input.mirrorEntryId,
    droppedCount: input.dropped.length,
    downgradedCount: input.downgraded.length,
    reasons: [...new Set(input.dropped.map((d) => d.reason))],
  }
}

/**
 * For diagnostic-language guard trips: match count only, never the matched
 * text. `matches` is deliberately typed as an opaque array — the caller's
 * real element shape (`{ text, pattern }` from `~/lib/safety`) carries the
 * student's own words, so this helper must never read into it.
 */
export function safetyLogFacts(safety: { matches: readonly unknown[] }): { matchCount: number } {
  return { matchCount: safety.matches.length }
}
