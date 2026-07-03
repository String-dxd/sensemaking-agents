// Face rig — composition + expression state (plan 002, step 3).
//
// Pure three, no React. Composes eye-white/pupil/brow/mouth planes on a head
// sphere via spherical coordinates, drives named expression presets, a
// procedural blink state machine, and eased gaze. No global RNG in here:
// the RNG is injected (seeded in tests; the React layer supplies the real one).

import * as THREE from 'three'
import {
  type AtlasCell,
  BROW_CELLS,
  type BrowCellName,
  EYE_CELLS,
  EYE_CELLS_WITHOUT_PUPIL,
  type EyeCellName,
  MOUTH_CELLS,
  type MouthCellName,
  PUPIL_CELLS,
  type PupilCellName,
} from './atlas'
import {
  FACE_LAYER_RADIAL_OFFSET,
  FACE_LAYER_RADIAL_STEP,
  makeAtlasMaterial,
  makeFacePlaneGeometry,
  makePupilMaterial,
  setCell,
  setGaze as setMaterialGaze,
  setMaskCell,
} from './facePlane'

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

export interface FaceRigTextures {
  eye: THREE.Texture
  pupil: THREE.Texture
  brow: THREE.Texture
  mouth: THREE.Texture
}

/** Angular placement/sizing of the face parts, radians (plan 006 re-anchors real heads through this). */
export interface FacePlacement {
  eyeAzimuth: number
  eyeElevation: number
  eyeWidth: number
  eyeHeight: number
  browLift: number
  browWidth: number
  browHeight: number
  mouthElevation: number
  mouthWidth: number
  mouthHeight: number
  /**
   * Extra radial offset (m) for the mouth plane only — muzzle parts push the
   * drawn mouth out so it floats on the muzzle front (plan 006 anchor config).
   */
  mouthRadialOffset: number
}

const DEG = Math.PI / 180

export const DEFAULT_PLACEMENT: FacePlacement = {
  eyeAzimuth: 20 * DEG,
  eyeElevation: 5 * DEG,
  eyeWidth: 26 * DEG,
  eyeHeight: 30 * DEG,
  browLift: 18 * DEG,
  browWidth: 24 * DEG,
  browHeight: 16 * DEG,
  mouthElevation: -18 * DEG,
  mouthWidth: 32 * DEG,
  mouthHeight: 24 * DEG,
  mouthRadialOffset: 0,
}

export interface FaceRigConfig {
  headRadius: number
  /** Injected RNG in [0,1). Seed it in tests; the React layer passes the global one. */
  rng: () => number
  textures: FaceRigTextures
  placement?: Partial<FacePlacement>
  pupilCell?: PupilCellName
}

export interface FaceRigState {
  expression: ExpressionName
  eyeL: EyeCellName
  eyeR: EyeCellName
  brow: BrowCellName
  mouth: MouthCellName
  gaze: { x: number; y: number }
  pupilsVisible: boolean
}

