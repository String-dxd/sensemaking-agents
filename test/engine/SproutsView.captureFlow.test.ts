/**
 * Unit coverage for plan 075 — capture cinematic elevated growth:
 *
 *  - seededPlacement() lands only on elevated (grid tier >= 2) cells
 *    against the real committed island spec, with the fallback pool
 *    owned by Island.elevatedPlaceableCells() itself
 *  - the per-capture camera flow (_startCameraFlow / _tickCameraFlow)
 *    defers instead of firing while the capture overlay is open or the
 *    camera is otherwise busy (Camera._zoom / _saveStack), draining once
 *    the overlay closes and the camera settles (or after a timeout)
 *  - the Kira narrator confirmation beat opens during the camera hold
 *    and keeps the close-up parked until the student presses OK
 *
 * Tests the diff logic directly against the prototype methods, with a
 * lightweight stub `this` shape — modeled on
 * test/engine/SproutsView.timelapse.test.ts. We avoid constructing a real
 * SproutsView because that requires a full engine boot (scene, camera,
 * island heightfield, slice singletons, GLSL-using View modules).
 */

import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Island from '~/engine/student-space/Game/State/Island.js'
import {
  cellIndex,
  worldToCell,
} from '~/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts'
// @ts-expect-error — Sprouts.js is JS without a companion .d.ts (View modules
// are intentionally untyped per the engine-substrate doctrine).
import SproutsView, { seededPlacement } from '~/engine/student-space/Game/View/Sprouts.js'

afterEach(() => {
  document.body.className = ''
})

describe('seededPlacement — elevated pool', () => {
  it('every seed lands on a grid cell with tier >= 2 against the committed spec', () => {
    const island = new Island()
    const { grid } = island.spec

    // Committed island should never be beach-only — an empty elevated pool
    // would be a spec/tier-semantics regression, not something to paper over.
    expect(island.elevatedPlaceableCells().length).toBeGreaterThan(0)

    for (let i = 0; i < 120; i++) {
      const seed = (i * 2654435761) >>> 0
      const { x, z } = seededPlacement(seed, island)
      const { c, r } = worldToCell(island.worldSize, grid, x, z)
      const tier = grid.tiers[cellIndex(grid, c, r)]
      expect(tier).toBeGreaterThanOrEqual(2)
    }
  })

  it('falls back to whatever elevatedPlaceableCells() returns — the method owns the fallback, not the view', () => {
    const fakeIsland = {
      elevatedPlaceableCells: () => [{ x: 3, z: 4, tier: 1 }],
    }
    const { x, z } = seededPlacement(42, fakeIsland as unknown as Island)
    expect(x).toBe(3)
    expect(z).toBe(4)
  })
})

function makeCameraFlowStub(id = 'sprout-1') {
  const zoomTo = vi.fn()
  const restoreZoom = vi.fn()
  const self = {
    nodes: new Map([[id, { group: { position: new THREE.Vector3(0, 1, 0) } }]]),
    _editMode: false,
    _camFlow: null as unknown,
    _pendingCamFlow: null as unknown,
    _tmpVec: new THREE.Vector3(),
    view: {
      camera: {
        instance: { position: new THREE.Vector3(5, 5, 5) },
        zoomTo,
        restoreZoom,
      },
      kiraNarrator: undefined as unknown,
    },
    _shouldDeferCameraFlow: SproutsView.prototype._shouldDeferCameraFlow,
    _drainPendingCamFlow: SproutsView.prototype._drainPendingCamFlow,
    _startCameraFlow: SproutsView.prototype._startCameraFlow,
    _tickCameraFlow: SproutsView.prototype._tickCameraFlow,
    _returnCamera: SproutsView.prototype._returnCamera,
    _openFlowNarrator: SproutsView.prototype._openFlowNarrator,
    _closeFlowNarrator: SproutsView.prototype._closeFlowNarrator,
    _triggerBloom: vi.fn(() => true),
  }
  return { self, zoomTo, restoreZoom }
}

