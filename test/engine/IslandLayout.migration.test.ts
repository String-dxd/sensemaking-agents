// U11: persisted-position migration — hydrate-time snap (no fan, no persist),
// committed base layout validity, and store coverage.

import { describe, expect, it, vi } from 'vitest'

import committedLayout from '~/engine/student-space/Game/Data/defaultIslandLayout.json'
import { FALLBACK_ISLAND_SPEC } from '~/engine/student-space/Game/Data/fallbackIslandSpec.ts'
import Island from '~/engine/student-space/Game/State/Island.js'
import IslandLayout, {
  snapLayoutPositions,
} from '~/engine/student-space/Game/State/IslandLayout.js'
import { occupiedCellsFromSpec } from '~/engine/student-space/Game/State/islandSpecCore/snapToLand.ts'
import { validateSpecObject } from '~/engine/student-space/Game/State/islandSpecCore/specIO.ts'
import {
  cellIndex,
  worldToCell,
} from '~/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import Sprouts from '~/engine/student-space/Game/State/Sprouts.js'

const island = new Island()

function resetSingletons() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
}

/** Old-rim polar-era layout fixture: radius ~6 points (many now in the sea). */
function legacyLayoutFixture() {
  const objects = []
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * Math.PI * 2
    objects.push({
      id: `flower-${i}`,
      kind: 'flower',
      species: 'daisy',
      x: Math.cos(theta) * 6,
      z: Math.sin(theta) * 6,
      yaw: 0,
      scale: 1,
      locked: false,
    })
  }
  return { v: 1, objects }
}

describe('IslandLayout hydrate snap (U11)', () => {
  it('legacy rim positions hydrate onto land; valid positions byte-identical; idempotent', () => {
    resetSingletons()
    new Persistence({ storage: memoryAdapter() })
    const layout = new IslandLayout()
    const fixture = legacyLayoutFixture()
    const validBefore = fixture.objects.filter((o) => island.isPlaceable(o.x, o.z))

    layout.hydrate(fixture, island)
    for (const o of layout.objects) {
      expect(island.isPlaceable(o.x, o.z), `${o.id} at (${o.x}, ${o.z})`).toBe(true)
    }
    // valid inputs pass through byte-identical
    for (const v of validBefore) {
      const after = layout.objects.find((o: { id: string }) => o.id === v.id)
      if (!after) throw new Error(`missing ${v.id}`)
      expect(after.x).toBe(v.x)
      expect(after.z).toBe(v.z)
    }
    // clustered invalid objects land on DISTINCT cells
    const cells = layout.objects.map((o: { x: number; z: number }) => {
      const { c, r } = worldToCell(island.worldSize, island.spec.grid, o.x, o.z)
      return cellIndex(island.spec.grid, c, r)
    })
    expect(new Set(cells).size).toBe(cells.length)
    // never on a spec decorative-object cell or the character spawn
    const reserved = occupiedCellsFromSpec(island.spec)
    for (const cell of cells) expect(reserved.has(cell)).toBe(false)

    // idempotent: a second hydrate of the snapped output changes nothing
    const snapshot = JSON.stringify(layout.objects)
    layout.hydrate(JSON.parse(JSON.stringify({ v: 1, objects: layout.objects })), island)
    expect(JSON.stringify(layout.objects)).toBe(snapshot)
  })

  it('fires zero subscriber events and zero Persistence saves during the snap', () => {
    resetSingletons()
    const adapter = memoryAdapter()
    new Persistence({ storage: adapter })
    // Spy AFTER construction — Persistence probes the adapter once at boot.
    const saveSpy = vi.spyOn(adapter, 'setItem')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const layout = new IslandLayout()
    const events: unknown[] = []
    layout.subscribe((e: unknown) => events.push(e))
    layout.hydrate(legacyLayoutFixture(), island)
    expect(events).toEqual([])
    expect(saveSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('Sprouts hydrate snap (U11)', () => {
  it('all three stores snap; null stays null; captureRefs survive by identity', () => {
    resetSingletons()
    new Persistence({ storage: memoryAdapter() })
    const sprouts = new Sprouts()
    const events: unknown[] = []
    sprouts.subscribe((e: unknown) => events.push(e))
    const sea = { x: -11.4, z: -11.4 }
    sprouts.hydrate(
      {
        cycleIndex: 1,
        sprouts: [
          { id: 's-1', createdAt: 1, growth: 1, placementSeed: 4, position: { ...sea } },
          { id: 's-2', createdAt: 1, growth: 1, placementSeed: 5, position: null },
        ],
        bloomedTrees: [
          {
            id: 'b-1',
            treeSpecies: 'oak',
            placementSeed: 9,
            captureRefs: ['cap-1'],
            position: { x: 11.6, z: 11.6 },
          },
        ],
        decorOffsets: {
          trees: { 0: { x: -11.8, z: 0 } },
          flowers: {},
          fruits: {},
          mailbox: {},
          telescope: {},
        },
      },
      island,
    )
    const s1 = sprouts.sprouts.find((s: { id: string }) => s.id === 's-1')
    const s2 = sprouts.sprouts.find((s: { id: string }) => s.id === 's-2')
    const b1 = sprouts.bloomedTrees[0]
    if (!s1?.position || !s2) throw new Error('sprouts missing after hydrate')
    expect(island.isPlaceable(s1.position.x, s1.position.z)).toBe(true)
    expect(s2.position).toBeNull()
    if (!b1?.position) throw new Error('bloomed tree missing after hydrate')
    expect(island.isPlaceable(b1.position.x, b1.position.z)).toBe(true)
    expect(b1.captureRefs).toEqual(['cap-1'])
    const off = sprouts.getDecorOffset('tree', 0)
    expect(off).not.toBeNull()
    if (off) expect(island.isPlaceable(off.x, off.z)).toBe(true)
    expect(events).toEqual([])
  })
})

describe('committed base layout validity (U11)', () => {
  it('every default object is placeable on BOTH the committed spec and the frozen fallback', () => {
    const fallback = validateSpecObject(FALLBACK_ISLAND_SPEC)
    expect(JSON.stringify(fallback.grid)).toBe(JSON.stringify(island.spec.grid)) // one re-authoring keeps both valid
    for (const o of (committedLayout as { objects: Array<{ id: string; x: number; z: number }> })
      .objects) {
      expect(island.isPlaceable(o.x, o.z), `${o.id} at (${o.x}, ${o.z})`).toBe(true)
    }
  })

  it('a position exactly on a terrace wall snaps to an adjacent flat cell', () => {
    // find a wall midpoint between two land tiers
    const { grid, tierHeights } = island.spec
    let wall: { x: number; z: number } | null = null
    outer: for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols - 1; c++) {
        const t0 = grid.tiers[r * grid.cols + c] ?? 0
        const t1 = grid.tiers[r * grid.cols + c + 1] ?? 0
        const top0 = tierHeights[t0] ?? -9
        const top1 = tierHeights[t1] ?? -9
        if (t0 !== t1 && top0 > 0 && top1 > 0) {
          const x = -island.worldSize / 2 + (c + 1) * (island.worldSize / grid.cols)
          const z = -island.worldSize / 2 + (r + 0.5) * (island.worldSize / grid.cols)
          wall = { x, z }
          break outer
        }
      }
    }
    expect(wall).not.toBeNull()
    if (!wall) return
    const objects = [{ id: 'w', kind: 'flower', x: wall.x, z: wall.z, yaw: 0, scale: 1 }]
    snapLayoutPositions(objects, island)
    expect(island.isPlaceable(objects[0]?.x ?? 0, objects[0]?.z ?? 0)).toBe(true)
  })
})
