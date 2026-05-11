/**
 * U6 — Deterministic verifier (`src/agents/verifier.ts`).
 *
 * Test-first per the plan's Execution note. The AE7 calibration pair is the
 * structural reason this unit exists; if either side regresses, the test name
 * makes it loud.
 */
import { describe, expect, it } from 'vitest'
import type {
  ProposedTimelineEntryDraft,
  VerifierExistingTimelineEntry,
  VerifierMirrorEntry,
} from '~/agents/tools/schemas'
import { ProposedTimelineEntryDraftSchema, VerifierResultSchema } from '~/agents/tools/schemas'
import { verifyProposedDiff } from '~/agents/verifier'

// ── fixtures ──────────────────────────────────────────────────────────────
const baseMirror: VerifierMirrorEntry = {
  id: 101,
  transcript: 'i hated when teacher told us exactly what to do',
  context_type: 'school',
}

function draft(overrides: Partial<ProposedTimelineEntryDraft> = {}): ProposedTimelineEntryDraft {
  return {
    dimension: 'values',
    canonical_claim_id: 'V.SELF_DIRECTION',
    verbatim_quote: 'i hated when teacher told us exactly what to do',
    reflection_id: 101,
    strength: 'medium',
    parallax_tag: ['school'],
    ...overrides,
  }
}

// ── AE7 calibration pair (LOCKED) ─────────────────────────────────────────
describe('AE7 calibration pair (LOCKED) — honest-paraphrase admit, fabricated-quote drop', () => {
  it('AE7: full normalized match → admitted at proposed strength', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({ verbatim_quote: 'i hated when teacher told us exactly what to do' }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.admitted).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
    expect(result.admitted[0]?.strength).toBe('medium')
    expect(result.admitted[0]?.partial_match).toBe(false)
    expect(result.admitted[0]?.aspirational).toBe(false)
  })

  it('AE7: fabricated paraphrase ("I really hated being told what to do in class") → dropped with no_quote_match', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({ verbatim_quote: 'I really hated being told what to do in class' }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.admitted).toHaveLength(0)
    expect(result.downgraded).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]?.reason).toBe('no_quote_match')
  })
})

// ── quote-match phase ─────────────────────────────────────────────────────
describe('quote match (R10)', () => {
  it('punctuation-only difference is admitted (normalization strips punctuation)', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({ verbatim_quote: 'I hated when teacher told us exactly what to do.' }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.admitted).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
  })

  it('capitalization-only difference is admitted', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({ verbatim_quote: 'I HATED WHEN TEACHER TOLD US EXACTLY WHAT TO DO' }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.admitted).toHaveLength(1)
  })

  it('80%-token-contiguous-subsequence → downgraded to strength=low, partial_match=true', () => {
    // Transcript: i hated when teacher told us exactly what to do
    // Quote: "when teacher told us exactly homework" — 6 tokens, first 5
    // contiguous in transcript ("when teacher told us exactly"), last token
    // fabricated → longest-contiguous ratio 5/6 ≈ 83% → downgrade.
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({
            verbatim_quote: 'when teacher told us exactly homework',
            strength: 'high',
          }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.downgraded).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
    expect(result.downgraded[0]?.strength).toBe('low')
    expect(result.downgraded[0]?.partial_match).toBe(true)
  })

  it('60%-token-contiguous-subsequence → dropped (below threshold)', () => {
    // Quote: "i hated about politics yesterday" — longest contiguous run in
    // transcript is "i hated" (2 of 5 tokens) → 0.4 → drop.
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ verbatim_quote: 'i hated about politics yesterday' })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]?.reason).toBe('no_quote_match')
  })
})

