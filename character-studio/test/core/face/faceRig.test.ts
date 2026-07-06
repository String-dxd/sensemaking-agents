import type * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { BROW_CELLS, EYE_CELLS, EYE_CELLS_WITHOUT_PUPIL, MOUTH_CELLS } from '../../../src/core/face/atlas'
import type { FaceCompositor, FaceDrawState } from '../../../src/core/face/faceComposite'
import {
  createFaceRig,
  EXPRESSION_PRESETS,
  type ExpressionName,
  type FaceRig,
} from '../../../src/core/face/faceRig'

// Deterministic LCG so blink cadence is reproducible.
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Stub compositor: records draw states instead of touching a canvas. */
function stubCompositor() {
  const draws: FaceDrawState[] = []
  const texture = { isStubTexture: true } as unknown as THREE.CanvasTexture
  let disposed = false
  const compositor: FaceCompositor = {
    texture,
    draw(state: FaceDrawState): void {
      draws.push({ ...state, gaze: { ...state.gaze } })
    },
    dispose(): void {
      disposed = true
    },
  }
  return {
    compositor,
    draws,
    texture,
    lastDraw: () => draws[draws.length - 1],
    isDisposed: () => disposed,
  }
}

function makeRig(rng: () => number = seededRng(42), opts: { hideMouth?: boolean } = {}) {
  const stub = stubCompositor()
  const applied: Array<THREE.CanvasTexture | null> = []
  const rig = createFaceRig({
    compositor: stub.compositor,
    rng,
    hideMouth: opts.hideMouth,
    applyTexture: (texture) => applied.push(texture),
  })
  return { rig, stub, applied }
}

describe('expression presets', () => {
  it('every preset names cells that exist in the atlas maps', () => {
    for (const [name, preset] of Object.entries(EXPRESSION_PRESETS)) {
      expect(EYE_CELLS, `${name}.eyeL`).toHaveProperty(preset.eyeL)
      expect(EYE_CELLS, `${name}.eyeR`).toHaveProperty(preset.eyeR)
      expect(BROW_CELLS, `${name}.brow`).toHaveProperty(preset.brow)
      expect(MOUTH_CELLS, `${name}.mouth`).toHaveProperty(preset.mouth)
    }
  })

  it('setExpression applies the whole preset coherently', () => {
    const { rig } = makeRig()
    rig.setExpression('happy')
    const state = rig.getState()
    expect(state.expression).toBe('happy')
    expect(state.eyeL).toBe('happy')
    expect(state.brow).toBe('raised')
    expect(state.mouth).toBe('grin')
  })

  it('redraws the compositor with the preset cells on the next update', () => {
    const { rig, stub } = makeRig()
    rig.setExpression('happy')
    rig.update(0.001)
    const draw = stub.lastDraw()
    expect(draw.eyeL).toBe('happy')
    expect(draw.eyeR).toBe('happy')
    expect(draw.brow).toBe('raised')
    expect(draw.mouth).toBe('grin')
  })

  it('hides pupils for eye cells without an eye-white', () => {
    const { rig } = makeRig()
    for (const name of Object.keys(EXPRESSION_PRESETS) as ExpressionName[]) {
      rig.setExpression(name)
      const preset = EXPRESSION_PRESETS[name]
      const anyNoWhite =
        EYE_CELLS_WITHOUT_PUPIL.has(preset.eyeL) || EYE_CELLS_WITHOUT_PUPIL.has(preset.eyeR)
      expect(rig.getState().pupilsVisible, name).toBe(!anyNoWhite)
    }
  })
})

describe('mouth', () => {
  it('mouth override wins over the expression mouth and hands back on null', () => {
    const { rig, stub } = makeRig()
    rig.setExpression('happy')
    rig.setMouthOverride('vAa')
    rig.update(0.001)
    expect(stub.lastDraw().mouth).toBe('vAa')
    expect(rig.getState().mouthOverride).toBe('vAa')
    expect(rig.getState().mouth).toBe('grin') // expression cell preserved underneath
    rig.setMouthOverride(null)
    rig.update(0.001)
    expect(stub.lastDraw().mouth).toBe('grin')
    expect(rig.getState().mouthOverride).toBeNull()
  })

  it('draws no mouth when hideMouth is set (beak parts ARE the mouth)', () => {
    const { rig, stub } = makeRig(seededRng(42), { hideMouth: true })
    expect(stub.lastDraw().mouth).toBeNull()
    rig.setMouthOverride('vOh')
    rig.update(0.001)
    expect(stub.lastDraw().mouth).toBeNull()
    expect(rig.getState().mouth).toBe('neutral') // logical state unaffected
  })
})

