import * as THREE from 'three'
import type { TailType } from '../../bird/genome'

// A tail FAN of distinct rounded-tip feather blades (the lozenge primitive). Each
// blade is a Shape→ExtrudeGeometry, cloned and rotated around a shared posterior
// pivot, shingle-staggered in z, tipped up so it reads pert. 'forked' lengthens the
// outer two and opens a center gap (swallow). Maps the TailType enum to count/length.

function bladeShape(w: number, len: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.quadraticCurveTo(w * 0.6, len * 0.2, w * 0.5, len * 0.7)
  s.quadraticCurveTo(w * 0.42, len, 0, len) // rounded outer tip
  s.quadraticCurveTo(-w * 0.42, len, -w * 0.5, len * 0.7)
  s.quadraticCurveTo(-w * 0.6, len * 0.2, 0, 0)
  return s
}

function tailSpec(kind: TailType): { blades: number; len: number; spread: number; fork: boolean } {
  switch (kind) {
    case 'long-fan':
      return { blades: 5, len: 0.42, spread: 0.5, fork: false }
    case 'short-fan':
      return { blades: 5, len: 0.26, spread: 0.55, fork: false }
    case 'pointed':
      return { blades: 3, len: 0.4, spread: 0.28, fork: false }
    case 'forked':
      return { blades: 4, len: 0.4, spread: 0.6, fork: true }
    default: // square
      return { blades: 4, len: 0.3, spread: 0.42, fork: false }
  }
}

export function buildTail(
  kind: TailType,
  color: string,
  gradient: THREE.Texture,
  opts: { blades?: number; eyespot?: boolean; spread?: number } = {},
): THREE.Group {
  const spec = tailSpec(kind)
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color, side: THREE.DoubleSide })
  mat.name = 'accent'
  const eyeMat = new THREE.MeshToonMaterial({ gradientMap: gradient, color: '#0b2a6b', side: THREE.DoubleSide })
  const W = 0.14
  const N = opts.blades ?? spec.blades
  const spread = opts.spread ?? spec.spread
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0.5 : i / (N - 1)
    const ang = (t - 0.5) * spread
    let len = spec.len
    if (spec.fork && (i === 0 || i === N - 1)) len *= 1.3
    const geo = new THREE.ExtrudeGeometry(bladeShape(W, len), { depth: 0.02, bevelEnabled: false })
    geo.translate(0, 0, -0.01)
    const blade = new THREE.Mesh(geo, mat)
    blade.rotation.x = ang
    blade.rotation.z = (t - 0.5) * 0.12
    blade.position.z = (t - 0.5) * 0.02
    if (opts.eyespot) {
      // a peacock eye-spot near the blade tip: dark inner dot on a bright ring
      const ring = new THREE.Mesh(new THREE.CircleGeometry(W * 0.34, 16), eyeMat)
      ring.position.set(0, len * 0.82, 0.012)
      blade.add(ring)
      const dot = new THREE.Mesh(new THREE.CircleGeometry(W * 0.16, 14), mat)
      dot.position.set(0, len * 0.82, 0.013)
      blade.add(dot)
    }
    group.add(blade)
  }
  group.rotation.z = 1.32
  return group
}
