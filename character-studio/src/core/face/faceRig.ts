// Face rig — expression state machine (plan 002; retargeted by advisor plan
// 002 to draw ON the head mesh).
//
// Pure logic, no React, no scene objects: drives named expression presets, a
// procedural blink state machine, and eased gaze, and renders by redrawing an
// injected face compositor (./faceComposite.ts) whose CanvasTexture the body
// toon material samples in the head's own UVs (setFaceMap). No global RNG in
// here: the RNG is injected (seeded in tests; the React layer supplies the
// real one).

import type * as THREE from 'three'
import {
  type BrowCellName,
  EYE_CELLS_WITHOUT_PUPIL,
  type EyeCellName,
  type MouthCellName,
  type PupilCellName,
} from './atlas'
import type { FaceCompositor, FaceDrawState } from './faceComposite'

export interface ExpressionPreset {
  eyeL: EyeCellName
  eyeR: EyeCellName
  brow: BrowCellName
  mouth: MouthCellName
}

export const EXPRESSION_PRESETS = {
  neutral: { eyeL: 'open', eyeR: 'open', brow: 'neutral', mouth: 'neutral' },
  happy: { eyeL: 'happy', eyeR: 'happy', brow: 'raised', mouth: 'grin' },
  sad: { eyeL: 'sad', eyeR: 'sad', brow: 'sadOuter', mouth: 'pout' },
  angry: { eyeL: 'angry', eyeR: 'angry', brow: 'knit', mouth: 'frown' },
  surprised: { eyeL: 'wide', eyeR: 'wide', brow: 'raised', mouth: 'oh' },
  sleepy: { eyeL: 'half', eyeR: 'half', brow: 'neutral', mouth: 'neutral' },
  love: { eyeL: 'heart', eyeR: 'heart', brow: 'raised', mouth: 'smile' },
  dizzy: { eyeL: 'spiralDizzy', eyeR: 'spiralDizzy', brow: 'sadOuter', mouth: 'oh' },
  wink: { eyeL: 'open', eyeR: 'wink', brow: 'raised', mouth: 'smile' },
} as const satisfies Record<string, ExpressionPreset>

export type ExpressionName = keyof typeof EXPRESSION_PRESETS

export interface FaceRigConfig {
  /** Composites the current cells into the head-UV overlay texture.
   * Injectable: tests pass a stub; the React layer builds the real one. */
  compositor: FaceCompositor
  /** Injected RNG in [0,1). Seed it in tests; the React layer passes the global one. */
  rng: () => number
  /** Beak parts ARE the mouth — draw no mouth while equipped. */
  hideMouth?: boolean
  pupilCell?: PupilCellName
  /**
   * Receives the compositor's texture once at creation (wire it to
   * setFaceMap on the body material) and null again on dispose.
   */
  applyTexture(texture: THREE.CanvasTexture | null): void
  /**
   * Beak articulation (anatomy round 3): receives the eased jaw openness
   * (0 closed … 1 wide) every update. The viewport layer rotates the
   * assembled beakJaw meshes with it, so a talking bird's beak flaps like
   * the AC ones instead of relying on the (hidden) drawn mouth alone.
   */
  applyJaw?(open01: number): void
}

export interface FaceRigState {
  expression: ExpressionName
  eyeL: EyeCellName
  eyeR: EyeCellName
  brow: BrowCellName
  mouth: MouthCellName
  mouthOverride: MouthCellName | null
  gaze: { x: number; y: number }
  pupilsVisible: boolean
}

export interface FaceRig {
  setExpression(name: ExpressionName): void
  /**
   * Talk-layer mouth override (plan 007): non-null shows `cell` regardless of
   * the current expression; null hands the mouth back to the expression.
   * The talk driver's viseme cells flow through here.
   */
  setMouthOverride(cell: MouthCellName | null): void
  setGaze(x: number, y: number): void
  blink(): void
  setBlinkMeanInterval(seconds: number): void
  update(dt: number): void
  getState(): FaceRigState
  dispose(): void
}

