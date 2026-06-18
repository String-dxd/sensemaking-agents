import * as THREE from 'three'

// Shared inverted-hull outline (one BackSide MeshBasicMaterial reused across the
// bird). Cloning the SOURCE geometry by reference is fine — dispose() is idempotent
// and traverses root once. Copies the source transform and grows it by `factor`.
export function addOutline(mesh: THREE.Mesh, parent: THREE.Object3D, mat: THREE.Material, factor = 1.04): THREE.Mesh {
  const o = new THREE.Mesh(mesh.geometry, mat)
  o.position.copy(mesh.position)
  o.quaternion.copy(mesh.quaternion)
  o.scale.copy(mesh.scale).multiplyScalar(factor)
  parent.add(o)
  return o
}

export function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return new THREE.Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
}

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
