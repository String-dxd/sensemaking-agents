import { describe, expect, it } from 'vitest'

import * as elementEvidence from '~/engine/student-space/Game/View/elementEvidence.js'

const { evidenceCountText, latestEvidenceLine, metaphorLine, resolveElementEvidence } =
  elementEvidence

describe('Student Space island element evidence resolver', () => {
  it('maps an interest flower species to its canonical backend claim', () => {
    const evidence = resolveElementEvidence(
      { kind: 'flower', species: { id: 'pansy' } },
      profileWithQuotes({}),
    )

    expect(evidence).toMatchObject({
      facetId: 'interests',
      claimId: 'interests.investigative',
      claimLabel: 'Investigative',
      speciesId: 'pansy',
      evidenceCount: 0,
      hasEvidence: false,
    })
    expect(metaphorLine(evidence)).toContain('Pansy')
    expect(metaphorLine(evidence)).toContain('Investigative')
  })

  it('returns latest backend evidence for a resolved claim', () => {
    const evidence = resolveElementEvidence(
      { kind: 'flower', species: { id: 'pansy' } },
      profileWithQuotes({
        'interests.investigative': [
          quote(
            'timeline:old',
            'I like figuring out how experiments work.',
            '2026-05-17T08:00:00Z',
          ),
          quote(
            'timeline:new',
            'I kept testing until the pattern made sense.',
            '2026-05-18T08:00:00Z',
          ),
        ],
      }),
    )

    expect(evidence.evidenceCount).toBe(2)
    expect(evidence.latestQuoteId).toBe('timeline:new')
    expect(evidence.backendTimelineEntryId).toBe(18)
    expect(evidenceCountText(evidence)).toBe('2 noticings')
    expect(latestEvidenceLine(evidence)).toContain('I kept testing')
  })

  it('keeps empty claims honest instead of fabricating evidence', () => {
    const evidence = resolveElementEvidence(
      { kind: 'fruit', species: 'fig' },
      profileWithQuotes({}),
    )

    expect(evidence).toMatchObject({
      facetId: 'skills',
      claimId: 'skills.interpersonal',
      claimLabel: 'Interpersonal',
      evidenceCount: 0,
      latestQuoteText: '',
    })
    expect(evidenceCountText(evidence)).toBe('No noticings yet.')
    expect(latestEvidenceLine(evidence)).toBe('No noticings yet.')
  })
})

function profileWithQuotes(quotesByClaim: Record<string, unknown[]>) {
  return {
    getQuotesForClaim: (claimId: string) => quotesByClaim[claimId] ?? [],
  }
}

function quote(id: string, text: string, createdAt: string) {
  return {
    id,
    text,
    createdAt,
    sourceCaptureId: 'mirror:24',
    backendTimelineEntryId: Number(createdAt.slice(8, 10)),
  }
}
