import * as THREE from 'three'

// Chicken signatures: a red COMB (a row of rounded lobes along the crown, in the
// sagittal plane) and a WATTLE (a small lobe hanging under the beak). Both use a
// warm red toon material, distinct from the body — the instant "this is a chicken"
// read. Returned as groups the caller parents to the head.

const COMB_RED = '#e23b3b'

export function buildComb(headR: number, gradient: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color: COMB_RED, side: THREE.DoubleSide })
  mat.name = 'accent'
  const lobes = 4
  for (let i = 0; i < lobes; i++) {
    const t = i / (lobes - 1)
    const r = headR * (0.16 - Math.abs(t - 0.5) * 0.07) // taller in the middle
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat)
    lobe.scale.set(0.7, 1.25, 0.45) // flatten side-to-side, tall
    lobe.position.set((t - 0.5) * headR * 0.7, headR * 0.92, 0)
    lobe.castShadow = true
    group.add(lobe)
  }
  return group
}

export function buildWattle(headR: number, gradient: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshToonMaterial({ gradientMap: gradient, color: COMB_RED, side: THREE.DoubleSide })
  mat.name = 'accent'
  for (const s of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.12, 12, 10), mat)
    lobe.scale.set(0.5, 1.1, 0.6)
    lobe.position.set(headR * 0.7, -headR * 0.34, s * headR * 0.08)
    group.add(lobe)
  }
  return group
}
