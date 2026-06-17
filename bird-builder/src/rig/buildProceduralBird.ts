import * as THREE from 'three'
import type { BeakType, CrestType, ProceduralBase, TailType } from '../bird/genome'
import { type CharacterConfig, resolveCharacter } from '../bird/morphology'
import { toonMat } from './toon'

// The procedural bird assembler — ported from the product engine's proven
// buildStandingBird (src/engine/student-space/Game/View/Kira.js). The geometry +
// face painter are app-authored (provenance-clean). Reconciled to the studio's
// MeshToonMaterial via the shared toonMat factory (the wing keeps vertexColors,
// the head keeps its canvas map — port-bug #1). Returns { root, attach, dispose }:
// `attach` are the nodes accessories portal into (re-derived for the procedural
// rig — the GLB bone names don't exist here), and `dispose` frees geometry +
// materials + the 1024×512 face CanvasTexture so edit churn doesn't leak GPU
// memory (port-bug #4).

export interface ProceduralBird {
  root: THREE.Group
  attach: { head: THREE.Object3D; held: THREE.Object3D; body: THREE.Object3D }
  dispose: () => void
}

const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) =>
  new THREE.Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)

// Keep dark beak colors from reading as a black smudge — lift toward accent/belly.
function getFriendlyBeakColor(beak: string, accent: string, belly: string, keepsDark: boolean): THREE.Color {
  const c = new THREE.Color(beak)
  const luminance = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
  if (!keepsDark && luminance < 0.28) return new THREE.Color(accent).lerp(new THREE.Color(belly), 0.35)
  return c
}

// ── Beak as a silhouette PART (net-new vs Kira's single parameterized beak) ─────
// Each BeakType scales the base beak cfg and adds a downturn `hook` to the tip.
interface BeakProfile {
  lengthMul: number
  widthMul: number
  heightMul: number
  hook: number
}
function makeBeakProfile(type: BeakType): BeakProfile {
  switch (type) {
    case 'slender':
      return { lengthMul: 1.28, widthMul: 0.76, heightMul: 0.8, hook: 0 }
    case 'stout':
      return { lengthMul: 0.84, widthMul: 1.3, heightMul: 1.24, hook: 0 }
    case 'hooked':
      return { lengthMul: 1.06, widthMul: 0.98, heightMul: 1.04, hook: 0.55 }
    default: // short
      return { lengthMul: 0.6, widthMul: 1.12, heightMul: 0.96, hook: 0.12 }
  }
}

