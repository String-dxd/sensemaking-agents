/**
 * Relationships state slice — unit coverage for U4 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import Relationships from '~/engine/student-space/Game/State/Relationships.js'

function expectPresent<T>(value: T | null | undefined): T {
  expect(value).toBeDefined()
  if (value === null || value === undefined) throw new Error('Expected value to be present')
  return value
}

function freshPersistence() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Relationships as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Relationships as unknown as { instance: unknown }).instance = null
})

describe('Relationships state slice', () => {
  let rel: Relationships

  beforeEach(() => {
    freshPersistence()
    rel = new Relationships()
  })

  it('addPerson creates entry with id and createdAt, fires subscriber', () => {
    const events: unknown[] = []
    rel.subscribe((e) => events.push(e))
    const entry = rel.addPerson({ name: 'Mr. Tan', category: 'teacher', quality: 'rely-on' })
    expect(entry).toBeTruthy()
    expect(entry?.name).toBe('Mr. Tan')
    expect(entry?.category).toBe('teacher')
    expect(entry?.quality).toBe('rely-on')
    expect(entry?.id).toMatch(/^rel_/)
    expect(rel.listMap()).toHaveLength(1)
    expect(events.some((e) => (e as { kind?: string }).kind === 'map:add')).toBe(true)
  })

  it('addPerson with empty name returns null and does not mutate', () => {
    const entry = rel.addPerson({ name: '   ', category: 'family' })
    expect(entry).toBeNull()
    expect(rel.listMap()).toHaveLength(0)
  })

  it('removePerson by id removes the entry; unknown id is no-op', () => {
    const a = expectPresent(rel.addPerson({ name: 'A', category: 'cca' }))
    rel.addPerson({ name: 'B', category: 'cca' })
    expect(rel.removePerson(a.id)).toBe(a.id)
    expect(rel.listMap()).toHaveLength(1)
    expect(rel.removePerson('does-not-exist')).toBeNull()
    expect(rel.listMap()).toHaveLength(1)
  })

  it('addBelonging creates entry with default level "participate"', () => {
    const entry = rel.addBelonging({ groupKind: 'cca', groupName: 'Robotics' })
    expect(entry?.belongLevel).toBe('participate')
    expect(rel.listBelonging()).toHaveLength(1)
  })

  it('addPerspective requires non-empty observation', () => {
    expect(rel.addPerspective({ source: 'peer', observation: '' })).toBeNull()
    expect(
      rel.addPerspective({ source: 'peer', observation: 'You explain things calmly' }),
    ).toBeTruthy()
    expect(rel.listPerspectives()).toHaveLength(1)
  })

  it('hydrate(null) applies the demo seed corpus and does not throw', () => {
    // Fresh boot (Persistence.load() returns relationships: null) falls back to
    // the seed corpus so the demo Relationships tab is populated.
    expect(() => rel.hydrate(null)).not.toThrow()
    expect(rel.listMap().length).toBeGreaterThan(0)
    expect(rel.listBelonging().length).toBeGreaterThan(0)
    expect(rel.listPerspectives().length).toBeGreaterThan(0)
  })

  it('hydrate(explicit empty) leaves slice empty — a cleared state does not resurrect the seed', () => {
    rel.hydrate({ map: [], belonging: [], perspectives: [] })
    expect(rel.listMap()).toHaveLength(0)
    expect(rel.listBelonging()).toHaveLength(0)
    expect(rel.listPerspectives()).toHaveLength(0)
  })

  it('hydrate drops malformed entries but keeps well-formed ones', () => {
    rel.hydrate({
      map: [
        { id: 'rel_1', name: 'OK', category: 'family', createdAt: new Date().toISOString() },
        { id: 'rel_2', name: '', category: 'family', createdAt: new Date().toISOString() }, // bad name
        null, // not an object
      ],
      belonging: [
        {
          id: 'b_1',
          groupKind: 'cca',
          groupName: 'Drama',
          belongLevel: 'belong',
          createdAt: new Date().toISOString(),
        },
      ],
      perspectives: [
        {
          id: 'p_1',
          source: 'peer',
          observation: 'kind',
          agreementSelf: 'matches',
          createdAt: new Date().toISOString(),
        },
      ],
    } as unknown as Parameters<typeof rel.hydrate>[0])
    expect(rel.listMap()).toHaveLength(1)
    expect(rel.listMap()[0]?.name).toBe('OK')
    expect(rel.listBelonging()).toHaveLength(1)
    expect(rel.listPerspectives()).toHaveLength(1)
  })

  it('snapshot from listMap after no mutation returns the same array reference', () => {
    rel.addPerson({ name: 'A', category: 'family' })
    const a = rel.listMap()
    const b = rel.listMap()
    expect(a).toBe(b)
  })

  it('subscribe→add→subscribe-callback is invoked; throwing subscriber does not abort fan-out', () => {
    const calls: string[] = []
    rel.subscribe(() => {
      throw new Error('boom')
    })
    rel.subscribe(() => calls.push('ok'))
    rel.addPerson({ name: 'X', category: 'other' })
    expect(calls).toEqual(['ok'])
  })

  it('serialize → hydrate round-trip preserves entries', () => {
    rel.addPerson({ name: 'Mum', category: 'family', quality: 'mutual' })
    rel.addBelonging({ groupKind: 'cca', groupName: 'Robotics', belongLevel: 'belong' })
    rel.addPerspective({ source: 'teacher', observation: 'patient with younger peers' })
    const snapshot = rel.serialize()

    ;(Relationships as unknown as { instance: unknown }).instance = null
    const fresh = new Relationships()
    fresh.hydrate(snapshot)
    expect(fresh.listMap()).toHaveLength(1)
    expect(fresh.listMap()[0]?.name).toBe('Mum')
    expect(fresh.listBelonging()[0]?.groupName).toBe('Robotics')
    expect(fresh.listPerspectives()[0]?.observation).toBe('patient with younger peers')
  })
})
