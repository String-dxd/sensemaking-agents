// TypeScript pattern-mask rasterizer (plan 015 step 1, executed by plan 019).
//
// Body patterns are NOT 2D drawings: each is a function that assigns per-vertex
// palette channel weights (R/G/B/A = primary/secondary/belly/accentA) in 3D
// body space, on the procedural body's vertices. This module (a) evaluates the
// AC-exact species pattern fields on a `ProcBodyData`, and (b) rasterizes those
// per-vertex channels into a 1024² mask texture over the body's UV atlas — the
// same USE_PALETTE_MASK path the toon shader already samples.
//
// This REPLACES the Blender-baked `body-*.mask.png` for procedural bodies (they
// were unwrapped against the retired GLBs and misalign on the kit's UVs — the
// reason assemble.ts fell back to per-vertex channels, which can't hold crisp
// two-tone regions at torso mesh density). The rasterizer's island-aware blur
// also fixes the wave-1 "seam stripe down the back": the naive box blur bled
// across UV islands; here the blur only averages pixels that share a UV island,
// so no interior pixel ever reads a neighbour island's channels.

import * as THREE from 'three'
import { buildProceduralBody, type ProcBodyData } from '../procgen/body'
import { UV_ATLAS, type UvRect } from '../procgen/kit/uv'
import { smoothstep } from '../procgen/kit/surface'
import type { Archetype } from '../spec/schema'

// --- channel indices (mirror kit/channels.ts) --------------------------------

const CH_SECONDARY = 1
const CH_BELLY = 2
const CH_ACCENT = 3

// --- canvas seam (mirrors faceComposite.ts CANVAS TEST STRATEGY) -------------
// The hot path (viewport) uses a THREE.DataTexture built from the raw uint8
// buffer — no canvas dependency. A canvas is only needed for PNG export and
// node tests, behind an injectable factory so @napi-rs/canvas stays a devDep.

export interface RasterImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface RasterContext2D {
  createImageData(width: number, height: number): RasterImageData
  putImageData(image: RasterImageData, dx: number, dy: number): void
}

export interface CanvasLike {
  width: number
  height: number
  getContext(contextId: '2d'): RasterContext2D | null
  /** @napi-rs/canvas (node) — synchronous PNG bytes. */
  toBuffer?(mime: 'image/png'): Uint8Array
  /** DOM + napi — synchronous data URL fallback. */
  toDataURL?(type?: string): string
}

export type CanvasFactory = (width: number, height: number) => CanvasLike

function domCreateCanvas(width: number, height: number): CanvasLike {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas as unknown as CanvasLike
}

function get2d(canvas: CanvasLike): RasterContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('patternRaster: 2d canvas context unavailable')
  return ctx
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Synchronous PNG bytes from a filled canvas, in both node and the browser. */
function canvasToPng(canvas: CanvasLike): Uint8Array {
  if (canvas.toBuffer) return canvas.toBuffer('image/png')
  if (canvas.toDataURL) {
    const url = canvas.toDataURL('image/png')
    return decodeBase64(url.slice(url.indexOf(',') + 1))
  }
  throw new Error('patternRaster: canvas has neither toBuffer nor toDataURL')
}

// --- rasterizer core ---------------------------------------------------------

export interface RasterInput {
  /** Per-vertex UVs (length 2·n), in the exported glTF convention (v-flipped). */
  uv: Float32Array
  /** Triangle indices over the merged body buffer (length 3·ntri). */
  indices: Uint32Array
  /** Per-vertex RGBA channel weights (length 4·n). */
  channels: Float32Array
}

export interface RasterResult {
  canvas: CanvasLike
  /** Memoized DataTexture (flipY=false, NoColorSpace) for the viewport. */
  toDataTexture(): THREE.DataTexture
  /** Memoized PNG bytes for export. */
  pngBytes(): Uint8Array
}