export function buildProceduralBird(base: ProceduralBase, gradient: THREE.Texture): ProceduralBird {
  const c = resolveCharacter(base)
  const p = base.palette

  // Per-individual plumage overrides win over species character defaults.
  if (p.faceColor !== undefined && p.faceColor !== null) c.faceColor = p.faceColor
  if (p.lidColor !== undefined && p.lidColor !== null) c.lidColor = p.lidColor
  if (p.eyeRingColor !== undefined && p.eyeRingColor !== null) c.eyeRingColor = p.eyeRingColor

  const root = new THREE.Group()
  root.scale.setScalar(c.scale)

  const bodyMat = toonMat({ gradientMap: gradient, color: p.back, name: 'zone:back' })
  const bellyMat = toonMat({ gradientMap: gradient, color: p.belly, name: 'zone:belly' })
  const accentMat = toonMat({ gradientMap: gradient, color: p.accent, name: 'zone:accent' })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), bodyMat)
  body.geometry.scale(c.body.x, c.body.y, c.body.z)
  body.position.set(0, c.bodyY, 0)
  root.add(body)

  const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 14), bellyMat)
  bellyPatch.geometry.scale(0.065, c.belly.y, c.belly.z)
  bellyPatch.position.set(c.bellyX, c.bellyY, 0)
  root.add(bellyPatch)

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(c.neckTop, c.neckBottom, c.neckH, 16), bellyMat)
  neck.position.set(0.04, c.neckY, 0)
  root.add(neck)

  // Head group — also the headwear attach node.
  const head = new THREE.Group()
  head.position.set(c.headX, c.headY, 0)
  const headMat = makeFaceMaterial(c, { eye: p.eye, back: p.back, face: c.faceColor || p.belly, accent: p.accent }, base.face.cheekMark ?? 'none', gradient)
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(c.headSize, 48, 28), headMat)
  headMesh.geometry.scale(c.headScale.x, c.headScale.y, c.headScale.z)
  head.add(headMesh)

  const friendlyBeak = getFriendlyBeakColor(p.beak, p.accent, p.belly, c.beakKeepsDark)
  head.add(makeStandingBeak(friendlyBeak, c.headSize, c.beak, base.parts.beak, gradient))

  if (base.parts.crest !== 'none') {
    const crest = makeCrest(base.parts.crest, p.accent, c.headSize * c.crestScale, gradient)
    crest.position.set(-c.headSize * 0.08, c.headSize * 0.76, 0)
    head.add(crest)
  }
  root.add(head)

  const wingL = makeStandingWing(p.back, p.accent, c.wing, gradient)
  wingL.position.set(c.wing.x, c.wing.y, c.wing.z)
  wingL.rotation.z = c.wing.rest
  root.add(wingL)
  const wingR = makeStandingWing(p.back, p.accent, c.wing, gradient)
  wingR.position.set(c.wing.x, c.wing.y, -c.wing.z)
  wingR.scale.z = -1 // mirror (port-bug: the right wing is the left, flipped)
  wingR.rotation.z = -c.wing.rest
  root.add(wingR)

  const legL = makeStandingLeg(p.legs, c.leg, gradient)
  legL.position.set(0.1, c.leg.y, c.leg.z)
  root.add(legL)
  const legR = makeStandingLeg(p.legs, c.leg, gradient)
  legR.position.set(0.1, c.leg.y, -c.leg.z)
  root.add(legR)

  const tail = new THREE.Group()
  tail.position.set(-c.tail.x, c.tail.y, 0)
  const tailGeo = makeTailGeometry(base.parts.tail)
  tailGeo.scale(c.tail.scaleX, c.tail.scaleY, c.tail.scaleZ)
  tail.add(new THREE.Mesh(tailGeo, accentMat))
  root.add(tail)

  // ── Accessory attach nodes (re-derived for the procedural rig) ──────────────
  const held = new THREE.Group()
  held.position.set(c.wing.x + 0.18, c.wing.y - 0.1, -c.wing.z - 0.04)
  root.add(held)
  const bodyAttach = new THREE.Group()
  bodyAttach.position.set(0.04, c.neckY - 0.04, 0)
  root.add(bodyAttach)

  const dispose = () => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        const mat = m as THREE.MeshToonMaterial
        if (mat.map) mat.map.dispose()
        mat.dispose()
      }
    })
  }

  return { root, attach: { head, held, body: bodyAttach }, dispose }
}

// ── Face painter (1024×512 CanvasTexture; DOM-bound → rig layer only) ───────────
interface PainterPalette {
  eye: string
  back: string
  face: string
  accent: string
}

function makeFaceMaterial(
  c: CharacterConfig,
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
  c: CharacterConfig,
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

// ── Wings / legs / beak / crest / tail (faithful ports) ─────────────────────────
function makeStandingWing(back: string, accent: string, cfg: CharacterConfig['wing'], gradient: THREE.Texture): THREE.Group {
  const wing = new THREE.Group()
  const mat = toonMat({ gradientMap: gradient, vertexColors: true, side: THREE.DoubleSide, name: 'wing' })
  const backColor = new THREE.Color(back)
  const accentColor = new THREE.Color(accent)
  const positions: number[] = []
  const colors: number[] = []
  const L = cfg.length
  const rootW = cfg.rootW
  const tipW = cfg.tipW

  const pts = [
    [rootW * 0.5, 0.06, 0],
    [-rootW * 0.5, -0.02, 0],
    [-tipW * 0.62, -L * 0.82, 0],
    [0.0, -L, 0],
    [tipW * 0.62, -L * 0.82, 0],
    [tipW * 0.42, -L * 0.24, 0],
  ]
  const tris = [0, 1, 5, 1, 2, 5, 2, 3, 4, 2, 4, 5]
  for (const i of tris) {
    const pt = pts[i]
    positions.push(...pt)
    const k = THREE.MathUtils.smoothstep(-pt[1], L * 0.35, L)
    const col = lerpColor(backColor, accentColor, k)
    colors.push(col.r, col.g, col.b)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  wing.add(new THREE.Mesh(geo, mat))

  const featherMat = toonMat({ gradientMap: gradient, color: accent, name: 'zone:accent' })
  for (let i = 0; i < cfg.feathers; i++) {
    const t = cfg.feathers === 1 ? 0.5 : i / (cfg.feathers - 1)
    const x = THREE.MathUtils.lerp(-tipW * 0.42, tipW * 0.42, t)
    const feather = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), featherMat)
    feather.geometry.scale(tipW * 0.15, L * 0.18, 0.018)
    feather.position.set(x, -L * (0.78 + Math.abs(t - 0.5) * 0.16), 0.012)
    feather.rotation.z = THREE.MathUtils.lerp(0.25, -0.25, t)
    wing.add(feather)
  }
  return wing
}

