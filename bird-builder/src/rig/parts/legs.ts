import * as THREE from 'three'

// Articulated chibi leg: a HIP pivot (swings the whole leg fore/aft) → thigh →
// KNEE pivot (bends the shin) → shin → foot. Returning the two pivots lets the
// animation drive a human-like walk cycle. 'toes' = 3 forward cone toes + a rear
// toe (eagle's thickened via `thick`); 'paddle' = a flat fused wedge (duck/chicken).
// Built hanging DOWN from the hip origin so the foot lands near y=0 when the hip is
// placed at the body bottom.

export interface BuiltLeg {
  group: THREE.Group // the HIP pivot (placed by the caller)
  knee: THREE.Group // the KNEE pivot (bend the shin)
}

export function buildLeg(
  color: string,
  legLen: number,
  gradient: THREE.Texture,
  style: 'toes' | 'paddle' = 'toes',
  thick = 1,
): BuiltLeg {
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color })
  mat.name = 'legs'
  const thighLen = legLen * 0.52
  const shinLen = legLen * 0.48

  const hip = new THREE.Group()
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * thick, 0.034 * thick, thighLen, 10), mat)
  thigh.position.y = -thighLen * 0.5
  thigh.castShadow = true
  hip.add(thigh)

  const knee = new THREE.Group()
  knee.position.y = -thighLen
  hip.add(knee)
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * thick, 0.03 * thick, shinLen, 10), mat)
  shin.position.y = -shinLen * 0.5
  shin.castShadow = true
  knee.add(shin)

  const foot = new THREE.Group()
  foot.position.y = -shinLen
  knee.add(foot)

  if (style === 'paddle') {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * thick, 0.11 * thick, 0.05, 14), mat)
    pad.scale.set(1, 1, 0.78)
    pad.position.set(0.05, -0.02, 0)
    foot.add(pad)
  } else {
    const toeGeo = new THREE.ConeGeometry(0.034 * thick, 0.15 * thick, 8)
    for (const [x, z, ry] of [
      [0.075, 0, 0],
      [0.04, 0.058, 0.42],
      [0.04, -0.058, -0.42],
      [-0.05, 0, Math.PI],
    ]) {
      const toe = new THREE.Mesh(toeGeo, mat)
      toe.rotation.z = -Math.PI / 2
      toe.rotation.y = ry
      toe.position.set(x, -0.015, z)
      foot.add(toe)
    }
  }
  return { group: hip, knee }
}
