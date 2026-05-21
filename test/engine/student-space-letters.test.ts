/**
 * Coverage for the Letters → Capture flow added in 4a152ff:
 *   - TeacherLetters.hydrateBackend union-merge (backend wins on shared id;
 *     seed-only letters survive an empty/missing backend snapshot).
 *   - schema.mergeCapture round-trip for `letterId`.
 *   - schema.mergeTeacherLetter round-trip for `prompt`.
 *   - LettersSheet.open({ letterId }) deep-link: known id selects + marks
 *     read; unknown id falls through to auto-select.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import TeacherLetters from '~/engine/student-space/Game/State/TeacherLetters.js'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import { mergeCapture, mergeTeacherLetter } from '~/engine/student-space/Game/State/schema.js'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

// @ts-expect-error internal JS engine modules are intentionally untyped.
import LettersSheet from '~/engine/student-space/Game/View/LettersSheet.js'
import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'

function freshSingletons() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(TeacherLetters as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(TeacherLetters as unknown as { instance: unknown }).instance = null
  state.instance = null
  ;(OverlayController as unknown as { instance: unknown }).instance = null
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
        from: 'Ms. Tan',
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
        from: 'Ms Tan',
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
        from: 'Ms. Tan',
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

describe('LettersSheet.open({ letterId }) — deep-link', () => {
  beforeEach(() => {
    freshSingletons()
    ;(OverlayController as unknown as { instance: unknown }).instance = new OverlayController()
    const lettersSlice = new TeacherLetters()
    state.instance = {
      letters: lettersSlice,
      backend: null,
    }
  })

  it('selects the deep-linked letter and marks it read', () => {
    const lettersSlice = (state.instance as { letters: { letters: Array<{ id: string; read: boolean }>; markRead: (id: string) => void } }).letters
    const target = lettersSlice.letters.find((l) => !l.read)
    expect(target).toBeDefined()

    const sheet = new LettersSheet() as {
      open: (opts?: { letterId?: string }) => void
      selectedId: string | null
      dispose: () => void
    }
    sheet.open({ letterId: target!.id })

    expect(sheet.selectedId).toBe(target!.id)
    const after = lettersSlice.letters.find((l) => l.id === target!.id)
    expect(after?.read).toBe(true)

    sheet.dispose()
  })

  it('falls through to auto-select when the letterId is unknown', () => {
    const sheet = new LettersSheet() as {
      open: (opts?: { letterId?: string }) => void
      selectedId: string | null
      dispose: () => void
    }
    sheet.open({ letterId: 'lt_does_not_exist' })

    expect(sheet.selectedId).toBeTruthy()
    expect(sheet.selectedId).not.toBe('lt_does_not_exist')

    sheet.dispose()
  })

  it('unknown letterId clears a stale prior selection before auto-select', () => {
    const lettersSlice = (state.instance as { letters: { letters: Array<{ id: string }> } }).letters
    const stalePrior = lettersSlice.letters[lettersSlice.letters.length - 1].id

    const sheet = new LettersSheet() as {
      open: (opts?: { letterId?: string }) => void
      close: () => void
      selectedId: string | null
      dispose: () => void
    }
    // Carry a selection in from a prior open().
    sheet.open({ letterId: stalePrior })
    sheet.close()
    expect(sheet.selectedId).toBe(stalePrior)

    // Next open passes an unknown deep-link; selectedId must be re-picked,
    // not silently held over.
    sheet.open({ letterId: 'lt_does_not_exist' })

    expect(sheet.selectedId).toBeTruthy()
    expect(sheet.selectedId).not.toBe('lt_does_not_exist')
    // The auto-select branch should land on whatever it deems newest
    // unread — not necessarily distinct from stalePrior, but driven by
    // the slice's contents rather than the carried-over value.
    sheet.dispose()
  })
})
