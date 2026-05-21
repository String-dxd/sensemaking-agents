/**
 * Choices state slice — unit coverage for U4 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Choices from '~/engine/student-space/Game/State/Choices.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'

function expectPresent<T>(value: T | null | undefined): T {
  expect(value).toBeDefined()
  if (value === null || value === undefined) throw new Error('Expected value to be present')
  return value
}

function freshPersistence() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Choices as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Choices as unknown as { instance: unknown }).instance = null
})

describe('Choices state slice', () => {
  let choices: Choices

  beforeEach(() => {
    freshPersistence()
    choices = new Choices()
  })

  it('addDecision requires a non-empty decision headline', () => {
    expect(choices.addDecision({ decision: '' })).toBeNull()
    expect(choices.addDecision({ decision: '   ' })).toBeNull()
    expect(choices.addDecision({ decision: 'CCA captain' })).toBeTruthy()
    expect(choices.listDecisions()).toHaveLength(1)
  })

  it('addDecision stores forces and options as filtered arrays', () => {
    const entry = choices.addDecision({
      decision: 'Subject combo',
      options: ['A levels triple sci', 'A levels arts', 123 as unknown as string],
      chose: 'A levels arts',
      forces: ['values', 'family', 'not-a-force' as unknown as 'values'],
      when: 'Sec 4 Q3',
    })
    expect(entry?.options).toEqual(['A levels triple sci', 'A levels arts'])
    expect(entry?.forces).toEqual(['values', 'family', 'not-a-force'])
    // schema-level filtering happens in the merger; the slice itself stores
    // what is passed (the merger guards persistence).
  })

  it('tagDecisionPattern rejects unknown tags and accepts valid ones', () => {
    const entry = expectPresent(choices.addDecision({ decision: 'X' }))
    expect(choices.tagDecisionPattern(entry.id, 'made-up' as never)).toBeNull()
    const tagged = choices.tagDecisionPattern(entry.id, 'deliberate')
    expect(tagged?.patternTag).toBe('deliberate')
  })

  it('dominantPatternTag returns null with zero tagged entries', () => {
    choices.addDecision({ decision: 'A' })
    choices.addDecision({ decision: 'B' })
    expect(choices.dominantPatternTag()).toBeNull()
  })

  it('dominantPatternTag returns null when top two tags tie', () => {
    const a = expectPresent(choices.addDecision({ decision: 'A' }))
    const b = expectPresent(choices.addDecision({ decision: 'B' }))
    choices.tagDecisionPattern(a.id, 'avoidant')
    choices.tagDecisionPattern(b.id, 'deliberate')
    expect(choices.dominantPatternTag()).toBeNull()
  })

  it('dominantPatternTag returns the strict winner when one tag leads', () => {
    const a = expectPresent(choices.addDecision({ decision: 'A' }))
    const b = expectPresent(choices.addDecision({ decision: 'B' }))
    const c = expectPresent(choices.addDecision({ decision: 'C' }))
    choices.tagDecisionPattern(a.id, 'deliberate')
    choices.tagDecisionPattern(b.id, 'deliberate')
    choices.tagDecisionPattern(c.id, 'avoidant')
    expect(choices.dominantPatternTag()).toBe('deliberate')
  })

  it('patternCounts surfaces zero for untouched tags', () => {
    const a = expectPresent(choices.addDecision({ decision: 'A' }))
    choices.tagDecisionPattern(a.id, 'deliberate')
    expect(choices.patternCounts()).toEqual({ avoidant: 0, impulsive: 0, deliberate: 1 })
  })

  it('addChangeIntention requires a non-empty change field', () => {
    expect(choices.addChangeIntention({ change: '' })).toBeNull()
    expect(choices.addChangeIntention({ change: 'Pause one beat before answering' })).toBeTruthy()
    expect(choices.listIntentions()).toHaveLength(1)
  })

  it('removeDecision removes by id and is no-op on unknown id', () => {
    const a = expectPresent(choices.addDecision({ decision: 'A' }))
    expect(choices.removeDecision(a.id)).toBe(a.id)
    expect(choices.removeDecision('nope')).toBeNull()
    expect(choices.listDecisions()).toHaveLength(0)
  })

  it('hydrate(null) leaves slice empty and does not throw', () => {
    expect(() => choices.hydrate(null)).not.toThrow()
    expect(choices.listDecisions()).toHaveLength(0)
    expect(choices.listIntentions()).toHaveLength(0)
  })

  it('serialize → hydrate round-trip preserves entries and pattern tags', () => {
    const d = expectPresent(
      choices.addDecision({
        decision: 'CCA captain',
        chose: 'declined',
        forces: ['peer-acceptance'],
      }),
    )
    choices.tagDecisionPattern(d.id, 'avoidant')
    choices.addChangeIntention({
      current: 'I avoid',
      change: 'I will name my hesitation',
      linkedPatternTag: 'avoidant',
    })
    const snapshot = choices.serialize()

    ;(Choices as unknown as { instance: unknown }).instance = null
    const fresh = new Choices()
    fresh.hydrate(snapshot)
    expect(fresh.listDecisions()).toHaveLength(1)
    expect(fresh.listDecisions()[0]?.patternTag).toBe('avoidant')
    expect(fresh.listIntentions()).toHaveLength(1)
    expect(fresh.listIntentions()[0]?.linkedPatternTag).toBe('avoidant')
  })

  it('list accessors return referentially stable arrays between mutations', () => {
    choices.addDecision({ decision: 'A' })
    const a = choices.listDecisions()
    const b = choices.listDecisions()
    expect(a).toBe(b)
  })

  it('throwing subscriber does not abort fan-out', () => {
    const calls: string[] = []
    choices.subscribe(() => {
      throw new Error('boom')
    })
    choices.subscribe(() => calls.push('ok'))
    choices.addDecision({ decision: 'X' })
    expect(calls).toEqual(['ok'])
  })
})