/**
 * The UV atlas as an ordered [name, rect] list — island index = array index.
 * `UV_ATLAS` rects are in Blender (bottom-up) v-space, but the geometry's UVs
 * are the glTF EXPORT flip (`islandUv` returns `1 − v_blender`, see kit/uv.ts),
 * so the rects are flipped here once: gltf v-range = [1−v1, 1−v0].
 */
const ISLANDS: ReadonlyArray<readonly [string, UvRect]> = Object.entries(UV_ATLAS).map(
  ([name, [u0, v0, u1, v1]]) => [name, [u0, 1 - v1, u1, 1 - v0] as const] as const,
)

/** Island index containing a glTF-space UV (u,v), or -1 in a gutter. */
function islandAt(u: number, v: number): number {
  for (let k = 0; k < ISLANDS.length; k++) {
    const [, [u0, v0, u1, v1]] = ISLANDS[k]
    if (u >= u0 && u <= u1 && v >= v0 && v <= v1) return k
  }
  return -1
}

const EPS = 0.001

/**
 * Barycentric UV triangle fill of per-vertex channels into a `size²` RGBA
 * image, then island-aware 4px edge dilation, then an island-aware 2px blur.
 * Deterministic: pure float math in a fixed iteration order.
 *
 * Pixel mapping: `px = u·size`, `py = v·size` (row 0 = top). The input UVs are
 * the geometry's — ALREADY glTF-flipped (v points down, head TOP pole at v=0;
 * kit/uv.ts) — and `flipY=false` uploads row 0 at texture v=0, so glTF v maps
 * to rows DIRECTLY, no extra flip. (faceComposite's `y = (1−v)·size` applies
 * the same flip once, to Blender-space rect coords — equivalent convention.)
 */
