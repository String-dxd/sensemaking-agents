// Drawn-face controller (plan 011 step 4) — PORT of the expression/blink/gaze
// state machines from the studio's `src/core/face/faceRig.ts`, adapted to
// drive the BAKED face planes in a compiled companion instead of building
// them. Where the studio calls `setCell(material, cell)` (which sets
// `material.map.offset`), this sets the same offset on the plane material's
// texture — the compiler baked KHR_texture_transform with `repeat = (c, -c)`,
// so only the offset changes to switch cells (the runtime re-derives the
// flipY-corrected offset formula that `textures.faceCellTransform` used).
//
// Pure logic over the parsed scene: no THREE constructors, injected seeded RNG
// (no Math.random). The masked-pupil shader (Wind Waker eye-white alpha mask)
// is NOT rebuilt here — that is a host-optional fidelity upgrade; the baked
// unlit pupil sprite reads correctly at rest and for modest gaze.

import type { AtlasCell, SenCompanionData } from './senCompanion'
import type { Object3DLike, TextureLike } from './three-types'

type Rng = () => number
type FacePart = 'eyeWhiteL' | 'eyeWhiteR' | 'pupilL' | 'pupilR' | 'browL' | 'browR' | 'mouth'

export interface FaceControl {
  setExpression(name: string): void
  setMouthOverride(cell: string | null): void
  setGaze(x: number, y: number): void
  blink(): void
  setBlinkMeanInterval(seconds: number): void
  update(dt: number): void
  getState(): { expression: string; eyeL: string; eyeR: string; brow: string; mouth: string; gaze: { x: number; y: number } }
  dispose(): void
}

// Blink timing (verbatim from faceRig.ts).
const BLINK_JITTER_S = 2
const BLINK_MIN_INTERVAL_S = 0.5
const DOUBLE_BLINK_CHANCE = 0.15
const DOUBLE_BLINK_GAP_S = 0.18
const BLINK_SEQUENCE: ReadonlyArray<{ cell: string; duration: number }> = [
  { cell: 'half', duration: 0.033 },
  { cell: 'closed', duration: 0.065 },
  { cell: 'half', duration: 0.032 },
]
const GAZE_TAU_S = 0.08

function materialTexture(o: Object3DLike | undefined): TextureLike | null {
  const mat = o?.material
  if (!mat) return null
  const single = Array.isArray(mat) ? mat[0] : mat
  return single?.map ?? null
}