// ── AE7-adjacent calibration suite: 0.8 partial-match threshold pin ────────
// These tests *pin* the planning-time threshold bet from verifier.ts
// (`PARTIAL_MATCH_THRESHOLD = 0.8`). Don't change them as a side effect of
// other refactors; the threshold itself is a separate decision. If you
// re-tune the threshold, retune these expectations in the same commit so
// reviewers see the bet explicitly. (Finding #14 / #19.)
describe('verifier partial-match threshold (0.8) — AE7-adjacent calibration', () => {
  // Transcript: "i hated when teacher told us exactly what to do" (10 tokens).
  // We construct quotes whose longest-contiguous-token run is a known
  // fraction of the quote-length.

  it('at-threshold: 80% contiguous overlap → downgraded to strength=low, partial_match=true', () => {
    // 5-token quote: "teacher told us exactly tomorrow". First 4 tokens
    // ("teacher told us exactly") are a contiguous run in the transcript;
    // the last token is fabricated. 4 / 5 = 0.8 → at threshold → downgrade.
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({
            verbatim_quote: 'teacher told us exactly tomorrow',
            strength: 'high',
          }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.downgraded).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
    expect(result.downgraded[0]?.partial_match).toBe(true)
    expect(result.downgraded[0]?.strength).toBe('low')
  })

  it('just-below-threshold: 75% contiguous overlap → dropped with no_quote_match', () => {
    // 4-token quote: "told us exactly tomorrow". First 3 contiguous in
    // transcript; 3 / 4 = 0.75 → below 0.8 → drop. (The plan's "79% drops"
    // is the boundary intent — we pin 0.75 because the math lands cleanly
    // on the discrete token count, and any ratio in [0, 0.8) drops by the
    // same `>=` rule.)
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ verbatim_quote: 'told us exactly tomorrow' })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.dropped).toHaveLength(1)
    expect(result.downgraded).toHaveLength(0)
    expect(result.dropped[0]?.reason).toBe('no_quote_match')
  })

  it('well-above-threshold: 90% contiguous overlap → downgraded, partial_match=true', () => {
    // 10-token quote, first 9 contiguous in transcript, 10th fabricated.
    // 9 / 10 = 0.9 ≥ 0.8 → downgrade. Confirms the threshold is a one-sided
    // gate and not a narrow band.
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({
            verbatim_quote: 'i hated when teacher told us exactly what to homework',
            strength: 'high',
          }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.downgraded).toHaveLength(1)
    expect(result.downgraded[0]?.partial_match).toBe(true)
    expect(result.downgraded[0]?.strength).toBe('low')
  })
})

// ── parallax cap (R11) ────────────────────────────────────────────────────
function existingEntry(
  overrides: Partial<VerifierExistingTimelineEntry> = {},
): VerifierExistingTimelineEntry {
  return {
    id: 1,
    dimension: 'values',
    canonical_claim_id: 'V.SELF_DIRECTION',
    parallax_tag: ['school'],
    forgotten_at: null,
    committed_at: '2026-05-01 10:00:00',
    ...overrides,
  }
}

describe('parallax cap (R11)', () => {
  it('single-context same-claim history + proposed strength=high → capped to low + aspirational=true', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({
            strength: 'high',
            parallax_tag: ['school'],
          }),
        ],
      },
      mirrorEntry: { ...baseMirror, context_type: 'school' },
      existingTimelineEntries: [
        existingEntry({ id: 11, parallax_tag: ['school'] }),
        existingEntry({ id: 12, parallax_tag: ['school'] }),
      ],
    })
    expect(result.admitted).toHaveLength(1)
    expect(result.admitted[0]?.strength).toBe('low')
    expect(result.admitted[0]?.aspirational).toBe(true)
    expect(result.admitted[0]?.parallax_cap_reason).toBe('single_context_parallax_cap')
  })

  it('multi-context history (school + peer) → strength=high preserved', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({
            strength: 'high',
            parallax_tag: ['school'],
          }),
        ],
      },
      mirrorEntry: { ...baseMirror, context_type: 'school' },
      existingTimelineEntries: [
        existingEntry({ id: 11, parallax_tag: ['school'] }),
        existingEntry({ id: 12, parallax_tag: ['peer'] }),
      ],
    })
    expect(result.admitted).toHaveLength(1)
    expect(result.admitted[0]?.strength).toBe('high')
    expect(result.admitted[0]?.aspirational).toBe(false)
  })

  it('non-high strength is never capped even with single-context history', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ strength: 'medium', parallax_tag: ['school'] })],
      },
      mirrorEntry: { ...baseMirror, context_type: 'school' },
      existingTimelineEntries: [existingEntry({ parallax_tag: ['school'] })],
    })
    expect(result.admitted[0]?.strength).toBe('medium')
    expect(result.admitted[0]?.aspirational).toBe(false)
  })
})

