// Roster persistence tests (plan 012 step 2). Runs in vitest's `node`
// environment (this workspace has no jsdom) — `fake-indexeddb/auto`
// polyfills `indexedDB` globally; `../../src/studio/roster/thumbnails` is
// stubbed (a storage-interface stub, per the plan's own suggestion) since
// real thumbnail capture needs a live WebGL canvas this environment doesn't
// have — the stub still exercises the actual `Blob` round-trip through
// fake-indexeddb's structured-clone storage.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultCharacter } from '../../src/core/spec/defaults'
import { parseSpec, serializeSpec } from '../../src/core/spec/io'
import { SPEC_VERSION } from '../../src/core/spec/schema'
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_RETRY_MS,
  AUTOSAVE_SLOT_LIMIT,
  countAutosaveSlots,
  deleteCharacter,
  duplicateCharacter,
  flushPendingAutosave,
  importCharacterFromText,
  newCharacter,
  openCharacter,
  refreshRosterEntries,
  renameCharacter,
  RosterImportError,
  revertToLastAutosave,
  saveActiveCharacter,
  useRosterStore,
} from '../../src/studio/roster/rosterStore'
import { useCharacterStore } from '../../src/studio/state/characterStore'

// `vi.mock` calls are hoisted above every import in this file (including
// rosterStore's own `import { captureThumbnail } from './thumbnails'`), so
// this takes effect before any real WebGL/Canvas dependency is ever
// reached — this Node environment has neither.
vi.mock('../../src/studio/roster/thumbnails', () => ({
  captureThumbnail: vi.fn(async () => new Blob(['fake-png-bytes'], { type: 'image/png' })),
}))

function freshSpec() {
  const spec = createDefaultCharacter('biped-round', 'gentle')
  useCharacterStore.getState().setSpec(spec)
  return spec
}

function findEntry(id: string) {
  return useRosterStore.getState().entries.find((e) => e.id === id)
}

beforeEach(() => {
  freshSpec()
})

afterEach(async () => {
  // Let any in-flight autosave from THIS test settle before the next test's
  // assertions run (a stale fire-and-forget save resolving mid-way through
  // an unrelated later test would be a flaky, hard-to-diagnose bleed).
  await flushPendingAutosave()
  vi.useRealTimers()
  useCharacterStore.getState().markClean()
  useRosterStore.setState({ pointerDown: false })
})

describe('rosterStore CRUD', () => {
  it('newCharacter saves it, and it appears in refreshRosterEntries with a thumbnail', async () => {
    await newCharacter('bird', 'proud')
    const spec = useCharacterStore.getState().spec
    expect(spec.meta.archetype).toBe('bird')

    await refreshRosterEntries()
    const entry = findEntry(spec.meta.id)
    expect(entry).toBeDefined()
    expect(entry?.name).toBe(spec.meta.name)
    expect(entry?.thumbnailBlob).toBeInstanceOf(Blob)
    expect(entry?.thumbnailBlob?.type).toBe('image/png')
  })

  it('openCharacter restores the exact saved spec (deep-equal)', async () => {
    await newCharacter('biped-slim', 'mischievous')
    const saved = useCharacterStore.getState().spec

    // Simulate switching away and back.
    freshSpec()
    expect(useCharacterStore.getState().spec.meta.id).not.toBe(saved.meta.id)

    await openCharacter(saved.meta.id)
    expect(useCharacterStore.getState().spec).toEqual(saved)
  })

  it('duplicateCharacter creates an independent row with a new id', async () => {
    await newCharacter('biped-round', 'calm')
    const original = useCharacterStore.getState().spec

    const copyId = await duplicateCharacter(original.meta.id)
    expect(copyId).not.toBe(original.meta.id)

    await refreshRosterEntries()
    const copyEntry = findEntry(copyId)
    expect(copyEntry?.name).toBe(`${original.meta.name} copy`)

    // The live (still-open) character is untouched by duplicating.
    expect(useCharacterStore.getState().spec.meta.id).toBe(original.meta.id)

    // Editing the original afterwards must not affect the duplicate's saved row.
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'renamed original' }
    })
    await saveActiveCharacter()
    await refreshRosterEntries()
    expect(findEntry(copyId)?.name).toBe(`${original.meta.name} copy`)
  })

  it('renameCharacter patches the live spec when the character is currently open', async () => {
    await newCharacter('biped-round')
    const spec = useCharacterStore.getState().spec

    await renameCharacter(spec.meta.id, '  Sunny  ')
    expect(useCharacterStore.getState().spec.meta.name).toBe('Sunny')
  })

  it('renameCharacter updates a saved row directly when it is NOT the open character', async () => {
    await newCharacter('bird')
    const other = useCharacterStore.getState().spec
    freshSpec() // switch away — `other` is no longer the open character

    await renameCharacter(other.meta.id, 'Renamed Elsewhere')
    await refreshRosterEntries()
    expect(findEntry(other.meta.id)?.name).toBe('Renamed Elsewhere')

    // Live spec (a different character) is untouched.
    expect(useCharacterStore.getState().spec.meta.id).not.toBe(other.meta.id)
  })

  it('deleteCharacter removes the row and its autosave slots', async () => {
    await newCharacter('biped-slim')
    const spec = useCharacterStore.getState().spec
    expect(await countAutosaveSlots(spec.meta.id)).toBeGreaterThan(0)

    await deleteCharacter(spec.meta.id)
    await refreshRosterEntries()

    expect(findEntry(spec.meta.id)).toBeUndefined()
    expect(await countAutosaveSlots(spec.meta.id)).toBe(0)
    // Deleting the OPEN character resets the live editor rather than
    // leaving a "ghost" that autosave could silently resurrect.
    expect(useCharacterStore.getState().spec.meta.id).not.toBe(spec.meta.id)
  })
})