describe('SproutsView — capture camera flow deferral', () => {
  it('queues behind the capture sheet instead of starting, then drains once the overlay closes', () => {
    const { self, zoomTo } = makeCameraFlowStub()
    document.body.classList.add('has-capture-sheet')

    self._startCameraFlow.call(self, 'sprout-1', { autoBloom: false })

    expect(zoomTo).not.toHaveBeenCalled()
    expect(self._pendingCamFlow).toMatchObject({ sproutId: 'sprout-1', autoBloom: false })
    expect(self._camFlow).toBeNull()

    document.body.classList.remove('has-capture-sheet')
    self._drainPendingCamFlow.call(self, performance.now())

    expect(zoomTo).toHaveBeenCalledTimes(1)
    expect(self._pendingCamFlow).toBeNull()
    expect((self._camFlow as { phase: string }).phase).toBe('flying')
  })

  it('queues behind the has-chooser overlay class too', () => {
    const { self, zoomTo } = makeCameraFlowStub()
    document.body.classList.add('has-chooser')

    self._startCameraFlow.call(self, 'sprout-1', { autoBloom: false })

    expect(zoomTo).not.toHaveBeenCalled()
    expect(self._pendingCamFlow).not.toBeNull()
  })

  it('waits for a busy camera (save-stack held) and flies only after the timeout elapses', () => {
    const { self, zoomTo } = makeCameraFlowStub()
    ;(self.view.camera as unknown as { _saveStack: Map<string, unknown> })._saveStack = new Map([
      ['capture', {}],
    ])

    self._startCameraFlow.call(self, 'sprout-1', { autoBloom: false })
    expect(zoomTo).not.toHaveBeenCalled()
    const queuedAtMs = (self._pendingCamFlow as { queuedAtMs: number }).queuedAtMs

    // Still busy, short elapsed — stays pending.
    self._drainPendingCamFlow.call(self, queuedAtMs + 100)
    expect(zoomTo).not.toHaveBeenCalled()
    expect(self._pendingCamFlow).not.toBeNull()

    // Past the timeout — flies anyway even though the camera is still busy.
    self._drainPendingCamFlow.call(self, queuedAtMs + 4001)
    expect(zoomTo).toHaveBeenCalledTimes(1)
    expect(self._pendingCamFlow).toBeNull()
  })

  it('merges autoBloom true-wins when a rapid grow-then-ready pair queues behind one sheet', () => {
    const { self } = makeCameraFlowStub()
    document.body.classList.add('has-capture-sheet')

    self._startCameraFlow.call(self, 'sprout-1', { autoBloom: true })
    self._startCameraFlow.call(self, 'sprout-1', { autoBloom: false })

    expect((self._pendingCamFlow as { autoBloom: boolean }).autoBloom).toBe(true)
  })
})

