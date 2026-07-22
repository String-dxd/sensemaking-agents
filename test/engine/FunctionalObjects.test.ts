// U7: functional objects — tree.glb reskin + grey blocks. Couplings survive:
// species tint via SpeciesPalette, mailbox letters flag, move APIs, raycast
// priority order.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/engine/student-space/Game/State/State.js', () => {
  class StubState {
    static instance: StubState | null = null
    island: unknown
    islandLayout: unknown
    speciesPalette: unknown
    letters: unknown
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
vi.mock('~/engine/student-space/Game/Debug/Debug.js', () => {
  class StubDebug {
    static getInstance() {
      return { active: false, stats: null }
    }
  }
  return { default: StubDebug }
})

import Island from '~/engine/student-space/Game/State/Island.js'
import State from '~/engine/student-space/Game/State/State.js'
import { __setLoaderForTests } from '~/engine/student-space/Game/View/assetLoader.ts'
// @ts-expect-error — JS module without a .d.ts
import Mailbox from '~/engine/student-space/Game/View/Mailbox.js'
// @ts-expect-error — JS module without a .d.ts
import Tree from '~/engine/student-space/Game/View/Tree.js'
import View from '~/engine/student-space/Game/View/View.js'

type AnyState = {
  island: unknown
  islandLayout: unknown
  speciesPalette: unknown
  letters: unknown
  time: { elapsed: number; delta: number }
}

function stubGltf() {
  const scene = new THREE.Group()
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  )
  canopy.add(mesh)
  scene.add(canopy)
  return { scene }
}

function makePaletteStub(overrides: Record<string, { colorA?: string }> = {}) {
  const listeners: Array<(e: unknown) => void> = []
  return {
    overrides,
    get(kind: string, species: string) {
      return kind === 'tree' ? (overrides[species] ?? null) : null
    },
    subscribe(fn: (e: unknown) => void) {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
    emit(e: unknown) {
      for (const fn of listeners) fn(e)
    },
  }
}

function setupState(): AnyState {
  const state = (State as unknown as { getInstance(): AnyState }).getInstance()
  state.island = new Island()
  return state
}

afterEach(() => {
  __setLoaderForTests(null)
  ;(State as unknown as { instance: unknown }).instance = null
  ;(View as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

describe('Tree — species tint coupling', () => {
  it('tints per species and re-tints on speciesPalette update', async () => {
    const state = setupState()
    const palette = makePaletteStub()
    state.speciesPalette = palette
    state.islandLayout = {
      listByKind: (kind: string) =>
        kind === 'tree'
          ? [
              { id: 'tree-0', species: 'oak', x: 0, z: 0, scale: 0.7, yaw: 0 },
              { id: 'tree-1', species: 'cherry', x: 1, z: 1, scale: 0.5, yaw: 0 },
            ]
          : [],
    }
    __setLoaderForTests(async () => ({ loadAsync: async () => stubGltf() as never }))

    const tree = new Tree()
    await vi.waitFor(() => expect(tree.ready).toBe(true))

    expect(tree.entries).toHaveLength(2)
    const oakMat = tree._speciesMaterials.oak[0] as THREE.MeshStandardMaterial
    const cherryMat = tree._speciesMaterials.cherry[0] as THREE.MeshStandardMaterial
    expect(oakMat.color.getHex()).not.toBe(cherryMat.color.getHex())

    // Palette update recolors the species material in place.
    const before = oakMat.color.getHex()
    palette.overrides.oak = { colorA: '#0000ff' }
    palette.emit({ type: 'paletteChanged', kind: 'tree', species: 'oak' })
    expect(oakMat.color.getHex()).not.toBe(before)

    // move API keeps working and snaps to terrain.
    tree.moveEntry(0, 2, 2)
    expect(tree.getEntryWorldXZ(0)).toEqual({ x: 2, z: 2 })
  })

  it('growIn resolves its Promise and reveals the tree', async () => {
    const state = setupState()
    state.speciesPalette = makePaletteStub()
    state.islandLayout = {
      listByKind: (kind: string) =>
        kind === 'tree' ? [{ id: 'tree-0', species: 'oak', x: 0, z: 0, scale: 0.7, yaw: 0 }] : [],
    }
    __setLoaderForTests(async () => ({ loadAsync: async () => stubGltf() as never }))
    const tree = new Tree()
    await vi.waitFor(() => expect(tree.ready).toBe(true))
    tree.hideAll()
    const p = tree.growIn(0, { duration: 1 })
    // Drive update() until the tween lands.
    await vi.waitFor(() => {
      tree.update()
      expect(tree.entries[0].group.scale.x).toBeCloseTo(0.7, 3)
    })
    await p
    expect(tree.entries[0].group.visible).toBe(true)
  })
})

describe('Mailbox — letters flag coupling', () => {
  function makeLetters(initialUnread: number) {
    let unread = initialUnread
    const listeners: Array<() => void> = []
    return {
      unreadCount: () => unread,
      subscribe(fn: () => void) {
        listeners.push(fn)
        return () => {}
      },
      setUnread(n: number) {
        unread = n
        for (const fn of listeners) fn()
      },
    }
  }

  it('flag rises with unread letters and drops when read', () => {
    const state = setupState()
    const letters = makeLetters(0)
    state.letters = letters
    state.islandLayout = { get: () => null }

    const mailbox = new Mailbox()
    expect(mailbox._flagTarget).toBeLessThan(0) // FLAG_DOWN

    letters.setUnread(2)
    expect(mailbox._flagTarget).toBe(0) // FLAG_UP
    // ease toward the target over update ticks
    for (let i = 0; i < 120; i++) mailbox.update()
    expect(mailbox._flagCurrent).toBeCloseTo(0, 2)

    letters.setUnread(0)
    expect(mailbox._flagTarget).toBeLessThan(0)
    // the flag is a real scene object under the group (grey block + red flag)
    expect(mailbox.flag).toBeTruthy()
    expect(mailbox.group.children.length).toBeGreaterThan(1)

    // move API keeps working
    mailbox.move(1.5, -2)
    expect(mailbox.group.position.x).toBe(1.5)
    expect(mailbox.group.position.z).toBe(-2)
  })
})

describe('raycast priority order (telescope → mailbox → kira → fruit/flower/tree)', () => {
  it('the _pick source checks targets in the locked priority order', () => {
    const src = readFileSync(
      join(__dirname, '../../src/components/student-space/world/WorldInteractions.tsx'),
      'utf8',
    )
    const pickBody = src.slice(src.indexOf('_pick(clientX'))
    const order = ['telescope', 'mailbox', 'kira', 'fruit', 'flower', 'tree'].map((kind) =>
      pickBody.indexOf(`kind: '${kind}'`),
    )
    for (const idx of order) expect(idx).toBeGreaterThan(-1)
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1] ?? -1)
    }
  })
})