// Blink timing (plan 002 "Current state" #4)
const BLINK_MEAN_S = 3.5
const BLINK_JITTER_S = 2
const BLINK_MIN_INTERVAL_S = 0.5
const DOUBLE_BLINK_CHANCE = 0.15
const DOUBLE_BLINK_GAP_S = 0.18
// open→half→closed→half→open across ~130 ms
const BLINK_SEQUENCE: ReadonlyArray<{ cell: EyeCellName; duration: number }> = [
  { cell: 'half', duration: 0.033 },
  { cell: 'closed', duration: 0.065 },
  { cell: 'half', duration: 0.032 },
]

const GAZE_TAU_S = 0.08

/** Per-mouth-cell jaw openness targets (beak articulation). The viseme cells
 * map to the amplitude the talk driver picked; expression cells give beaked
 * species a matching resting pose (surprised 'oh' → agape). */
const JAW_OPEN: Record<MouthCellName, number> = {
  neutral: 0,
  smile: 0.1,
  open: 0.55,
  frown: 0.04,
  oh: 0.7,
  grin: 0.18,
  pout: 0.04,
  tongue: 0.5,
  vAa: 0.75,
  vEe: 0.4,
  vOh: 1,
  vMm: 0.08,
}
/** Jaw easing: fast open, slightly slower close (reads as a snappy flap). */
const JAW_TAU_OPEN_S = 0.035
const JAW_TAU_CLOSE_S = 0.07

/** Eased-gaze movement below this since the last draw skips the redraw. */
const GAZE_REDRAW_EPSILON = 1e-4

