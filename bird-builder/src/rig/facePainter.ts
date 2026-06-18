import * as THREE from 'three'
import { toonMat } from './toon'

// The canvas FACE painter — lifted verbatim out of the old Kira-port builder (it
// is the studio's best charm surface, provenance-clean, and DOM-isolated). It
// paints a 1024×512 CanvasTexture (face ellipse, cheeks, optional cheek-mark, two
// expressive eyes) and returns a head MeshToonMaterial named 'head'. It reads a
// small structural FaceParams record (CharacterConfig satisfies it today) so it is
// decoupled from the abandoned Kira geometry config.

export interface FaceParams {
  faceY: number
  faceZ: number
  faceYOffset: number
  faceColor: string | null
  cheekSize: number
  cheekZ: number
  eyeWhite: number
  eyeSquash: number
  eyeY: number
  eyeZ: number
  eyeTilt: number
  pupilScaleX: number
  pupilScaleY: number
  pupilOffsetY: number
  upperLid: number
  lowerLid: number
  lidColor: string | null
  eyeRingColor: string | null
  lash: boolean
  shine: boolean
  brow: number
  browW: number
}

export interface PainterPalette {
  eye: string
  back: string
  face: string
  accent: string
}

export function makeFaceMaterial(
  c: FaceParams,
  palette: PainterPalette,
  cheekMark: 'none' | 'dot' | 'swirl',
  gradient: THREE.Texture,
): THREE.MeshToonMaterial {
  const width = 1024
  const height = 512
  const size = height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return toonMat({ gradientMap: gradient, color: palette.back, name: 'head' })
  ctx.fillStyle = palette.back
  ctx.fillRect(0, 0, width, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = width * 0.5
  const cy = size * 0.54 + c.faceYOffset * size * 0.2
  const faceRx = size * c.faceZ * 0.36
  const faceRy = size * c.faceY * 0.34
  const cheekY = cy + faceRy * 0.36
  const cheekX = size * c.cheekZ * 0.54
  const eyeY = cy - size * c.eyeY * 0.48
  const eyeSep = size * c.eyeZ * 0.62
  const eyeH = size * c.eyeWhite * 0.8
  const eyeW = eyeH * (0.62 + c.eyeSquash * 0.95)

  drawEllipse(ctx, cx, cy, faceRx, faceRy, palette.face)
  drawEllipse(ctx, cx - cheekX, cheekY, size * c.cheekSize * 0.42, size * c.cheekSize * 0.38, palette.accent, 0, 0.7)
  drawEllipse(ctx, cx + cheekX, cheekY, size * c.cheekSize * 0.42, size * c.cheekSize * 0.38, palette.accent, 0, 0.7)
  if (cheekMark !== 'none') {
    drawCheekMark(ctx, cheekMark, cx - cheekX, cheekY, size * c.cheekSize * 0.3, palette.eye)
    drawCheekMark(ctx, cheekMark, cx + cheekX, cheekY, size * c.cheekSize * 0.3, palette.eye)
  }
  drawPaintedEye(ctx, c, palette, -1, cx - eyeSep, eyeY, eyeW, eyeH)
  drawPaintedEye(ctx, c, palette, +1, cx + eyeSep, eyeY, eyeW, eyeH)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return toonMat({ gradientMap: gradient, map: texture, color: '#ffffff', name: 'head' })
}

function drawPaintedEye(
  ctx: CanvasRenderingContext2D,
  c: FaceParams,
  palette: PainterPalette,
  side: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const tilt = c.eyeTilt * side
  const lid = c.lidColor || palette.back

  if (c.eyeRingColor) drawEllipse(ctx, x, y, w * 0.78, h * 0.72, c.eyeRingColor, tilt)
  drawEllipse(ctx, x, y, w * 0.56, h * 0.58, '#fff8ec', tilt)

  const pupilW = w * c.pupilScaleX * 0.3
  const pupilH = h * c.pupilScaleY * 0.34
  drawEllipse(ctx, x + side * w * 0.05, y + h * c.pupilOffsetY, pupilW, pupilH, palette.eye, tilt)

  if (c.shine) drawEllipse(ctx, x - side * w * 0.08, y - h * 0.16, w * 0.08, h * 0.08, '#ffffff')

  if (c.upperLid > 0) {
    ctx.save()
    ctx.translate(x, y - h * (0.52 - c.upperLid * 0.16))
    ctx.rotate(tilt)
    ctx.fillStyle = lid
    ctx.beginPath()
    ctx.ellipse(0, 0, w * 0.58, h * c.upperLid * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  if (c.lowerLid > 0) {
    ctx.save()
    ctx.translate(x, y + h * 0.52)
    ctx.rotate(tilt)
    ctx.fillStyle = lid
    ctx.beginPath()
    ctx.ellipse(0, 0, w * 0.58, h * c.lowerLid * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const browY = y - h * 0.72
  const browX = x + side * w * 0.06
  drawStroke(ctx, browX, browY, w * c.browW * 1.2, h * 0.1, palette.eye, side > 0 ? -c.brow : c.brow)

  if (c.lash) {
    drawStroke(ctx, x + side * w * 0.4, y - h * 0.1, w * 0.22, h * 0.05, palette.eye, side * -0.75)
    drawStroke(ctx, x + side * w * 0.42, y + h * 0.12, w * 0.18, h * 0.05, palette.eye, side * -0.2)
  }
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  rot = 0,
  alpha = 1,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: string,
  rot = 0,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.strokeStyle = stroke
  ctx.lineWidth = Math.max(4, h)
  ctx.beginPath()
  ctx.moveTo(-w * 0.5, 0)
  ctx.lineTo(w * 0.5, 0)
  ctx.stroke()
  ctx.restore()
}

function drawCheekMark(ctx: CanvasRenderingContext2D, kind: 'dot' | 'swirl', x: number, y: number, r: number, color: string): void {
  if (kind === 'dot') {
    drawEllipse(ctx, x, y, r * 0.4, r * 0.4, color, 0, 0.85)
    return
  }
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.8
  ctx.lineWidth = Math.max(3, r * 0.18)
  ctx.beginPath()
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const a = t * Math.PI * 2.4
    const rad = r * 0.5 * t
    const px = x + Math.cos(a) * rad
    const py = y + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()
}
