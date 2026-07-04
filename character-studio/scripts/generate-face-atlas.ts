// Generates the expression-atlas PNGs: the v1 default set (plan 002) plus
// the 관상 personality variants (plan 006 step 3b, grammar table in plan 000
// §2.1b). Run with:
//
//   pnpm gen:face-atlas          (tsx; node ≥22 type-stripping also works)
//
// Output:
//   src/assets/face/{eye,mouth,brow,pupil}-atlas.png              (face-v1)
//   src/assets/face/<personality>/{eye,mouth,brow,pupil}-atlas.png
//
// 1024×1024, 4×4 grid of 256px cells; layout contract in src/core/face/
// atlas.ts (cell maps are IMMUTABLE — every personality re-draws the same
// cells in the same positions, only the drawn style differs).
//
// THE STYLE PARAMETERS ARE THE GRAMMAR. Each personality is exactly one
// `FaceStyle` block below — designers add a personality by adding a block,
// never by hand-editing pixels. Axes (from the 관상 table): eye aperture,
// pupil/iris size + catchlight, brow weight/angle/height, stroke weight,
// and the default (neutral-cell) mouth character.
//
// Art direction: Animal Crossing language — thick soft dark-brown strokes,
// large oval eye-whites, rounded everything, ≥8px cell padding.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'face')
const CELL = 256
const GRID = 4
const SIZE = CELL * GRID

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number]
const INK: Rgb = [0x3a, 0x2e, 0x2a]
const WHITE: Rgb = [0xff, 0xff, 0xff]
const MOUTH_DARK: Rgb = [0x5d, 0x2a, 0x33]
const TONGUE: Rgb = [0xe0, 0x52, 0x6e]
const HEART_PINK: Rgb = [0xe0, 0x52, 0x6e]
const STAR_GOLD: Rgb = [0xf2, 0xc1, 0x4e]
const IRIS: Rgb = [0x6b, 0x4a, 0x35]
const PUPIL: Rgb = [0x2a, 0x20, 0x1e]

// ---------------------------------------------------------------------------
// SDF toolkit — all distances in cell-local pixels, y-up, origin bottom-left.
// ---------------------------------------------------------------------------

type Sdf = (x: number, y: number) => number

const circle =
  (cx: number, cy: number, r: number): Sdf =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) - r

// Scaled-circle ellipse approximation — fine for AA at these sizes.
const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Sdf =>
  (x, y) =>
    (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry)

// Half-plane below the line through (x0,y0)-(x1,y1); inside where the point
// is on the right side walking x0→x1 (i.e. "below" for left-to-right lines).
const belowLine = (x0: number, y0: number, x1: number, y1: number): Sdf => {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  const nx = dy / len
  const ny = -dx / len
  return (x, y) => -((x - x0) * nx + (y - y0) * ny)
}

/** Half-plane ABOVE the line (for raised lower lids / narrowed eyes). */
const aboveLine = (x0: number, y0: number, x1: number, y1: number): Sdf =>
  belowLine(x1, y1, x0, y0)

const segment =
  (ax: number, ay: number, bx: number, by: number): Sdf =>
  (x, y) => {
    const pax = x - ax
    const pay = y - ay
    const bax = bx - ax
    const bay = by - ay
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
    return Math.hypot(pax - bax * h, pay - bay * h)
  }

const polyline = (pts: ReadonlyArray<readonly [number, number]>): Sdf => {
  const segs = pts.slice(0, -1).map(([ax, ay], i) => segment(ax, ay, pts[i + 1][0], pts[i + 1][1]))
  return (x, y) => Math.min(...segs.map((s) => s(x, y)))
}

/** Circular arc through 3 sampled points: from (x0,y) to (x1,y) sagging by `sag` (+up / −down). */
const arc = (x0: number, x1: number, y: number, sag: number, n = 24): Sdf => {
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = x0 + (x1 - x0) * t
    // parabolic approximation of a shallow circular arc
    pts.push([x, y + sag * 4 * t * (1 - t)])
  }
  return polyline(pts)
}

const union =
  (...fs: Sdf[]): Sdf =>
  (x, y) =>
    Math.min(...fs.map((f) => f(x, y)))

