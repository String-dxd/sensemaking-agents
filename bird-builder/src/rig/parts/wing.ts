import * as THREE from 'three'
import { lerpColor, smoothstep } from './util'

// The feathered wing — rebuilt as a LAYERED FAN of distinct primary feathers
// (not one scalloped flap, which vanished against a same-color body). A small
// covert pad at the shoulder connects the wing flush to the flank (no paper-thin,
// no gap); below it, N overlapping feather blades sweep down-and-back, their tips
// splayed so each is silhouetted against the background — the feather read the
// user wants, from any angle. Each blade carries a root→tip back→accent gradient
// so the tips pick up the AC accent band.
//
// Built in wing-local XY (feathers hang along −Y, fan spreads in X = chord),
// thin in Z so the broad faces point LATERALLY (±Z). The caller places it at the
// flank and adds outward splay; the shape is z-symmetric so both sides reuse it.

export interface BuiltWing {
  group: THREE.Group
  tipLocalY: number
}

function featherShape(w: number, len: number, pointy: number): THREE.Shape {
  const s = new THREE.Shape()
  const tipW = w * (1 - pointy) * 0.4
  s.moveTo(0, 0)
  s.quadraticCurveTo(w * 0.5, -len * 0.32, w * 0.34, -len * 0.82)
  s.quadraticCurveTo(w * 0.2, -len, tipW, -len)
  s.lineTo(-tipW, -len)
  s.quadraticCurveTo(-w * 0.2, -len, -w * 0.34, -len * 0.82)
  s.quadraticCurveTo(-w * 0.5, -len * 0.32, 0, 0)
  return s
}

export function buildWing(
  cfg: { feathers: number; length: number; chord: number; depth: number },
  back: string,
  accent: string,
  gradient: THREE.Texture,
): BuiltWing {
  const group = new THREE.Group()
  const N = Math.max(3, cfg.feathers)
  const L = cfg.length
  const W = cfg.chord * 0.42 // single-feather width
  const backC = new THREE.Color(back)
  const accentC = new THREE.Color(accent)
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, vertexColors: true, side: THREE.DoubleSide })
  mat.name = 'wing'

  // Covert pad — a rounded scoop over the feather roots that meets the body.
  const covertGeo = new THREE.SphereGeometry(cfg.chord * 0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6)
  covertGeo.scale(0.85, 0.7, 0.5)
  const covertColors = new Float32Array((covertGeo.attributes.position as THREE.BufferAttribute).count * 3)
  for (let i = 0; i < covertColors.length; i += 3) {
    covertColors[i] = backC.r
    covertColors[i + 1] = backC.g
    covertColors[i + 2] = backC.b
  }
  covertGeo.setAttribute('color', new THREE.BufferAttribute(covertColors, 3))
  const covert = new THREE.Mesh(covertGeo, mat)
  covert.castShadow = true
  group.add(covert)

  // Primary feathers — fan spread across the chord (X), rear feathers longer.
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0.5 : i / (N - 1) // 0 → 1 across the fan
    const ang = -0.08 - t * 0.5 // sweep DOWN-AND-BACK only (never forward into the body)
    const len = L * (0.78 + 0.34 * t) // outer feathers longer
    const geo = new THREE.ExtrudeGeometry(featherShape(W, len, 0.55), { depth: cfg.depth, bevelEnabled: false })
    geo.translate(0, 0, -cfg.depth / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)
    for (let v = 0; v < pos.count; v++) {
      const k = THREE.MathUtils.clamp(-pos.getY(v) / len, 0, 1)
      const col = lerpColor(backC, accentC, smoothstep(0.35, 1, k))
      cols[v * 3] = col.r
      cols[v * 3 + 1] = col.g
      cols[v * 3 + 2] = col.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    const blade = new THREE.Mesh(geo, mat)
    blade.castShadow = true
    blade.rotation.z = ang // fan across the chord
    blade.position.set(Math.sin(ang) * cfg.chord * 0.18, -cfg.chord * 0.12, (t - 0.5) * cfg.depth * 1.2)
    group.add(blade)
  }

  return { group, tipLocalY: -L * 1.1 }
}
