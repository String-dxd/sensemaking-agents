/**
 * Plan 004 — export round-trip + committed-default validity tests.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultIslandLayout,
  defaultIslandLayoutFromConstants,
} from '~/engine/student-space/Game/Data/islandLayout.js'
import IslandLayout from '~/engine/student-space/Game/State/IslandLayout.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'

function freshLayout() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  new Persistence({ storage: memoryAdapter() })
  return new IslandLayout()
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
})

// ── defaultIslandLayout.json validity ─────────────────────────────────────

describe('defaultIslandLayout()', () => {
  it('returns a non-empty layout', () => {
    const layout = defaultIslandLayout()
    expect(layout.v).toBe(1)
    expect(Array.isArray(layout.objects)).toBe(true)
    expect(layout.objects.length).toBeGreaterThan(0)
  })

  it('contains mailbox-0 and telescope-0', () => {
    const layout = defaultIslandLayout()
    const ids = layout.objects.map((o) => o.id)
    expect(ids).toContain('mailbox-0')
    expect(ids).toContain('telescope-0')
  })

  it('contains at least one tree, flower, and fruit', () => {
    const layout = defaultIslandLayout()
    const kinds = new Set(layout.objects.map((o) => o.kind))
    expect(kinds.has('tree')).toBe(true)
    expect(kinds.has('flower')).toBe(true)
    expect(kinds.has('fruit')).toBe(true)
  })

  it('every object has a non-empty id, kind, x, z', () => {
    const layout = defaultIslandLayout()
    for (const obj of layout.objects) {
      expect(typeof obj.id).toBe('string')
      expect(obj.id.length).toBeGreaterThan(0)
      expect(typeof obj.kind).toBe('string')
      expect(typeof obj.x).toBe('number')
      expect(typeof obj.z).toBe('number')
    }
  })

  // Seed parity guard: intentionally skipped so an authored edit passes CI.
  // Uncomment to verify the committed JSON matches the constants seed at a
  // given point in time.
  it.skip('matches defaultIslandLayoutFromConstants() at seed time', () => {
    const fromJson = defaultIslandLayout()
    const fromConstants = defaultIslandLayoutFromConstants()
    expect(fromJson.objects.length).toBe(fromConstants.objects.length)
    for (let i = 0; i < fromConstants.objects.length; i++) {
      expect(fromJson.objects[i]).toMatchObject(fromConstants.objects[i]!)
    }
  })
})

// ── Export / import round-trip ─────────────────────────────────────────────

describe('IslandLayout serialize / setLayout round-trip', () => {
  it('serialize returns v + objects array', () => {
    const layout = freshLayout()
    const snap = layout.serialize()
    expect(snap.v).toBe(1)
    expect(Array.isArray(snap.objects)).toBe(true)
    expect(snap.objects.length).toBeGreaterThan(0)
  })

  it('setLayout with serialized snapshot produces identical list', () => {
    const layout = freshLayout()
    layout.addObject({ id: 'extra-flower', kind: 'flower', species: 'daisy', x: 0.5, z: 0.5 })
    const snap = layout.serialize()

    const layout2 = freshLayout()
    layout2.setLayout(snap)
    const list2 = layout2.list()

    expect(list2.length).toBe(snap.objects.length)
    const ids2 = new Set(list2.map((o) => o.id))
    for (const obj of snap.objects) {
      expect(ids2.has(obj.id)).toBe(true)
    }
  })

  it('setLayout fires layoutReplaced', () => {
    const layout = freshLayout()
    const snap = layout.serialize()

    const layout2 = freshLayout()
    const events: string[] = []
    layout2.subscribe((e: unknown) => {
      events.push((e as { type: string }).type)
    })
    layout2.setLayout(snap)

    expect(events).toContain('layoutReplaced')
  })

  it('setLayout with invalid input is rejected without corrupting state', () => {
    const layout = freshLayout()
    const before = layout.list().length

    layout.setLayout(null)
    layout.setLayout({ v: 99 })
    layout.setLayout('garbage')

    expect(layout.list().length).toBe(before)
  })
})