export function createFaceControl(
  planes: Partial<Record<FacePart, Object3DLike>>,
  sen: SenCompanionData['face'],
  rng: Rng,
): FaceControl {
  const cellUv = sen.cellUv
  const gazeMax = sen.gazeMaxOffset
  const withoutPupil = new Set(sen.eyeCellsWithoutPupil)

  // Clone each plane's texture so per-plane offsets are independent (defensive:
  // three usually clones per KHR_texture_transform, but don't rely on it).
  const tex: Partial<Record<FacePart, TextureLike>> = {}
  for (const part of Object.keys(planes) as FacePart[]) {
    const t = materialTexture(planes[part])
    if (!t) continue
    const clone = t.clone()
    const mat = planes[part]?.material
    const single = Array.isArray(mat) ? mat[0] : mat
    if (single) single.map = clone
    tex[part] = clone
  }

  /** flipY-corrected cell → texture.offset (matches compiler faceCellTransform). */
  function setCell(part: FacePart, cell: AtlasCell | undefined): void {
    const t = tex[part]
    if (!t || !cell) return
    t.offset.set(cell[0] * cellUv, 1 - cell[1] * cellUv)
  }

  const eyeCell = (name: string): AtlasCell | undefined => sen.cellMaps.eye[name]
  const browCell = (name: string): AtlasCell | undefined => sen.cellMaps.brow[name]
  const mouthCell = (name: string): AtlasCell | undefined => sen.cellMaps.mouth[name]

  // --- expression + shown state --------------------------------------------
  let expression = sen.defaultExpression
  let mouthOverride: string | null = null
  const shown = { eyeL: 'open', eyeR: 'open', brow: 'neutral', mouth: 'neutral' }

  function setPlaneVisible(part: FacePart, visible: boolean): void {
    const o = planes[part]
    if (o) o.visible = visible
  }

  function applyMouthCell(): void {
    setCell('mouth', mouthCell(mouthOverride ?? shown.mouth))
  }

  function applyEyeCells(eyeL: string, eyeR: string): void {
    shown.eyeL = eyeL
    shown.eyeR = eyeR
    setCell('eyeWhiteL', eyeCell(eyeL))
    setCell('eyeWhiteR', eyeCell(eyeR))
    setPlaneVisible('pupilL', !withoutPupil.has(eyeL))
    setPlaneVisible('pupilR', !withoutPupil.has(eyeR))
  }

  function preset(name: string) {
    return sen.expressionPresets[name] ?? sen.expressionPresets[sen.defaultExpression] ?? { eyeL: 'open', eyeR: 'open', brow: 'neutral', mouth: 'neutral' }
  }

  function applyExpressionEyes(): void {
    const p = preset(expression)
    applyEyeCells(p.eyeL, p.eyeR)
  }

  function setExpression(name: string): void {
    expression = name
    const p = preset(name)
    shown.brow = p.brow
    shown.mouth = p.mouth
    setCell('browL', browCell(p.brow))
    setCell('browR', browCell(p.brow))
    applyMouthCell()
    if (blinkPhase < 0) applyExpressionEyes()
  }

  // --- blink state machine (verbatim logic) --------------------------------
  let blinkMean = sen.blink.meanIntervalS
  let blinkTimer = 0
  let blinkPhase = -1
  let blinkPhaseTime = 0
  let pendingDouble = false
  const blinkEnabled = sen.blink.enabled

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
      if (!blinkEnabled) return
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

  // --- gaze -----------------------------------------------------------------
  const gazeTarget = { x: 0, y: 0 }
  const gazeCurrent = { x: 0, y: 0 }
  const basePupilOffset = sen.cellMaps.pupil[sen.pupilCell] ?? [0, 0]
  const mirrored = new Set(sen.mirroredPlanes)

  function clampGaze(v: number): number {
    return v < -gazeMax ? -gazeMax : v > gazeMax ? gazeMax : v
  }

  function applyGazeTo(part: 'pupilL' | 'pupilR'): void {
    const t = tex[part]
    if (!t) return
    // +x screen-right; mirrored (U-flipped) right eye samples x negated so both
    // pupils travel the same screen direction (studio faceRig applyGaze).
    const gx = mirrored.has(part) ? -gazeCurrent.x : gazeCurrent.x
    // studio: pupilUv = pupilOffset + (vUv - gaze)*cellRepeat ⇒ offset -= gaze*cell.
    // V axis is baked flipped (repeat.y = -cellUv), so V offset uses 1 - row*cellUv.
    const ox = basePupilOffset[0] * cellUv - gx * cellUv
    const oy = 1 - basePupilOffset[1] * cellUv - gazeCurrent.y * cellUv
    t.offset.set(ox, oy)
  }

  function update(dt: number): void {
    updateBlink(dt)
    const k = 1 - Math.exp(-dt / GAZE_TAU_S)
    gazeCurrent.x += (gazeTarget.x - gazeCurrent.x) * k
    gazeCurrent.y += (gazeTarget.y - gazeCurrent.y) * k
    applyGazeTo('pupilL')
    applyGazeTo('pupilR')
  }

  // Initialize to the default expression + first blink schedule.
  setExpression(expression)
  applyExpressionEyes()
  applyGazeTo('pupilL')
  applyGazeTo('pupilR')
  scheduleNextBlink()

  return {
    setExpression,
    setMouthOverride(cell: string | null): void {
      mouthOverride = cell
      applyMouthCell()
    },
    setGaze(x: number, y: number): void {
      gazeTarget.x = clampGaze(x)
      gazeTarget.y = clampGaze(y)
    },
    blink(): void {
      if (blinkPhase < 0) startBlink()
    },
    setBlinkMeanInterval(seconds: number): void {
      blinkMean = Math.max(BLINK_MIN_INTERVAL_S, seconds)
      if (blinkPhase < 0) scheduleNextBlink()
    },
    update,
    getState() {
      return { expression, ...shown, gaze: { ...gazeCurrent } }
    },
    dispose(): void {
      /* textures are clones owned by the plane materials; the host disposes the scene */
    },
  }
}
