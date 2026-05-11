/**
 * U6 — Deterministic verifier (R10, R11, R8 `reinforces`).
 *
 * Plain code, not an LLM. Sits between the Connector (U7 auto-Connector
 * after `persistMirror`) and the student review surface (U8). The verifier
 * is the structural gate that enforces:
 *
 *   R10  every admitted timeline entry has its `verbatim_quote` actually
 *        present in the cited reflection's transcript (normalized).
 *   R11  parallax cap — a single-context history cannot mint a
 *        strength=high entry; it gets capped to low + flagged
 *        `aspirational: true` so the review surface shows the flag.
 *   A5   `reinforces_id` is set by structural rule on the verifier side;
 *        the agent never emits it.
 *   R19  forgotten timeline entries are excluded from both the
 *        parallax-count source and the `reinforces_id` candidate set —
 *        "excluded from future sense-making context" extends here.
 *
 * The verifier never queries the DB. The caller (U7) scopes via
 * `withStudent` and passes `existingTimelineEntries` in as input. This
 * keeps the verifier pure and fast.
 *
 * AE7 calibration pair lives in `test/agents/verifier.test.ts`.
 */
import type {
  ProposedTimelineEntryDraft,
  VerifierAnnotatedEntry,
  VerifierDroppedEntry,
  VerifierExistingTimelineEntry,
  VerifierMirrorEntry,
  VerifierProposedDiff,
  VerifierResult,
} from './tools/schemas'

/**
 * Partial-match threshold for downgrade. The plan pins AE7's pass/fail
 * boundary (full-match-admit, fabricated-quote-drop); the partial-match
 * threshold is the soft boundary. 0.8 = ≥80% of the normalized quote's
 * tokens must appear as a contiguous subsequence in the normalized
 * transcript. Below the threshold → drop.
 */
const PARTIAL_MATCH_THRESHOLD = 0.8

/**
 * Normalize a string for the quote-vs-transcript comparison. The
 * transformations are deliberately conservative: lowercase, strip
 * a closed set of punctuation, collapse whitespace. Stemming, accent
 * stripping, and stopword removal are all intentionally left out —
 * paraphrases must drop, not get smuggled past the gate.
 *
 * The punctuation class is `.,!?;:'"\-—` (period, comma, !, ?, semi,
 * colon, apostrophe, quote, hyphen, em-dash). The escapes match the
 * plan's pseudocode.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:'"\-—]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  if (s.length === 0) return []
  return s.split(' ').filter((t) => t.length > 0)
}

/**
 * Longest-contiguous-token-subsequence ratio of `quoteTokens` inside
 * `transcriptTokens`. We slide a window of decreasing size over
 * `quoteTokens` and find the longest window that appears verbatim in
 * `transcriptTokens`. The ratio is `longest / quoteTokens.length`.
 *
 * `O(n*m)` worst case; n and m are both small for our use (≤ ~50
 * tokens for a reflection quote). Fine for v0.2.
 */
function longestContiguousTokenRatio(
  quoteTokens: string[],
  transcriptTokens: string[],
): number {
  if (quoteTokens.length === 0) return 0
  for (let windowSize = quoteTokens.length; windowSize > 0; windowSize -= 1) {
    for (let start = 0; start + windowSize <= quoteTokens.length; start += 1) {
      const window = quoteTokens.slice(start, start + windowSize).join(' ')
      const transcriptStr = transcriptTokens.join(' ')
      // Match on token boundaries — `\bword\b` would mishandle the
      // contractions we already stripped via punctuation removal; joining
      // with single spaces and checking includes is safe because both
      // sides have been normalized to single-space-separated tokens.
      if (transcriptStr.includes(window)) {
        // Require the window to start at a token boundary in the
        // transcript: either at index 0 or preceded by a space. Same
        // for the end. This prevents a 3-letter prefix matching a
        // longer transcript token (e.g. 'ate' inside 'date').
        const idx = transcriptStr.indexOf(window)
        const beforeOk = idx === 0 || transcriptStr[idx - 1] === ' '
        const afterIdx = idx + window.length
        const afterOk = afterIdx === transcriptStr.length || transcriptStr[afterIdx] === ' '
        if (beforeOk && afterOk) return windowSize / quoteTokens.length
      }
    }
  }
  return 0
}

