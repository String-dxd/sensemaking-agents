/**
 * Plan 002 — Island Editor: Selection tests.
 *
 * Tests raycast-hit → selection, deselect, and dispose clears highlight.
 *
 * These tests are fully unit-testable without WebGL — the gizmo is gone.
 * We build lightweight stubs for the adapter layer and the selection
 * highlight machinery rather than spinning up a full View.
 */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IslandLayout from '~/engine/student-space/Game/State/IslandLayout.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import CommandStack from '~/engine/student-space/Game/View/edit/CommandStack.js'
import EditController from '~/engine/student-space/Game/View/edit/EditController.js'
import Selection from '~/engine/student-space/Game/View/edit/Selection.js'

// ── Test infrastructure ────────────────────────────────────────────────────

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

/**
 * Build a minimal view stub with one tree, one flower, one fruit, a
 * mailbox, and a telescope — just enough for the adapter to find groups.
 */
function makeViewStub(layout: IslandLayout, island: ReturnType<typeof makeIslandStub>) {
  const firstTree = layout.listByKind('tree')[0]
  const firstFlower = layout.listByKind('flower')[0]
  const firstFruit = layout.listByKind('fruit')[0]

  const treeGroup = new THREE.Group()
  treeGroup.position.set(firstTree?.x ?? 0, 1, firstTree?.z ?? 0)
  const flowerGroup = new THREE.Group()
  flowerGroup.position.set(firstFlower?.x ?? 0, 1, firstFlower?.z ?? 0)
  const fruitGroup = new THREE.Group()
  fruitGroup.position.set(firstFruit?.x ?? 0, 1, firstFruit?.z ?? 0)
  const mailboxGroup = new THREE.Group()
  mailboxGroup.position.set(-0.6, 1, 2.5)
  const teleGroup = new THREE.Group()
  teleGroup.position.set(2.5, 1, -1.5)

  return {
    scene: new THREE.Scene(),
    camera: {
      instance: new THREE.PerspectiveCamera(),
      controls: { enabled: true },
      bindControls: vi.fn(),
    },
    renderer: { instance: { domElement: document.createElement('canvas') } },
    tree: {
      entries: [
        {
          layoutId: firstTree?.id ?? 'tree-0',
          group: treeGroup,
          x: firstTree?.x ?? 0,
          z: firstTree?.z ?? 0,
        },
      ],
      moveEntry: (_idx: number, x: number, z: number) => {
        treeGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
    flowers: {
      flowers: [
        {
          layoutId: firstFlower?.id ?? 'flower-0',
          group: flowerGroup,
          x: firstFlower?.x ?? 0,
          z: firstFlower?.z ?? 0,
        },
      ],
      moveInstance: (_idx: number, x: number, z: number) => {
        flowerGroup.position.set(x, island.heightAt(x, z), z)
      },
    },
    fruits: {
      entries: [
        {
          layoutId: firstFruit?.id ?? 'fruit-0',
          group: fruitGroup,
          kind: 'fruit',
          x: firstFruit?.x ?? 0,
          z: firstFruit?.z ?? 0,
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
  return {
    island,
    islandLayout: layout,
  }
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IslandLayout as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

// ── CommandStack ───────────────────────────────────────────────────────────

describe('CommandStack', () => {
  it('push and undo restores state', () => {
    const stack = new CommandStack()
    let val = 'original'
    stack.push({
      do: () => {
        val = 'modified'
      },
      undo: () => {
        val = 'original'
      },
    })
    expect(stack.undoCount).toBe(1)
    expect(stack.redoCount).toBe(0)
    stack.undo()
    expect(val).toBe('original')
    expect(stack.undoCount).toBe(0)
    expect(stack.redoCount).toBe(1)
  })

  it('redo re-applies', () => {
    const stack = new CommandStack()
    let val = 0
    stack.push({
      do: () => {
        val = 1
      },
      undo: () => {
        val = 0
      },
    })
    stack.undo()
    expect(val).toBe(0)
    stack.redo()
    expect(val).toBe(1)
  })

  it('push clears redo stack', () => {
    const stack = new CommandStack()
    stack.push({ do: vi.fn(), undo: vi.fn() })
    stack.undo()
    expect(stack.redoCount).toBe(1)
    stack.push({ do: vi.fn(), undo: vi.fn() })
    expect(stack.redoCount).toBe(0)
  })

  it('caps at 100 entries', () => {
    const stack = new CommandStack()
    for (let i = 0; i < 110; i++) {
      stack.push({ do: vi.fn(), undo: vi.fn() })
    }
    expect(stack.undoCount).toBe(100)
  })

  it('undo on empty stack is a no-op', () => {
    const stack = new CommandStack()
    expect(() => stack.undo()).not.toThrow()
  })

  it('clear removes everything', () => {
    const stack = new CommandStack()
    stack.push({ do: vi.fn(), undo: vi.fn() })
    stack.clear()
    expect(stack.undoCount).toBe(0)
  })
})

// ── Selection ──────────────────────────────────────────────────────────────

describe('Selection', () => {
  it('select stores the id', () => {
    const scene = new THREE.Scene()
    const sel = new Selection(scene)
    const obj = new THREE.Group()
    sel.select('tree-0', obj)
    expect(sel.get()).toBe('tree-0')
  })

  it('deselect clears the id', () => {
    const scene = new THREE.Scene()
    const sel = new Selection(scene)
    const obj = new THREE.Group()
    sel.select('tree-0', obj)
    sel.deselect()
    expect(sel.get()).toBeNull()
  })

  it('onChange fires on select', () => {
    const scene = new THREE.Scene()
    const sel = new Selection(scene)
    const ids: Array<string | null> = []
    sel.onChange((id: string | null) => ids.push(id))
    sel.select('tree-0', new THREE.Group())
    expect(ids).toEqual(['tree-0'])
  })

  it('onChange fires on deselect with null', () => {
    const scene = new THREE.Scene()
    const sel = new Selection(scene)
    const ids: Array<string | null> = []
    sel.onChange((id: string | null) => ids.push(id))
    sel.select('tree-0', new THREE.Group())
    sel.deselect()
    expect(ids).toEqual(['tree-0', null])
  })

  it('dispose clears id and removes helper from scene', () => {
    const scene = new THREE.Scene()
    const sel = new Selection(scene)
    sel.select('tree-0', new THREE.Group())
    const childCountAfterSelect = scene.children.length
    expect(childCountAfterSelect).toBeGreaterThan(0)
    sel.dispose()
    expect(sel.get()).toBeNull()
    // Helpers removed — scene children should decrease.
    expect(scene.children.length).toBeLessThan(childCountAfterSelect)
  })

  it('unsubscribe removes callback', () => {
    const scene = new THREE.Scene()
    const sel = new Selection(scene)
    let count = 0
    const unsub = sel.onChange(() => count++)
    sel.select('tree-0', new THREE.Group())
    unsub()
    sel.deselect()
    expect(count).toBe(1) // only the select fired
  })
})

// ── EditController — selection ─────────────────────────────────────────────

describe('EditController — selection', () => {
  let layout: IslandLayout
  let island: ReturnType<typeof makeIslandStub>
  let viewStub: ReturnType<typeof makeViewStub>
  let stateStub: ReturnType<typeof makeStateStub>
  let controller: EditController

  beforeEach(() => {
    layout = freshLayout()
    island = makeIslandStub()
    viewStub = makeViewStub(layout, island)
    stateStub = makeStateStub(layout, island)
    controller = new EditController({ view: viewStub as never, state: stateStub as never })
  })

  afterEach(() => {
    controller.dispose()
  })

  it('starts inactive with no selection', () => {
    expect(controller.selection.get()).toBeNull()
  })

  it('activate/deactivate do not throw', () => {
    expect(() => {
      controller.activate()
      controller.deactivate()
    }).not.toThrow()
  })

  it('dispose restores camera.controls.enabled', () => {
    viewStub.camera.controls.enabled = false
    controller.dispose()
    expect(viewStub.camera.controls.enabled).toBe(true)
  })
})
