import type { ShoreField } from './islandSpecCore/shoreField.ts'
import type { IslandSpec } from './islandSpecCore/terrainGrid.ts'

export interface LandCell {
  c: number
  r: number
  x: number
  z: number
  tier: number
}

export default class Island {
  /** The validated island spec (frozen fallback if the committed copy is bad). */
  spec: IslandSpec
  /** World Y of the water surface. */
  seaLevel: number
  /** Square world bounds: X and Z each span [-worldSize/2, worldSize/2]. */
  worldSize: number
  /** Cached 3×3 tent blur of the tier grid (computed once per construction). */
  _blurred: Float32Array
  /** Cached signed shore distance field (computed once per construction). */
  _shore: ShoreField

  heightAt(x: number, z: number): number
  normalAt(x: number, z: number): [number, number, number]
  shoreDistanceAt(x: number, z: number): number
  isWalkable(x: number, z: number): boolean
  isPlaceable(x: number, z: number, inset?: number): boolean
  landCells(): LandCell[]

  // ── TEMPORARY SHIMS (removed in U12; consumers migrate in U4/U5/U10) ──
  radius: number
  sandOuterRadius: number
  plateauTopY: number
  sandTopY: number
  cliffHeight: number
  chunkSize: number
  noiseAmp: number
  noiseFreq: number
  detailAmp: number
  silhouetteAt(theta: number): number
  radiusAtTheta(theta: number, baseRadius?: number): number
  radiusAt(x: number, z: number, baseRadius?: number): number
  isOnPlateau(x: number, z: number): boolean
}
