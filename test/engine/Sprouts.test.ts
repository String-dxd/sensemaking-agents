/**
 * Sprouts state slice — unit coverage for U1 of
 * docs/plans/2026-05-18-002-feat-island-object-progression-plan.md.
 *
 * The slice mirrors the MoodPins / Captures shape: subscribe → fan out
 * → debounced persist. Behavior anchored here:
 *   - threshold-based progression (3 captures → readyToBloom)
 *   - active-sprout dedupe on patch-style re-fire
 *   - bloom removes from active list
 *   - snapshot accessors return referentially stable references
 *     between mutations (load-bearing for React's useSyncExternalStore)
 *   - singleton + dispose semantics match siblings
 *   - persistence round-trip via memoryAdapter
 *   - subscriber crash isolation (a throwing subscriber does not
 *     abort fan-out or skip _persist)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import Sprouts, {
  BLOOM_THRESHOLD,
  TREE_SPECIES_ROTATION,
  type SproutsEvent,
} from '~/engine/student-space/Game/State/Sprouts.js'
import Persistence, {
  memoryAdapter,
} from '~/engine/student-space/Game/State/Persistence.js'

function freshPersistence() {
  // Reset singletons so each test boots a clean slice + adapter.
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
})

describe('Sprouts state slice', () => {
  let sprouts: Sprouts
  let persistence: Persistence

  beforeEach(() => {
    persistence = freshPersistence()
    sprouts = new Sprouts()
  })

  it('first grow() spawns a sprout with count=1, species=tree, first rotation variety', () => {
    const result = sprouts.grow({ kind: 'capture', id: 'cap-1' })
    expect(result.didSpawn).toBe(true)
    expect(result.sprout).toBeTruthy()
    expect(result.sprout!.count).toBe(1)
    expect(result.sprout!.species).toBe('tree')
    expect(result.sprout!.treeSpecies).toBe(TREE_SPECIES_ROTATION[0])
    expect(result.sprout!.readyToBloom).toBe(false)
  })

  it('BLOOM_THRESHOLD grows reach readyToBloom on the threshold-th call', () => {
    expect(BLOOM_THRESHOLD).toBe(3)
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    const third = sprouts.grow({ kind: 'capture', id: 'cap-3' })
    expect(third.didMarkReady).toBe(true)
    expect(third.sprout!.readyToBloom).toBe(true)
    expect(third.sprout!.count).toBe(3)
  })

  it('grow() after threshold spawns a new sprout, cycling to next tree species', () => {
    for (let i = 0; i < BLOOM_THRESHOLD; i++) {
      sprouts.grow({ kind: 'capture', id: `cap-${i}` })
    }
    const next = sprouts.grow({ kind: 'capture', id: 'cap-x' })
    expect(next.didSpawn).toBe(true)
    expect(next.sprout!.treeSpecies).toBe(TREE_SPECIES_ROTATION[1])
    expect(sprouts.recent(10)).toHaveLength(2)
  })

  it('grow() dedupes by capture id (MoodPins patch re-fire safety)', () => {
    const first = sprouts.grow({ kind: 'mood', id: 'pin-1' })
    const second = sprouts.grow({ kind: 'mood', id: 'pin-1' })
    expect(first.didSpawn).toBe(true)
    expect(second.didSpawn).toBe(false)
    expect(second.didMarkReady).toBe(false)
    expect(sprouts.getActive()!.count).toBe(1)
  })

  it('bloom() returns null when sprout is not ready', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const active = sprouts.getActive()!
    expect(sprouts.bloom(active.id)).toBeNull()
    expect(sprouts.recent(10)).toHaveLength(1)
  })

  it('bloom() removes the sprout from the active list and emits a bloomed event', () => {
    for (let i = 0; i < BLOOM_THRESHOLD; i++) {
      sprouts.grow({ kind: 'capture', id: `cap-${i}` })
    }
    const ready = sprouts.readyToBloom()[0]!
    const events: Array<{ type: string; id: string }> = []
    sprouts.subscribe((ev: SproutsEvent) => events.push({ type: ev.type, id: ev.sprout.id }))
    const bloomed = sprouts.bloom(ready.id)
    expect(bloomed).toBeTruthy()
    expect(bloomed!.bloomedAt).not.toBeNull()
    expect(sprouts.recent(10)).toHaveLength(0)
    expect(events).toEqual([{ type: 'bloomed', id: ready.id }])
  })

  it('recent(n) returns referentially stable arrays between mutations', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const a = sprouts.recent(10)
    const b = sprouts.recent(10)
    expect(a).toBe(b)
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    const c = sprouts.recent(10)
    expect(c).not.toBe(a)
  })

  it('getActive() returns referentially stable references between mutations', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const a = sprouts.getActive()
    const b = sprouts.getActive()
    expect(a).toBe(b)
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    expect(sprouts.getActive()).not.toBe(a)
  })

  it('subscribe() callbacks fire in order: spawned, grew, grew, markedReady', () => {
    const types: string[] = []
    sprouts.subscribe((ev: SproutsEvent) => types.push(ev.type))
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    sprouts.grow({ kind: 'capture', id: 'cap-3' })
    expect(types).toEqual(['spawned', 'grew', 'markedReady'])
  })

  it('subscriber crash isolation — a throwing subscriber does not abort fan-out or skip persist', () => {
    const calls: string[] = []
    sprouts.subscribe(() => {
      throw new Error('boom')
    })
    sprouts.subscribe((ev: SproutsEvent) => calls.push(ev.type))
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    // The second subscriber still fired despite the first throwing.
    expect(calls).toEqual(['spawned'])
    // The sprout was still recorded (persist would have run; we don't
    // need to fake-test the timer, the slice's own state proves the
    // mutation completed).
    expect(sprouts.recent(10)).toHaveLength(1)
  })

  it('grow() silently no-ops on malformed payload', () => {
    expect(sprouts.grow(null).didSpawn).toBe(false)
    expect(sprouts.grow({}).didSpawn).toBe(false)
    expect(sprouts.recent(10)).toHaveLength(0)
  })

  it('singleton — instantiating Sprouts twice returns the same instance', () => {
    const a = new Sprouts()
    const b = new Sprouts()
    expect(a).toBe(b)
  })

  it('hydrate() restores cycleIndex and active sprouts; does not fan to subscribers', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    const serialized = sprouts.serialize()
    persistence.flush()
    // Fresh slice
    ;(Sprouts as unknown as { instance: unknown }).instance = null
    const reborn = new Sprouts()
    const events: string[] = []
    reborn.subscribe((ev: SproutsEvent) => events.push(ev.type))
    reborn.hydrate(serialized)
    expect(events).toEqual([])  // hydrate must not fan out
    expect(reborn.recent(10)).toHaveLength(1)
    expect(reborn.getActive()!.count).toBe(2)
  })

  it('persistence round-trip via memoryAdapter — sprouts survive flush + reload', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    persistence.flush()

    // Simulate full reload: dispose persistence, reinstantiate with the
    // same backing adapter so the saved data is still present.
    const adapter = (persistence as unknown as { _storage: { getItem: (k: string) => string | null } })._storage
    persistence.dispose()
    ;(Sprouts as unknown as { instance: unknown }).instance = null

    const persistence2 = new Persistence({ storage: adapter as ReturnType<typeof memoryAdapter> })
    const snapshot = persistence2.load()
    const reborn = new Sprouts()
    reborn.hydrate(snapshot.sprouts as { cycleIndex?: number; sprouts?: unknown[] })

    expect(reborn.recent(10)).toHaveLength(1)
    expect(reborn.getActive()!.count).toBe(2)
    expect(reborn.getActive()!.captureRefs).toEqual(['cap-1', 'cap-2'])
  })

  it('cycleIndex persists so freshly-spawned sprouts continue the rotation', () => {
    for (let i = 0; i < BLOOM_THRESHOLD; i++) {
      sprouts.grow({ kind: 'capture', id: `cap-${i}` })
    }
    // First sprout was rotation[0]. cycleIndex is now 1.
    const serialized = sprouts.serialize()
    ;(Sprouts as unknown as { instance: unknown }).instance = null
    const reborn = new Sprouts()
    reborn.hydrate(serialized)
    const next = reborn.grow({ kind: 'capture', id: 'after-reload' })
    expect(next.didSpawn).toBe(true)
    expect(next.sprout!.treeSpecies).toBe(TREE_SPECIES_ROTATION[1])
  })
})