export function rasterizeChannels(input: RasterInput, size: number, createCanvas: CanvasFactory = domCreateCanvas): RasterResult {
  const { uv, indices, channels } = input
  const px = size * size
  // RGBA float accumulators; background = full primary (channel R=1).
  const color = new Float32Array(px * 4)
  for (let p = 0; p < px; p++) color[p * 4] = 1
  const covered = new Uint8Array(px)

  // Static per-pixel island map (independent of coverage) — the key to
  // island-aware dilation/blur: a pixel's island is which atlas rect its UV
  // centre falls in, so the blur never crosses a rect boundary.
  const island = new Int16Array(px)
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      island[y * size + x] = islandAt(u, v)
    }
  }

  const toPx = (i: number): [number, number] => [uv[i * 2] * size, uv[i * 2 + 1] * size]

  // --- triangle fill (later triangles overwrite earlier) --------------------
  // Skip triangles that don't live inside ONE UV island: bridge triangles
  // (welding pieces together) span two islands, and front-centred wrap-seam
  // triangles span the whole island width — both would smear zero/foreign
  // channels across the atlas. The 1px seams they leave are refilled by the
  // island-aware dilation below.
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]
    const ib = indices[t + 1]
    const ic = indices[t + 2]
    // Classify by centroid (robust to verts sitting exactly on a shared island
    // edge, where float32 rounding is ambiguous).
    const uMin = Math.min(uv[ia * 2], uv[ib * 2], uv[ic * 2])
    const uMax = Math.max(uv[ia * 2], uv[ib * 2], uv[ic * 2])
    const vMin = Math.min(uv[ia * 2 + 1], uv[ib * 2 + 1], uv[ic * 2 + 1])
    const vMax = Math.max(uv[ia * 2 + 1], uv[ib * 2 + 1], uv[ic * 2 + 1])
    const isl = islandAt((uv[ia * 2] + uv[ib * 2] + uv[ic * 2]) / 3, (uv[ia * 2 + 1] + uv[ib * 2 + 1] + uv[ic * 2 + 1]) / 3)
    if (isl < 0) continue
    const [, [ru0, rv0, ru1, rv1]] = ISLANDS[isl]
    if (uMax - uMin > 0.5 * (ru1 - ru0) || vMax - vMin > 0.5 * (rv1 - rv0)) continue
    const [ax, ay] = toPx(ia)
    const [bx, by] = toPx(ib)
    const [cx, cy] = toPx(ic)
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)))
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)))
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)))
    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if (Math.abs(denom) < 1e-12) continue // degenerate (bridge sliver)
    const inv = 1 / denom
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5
        const wa = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) * inv
        const wb = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) * inv
        const wc = 1 - wa - wb
        if (wa < -EPS || wb < -EPS || wc < -EPS) continue
        const p = (y * size + x) * 4
        for (let ch = 0; ch < 4; ch++) {
          color[p + ch] = wa * channels[ia * 4 + ch] + wb * channels[ib * 4 + ch] + wc * channels[ic * 4 + ch]
        }
        covered[y * size + x] = 1
      }
    }
  }

  // --- island-aware edge dilation (4px into empty in-island space) ----------
  const DILATE = 4
  for (let pass = 0; pass < DILATE; pass++) {
    const prev = covered.slice()
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x
        if (prev[idx] || island[idx] < 0) continue
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= size) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= size) continue
            const ni = ny * size + nx
            if (!prev[ni] || island[ni] !== island[idx]) continue
            const q = ni * 4
            r += color[q]
            g += color[q + 1]
            b += color[q + 2]
            a += color[q + 3]
            n++
          }
        }
        if (n === 0) continue
        const p = idx * 4
        color[p] = r / n
        color[p + 1] = g / n
        color[p + 2] = b / n
        color[p + 3] = a / n
        covered[idx] = 1
      }
    }
  }

  // --- island-aware blur (~2px: two 3×3 passes, same-island only) -----------
  for (let pass = 0; pass < 2; pass++) {
    const src = color.slice()
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x
        if (!covered[idx]) continue
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= size) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= size) continue
            const ni = ny * size + nx
            if (!covered[ni] || island[ni] !== island[idx]) continue
            const q = ni * 4
            r += src[q]
            g += src[q + 1]
            b += src[q + 2]
            a += src[q + 3]
            n++
          }
        }
        if (n === 0) continue
        const p = idx * 4
        color[p] = r / n
        color[p + 1] = g / n
        color[p + 2] = b / n
        color[p + 3] = a / n
      }
    }
  }

  // --- pack uint8 -----------------------------------------------------------
  const bytes = new Uint8Array(px * 4)
  for (let p = 0; p < px * 4; p++) bytes[p] = Math.round(Math.min(Math.max(color[p], 0), 1) * 255)

  let dataTexture: THREE.DataTexture | null = null
  let png: Uint8Array | null = null
  let canvas: CanvasLike | null = null
  const ensureCanvas = (): CanvasLike => {
    if (!canvas) {
      canvas = createCanvas(size, size)
      const ctx = get2d(canvas)
      const img = ctx.createImageData(size, size)
      img.data.set(bytes)
      ctx.putImageData(img, 0, 0)
    }
    return canvas
  }

  return {
    get canvas() {
      return ensureCanvas()
    },
    toDataTexture(): THREE.DataTexture {
      if (!dataTexture) {
        const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat)
        tex.flipY = false
        tex.colorSpace = THREE.NoColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.needsUpdate = true
        dataTexture = tex
      }
      return dataTexture
    },
    pngBytes(): Uint8Array {
      if (!png) png = canvasToPng(ensureCanvas())
      return png
    },
  }
}

// --- pattern fields (AC-exact) -----------------------------------------------

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1)
const gauss = (dx: number, dy: number, sigma: number): number => Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
const tri = (x: number): number => Math.abs((x - Math.floor(x)) - 0.5) * 2
/** Argyle diamond lattice: 1 at cell centres, 0 at cell edges (soft-gated). */
const argyle = (u: number, v: number): number => 1 - smoothstep(0.55, 1.0, tri(u) + tri(v))

interface FieldCtx {
  pos: Float32Array
  out: Float32Array
  ranges: Record<string, [number, number]>
  torso: { cy: number; ry: number; rx: number; rz: number }
  hc: readonly [number, number, number]
  hr: number
  limbParams: Record<string, Float32Array>
  centroids: Record<string, readonly [number, number, number]>
}

