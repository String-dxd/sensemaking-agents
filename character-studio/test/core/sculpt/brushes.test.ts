import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  buildWeldSpaceTopology,
  computeNeighborCentroids,
  currentGroupPositions,
  expandPickToTargets,
  getDeltaLayer,
  grabDisplacements,
  inflateDisplacements,
  mirrorGroup,
  nearestGroup,
  pickBrushVertices,
  pinchDisplacements,
  type SculptTarget,
  smoothDisplacements,
  smoothstepFalloff,
  type WeldSpaceTopology,
} from '../../../src/core/sculpt'

let nextId = 0
function asTarget(geometry: THREE.BufferGeometry, weldSpace = 'test'): SculptTarget {
  nextId++
  return {
    assetId: `asset-${nextId}`,
    meshName: `mesh-${nextId}`,
    meshVersion: 1,
    mesh: new THREE.Mesh(geometry),
    layer: getDeltaLayer(geometry),
    weldSpace,
    localToWorldScale: 1,
  }
}

/** Two unit spheres side by side in ONE geometry, surfaces ~0.1 apart —
 * spatially near, topologically unconnected. */
function twoSphereGeometry(): THREE.BufferGeometry {
  const a = new THREE.SphereGeometry(0.5, 12, 8)
  const b = new THREE.SphereGeometry(0.5, 12, 8)
  b.translate(1.1, 0, 0)
  const aPos = a.getAttribute('position') as THREE.BufferAttribute
  const bPos = b.getAttribute('position') as THREE.BufferAttribute
  const positions = new Float32Array((aPos.count + bPos.count) * 3)
  positions.set(aPos.array as Float32Array, 0)
  positions.set(bPos.array as Float32Array, aPos.count * 3)
  const aIdx = a.getIndex() as THREE.BufferAttribute
  const bIdx = b.getIndex() as THREE.BufferAttribute
  const index = new Uint32Array(aIdx.count + bIdx.count)
  for (let i = 0; i < aIdx.count; i++) index[i] = aIdx.getX(i)
  for (let i = 0; i < bIdx.count; i++) index[aIdx.count + i] = bIdx.getX(i) + aPos.count
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  return geometry
}

/** Indexed grid strip on the XZ plane: x ∈ [x0, x1], `nx`+1 columns. */
function gridGeometry(x0: number, x1: number, nx: number, nz = 4): THREE.BufferGeometry {
  const positions: number[] = []
  const index: number[] = []
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      positions.push(x0 + ((x1 - x0) * ix) / nx, 0, iz / nz)
    }
  }
  const col = nx + 1
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * col + ix
      index.push(a, a + 1, a + col, a + 1, a + col + 1, a + col)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(index)
  return geometry
}

function laplacianEnergy(space: WeldSpaceTopology, groups: Uint32Array): number {
  const positions = currentGroupPositions(space, groups)
  const centroids = computeNeighborCentroids(space, groups)
  let energy = 0
  for (let i = 0; i < groups.length; i++) {
    energy +=
      (positions[i * 3] - centroids[i * 3]) ** 2 +
      (positions[i * 3 + 1] - centroids[i * 3 + 1]) ** 2 +
      (positions[i * 3 + 2] - centroids[i * 3 + 2]) ** 2
  }
  return energy
}