function makeStandingLeg(color: string, cfg: CharacterConfig['leg'], gradient: THREE.Texture): THREE.Group {
  const leg = new THREE.Group()
  const mat = toonMat({ gradientMap: gradient, color, name: 'zone:legs' })
  const legLen = cfg.len
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, legLen, 10), mat)
  shin.position.y = -legLen * 0.5
  leg.add(shin)

  const foot = new THREE.Group()
  foot.position.y = -legLen
  const toeGeo = new THREE.ConeGeometry(0.03, cfg.toe, 8)
  for (const [x, z, ry] of [
    [0.07, 0, 0],
    [0.035, 0.052, 0.35],
    [0.035, -0.052, -0.35],
  ]) {
    const toe = new THREE.Mesh(toeGeo, mat)
    toe.rotation.z = -Math.PI / 2
    toe.rotation.y = ry
    toe.position.set(x, -0.015, z)
    foot.add(toe)
  }
  leg.add(foot)
  return leg
}

function makeStandingBeak(
  color: THREE.Color,
  headSize: number,
  cfg: CharacterConfig['beak'],
  type: BeakType,
  gradient: THREE.Texture,
): THREE.Group {
  const profile = makeBeakProfile(type)
  const group = new THREE.Group()
  const mat = toonMat({ gradientMap: gradient, color, side: THREE.DoubleSide, name: 'zone:beak' })
  const darkMat = toonMat({ gradientMap: gradient, color: '#23150f', side: THREE.DoubleSide })

  const length = headSize * cfg.length * profile.lengthMul
  const width = headSize * cfg.width * profile.widthMul
  const height = headSize * cfg.height * profile.heightMul
  const gap = headSize * Math.max(cfg.gape || 0.02, 0.034)
  const rootX = headSize * 1.01
  const hook = profile.hook

  const upper = new THREE.Mesh(makeStandingBeakShellGeometry(length, width, height, true, hook), mat)
  upper.position.set(rootX, gap * 0.3, 0)
  group.add(upper)

  const mouth = new THREE.Mesh(makeStandingMouthGeometry(length * 0.76, width * 0.56, gap * 0.72), darkMat)
  mouth.position.set(rootX + length * 0.12, -gap * 0.1, 0)
  group.add(mouth)

  const lowerPivot = new THREE.Group()
  lowerPivot.position.set(rootX + length * 0.03, -gap * 0.34, 0)
  const lower = new THREE.Mesh(makeStandingBeakShellGeometry(length * 0.86, width * 0.82, height * 0.68, false, hook * 0.3), mat)
  lower.position.set(length * 0.03, 0, 0)
  lowerPivot.add(lower)
  group.add(lowerPivot)

  const restOpen = Math.max(cfg.open || 0, 0.055)
  lowerPivot.rotation.z = -restOpen
  return group
}

