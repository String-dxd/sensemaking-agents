/**
 * Characterization coverage for the capture durability layer.
 *
 * `Captures.js` sits between "the student finished speaking" and "the row is
 * committed", and anything lost here is unrecoverable — yet it had no direct
 * test: existing suites either mock it away (Game.setRenderActive) or use it as
 * a Sprouts fixture. These cases pin the observable behaviour of add/patch
 * fan-out, the failed→retry status sequence RetrySyncNotice drives, the
 * deliberate non-persistence of hydrate/upsertBackend, the boot reconciliation
 * of an interrupted 'syncing', and what happens when storage rejects a write.
 *
 * Setup mirrors test/engine/Sprouts.integration.test.ts: null each singleton's
 * static `instance`, then construct Persistence with an in-memory adapter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — Captures.js is JS without a companion .d.ts.
import Captures from '~/engine/student-space/Game/State/Captures.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'

const CAPTURES_KEY = 'ss:v1:captures'

type CaptureEntry = {
  id: string
  createdAt: string
  entryDate: string
  kind: string
  text?: string
  syncStatus?: string
  syncError?: string
  backendMirrorEntryId?: number
}

type SpyAdapter = {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
  captureWrites: () => number
  readCaptures: () => CaptureEntry[]
}

/**
 * memoryAdapter() wrapped so the test can count writes and read the persisted
 * payload back, rather than reaching into Persistence's privates.
 */
function spyAdapter(): SpyAdapter {
  const inner = memoryAdapter()
  let captureWrites = 0
  return {
    getItem: (k) => inner.getItem(k) as string | null,
    setItem: (k, v) => {
      if (k === CAPTURES_KEY) captureWrites += 1
      inner.setItem(k, v)
    },
    removeItem: (k) => inner.removeItem(k),
    captureWrites: () => captureWrites,
    readCaptures: () => {
      const raw = inner.getItem(CAPTURES_KEY) as string | null
      return raw ? (JSON.parse(raw) as CaptureEntry[]) : []
    },
  }
}

/**
 * Throws a QuotaExceededError from setItem once `healthyWrites` writes have
 * succeeded. The constructor's _probe() also calls setItem, so a throw-always
 * adapter would make `_available` false from the very start; allowing the probe
 * through is what exercises the "healthy, then quota-full" transition.
 */
function quotaAdapter(healthyWrites: number) {
  const inner = memoryAdapter()
  let writes = 0
  return {
    getItem: (k: string) => inner.getItem(k) as string | null,
    setItem: (k: string, v: string) => {
      writes += 1
      if (writes > healthyWrites) {
        const err = new Error('quota exceeded')
        err.name = 'QuotaExceededError'
        throw err
      }
      inner.setItem(k, v)
    },
    removeItem: (k: string) => inner.removeItem(k),
  }
}

function resetSingletons() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Captures as unknown as { instance: unknown }).instance = null
}

afterEach(() => {
  resetSingletons()
  vi.restoreAllMocks()
})

