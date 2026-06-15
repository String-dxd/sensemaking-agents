/**
 * Plan 003 — Island Editor: spawn / remove reconcile tests.
 *
 * Verifies that addObject / removeObject triggers ensureFromLayout on the
 * correct view stub, and that _reconcileAfterStructural in EditController
 * delegates to the right per-kind handler.
 */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IslandLayout from '~/engine/student-space/Game/State/IslandLayout.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import EditController from '~/engine/student-space/Game/View/edit/EditController.js'

// ── Test infrastructure ────────────────────────────────────────────────────

function freshLayout() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  new Persistence({ storage: memoryAdapter() })
  return new IslandLayout()
}

function makeIsland() {
  return {
    heightAt: (_x: number, _z: number) => 0,
    isPlaceable: (x: number, z: number) => Math.abs(x) < 5 && Math.abs(z) < 5,
  }
}

function makeViewStub(layout: IslandLayout, island: ReturnType<typeof makeIsland>) {
  const firstTree = layout.listByKind('tree')[0]
  const firstFlower = layout.listByKind('flower')[0]
  const firstFruit = layout.listByKind('fruit')[0]

  const treeGroup = new THREE.Group()
  const flowerGroup = new THREE.Group()
  const fruitGroup = new THREE.Group()
  const mailboxGroup = new THREE.Group()
  const teleGroup = new THREE.Group()

  return {
    scene: new THREE.Scene(),
    camera: {
      instance: new THREE.PerspectiveCamera(),
      controls: { enabled: true },
      bindControls: vi.fn(),
    },
    renderer: { instance: { domElement: document.createElement('canvas') } },
    tree: {
      ready: true,
      entries: [{ layoutId: firstTree?.id ?? 'tree-0', group: treeGroup }],
      ensureFromLayout: vi.fn(),
    },
    flowers: {
      flowers: [{ layoutId: firstFlower?.id ?? 'flower-0', group: flowerGroup }],
      ensureFromLayout: vi.fn(),
    },
    fruits: {
      entries: [{ layoutId: firstFruit?.id ?? 'fruit-0', group: fruitGroup }],
      ensureFromLayout: vi.fn(),
    },
    mailbox: {
      group: mailboxGroup,
      move: vi.fn((x: number, z: number) => {
        mailboxGroup.position.set(x, island.heightAt(x, z), z)
      }),
    },
    telescope: {
      group: teleGroup,
      move: vi.fn((x: number, z: number) => {
        teleGroup.position.set(x, island.heightAt(x, z), z)
      }),
    },
  }
}

function makeState(layout: IslandLayout, island: ReturnType<typeof makeIsland>) {
  return { island, islandLayout: layout }
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

// ── Spawn / remove reconcile via EditController ───────────────────────────

describe('EditController spawn/remove reconcile', () => {
  it('addObject(flower) calls flowers.ensureFromLayout with updated list', () => {
    const layout = freshLayout()
    const island = makeIsland()
    const view = makeViewStub(layout, island)
    const state = makeState(layout, island)

    const ctrl = new EditController({ view: view as never, state: state as never })
    ctrl.activate()

    const beforeCount = layout.listByKind('flower').length

    layout.addObject({ id: 'flower-new', kind: 'flower', species: 'daisy', x: 0.5, z: 0.5 })

    expect(layout.listByKind('flower').length).toBe(beforeCount + 1)
    expect(view.flowers.ensureFromLayout).toHaveBeenCalled()
    const lastCall = (view.flowers.ensureFromLayout as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )![0] as { id: string }[]
    expect(lastCall.some((o) => o.id === 'flower-new')).toBe(true)

    ctrl.dispose()
  })

  it('addObject(tree) calls tree.ensureFromLayout', () => {
    const layout = freshLayout()
    const island = makeIsland()
    const view = makeViewStub(layout, island)
    const state = makeState(layout, island)

    const ctrl = new EditController({ view: view as never, state: state as never })
    ctrl.activate()

    layout.addObject({ id: 'tree-new', kind: 'tree', species: 'oak', x: 1.0, z: 1.0 })

    expect(view.tree.ensureFromLayout).toHaveBeenCalled()

    ctrl.dispose()
  })

  it('addObject(fruit) calls fruits.ensureFromLayout', () => {
    const layout = freshLayout()
    const island = makeIsland()
    const view = makeViewStub(layout, island)
    const state = makeState(layout, island)

    const ctrl = new EditController({ view: view as never, state: state as never })
    ctrl.activate()

    layout.addObject({ id: 'fruit-new', kind: 'fruit', species: 'plum', x: 2.0, z: 0.5 })

    expect(view.fruits.ensureFromLayout).toHaveBeenCalled()

    ctrl.dispose()
  })

  it('removeObject(flower) calls flowers.ensureFromLayout with reduced list', () => {
    const layout = freshLayout()
    const island = makeIsland()
    const view = makeViewStub(layout, island)
    const state = makeState(layout, island)

    const firstFlowerId = layout.listByKind('flower')[0]!.id

    const ctrl = new EditController({ view: view as never, state: state as never })
    ctrl.activate()
    ;(view.flowers.ensureFromLayout as ReturnType<typeof vi.fn>).mockClear()

    layout.removeObject(firstFlowerId)

    expect(view.flowers.ensureFromLayout).toHaveBeenCalled()
    const lastCall = (view.flowers.ensureFromLayout as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )![0] as { id: string }[]
    expect(lastCall.some((o) => o.id === firstFlowerId)).toBe(false)

    ctrl.dispose()
  })

  it('revertToDefault triggers all-kind reconcile (layoutReplaced)', () => {
    const layout = freshLayout()
    const island = makeIsland()
    const view = makeViewStub(layout, island)
    const state = makeState(layout, island)

    const ctrl = new EditController({ view: view as never, state: state as never })
    ctrl.activate()
    ;(view.tree.ensureFromLayout as ReturnType<typeof vi.fn>).mockClear()
    ;(view.flowers.ensureFromLayout as ReturnType<typeof vi.fn>).mockClear()
    ;(view.fruits.ensureFromLayout as ReturnType<typeof vi.fn>).mockClear()

    // Diverge then revert.
    layout.addObject({ id: 'tmp-flower', kind: 'flower', species: 'daisy', x: 0, z: 0 })
    ;(view.flowers.ensureFromLayout as ReturnType<typeof vi.fn>).mockClear()

    layout.revertToDefault()

    expect(view.tree.ensureFromLayout).toHaveBeenCalled()
    expect(view.flowers.ensureFromLayout).toHaveBeenCalled()
    expect(view.fruits.ensureFromLayout).toHaveBeenCalled()

    ctrl.dispose()
  })
})
