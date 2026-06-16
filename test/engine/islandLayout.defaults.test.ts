/**
 * IslandLayout default parity — confirms that `defaultIslandLayout()` reproduces
 * the hand-authored constants in the view modules exactly.
 *
 * Anchors:
 *   - 31 objects total
 *   - Per-kind counts: 7 trees, 18 flowers, 4 fruits, 1 mailbox, 1 telescope
 *   - tree-i coords/species/scale/yaw match Tree.PLACEMENTS[i]
 *   - flower-i x/z match flowerBasePlacement(i)
 *   - fruit-i species/coords match Fruits.BUSH_PLACEMENTS[i]
 *   - mailbox-0 and telescope-0 coords and locked=true
 */

import { describe, expect, it } from 'vitest'
import {
  defaultIslandLayout,
  flowerBasePlacement,
} from '~/engine/student-space/Game/Data/islandLayout.js'

// ── View-module constants reproduced for comparison ───────────────────────────
// Tree.js PLACEMENTS (lines 66-74)
const TREE_PLACEMENTS = [
  { species: 'oak', x: 0.0, z: 0.0, scale: 0.78, yaw: 0.0 },
  { species: 'oak', x: -2.1, z: -1.6, scale: 0.52, yaw: 0.85 },
  { species: 'cherry', x: 2.4, z: -1.1, scale: 0.5, yaw: 1.6 },
  { species: 'cherry', x: -1.8, z: 2.1, scale: 0.56, yaw: -0.7 },
  { species: 'oak', x: 1.6, z: 2.4, scale: 0.54, yaw: 2.35 },
  { species: 'oak', x: -3.2, z: 0.3, scale: 0.6, yaw: -1.3 },
  { species: 'cherry', x: 3.0, z: 0.9, scale: 0.48, yaw: 2.2 },
]

// Fruits.js BUSH_PLACEMENTS (lines 36-41)
const BUSH_PLACEMENTS = [
  { species: 'plum', x: 2.6, z: 0.1 },
  { species: 'fig', x: -2.4, z: 0.9 },
  { species: 'citrus', x: 0.8, z: -2.6 },
  { species: 'berry', x: -1.0, z: -2.4 },
]

// Mailbox: x=-0.6, z=2.5 (Mailbox.js line 49)
const MAILBOX_X = -0.6
const MAILBOX_Z = 2.5

