/**
 * Plan 002 — Island Editor: applyTransform, undo/redo, drag controls.
 *
 * Tests:
 *  - applyTransform writes {x,z,yaw,scale} to layout.updateObject
 *  - y is not stored (always derived from heightAt)
 *  - off-plateau translate rejected
 *  - undo restores before, redo re-applies after
 *  - drag toggles camera.controls.enabled and restores on finish
 *  - dispose restores controls.enabled
 */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IslandLayout from '~/engine/student-space/Game/State/IslandLayout.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import EditController from '~/engine/student-space/Game/View/edit/EditController.js'

// ── Shared test helpers ────────────────────────────────────────────────────

function freshLayout() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  new Persistence({ storage: memoryAdapter() })
  return new IslandLayout()
}

function makeIslandStub() {
  return {
    heightAt: (_x: number, _z: number) => 1.0,
    isPlaceable: (x: number, z: number) => Math.abs(x) < 4 && Math.abs(z) < 4,
  }
}

function makeViewStub(layout: IslandLayout, island: ReturnType<typeof makeIslandStub>) {
  const firstTree = layout.listByKind('tree')[0]!
  const treeGroup = new THREE.Group()
  treeGroup.position.set(firstTree.x, 1, firstTree.z)

  const firstFlower = layout.listByKind('flower')[0]!
  const flowerGroup = new THREE.Group()
  flowerGroup.position.set(firstFlower.x, 1, firstFlower.z)

  const firstFruit = layout.listByKind('fruit')[0]!
  const fruitGroup = new THREE.Group()
  fruitGroup.position.set(firstFruit.x, 1, firstFruit.z)

  const mailboxGroup = new THREE.Group()
  mailboxGroup.position.set(-0.6, 1, 2.5)

  const teleGroup = new THREE.Group()
  teleGroup.position.set(2.5, 1, -1.5)

  return {
    scene: new THREE.Scene(),
    camera: {
      instance: new THREE.PerspectiveCamera(),
      controls: { enabled: true },
    },
    renderer: { instance: { domElement: document.createElement('canvas') } },
    tree: {
      entries: [
        {
          layoutId: firstTree.id,
          group: treeGroup,
          x: firstTree.x,
          z: firstTree.z,
        },
      ],
      moveEntry: (_idx: number, x: number, z: number) => {
        treeGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
    flowers: {
      flowers: [
        {
          layoutId: firstFlower.id,
          group: flowerGroup,
          x: firstFlower.x,
          z: firstFlower.z,
        },
      ],
      moveInstance: (_idx: number, x: number, z: number) => {
        flowerGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
    fruits: {
      entries: [
        {
          layoutId: firstFruit.id,
          group: fruitGroup,
          kind: 'fruit',
          x: firstFruit.x,
          z: firstFruit.z,
        },
      ],
      moveEntry: (_idx: number, x: number, z: number) => {
        fruitGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
    mailbox: {
      group: mailboxGroup,
      position: { x: -0.6, y: 1, z: 2.5 },
      move: (x: number, z: number) => {
        mailboxGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
    telescope: {
      group: teleGroup,
      move: (x: number, z: number) => {
        teleGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
  }
}

function makeStateStub(layout: IslandLayout, island: ReturnType<typeof makeIslandStub>) {
  return { island, islandLayout: layout }
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

// ── applyTransform ─────────────────────────────────────────────────────────

describe('EditController.applyTransform', () => {
  let layout: IslandLayout
  let island: ReturnType<typeof makeIslandStub>
  let controller: EditController
  let treeId: string

  beforeEach(() => {
    layout = freshLayout()
    island = makeIslandStub()
    const view = makeViewStub(layout, island)
    const state = makeStateStub(layout, island)
    controller = new EditController({ view: view as never, state: state as never })
    treeId = layout.listByKind('tree')[0]!.id
  })

  afterEach(() => controller.dispose())

  it('writes x and z to layout', () => {
    const ok = controller.applyTransform(treeId, { x: 1.5, z: -0.5 })
    expect(ok).toBe(true)
    const updated = layout.get(treeId)
    expect(updated?.x).toBeCloseTo(1.5)
    expect(updated?.z).toBeCloseTo(-0.5)
  })

  it('does not store y (y is always derived)', () => {
    controller.applyTransform(treeId, { x: 1, z: 1 })
    const updated = layout.get(treeId)
    expect((updated as Record<string, unknown>).y).toBeUndefined()
  })

  it('writes yaw to layout', () => {
    controller.applyTransform(treeId, { yaw: 1.23 })
    expect(layout.get(treeId)?.yaw).toBeCloseTo(1.23)
  })

  it('writes scale to layout', () => {
    controller.applyTransform(treeId, { scale: 2.0 })
    expect(layout.get(treeId)?.scale).toBeCloseTo(2.0)
  })

  it('off-plateau translate is rejected and layout unchanged', () => {
    const before = { x: layout.get(treeId)!.x, z: layout.get(treeId)!.z }
    const ok = controller.applyTransform(treeId, { x: 10, z: 10 })
    expect(ok).toBe(false)
    const after = layout.get(treeId)
    expect(after?.x).toBeCloseTo(before.x)
    expect(after?.z).toBeCloseTo(before.z)
  })

  it('unknown id is rejected', () => {
    const ok = controller.applyTransform('nonexistent-id', { x: 1, z: 1 })
    expect(ok).toBe(false)
  })

  it('invalid patch types are rejected', () => {
    const ok = controller.applyTransform(null as never, { x: 1 })
    expect(ok).toBe(false)
  })
})

// ── undo / redo ────────────────────────────────────────────────────────────

describe('EditController undo / redo', () => {
  let layout: IslandLayout
  let controller: EditController
  let treeId: string

  beforeEach(() => {
    layout = freshLayout()
    const island = makeIslandStub()
    const view = makeViewStub(layout, island)
    const state = makeStateStub(layout, island)
    controller = new EditController({ view: view as never, state: state as never })
    treeId = layout.listByKind('tree')[0]!.id
  })

  afterEach(() => controller.dispose())

  it('undo restores the before state', () => {
    const original = { ...layout.get(treeId)! }
    controller.applyTransform(treeId, { x: 1.5, z: -0.5 })
    expect(layout.get(treeId)?.x).toBeCloseTo(1.5)

    controller.commandStack.undo()
    expect(layout.get(treeId)?.x).toBeCloseTo(original.x)
    expect(layout.get(treeId)?.z).toBeCloseTo(original.z)
  })

  it('redo re-applies the after state', () => {
    controller.applyTransform(treeId, { x: 1.5, z: -0.5 })
    controller.commandStack.undo()
    controller.commandStack.redo()
    expect(layout.get(treeId)?.x).toBeCloseTo(1.5)
    expect(layout.get(treeId)?.z).toBeCloseTo(-0.5)
  })

  it('multiple transforms track in correct order', () => {
    const orig = layout.get(treeId)!.x
    controller.applyTransform(treeId, { x: 1.0, z: 0 })
    controller.applyTransform(treeId, { x: 2.0, z: 0 })
    controller.commandStack.undo()
    expect(layout.get(treeId)?.x).toBeCloseTo(1.0)
    controller.commandStack.undo()
    expect(layout.get(treeId)?.x).toBeCloseTo(orig)
  })
})

// ── drag controls ──────────────────────────────────────────────────────────

describe('EditController drag — camera.controls restored', () => {
  let layout: IslandLayout
  let controller: EditController
  let viewStub: ReturnType<typeof makeViewStub>

  beforeEach(() => {
    layout = freshLayout()
    const island = makeIslandStub()
    viewStub = makeViewStub(layout, island)
    const state = makeStateStub(layout, island)
    controller = new EditController({ view: viewStub as never, state: state as never })
    controller.activate()
  })

  afterEach(() => controller.dispose())

  it('dispose restores camera.controls.enabled to true', () => {
    // Manually mark controls disabled as if a drag is in progress.
    viewStub.camera.controls.enabled = false
    controller.dispose()
    expect(viewStub.camera.controls.enabled).toBe(true)
  })

  it('deactivate restores camera.controls.enabled', () => {
    viewStub.camera.controls.enabled = false
    controller.deactivate()
    expect(viewStub.camera.controls.enabled).toBe(true)
  })

  it('deactivate while active adds and removes canvas listener without error', () => {
    expect(() => controller.deactivate()).not.toThrow()
  })
})

// ── reactive sync via objectUpdated ───────────────────────────────────────

describe('EditController reactive sync', () => {
  it('layout.updateObject fans objectUpdated and controller syncs mesh', () => {
    const layout = freshLayout()
    const island = makeIslandStub()
    const viewS = makeViewStub(layout, island)
    const stateS = makeStateStub(layout, island)
    const ctrl = new EditController({ view: viewS as never, state: stateS as never })

    const treeId = layout.listByKind('tree')[0]!.id
    const treeGroup = viewS.tree.entries[0]!.group

    // Direct layout mutation (simulating undo from outside).
    layout.updateObject(treeId, { x: 3.0, z: 0.5 })

    // The controller's subscriber should have called the adapter and moved
    // the group via moveEntry.
    expect(treeGroup.position.x).toBeCloseTo(3.0)
    expect(treeGroup.position.z).toBeCloseTo(0.5)

    ctrl.dispose()
  })
})