describe('soft selection (geodesic weld-group picking)', () => {
  it('falloff is smoothstep: 1 at center, 0 at rim, monotonically decreasing', () => {
    expect(smoothstepFalloff(0, 1)).toBe(1)
    expect(smoothstepFalloff(1, 1)).toBe(0)
    let prev = 1
    for (let d = 0.05; d <= 1; d += 0.05) {
      const w = smoothstepFalloff(d, 1)
      expect(w).toBeLessThanOrEqual(prev)
      expect(w).toBeGreaterThanOrEqual(0)
      prev = w
    }
  })

  it('weights decrease monotonically with geodesic distance in a real pick', () => {
    const target = asTarget(new THREE.SphereGeometry(0.5, 16, 12))
    const space = buildWeldSpaceTopology([target])
    const { pick } = pickBrushVertices(space, { x: 0, y: 0.5, z: 0 }, 0.4)
    expect(pick.groups.length).toBeGreaterThan(4)
    const byDist = Array.from(pick.groups.keys()).sort((a, b) => pick.dists[a] - pick.dists[b])
    for (let i = 1; i < byDist.length; i++) {
      expect(pick.weights[byDist[i]]).toBeLessThanOrEqual(pick.weights[byDist[i - 1]] + 1e-6)
    }
  })

  it('geodesic picking excludes spatially-near but unconnected vertices (two-sphere)', () => {
    const geometry = twoSphereGeometry()
    const target = asTarget(geometry)
    const space = buildWeldSpaceTopology([target])
    // Seed on sphere A's +X pole (0.5,0,0); sphere B's -X pole is 0.1 away
    // euclidean — far beyond any surface path (the spheres are unconnected).
    const { pick, targets } = pickBrushVertices(space, { x: 0.5, y: 0, z: 0 }, 0.45)
    expect(pick.groups.length).toBeGreaterThan(0)
    const position = geometry.getAttribute('position')
    for (const entry of targets) {
      for (const v of entry.indices) {
        // Every picked vertex belongs to sphere A (x ≤ 0.5); sphere B starts at x ≥ 0.6.
        expect(position.getX(v)).toBeLessThanOrEqual(0.5 + 1e-5)
      }
    }
  })

  it('welds seams ACROSS targets: BFS crosses a submesh boundary and duplicates share weights', () => {
    // Two grid halves meeting at x=0 — separate geometries (like the body's
    // hide-region submeshes), boundary vertices duplicated in both.
    const left = asTarget(gridGeometry(-1, 0, 8))
    const right = asTarget(gridGeometry(0, 1, 8))
    const space = buildWeldSpaceTopology([left, right])

    // Seed on the LEFT half near the boundary; radius reaches into the right half.
    const { targets } = pickBrushVertices(space, { x: -0.125, y: 0, z: 0.5 }, 0.5)
    const touchedTargets = targets.map((t) => t.targetIndex).sort()
    expect(touchedTargets).toEqual([0, 1]) // crossed the seam

    // Boundary duplicates (x=0) exist in both targets and must carry identical weights.
    const weightsAt = (entry: (typeof targets)[number], geometry: THREE.BufferGeometry) => {
      const position = geometry.getAttribute('position')
      const map = new Map<string, number>()
      entry.indices.forEach((v, i) => {
        if (Math.abs(position.getX(v)) < 1e-6) map.set(position.getZ(v).toFixed(5), entry.weights[i])
      })
      return map
    }
    const leftBoundary = weightsAt(targets[0], left.layer.geometry)
    const rightBoundary = weightsAt(targets[1], right.layer.geometry)
    expect(leftBoundary.size).toBeGreaterThan(0)
    expect(rightBoundary.size).toBe(leftBoundary.size)
    for (const [key, w] of leftBoundary) {
      expect(rightBoundary.get(key)).toBeCloseTo(w, 6)
    }
  })

  it('mirror pairing finds X-symmetric partners once, within tolerance', () => {
    const target = asTarget(new THREE.SphereGeometry(0.5, 16, 12))
    const space = buildWeldSpaceTopology([target])
    const g = nearestGroup(space, 0.35, 0.35, 0)
    const m = mirrorGroup(space, g)
    expect(m).toBeGreaterThanOrEqual(0)
    expect(space.groupPosition[m * 3]).toBeCloseTo(-space.groupPosition[g * 3], 4)
    expect(space.groupPosition[m * 3 + 1]).toBeCloseTo(space.groupPosition[g * 3 + 1], 4)
    expect(space.groupPosition[m * 3 + 2]).toBeCloseTo(space.groupPosition[g * 3 + 2], 4)
    // A vertex ON the symmetry plane mirrors to itself.
    const onPlane = nearestGroup(space, 0, 0.5, 0)
    expect(mirrorGroup(space, onPlane)).toBe(onPlane)
  })
})