describe('Captures', () => {
  let adapter: SpyAdapter
  let persistence: Persistence
  let captures: Captures

  beforeEach(() => {
    resetSingletons()
    adapter = spyAdapter()
    persistence = new Persistence({ storage: adapter })
    captures = new Captures()
  })

  it('round-trips an added capture through serialize() and storage', () => {
    const entry: CaptureEntry = captures.add({ kind: 'ask', text: 'hi' })

    expect(entry.id).toBeTruthy()
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(entry.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(captures.serialize()).toContainEqual(entry)

    // save() is debounced 250ms; flush() writes pending slices synchronously.
    persistence.flush()
    expect(adapter.readCaptures()).toEqual([entry])
  })

  it('fans a patch out to subscribers after mutating, then persists', () => {
    const entry: CaptureEntry = captures.add({ kind: 'ask', text: 'hi' })
    persistence.flush()

    // Captures declares patch() twice — lines 120 and 156. The second
    // declaration wins (it routes through findById); this pins the behaviour of
    // whichever one is live so deleting the dead first one stays provably safe.
    const observed: Array<string | undefined> = []
    const unsubscribe = captures.subscribe((changed: CaptureEntry) =>
      observed.push(changed.syncStatus),
    )

    captures.patch(entry.id, { syncStatus: 'failed' })

    // The subscriber ran after the mutation, so it saw the new value.
    expect(observed).toEqual(['failed'])
    persistence.flush()
    expect(adapter.readCaptures()[0]?.syncStatus).toBe('failed')

    unsubscribe()
    captures.patch(entry.id, { syncStatus: 'local' })
    expect(observed).toEqual(['failed'])
  })

  it('carries a capture through the failed → retry → synced sequence', () => {
    const entry: CaptureEntry = captures.add({
      kind: 'ask',
      text: 'Needs sync',
      syncStatus: 'failed',
      syncError: 'offline',
    })

    // Exactly the two patches RetrySyncNotice performs.
    captures.patch(entry.id, { syncStatus: 'syncing', syncError: '' })
    captures.patch(entry.id, { backendMirrorEntryId: 91, syncStatus: 'synced' })
    persistence.flush()

    expect(adapter.readCaptures()[0]).toMatchObject({
      syncStatus: 'synced',
      syncError: '',
      backendMirrorEntryId: 91,
    })
  })

  it('merges backend rows into serialize() without persisting them as local state', () => {
    const local: CaptureEntry = captures.add({ kind: 'ask', text: 'local only' })
    persistence.flush()
    const writesAfterLocal = adapter.captureWrites()

    captures.upsertBackend([
      {
        id: 'backend-1',
        createdAt: '2020-01-01T00:00:00.000Z',
        entryDate: '2020-01-01',
        kind: 'ask',
        text: 'from the server',
        backendMirrorEntryId: 91,
      },
    ])

    // Both present, ordered by createdAt — the backend row is older.
    const merged = captures.serialize() as CaptureEntry[]
    expect(merged.map((e) => e.id)).toEqual(['backend-1', local.id])

    // Backend rows are server truth, not locally-authored state: no write is
    // scheduled, so the persisted payload still holds only the local capture.
    persistence.flush()
    expect(adapter.captureWrites()).toBe(writesAfterLocal)
    expect(adapter.readCaptures().map((e) => e.id)).toEqual([local.id])

    // A second upsert of the same durable id replaces rather than duplicates.
    captures.upsertBackend([
      {
        id: 'backend-1-refreshed',
        createdAt: '2020-01-01T00:00:00.000Z',
        entryDate: '2020-01-01',
        kind: 'ask',
        text: 'refreshed',
        backendMirrorEntryId: 91,
      },
    ])
    const refreshed = captures.serialize() as CaptureEntry[]
    expect(refreshed.filter((e) => e.backendMirrorEntryId === 91)).toHaveLength(1)
    expect(refreshed.map((e) => e.id)).toEqual(['backend-1-refreshed', local.id])
  })

  it('carries the local photo over when a backend row replaces the capture', () => {
    // Photo captured with the reflection — client-side only; the backend
    // mirror row has no image column.
    captures.add({
      kind: 'ask',
      text: 'with photo',
      dataUrl: 'data:image/jpeg;base64,PHOTO',
      backendMirrorEntryId: 91,
    })

    captures.upsertBackend([
      {
        id: 'mirror:91',
        createdAt: '2020-01-01T00:00:00.000Z',
        entryDate: '2020-01-01',
        kind: 'ask',
        text: 'from the server',
        backendMirrorEntryId: 91,
      },
    ])

    const merged = captures.serialize() as Array<CaptureEntry & { dataUrl?: string }>
    const entry = merged.find((e) => e.backendMirrorEntryId === 91)
    expect(entry?.id).toBe('mirror:91')
    expect(entry?.dataUrl).toBe('data:image/jpeg;base64,PHOTO')
  })

  it("re-marks an interrupted 'syncing' capture as failed at boot", () => {
    captures.hydrate([
      {
        id: 'interrupted',
        createdAt: '2026-07-01T00:00:00.000Z',
        entryDate: '2026-07-01',
        kind: 'ask',
        text: 'lost mid submit',
        syncStatus: 'syncing',
      },
      {
        // Reached the backend, just missed its 'synced' patch — already durable,
        // so it must not be presented to the student as failed.
        id: 'durable',
        createdAt: '2026-07-02T00:00:00.000Z',
        entryDate: '2026-07-02',
        kind: 'ask',
        text: 'already saved',
        syncStatus: 'syncing',
        backendMirrorEntryId: 5,
      },
      {
        id: 'done',
        createdAt: '2026-07-03T00:00:00.000Z',
        entryDate: '2026-07-03',
        kind: 'ask',
        text: 'fine',
        syncStatus: 'synced',
      },
    ])

    const byId = new Map((captures.serialize() as CaptureEntry[]).map((e) => [e.id, e] as const))
    expect(byId.get('interrupted')).toMatchObject({
      syncStatus: 'failed',
      syncError: 'Interrupted before saving',
    })
    expect(byId.get('durable')?.syncStatus).toBe('syncing')
    expect(byId.get('done')?.syncStatus).toBe('synced')
  })

  it('keeps the entry in memory and warns once when storage rejects the write', () => {
    resetSingletons()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // healthyWrites: 1 lets the constructor's _probe() succeed, so the store
    // starts available and only goes quota-full on the first real flush.
    const quota = new Persistence({ storage: quotaAdapter(1) })
    const store: Captures = new Captures()

    const entry: CaptureEntry = store.add({ kind: 'ask', text: 'must not vanish' })
    expect(() => quota.flush()).not.toThrow()

    // Subsequent saves take the _available === false early return.
    store.add({ kind: 'ask', text: 'second' })
    store.add({ kind: 'ask', text: 'third' })

    expect(store.serialize()).toHaveLength(3)
    expect((store.serialize() as CaptureEntry[])[0]).toMatchObject({ id: entry.id })

    const unavailable = warn.mock.calls.filter((args) =>
      String(args[0]).includes('storage unavailable; slice "captures"'),
    )
    expect(unavailable.length).toBe(1)
  })
})