describe('rosterStore autosave slots (crash recovery)', () => {
  it(`keeps at most ${AUTOSAVE_SLOT_LIMIT} autosave slots per character, pruning the oldest`, async () => {
    await newCharacter('biped-round')
    const id = useCharacterStore.getState().spec.meta.id

    for (let i = 0; i < AUTOSAVE_SLOT_LIMIT + 3; i++) {
      useCharacterStore.getState().patch((draft) => {
        draft.meta = { ...draft.meta, name: `pass-${i}` }
      })
      await saveActiveCharacter()
    }

    expect(await countAutosaveSlots(id)).toBe(AUTOSAVE_SLOT_LIMIT)
  })

  it('revertToLastAutosave restores the most recent good snapshot after a bad in-memory edit', async () => {
    await newCharacter('biped-round')
    const id = useCharacterStore.getState().spec.meta.id

    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'last good save' }
    })
    await saveActiveCharacter()

    // Simulate a crash-inducing bad edit that never got persisted.
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'never saved — the "crash"' }
    })

    const restored = await revertToLastAutosave(id)
    expect(restored).toBe(true)
    expect(useCharacterStore.getState().spec.meta.name).toBe('last good save')
  })

  it('revertToLastAutosave returns false when the character has no autosave history', async () => {
    const restored = await revertToLastAutosave('00000000-0000-0000-0000-000000000000')
    expect(restored).toBe(false)
  })
})

describe('rosterStore autosave scheduling', () => {
  it('debounces multiple rapid patches into a single save 2s after the LAST patch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    freshSpec()

    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'first' }
    })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 200)
    expect(useCharacterStore.getState().dirty).toBe(true) // not yet — still within the window

    // A second patch before the debounce elapsed resets the timer.
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'final' }
    })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 200)
    expect(useCharacterStore.getState().dirty).toBe(true) // still debounced from the SECOND patch

    await vi.advanceTimersByTimeAsync(300)
    await flushPendingAutosave() // let the fake-indexeddb round-trip (real setImmediate) settle
    expect(useCharacterStore.getState().dirty).toBe(false) // saved now

    const id = useCharacterStore.getState().spec.meta.id
    await refreshRosterEntries()
    expect(findEntry(id)?.name).toBe('final') // saved the LATEST state, not the first patch
  })

  it('skips autosave while pointerDown is true, then saves once released', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    freshSpec()
    useRosterStore.setState({ pointerDown: true })

    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'dragged' }
    })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_RETRY_MS * 4)
    await flushPendingAutosave()
    expect(useCharacterStore.getState().dirty).toBe(true) // held back the whole time

    useRosterStore.setState({ pointerDown: false })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS + 50)
    await flushPendingAutosave()
    expect(useCharacterStore.getState().dirty).toBe(false) // saved promptly after release
  })
})

describe('rosterStore import', () => {
  it('corrupt JSON throws a toast-able RosterImportError and writes nothing', async () => {
    await refreshRosterEntries()
    const before = useRosterStore.getState().entries.length

    await expect(importCharacterFromText('{ this is not valid json')).rejects.toThrow(RosterImportError)
    await expect(importCharacterFromText('{ this is not valid json')).rejects.toThrow(/valid JSON/)

    await refreshRosterEntries()
    expect(useRosterStore.getState().entries.length).toBe(before)
  })

  it('rejects a spec from a newer, unsupported specVersion via the migration version-gate', async () => {
    const future = JSON.stringify({ meta: { specVersion: SPEC_VERSION + 1 } })
    await expect(importCharacterFromText(future)).rejects.toThrow(RosterImportError)
    // Proves `migrateSpec`'s own version check ran (not just a generic zod
    // validation failure, which would read completely differently).
    await expect(importCharacterFromText(future)).rejects.toThrow(/newer than this build supports/)
  })

  it('imports a valid character, opens it, and saves it (parseSpec + migration run identically to a file load)', async () => {
    const spec = createDefaultCharacter('bird', 'gruff')
    const text = serializeSpec(spec)

    const imported = await importCharacterFromText(text)
    expect(imported).toEqual(parseSpec(text))
    expect(useCharacterStore.getState().spec.meta.id).toBe(spec.meta.id)

    await refreshRosterEntries()
    expect(findEntry(spec.meta.id)).toBeDefined()
  })
})