// ── structural reinforces (A5) ────────────────────────────────────────────
describe('structural reinforces (A5)', () => {
  it('one prior non-forgotten same-page same-claim entry → reinforces_id = that entry', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ dimension: 'values', canonical_claim_id: 'V.SELF_DIRECTION' })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [
        existingEntry({
          id: 77,
          dimension: 'values',
          canonical_claim_id: 'V.SELF_DIRECTION',
          forgotten_at: null,
        }),
      ],
    })
    expect(result.admitted).toHaveLength(1)
    expect(result.admitted[0]?.reinforces_id).toBe(77)
  })

  it('only prior entry is forgotten → reinforces_id = null (R19 filter)', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ dimension: 'values', canonical_claim_id: 'V.SELF_DIRECTION' })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [
        existingEntry({
          id: 77,
          dimension: 'values',
          canonical_claim_id: 'V.SELF_DIRECTION',
          forgotten_at: '2026-05-02 09:00:00',
        }),
      ],
    })
    expect(result.admitted).toHaveLength(1)
    expect(result.admitted[0]?.reinforces_id).toBe(null)
  })

  it('picks most-recent non-forgotten by committed_at desc', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ dimension: 'values', canonical_claim_id: 'V.SELF_DIRECTION' })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [
        existingEntry({
          id: 50,
          canonical_claim_id: 'V.SELF_DIRECTION',
          committed_at: '2026-05-01 09:00:00',
        }),
        existingEntry({
          id: 51,
          canonical_claim_id: 'V.SELF_DIRECTION',
          committed_at: '2026-05-03 09:00:00',
        }),
        existingEntry({
          id: 52,
          canonical_claim_id: 'V.SELF_DIRECTION',
          committed_at: '2026-05-02 09:00:00',
        }),
      ],
    })
    expect(result.admitted[0]?.reinforces_id).toBe(51)
  })

  it('ignores entries on a different dimension or different canonical claim id', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ dimension: 'values', canonical_claim_id: 'V.SELF_DIRECTION' })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [
        existingEntry({ id: 60, dimension: 'interests', canonical_claim_id: 'V.SELF_DIRECTION' }),
        existingEntry({ id: 61, dimension: 'values', canonical_claim_id: 'V.OTHER' }),
      ],
    })
    expect(result.admitted[0]?.reinforces_id).toBe(null)
  })
})

// ── error path ────────────────────────────────────────────────────────────
describe('error path', () => {
  it('cited reflection_id ≠ mirrorEntry.id → entry dropped, reason unknown_reflection', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [draft({ reflection_id: 9999 })],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [],
    })
    expect(result.admitted).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]?.reason).toBe('unknown_reflection')
  })
})

// ── schema & integration shape ────────────────────────────────────────────
describe('schema & integration shape', () => {
  it('annotated VerifierResult parses against VerifierResultSchema', () => {
    const result = verifyProposedDiff({
      diff: {
        timeline_entries: [
          draft({ verbatim_quote: 'i hated when teacher told us exactly what to do' }),
          draft({
            verbatim_quote: 'when teacher told us exactly what to do',
            strength: 'high',
          }),
          draft({ verbatim_quote: 'this quote does not appear anywhere' }),
        ],
      },
      mirrorEntry: baseMirror,
      existingTimelineEntries: [
        existingEntry({
          id: 200,
          canonical_claim_id: 'V.SELF_DIRECTION',
          parallax_tag: ['peer'],
        }),
      ],
    })
    const parsed = VerifierResultSchema.parse(result)
    expect(parsed.admitted.length + parsed.downgraded.length + parsed.dropped.length).toBe(3)
  })

  it('ProposedTimelineEntryDraftSchema parses a representative draft', () => {
    expect(() => ProposedTimelineEntryDraftSchema.parse(draft())).not.toThrow()
  })
})
