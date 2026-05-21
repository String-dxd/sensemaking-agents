/**
 * Unit coverage for U6 — `SproutsView.setTimelapseSubset` and the
 * factored `_disposeBloomedNode` helper.
 *
 * Tests the diff logic directly against the prototype methods, with a
 * lightweight stub `this` shape. We avoid constructing a real SproutsView
 * because that requires a full engine boot (scene, camera, island
 * heightfield, slice singletons, GLSL-using View modules).
 *
 * Plan-006 U6 test scenarios this file covers:
 *   - empty → 3-element subset: spawns three nodes
 *   - 3-element subset → 2-element subset: removes the one not in target
 *   - any subset → null: restores live-slice state
 *   - non-empty → empty array: disposes all nodes
 *   - critical invariant: `state.sprouts` is never mutated by these methods
 *   - dispose helper cleans both THREE objects and the `bloomedNodes` Map
 */

import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error — Sprouts.js is JS without a companion .d.ts (View modules
// are intentionally untyped per the engine-substrate doctrine).
import SproutsView from '~/engine/student-space/Game/View/Sprouts.js'

function makeStubThis() {
  const removeFromRoot = vi.fn()
  const root = { remove: removeFromRoot }
  const liveTrees = [
    { id: 'live-1', species: 'tree', placementSeed: 1 },
    { id: 'live-2', species: 'flower', placementSeed: 2 },
  ]
  // Track if any mutating slice method gets called — none should be.
  const mutationProbe = {
    bloom: vi.fn(),
    hydrate: vi.fn(),
    add: vi.fn(),
    markReady: vi.fn(),
    moveBloomedTree: vi.fn(),
  }
  const state = {
    sprouts: {
      listBloomedTrees: vi.fn(() => liveTrees),
      ...mutationProbe,
    },
  }
  const bloomedNodes = new Map()
  // Each entry holds a mock group with a traverse() that visits nothing
  // (we don't actually allocate THREE geometries in this test). The
  // important thing is the Map shape: id → { group } for _disposeBloomedNode.
  const spawnSpy = vi.fn((tree: { id: string }) => {
    bloomedNodes.set(tree.id, {
      tree,
      group: { traverse: vi.fn() },
    })
  })
  // Bind the real prototype methods so they see the stub's `this`.
  const self = {
    bloomedNodes,
    root,
    state,
    _spawnBloomedTree: spawnSpy,
    _disposeBloomedNode: SproutsView.prototype._disposeBloomedNode,
  }
  return { self, removeFromRoot, spawnSpy, mutationProbe, liveTrees }
}

describe('SproutsView.setTimelapseSubset', () => {
  it('spawns nodes for ids present in the target but not in bloomedNodes', () => {
    const { self, spawnSpy, mutationProbe } = makeStubThis()
    const target = [
      { id: 'a', species: 'tree', placementSeed: 1 },
      { id: 'b', species: 'flower', placementSeed: 2 },
      { id: 'c', species: 'butterfly', placementSeed: 3 },
    ]

    SproutsView.prototype.setTimelapseSubset.call(self, target)

    expect(spawnSpy).toHaveBeenCalledTimes(3)
    expect(self.bloomedNodes.size).toBe(3)
    expect(self.bloomedNodes.has('a')).toBe(true)
    expect(self.bloomedNodes.has('b')).toBe(true)
    expect(self.bloomedNodes.has('c')).toBe(true)
    // Spawn is called with animate=false for historical state.
    expect(spawnSpy).toHaveBeenCalledWith(target[0], false)
    // CRITICAL INVARIANT: no slice mutations.
    expect(mutationProbe.bloom).not.toHaveBeenCalled()
    expect(mutationProbe.hydrate).not.toHaveBeenCalled()
    expect(mutationProbe.add).not.toHaveBeenCalled()
  })

  it('removes nodes present in bloomedNodes but not in the target', () => {
    const { self, spawnSpy, removeFromRoot } = makeStubThis()
    // Seed three nodes.
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
      { id: 'c', species: 'butterfly' },
    ])
    spawnSpy.mockClear()
    removeFromRoot.mockClear()

    // Reduce to two — `c` should be disposed.
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
    ])

    expect(self.bloomedNodes.size).toBe(2)
    expect(self.bloomedNodes.has('c')).toBe(false)
    expect(removeFromRoot).toHaveBeenCalledTimes(1)
    // a and b are unchanged — no respawn.
    expect(spawnSpy).not.toHaveBeenCalled()
  })

  it('no-ops on ids present in both target and bloomedNodes (preserves existing nodes)', () => {
    const { self, spawnSpy } = makeStubThis()
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
    ])
    const aRef = self.bloomedNodes.get('a')
    const bRef = self.bloomedNodes.get('b')
    spawnSpy.mockClear()

    // Re-apply the exact same subset — nothing should change.
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
    ])

    expect(spawnSpy).not.toHaveBeenCalled()
    expect(self.bloomedNodes.get('a')).toBe(aRef)
    expect(self.bloomedNodes.get('b')).toBe(bRef)
  })

  it('empty array disposes every node', () => {
    const { self, removeFromRoot } = makeStubThis()
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
    ])
    removeFromRoot.mockClear()

    SproutsView.prototype.setTimelapseSubset.call(self, [])

    expect(self.bloomedNodes.size).toBe(0)
    expect(removeFromRoot).toHaveBeenCalledTimes(2)
  })

  it('null restores live slice state by re-reading state.sprouts.listBloomedTrees()', () => {
    const { self, liveTrees, spawnSpy } = makeStubThis()
    // Apply a non-live subset first.
    SproutsView.prototype.setTimelapseSubset.call(self, [{ id: 'historical', species: 'tree' }])
    expect(self.bloomedNodes.has('historical')).toBe(true)
    spawnSpy.mockClear()

    // null → restore live.
    SproutsView.prototype.setTimelapseSubset.call(self, null)

    expect(self.state.sprouts.listBloomedTrees).toHaveBeenCalled()
    expect(self.bloomedNodes.has('historical')).toBe(false)
    for (const liveTree of liveTrees) {
      expect(self.bloomedNodes.has(liveTree.id)).toBe(true)
    }
  })

  it('repeated calls produce O(delta) spawns, not O(N) full rebuilds', () => {
    const { self, spawnSpy } = makeStubThis()
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
      { id: 'c', species: 'butterfly' },
    ])
    expect(spawnSpy).toHaveBeenCalledTimes(3)
    spawnSpy.mockClear()

    // Swap one element: c → d. Should produce exactly 1 spawn, not 4.
    SproutsView.prototype.setTimelapseSubset.call(self, [
      { id: 'a', species: 'tree' },
      { id: 'b', species: 'flower' },
      { id: 'd', species: 'fruit' },
    ])
    expect(spawnSpy).toHaveBeenCalledTimes(1)
    expect(spawnSpy).toHaveBeenCalledWith({ id: 'd', species: 'fruit' }, false)
  })

  it('never mutates state.sprouts across multiple calls', () => {
    const { self, mutationProbe } = makeStubThis()
    const sequences = [
      [{ id: 'a', species: 'tree' }],
      [
        { id: 'a', species: 'tree' },
        { id: 'b', species: 'flower' },
      ],
      [],
      null,
      [{ id: 'c', species: 'butterfly' }],
    ]
    for (const subset of sequences) {
      SproutsView.prototype.setTimelapseSubset.call(self, subset)
    }
    expect(mutationProbe.bloom).not.toHaveBeenCalled()
    expect(mutationProbe.hydrate).not.toHaveBeenCalled()
    expect(mutationProbe.add).not.toHaveBeenCalled()
    expect(mutationProbe.markReady).not.toHaveBeenCalled()
    expect(mutationProbe.moveBloomedTree).not.toHaveBeenCalled()
  })
})

describe('SproutsView._disposeBloomedNode', () => {
  it('removes the node from the Map and from the THREE root', () => {
    const { self, removeFromRoot } = makeStubThis()
    SproutsView.prototype.setTimelapseSubset.call(self, [{ id: 'a', species: 'tree' }])
    expect(self.bloomedNodes.size).toBe(1)
    removeFromRoot.mockClear()

    SproutsView.prototype._disposeBloomedNode.call(self, 'a')

    expect(self.bloomedNodes.size).toBe(0)
    expect(self.bloomedNodes.has('a')).toBe(false)
    expect(removeFromRoot).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when the id is not in bloomedNodes', () => {
    const { self, removeFromRoot } = makeStubThis()
    expect(() =>
      SproutsView.prototype._disposeBloomedNode.call(self, 'never-existed'),
    ).not.toThrow()
    expect(removeFromRoot).not.toHaveBeenCalled()
  })
})