/** Per-vertex position cache — ProcBodyData exposes positions via its scene. */
const bufferCache = new WeakMap<ProcBodyData, { positions: Float32Array; uv: Float32Array; indices: Uint32Array }>()

/** Extract the merged position/uv arrays + full index set from the body scene.
 * The region SkinnedMeshes SHARE one position/uv BufferAttribute (assemble.ts),
 * so any mesh's attribute is the full merged buffer; the full triangle set is
 * the concatenation of every region geometry's own index. */
export function bodyBuffers(body: ProcBodyData): { positions: Float32Array; uv: Float32Array; indices: Uint32Array } {
  const hit = bufferCache.get(body)
  if (hit) return hit
  let positions: Float32Array | null = null
  let uv: Float32Array | null = null
  const indexChunks: ArrayLike<number>[] = []
  body.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geo = mesh.geometry as THREE.BufferGeometry
    if (!positions) positions = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    if (!uv) uv = (geo.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array
    const index = geo.getIndex()
    if (index) indexChunks.push(index.array as ArrayLike<number>)
  })
  if (!positions || !uv) throw new Error('patternRaster: body scene has no position/uv geometry')
  let total = 0
  for (const c of indexChunks) total += c.length
  const indices = new Uint32Array(total)
  let off = 0
  for (const c of indexChunks) {
    indices.set(c as unknown as ArrayLike<number>, off)
    off += c.length
  }
  const result = { positions: positions as Float32Array, uv: uv as Float32Array, indices }
  bufferCache.set(body, result)
  return result
}

function makeCtx(body: ProcBodyData): FieldCtx {
  const { positions } = bodyBuffers(body)
  const centroids: Record<string, [number, number, number]> = {}
  for (const [name, [s, e]] of Object.entries(body.meta.shellRanges)) {
    const c: [number, number, number] = [0, 0, 0]
    for (let i = s; i < e; i++) {
      c[0] += positions[i * 3]
      c[1] += positions[i * 3 + 1]
      c[2] += positions[i * 3 + 2]
    }
    const n = Math.max(1, e - s)
    centroids[name] = [c[0] / n, c[1] / n, c[2] / n]
  }
  return {
    pos: positions,
    out: body.channels.slice(),
    ranges: body.meta.shellRanges,
    torso: body.meta.torso,
    hc: body.meta.headCenter,
    hr: Math.max(body.meta.headRadius, 1e-9),
    limbParams: body.meta.limbParams,
    centroids,
  }
}

const setCh = (ctx: FieldCtx, i: number, ch: number, v: number): void => {
  ctx.out[i * 4 + ch] = clamp01(v)
}
const maxCh = (ctx: FieldCtx, i: number, ch: number, v: number): void => {
  ctx.out[i * 4 + ch] = clamp01(Math.max(ctx.out[i * 4 + ch], v))
}

/** Iterate the head island: normalized (dx,dy,dz) in head-radius units. */
function eachHead(ctx: FieldCtx, fn: (i: number, dx: number, dy: number, dz: number) => void): void {
  const r = ctx.ranges.head
  if (!r) return
  for (let i = r[0]; i < r[1]; i++) {
    fn(i, (ctx.pos[i * 3] - ctx.hc[0]) / ctx.hr, (ctx.pos[i * 3 + 1] - ctx.hc[1]) / ctx.hr, (ctx.pos[i * 3 + 2] - ctx.hc[2]) / ctx.hr)
  }
}

/** Iterate the torso island with world (x,y,z). */
function eachTorso(ctx: FieldCtx, fn: (i: number, x: number, y: number, z: number) => void): void {
  const r = ctx.ranges.torso
  if (!r) return
  for (let i = r[0]; i < r[1]; i++) fn(i, ctx.pos[i * 3], ctx.pos[i * 3 + 1], ctx.pos[i * 3 + 2])
}