function makeStandingBeakShellGeometry(length: number, width: number, height: number, upper: boolean, hook: number): THREE.BufferGeometry {
  const radialSegments = 18
  const stride = radialSegments + 1
  const tipDrop = height * hook // hooked beaks bend the tip downward
  const rings = [
    { x: 0, w: width * 0.62, h: height * (upper ? 0.58 : 0.42), cy: upper ? 0 : -height * 0.03 },
    { x: length * 0.43, w: width, h: height * (upper ? 0.86 : 0.58), cy: upper ? height * 0.02 : -height * 0.07 },
    { x: length * 0.82, w: width * 0.44, h: height * (upper ? 0.4 : 0.3), cy: (upper ? -height * 0.01 : -height * 0.09) - tipDrop * 0.5 },
  ]
  const positions: number[] = []
  const indices: number[] = []
  for (const ring of rings) {
    for (let i = 0; i <= radialSegments; i++) {
      const t = i / radialSegments
      const a = upper ? t * Math.PI : Math.PI + t * Math.PI
      positions.push(ring.x, ring.cy + Math.sin(a) * ring.h, Math.cos(a) * ring.w)
    }
  }
  const tipIndex = positions.length / 3
  positions.push(length, (upper ? -height * 0.04 : -height * 0.11) - tipDrop, 0)
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = r * stride + i
      const b = a + 1
      const cc = (r + 1) * stride + i
      const d = cc + 1
      if (upper) indices.push(a, cc, b, b, cc, d)
      else indices.push(a, b, cc, b, d, cc)
    }
  }
  const lastRing = (rings.length - 1) * stride
  for (let i = 0; i < radialSegments; i++) {
    const a = lastRing + i
    const b = a + 1
    if (upper) indices.push(a, tipIndex, b)
    else indices.push(a, b, tipIndex)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function makeStandingMouthGeometry(length: number, halfWidth: number, drop: number): THREE.BufferGeometry {
  const positions = [
    0, 0, -halfWidth,
    0, 0, halfWidth,
    length, -drop, 0,
    0, -drop * 0.34, -halfWidth * 0.62,
    length * 0.88, -drop * 1.06, 0,
    0, -drop * 0.34, halfWidth * 0.62,
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex([0, 1, 2, 3, 4, 5])
  geo.computeVertexNormals()
  return geo
}

function makeCrest(type: CrestType, color: string, headSize: number, gradient: THREE.Texture): THREE.Mesh {
  const positions: number[] = []
  if (type === 'pointed') {
    const w = headSize * 0.32
    const h = headSize * 1.1
    positions.push(-w, 0, 0, w, 0, 0, headSize * 0.15, h, 0)
  } else if (type === 'tuft') {
    for (let i = 0; i < 3; i++) {
      const cx = (i - 1) * headSize * 0.25
      const w = headSize * 0.12
      const h = headSize * 0.55
      positions.push(cx - w, 0, 0, cx + w, 0, 0, cx, h, 0)
    }
  } else if (type === 'fan') {
    const blades = 5
    const fanW = headSize * 1.4
    const fanH = headSize * 0.85
    for (let i = 0; i < blades; i++) {
      const t1 = (i - (blades - 1) / 2) / blades
      const t2 = (i + 1 - (blades - 1) / 2) / blades
      positions.push(0, 0, 0, fanW * t1, fanH, 0, fanW * t2, fanH, 0)
    }
  } else if (type === 'curve') {
    const N = 4
    const radius = headSize * 0.95
    for (let i = 0; i < N; i++) {
      const a1 = (i / N) * Math.PI * 0.42 - 0.05
      const a2 = ((i + 1) / N) * Math.PI * 0.42 - 0.05
      positions.push(0, 0, 0, Math.sin(a1) * radius, Math.cos(a1) * radius, 0, Math.sin(a2) * radius, Math.cos(a2) * radius, 0)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, toonMat({ gradientMap: gradient, color, side: THREE.DoubleSide, name: 'zone:accent' }))
}

function makeTailGeometry(type: TailType): THREE.BufferGeometry {
  const positions: number[] = []
  const W = 0.34
  const L = type === 'long-fan' ? 0.78 : type === 'short-fan' ? 0.36 : type === 'pointed' ? 0.6 : type === 'forked' ? 0.62 : 0.42

  if (type === 'short-fan' || type === 'long-fan') {
    positions.push(0, 0, 0, -L, 0.04, -W, -L, 0.04, W)
  } else if (type === 'pointed') {
    positions.push(0, 0, 0, -L, 0, -W * 0.25, -L, 0, W * 0.25)
  } else if (type === 'forked') {
    positions.push(0, 0, 0, -L * 0.95, 0, -W * 0.7, -L * 1.1, 0.04, -W * 0.3)
    positions.push(0, 0, 0, -L * 1.1, 0.04, W * 0.3, -L * 0.95, 0, W * 0.7)
  } else {
    positions.push(0, 0, -W, 0, 0, W, -L, 0, -W)
    positions.push(0, 0, W, -L, 0, W, -L, 0, -W)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}
