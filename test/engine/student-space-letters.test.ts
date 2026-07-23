/**
 * Coverage for the Letters → Capture state-layer flow:
 *   - TeacherLetters.hydrateBackend union-merge (backend wins on shared id;
 *     seed-only letters survive an empty/missing backend snapshot).
 *   - schema.mergeCapture round-trip for `letterId`.
 *   - schema.mergeTeacherLetter round-trip for `prompt`.
 *
 * The LettersSheet.open({ letterId }) deep-link tests moved to the React
 * component test at `test/components/student-space/sheets/letters-sheet.test.tsx`
 * after the U3 migration replaced the engine sheet with a React route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import { mergeCapture, mergeTeacherLetter } from '~/engine/student-space/Game/State/schema.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import TeacherLetters from '~/engine/student-space/Game/State/TeacherLetters.js'

function freshSingletons() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(TeacherLetters as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(TeacherLetters as unknown as { instance: unknown }).instance = null
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
})

describe('schema — letterId / prompt key admission', () => {
  it('mergeCapture preserves letterId when it is a string', () => {
    const out = mergeCapture(
      {
        id: 'cap_1',
        createdAt: '2026-05-21T09:00:00.000Z',
        entryDate: '2026-05-21',
        kind: 'ask',
        text: 'three moments',
        letterId: 'lt_camp_reflect',
      },
      'capture',
    )
    expect(out).not.toBeNull()
    expect(out.letterId).toBe('lt_camp_reflect')
  })

  it('mergeCapture preserves the Mirror validation line', () => {
    const out = mergeCapture(
      {
        id: 'cap_v',
        createdAt: '2026-05-21T09:00:00.000Z',
        entryDate: '2026-05-21',
        kind: 'ask',
        text: 'three moments',
        validation: 'That sounds like it mattered.',
      },
      'capture',
    )
    expect(out).not.toBeNull()
    expect(out.validation).toBe('That sounds like it mattered.')
  })

  it('mergeCapture rejects non-string letterId and drops the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = mergeCapture(
      {
        id: 'cap_2',
        createdAt: '2026-05-21T09:00:00.000Z',
        entryDate: '2026-05-21',
        kind: 'ask',
        text: 'x',
        letterId: 42 as unknown as string,
      },
      'capture',
    )
    expect(out).not.toBeNull()
    expect(out.letterId).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('mergeTeacherLetter preserves prompt', () => {
    const out = mergeTeacherLetter(
      {
        id: 'lt_camp_reflect',
        from: 'Mr. Tan',
        subject: 'After Sec 2 camp',
        body: 'body',
        sentAt: '2026-05-21T09:00:00.000Z',
        read: false,
        prompt: 'What are three moments?',
      },
      'letter',
    )
    expect(out).not.toBeNull()
    expect(out.prompt).toBe('What are three moments?')
  })
})

describe('TeacherLetters.hydrateBackend — union-merge semantics', () => {
  beforeEach(() => {
    freshSingletons()
  })

  it('preserves seed-only letters when the backend snapshot omits them', () => {
    const letters = new TeacherLetters()
    const seedIds = new Set(letters.letters.map((l: { id: string }) => l.id))
    expect(seedIds.size).toBeGreaterThan(0)

    // Backend echoes a single letter that is NOT in the seed set.
    letters.hydrateBackend([
      {
        id: 'demo-shell:s1:letter-pattern',
        from: 'Mr. Tan',
        subject: 'A pattern',
        body: 'body',
        sentAt: '2026-05-20T08:00:00.000Z',
        read: false,
      },
    ])

    const ids = letters.letters.map((l: { id: string }) => l.id)
    for (const seedId of seedIds) expect(ids).toContain(seedId)
    expect(ids).toContain('demo-shell:s1:letter-pattern')
  })

  it('backend wins on shared id (later subject overrides seed subject)', () => {
    const letters = new TeacherLetters()
    const seedId = letters.letters[0].id
    const originalSubject = letters.letters[0].subject

    letters.hydrateBackend([
      {
        id: seedId,
        from: 'Mr. Tan',
        subject: 'Overridden by backend',
        body: 'b',
        sentAt: '2026-05-21T09:00:00.000Z',
        read: true,
      },
    ])

    const matched = letters.letters.find((l: { id: string }) => l.id === seedId)
    expect(matched).toBeDefined()
    expect(matched.subject).toBe('Overridden by backend')
    expect(matched.subject).not.toBe(originalSubject)
  })

  it('an empty backend snapshot is a no-op (does not wipe seed letters)', () => {
    const letters = new TeacherLetters()
    const before = letters.letters.length
    letters.hydrateBackend([])
    expect(letters.letters.length).toBe(before)
  })
})
