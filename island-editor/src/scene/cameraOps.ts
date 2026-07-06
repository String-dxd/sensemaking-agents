// Pure camera math for the editor's dock buttons. Framework-free (no three/r3f
// imports) so it unit-tests in the vitest node env; the App wires these onto the
// live OrbitControls instance.

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Orbit `pos` around the vertical (Y) axis through `target` by `angleRad`. Keeps
 *  height + radius; returns a NEW position. */
export function orbitAroundY(pos: Vec3, target: Vec3, angleRad: number): Vec3 {
  const ox = pos.x - target.x
  const oz = pos.z - target.z
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return { x: target.x + ox * c - oz * s, y: pos.y, z: target.z + ox * s + oz * c }
}

/** Dolly toward (factor<1) / away (factor>1) from `target`, clamping distance to
 *  [minDist, maxDist]. Returns a NEW position. */
export function dolly(pos: Vec3, target: Vec3, factor: number, minDist = 4, maxDist = 120): Vec3 {
  const dx = pos.x - target.x
  const dy = pos.y - target.y
  const dz = pos.z - target.z
  const dist = Math.hypot(dx, dy, dz) || 1e-6
  const s = Math.min(maxDist, Math.max(minDist, dist * factor)) / dist
  return { x: target.x + dx * s, y: target.y + dy * s, z: target.z + dz * s }
}

export const ROTATE_STEP = Math.PI / 8
export const ZOOM_IN_FACTOR = 0.8
export const ZOOM_OUT_FACTOR = 1.25
export const DEFAULT_CAMERA: Vec3 = { x: 14, y: 11, z: 14 } // matches <Canvas camera position>
