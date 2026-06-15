import * as THREE from 'three'
import {
  baseHeightAt,
  distanceToPolygon,
  type IslandSpec,
  isInsidePolygon,
  reliefAt,
  sampleCoastline,
} from './islandSpec'

const SEAFLOOR = new THREE.Color('#3a6b86')
const SAND = new THREE.Color('#d9c89a')
const GRASS = new THREE.Color('#5a8f4e')
const ROCK = new THREE.Color('#8a8276')

/**
 * Per-vertex base data that depends only on the coastline + height profile
 * (the EXPENSIVE part: point-in-polygon + distance-to-coast). Cached so that
 * brush strokes — which change only the relief — can update the mesh cheaply
 * without recomputing the coastline queries.
 */
export interface BaseField {
  segments: number
  size: number
  n: number
  xs: Float32Array
  zs: Float32Array
  baseY: Float32Array
  inside: Uint8Array
  indices: number[]
}

export function buildBaseField(spec: IslandSpec, segments = 80): BaseField {
  const poly = sampleCoastline(spec.coastline)
  const size = spec.worldSize
  const half = size / 2
  const n = segments + 1
  const count = n * n
  const xs = new Float32Array(count)
  const zs = new Float32Array(count)
  const baseY = new Float32Array(count)
  const inside = new Uint8Array(count)
  const indices: number[] = []

  let i = 0
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + (ix / segments) * size
      const z = -half + (iz / segments) * size
      const ins = isInsidePolygon(poly, x, z)
      const d = distanceToPolygon(poly, x, z)
      xs[i] = x
      zs[i] = z
      inside[i] = ins ? 1 : 0
      baseY[i] = baseHeightAt(spec.heightProfile, ins, d)
      i++
    }
  }
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * n + ix
      const b = a + 1
      const c = a + n
      const dd = c + 1
      indices.push(a, c, b, b, c, dd)
    }
  }
  return { segments, size, n, xs, zs, baseY, inside, indices }
}

export function composeGeometry(field: BaseField, spec: IslandSpec): THREE.BufferGeometry {
  const count = field.n * field.n
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setIndex(field.indices)
  writeHeightsAndColors(geo, field, spec)
  return geo
}

/** Cheap in-place refresh of heights + colors from the current relief. */
export function updateGeometry(geo: THREE.BufferGeometry, field: BaseField, spec: IslandSpec): void {
  writeHeightsAndColors(geo, field, spec)
}

const tmp = new THREE.Color()

function writeHeightsAndColors(geo: THREE.BufferGeometry, field: BaseField, spec: IslandSpec): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const col = geo.getAttribute('color') as THREE.BufferAttribute
  const posArr = pos.array as Float32Array
  const colArr = col.array as Float32Array
  const { seaLevel, plateauHeight } = spec.heightProfile
  const count = field.n * field.n

  let p = 0
  for (let i = 0; i < count; i++) {
    const ins = field.inside[i] === 1
    const h = ins ? field.baseY[i] + reliefAt(spec, field.xs[i], field.zs[i]) : field.baseY[i]
    posArr[p] = field.xs[i]
    posArr[p + 1] = h
    posArr[p + 2] = field.zs[i]
    colorFor(tmp, h, seaLevel, plateauHeight, ins)
    colArr[p] = tmp.r
    colArr[p + 1] = tmp.g
    colArr[p + 2] = tmp.b
    p += 3
  }
  pos.needsUpdate = true
  col.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}

function colorFor(c: THREE.Color, h: number, seaLevel: number, plateau: number, inside: boolean): void {
  if (!inside || h <= seaLevel + 0.02) {
    c.copy(SEAFLOOR)
    return
  }
  const t = (h - seaLevel) / Math.max(0.001, plateau - seaLevel)
  // Thin sand band at the shoreline; grass across the whole interior (incl. the
  // plateau top); rock only where sculpting pushes terrain above the plateau.
  if (t < 0.14) c.copy(SAND)
  else if (t > 1.12) c.copy(ROCK)
  else c.copy(GRASS)
}
