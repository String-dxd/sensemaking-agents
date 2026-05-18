/**
 * U1 coverage for docs/plans/2026-05-18-004-feat-island-pick-and-plant-plan.md.
 *
 * Pins the position-mutation surface: setSproutPosition /
 * setBloomedPosition, the sproutMoved / bloomedMoved events, schema
 * hydrate round-trips, carry-forward on bloom, and the lenient-merge
 * stance on bad payloads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import Sprouts, { type SproutsEvent } from '~/engine/student-space/Game/State/Sprouts.js'

function freshPersistence() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

describe('Sprouts pick-and-plant — position mutations', () => {
  let sprouts: Sprouts
  let _persistence: Persistence

  beforeEach(() => {
    _persistence = freshPersistence()
    sprouts = new Sprouts()
  })

  it('newly spawned sprouts default position to null', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    expect(sprouts.getActive()?.position).toBeNull()
  })

  it('setSproutPosition stores a valid {x,z} payload and fans a sproutMoved event', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const active = sprouts.getActive()
    expect(active).not.toBeNull()
    const id = active!.id

    const events: SproutsEvent[] = []
    sprouts.subscribe((event) => events.push(event))

    const changed = sprouts.setSproutPosition(id, { x: 1.2, z: -0.4 })
    expect(changed).toBe(true)

    const recent = sprouts.recent()
    expect(recent[0]!.position).toEqual({ x: 1.2, z: -0.4 })

    const moved = events.find((e) => e.type === 'sproutMoved')
    expect(moved).toBeTruthy()
    expect((moved as { type: 'sproutMoved'; sprout: { id: string } }).sprout.id).toBe(id)
  })

  it('setSproutPosition with null clears an existing position', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const id = sprouts.getActive()!.id
    sprouts.setSproutPosition(id, { x: 1, z: 1 })
    expect(sprouts.recent()[0]!.position).toEqual({ x: 1, z: 1 })

    expect(sprouts.setSproutPosition(id, null)).toBe(true)
    expect(sprouts.recent()[0]!.position).toBeNull()
  })

  it('setSproutPosition rejects bad payloads without mutating state or emitting', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const id = sprouts.getActive()!.id
    sprouts.setSproutPosition(id, { x: 1.5, z: 2.0 })

    const events: SproutsEvent[] = []
    sprouts.subscribe((event) => events.push(event))

    // Missing z
    expect(
      sprouts.setSproutPosition(id, { x: 1 } as unknown as { x: number; z: number }),
    ).toBe(false)
    // Wrong type
    expect(
      sprouts.setSproutPosition(id, { x: 'foo', z: 0 } as unknown as { x: number; z: number }),
    ).toBe(false)
    // NaN
    expect(sprouts.setSproutPosition(id, { x: NaN, z: 0 })).toBe(false)
    // Infinity
    expect(sprouts.setSproutPosition(id, { x: Infinity, z: 0 })).toBe(false)

    expect(sprouts.recent()[0]!.position).toEqual({ x: 1.5, z: 2.0 })
    expect(events.some((e) => e.type === 'sproutMoved')).toBe(false)
  })

  it('setSproutPosition on an unknown id is a silent no-op', () => {
    const events: SproutsEvent[] = []
    sprouts.subscribe((event) => events.push(event))
    expect(sprouts.setSproutPosition('nope', { x: 0, z: 0 })).toBe(false)
    expect(events).toHaveLength(0)
  })

  it('position survives a hydrate/serialize round-trip', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const id = sprouts.getActive()!.id
    sprouts.setSproutPosition(id, { x: 0.7, z: -1.1 })

    const serialized = sprouts.serialize()
    ;(Sprouts as unknown as { instance: unknown }).instance = null
    const fresh = new Sprouts()
    fresh.hydrate(serialized)
    expect(fresh.recent()[0]!.position).toEqual({ x: 0.7, z: -1.1 })
  })

  it('schema drops a corrupt position to null on hydrate', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const serialized = sprouts.serialize() as {
      cycleIndex: number
      sprouts: Array<{ position: unknown }>
      bloomedTrees: unknown[]
    }
    // Tamper: replace position with garbage; schema should drop to null
    // rather than carrying NaN forward (the view would then misplace).
    serialized.sprouts[0]!.position = { x: NaN, z: 5 }

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(Sprouts as unknown as { instance: unknown }).instance = null
    const fresh = new Sprouts()
    fresh.hydrate(serialized)
    expect(fresh.recent()[0]!.position).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('legacy snapshots without a position key hydrate to position: null', () => {
    // Simulate v1.0 snapshot: no `position` field anywhere.
    const snapshot = {
      cycleIndex: 1,
      sprouts: [
        {
          id: 'legacy-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          entryDate: '2026-01-01',
          species: 'pending' as const,
          treeSpecies: 'oak' as const,
          placementSeed: 42,
          threshold: 3,
          count: 1,
          readyToBloom: false,
          bloomedAt: null,
          captureRefs: ['cap-1'],
          dimension: null,
        },
      ],
      bloomedTrees: [],
    }
    sprouts.hydrate(snapshot)
    expect(sprouts.recent()[0]!.position).toBeNull()
  })

  it('returned snapshots from recent() are frozen so callers cannot mutate position', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    const id = sprouts.getActive()!.id
    sprouts.setSproutPosition(id, { x: 1, z: 1 })

    const snap = sprouts.recent()[0]!
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.position)).toBe(true)
  })
})

describe('Sprouts pick-and-plant — bloomed objects', () => {
  let sprouts: Sprouts
  let _persistence: Persistence

  beforeEach(() => {
    _persistence = freshPersistence()
    sprouts = new Sprouts()
  })

  it('bloom() carries the sprout position forward onto the bloomedTree', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    sprouts.grow({ kind: 'capture', id: 'cap-3' })
    const ready = sprouts.readyToBloom()[0]
    expect(ready).toBeTruthy()
    const id = ready!.id

    sprouts.setSproutPosition(id, { x: 2.0, z: 0.5 })
    const result = sprouts.bloom(id)
    expect(result?.bloomedTree.position).toEqual({ x: 2.0, z: 0.5 })

    const persisted = sprouts.listBloomedTrees()
    expect(persisted[0]!.position).toEqual({ x: 2.0, z: 0.5 })
  })

  it('setBloomedPosition updates a bloomed tree and emits bloomedMoved', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    sprouts.grow({ kind: 'capture', id: 'cap-3' })
    const id = sprouts.readyToBloom()[0]!.id
    sprouts.bloom(id)

    const events: SproutsEvent[] = []
    sprouts.subscribe((event) => events.push(event))

    expect(sprouts.setBloomedPosition(id, { x: -1.5, z: 1.2 })).toBe(true)
    const bloomed = sprouts.listBloomedTrees()[0]
    expect(bloomed!.position).toEqual({ x: -1.5, z: 1.2 })

    const moved = events.find((e) => e.type === 'bloomedMoved')
    expect(moved).toBeTruthy()
    expect(
      (moved as { type: 'bloomedMoved'; bloomedTree: { id: string } }).bloomedTree.id,
    ).toBe(id)
  })

  it('setBloomedPosition is a silent no-op on unknown id', () => {
    expect(sprouts.setBloomedPosition('nope', { x: 0, z: 0 })).toBe(false)
  })

  it('bloomedTree position round-trips through hydrate/serialize', () => {
    sprouts.grow({ kind: 'capture', id: 'cap-1' })
    sprouts.grow({ kind: 'capture', id: 'cap-2' })
    sprouts.grow({ kind: 'capture', id: 'cap-3' })
    const id = sprouts.readyToBloom()[0]!.id
    sprouts.setSproutPosition(id, { x: 1.1, z: -0.2 })
    sprouts.bloom(id)

    const serialized = sprouts.serialize()
    ;(Sprouts as unknown as { instance: unknown }).instance = null
    const fresh = new Sprouts()
    fresh.hydrate(serialized)
    expect(fresh.listBloomedTrees()[0]!.position).toEqual({ x: 1.1, z: -0.2 })
  })

  it('hydrate drops corrupt bloomedTree position to null', () => {
    const snapshot = {
      cycleIndex: 1,
      sprouts: [],
      bloomedTrees: [
        {
          id: 'b-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          bloomedAt: '2026-01-02T00:00:00.000Z',
          species: 'tree' as const,
          treeSpecies: 'oak',
          placementSeed: 7,
          captureRefs: [],
          dimension: null,
          position: { x: 'bad', z: 0 } as unknown as { x: number; z: number },
        },
      ],
    }
    sprouts.hydrate(snapshot)
    expect(sprouts.listBloomedTrees()[0]!.position).toBeNull()
  })
})
