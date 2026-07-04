// Expression-atlas layout contract (plan 002, step 1).
//
// Each face-part kind (eye-white, pupil, brow, mouth) has ONE texture holding
// a 4×4 grid of cells. A face plane displays exactly one cell, selected by a
// fractional UV offset: `uvOffset = (col * 0.25, row * 0.25)`, `uvRepeat = 0.25`.
//
// PERMANENT CONTRACT: designer-authored replacement art must land in the same
// grid positions. Changing a cell's meaning or position is a spec-version bump
// (plan 004 owns versioning).
//
// Row convention: rows are numbered BOTTOM-UP in UV space, so the offset
// formula above holds with three.js's default `flipY = true` texture loading.
// In the PNG viewed top-down, row 0 is the BOTTOM band of the image.
// (The generator in scripts/generate-face-atlas.ts writes rows accordingly.)

export type AtlasCell = readonly [col: number, row: number]

/** Cells per atlas edge (4×4 grid). */
export const ATLAS_GRID = 4

/** UV extent of one cell (uvRepeat). */
export const CELL_UV = 1 / ATLAS_GRID

/**
 * Eye-white layer cells. Each cell includes the eye outline/lashes; the white
 * region's alpha doubles as the pupil mask (Wind Waker mechanic).
 * Art is authored for the eye whose OUTER corner points toward -x (the
 * viewer-left eye); the other eye renders the same art with mirrored U.
 */
export const EYE_CELLS = {
  open: [0, 0],
  half: [1, 0],
  closed: [2, 0],
  happy: [3, 0],
  wide: [0, 1],
  squint: [1, 1],
  sad: [2, 1],
  angry: [3, 1],
  heart: [0, 2],
  star: [1, 2],
  spiralDizzy: [2, 2],
  wink: [3, 2],
  // row 3 reserved for designer custom cells
} as const satisfies Record<string, AtlasCell>

export const MOUTH_CELLS = {
  neutral: [0, 0],
  smile: [1, 0],
  open: [2, 0],
  frown: [3, 0],
  oh: [0, 1],
  grin: [1, 1],
  pout: [2, 1],
  tongue: [3, 1],
  // row 2 = talk visemes reserved for plan 007: aa, ee, oh2, mm
  vAa: [0, 2],
  vEe: [1, 2],
  vOh: [2, 2],
  vMm: [3, 2],
} as const satisfies Record<string, AtlasCell>

export const BROW_CELLS = {
  neutral: [0, 0],
  raised: [1, 0],
  knit: [2, 0],
  sadOuter: [3, 0],
} as const satisfies Record<string, AtlasCell>

/**
 * Pupil/iris layer cells (iris + pupil + white catchlight variants). Rendered
 * above the eye-white layer, alpha-masked by the eye-white cell, offset by
 * gaze. Pupil art must keep ≥ 24 px clear of cell edges so the max gaze
 * offset (±0.06 of a cell ≈ 15 px) never drags neighbor-cell texels in.
 */
export const PUPIL_CELLS = {
  round: [0, 0],
  big: [1, 0],
  small: [2, 0],
  sparkle: [3, 0],
  // rows 1–3 reserved for designer custom cells
} as const satisfies Record<string, AtlasCell>

export type EyeCellName = keyof typeof EYE_CELLS
export type MouthCellName = keyof typeof MOUTH_CELLS
export type BrowCellName = keyof typeof BROW_CELLS
export type PupilCellName = keyof typeof PUPIL_CELLS

/**
 * Eye cells with no eye-white region: the pupil layer must be hidden while
 * one of these is displayed (the mask would otherwise tint the drawn marks).
 */
export const EYE_CELLS_WITHOUT_PUPIL: ReadonlySet<EyeCellName> = new Set([
  'closed',
  'happy',
  'heart',
  'star',
  'spiralDizzy',
  'wink',
] as const)

/** Fractional UV offset selecting a cell (pair with `uvRepeat = CELL_UV`). */
export function cellUvOffset(cell: AtlasCell): [number, number] {
  return [cell[0] * CELL_UV, cell[1] * CELL_UV]
}
