import * as THREE from 'three'
import type { BeakStyle } from '../../bird/buildPlan'

// Per-archetype beak/bill. cone = small conical (songbird/bower/ostrich); hook =
// raptor beak with a strong downturned upper tip (eagle); stout = short fat
// (chicken); bill = a flat wide spatula (duck). A wedge box tapered at the front
// is the shared primitive; the bill is a flattened, much-wider wedge. All sit
// buried ~10% into the head so there is no floating gap.

// Box wedge: back face full, front tapered to `frontTaper`; `hook` drops the tip.
function wedge(len: number, w: number, h: number, frontTaper: number, hook: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(len, h, w, 2, 1, 2)
  geo.translate(len / 2, 0, 0)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const f = pos.getX(i) / len
    if (f > 0.35) {
      const k = THREE.MathUtils.lerp(1, frontTaper, (f - 0.35) / 0.65)
      pos.setY(i, pos.getY(i) * k - hook * h * Math.max(0, f - 0.35))
      pos.setZ(i, pos.getZ(i) * k)
    }
  }
  geo.computeVertexNormals()
  return geo
}

interface BeakDims { len: number; w: number; h: number; taper: number; hook: number; lowerH: number; y: number; tilt: number }
function dimsFor(style: BeakStyle, headR: number): BeakDims {
  switch (style) {
    case 'hook':
      return { len: headR * 0.56, w: headR * 0.42, h: headR * 0.46, taper: 0.32, hook: 0.7, lowerH: 0.5, y: -headR * 0.04, tilt: 0 }
    case 'stout':
      return { len: headR * 0.4, w: headR * 0.46, h: headR * 0.42, taper: 0.46, hook: 0.12, lowerH: 0.62, y: -headR * 0.08, tilt: 0 }
    case 'bill':
      return { len: headR * 0.72, w: headR * 0.98, h: headR * 0.2, taper: 0.82, hook: 0.18, lowerH: 0.7, y: -headR * 0.04, tilt: 0 }
    case 'bent': // flamingo — medium bill kinked sharply downward
      return { len: headR * 0.74, w: headR * 0.4, h: headR * 0.26, taper: 0.5, hook: 0.95, lowerH: 0.72, y: -headR * 0.02, tilt: -0.55 }
    default: // cone
      return { len: headR * 0.5, w: headR * 0.34, h: headR * 0.3, taper: 0.24, hook: 0.06, lowerH: 0.6, y: -headR * 0.1, tilt: 0 }
  }
}

export interface BuiltBeak {
  group: THREE.Group
  lowerPivot: THREE.Group // hinged at the beak base — animate rotation.z to open/close
}

export function buildBeak(style: BeakStyle, headR: number, color: string, gradient: THREE.Texture, scale = 1): BuiltBeak {
  const d = dimsFor(style, headR)
  const len = d.len * scale
  const w = d.w * scale
  const h = d.h * scale
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color, side: THREE.DoubleSide })
  mat.name = 'beak'

  const upper = new THREE.Mesh(wedge(len, w, h, d.taper, d.hook), mat)
  upper.position.set(0, h * 0.18, 0)
  group.add(upper)

  // Lower mandible on a pivot at the base (x≈0) so it hinges open like a jaw.
  const lowerPivot = new THREE.Group()
  lowerPivot.position.set(0, -h * 0.06, 0)
  lowerPivot.rotation.z = -0.12
  const lower = new THREE.Mesh(wedge(len * (style === 'hook' || style === 'bent' ? 0.78 : 0.92), w * 0.88, h * d.lowerH, d.taper + 0.05, 0), mat)
  lower.position.set(0, -h * 0.16, 0)
  lowerPivot.add(lower)
  group.add(lowerPivot)

  group.rotation.z = d.tilt
  group.position.set(headR * 0.86, d.y, 0)
  return { group, lowerPivot }
}