const intersect =
  (...fs: Sdf[]): Sdf =>
  (x, y) =>
    Math.max(...fs.map((f) => f(x, y)))

/** Shear the sampling space: positive k lifts the OUTER (-x) side. */
const shearX =
  (f: Sdf, k: number): Sdf =>
  (x, y) =>
    f(x, y + k * (x - 128))

/** Boundary stroke of a filled shape. */
const outline =
  (f: Sdf, w: number): Sdf =>
  (x, y) =>
    Math.abs(f(x, y)) - w / 2

/** Stroke along a zero-width path (polyline/arc distance fns). */
const stroke =
  (f: Sdf, w: number): Sdf =>
  (x, y) =>
    f(x, y) - w / 2

// Classic heart: diamond + two circles on its upper edges; tip points down.
const heart = (cx: number, cy: number, s: number): Sdf => {
  const h = 0.62 * s
  const diamond: Sdf = (x, y) => (Math.abs(x - cx) + Math.abs(y - cy) - h) / Math.SQRT2
  const r = h / Math.SQRT2
  return union(diamond, circle(cx - h / 2, cy + h / 2, r), circle(cx + h / 2, cy + h / 2, r))
}

// Signed distance to a polygon (iq). Used for the star.
const polygon = (pts: ReadonlyArray<readonly [number, number]>): Sdf => {
  const n = pts.length
  return (x, y) => {
    let d = (x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2
    let sign = 1
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      const ex = xj - xi
      const ey = yj - yi
      const wx = x - xi
      const wy = y - yi
      const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)))
      const bx = wx - ex * t
      const by = wy - ey * t
      d = Math.min(d, bx * bx + by * by)
      const c1 = y >= yi
      const c2 = y < yj
      const c3 = ex * wy > ey * wx
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign
    }
    return sign * Math.sqrt(d)
  }
}

const star = (cx: number, cy: number, rOuter: number, rInner: number): Sdf => {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? rOuter : rInner
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return polygon(pts)
}

const spiral = (cx: number, cy: number, r0: number, r1: number, turns: number): Sdf => {
  const pts: [number, number][] = []
  const n = 140
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = turns * 2 * Math.PI * t
    const r = r0 + (r1 - r0) * t
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return polyline(pts)
}

// ---------------------------------------------------------------------------
// Rasterizer + PNG encoder
// ---------------------------------------------------------------------------

interface Layer {
  sdf: Sdf
  color: Rgb
  alpha?: number
}

type CellPainter = Layer[]

function renderAtlas(cells: ReadonlyMap<string, CellPainter>, cellPos: Record<string, readonly [number, number]>): Uint8Array {
  // Straight-alpha RGBA, image rows top-down.
  const img = new Float64Array(SIZE * SIZE * 4)
  for (const [name, layers] of cells) {
    const [col, row] = cellPos[name]
    const x0 = col * CELL
    const yTop = (GRID - 1 - row) * CELL // UV rows are bottom-up
    for (let j = 0; j < CELL; j++) {
      const ly = CELL - (j + 0.5) // y-up local coordinate at pixel center
      for (let i = 0; i < CELL; i++) {
        const lx = i + 0.5
        const idx = ((yTop + j) * SIZE + x0 + i) * 4
        for (const layer of layers) {
          const d = layer.sdf(lx, ly)
          const cov = Math.max(0, Math.min(1, 0.5 - d)) * (layer.alpha ?? 1)
          if (cov <= 0) continue
          // src-over composite (straight alpha)
          const a0 = img[idx + 3]
          const a = cov + a0 * (1 - cov)
          if (a <= 0) continue
          for (let c = 0; c < 3; c++) {
            img[idx + c] = (layer.color[c] * cov + img[idx + c] * a0 * (1 - cov)) / a
          }
          img[idx + 3] = a
        }
      }
    }
  }
  const out = new Uint8Array(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    out[i * 4] = Math.round(img[i * 4])
    out[i * 4 + 1] = Math.round(img[i * 4 + 1])
    out[i * 4 + 2] = Math.round(img[i * 4 + 2])
    out[i * 4 + 3] = Math.round(img[i * 4 + 3] * 255)
  }
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function encodePng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, w)
  iv.setUint32(4, h)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = new Uint8Array(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0 // filter: none
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1)
  }
  const idat = deflateSync(raw, { level: 9 })
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

