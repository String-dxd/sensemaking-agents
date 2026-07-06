// Face compositor (advisor plan 002) — draws the face IN THE HEAD MESH'S OWN
// UV SPACE instead of on floating planes (the AC:NH technique: faces are
// texture data in head UVs, so floating/parallax/z-fighting are structurally
// impossible and the face follows every morph/sculpt/bone deformation for
// free).
//
// Pure logic + 2D canvas, no React, no WebGL: composites the existing 4×4
// atlas cells (./atlas.ts — PERMANENT CONTRACT) into a per-character overlay
// texture that the body toon material samples via `uFaceMap`
// (src/core/materials/toonMaterial.ts `setFaceMap`).
//
// The canvas is injectable (`createCanvas`) so tests run under plain node
// with @napi-rs/canvas; production defaults to document.createElement.

import * as THREE from 'three'
import {
  BROW_CELLS,
  type BrowCellName,
  CELL_UV,
  cellUvOffset,
  EYE_CELLS,
  EYE_CELLS_WITHOUT_PUPIL,
  type EyeCellName,
  MOUTH_CELLS,
  type MouthCellName,
  PUPIL_CELLS,
  type PupilCellName,
} from './atlas'
import { GAZE_MAX } from './facePlane'

// --- placement -----------------------------------------------------------------

/** Angular placement/sizing of the face parts, radians (plan 006 re-anchors
 * real heads through this). Shared with the export plane path (compile.ts). */
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
   * Extra radial offset (m) for the mouth plane only — EXPORT PATH ONLY:
   * muzzle parts push the exported mouth plane out so it floats on the
   * muzzle front. The viewport compositor ignores this field (the drawn
   * mouth stays on the head surface at the muzzle root).
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

// --- head-UV mapping ---------------------------------------------------------

/**
 * The head shell's UV island in the body texture — (u0, v0, u1, v1) from
 * scripts/blender/bodies.py `UV_HEAD`, front-centered (azimuth 0 → island
 * u-center) with azimuth u∈[0,1] and polar v∈[0,1] bottom-up (meshkit.py
 * sphere_shell param mapping).
 */
export const HEAD_UV_ISLAND = [0.0, 0.45, 0.55, 1.0] as const

export type HeadUvIsland = readonly [u0: number, v0: number, u1: number, v1: number]

/** A feature rectangle in body-texture UV space: CENTER (u, v) + size (w, h). */
export interface UvRect {
  u: number
  v: number
  w: number
  h: number
}

export interface FaceUvRects {
  eyeL: UvRect
  eyeR: UvRect
  browL: UvRect
  browR: UvRect
  mouth: UvRect
}

const TAU = Math.PI * 2

/** Wrap into [0, 1) (JS `%` keeps the sign of the dividend). */
function wrap01(x: number): number {
  return ((x % 1) + 1) % 1
}

/**
 * Map one face feature (azimuth θ toward +X, elevation φ up, angular size)
 * onto the head UV island. Width picks up a 1/cos(φ) widening factor because
 * azimuth lines converge toward the poles.
 */
function featureRect(
  island: HeadUvIsland,
  azimuth: number,
  elevation: number,
  angularWidth: number,
  angularHeight: number,
): UvRect {
  const [u0, v0, u1, v1] = island
  const uSpan = u1 - u0
  const vSpan = v1 - v0
  const u = u0 + wrap01(azimuth / TAU + 0.5) * uSpan
  const v = v0 + ((Math.PI / 2 + elevation) / Math.PI) * vSpan
  const w = ((angularWidth / TAU) * uSpan) / Math.cos(elevation)
  const h = (angularHeight / Math.PI) * vSpan
  return { u, v, w, h }
}

/**
 * Convert the angular FacePlacement (the plan-002 source of truth, shared
 * with the export plane path) into head-island UV rectangles for each drawn
 * part. `mouthRadialOffset` is export-path-only and ignored here.
 */
export function facePlacementToUvRect(placement: FacePlacement, island: HeadUvIsland = HEAD_UV_ISLAND): FaceUvRects {
  const p = placement
  return {
    eyeL: featureRect(island, -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight),
    eyeR: featureRect(island, p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight),
    browL: featureRect(island, -p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight),
    browR: featureRect(island, p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight),
    mouth: featureRect(island, 0, p.mouthElevation, p.mouthWidth, p.mouthHeight),
  }
}