export interface FaceRig {
  group: THREE.Group
  setExpression(name: ExpressionName): void
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

export function createFaceRig(head: THREE.Object3D, config: FaceRigConfig): FaceRig {
  const { headRadius, rng, textures } = config
  const placement = { ...DEFAULT_PLACEMENT, ...config.placement }
  const pupilCell: AtlasCell = PUPIL_CELLS[config.pupilCell ?? 'round']

  const group = new THREE.Group()
  group.name = 'faceRig'
  head.add(group)

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []

  function addPlane(
    name: string,
    material: THREE.Material,
    azimuth: number,
    elevation: number,
    width: number,
    height: number,
    radialOffset: number,
    mirrorU: boolean,
    renderOrder: number,
  ): THREE.Mesh {
    const geometry = makeFacePlaneGeometry(headRadius, width, height, radialOffset, mirrorU)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.rotation.order = 'YXZ'
    mesh.rotation.y = azimuth
    mesh.rotation.x = -elevation
    mesh.renderOrder = renderOrder
    group.add(mesh)
    geometries.push(geometry)
    materials.push(material)
    return mesh
  }

  const p = placement
  // Authored art's OUTER corner points toward -x, so the -azimuth (viewer
  // left) eye uses plain UVs and the +azimuth eye mirrors U.
  const eyeWhiteMatL = makeAtlasMaterial({ map: textures.eye, cell: EYE_CELLS.open, layerOffset: 0 })
  const eyeWhiteMatR = makeAtlasMaterial({ map: textures.eye, cell: EYE_CELLS.open, layerOffset: 0 })
  const browMatL = makeAtlasMaterial({ map: textures.brow, cell: BROW_CELLS.neutral, layerOffset: 0 })
  const browMatR = makeAtlasMaterial({ map: textures.brow, cell: BROW_CELLS.neutral, layerOffset: 0 })
  const mouthMat = makeAtlasMaterial({ map: textures.mouth, cell: MOUTH_CELLS.neutral, layerOffset: 0 })
  const pupilMatL = makePupilMaterial({
    pupilMap: textures.pupil,
    maskMap: textures.eye,
    pupilCell,
    maskCell: EYE_CELLS.open,
    layerOffset: 1,
  })
  const pupilMatR = makePupilMaterial({
    pupilMap: textures.pupil,
    maskMap: textures.eye,
    pupilCell,
    maskCell: EYE_CELLS.open,
    layerOffset: 1,
  })

  const base = FACE_LAYER_RADIAL_OFFSET
  const above = base + FACE_LAYER_RADIAL_STEP
  addPlane('eyeWhiteL', eyeWhiteMatL, -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, base, false, 1)
  addPlane('eyeWhiteR', eyeWhiteMatR, p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, base, true, 1)
  // Pupil planes are IDENTICAL patches to their eye-whites so the mask
  // sampled at the same face-plane UV aligns texel-for-texel.
  const pupilL = addPlane('pupilL', pupilMatL, -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, above, false, 2)
  const pupilR = addPlane('pupilR', pupilMatR, p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, above, true, 2)
  addPlane('browL', browMatL, -p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight, base, false, 1)
  addPlane('browR', browMatR, p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight, base, true, 1)
  addPlane('mouth', mouthMat, 0, p.mouthElevation, p.mouthWidth, p.mouthHeight, base + p.mouthRadialOffset, false, 1)

  // --- expression state ---------------------------------------------------

  let expression: ExpressionName = 'neutral'
  const shown: { eyeL: EyeCellName; eyeR: EyeCellName; brow: BrowCellName; mouth: MouthCellName } = {
    eyeL: 'open',
    eyeR: 'open',
    brow: 'neutral',
    mouth: 'neutral',
  }

  function applyEyeCells(eyeL: EyeCellName, eyeR: EyeCellName): void {
    shown.eyeL = eyeL
    shown.eyeR = eyeR
    setCell(eyeWhiteMatL, EYE_CELLS[eyeL])
    setCell(eyeWhiteMatR, EYE_CELLS[eyeR])
    setMaskCell(pupilMatL, EYE_CELLS[eyeL])
    setMaskCell(pupilMatR, EYE_CELLS[eyeR])
    pupilL.visible = !EYE_CELLS_WITHOUT_PUPIL.has(eyeL)
    pupilR.visible = !EYE_CELLS_WITHOUT_PUPIL.has(eyeR)
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
    setCell(browMatL, BROW_CELLS[preset.brow])
    setCell(browMatR, BROW_CELLS[preset.brow])
    setCell(mouthMat, MOUTH_CELLS[preset.mouth])
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

  function applyGaze(): void {
    // +x is screen-right; the mirrored (U-flipped) right eye needs its x
    // sample offset negated so both pupils travel the same screen direction.
    setMaterialGaze(pupilMatL, gazeCurrent.x, gazeCurrent.y)
    setMaterialGaze(pupilMatR, -gazeCurrent.x, gazeCurrent.y)
  }

  function update(dt: number): void {
    updateBlink(dt)
    const k = 1 - Math.exp(-dt / GAZE_TAU_S)
    gazeCurrent.x += (gazeTarget.x - gazeCurrent.x) * k
    gazeCurrent.y += (gazeTarget.y - gazeCurrent.y) * k
    applyGaze()
  }

  return {
    group,
    setExpression,
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
        gaze: { ...gazeCurrent },
        pupilsVisible: pupilL.visible && pupilR.visible,
      }
    },
    dispose(): void {
      head.remove(group)
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) {
        // atlas materials own a cloned texture; the source textures stay
        // with the caller
        const map = (material as THREE.MeshBasicMaterial).map
        if (material.userData.kind === 'face-atlas' && map) map.dispose()
        material.dispose()
      }
    },
  }
}
