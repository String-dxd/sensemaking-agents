/**
 * Camera save-stack — owner-keyed zoomTo/restoreZoom proving the fix
 * for docs/followups.md's 2026-05-18 entry on chained/interleaved
 * zooms restoring to the wrong state.
 *
 * Before the stack: the camera saved its pre-zoom pose in a single
 * slot, set only on first zoom and cleared on restore. A second
 * consumer's zoom never updated the saved slot, so its restore
 * always returned to the *first* consumer's pre-zoom pose — yanking
 * the camera away from the outer consumer mid-display.
 *
 * Each test below would fail under the single-slot implementation;
 * they pass under the owner-keyed Map stack.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub State so we don't drag in the entire state graph (which transitively
// pulls in modules that vitest can't transform without the glsl plugin).
vi.mock('~/engine/student-space/Game/State/State.js', () => {
  class StubState {
    static instance: StubState | null = null
    viewport = { width: 1024, height: 768 }
    static getInstance() {
      if (!StubState.instance) StubState.instance = new StubState()
      return StubState.instance
    }
  }
  return { default: StubState }
})

import * as THREE from 'three'
// @ts-expect-error — Camera.js is JS without a companion .d.ts.
import Camera from '~/engine/student-space/Game/View/Camera.js'

type CameraLike = {
  instance: { position: THREE.Vector3 }
  zoomTo: (p: THREE.Vector3, l: THREE.Vector3, d?: number, o?: { owner?: string }) => void
  restoreZoom: (d?: number, o?: { owner?: string }) => void
  resetToDefault: (d?: number) => void
  update: () => void
  _zoom: { startTime: number } | null
}

/** Drive any in-flight tween to completion. */
function fastForward(camera: CameraLike) {
  if (!camera._zoom) return
  camera._zoom.startTime = -1e9
  camera.update()
}

function pos(camera: CameraLike) {
  return camera.instance.position.clone()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Camera owner-keyed save stack', () => {
  let camera: CameraLike
  let home: THREE.Vector3

  beforeEach(() => {
    camera = new Camera() as unknown as CameraLike
    home = pos(camera)
  })

  it('two owners restore in LIFO order — inner returns to outer, outer returns home', () => {
    const posA = new THREE.Vector3(1, 1, 1)
    const lookA = new THREE.Vector3(0, 0, 0)
    camera.zoomTo(posA, lookA, 200, { owner: 'a' })
    fastForward(camera)
    expect(pos(camera).distanceTo(posA)).toBeLessThan(1e-3)

    const posB = new THREE.Vector3(5, 5, 5)
    const lookB = new THREE.Vector3(0, 0, 0)
    camera.zoomTo(posB, lookB, 200, { owner: 'b' })
    fastForward(camera)
    expect(pos(camera).distanceTo(posB)).toBeLessThan(1e-3)

    // Under the old single-slot impl this would jump straight to home.
    camera.restoreZoom(200, { owner: 'b' })
    fastForward(camera)
    expect(pos(camera).distanceTo(posA)).toBeLessThan(1e-3)

    camera.restoreZoom(200, { owner: 'a' })
    fastForward(camera)
    expect(pos(camera).distanceTo(home)).toBeLessThan(1e-3)
  })

  it('same-owner re-zoom (ObjectPeek open→pickup) keeps the original anchor', () => {
    const posA = new THREE.Vector3(2, 0, 0)
    const posB = new THREE.Vector3(0, 0, 4)
    const look = new THREE.Vector3(0, 0, 0)
    camera.zoomTo(posA, look, 200, { owner: 'peek' })
    fastForward(camera)
    camera.zoomTo(posB, look, 200, { owner: 'peek' })
    fastForward(camera)
    expect(pos(camera).distanceTo(posB)).toBeLessThan(1e-3)

    camera.restoreZoom(200, { owner: 'peek' })
    fastForward(camera)
    // Must return to *home* — not to posA (the intermediate step within
    // the same consumer's lifecycle).
    expect(pos(camera).distanceTo(home)).toBeLessThan(1e-3)
  })

  it('out-of-order restore drops the inner anchor without yanking the active owner', () => {
    const posA = new THREE.Vector3(3, 0, 0)
    const posB = new THREE.Vector3(0, 3, 0)
    const look = new THREE.Vector3(0, 0, 0)
    camera.zoomTo(posA, look, 200, { owner: 'a' })
    fastForward(camera)
    camera.zoomTo(posB, look, 200, { owner: 'b' })
    fastForward(camera)

    const beforeOutOfOrder = pos(camera)
    camera.restoreZoom(200, { owner: 'a' })
    fastForward(camera)
    expect(pos(camera).distanceTo(beforeOutOfOrder)).toBeLessThan(1e-3)

    // 'b' restores to its own anchor (posA), as if 'a' never existed.
    camera.restoreZoom(200, { owner: 'b' })
    fastForward(camera)
    expect(pos(camera).distanceTo(posA)).toBeLessThan(1e-3)

    camera.restoreZoom(200, { owner: 'a' })
    fastForward(camera)
    expect(pos(camera).distanceTo(posA)).toBeLessThan(1e-3)
  })

  it('resetToDefault drains the stack so subsequent restoreZooms are no-ops', () => {
    const posA = new THREE.Vector3(2, 2, 2)
    const look = new THREE.Vector3(0, 0, 0)
    camera.zoomTo(posA, look, 200, { owner: 'a' })
    fastForward(camera)
    camera.zoomTo(new THREE.Vector3(4, 0, 0), look, 200, { owner: 'b' })
    fastForward(camera)

    camera.resetToDefault(200)
    fastForward(camera)
    const restPos = pos(camera)

    camera.restoreZoom(200, { owner: 'b' })
    fastForward(camera)
    expect(pos(camera).distanceTo(restPos)).toBeLessThan(1e-3)
    camera.restoreZoom(200, { owner: 'a' })
    fastForward(camera)
    expect(pos(camera).distanceTo(restPos)).toBeLessThan(1e-3)
  })

  it('anonymous (no-owner) callers still work for legacy onboarding zooms', () => {
    const posA = new THREE.Vector3(1, 1, 1)
    const look = new THREE.Vector3(0, 0, 0)
    camera.zoomTo(posA, look, 200)
    fastForward(camera)
    expect(pos(camera).distanceTo(posA)).toBeLessThan(1e-3)

    camera.restoreZoom(200)
    fastForward(camera)
    expect(pos(camera).distanceTo(home)).toBeLessThan(1e-3)
  })
})