export function createFaceRig(config: FaceRigConfig): FaceRig {
  const { compositor, rng, hideMouth = false } = config
  const pupilCell: PupilCellName = config.pupilCell ?? 'round'

  // --- expression state ---------------------------------------------------

  let expression: ExpressionName = 'neutral'
  let mouthOverride: MouthCellName | null = null
  const shown: { eyeL: EyeCellName; eyeR: EyeCellName; brow: BrowCellName; mouth: MouthCellName } = {
    eyeL: 'open',
    eyeR: 'open',
    brow: 'neutral',
    mouth: 'neutral',
  }

  let dirty = true
  const lastDrawnGaze = { x: Number.NaN, y: Number.NaN }

  function applyEyeCells(eyeL: EyeCellName, eyeR: EyeCellName): void {
    shown.eyeL = eyeL
    shown.eyeR = eyeR
    dirty = true
  }

  function applyExpressionEyes(): void {
    const preset = EXPRESSION_PRESETS[expression]
    applyEyeCells(preset.eyeL, preset.eyeR)
  }

  function setExpression(name: ExpressionName): void {
    expression = name
    const preset = EXPRESSION_PRESETS[name]
    shown.brow = preset.brow
    shown.mouth = preset.mouth
    dirty = true
    if (blinkPhase < 0) applyExpressionEyes()
  }

  // --- blink state machine --------------------------------------------------

  let blinkMean = BLINK_MEAN_S
  let blinkTimer = 0
  let blinkPhase = -1 // -1 = idle, otherwise index into BLINK_SEQUENCE
  let blinkPhaseTime = 0
  let pendingDouble = false

  function scheduleNextBlink(gap?: number): void {
    if (gap !== undefined) {
      blinkTimer = gap
      return
    }
    const jitter = (rng() * 2 - 1) * BLINK_JITTER_S
    blinkTimer = Math.max(BLINK_MIN_INTERVAL_S, blinkMean + jitter)
    pendingDouble = rng() < DOUBLE_BLINK_CHANCE
  }

  function startBlink(): void {
    blinkPhase = 0
    blinkPhaseTime = 0
    applyEyeCells(BLINK_SEQUENCE[0].cell, BLINK_SEQUENCE[0].cell)
  }

  function updateBlink(dt: number): void {
    if (blinkPhase < 0) {
      blinkTimer -= dt
      if (blinkTimer <= 0) startBlink()
      return
    }
    blinkPhaseTime += dt
    while (blinkPhase >= 0 && blinkPhaseTime >= BLINK_SEQUENCE[blinkPhase].duration) {
      blinkPhaseTime -= BLINK_SEQUENCE[blinkPhase].duration
      blinkPhase += 1
      if (blinkPhase >= BLINK_SEQUENCE.length) {
        blinkPhase = -1
        applyExpressionEyes()
        if (pendingDouble) {
          pendingDouble = false
          scheduleNextBlink(DOUBLE_BLINK_GAP_S)
        } else {
          scheduleNextBlink()
        }
      } else {
        const cell = BLINK_SEQUENCE[blinkPhase].cell
        applyEyeCells(cell, cell)
      }
    }
  }

  scheduleNextBlink()

  // --- gaze -----------------------------------------------------------------

  const gazeTarget = { x: 0, y: 0 }
  const gazeCurrent = { x: 0, y: 0 }

  // --- drawing ----------------------------------------------------------------

  function drawState(): FaceDrawState {
    return {
      eyeL: shown.eyeL,
      eyeR: shown.eyeR,
      brow: shown.brow,
      mouth: hideMouth ? null : (mouthOverride ?? shown.mouth),
      pupil: pupilCell,
      // Union: the compositor still skips the individual pupil-less eye
      // (per-eye EYE_CELLS_WITHOUT_PUPIL check), so a wink keeps the open
      // eye's pupil — matching the old per-plane visibility behavior.
      pupilsVisible: !EYE_CELLS_WITHOUT_PUPIL.has(shown.eyeL) || !EYE_CELLS_WITHOUT_PUPIL.has(shown.eyeR),
      gaze: { x: gazeCurrent.x, y: gazeCurrent.y },
    }
  }

  function redraw(): void {
    compositor.draw(drawState())
    lastDrawnGaze.x = gazeCurrent.x
    lastDrawnGaze.y = gazeCurrent.y
    dirty = false
  }

  let jawCurrent = 0

  function update(dt: number): void {
    updateBlink(dt)
    if (config.applyJaw) {
      const jawTarget = JAW_OPEN[mouthOverride ?? shown.mouth]
      const tau = jawTarget > jawCurrent ? JAW_TAU_OPEN_S : JAW_TAU_CLOSE_S
      jawCurrent += (jawTarget - jawCurrent) * (1 - Math.exp(-dt / tau))
      config.applyJaw(jawCurrent)
    }
    const k = 1 - Math.exp(-dt / GAZE_TAU_S)
    gazeCurrent.x += (gazeTarget.x - gazeCurrent.x) * k
    gazeCurrent.y += (gazeTarget.y - gazeCurrent.y) * k
    const gazeMoved =
      !(Math.abs(gazeCurrent.x - lastDrawnGaze.x) <= GAZE_REDRAW_EPSILON) ||
      !(Math.abs(gazeCurrent.y - lastDrawnGaze.y) <= GAZE_REDRAW_EPSILON)
    if (dirty || gazeMoved) redraw()
  }

  // Publish the overlay texture and render the initial (neutral) face.
  config.applyTexture(compositor.texture)
  redraw()

  return {
    setExpression,
    setMouthOverride(cell: MouthCellName | null): void {
      mouthOverride = cell
      dirty = true
    },
    setGaze(x: number, y: number): void {
      gazeTarget.x = x
      gazeTarget.y = y
    },
    blink(): void {
      if (blinkPhase < 0) startBlink()
    },
    setBlinkMeanInterval(seconds: number): void {
      blinkMean = Math.max(BLINK_MIN_INTERVAL_S, seconds)
      if (blinkPhase < 0) scheduleNextBlink()
    },
    update,
    getState(): FaceRigState {
      return {
        expression,
        ...shown,
        mouthOverride,
        gaze: { ...gazeCurrent },
        // AND semantics (both eyes can show a pupil) — unchanged shape.
        pupilsVisible: !EYE_CELLS_WITHOUT_PUPIL.has(shown.eyeL) && !EYE_CELLS_WITHOUT_PUPIL.has(shown.eyeR),
      }
    },
    dispose(): void {
      config.applyTexture(null)
      compositor.dispose()
    },
  }
}