describe('blink state machine', () => {
  let rig: FaceRig

  beforeEach(() => {
    rig = makeRig().rig
  })

  function step(rigToStep: FaceRig, seconds: number, dt = 0.005): string[] {
    const seen: string[] = []
    for (let t = 0; t < seconds; t += dt) {
      rigToStep.update(dt)
      const cell = rigToStep.getState().eyeL
      if (seen[seen.length - 1] !== cell) seen.push(cell)
    }
    return seen
  }

  it('reaches closed and returns to open within 200 ms of a triggered blink', () => {
    const seen: string[] = []
    rig.blink()
    for (let t = 0; t < 0.2; t += 0.005) {
      rig.update(0.005)
      seen.push(rig.getState().eyeL)
    }
    expect(seen).toContain('closed')
    expect(seen).toContain('half')
    expect(seen[seen.length - 1]).toBe('open')
  })

  it('blink cells flow through to the compositor draws', () => {
    const { rig: drawRig, stub } = makeRig()
    drawRig.blink()
    const drawnEyes: string[] = []
    for (let t = 0; t < 0.2; t += 0.005) {
      drawRig.update(0.005)
      const cell = stub.lastDraw().eyeL
      if (drawnEyes[drawnEyes.length - 1] !== cell) drawnEyes.push(cell)
    }
    expect(drawnEyes).toEqual(['half', 'closed', 'half', 'open'])
  })

  it('blinks on its own at randomized intervals and restores the expression cell', () => {
    const seen = step(rig, 12)
    expect(seen.filter((c) => c === 'closed').length).toBeGreaterThanOrEqual(2)
    expect(rig.getState().eyeL).toBe('open')
  })

  it('honors the double-blink probability under a seeded RNG', () => {
    // rng draw order per schedule: [interval jitter, double-blink chance].
    // Forcing both draws to 0 ⇒ interval = mean − jitter, double = (0 < 0.15).
    const forced = makeRig(() => 0).rig
    forced.blink()
    const closedTimes: number[] = []
    let t = 0
    let wasClosed = false
    for (; t < 1.2; t += 0.005) {
      forced.update(0.005)
      const closed = forced.getState().eyeL === 'closed'
      if (closed && !wasClosed) closedTimes.push(t)
      wasClosed = closed
    }
    // first blink + a double-blink follow-up ~0.18 s after it completes
    expect(closedTimes.length).toBeGreaterThanOrEqual(2)
    expect(closedTimes[1] - closedTimes[0]).toBeLessThan(0.5)

    // and statistically ≈15% of natural cycles under a seeded RNG
    const statRig = makeRig(seededRng(7)).rig
    const seen = step(statRig, 400, 0.01)
    const closes = seen.filter((c) => c === 'closed').length
    // ~400s/3.5s ≈ 114 base blinks ⇒ doubles push count ≈ 114 × 1.15
    expect(closes).toBeGreaterThan(90)
    expect(closes).toBeLessThan(160)
  })

  it('restores non-open expression eyes after blinking', () => {
    rig.setExpression('sleepy')
    rig.blink()
    for (let t = 0; t < 0.3; t += 0.005) rig.update(0.005)
    expect(rig.getState().eyeL).toBe('half')
  })
})

describe('gaze', () => {
  it('smoothing converges to the target within a few time constants', () => {
    const { rig } = makeRig()
    rig.setGaze(0.05, -0.03)
    for (let i = 0; i < 60; i++) rig.update(1 / 60) // 1 s ≈ 12τ
    const { gaze } = rig.getState()
    expect(gaze.x).toBeCloseTo(0.05, 3)
    expect(gaze.y).toBeCloseTo(-0.03, 3)
  })

  it('moves gradually, not snapping', () => {
    const { rig } = makeRig()
    rig.setGaze(0.06, 0)
    rig.update(1 / 60)
    const { gaze } = rig.getState()
    expect(gaze.x).toBeGreaterThan(0)
    expect(gaze.x).toBeLessThan(0.02)
  })

  it('redraws while the eased gaze is moving and settles once it converges', () => {
    const { rig, stub } = makeRig()
    // long settle: gaze converged, drawing only continues for blinks
    for (let i = 0; i < 400; i++) rig.update(1 / 60)
    const settled = stub.draws.length
    rig.setGaze(0.05, 0)
    rig.update(1 / 60)
    expect(stub.draws.length).toBeGreaterThan(settled)
    expect(stub.lastDraw().gaze.x).toBeGreaterThan(0)
  })
})

describe('lifecycle', () => {
  it('publishes the compositor texture at creation and draws the initial face', () => {
    const { stub, applied } = makeRig()
    expect(applied).toEqual([stub.texture])
    expect(stub.draws.length).toBe(1)
    expect(stub.lastDraw()).toMatchObject({ eyeL: 'open', brow: 'neutral', mouth: 'neutral' })
  })

  it('dispose detaches the texture and disposes the compositor', () => {
    const { rig, stub, applied } = makeRig()
    rig.dispose()
    expect(applied[applied.length - 1]).toBeNull()
    expect(stub.isDisposed()).toBe(true)
  })
})