describe('brush kernels', () => {
  it('grab moves weight-1 points exactly by the drag vector', () => {
    const weights = Float32Array.from([1, 0.5, 0])
    const disp = grabDisplacements(weights, [0.2, -0.1, 0.05])
    expect([disp[0], disp[1], disp[2]]).toEqual([Float32Array.from([0.2])[0], Float32Array.from([-0.1])[0], Float32Array.from([0.05])[0]])
    expect(disp[3]).toBeCloseTo(0.1, 6)
    expect(disp[6]).toBe(0)
  })

  it('inflate pushes along the (normalized) normal by strength × weight', () => {
    const weights = Float32Array.from([1, 0.5])
    const normals = Float32Array.from([0, 2, 0, 3, 0, 0]) // non-unit on purpose
    const disp = inflateDisplacements(weights, normals, 0.04)
    expect(disp[1]).toBeCloseTo(0.04, 6)
    expect(disp[0]).toBeCloseTo(0, 6)
    expect(disp[3]).toBeCloseTo(0.02, 6)
  })

  it('pinch pulls tangentially toward the center (no normal component)', () => {
    const weights = Float32Array.from([1])
    const positions = Float32Array.from([1, 0, 0])
    const normals = Float32Array.from([0, 1, 0])
    const disp = pinchDisplacements(positions, normals, weights, [0, 0.5, 0], 0.5)
    // Pull toward (0,0.5,0) is (-1,0.5,0); removing the Y (normal) part → (-1,0,0)·0.5
    expect(disp[0]).toBeCloseTo(-0.5, 6)
    expect(disp[1]).toBeCloseTo(0, 6)
    expect(disp[2]).toBeCloseTo(0, 6)
  })

  it('smooth reduces Laplacian energy on a bumped surface', () => {
    const geometry = gridGeometry(-1, 1, 12, 12)
    const target = asTarget(geometry)
    const space = buildWeldSpaceTopology([target])

    // Raise a noisy bump in the middle.
    const { layer } = target
    for (let v = 0; v < layer.basePositions.length / 3; v++) {
      const x = layer.basePositions[v * 3]
      const z = layer.basePositions[v * 3 + 2]
      if (Math.abs(x) < 0.4 && Math.abs(z - 0.5) < 0.3) {
        layer.delta[v * 3 + 1] = 0.1 + 0.05 * Math.sin(v * 13.7)
      }
    }
    applyDelta(layer)

    const { pick } = pickBrushVertices(space, { x: 0, y: 0.1, z: 0.5 }, 0.8)
    const before = laplacianEnergy(space, pick.groups)
    expect(before).toBeGreaterThan(0)

    const positions = currentGroupPositions(space, pick.groups)
    const centroids = computeNeighborCentroids(space, pick.groups)
    const disp = smoothDisplacements(positions, centroids, pick.weights, 0.6)

    // Write the group displacements back through the member vertices.
    const targets = expandPickToTargets(space, pick)
    const groupIndexOf = new Map<number, number>()
    pick.groups.forEach((g, i) => groupIndexOf.set(g, i))
    for (const entry of targets) {
      const t = space.targets[entry.targetIndex]
      entry.indices.forEach((v) => {
        const g = space.groupOf[space.offsets[entry.targetIndex] + v]
        const gi = groupIndexOf.get(g) as number
        t.layer.delta[v * 3] += disp[gi * 3]
        t.layer.delta[v * 3 + 1] += disp[gi * 3 + 1]
        t.layer.delta[v * 3 + 2] += disp[gi * 3 + 2]
      })
      applyDelta(t.layer, entry.indices)
    }

    const after = laplacianEnergy(space, pick.groups)
    expect(after).toBeLessThan(before)
  })

  it('leaves untouched vertices bit-identical after a brush application', () => {
    const geometry = new THREE.SphereGeometry(0.5, 16, 12)
    const target = asTarget(geometry)
    const space = buildWeldSpaceTopology([target])
    const positionBefore = new Float32Array(geometry.getAttribute('position').array as Float32Array)

    const { pick, targets } = pickBrushVertices(space, { x: 0, y: 0.5, z: 0 }, 0.25)
    const groupIndexOf = new Map<number, number>()
    pick.groups.forEach((g, i) => groupIndexOf.set(g, i))
    const disp = grabDisplacements(pick.weights, [0, 0.08, 0])

    const touched = new Set<number>()
    for (const entry of targets) {
      entry.indices.forEach((v) => {
        touched.add(v)
        const g = space.groupOf[space.offsets[entry.targetIndex] + v]
        const gi = groupIndexOf.get(g) as number
        target.layer.delta[v * 3] += disp[gi * 3]
        target.layer.delta[v * 3 + 1] += disp[gi * 3 + 1]
        target.layer.delta[v * 3 + 2] += disp[gi * 3 + 2]
      })
      applyDelta(target.layer, entry.indices)
    }
    expect(touched.size).toBeGreaterThan(0)

    const positionAfter = geometry.getAttribute('position').array as Float32Array
    for (let v = 0; v < positionBefore.length / 3; v++) {
      if (touched.has(v)) continue
      expect(positionAfter[v * 3]).toBe(positionBefore[v * 3])
      expect(positionAfter[v * 3 + 1]).toBe(positionBefore[v * 3 + 1])
      expect(positionAfter[v * 3 + 2]).toBe(positionBefore[v * 3 + 2])
    }
    // And the touched ones did move.
    const seed = nearestGroup(space, 0, 0.5, 0)
    const seedVertex = space.memberItems[space.memberStart[seed]]
    expect(positionAfter[seedVertex * 3 + 1]).toBeGreaterThan(positionBefore[seedVertex * 3 + 1])
  })

  it('geodesic pick stays within budget on a body-sized mesh (STOP gate: < 8 ms)', () => {
    // ~2.5k-vertex sphere ≈ the biped body's weld-space size.
    const target = asTarget(new THREE.SphereGeometry(0.5, 64, 40))
    const space = buildWeldSpaceTopology([target]) // cache build excluded (once per geometry)
    const t0 = performance.now()
    let picked = 0
    for (let i = 0; i < 20; i++) {
      const { pick } = pickBrushVertices(space, { x: 0, y: 0.5, z: 0 }, 0.35)
      picked = pick.groups.length
    }
    const perPick = (performance.now() - t0) / 20
    expect(picked).toBeGreaterThan(50)
    expect(perPick).toBeLessThan(8)
  })
})