describe('SproutsView — narrator confirmation beat', () => {
  function makeNarratorStub(id = 'sprout-1') {
    const restoreZoom = vi.fn()
    const speak = vi.fn(function (
      this: { isActive: boolean },
      _opts: {
        text: string
        cta?: string
        dismissible?: boolean
        onConfirm?: () => void
      },
    ) {
      this.isActive = true
    })
    const close = vi.fn(function (this: { isActive: boolean }) {
      this.isActive = false
    })
    const kiraNarrator = { isActive: false, speak, close }
    const self = {
      nodes: new Map([[id, { group: { position: new THREE.Vector3(0, 1, 0) } }]]),
      _camFlow: null as unknown,
      view: {
        camera: {
          instance: { position: new THREE.Vector3(5, 5, 5) },
          zoomTo: vi.fn(),
          restoreZoom,
        },
        kiraNarrator,
      },
      _tmpVec: new THREE.Vector3(),
      _triggerBloom: vi.fn(() => true),
      _returnCamera: SproutsView.prototype._returnCamera,
      _tickCameraFlow: SproutsView.prototype._tickCameraFlow,
      _openFlowNarrator: SproutsView.prototype._openFlowNarrator,
      _closeFlowNarrator: SproutsView.prototype._closeFlowNarrator,
      _confirmFlowNarrator: SproutsView.prototype._confirmFlowNarrator,
    }
    return { self, kiraNarrator, speak, close, restoreZoom }
  }

  it('opens the narrator with the grow copy when the flow reaches the holding phase', () => {
    const { self, speak } = makeNarratorStub()
    const t0 = performance.now()
    self._camFlow = { sproutId: 'sprout-1', phase: 'flying', startMs: t0, autoBloom: false }

    self._tickCameraFlow.call(self, t0 + 510)

    expect((self._camFlow as { phase: string }).phase).toBe('holding')
    expect(speak).toHaveBeenCalledTimes(1)
    expect(speak.mock.calls[0]?.[0]?.text).toMatch(/growing/)
    expect(speak.mock.calls[0]?.[0]).toMatchObject({
      cta: 'OK',
      dismissible: false,
      onConfirm: expect.any(Function),
    })
    expect((self._camFlow as { narratorOpened: boolean }).narratorOpened).toBe(true)
  })

  it('keeps the dialog and close-up parked until the student presses OK', () => {
    const { self, speak, close, restoreZoom } = makeNarratorStub()
    const t0 = performance.now()
    self._camFlow = { sproutId: 'sprout-1', phase: 'flying', startMs: t0, autoBloom: false }
    self._tickCameraFlow.call(self, t0 + 510) // → holding, narrator opens
    expect((self._camFlow as { phase: string }).phase).toBe('holding')
    const holdStart = (self._camFlow as { startMs: number }).startMs

    // Elapsed time alone must never dismiss the confirmation or restore
    // the camera — the student controls when this beat finishes.
    self._tickCameraFlow.call(self, holdStart + 60_000)
    expect((self._camFlow as { phase: string }).phase).toBe('holding')
    expect(close).not.toHaveBeenCalled()
    expect(restoreZoom).not.toHaveBeenCalled()

    speak.mock.calls[0]?.[0]?.onConfirm?.()
    expect(close).toHaveBeenCalledTimes(1)
    expect(restoreZoom).toHaveBeenCalledTimes(1)
    expect((self._camFlow as { phase: string }).phase).toBe('returning')
  })

  it('lets auto-bloom finish while parked and returns only after OK', () => {
    const { self, speak, close, restoreZoom } = makeNarratorStub()
    const t0 = performance.now()
    self._camFlow = { sproutId: 'sprout-1', phase: 'flying', startMs: t0, autoBloom: true }
    self._tickCameraFlow.call(self, t0 + 510) // → holding, narrator opens
    const holdStart = (self._camFlow as { startMs: number }).startMs

    self._tickCameraFlow.call(self, holdStart + 360) // → blooming
    expect((self._camFlow as { phase: string }).phase).toBe('blooming')
    const bloomStart = (self._camFlow as { startMs: number }).startMs
    self._tickCameraFlow.call(self, bloomStart + 60_000)

    expect((self._camFlow as { phase: string }).phase).toBe('awaiting-confirmation')
    expect(close).not.toHaveBeenCalled()
    expect(restoreZoom).not.toHaveBeenCalled()

    speak.mock.calls[0]?.[0]?.onConfirm?.()
    expect(close).toHaveBeenCalledTimes(1)
    expect(restoreZoom).toHaveBeenCalledTimes(1)
    expect((self._camFlow as { phase: string }).phase).toBe('returning')
  })

  it('does not reopen an already-active narrator, and falls back to the short hold', () => {
    const { self, kiraNarrator, speak } = makeNarratorStub()
    kiraNarrator.isActive = true // some other conversation is already open
    const t0 = performance.now()
    self._camFlow = { sproutId: 'sprout-1', phase: 'flying', startMs: t0, autoBloom: false }

    self._tickCameraFlow.call(self, t0 + 510) // → holding

    expect(speak).not.toHaveBeenCalled()
    expect((self._camFlow as { narratorOpened: boolean }).narratorOpened).toBeFalsy()

    // Falls back to the plain 500ms hold (CAM_HOLD_MS) instead of NARRATOR_HOLD_MS.
    const holdStart = (self._camFlow as { startMs: number }).startMs
    self._tickCameraFlow.call(self, holdStart + 510)
    expect((self._camFlow as { phase: string }).phase).toBe('returning')
  })
})
