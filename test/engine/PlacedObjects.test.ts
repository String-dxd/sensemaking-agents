// U6: GLB lane + decorative objects view — loader wiring, dispose safety,
// error fallback, committed-spec render counts, pick-list closure.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Stub the engine singletons so the view constructs without the full graph.
vi.mock('~/engine/student-space/Game/State/State.js', () => {
  class StubState {
    static instance: StubState | null = null
    island: unknown
    time = { elapsed: 0, delta: 0 }
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
import State from '~/engine/student-space/Game/State/State.js'
import {
  __setLoaderForTests,
  loadGlb,
  MODEL_URLS,
} from '~/engine/student-space/Game/View/assetLoader.ts'
// @ts-expect-error — PlacedObjects.js is JS without a companion .d.ts.
import PlacedObjects from '~/engine/student-space/Game/View/PlacedObjects.js'
import View from '~/engine/student-space/Game/View/View.js'

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void }

function stubGltf() {
  const scene = new THREE.Group()
  const canopy = new THREE.Group()
  canopy.name = 'canopy'
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  canopy.add(mesh)
  scene.add(canopy)
  return { scene }
}

function setupWorld() {
  const state = (State as unknown as { getInstance(): { island: unknown } }).getInstance()
  state.island = new Island()
  const view = (View as unknown as { getInstance(): { scene: THREE.Scene } }).getInstance()
  view.scene.clear()
  return { state, view }
}

afterEach(() => {
  __setLoaderForTests(null)
  ;(State as unknown as { instance: unknown }).instance = null
  ;(View as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

describe('assetLoader', () => {
  it('caches loads by URL and never rejects on failure (placeholder path)', async () => {
    let calls = 0
    __setLoaderForTests(async () => ({
      loadAsync: async (url: string) => {
        calls++
        if (url.includes('rock')) throw new Error('404')
        return stubGltf() as never
      },
    }))
    const a = loadGlb(MODEL_URLS.tree)
    const b = loadGlb(MODEL_URLS.tree)
    expect(b).toBe(a) // cached promise identity
    await expect(a).resolves.toBeTruthy()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(loadGlb(MODEL_URLS.rock)).resolves.toBeNull() // resolves, never rejects
    expect(err).toHaveBeenCalled()
    expect(calls).toBe(2)
  })

  it('the default loader factory registers the meshopt decoder before any load', () => {
    // Source-level wiring assertion: decoder registration happens inside the
    // loader factory (awaiting MeshoptDecoder.ready and calling
    // setMeshoptDecoder before the loader is handed out), so no call path can
    // reach loadAsync without it — a missing decoder throws inside three.
    const src = readFileSync(
      join(__dirname, '../../src/engine/student-space/Game/View/assetLoader.ts'),
      'utf8',
    )
    const factory = src.slice(src.indexOf('async function defaultLoaderFactory'))
    const readyIdx = factory.indexOf('await MeshoptDecoder.ready')
    const setIdx = factory.indexOf('setMeshoptDecoder')
    const returnIdx = factory.indexOf('return loader')
    expect(readyIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(readyIdx)
    expect(returnIdx).toBeGreaterThan(setIdx)
  })
})

describe('PlacedObjects', () => {
  it('renders 19 trees + 0 bushes + 0 rocks from the committed spec and skips the character', async () => {
    // 2026-07-23 re-authoring: the committed island now carries 19 trees.
    setupWorld()
    __setLoaderForTests(async () => ({ loadAsync: async () => stubGltf() as never }))
    const po = new PlacedObjects()
    await po.ready
    expect(po.group.children).toHaveLength(19)
    // wind springs registered for every tree canopy
    expect(po._springs).toHaveLength(19)
  })

  it('dispose during an in-flight load never adds to the scene', async () => {
    setupWorld()
    const deferreds: Deferred[] = []
    __setLoaderForTests(async () => ({
      loadAsync: () =>
        new Promise((resolve, reject) => {
          deferreds.push({ resolve, reject })
        }) as never,
    }))
    const po = new PlacedObjects()
    // Let the loader factory microtask run so loadAsync is actually in flight…
    await new Promise((r) => setTimeout(r, 0))
    expect(deferreds.length).toBeGreaterThan(0)
    // …then dispose BEFORE the load resolves.
    po.dispose()
    for (const d of deferreds) d.resolve(stubGltf())
    await po.ready
    expect(po.group.children).toHaveLength(0)
  })

  it('load errors keep ready settling with no unhandled rejection and an empty layer', async () => {
    setupWorld()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    __setLoaderForTests(async () => ({
      loadAsync: async () => {
        throw new Error('network down')
      },
    }))
    const po = new PlacedObjects()
    await expect(po.ready).resolves.toBeUndefined()
    expect(po.group.children).toHaveLength(0)
  })

  it('pick-list closure: neither pick surface references the decorative view', () => {
    // Both pick surfaces intersect explicit registered group lists; the
    // decorative view stays excluded by never being registered. Regression-
    // assert at the source level.
    const worldInteractions = readFileSync(
      join(__dirname, '../../src/components/student-space/world/WorldInteractions.tsx'),
      'utf8',
    )
    const sprouts = readFileSync(
      join(__dirname, '../../src/engine/student-space/Game/View/Sprouts.js'),
      'utf8',
    )
    expect(worldInteractions).not.toMatch(/placedObjects/i)
    expect(sprouts).not.toMatch(/placedObjects/i)
  })
})
