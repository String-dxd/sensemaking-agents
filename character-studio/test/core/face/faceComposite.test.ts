// Node-side compositor tests: @napi-rs/canvas is injected through the
// compositor's `createCanvas` seam (CANVAS TEST STRATEGY) — production code
// never touches the dependency.

import { type Canvas, createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { BROW_CELLS, CELL_UV, EYE_CELLS, MOUTH_CELLS, PUPIL_CELLS } from '../../../src/core/face/atlas'
import {
  type CanvasLike,
  createFaceCompositor,
  DEFAULT_PLACEMENT,
  type FaceDrawState,
  type FacePlacement,
  facePlacementToUvRect,
} from '../../../src/core/face/faceComposite'
import { GAZE_MAX } from '../../../src/core/face/facePlane'

const ATLAS = 256

/** Pixel rect of an atlas cell — rows are BOTTOM-UP in UV space (atlas.ts). */
function cellRectPx(cell: readonly [number, number]) {
  const c = ATLAS * CELL_UV
  return { x: cell[0] * c, y: ATLAS * (1 - (cell[1] + 1) * CELL_UV), w: c, h: c }
}

function fillCell(canvas: Canvas, cell: readonly [number, number], style: string, inset = 0): void {
  const ctx = canvas.getContext('2d')
  const r = cellRectPx(cell)
  ctx.fillStyle = style
  ctx.fillRect(r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset)
}

// Fake atlases: eye-white = opaque white 'open' cell (doubles as pupil mask),
// pupil = centered red dot, brow = blue, mouth = green 'smile' + 'neutral'.
function makeAtlases() {
  const eye = createCanvas(ATLAS, ATLAS)
  fillCell(eye, EYE_CELLS.open, '#ffffff')
  const pupil = createCanvas(ATLAS, ATLAS)
  fillCell(pupil, PUPIL_CELLS.round, '#ff0000', 24)
  const brow = createCanvas(ATLAS, ATLAS)
  fillCell(brow, BROW_CELLS.neutral, '#0000ff')
  const mouth = createCanvas(ATLAS, ATLAS)
  fillCell(mouth, MOUTH_CELLS.smile, '#00ff00')
  fillCell(mouth, MOUTH_CELLS.neutral, '#00ff00')
  return { eye, pupil, brow, mouth }
}

function makeCompositor(opts: { placement?: FacePlacement; size?: number } = {}) {
  const size = opts.size ?? 512
  const canvases: Canvas[] = []
  const compositor = createFaceCompositor({
    images: makeAtlases(),
    placement: opts.placement ?? DEFAULT_PLACEMENT,
    size,
    createCanvas: (w, h) => {
      const canvas = createCanvas(w, h)
      canvases.push(canvas)
      return canvas as unknown as CanvasLike
    },
  })
  // The factory's first canvas is the main overlay canvas.
  return { compositor, main: canvases[0], size }
}

const BASE_STATE: FaceDrawState = {
  eyeL: 'open',
  eyeR: 'open',
  brow: 'neutral',
  mouth: 'neutral',
  pupil: 'round',
  pupilsVisible: true,
  gaze: { x: 0, y: 0 },
}

function alphaAt(main: Canvas, x: number, y: number): number {
  return main.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data[3]
}

describe('facePlacementToUvRect', () => {
  it('pins the default placement to the head island (front-centered)', () => {
    const rects = facePlacementToUvRect(DEFAULT_PLACEMENT)
    // azimuth 0 → island u-center 0.275; mouth sits below the equator (v 0.725)
    expect(rects.mouth.u).toBeCloseTo(0.275, 6)
    expect(rects.mouth.v).toBeCloseTo(0.45 + ((90 - 18) / 180) * 0.55, 6)
    expect(rects.mouth.v).toBeLessThan(0.725)
    // eyes symmetric about the island u-center
    expect(rects.eyeL.u).toBeLessThan(rects.eyeR.u)
    expect(rects.eyeL.u + rects.eyeR.u).toBeCloseTo(2 * 0.275, 6)
    // brows above eyes (higher v)
    expect(rects.browL.v).toBeGreaterThan(rects.eyeL.v)
  })
})

describe('createFaceCompositor draw', () => {
  it('draws the mouth cell into the mouth rect and leaves the rest transparent', () => {
    const { compositor, main, size } = makeCompositor()
    const versionBefore = compositor.texture.version
    compositor.draw({ ...BASE_STATE, mouth: 'smile' })
    const { mouth } = facePlacementToUvRect(DEFAULT_PLACEMENT)
    const data = main
      .getContext('2d')
      .getImageData(Math.round(mouth.u * size), Math.round((1 - mouth.v) * size), 1, 1).data
    expect(data[3]).toBeGreaterThan(0) // opaque at the mouth center
    expect(data[1]).toBeGreaterThan(200) // ...and it is the green mouth texel
    expect(alphaAt(main, size - 4, size - 4)).toBe(0) // untouched corner
    // needsUpdate is a version-bumping setter in three
    expect(compositor.texture.version).toBeGreaterThan(versionBefore)
  })

  it('draws no mouth when mouth is null (beak parts ARE the mouth)', () => {
    const { compositor, main, size } = makeCompositor()
    compositor.draw({ ...BASE_STATE, mouth: null })
    const { mouth } = facePlacementToUvRect(DEFAULT_PLACEMENT)
    expect(alphaAt(main, mouth.u * size, (1 - mouth.v) * size)).toBe(0)
    // eyes still drawn
    const { eyeL } = facePlacementToUvRect(DEFAULT_PLACEMENT)
    expect(alphaAt(main, eyeL.u * size, (1 - eyeL.v) * size)).toBeGreaterThan(0)
  })

  it('shifts the pupil centroid toward +u under +x gaze', () => {
    // Oversized eyes so the ±GAZE_MAX shift spans several pixels; azimuth
    // pushed out so the sampled left-eye window never overlaps the right eye.
    const placement: FacePlacement = {
      ...DEFAULT_PLACEMENT,
      eyeAzimuth: Math.PI / 4,
      eyeWidth: Math.PI / 3,
      eyeHeight: Math.PI / 3,
    }

    function pupilCentroidX(gazeX: number): number {
      const { compositor, main, size } = makeCompositor({ placement, size: 1024 })
      compositor.draw({ ...BASE_STATE, gaze: { x: gazeX, y: 0 } })
      const { eyeL } = facePlacementToUvRect(placement)
      const x0 = Math.floor((eyeL.u - eyeL.w / 2) * size) - 12
      const y0 = Math.floor((1 - (eyeL.v + eyeL.h / 2)) * size) - 12
      const w = Math.ceil(eyeL.w * size) + 24
      const h = Math.ceil(eyeL.h * size) + 24
      const img = main.getContext('2d').getImageData(x0, y0, w, h).data
      let sum = 0
      let sumX = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          // red pupil texels only (white eye and blue brow filtered out)
          if (img[i + 3] > 0 && img[i] > 200 && img[i + 1] < 100) {
            sum += 1
            sumX += x
          }
        }
      }
      expect(sum).toBeGreaterThan(0)
      return sumX / sum
    }

    const centered = pupilCentroidX(0)
    const shifted = pupilCentroidX(GAZE_MAX)
    expect(shifted).toBeGreaterThan(centered + 2)
  })
})