// --- canvas seam (injectable for node tests) ----------------------------------

/** Anything drawImage can consume as a source (atlas image, scratch canvas). */
export interface CanvasSourceLike {
  width: number
  height: number
}

/** The minimal 2D-context surface the compositor uses. Both the DOM
 * CanvasRenderingContext2D and @napi-rs/canvas's context satisfy it. */
export interface FaceCanvas2DContext {
  globalCompositeOperation: string
  clearRect(x: number, y: number, w: number, h: number): void
  drawImage(
    image: CanvasSourceLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
  save(): void
  restore(): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
}

export interface CanvasLike {
  width: number
  height: number
  getContext(contextId: '2d'): FaceCanvas2DContext | null
}

function domCreateCanvas(width: number, height: number): CanvasLike {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  // The DOM context satisfies FaceCanvas2DContext structurally, but its
  // overloaded drawImage signature defeats TS's method-bivariance check —
  // cast at this one seam (mirrors the CanvasTexture cast below).
  return canvas as unknown as CanvasLike
}

function get2d(canvas: CanvasLike): FaceCanvas2DContext {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('faceComposite: 2d canvas context unavailable')
  return ctx
}

// --- compositor ----------------------------------------------------------------

export interface FaceDrawState {
  eyeL: EyeCellName
  eyeR: EyeCellName
  brow: BrowCellName
  /** null = no drawn mouth (beak parts ARE the mouth). */
  mouth: MouthCellName | null
  pupil: PupilCellName
  pupilsVisible: boolean
  /** Cell-fraction offset, clamped to ±GAZE_MAX (facePlane.ts contract). */
  gaze: { x: number; y: number }
}

export interface FaceCompositorConfig {
  /** The four loaded atlas image sources (texture `.image`s / test canvases). */
  images: {
    eye: CanvasSourceLike
    pupil: CanvasSourceLike
    brow: CanvasSourceLike
    mouth: CanvasSourceLike
  }
  placement: FacePlacement
  /** Overlay texture edge in pixels (covers the FULL body UV square). */
  size?: number
  headIsland?: HeadUvIsland
  /** Canvas factory — inject @napi-rs/canvas's createCanvas in node tests. */
  createCanvas?: (width: number, height: number) => CanvasLike
}

export interface FaceCompositor {
  /** The composited overlay texture (THREE.CanvasTexture), flipY=true, sRGB. */
  texture: THREE.CanvasTexture
  /** Redraw with the given cells + gaze. Cheap: a clear + ≤7 drawImage calls. */
  draw(state: FaceDrawState): void
  dispose(): void
}

const DEFAULT_SIZE = 1024

/** Atlas-PNG pixel rect for a cell. Atlas rows are numbered BOTTOM-UP in UV
 * space (atlas.ts), so the pixel-space top of cell (col,row) sits at
 * `height * (1 - (row + 1) * CELL_UV)`. */
function cellPixelRect(image: CanvasSourceLike, cell: readonly [number, number]) {
  const [ox, oy] = cellUvOffset(cell)
  return {
    sx: image.width * ox,
    sy: image.height * (1 - oy - CELL_UV),
    sw: image.width * CELL_UV,
    sh: image.height * CELL_UV,
  }
}

export function createFaceCompositor(config: FaceCompositorConfig): FaceCompositor {
  const size = config.size ?? DEFAULT_SIZE
  const createCanvas = config.createCanvas ?? domCreateCanvas
  const rects = facePlacementToUvRect(config.placement, config.headIsland)
  const { eye, pupil, brow, mouth } = config.images

  const canvas = createCanvas(size, size)
  const ctx = get2d(canvas)

  // One scratch canvas per eye (pupil ∩ eye-white alpha compositing) — the
  // two eye rects share dimensions, but keeping them separate avoids
  // ordering hazards if a future placement differs per eye.
  const scratchW = Math.max(1, Math.round(rects.eyeL.w * size))
  const scratchH = Math.max(1, Math.round(rects.eyeL.h * size))
  const scratchL = createCanvas(scratchW, scratchH)
  const scratchR = createCanvas(scratchW, scratchH)

  // CanvasTexture's constructor is typed for DOM image sources; the injected
  // node canvas is structurally compatible (width/height + pixel source), so
  // this single cast is the seam the CANVAS TEST STRATEGY calls for.
  const texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement)
  texture.flipY = true // canvas row 0 (top) = UV v = 1
  texture.colorSpace = THREE.SRGBColorSpace
  // Redrawn on every blink — skip per-draw mipmap regeneration.
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter

  /** drawImage an atlas cell into a UV rect on the main canvas (canvas y is 1−v). */
  function drawPart(image: CanvasSourceLike, cell: readonly [number, number], rect: UvRect, mirrorU: boolean): void {
    const { sx, sy, sw, sh } = cellPixelRect(image, cell)
    const dw = rect.w * size
    const dh = rect.h * size
    const dx = (rect.u - rect.w / 2) * size
    const dy = (1 - (rect.v + rect.h / 2)) * size
    if (mirrorU) {
      // Art is authored for the viewer-left eye — mirror around the rect.
      ctx.save()
      ctx.translate(dx + dw, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh)
      ctx.restore()
    } else {
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
    }
  }

  /**
   * Pupil layer: draw the pupil cell gaze-offset into a scratch canvas, keep
   * only where the eye-white cell has alpha (`destination-in` — the Wind
   * Waker mask mechanic), then composite the scratch into the eye rect.
   */
  function drawPupil(
    scratch: CanvasLike,
    eyeCell: EyeCellName,
    pupilCell: PupilCellName,
    rect: UvRect,
    mirrorU: boolean,
    gazeX: number,
    gazeY: number,
  ): void {
    if (EYE_CELLS_WITHOUT_PUPIL.has(eyeCell)) return
    const sctx = get2d(scratch)
    const w = scratch.width
    const h = scratch.height
    sctx.globalCompositeOperation = 'source-over'
    sctx.clearRect(0, 0, w, h)
    // Gaze is a cell fraction and the rect displays exactly one cell, so the
    // pixel displacement is gaze × rect size. +x looks screen-right: the
    // mirrored eye negates x pre-mirror so both pupils travel together.
    // +y looks up = smaller canvas y.
    const px = (mirrorU ? -gazeX : gazeX) * w
    const py = -gazeY * h
    const p = cellPixelRect(pupil, PUPIL_CELLS[pupilCell])
    sctx.drawImage(pupil, p.sx, p.sy, p.sw, p.sh, px, py, w, h)
    sctx.globalCompositeOperation = 'destination-in'
    const m = cellPixelRect(eye, EYE_CELLS[eyeCell])
    sctx.drawImage(eye, m.sx, m.sy, m.sw, m.sh, 0, 0, w, h)
    // Composite the WHOLE scratch (not an atlas cell) into the eye rect.
    const dw = rect.w * size
    const dh = rect.h * size
    const dx = (rect.u - rect.w / 2) * size
    const dy = (1 - (rect.v + rect.h / 2)) * size
    if (mirrorU) {
      ctx.save()
      ctx.translate(dx + dw, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(scratch, 0, 0, w, h, 0, 0, dw, dh)
      ctx.restore()
    } else {
      ctx.drawImage(scratch, 0, 0, w, h, dx, dy, dw, dh)
    }
  }

  return {
    texture,
    draw(state: FaceDrawState): void {
      const clamp = (v: number) => Math.min(GAZE_MAX, Math.max(-GAZE_MAX, v))
      const gx = clamp(state.gaze.x)
      const gy = clamp(state.gaze.y)

      ctx.clearRect(0, 0, size, size)
      drawPart(eye, EYE_CELLS[state.eyeL], rects.eyeL, false)
      drawPart(eye, EYE_CELLS[state.eyeR], rects.eyeR, true)
      drawPart(brow, BROW_CELLS[state.brow], rects.browL, false)
      drawPart(brow, BROW_CELLS[state.brow], rects.browR, true)
      if (state.mouth !== null) drawPart(mouth, MOUTH_CELLS[state.mouth], rects.mouth, false)
      if (state.pupilsVisible) {
        drawPupil(scratchL, state.eyeL, state.pupil, rects.eyeL, false, gx, gy)
        drawPupil(scratchR, state.eyeR, state.pupil, rects.eyeR, true, gx, gy)
      }
      texture.needsUpdate = true
    },
    dispose(): void {
      texture.dispose()
    },
  }
}
