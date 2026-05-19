/**
 * Unit coverage for U3 — IslandSnapshotBridge.
 *
 * Exercises the trigger / throttle / fire-and-forget behaviour with a stub
 * Sprouts slice and an injectable fetch. Confirms the critical invariants:
 *   - subscribes only to 'bloomed' and 'decorMoved' (not 'spawned' / 'grew')
 *   - boot trigger throttled to 1 per hour
 *   - 403 swallowed silently (demo path)
 *   - network/serialize errors never throw out to the caller
 *   - dispose detaches the slice subscription and clears the singleton
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import IslandSnapshotBridge from '~/engine/student-space/Game/State/IslandSnapshotBridge.js'

afterEach(() => {
  // Engine state-slice template — null the singleton between tests so
  // `new` returns a fresh instance.
  ;(IslandSnapshotBridge as unknown as { instance: unknown }).instance = null
})

type SproutsEvent = { type: string; [key: string]: unknown }

function makeStubSprouts() {
  const subscribers = new Set<(event: SproutsEvent) => void>()
  const slice = {
    subscribe(cb: (event: SproutsEvent) => void) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    serialize: vi.fn(() => ({ sprouts: [], bloomedTrees: [{ id: 'a' }] })),
  }
  function fire(event: SproutsEvent) {
    for (const cb of subscribers) cb(event)
  }
  return { slice, fire }
}

function makeFetchStub() {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
}

describe('IslandSnapshotBridge', () => {
  it('posts a snapshot on "bloomed" events from the attached slice', async () => {
    const { slice, fire } = makeStubSprouts()
    const fetchStub = makeFetchStub()
    const bridge = new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })

    fire({ type: 'bloomed' })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/island/snapshot',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    )
    expect(slice.serialize).toHaveBeenCalled()
    bridge.dispose()
  })

  it('posts a snapshot on "decorMoved" events', async () => {
    const { slice, fire } = makeStubSprouts()
    const fetchStub = makeFetchStub()
    new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })

    fire({ type: 'decorMoved', kind: 'tree', index: 0, position: { x: 1, z: 2 } })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('does NOT post on "spawned", "grew", or "markedReady" events', async () => {
    const { slice, fire } = makeStubSprouts()
    const fetchStub = makeFetchStub()
    new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })

    fire({ type: 'spawned' })
    fire({ type: 'grew' })
    fire({ type: 'markedReady' })
    fire({ type: 'speciesLocked' })
    fire({ type: 'bloomedMoved' })
    fire({ type: 'sproutMoved' })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('throttles the boot trigger to once per hour using injected clock', async () => {
    const { slice } = makeStubSprouts()
    const fetchStub = makeFetchStub()
    let nowMs = 1_000_000_000_000
    const bridge = new IslandSnapshotBridge({
      sproutsSlice: slice,
      fetch: fetchStub,
      now: () => nowMs,
    })

    bridge.captureNow('boot')
    // Drain the bridge's fire-and-forget chain (response handler + finally).
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchStub).toHaveBeenCalledTimes(1)

    // Same session, 30 minutes later — should be a no-op (throttle holds).
    nowMs += 30 * 60 * 1000
    bridge.captureNow('boot')
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchStub).toHaveBeenCalledTimes(1)

    // 61 minutes after the first call — throttle releases.
    nowMs += 31 * 60 * 1000 + 1
    bridge.captureNow('boot')
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it('swallows a 403 silently (demo / dev-bypass path)', async () => {
    const { slice, fire } = makeStubSprouts()
    const fetchStub = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: { code: 'growth_demo_unsupported' } }), {
          status: 403,
        }),
    )
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })
    fire({ type: 'bloomed' })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchStub).toHaveBeenCalledTimes(1)
    // 403 is the expected demo path — no debug log, no warn.
    expect(debugSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    debugSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('swallows a network rejection without throwing out', async () => {
    const { slice, fire } = makeStubSprouts()
    const fetchStub = vi.fn(async () => {
      throw new Error('econnreset')
    })
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })
    expect(() => fire({ type: 'bloomed' })).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalled()
    debugSpy.mockRestore()
  })

  it('skips overlapping in-flight requests (no race storm on rapid events)', async () => {
    const { slice, fire } = makeStubSprouts()
    let resolveFirst: (value: Response) => void = () => {}
    const fetchStub = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve
        }),
    )
    new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })

    fire({ type: 'bloomed' })
    fire({ type: 'bloomed' })
    fire({ type: 'decorMoved', kind: 'tree', index: 0 })
    await Promise.resolve()
    await Promise.resolve()

    // Only the first request kicked off; the next two were dropped while
    // the first was in-flight.
    expect(fetchStub).toHaveBeenCalledTimes(1)

    resolveFirst(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  })

  it('dispose detaches the slice subscription', async () => {
    const { slice, fire } = makeStubSprouts()
    const fetchStub = makeFetchStub()
    const bridge = new IslandSnapshotBridge({ sproutsSlice: slice, fetch: fetchStub })

    bridge.dispose()
    fire({ type: 'bloomed' })
    await Promise.resolve()

    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('dispose clears the singleton', () => {
    const bridge = new IslandSnapshotBridge()
    expect(IslandSnapshotBridge.getInstance()).toBe(bridge)
    bridge.dispose()
    expect(IslandSnapshotBridge.getInstance()).toBeFalsy()
  })
})