/** Iterate a piece with world (x,y,z). */
function eachPiece(ctx: FieldCtx, name: string, fn: (i: number, x: number, y: number, z: number) => void): void {
  const r = ctx.ranges[name]
  if (!r) return
  for (let i = r[0]; i < r[1]; i++) fn(i, ctx.pos[i * 3], ctx.pos[i * 3 + 1], ctx.pos[i * 3 + 2])
}

/** Iterate a limb piece with its along-chain param t and world (x,y,z). */
function eachLimb(ctx: FieldCtx, name: string, fn: (i: number, t: number, x: number, y: number, z: number) => void): void {
  const r = ctx.ranges[name]
  if (!r) return
  const lp = ctx.limbParams[name]
  for (let i = r[0]; i < r[1]; i++) {
    const t = lp ? lp[i - r[0]] : 0
    fn(i, t, ctx.pos[i * 3], ctx.pos[i * 3 + 1], ctx.pos[i * 3 + 2])
  }
}

const LIMBS = ['armL', 'armR', 'legL', 'legR'] as const
const HANDS_FEET = ['handL', 'handR', 'footL', 'footR'] as const

// --- pattern registry (id → field that returns the modified channels) --------

export type PatternField = (body: ProcBodyData) => Float32Array

export const PATTERN_FIELDS: Record<string, PatternField> = {
  // --- birds (013 defaults upgraded per plan 019 §Step 2) -------------------
  'pattern-robin': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    // Breast bib: saturated front ellipse, crisper edge than the 013 default.
    // Center lowered + radii enlarged (revision 1): on the chibi body the
    // head-chin overlap hides the upper chest, so `cy + 0.15·ry` sat mostly
    // out of view — the bib must land on the visible chest between the wings.
    eachTorso(ctx, (i, x, y, z) => {
      const du = x / (1.0 * rx)
      const dv = (y - (cy - 0.05 * ry)) / (0.75 * ry)
      const front = smoothstep(0.0, 0.3, z / rxS)
      setCh(ctx, i, CH_BELLY, (1 - smoothstep(0.85, 1.05, Math.hypot(du, dv))) * front * 1.0)
    })
    // Face + throat patch reaching down to meet the bib (no gap).
    eachHead(ctx, (i, _dx, dy, dz) => {
      setCh(ctx, i, CH_BELLY, smoothstep(0.1, 0.55, dz) * smoothstep(0.75, -0.5, dy) * 0.95)
    })
    return ctx.out
  },

  'pattern-owl': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    // Facial disc: two overlapping ellipses (heart) around the eyes, front-gated.
    eachHead(ctx, (i, dx, dy, dz) => {
      const front = smoothstep(-0.1, 0.3, dz)
      const disc = clamp01(Math.max(gauss(dx - 0.33, dy - 0.1, 0.42), gauss(dx + 0.33, dy - 0.1, 0.42)))
      setCh(ctx, i, CH_BELLY, disc * front)
      // ACCENT outline ring where the disc edge falls.
      const ring = smoothstep(0.3, 0.45, disc) * (1 - smoothstep(0.5, 0.68, disc)) * front * 0.7
      maxCh(ctx, i, CH_ACCENT, ring)
      // Brow band above the disc.
      maxCh(ctx, i, CH_SECONDARY, smoothstep(0.35, 0.6, dy) * front * 0.9)
    })
    // Chest argyle: BELLY diamonds, SECONDARY in the negative cells.
    // Revision 1: coarser lattice (~3.5–4 diamonds across the chest — 5 was
    // too fine at this body size) and negative-cell weight 0.35 → 0.55 so
    // the beige-on-cream lattice reads at normal viewport zoom.
    eachTorso(ctx, (i, x, y, z) => {
      const front = smoothstep(0.0, 0.35, z / rxS)
      const u = (x / rx) * 1.9
      const v = ((y - cy) / ry) * 1.9
      const diamond = argyle(u, v)
      setCh(ctx, i, CH_BELLY, front * diamond * 0.9)
      maxCh(ctx, i, CH_SECONDARY, front * (1 - diamond) * 0.55)
    })
    return ctx.out
  },

  'pattern-duckling': (body) => {
    const ctx = makeCtx(body)
    // Crown cap (secondary) + belly boosted.
    eachHead(ctx, (i, _dx, dy) => {
      setCh(ctx, i, CH_SECONDARY, smoothstep(0.25, 0.7, dy) * 0.95)
    })
    eachTorso(ctx, (i) => {
      maxCh(ctx, i, CH_BELLY, ctx.out[i * 4 + CH_BELLY] * 1.2)
    })
    // Wing speculum band, ACCENT raised to full.
    for (const wing of ['armL', 'armR'] as const) {
      eachLimb(ctx, wing, (i, t) => {
        setCh(ctx, i, CH_ACCENT, smoothstep(0.5, 0.6, t) * (1 - smoothstep(0.78, 0.88, t)) * 1.0)
      })
    }
    return ctx.out
  },

  'pattern-penguin': (body) => {
    const ctx = makeCtx(body)
    const rxS = Math.max(ctx.torso.rx, 1e-9)
    // Dark head, light face-oval front.
    eachHead(ctx, (i, dx, dy, dz) => {
      const faceOval = smoothstep(0.15, 0.4, dz) * smoothstep(0.55, -0.35, dy) * (1 - smoothstep(0.35, 0.7, Math.abs(dx)))
      setCh(ctx, i, CH_SECONDARY, 1 - faceOval)
      setCh(ctx, i, CH_BELLY, 0)
    })
    // Tuxedo torso: white belly front, dark back.
    eachTorso(ctx, (i, _x, _y, z) => {
      setCh(ctx, i, CH_BELLY, smoothstep(-0.05, 0.25, z / rxS))
      setCh(ctx, i, CH_SECONDARY, smoothstep(-0.05, 0.25, -z / rxS))
    })
    // Dark flippers.
    for (const wing of ['armL', 'armR'] as const) eachPiece(ctx, wing, (i) => setCh(ctx, i, CH_SECONDARY, 1))
    return ctx.out
  },

  'pattern-eagle': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    // White head everywhere.
    eachHead(ctx, (i) => {
      setCh(ctx, i, CH_BELLY, 1)
      setCh(ctx, i, CH_SECONDARY, 0)
    })
    // Dark brown body below the neck ring, with a white throat drop up front.
    eachTorso(ctx, (i, _x, y, z) => {
      const throat = smoothstep(0.1, 0.4, z / rxS) * smoothstep(cy + ry * 0.7, cy + ry * 0.35, y)
      setCh(ctx, i, CH_BELLY, throat)
      setCh(ctx, i, CH_SECONDARY, 0.9 * (1 - throat))
    })
    // Striped tarsi. 017 (bare-tarsus accent) not landed → gate t>0.45 as bare.
    for (const leg of ['legL', 'legR'] as const) {
      eachLimb(ctx, leg, (i, t) => {
        const bare = smoothstep(0.45, 0.52, t)
        setCh(ctx, i, CH_ACCENT, bare * (0.5 + 0.5 * smoothstep(0.35, 0.4, tri(t * 3))))
      })
    }
    return ctx.out
  },

  'pattern-chicken': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    // Clean body: no belly, no back saddle. Tail zone (back-bottom) secondary.
    eachTorso(ctx, (i, _x, y, z) => {
      setCh(ctx, i, CH_BELLY, 0)
      const tail = smoothstep(0.15, 0.6, -z / rxS) * smoothstep(cy + ry * 0.1, cy - ry * 0.4, y)
      setCh(ctx, i, CH_SECONDARY, tail * 0.6)
    })
    // Two scallop rows on the wings.
    for (const wing of ['armL', 'armR'] as const) {
      eachLimb(ctx, wing, (i, t) => {
        const row1 = smoothstep(0.5, 0.55, t) * (1 - smoothstep(0.62, 0.67, t))
        const row2 = smoothstep(0.72, 0.77, t) * (1 - smoothstep(0.84, 0.9, t))
        setCh(ctx, i, CH_SECONDARY, clamp01(row1 + row2) * 0.8)
      })
    }
    return ctx.out
  },

  'pattern-peacock': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    // Head + neck stay royal-blue primary.
    eachHead(ctx, (i) => {
      setCh(ctx, i, CH_BELLY, 0)
      setCh(ctx, i, CH_SECONDARY, 0)
    })
    // Green saddle across the back (widened default gate) + small chest crescent.
    eachTorso(ctx, (i, x, y, z) => {
      setCh(ctx, i, CH_SECONDARY, smoothstep(0.05, 0.6, -z / rxS) * 0.9)
      const du = x / (0.7 * rx)
      const dv = (y - (cy + 0.2 * ry)) / (0.45 * ry)
      const front = smoothstep(0.0, 0.3, z / rxS)
      setCh(ctx, i, CH_BELLY, (1 - smoothstep(0.7, 1.0, Math.hypot(du, dv))) * front * 0.8)
    })
    // Striped tarsi (as eagle).
    for (const leg of ['legL', 'legR'] as const) {
      eachLimb(ctx, leg, (i, t) => {
        const bare = smoothstep(0.45, 0.52, t)
        setCh(ctx, i, CH_ACCENT, bare * (0.5 + 0.5 * smoothstep(0.35, 0.4, tri(t * 3))))
      })
    }
    return ctx.out
  },

  // --- mammals (ported verbatim from plan 015's table; NOT restyled) --------
  'pattern-shiba': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    eachHead(ctx, (i, dx, dy, dz) => {
      const facePatch = smoothstep(0.2, 0.7, dz) * smoothstep(0.6, -0.2, dy)
      const brow = Math.max(gauss(dx - 0.28, dy - 0.45, 0.16) * (dz > 0.5 ? 1 : dz / 0.5), gauss(dx + 0.28, dy - 0.45, 0.16) * (dz > 0.5 ? 1 : dz / 0.5))
      setCh(ctx, i, CH_BELLY, clamp01(facePatch + brow) * 0.9)
    })
    eachTorso(ctx, (i, x, y, z) => {
      const du = x / (rx * 0.85 * 1.15)
      const dv = (y - (cy + 0.05 * ry)) / (ry * 0.62)
      const front = smoothstep(0.0, 0.35, z / rxS)
      setCh(ctx, i, CH_BELLY, (1 - smoothstep(0.55, 1.0, Math.hypot(du, dv))) * front)
    })
    for (const limb of LIMBS) {
      const c = ctx.centroids[limb]
      eachPiece(ctx, limb, (i, _x, _y, z) => {
        maxCh(ctx, i, CH_BELLY, 0.85 * smoothstep(0.1, 0.5, (z - c[2]) / (ctx.hr * 0.5) + 0.5))
      })
    }
    return ctx.out
  },

  'pattern-tabby': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    eachTorso(ctx, (i, _x, y, z) => {
      const back = smoothstep(0.15, 0.75, -z / rxS) * smoothstep(cy - ry * 0.5, cy + ry * 0.45, y)
      // Horizontal bars run around the back so they cross the wrap seam
      // continuously; amplitude raised (0.45→0.6) for contrast (015 polish).
      setCh(ctx, i, CH_SECONDARY, back * (0.4 + 0.6 * Math.abs(Math.sin(70 * y))))
    })
    eachHead(ctx, (i, dx, _dy, dz) => {
      const cap = smoothstep(0.3, 0.8, dz)
      setCh(ctx, i, CH_SECONDARY, cap * (0.75 + 0.25 * Math.sin(9 * dx)) * 0.9)
    })
    return ctx.out
  },

  'pattern-fox': (body) => {
    const ctx = makeCtx(body)
    eachHead(ctx, (i, dx, dy, dz) => {
      const cheek = smoothstep(0.05, 0.5, dz) * smoothstep(0.5, -0.4, dy) * (1 + 0.4 * smoothstep(0.1, 0.5, Math.abs(dx)))
      setCh(ctx, i, CH_BELLY, clamp01(cheek))
    })
    for (const limb of LIMBS) eachLimb(ctx, limb, (i, t) => setCh(ctx, i, CH_ACCENT, smoothstep(0.45, 0.7, t)))
    for (const hf of HANDS_FEET) eachPiece(ctx, hf, (i) => setCh(ctx, i, CH_ACCENT, 1.0))
    return ctx.out
  },

  'pattern-bear': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    eachHead(ctx, (i, _dx, dy, dz) => {
      setCh(ctx, i, CH_BELLY, smoothstep(0.45, 0.8, dz) * smoothstep(0.25, -0.35, dy))
    })
    eachTorso(ctx, (i, x, y, z) => {
      const du = x / (rx * 0.55)
      const dv = (y - (cy + 0.2 * ry)) / (ry * 0.55)
      const front = smoothstep(0.0, 0.35, z / rxS)
      setCh(ctx, i, CH_BELLY, (1 - smoothstep(0.55, 1.0, Math.hypot(du, dv))) * front)
    })
    return ctx.out
  },

  'pattern-rabbit': (body) => {
    const ctx = makeCtx(body)
    const { cy, ry, rx } = ctx.torso
    const rxS = Math.max(rx, 1e-9)
    eachTorso(ctx, (i, x, y, z) => {
      const du = x / (rx * 0.85 * 1.2)
      const dv = (y - (cy - ry * 0.12)) / (ry * 0.62)
      const front = smoothstep(0.0, 0.35, z / rxS)
      setCh(ctx, i, CH_BELLY, (1 - smoothstep(0.55, 1.0, Math.hypot(du, dv))) * front)
    })
    eachHead(ctx, (i, _dx, _dy, dz) => {
      setCh(ctx, i, CH_BELLY, smoothstep(0.2, 0.55, dz))
    })
    for (const foot of ['footL', 'footR'] as const) eachPiece(ctx, foot, (i) => maxCh(ctx, i, CH_BELLY, 0.6))
    return ctx.out
  },
}

