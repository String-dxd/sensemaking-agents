/**
 * IslandLayout state slice — unit tests for Plan 001 of the island-editor
 * initiative.
 *
 * Anchors:
 *   - CRUD mutations + event dispatch (objectAdded / objectRemoved / objectUpdated / layoutReplaced)
 *   - ids stay stable across remove (removing tree-2 does not renumber tree-3)
 *   - serialize → hydrate round-trip via memoryAdapter
 *   - working-copy hydrate: mutate → serialize → fresh hydrate restores it
 *   - isDiverged() true after a mutation, false after revertToDefault()
 *   - dispose nulls the singleton
 *   - subscriber crash isolation (a throwing subscriber does not abort fan-out)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IslandLayoutEvent } from '~/engine/student-space/Game/State/IslandLayout.js'
import IslandLayout from '~/engine/student-space/Game/State/IslandLayout.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'

function freshSetup() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  new Persistence({ storage: memoryAdapter() })
  return new IslandLayout()
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
})

describe('IslandLayout singleton', () => {
  it('two constructions return the same instance', () => {
    ;(Persistence as unknown as { instance: unknown }).instance = null
    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    new Persistence({ storage: memoryAdapter() })
    const a = new IslandLayout()
    const b = new IslandLayout()
    expect(a).toBe(b)
  })

  it('getInstance() returns the same instance as the constructor', () => {
    ;(Persistence as unknown as { instance: unknown }).instance = null
    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    new Persistence({ storage: memoryAdapter() })
    const a = new IslandLayout()
    expect(IslandLayout.getInstance()).toBe(a)
  })
})

describe('IslandLayout default state', () => {
  let layout: IslandLayout

  beforeEach(() => {
    layout = freshSetup()
  })

  it('list() returns 31 objects by default', () => {
    expect(layout.list()).toHaveLength(31)
  })

  it('listByKind("tree") returns 7 objects', () => {
    expect(layout.listByKind('tree')).toHaveLength(7)
  })

  it('listByKind("flower") returns 18 objects', () => {
    expect(layout.listByKind('flower')).toHaveLength(18)
  })

  it('listByKind("fruit") returns 4 objects', () => {
    expect(layout.listByKind('fruit')).toHaveLength(4)
  })

  it('listByKind("mailbox") returns 1 object', () => {
    expect(layout.listByKind('mailbox')).toHaveLength(1)
  })

  it('listByKind("telescope") returns 1 object', () => {
    expect(layout.listByKind('telescope')).toHaveLength(1)
  })

  it('get("mailbox-0") has locked=true', () => {
    const obj = layout.get('mailbox-0')
    expect(obj).toBeTruthy()
    expect(obj?.locked).toBe(true)
  })

  it('get("telescope-0") has locked=true', () => {
    const obj = layout.get('telescope-0')
    expect(obj).toBeTruthy()
    expect(obj?.locked).toBe(true)
  })

  it('isDiverged() is false on a fresh instance', () => {
    expect(layout.isDiverged()).toBe(false)
  })
})

describe('IslandLayout CRUD', () => {
  let layout: IslandLayout

  beforeEach(() => {
    layout = freshSetup()
  })

  it('addObject fans objectAdded event', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.addObject({ id: 'tree-added', kind: 'tree', species: 'oak', x: 1, z: 1 })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('objectAdded')
    expect(layout.list()).toHaveLength(32)
  })

  it('addObject assigns a fallback id when none provided', () => {
    layout.addObject({ kind: 'flower', species: 'daisy', x: 0.5, z: 0.5 })
    const flowers = layout.listByKind('flower')
    expect(flowers).toHaveLength(19)
    // The newly added flower should have a generated id
    const newFlower = flowers.find((f) => !f.id.match(/^flower-\d+$/))
    expect(newFlower).toBeTruthy()
  })

  it('addObject rejects duplicate id', () => {
    layout.addObject({ id: 'tree-0', kind: 'tree', species: 'oak', x: 1, z: 1 })
    expect(layout.list()).toHaveLength(31) // no duplicate added
  })

  it('removeObject fans objectRemoved event and reduces count', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.removeObject('tree-2')
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('objectRemoved')
    expect(layout.listByKind('tree')).toHaveLength(6)
  })

  it('removeObject is a no-op for unknown id', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.removeObject('not-real')
    expect(events).toHaveLength(0)
    expect(layout.list()).toHaveLength(31)
  })

  it('removing tree-2 does not renumber tree-3', () => {
    layout.removeObject('tree-2')
    const tree3 = layout.get('tree-3')
    expect(tree3).toBeTruthy()
    expect(tree3?.id).toBe('tree-3')
  })

  it('updateObject fans objectUpdated event and does not change id/kind', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.updateObject('tree-0', { x: 9.9, id: 'should-be-ignored', kind: 'flower' as any })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('objectUpdated')
    const obj = layout.get('tree-0')
    expect(obj?.id).toBe('tree-0')
    expect(obj?.kind).toBe('tree')
    expect(obj?.x).toBe(9.9)
  })

  it('moveObject via coercePosition and fans objectUpdated', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.moveObject('flower-0', { x: 2.5, z: -1.0 })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('objectUpdated')
    const flower = layout.get('flower-0')
    expect(flower?.x).toBe(2.5)
    expect(flower?.z).toBe(-1.0)
  })

  it('moveObject rejects NaN', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.moveObject('flower-0', { x: NaN, z: 1 })
    expect(events).toHaveLength(0)
  })

  it('setLayout fans layoutReplaced event', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.setLayout({
      v: 1,
      objects: [{ id: 'tree-0', kind: 'tree', species: 'oak', x: 0, z: 0 }],
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('layoutReplaced')
    expect(layout.list()).toHaveLength(1)
  })

  it('setLayout rejects invalid payload', () => {
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.setLayout(null)
    layout.setLayout({ v: 1 })
    layout.setLayout({ v: 1, objects: [] })
    expect(events).toHaveLength(0)
    expect(layout.list()).toHaveLength(31)
  })
})

describe('IslandLayout divergence + revert', () => {
  let layout: IslandLayout

  beforeEach(() => {
    layout = freshSetup()
  })

  it('isDiverged() is true after a moveObject', () => {
    layout.moveObject('tree-0', { x: 1.0, z: 1.0 })
    expect(layout.isDiverged()).toBe(true)
  })

  it('isDiverged() is true after addObject', () => {
    layout.addObject({ id: 'new-tree', kind: 'tree', species: 'oak', x: 0, z: 0 })
    expect(layout.isDiverged()).toBe(true)
  })

  it('isDiverged() is true after removeObject', () => {
    layout.removeObject('tree-0')
    expect(layout.isDiverged()).toBe(true)
  })

  it('revertToDefault() resets objects to base and fans layoutReplaced', () => {
    layout.moveObject('tree-0', { x: 1.0, z: 1.0 })
    const events: IslandLayoutEvent[] = []
    layout.subscribe((e) => events.push(e))
    layout.revertToDefault()
    expect(layout.isDiverged()).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('layoutReplaced')
    expect(layout.list()).toHaveLength(31)
  })
})

describe('IslandLayout serialize + hydrate', () => {
  let layout: IslandLayout

  beforeEach(() => {
    layout = freshSetup()
  })

  it('serialize returns { v: 1, objects[] }', () => {
    const serialized = layout.serialize()
    expect(serialized.v).toBe(1)
    expect(Array.isArray(serialized.objects)).toBe(true)
    expect(serialized.objects).toHaveLength(31)
  })

  it('hydrate restores a mutated working copy', () => {
    layout.moveObject('tree-0', { x: 99, z: -99 })
    const snapshot = layout.serialize()

    // Start fresh and hydrate
    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    const reborn = new IslandLayout()
    reborn.hydrate(snapshot)
    const tree = reborn.get('tree-0')
    expect(tree?.x).toBe(99)
    expect(tree?.z).toBe(-99)
  })

  it('hydrate with invalid snapshot keeps the base default', () => {
    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    const fresh = new IslandLayout()
    fresh.hydrate(null)
    fresh.hydrate({ v: 1, objects: [] })
    expect(fresh.list()).toHaveLength(31)
  })

  it('round-trip: mutate → serialize → fresh hydrate → isDiverged true', () => {
    layout.addObject({ id: 'extra-tree', kind: 'tree', species: 'oak', x: 0, z: 0 })
    const snapshot = layout.serialize()

    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    const reborn = new IslandLayout()
    reborn.hydrate(snapshot)
    expect(reborn.list()).toHaveLength(32)
    expect(reborn.isDiverged()).toBe(true)
  })
})

describe('IslandLayout snapshot cache stability', () => {
  let layout: IslandLayout

  beforeEach(() => {
    layout = freshSetup()
  })

  it('list() returns the same reference between mutations', () => {
    const a = layout.list()
    const b = layout.list()
    expect(a).toBe(b)
  })

  it('list() returns a different reference after a mutation', () => {
    const a = layout.list()
    layout.moveObject('tree-0', { x: 1, z: 1 })
    const b = layout.list()
    expect(a).not.toBe(b)
  })

  it('listByKind() returns the same reference between mutations', () => {
    const a = layout.listByKind('tree')
    const b = layout.listByKind('tree')
    expect(a).toBe(b)
  })

  it('get() returns the same reference between mutations', () => {
    const a = layout.get('tree-0')
    const b = layout.get('tree-0')
    expect(a).toBe(b)
  })
})

describe('IslandLayout subscriber safety', () => {
  let layout: IslandLayout

  beforeEach(() => {
    layout = freshSetup()
  })

  it('a throwing subscriber does not abort fan-out to subsequent subscribers', () => {
    const seen: string[] = []
    layout.subscribe(() => {
      throw new Error('boom')
    })
    layout.subscribe((e) => seen.push(e.type))
    layout.moveObject('tree-0', { x: 1, z: 1 })
    expect(seen).toEqual(['objectUpdated'])
  })

  it('unsubscribe removes the callback', () => {
    const seen: string[] = []
    const off = layout.subscribe((e) => seen.push(e.type))
    layout.moveObject('tree-0', { x: 1, z: 1 })
    off()
    layout.moveObject('tree-1', { x: 2, z: 2 })
    expect(seen).toHaveLength(1)
  })
})

describe('IslandLayout dispose', () => {
  it('nulling IslandLayout.instance allows a fresh construction', () => {
    ;(Persistence as unknown as { instance: unknown }).instance = null
    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    new Persistence({ storage: memoryAdapter() })
    const first = new IslandLayout()
    first.moveObject('tree-0', { x: 5, z: 5 })

    ;(IslandLayout as unknown as { instance: unknown }).instance = null
    const second = new IslandLayout()
    // Fresh instance defaults — tree-0 back at its committed default (0.05, 0;
    // 2026-07-23 re-authoring snapped the base layout onto the new island).
    expect(second.get('tree-0')?.x).toBe(0.05)
    expect(second).not.toBe(first)
  })
})
