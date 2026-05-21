import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/engine/student-space/Game/View/View.js', () => ({
  default: {
    getInstance() {
      return {}
    },
  },
}))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance() {
      return {}
    },
  },
}))

vi.mock('~/engine/student-space/Game/View/OverlayController.js', () => ({
  default: class StubOverlayController {},
}))

// @ts-expect-error — engine source is JavaScript without companion declarations.
import HoverProbe from '~/engine/student-space/Game/View/HoverProbe.js'

function makeProbe() {
  const camera = new THREE.PerspectiveCamera()
  const probe = Object.assign(Object.create(HoverProbe.prototype), {
    enabled: true,
    ring: { material: { opacity: 0 } },
    state: {
      time: { elapsed: 0 },
      island: { heightAt: () => 0 },
    },
    view: {
      hoverCta: null,
      objectPeek: null,
      kiraNarrator: null,
      facetView: { openFor: vi.fn() },
    },
    camera,
    _latestPointer: { x: 24, y: 36, type: 'mouse' },
    _pointerDirty: true,
    _lastPickCameraPosition: new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN),
    _lastPickCameraQuaternion: new THREE.Quaternion(Number.NaN, Number.NaN, Number.NaN, Number.NaN),
    _pick: vi.fn(() => null),
    _setHover: vi.fn(function setHover(this: { hovered: unknown }, target: unknown) {
      this.hovered = target
    }),
    _screenPos: vi.fn(() => ({ x: 0, y: 0 })),
    hovered: null,
    lastHovered: null,
  })
  return probe
}

describe('HoverProbe performance throttling', () => {
  it('does not raycast every frame for a stationary pointer', () => {
    const probe = makeProbe()

    probe.update()
    probe.update()
    probe.update()

    expect(probe._pick).toHaveBeenCalledTimes(1)

    probe.camera.position.x = 0.01
    probe.update()

    expect(probe._pick).toHaveBeenCalledTimes(2)
  })

  it('keeps pointer-up picking immediate', () => {
    const probe = makeProbe()
    const group = {}
    const hit = { kind: 'flower', group, index: 1, x: 0, z: 0 }
    probe._pick = vi.fn(() => hit)

    probe._handlePointerUp({ clientX: 24, clientY: 36, pointerType: 'touch' }, 24, 36)

    expect(probe._pick).toHaveBeenCalledWith(24, 36)
    expect(probe._setHover).toHaveBeenCalledWith(hit)
    expect(probe.view.facetView.openFor).not.toHaveBeenCalled()
  })
})