// ---------------------------------------------------------------------------
// THE GRAMMAR: FaceStyle — one block per personality (plan 000 §2.1b).
// ---------------------------------------------------------------------------

interface FaceStyle {
  /** Output directory ('' = v1 default set at the atlas root). */
  dir: string
  /** Global drawn-line weight multiplier (stroke weight axis). */
  stroke: number
  /** Eye-white scale (aperture axis): [rx, ry] multipliers. */
  eye: readonly [number, number]
  /** Upper-lid drop, 0..1 of eye height (0 open, ~0.45 half-lidded). */
  lid: number
  /** Lower-lid raise, 0..1 (narrowed/gruff squint). */
  lowerLid: number
  /** Outer-corner lift (+ = upturned/cheerful, − = drooped). */
  upturn: number
  /** Pupil/iris scale multiplier. */
  pupil: number
  /** Catchlight scale (big soft catchlight vs small intense). */
  catchlight: number
  /** Extra sparkle catchlights on the default pupil cell. */
  sparkle: boolean
  /** Small lash tick at the outer corner (proud). */
  lash: boolean
  /** Brow stroke weight multiplier. */
  brow: number
  /** Brow height offset in px (+ held high, − held low). */
  browLift: number
  /** Brow inner-end drop in px (+ = angled in / stern). */
  browAngle: number
  /** Brow arch (sag) multiplier. */
  browArch: number
  /** Neutral-cell mouth character. */
  mouth: 'neutral' | 'softSmile' | 'openGrin' | 'pursedSide' | 'flatDown'
}

const V1: FaceStyle = {
  dir: '',
  stroke: 1,
  eye: [1, 1],
  lid: 0,
  lowerLid: 0,
  upturn: 0,
  pupil: 1,
  catchlight: 1,
  sparkle: false,
  lash: false,
  brow: 1,
  browLift: 0,
  browAngle: 0,
  browArch: 1,
  mouth: 'neutral',
}

/** 관상 grammar table, one row per authored personality. */
const PERSONALITY_STYLES: FaceStyle[] = [
  {
    // pure/kind: large round wide-open eyes, big soft pupils, thin high brows,
    // light stroke, small soft smile
    ...V1,
    dir: 'gentle',
    stroke: 0.85,
    eye: [1.06, 1.14],
    pupil: 1.18,
    catchlight: 1.3,
    brow: 0.68,
    browLift: 14,
    browArch: 0.8,
    mouth: 'softSmile',
  },
  {
    // big slightly upturned eyes, big sparkly pupils, raised animated brows,
    // light-medium stroke, open grin
    ...V1,
    dir: 'cheerful',
    stroke: 0.95,
    eye: [1.0, 1.06],
    upturn: 0.1,
    pupil: 1.1,
    catchlight: 1.15,
    sparkle: true,
    brow: 0.9,
    browLift: 10,
    browArch: 1.5,
    mouth: 'openGrin',
  },
  {
    // snooty/smug: half-lidded, medium pupil with lash accent, high thin
    // arched brows, medium stroke, small pursed side smile
    ...V1,
    dir: 'proud',
    stroke: 1.05,
    eye: [0.98, 1.02],
    lid: 0.34,
    pupil: 0.95,
    catchlight: 0.85,
    lash: true,
    brow: 0.78,
    browLift: 20,
    browArch: 1.7,
    mouth: 'pursedSide',
  },
  {
    // strong/cranky: narrowed eyes, small intense pupils, thick low brows
    // angled in, heavy stroke, flat/downturned mouth
    ...V1,
    dir: 'gruff',
    stroke: 1.3,
    eye: [1.02, 0.9],
    lid: 0.22,
    lowerLid: 0.14,
    upturn: -0.04,
    pupil: 0.72,
    catchlight: 0.6,
    sparkle: false,
    brow: 1.55,
    browLift: -12,
    browAngle: 26,
    browArch: 0.55,
    mouth: 'flatDown',
  },
]

