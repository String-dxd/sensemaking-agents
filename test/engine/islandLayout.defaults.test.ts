/**
 * IslandLayout defaults — structural contract of the committed base layout.
 *
 * HISTORY: this suite originally asserted byte-parity with the retired polar
 * view constants ("visual no-op" era). The world port (U11) re-authored the
 * committed layout onto the editor spec terrain, so parity with those
 * constants is gone by design. The durable contract now is:
 *   - 31 objects with the FROZEN ids (tree-0…6, flower-0…17, fruit-0…3,
 *     mailbox-0, telescope-0) — ids never change with re-authoring
 *   - per-kind counts and species assignments stable
 *   - mailbox/telescope locked
 *   - every placement is placeable on the committed spec terrain (fresh
 *     boots never hydrate, so the base must be valid on its own)
 */

import { describe, expect, it } from 'vitest'
import { defaultIslandLayout } from '~/engine/student-space/Game/Data/islandLayout.js'
import Island from '~/engine/student-space/Game/State/Island.js'

const layout = defaultIslandLayout()
const byId = new Map(layout.objects.map((o) => [o.id, o]))
const island = new Island()

describe('defaultIslandLayout() structural contract', () => {
  it('has 31 objects with per-kind counts 7/18/4/1/1', () => {
    expect(layout.v).toBe(1)
    expect(layout.objects).toHaveLength(31)
    const count = (kind: string) => layout.objects.filter((o) => o.kind === kind).length
    expect(count('tree')).toBe(7)
    expect(count('flower')).toBe(18)
    expect(count('fruit')).toBe(4)
    expect(count('mailbox')).toBe(1)
    expect(count('telescope')).toBe(1)
  })

  it('carries the frozen id labels', () => {
    for (let i = 0; i < 7; i++) expect(byId.has(`tree-${i}`), `tree-${i}`).toBe(true)
    for (let i = 0; i < 18; i++) expect(byId.has(`flower-${i}`), `flower-${i}`).toBe(true)
    for (let i = 0; i < 4; i++) expect(byId.has(`fruit-${i}`), `fruit-${i}`).toBe(true)
    expect(byId.has('mailbox-0')).toBe(true)
    expect(byId.has('telescope-0')).toBe(true)
  })

  it('keeps species assignments stable', () => {
    expect(layout.objects.filter((o) => o.kind === 'tree').map((o) => o.species)).toEqual([
      'oak',
      'oak',
      'cherry',
      'cherry',
      'oak',
      'oak',
      'cherry',
    ])
    expect(layout.objects.filter((o) => o.kind === 'fruit').map((o) => o.species)).toEqual([
      'plum',
      'fig',
      'citrus',
      'berry',
    ])
  })

  it('mailbox and telescope are locked; everything else is not', () => {
    for (const o of layout.objects) {
      const shouldLock = o.kind === 'mailbox' || o.kind === 'telescope'
      expect(Boolean(o.locked), o.id).toBe(shouldLock)
    }
  })

  it('every base placement is placeable on the committed spec terrain', () => {
    for (const o of layout.objects) {
      expect(island.isPlaceable(o.x, o.z), `${o.id} at (${o.x}, ${o.z})`).toBe(true)
    }
  })
})
