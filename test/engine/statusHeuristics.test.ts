/**
 * Coverage for the CCE identity-status classifier
 * (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).
 *
 * Pins the five-status routing (starter / diffused / searching /
 * foreclosed / achieved) and the threshold boundaries spelled out in
 * the plan's Key Technical Decision #3.
 */
import { describe, expect, it } from 'vitest'
import {
  statusCopyOf,
  statusFor,
  statusLabelOf,
} from '~/engine/student-space/Game/View/statusHeuristics.js'

type Confidence = 'low' | 'medium' | 'high'
type Facets = Record<
  string,
  { quotes: Array<{ canonicalClaimId?: string; confidence?: Confidence }> }
>

function facetsWithClaims(claims: Array<{ id: string; confidence?: Confidence }>): Facets {
  // One facet, many quotes — distinct-claim count is what matters for the
  // exploration score, so we pile claims into a single bucket.
  return {
    values: {
      quotes: claims.map((c) => ({
        canonicalClaimId: c.id,
        confidence: c.confidence ?? 'medium',
      })),
    },
  }
}

const ASK_CAPTURE = { kind: 'ask' } as const

describe('statusFor', () => {
  it('returns "starter" when there is no profile evidence or commitment at all', () => {
    const audit = statusFor({
      facets: {},
      captures: [],
      decisions: [],
      intentions: [],
      dominantPatternTag: null,
    })
    expect(audit.status).toBe('starter')
    expect(audit.exploration.score).toBe(0)
    expect(audit.commitment.score).toBe(0)
    expect(audit.reason).toMatch(/nothing in the profile yet/i)
  })

  it('returns "diffused" when both axes have a little signal but neither crosses its high threshold', () => {
    const audit = statusFor({
      // 1 distinct claim + 1 ask = 1 + 0.5 = 1.5 → low band (< 2)
      facets: facetsWithClaims([{ id: 'interests.social' }]),
      captures: [ASK_CAPTURE],
      // 1 decision = 1 → low band (< 2)
      decisions: [{ id: 'd1' }],
      intentions: [],
      dominantPatternTag: null,
    })
    expect(audit.status).toBe('diffused')
    expect(audit.exploration.band).toBe('low')
    expect(audit.commitment.band).toBe('low')
  })

  it('returns "searching" when exploration is high but commitment is low', () => {
    const audit = statusFor({
      // 5 distinct claims = score 5 → high band
      facets: facetsWithClaims([
        { id: 'interests.social' },
        { id: 'values.contribution' },
        { id: 'skills.communication' },
        { id: 'personality.openness' },
        { id: 'interests.investigative' },
      ]),
      captures: [ASK_CAPTURE, ASK_CAPTURE],
      decisions: [],
      intentions: [],
      dominantPatternTag: null,
    })
    expect(audit.status).toBe('searching')
    expect(audit.exploration.band).toBe('high')
    expect(audit.commitment.band).toBe('low')
  })

  it('returns "foreclosed" when commitment is high but exploration is not yet high', () => {
    const audit = statusFor({
      // 1 claim only → low exploration
      facets: facetsWithClaims([{ id: 'interests.social' }]),
      captures: [],
      // 2 intentions = 2 × 1.5 = 3 → high commitment
      decisions: [],
      intentions: [{ id: 'i1' }, { id: 'i2' }],
      dominantPatternTag: null,
    })
    expect(audit.status).toBe('foreclosed')
    expect(audit.exploration.band).not.toBe('high')
    expect(audit.commitment.band).toBe('high')
  })

  it('returns "foreclosed" when exploration is "emerging" (not yet high) but commitment is high', () => {
    // Emerging = 2 ≤ score < 4. Verifies the Marcia binary collapse: emerging
    // groups with low for the 2×2 quadrant calc.
    const audit = statusFor({
      facets: facetsWithClaims([
        { id: 'interests.social' },
        { id: 'values.contribution' },
        { id: 'skills.communication' },
      ]),
      captures: [],
      decisions: [{ id: 'd1' }, { id: 'd2' }],
      intentions: [],
      dominantPatternTag: 'deliberate',
    })
    expect(audit.exploration.band).toBe('emerging')
    expect(audit.commitment.band).toBe('high')
    expect(audit.status).toBe('foreclosed')
  })

  it('returns "achieved" when both axes are high', () => {
    const audit = statusFor({
      facets: facetsWithClaims([
        { id: 'interests.social' },
        { id: 'values.contribution' },
        { id: 'skills.communication' },
        { id: 'personality.openness' },
      ]),
      captures: [ASK_CAPTURE, ASK_CAPTURE],
      decisions: [{ id: 'd1' }],
      intentions: [{ id: 'i1' }, { id: 'i2' }],
      dominantPatternTag: 'deliberate',
    })
    expect(audit.status).toBe('achieved')
    expect(audit.exploration.band).toBe('high')
    expect(audit.commitment.band).toBe('high')
  })

  it('treats a single Cartographer backend trajectory as a strong exploration signal (+4)', () => {
    // No claims, no asks — only a backend Cartographer reading. Score = 4
    // crosses EXPLORATION_HIGH; a regression to +3 would silently misclassify
    // a backend-active student as `diffused`, so we pin the exact value.
    const audit = statusFor({
      facets: {},
      captures: [
        {
          kind: 'trajectory',
          backendCartographerOutputId: 'cgo_42',
        },
      ],
      decisions: [],
      intentions: [],
      dominantPatternTag: null,
    })
    expect(audit.exploration.inputs.hasBackendCartographer).toBe(true)
    expect(audit.exploration.score).toBe(4)
    expect(audit.exploration.band).toBe('high')
    expect(audit.status).toBe('searching')
  })

  it('does not flip to "starter" just because one axis is zero (both must be zero)', () => {
    // Commitment is fully zero, but a single decision should still push us out
    // of starter into one of the Marcia quadrants.
    const audit = statusFor({
      facets: facetsWithClaims([{ id: 'interests.social' }]),
      captures: [],
      decisions: [],
      intentions: [],
      dominantPatternTag: null,
    })
    expect(audit.status).not.toBe('starter')
  })

  it('exposes audit inputs so callers can show why a status was chosen', () => {
    const audit = statusFor({
      facets: facetsWithClaims([{ id: 'interests.social' }, { id: 'values.contribution' }]),
      captures: [ASK_CAPTURE, ASK_CAPTURE],
      decisions: [{ id: 'd1' }],
      intentions: [{ id: 'i1' }],
      dominantPatternTag: 'deliberate',
    })
    expect(audit.exploration.inputs.distinctClaims).toBe(2)
    expect(audit.exploration.inputs.askCount).toBe(2)
    expect(audit.commitment.inputs.decisionCount).toBe(1)
    expect(audit.commitment.inputs.intentionCount).toBe(1)
    expect(audit.commitment.inputs.dominantPatternTag).toBe('deliberate')
    expect(audit.reason).toMatch(/2 VIPS claims/)
  })
})