// ---------------------------------------------------------------------------
// Cell art, style-driven. All authored at 256px, center ~(128,128), y-up.
// Eye art is authored for the eye whose OUTER corner points toward -x
// (the viewer-left eye); the rig mirrors U for the other eye.
// ---------------------------------------------------------------------------

const OUT_W = 14 // base outline stroke width
const LINE_W = 16 // base drawn-line stroke width (closed lids, happy arcs)

function buildEyeArt(s: FaceStyle): Map<string, CellPainter> {
  const outW = OUT_W * s.stroke
  const lineW = LINE_W * s.stroke
  const [sx, sy] = s.eye

  /** Aperture treatment shared by every eye-white cell. */
  function aperture(shape: Sdf, cy: number, ry: number): Sdf {
    let f = shape
    if (s.lid > 0) f = intersect(f, belowLine(60, cy + ry * (1 - 2 * s.lid), 196, cy + ry * (1 - 2 * s.lid)))
    if (s.lowerLid > 0) f = intersect(f, aboveLine(60, cy - ry * (1 - 2 * s.lowerLid), 196, cy - ry * (1 - 2 * s.lowerLid)))
    if (s.upturn !== 0) f = shearX(f, s.upturn)
    return f
  }

  function eyeWhite(shape: Sdf): CellPainter {
    const painters: CellPainter = [
      { sdf: shape, color: WHITE },
      { sdf: outline(shape, outW), color: INK },
    ]
    if (s.lash) {
      // lash tick sweeping up from the outer (-x) corner of the (lidded) eye
      const c = Math.max(-0.9, Math.min(0.9, 1 - 2 * s.lid))
      const lashY = 124 + 66 * sy * c - 4
      const lashX = 128 - 52 * sx * Math.sqrt(1 - c * c) - 2
      painters.push({ sdf: stroke(polyline([[lashX, lashY], [lashX - 24, lashY + 20]]), outW * 0.75), color: INK })
    }
    return painters
  }

  const openEye = aperture(ellipse(128, 124, 52 * sx, 66 * sy), 124, 66 * sy)
  const wideEye = aperture(ellipse(128, 126, 60 * sx, 76 * sy), 126, 76 * sy)
  const halfEye = intersect(aperture(ellipse(128, 124, 52 * sx, 66 * sy), 124, 66 * sy), belowLine(60, 140, 196, 140))
  const squintEye = intersect(circle(128, 124 + 50, 82 * ((sx + sy) / 2)), circle(128, 124 - 50, 82 * ((sx + sy) / 2)))
  const sadEye = intersect(aperture(ellipse(128, 124, 52 * sx, 66 * sy), 124, 66 * sy), belowLine(88, 134, 168, 162))
  const angryEye = intersect(aperture(ellipse(128, 124, 52 * sx, 66 * sy), 124, 66 * sy), belowLine(88, 162, 168, 134))

  return new Map<string, CellPainter>([
    ['open', eyeWhite(openEye)],
    ['half', eyeWhite(halfEye)],
    ['closed', [{ sdf: stroke(arc(70, 186, 122, -26), lineW), color: INK }]],
    ['happy', [{ sdf: stroke(arc(70, 186, 118, 40 * (0.8 + 0.4 * sy)), lineW), color: INK }]],
    ['wide', eyeWhite(wideEye)],
    ['squint', eyeWhite(squintEye)],
    ['sad', eyeWhite(sadEye)],
    ['angry', eyeWhite(angryEye)],
    [
      'heart',
      [
        { sdf: heart(128, 116, 74), color: HEART_PINK },
        { sdf: outline(heart(128, 116, 74), 12 * s.stroke), color: INK },
      ],
    ],
    [
      'star',
      [
        { sdf: star(128, 124, 62, 27), color: STAR_GOLD },
        { sdf: outline(star(128, 124, 62, 27), 11 * s.stroke), color: INK },
      ],
    ],
    ['spiralDizzy', [{ sdf: stroke(spiral(128, 124, 8, 56, 2.4), 12 * s.stroke), color: INK }]],
    ['wink', [{ sdf: stroke(arc(76, 180, 116, 34), lineW), color: INK }]],
  ])
}

