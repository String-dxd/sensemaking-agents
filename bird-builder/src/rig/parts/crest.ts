import * as THREE from 'three'
import type { CrestType } from '../../bird/genome'

// Head feathers built from the lozenge primitive. The bowerbird crest is an
// upright fan of pointed quills on the crown; tuft/fan/curve vary count + splay.
// Returns null for 'none'. Positioned by the caller on the head top.

function quillShape(w: number, len: number, pointy: number): THREE.Shape {
  const s = new THREE.Shape()
  const tipW = w * (1 - pointy) * 0.2
  s.moveTo(0, 0)
  s.quadraticCurveTo(w * 0.55, len * 0.25, tipW, len)
  s.lineTo(-tipW, len)
  s.quadraticCurveTo(-w * 0.55, len * 0.25, 0, 0)
  return s
}

function crestSpec(kind: CrestType): { quills: number; len: number; spread: number; pointy: number } | null {
  switch (kind) {
    case 'pointed':
      return { quills: 5, len: 0.5, spread: 0.62, pointy: 0.8 }
    case 'tuft':
      return { quills: 3, len: 0.2, spread: 0.5, pointy: 0.4 }
    case 'fan':
      return { quills: 5, len: 0.3, spread: 1.0, pointy: 0.6 }
    case 'curve':
      return { quills: 4, len: 0.32, spread: 0.7, pointy: 0.7 }
    default:
      return null
  }
}

// Peacock crown — a row of thin stalks each topped with a small ball, fanned up.
export function buildCrown(headR: number, color: string, gradient: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color, side: THREE.DoubleSide })
  mat.name = 'accent'
  const stalks = 5
  for (let i = 0; i < stalks; i++) {
    const t = i / (stalks - 1)
    const ang = (t - 0.5) * 0.7
    const len = headR * 0.5
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.012, headR * 0.012, len, 6), mat)
    stalk.position.set(-headR * 0.05, headR * 0.9 + len * 0.5, 0)
    stalk.rotation.z = ang
    group.add(stalk)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.07, 10, 8), mat)
    ball.position.set(-headR * 0.05 - Math.sin(ang) * len, headR * 0.9 + len + Math.cos(ang) * 0, 0)
    ball.position.x = -headR * 0.05 - Math.sin(ang) * len
    ball.position.y = headR * 0.9 + Math.cos(ang) * len
    group.add(ball)
  }
  return group
}

// Owl ear tufts — two pointed quill clusters angled outward at the crown corners.
export function buildEarTufts(headR: number, color: string, gradient: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color, side: THREE.DoubleSide })
  mat.name = 'zone:back'
  for (const s of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(quillShape(headR * 0.32, headR * 0.7, 0.85), { depth: 0.03, bevelEnabled: false })
    geo.translate(0, 0, -0.015)
    const tuft = new THREE.Mesh(geo, mat)
    tuft.position.set(-headR * 0.05, headR * 0.78, s * headR * 0.5)
    tuft.rotation.z = -0.2
    tuft.rotation.x = s * 0.4
    group.add(tuft)
  }
  return group
}

export function buildCrest(kind: CrestType, headR: number, color: string, gradient: THREE.Texture): THREE.Group | null {
  const spec = crestSpec(kind)
  if (!spec) return null
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color, side: THREE.DoubleSide })
  mat.name = 'accent'
  const W = headR * 0.34
  for (let i = 0; i < spec.quills; i++) {
    const t = spec.quills === 1 ? 0.5 : i / (spec.quills - 1)
    const ang = (t - 0.5) * spec.spread
    const geo = new THREE.ExtrudeGeometry(quillShape(W, headR * (0.55 + spec.len), spec.pointy), { depth: 0.02, bevelEnabled: false })
    geo.translate(0, 0, -0.01)
    const quill = new THREE.Mesh(geo, mat)
    quill.rotation.z = ang // fan in the sagittal (front-back) plane, standing up
    quill.position.x = (t - 0.5) * headR * 0.18
    group.add(quill)
  }
  return group
}
