// Inverted-hull outline pass (plan 005, step 3). AC has NO outlines — this
// is an optional per-character style toggle (spec `MaterialAssign.outline`),
// off by default.
//
// The shell is the mesh geometry re-rendered BackSide with vertices pushed
// along ANGLE-WEIGHTED SMOOTHED normals (precomputed into an attribute).
// Extruding along the render normals tears at hard/seam edges (sphere and
// capsule geometries duplicate vertices along the UV seam and at pole caps),
// so we merge by vertex position and accumulate face normals weighted by the
// corner angle — the standard artifact-free hull.

import * as THREE from 'three'
import { hexToLinear } from './palette'

export const OUTLINE_NAME = 'toon-outline'
export const SMOOTHED_NORMAL_ATTRIBUTE = 'aSmoothedNormal'

export interface OutlineOptions {
  /** Shell extrusion in meters (~2.5 mm default at character scale). */
  thickness?: number
  /** Uniform dark-warm outline color. */
  color?: string
}

export const DEFAULT_OUTLINE_THICKNESS = 0.0025
export const DEFAULT_OUTLINE_COLOR = '#3a2e2a'

/**
 * Angle-weighted smoothed normals, merged across position-duplicate vertices
 * (UV seams, caps). Returns a BufferAttribute with one unit normal per
 * vertex of the input geometry (same vertex count — the geometry itself is
 * not re-indexed).
 */
export function computeSmoothedNormals(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const vertexCount = position.count
  const index = geometry.getIndex()
  const triCount = index ? index.count / 3 : vertexCount / 3
  const vertexAt = (i: number) => (index ? index.getX(i) : i)

  // Merge duplicates by quantized position.
  const keyToGroup = new Map<string, number>()
  const groupOf = new Uint32Array(vertexCount)
  let groupCount = 0
  for (let i = 0; i < vertexCount; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
    let group = keyToGroup.get(key)
    if (group === undefined) {
      group = groupCount++
      keyToGroup.set(key, group)
    }
    groupOf[i] = group
  }

  const accum = new Float32Array(groupCount * 3)
  const pA = new THREE.Vector3()
  const pB = new THREE.Vector3()
  const pC = new THREE.Vector3()
  const edge1 = new THREE.Vector3()
  const edge2 = new THREE.Vector3()
  const faceNormal = new THREE.Vector3()

  for (let t = 0; t < triCount; t++) {
    const a = vertexAt(t * 3)
    const b = vertexAt(t * 3 + 1)
    const c = vertexAt(t * 3 + 2)
    pA.fromBufferAttribute(position, a)
    pB.fromBufferAttribute(position, b)
    pC.fromBufferAttribute(position, c)
    faceNormal.copy(pB).sub(pA).cross(edge1.copy(pC).sub(pA))
    if (faceNormal.lengthSq() === 0) continue
    faceNormal.normalize()

    const corners: Array<[number, THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
      [a, pA, pB, pC],
      [b, pB, pC, pA],
      [c, pC, pA, pB],
    ]
    for (const [vi, corner, next, prev] of corners) {
      edge1.copy(next).sub(corner)
      edge2.copy(prev).sub(corner)
      const angle = edge1.angleTo(edge2)
      const g = groupOf[vi] * 3
      accum[g] += faceNormal.x * angle
      accum[g + 1] += faceNormal.y * angle
      accum[g + 2] += faceNormal.z * angle
    }
  }

  const smoothed = new Float32Array(vertexCount * 3)
  const n = new THREE.Vector3()
  for (let i = 0; i < vertexCount; i++) {
    const g = groupOf[i] * 3
    n.set(accum[g], accum[g + 1], accum[g + 2])
    if (n.lengthSq() === 0) n.set(0, 1, 0)
    n.normalize()
    smoothed[i * 3] = n.x
    smoothed[i * 3 + 1] = n.y
    smoothed[i * 3 + 2] = n.z
  }
  return new THREE.BufferAttribute(smoothed, 3)
}

const OUTLINE_VERTEX = /* glsl */ `
attribute vec3 aSmoothedNormal;
uniform float uThickness;
void main() {
	vec3 transformed = position + aSmoothedNormal * uThickness;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
}
`

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
	gl_FragColor = vec4( uColor, 1.0 );
}
`

/**
 * Attach an inverted-hull outline shell as a child of `mesh` (inherits its
 * transforms). Idempotent per mesh — a second call replaces the shell.
 * Returns the shell mesh.
 */
export function addOutline(mesh: THREE.Mesh, opts: OutlineOptions = {}): THREE.Mesh {
  removeOutline(mesh)
  const geometry = mesh.geometry.clone()
  geometry.setAttribute(SMOOTHED_NORMAL_ATTRIBUTE, computeSmoothedNormals(geometry))

  const material = new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    uniforms: {
      uThickness: { value: opts.thickness ?? DEFAULT_OUTLINE_THICKNESS },
      uColor: { value: new THREE.Color().setRGB(...hexToLinear(opts.color ?? DEFAULT_OUTLINE_COLOR), THREE.LinearSRGBColorSpace) },
    },
    side: THREE.BackSide,
  })

  const shell = new THREE.Mesh(geometry, material)
  shell.name = OUTLINE_NAME
  shell.renderOrder = mesh.renderOrder - 1
  shell.castShadow = false
  shell.receiveShadow = false
  mesh.add(shell)
  return shell
}

export function getOutline(mesh: THREE.Mesh): THREE.Mesh | null {
  const child = mesh.children.find((c) => c.name === OUTLINE_NAME)
  return (child as THREE.Mesh) ?? null
}

export function removeOutline(mesh: THREE.Mesh): void {
  const shell = getOutline(mesh)
  if (!shell) return
  mesh.remove(shell)
  shell.geometry.dispose()
  ;(shell.material as THREE.Material).dispose()
}