function buildMouthArt(s: FaceStyle): Map<string, CellPainter> {
  const w13 = 13 * s.stroke
  const w14 = 14 * s.stroke

  const grinShape = intersect(circle(128, 148, 62), belowLine(56, 148, 200, 148))
  const openMouth = ellipse(128, 122, 44, 38)
  const vAaMouth = ellipse(128, 122, 50, 48)
  const vEeMouth = ellipse(128, 126, 62, 22)
  const vOhMouth = circle(128, 124, 30)

  function filledMouth(shape: Sdf, extras: Layer[] = []): CellPainter {
    return [{ sdf: shape, color: MOUTH_DARK }, ...extras, { sdf: outline(shape, 12 * s.stroke), color: INK }]
  }

  // neutral cell carries the personality's default mouth character
  const neutralByStyle: Record<FaceStyle['mouth'], CellPainter> = {
    neutral: [{ sdf: stroke(arc(96, 160, 126, -8), w13), color: INK }],
    softSmile: [{ sdf: stroke(arc(102, 154, 127, -16), w13), color: INK }],
    openGrin: filledMouth(intersect(circle(128, 146, 52), belowLine(64, 146, 192, 146)), [
      { sdf: intersect(circle(128, 146, 52), belowLine(64, 146, 192, 146), (x, y) => 134 - y), color: WHITE },
    ]),
    pursedSide: [{ sdf: stroke(arc(118, 158, 125, -12), w13), color: INK }],
    flatDown: [{ sdf: stroke(arc(100, 156, 124, 7), w14), color: INK }],
  }

  return new Map<string, CellPainter>([
    ['neutral', neutralByStyle[s.mouth]],
    ['smile', [{ sdf: stroke(arc(82, 174, 132, -28), w14), color: INK }]],
    [
      'open',
      filledMouth(openMouth, [{ sdf: intersect(ellipse(128, 96, 30, 20), openMouth), color: TONGUE }]),
    ],
    ['frown', [{ sdf: stroke(arc(84, 172, 116, 24), w14), color: INK }]],
    ['oh', filledMouth(circle(128, 124, 23))],
    [
      'grin',
      filledMouth(grinShape, [
        { sdf: intersect(grinShape, belowLine(56, 148, 200, 148), (x, y) => 134 - y), color: WHITE },
      ]),
    ],
    ['pout', [{ sdf: stroke(arc(102, 154, 118, 16), w13), color: INK }]],
    [
      'tongue',
      [
        { sdf: stroke(arc(92, 164, 134, -18), w14), color: INK },
        { sdf: ellipse(128, 98, 21, 25), color: TONGUE },
        { sdf: outline(ellipse(128, 98, 21, 25), 10 * s.stroke), color: INK },
      ],
    ],
    ['vAa', filledMouth(vAaMouth)],
    ['vEe', filledMouth(vEeMouth, [{ sdf: intersect(vEeMouth, (x, y) => y - 130), color: WHITE }])],
    ['vOh', filledMouth(vOhMouth)],
    ['vMm', [{ sdf: stroke(arc(88, 168, 124, -4), w14), color: INK }]],
  ])
}

function buildBrowArt(s: FaceStyle): Map<string, CellPainter> {
  const w = 19 * s.brow
  const lift = s.browLift
  const angle = s.browAngle // inner (+x) end drop
  // brows: outer end toward -x (mirrored for the other side)
  const browPath = (y: number, sag: number): Sdf =>
    angle === 0
      ? arc(72, 184, y, sag)
      : polyline([
          [72, y + sag * 0.4],
          [130, y + sag],
          [184, y - angle],
        ])
  return new Map<string, CellPainter>([
    ['neutral', [{ sdf: stroke(browPath(122 + lift, 18 * s.browArch), w), color: INK }]],
    ['raised', [{ sdf: stroke(browPath(128 + lift, 34 * s.browArch), w), color: INK }]],
    // knit: inner (+x) end pulled down (anger) — angle stacks on top
    ['knit', [{ sdf: stroke(polyline([[76, 148 + lift], [130, 138 + lift], [182, 106 + lift - angle * 0.5]]), w), color: INK }]],
    // sadOuter: outer (-x) end pulled down
    ['sadOuter', [{ sdf: stroke(polyline([[74, 106 + lift], [126, 138 + lift], [180, 148 + lift]]), w), color: INK }]],
  ])
}