interface VerifyInput {
  diff: VerifierProposedDiff
  mirrorEntry: VerifierMirrorEntry
  existingTimelineEntries: VerifierExistingTimelineEntry[]
}

/**
 * Run the three verifier phases (quote match → parallax cap →
 * structural reinforces) and return the partitioned VerifierResult.
 *
 * Pure with respect to inputs: no DB reads, no OpenAI calls, no side
 * effects. Caller (U7) is responsible for scoping the
 * `existingTimelineEntries` via `withStudent`.
 */
export function verifyProposedDiff(input: VerifyInput): VerifierResult {
  const { diff, mirrorEntry, existingTimelineEntries } = input

  const admitted: VerifierAnnotatedEntry[] = []
  const downgraded: VerifierAnnotatedEntry[] = []
  const dropped: VerifierDroppedEntry[] = []

  const nonForgotten = existingTimelineEntries.filter((e) => e.forgotten_at === null)

  for (const entry of diff.timeline_entries) {
    // ── error path: cited reflection_id must match the mirror entry ──
    if (entry.reflection_id !== mirrorEntry.id) {
      dropped.push({ entry, reason: 'unknown_reflection' })
      continue
    }

    // ── phase 1: quote match (R10) ──
    const normQuote = normalize(entry.verbatim_quote)
    const normTranscript = normalize(mirrorEntry.transcript)

    let partialMatch = false
    let effectiveStrength = entry.strength

    if (normTranscript.includes(normQuote)) {
      // Full match — admit at proposed strength.
      partialMatch = false
    } else {
      const quoteTokens = tokenize(normQuote)
      const transcriptTokens = tokenize(normTranscript)
      const ratio = longestContiguousTokenRatio(quoteTokens, transcriptTokens)
      if (ratio >= PARTIAL_MATCH_THRESHOLD) {
        partialMatch = true
        effectiveStrength = 'low'
      } else {
        dropped.push({ entry, reason: 'no_quote_match' })
        continue
      }
    }

    // ── phase 2: parallax cap (R11) ──
    // Distinct context types across (a) the cited reflection's
    // context_type + (b) parallax_tag arrays on prior non-forgotten
    // timeline entries sharing the same canonical claim id. If the
    // count is < 2 AND the agent proposed `strength: 'high'`, cap
    // to low and mark aspirational. We compute parallax against the
    // ORIGINAL proposed strength, not the partial-match-downgraded
    // one — partial_match downgrades and the parallax cap are
    // orthogonal flags.
    const contextSet = new Set<string>()
    contextSet.add(mirrorEntry.context_type)
    for (const tag of entry.parallax_tag) contextSet.add(tag)
    for (const existing of nonForgotten) {
      if (existing.canonical_claim_id !== entry.canonical_claim_id) continue
      for (const tag of existing.parallax_tag) contextSet.add(tag)
    }

    let aspirational = false
    let parallaxCapReason: VerifierAnnotatedEntry['parallax_cap_reason'] = null
    if (contextSet.size < 2 && entry.strength === 'high') {
      effectiveStrength = 'low'
      aspirational = true
      parallaxCapReason = 'single_context_parallax_cap'
    }

    // ── phase 3: structural reinforces (A5) ──
    // Most-recent non-forgotten entry on the same VIPS page (dimension)
    // sharing the canonical claim id. Sort by committed_at desc.
    const reinforcesCandidates = nonForgotten
      .filter(
        (e) =>
          e.dimension === entry.dimension &&
          e.canonical_claim_id === entry.canonical_claim_id,
      )
      .sort((a, b) => (a.committed_at < b.committed_at ? 1 : a.committed_at > b.committed_at ? -1 : 0))
    const reinforcesId = reinforcesCandidates[0]?.id ?? null

    const annotated: VerifierAnnotatedEntry = {
      ...entry,
      strength: effectiveStrength,
      reinforces_id: reinforcesId,
      partial_match: partialMatch,
      aspirational,
      parallax_cap_reason: parallaxCapReason,
    }

    if (partialMatch) downgraded.push(annotated)
    else admitted.push(annotated)
  }

  return { admitted, downgraded, dropped }
}
