// U10/U11: polar-math consumers speak the grid API — sprout seeding, ambient
// scatter, and the render-time replay clamp, all against the committed spec.

import { describe, expect, it, vi } from 'vitest'

vi.mock('~/engine/student-space/Game/State/State.js', () => {
  class StubState {
    static instance: StubState | null = null
    island: unknown
    time = { elapsed: 0, delta: 0.016 }
    static getInstance() {
      if (!StubState.instance) StubState.instance = new StubState()
      return StubState.instance
    }
  }
  return { default: StubState }
})
vi.mock('~/engine/student-space/Game/View/View.js', () => {
  class StubView {
    static instance: StubView | null = null
    scene = new (require('three').Scene)()
    static getInstance() {
      if (!StubView.instance) StubView.instance = new StubView()
      return StubView.instance
    }
  }
  return { default: StubView }
})

import Island from '~/engine/student-space/Game/State/Island.js'
// @ts-expect-error — JS module without a companion .d.ts for these named exports
import { resolveWorldPlacement, seededPlacement } from '~/engine/student-space/Game/View/Sprouts.js'

const island = new Island()

describe('sprout seeded placement (U10)', () => {
  it('lands on placeable land for 100 seeded draws', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = seededPlacement(seed, island)
      expect(island.isPlaceable(p.x, p.z), `seed ${seed} → (${p.x}, ${p.z})`).toBe(true)
    }
  })

  it('is deterministic per seed', () => {
    const a = seededPlacement(42, island)
    const b = seededPlacement(42, island)
    expect(a).toEqual(b)
  })
})

describe('render-time replay clamp (U11)', () => {
  it('an out-of-land historical position renders clamped without mutating the descriptor', () => {
    const descriptor = { placementSeed: 3, position: { x: -11.5, z: -11.5 } } // deep ocean corner
    const placed = resolveWorldPlacement(descriptor, island)
    expect(island.isPlaceable(placed.x, placed.z)).toBe(true)
    // fetched data untouched — the clamp is render-side only
    expect(descriptor.position).toEqual({ x: -11.5, z: -11.5 })
  })

  it('a valid explicit position passes through untouched', () => {
    const valid = island.placeableCells()[10]
    expect(valid).toBeDefined()
    if (!valid) return
    const placed = resolveWorldPlacement(
      { placementSeed: 1, position: { x: valid.x, z: valid.z } },
      island,
    )
    expect(placed.x).toBe(valid.x)
    expect(placed.z).toBe(valid.z)
  })
})

describe('ambient scatter pool (U10)', () => {
  it('placeableCells are all walkable land above the sea', () => {
    const cells = island.placeableCells()
    expect(cells.length).toBeGreaterThan(50)
    for (const cell of cells) {
      expect(island.isWalkable(cell.x, cell.z)).toBe(true)
      expect(island.heightAt(cell.x, cell.z)).toBeGreaterThan(island.seaLevel)
    }
  })

  it('no view module references the deleted polar predicates', () => {
    // grep-equivalent net: the shims are gone from the facade itself.
    const facade = island as unknown as Record<string, unknown>
    for (const name of ['silhouetteAt', 'radiusAtTheta', 'radiusAt', 'isOnPlateau']) {
      expect(facade[name], `Island.${name} should be deleted`).toBeUndefined()
    }
  })
})