function buildPupilArt(s: FaceStyle): Map<string, CellPainter> {
  function pupil(irisR: number, pupilR: number, lightR: number, extraSparkle = false): CellPainter {
    const iR = irisR * s.pupil
    const pR = pupilR * s.pupil
    const lR = lightR * s.pupil * s.catchlight
    const painters: CellPainter = [
      { sdf: circle(128, 128, iR), color: IRIS },
      { sdf: circle(128, 124, pR), color: PUPIL },
      { sdf: circle(128 - iR * 0.34, 128 + iR * 0.4, lR), color: WHITE },
      { sdf: circle(128 + iR * 0.3, 128 - iR * 0.38, Math.max(3, lR * 0.42)), color: WHITE },
    ]
    if (extraSparkle) {
      painters.push(
        { sdf: circle(128 + iR * 0.42, 128 + iR * 0.55, Math.max(3, lR * 0.5)), color: WHITE },
        { sdf: circle(128 - iR * 0.1, 128 - iR * 0.6, Math.max(2, lR * 0.32)), color: WHITE },
      )
    }
    return painters
  }

  return new Map<string, CellPainter>([
    ['round', pupil(34, 21, 10, s.sparkle)],
    ['big', pupil(44, 28, 12, s.sparkle)],
    ['small', pupil(24, 15, 7)],
    [
      'sparkle',
      [
        ...pupil(40, 26, 12),
        { sdf: circle(128 + 14, 128 + 20, 6), color: WHITE },
        { sdf: circle(128 - 4, 128 - 22, 4), color: WHITE },
      ],
    ],
  ])
}

// ---------------------------------------------------------------------------
// Cell positions — mirrored from src/core/face/atlas.ts (that file is the
// source of truth; atlas.test.ts guards it; drift here is caught visually).
// ---------------------------------------------------------------------------

const EYE_POS = {
  open: [0, 0], half: [1, 0], closed: [2, 0], happy: [3, 0],
  wide: [0, 1], squint: [1, 1], sad: [2, 1], angry: [3, 1],
  heart: [0, 2], star: [1, 2], spiralDizzy: [2, 2], wink: [3, 2],
} as const
const MOUTH_POS = {
  neutral: [0, 0], smile: [1, 0], open: [2, 0], frown: [3, 0],
  oh: [0, 1], grin: [1, 1], pout: [2, 1], tongue: [3, 1],
  vAa: [0, 2], vEe: [1, 2], vOh: [2, 2], vMm: [3, 2],
} as const
const BROW_POS = { neutral: [0, 0], raised: [1, 0], knit: [2, 0], sadOuter: [3, 0] } as const
const PUPIL_POS = { round: [0, 0], big: [1, 0], small: [2, 0], sparkle: [3, 0] } as const

function writeAtlasSet(style: FaceStyle): void {
  const dir = style.dir ? join(OUT_DIR, style.dir) : OUT_DIR
  mkdirSync(dir, { recursive: true })
  const atlases: Array<[string, ReadonlyMap<string, CellPainter>, Record<string, readonly [number, number]>]> = [
    ['eye-atlas.png', buildEyeArt(style), EYE_POS],
    ['mouth-atlas.png', buildMouthArt(style), MOUTH_POS],
    ['brow-atlas.png', buildBrowArt(style), BROW_POS],
    ['pupil-atlas.png', buildPupilArt(style), PUPIL_POS],
  ]
  for (const [file, art, pos] of atlases) {
    const rgba = renderAtlas(art, pos)
    writeFileSync(join(dir, file), encodePng(rgba, SIZE, SIZE))
    console.log(`wrote ${style.dir || 'v1'}/${file}`)
  }
}

writeAtlasSet(V1)
for (const style of PERSONALITY_STYLES) writeAtlasSet(style)