// Telescope: cos(1.30)*4.85, sin(1.30)*4.85 (Telescope.js lines 27-28)
const RIM_THETA = 1.3
const RIM_RADIUS = 4.85
const TELESCOPE_X = Math.cos(RIM_THETA) * RIM_RADIUS
const TELESCOPE_Z = Math.sin(RIM_THETA) * RIM_RADIUS

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('defaultIslandLayout() parity', () => {
  it('produces exactly 31 objects', () => {
    const layout = defaultIslandLayout()
    expect(layout.objects).toHaveLength(31)
  })

  it('v is 1', () => {
    expect(defaultIslandLayout().v).toBe(1)
  })

  it('has 7 trees, 18 flowers, 4 fruits, 1 mailbox, 1 telescope', () => {
    const objects = defaultIslandLayout().objects
    const byKind = (k: string) => objects.filter((o) => o.kind === k)
    expect(byKind('tree')).toHaveLength(7)
    expect(byKind('flower')).toHaveLength(18)
    expect(byKind('fruit')).toHaveLength(4)
    expect(byKind('mailbox')).toHaveLength(1)
    expect(byKind('telescope')).toHaveLength(1)
  })

  it('tree ids are tree-0 through tree-6', () => {
    const trees = defaultIslandLayout().objects.filter((o) => o.kind === 'tree')
    for (let i = 0; i < 7; i++) {
      expect(trees[i]?.id).toBe(`tree-${i}`)
    }
  })

  it('tree-i coords/species/scale/yaw match PLACEMENTS[i]', () => {
    const trees = defaultIslandLayout().objects.filter((o) => o.kind === 'tree')
    for (let i = 0; i < TREE_PLACEMENTS.length; i++) {
      const t = trees[i]
      const p = TREE_PLACEMENTS[i]
      expect(t?.species).toBe(p?.species)
      expect(t?.x).toBeCloseTo(p?.x ?? 0, 5)
      expect(t?.z).toBeCloseTo(p?.z ?? 0, 5)
      expect(t?.scale).toBeCloseTo(p?.scale ?? 1, 5)
      expect(t?.yaw).toBeCloseTo(p?.yaw ?? 0, 5)
    }
  })

  it('flower ids are flower-0 through flower-17', () => {
    const flowers = defaultIslandLayout().objects.filter((o) => o.kind === 'flower')
    for (let i = 0; i < 18; i++) {
      expect(flowers[i]?.id).toBe(`flower-${i}`)
    }
  })

  it('flower-0 is pinned at -1.4, 1.0', () => {
    const f0 = defaultIslandLayout().objects.find((o) => o.id === 'flower-0')
    expect(f0?.x).toBeCloseTo(-1.4, 5)
    expect(f0?.z).toBeCloseTo(1.0, 5)
  })

  it('flower-i x/z match flowerBasePlacement(i)', () => {
    const flowers = defaultIslandLayout().objects.filter((o) => o.kind === 'flower')
    for (let i = 0; i < 18; i++) {
      const f = flowers[i]
      const p = flowerBasePlacement(i)
      expect(f?.x).toBeCloseTo(p.x, 5)
      expect(f?.z).toBeCloseTo(p.z, 5)
    }
  })

  it('fruit ids are fruit-0 through fruit-3', () => {
    const fruits = defaultIslandLayout().objects.filter((o) => o.kind === 'fruit')
    for (let i = 0; i < 4; i++) {
      expect(fruits[i]?.id).toBe(`fruit-${i}`)
    }
  })

  it('fruit-i species/coords match BUSH_PLACEMENTS[i]', () => {
    const fruits = defaultIslandLayout().objects.filter((o) => o.kind === 'fruit')
    for (let i = 0; i < BUSH_PLACEMENTS.length; i++) {
      const f = fruits[i]
      const p = BUSH_PLACEMENTS[i]
      expect(f?.species).toBe(p?.species)
      expect(f?.x).toBeCloseTo(p?.x ?? 0, 5)
      expect(f?.z).toBeCloseTo(p?.z ?? 0, 5)
    }
  })

  it('mailbox-0 has correct coords and locked=true', () => {
    const mb = defaultIslandLayout().objects.find((o) => o.id === 'mailbox-0')
    expect(mb?.kind).toBe('mailbox')
    expect(mb?.x).toBeCloseTo(MAILBOX_X, 5)
    expect(mb?.z).toBeCloseTo(MAILBOX_Z, 5)
    expect(mb?.locked).toBe(true)
  })

  it('telescope-0 has correct coords and locked=true', () => {
    const tel = defaultIslandLayout().objects.find((o) => o.id === 'telescope-0')
    expect(tel?.kind).toBe('telescope')
    expect(tel?.x).toBeCloseTo(TELESCOPE_X, 5)
    expect(tel?.z).toBeCloseTo(TELESCOPE_Z, 5)
    expect(tel?.locked).toBe(true)
  })
})

describe('flowerBasePlacement', () => {
  it('index 0 returns the ceremony anchor -1.4, 1.0', () => {
    const p = flowerBasePlacement(0)
    expect(p.x).toBeCloseTo(-1.4, 5)
    expect(p.z).toBeCloseTo(1.0, 5)
  })

  it('non-zero indices return finite coords within the island radius', () => {
    const ISLAND_RADIUS = 5.0
    for (let i = 1; i < 18; i++) {
      const p = flowerBasePlacement(i)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
      const r = Math.sqrt(p.x * p.x + p.z * p.z)
      expect(r).toBeLessThanOrEqual(ISLAND_RADIUS)
    }
  })

  it('is deterministic: same index always returns same coords', () => {
    for (let i = 0; i < 18; i++) {
      const a = flowerBasePlacement(i)
      const b = flowerBasePlacement(i)
      expect(a.x).toBe(b.x)
      expect(a.z).toBe(b.z)
      expect(a.yaw).toBe(b.yaw)
    }
  })
})