describe('statusLabelOf', () => {
  it('returns CCE-doc wording for each status', () => {
    expect(statusLabelOf('starter')).toBe('Just getting started')
    expect(statusLabelOf('diffused')).toBe('Diffused')
    expect(statusLabelOf('searching')).toBe('Searching')
    expect(statusLabelOf('foreclosed')).toBe('Foreclosed')
    expect(statusLabelOf('achieved')).toBe('Achieved')
  })
})

describe('statusCopyOf', () => {
  it('personalises the starter title when an identity name is provided', () => {
    const copy = statusCopyOf('starter', { name: 'Alice' })
    expect(copy.title).toMatch(/Alice/)
  })

  it('falls back gracefully without a name', () => {
    const copy = statusCopyOf('starter', null)
    expect(copy.title).not.toMatch(/undefined/)
    expect(copy.title).toMatch(/let's find your bearings/i)
  })

  it('returns distinct lead copy per status', () => {
    const leads = ['starter', 'diffused', 'searching', 'foreclosed', 'achieved'].map(
      (s) => statusCopyOf(s, null).lead,
    )
    const uniq = new Set(leads)
    expect(uniq.size).toBe(leads.length)
  })

  it('returns a non-empty TLDR for every Marcia status', () => {
    const tldrs = ['starter', 'diffused', 'searching', 'foreclosed', 'achieved'].map(
      (s) => statusCopyOf(s, null).tldr,
    )
    expect(tldrs.every((t) => typeof t === 'string' && t.length > 0)).toBe(true)
    // TLDR copy is distinct per status (so the cold-open carries real signal).
    const uniq = new Set(tldrs)
    expect(uniq.size).toBe(tldrs.length)
  })

  it('TLDR is meaningfully shorter than the lead paragraph', () => {
    const statuses = ['searching', 'foreclosed', 'achieved'] as const
    for (const s of statuses) {
      const copy = statusCopyOf(s, null)
      expect(copy.tldr.length).toBeLessThan(copy.lead.length)
    }
  })
})