/** Channels for a body under a textureId — a pattern field, or the plain
 * authored defaults (`ProcBodyData.channels` as-is). */
export function resolvePatternChannels(textureId: string, body: ProcBodyData): Float32Array {
  const field = PATTERN_FIELDS[textureId]
  return field ? field(body) : body.channels.slice()
}

// --- body-mask resolution (memoized) -----------------------------------------

const MASK_VERSION = 2 // bump to invalidate all cached masks on a raster change
const bodyDataCache = new Map<Archetype, ProcBodyData>()
const maskCache = new Map<string, RasterResult>()

function bodyData(archetype: Archetype): ProcBodyData {
  let b = bodyDataCache.get(archetype)
  if (!b) {
    b = buildProceduralBody(archetype)
    bodyDataCache.set(archetype, b)
  }
  return b
}

/**
 * The rasterized body mask for `(textureId, archetype)` — the DataTexture for
 * the viewport and PNG bytes for export, memoized so a body rasterizes once per
 * (archetype, pattern). `'authored'` rasterizes the plain default channels.
 */
export function getBodyMask(textureId: string, archetype: Archetype): { dataTexture: THREE.DataTexture; pngBytes: () => Uint8Array } {
  const key = `${MASK_VERSION}:${archetype}:${textureId}`
  let res = maskCache.get(key)
  if (!res) {
    const body = bodyData(archetype)
    const channels = resolvePatternChannels(textureId, body)
    const { uv, indices } = bodyBuffers(body)
    res = rasterizeChannels({ uv, indices, channels }, 1024)
    maskCache.set(key, res)
  }
  const result = res
  return { dataTexture: result.toDataTexture(), pngBytes: () => result.pngBytes() }
}
