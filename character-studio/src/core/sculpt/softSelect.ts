// Soft-selection vertex picking (plan 009, step 3) — geodesic-aware, weld
// seam-safe, mirror-pairable. Pure three math, no React.
//
// Why not euclidean: at ear/body junctions euclidean radius is wrong —
// sculpting an ear tip must not drag skull vertices that are spatially near
// but far along the surface. We run Dijkstra (edge-length-weighted BFS) over
// the vertex adjacency graph instead.
//
// Why weld groups: authored GLBs duplicate vertices along UV seams and
// PRIMITIVE BOUNDARIES (the body ships as 4 primitives + 3 hide-region
// submeshes = separate BufferGeometries). Raw triangle adjacency would stop
// at every seam (weights diverge → cracks). So the topology is built over
// POSITION-WELDED groups spanning ALL targets of a weld space: seam
// duplicates always receive identical weights and identical deltas, and the
// graph crosses primitive/submesh boundaries like they aren't there.
//
// Everything here is cached once per (weld space × geometry set) — fixed
// topology is a hard rule (plan 000 §2.4), so the cache never invalidates.

import type { SculptTarget } from './deltaLayer'

/** Weld tolerance (m): seam duplicates are byte-identical in the authored
 * GLBs; 1e-4 absorbs float wiggle without merging real detail. */
export const WELD_TOLERANCE = 1e-4

/** Mirror-pairing tolerance (plan 009 step 4: position-hashed, 1e-4). */
export const MIRROR_TOLERANCE = 1e-4

export interface WeldSpaceTopology {
  targets: readonly SculptTarget[]
  /** Global vertex id = offsets[targetIndex] + localVertexIndex. */
  offsets: number[]
  vertexCount: number
  /** Per global vertex → weld group. */
  groupOf: Uint32Array
  groupCount: number
  /** Representative base position per group (3·groupCount, local space). */
  groupPosition: Float32Array
  /** Group → member global vertex ids (CSR). */
  memberStart: Uint32Array
  memberItems: Uint32Array
  /** Group adjacency with base edge lengths (CSR). */
  neighborStart: Uint32Array
  neighborGroup: Uint32Array
  neighborDist: Float32Array
  /** Lazily built mirror map (see mirrorGroup). */
  mirror: Int32Array | null
}

function quantKey(x: number, y: number, z: number, tolerance: number): string {
  return `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`
}

export function buildWeldSpaceTopology(targets: readonly SculptTarget[]): WeldSpaceTopology {
  const offsets: number[] = []
  let vertexCount = 0
  for (const target of targets) {
    offsets.push(vertexCount)
    vertexCount += target.layer.basePositions.length / 3
  }

  // --- weld by quantized base position (across ALL targets in the space) ---
  const groupOf = new Uint32Array(vertexCount)
  const keyToGroup = new Map<string, number>()
  const groupPositions: number[] = []
  let groupCount = 0
  targets.forEach((target, t) => {
    const base = target.layer.basePositions
    const offset = offsets[t]
    for (let v = 0; v < base.length / 3; v++) {
      const x = base[v * 3]
      const y = base[v * 3 + 1]
      const z = base[v * 3 + 2]
      const key = quantKey(x, y, z, WELD_TOLERANCE)
      let group = keyToGroup.get(key)
      if (group === undefined) {
        group = groupCount++
        keyToGroup.set(key, group)
        groupPositions.push(x, y, z)
      }
      groupOf[offset + v] = group
    }
  })
  const groupPosition = new Float32Array(groupPositions)

  // --- members CSR (counting sort) ---
  const memberStart = new Uint32Array(groupCount + 1)
  for (let i = 0; i < vertexCount; i++) memberStart[groupOf[i] + 1]++
  for (let g = 0; g < groupCount; g++) memberStart[g + 1] += memberStart[g]
  const memberItems = new Uint32Array(vertexCount)
  const cursor = memberStart.slice(0, groupCount)
  for (let i = 0; i < vertexCount; i++) {
    memberItems[cursor[groupOf[i]]++] = i
  }

  // --- group adjacency from triangle edges, deduped, base edge lengths ---
  const edgeDist = new Map<number, number>()
  const addEdge = (ga: number, gb: number) => {
    if (ga === gb) return
    const lo = Math.min(ga, gb)
    const hi = Math.max(ga, gb)
    const key = lo * groupCount + hi
    if (edgeDist.has(key)) return
    const dx = groupPosition[lo * 3] - groupPosition[hi * 3]
    const dy = groupPosition[lo * 3 + 1] - groupPosition[hi * 3 + 1]
    const dz = groupPosition[lo * 3 + 2] - groupPosition[hi * 3 + 2]
    edgeDist.set(key, Math.sqrt(dx * dx + dy * dy + dz * dz))
  }
  targets.forEach((target, t) => {
    const offset = offsets[t]
    const index = target.layer.geometry.getIndex()
    const triVerts = index ? index.count : target.layer.basePositions.length / 3
    const vertexAt = (i: number) => (index ? index.getX(i) : i)
    for (let i = 0; i < triVerts; i += 3) {
      const a = groupOf[offset + vertexAt(i)]
      const b = groupOf[offset + vertexAt(i + 1)]
      const c = groupOf[offset + vertexAt(i + 2)]
      addEdge(a, b)
      addEdge(b, c)
      addEdge(c, a)
    }
  })

  const degree = new Uint32Array(groupCount)
  for (const key of edgeDist.keys()) {
    const hi = key % groupCount
    const lo = (key - hi) / groupCount
    degree[lo]++
    degree[hi]++
  }
  const neighborStart = new Uint32Array(groupCount + 1)
  for (let g = 0; g < groupCount; g++) neighborStart[g + 1] = neighborStart[g] + degree[g]
  const neighborGroup = new Uint32Array(neighborStart[groupCount])
  const neighborDist = new Float32Array(neighborStart[groupCount])
  const nCursor = neighborStart.slice(0, groupCount)
  for (const [key, dist] of edgeDist) {
    const hi = key % groupCount
    const lo = (key - hi) / groupCount
    neighborGroup[nCursor[lo]] = hi
    neighborDist[nCursor[lo]++] = dist
    neighborGroup[nCursor[hi]] = lo
    neighborDist[nCursor[hi]++] = dist
  }

  return {
    targets,
    offsets,
    vertexCount,
    groupOf,
    groupCount,
    groupPosition,
    memberStart,
    memberItems,
    neighborStart,
    neighborGroup,
    neighborDist,
    mirror: null,
  }
}

/** Weld group of one target's local vertex. */
export function groupForVertex(space: WeldSpaceTopology, targetIndex: number, vertexIndex: number): number {
  return space.groupOf[space.offsets[targetIndex] + vertexIndex]
}

/** Nearest weld group to a local-space point (seed for point-based picks). */
export function nearestGroup(space: WeldSpaceTopology, x: number, y: number, z: number): number {
  const { groupPosition, groupCount } = space
  let best = 0
  let bestD = Infinity
  for (let g = 0; g < groupCount; g++) {
    const dx = groupPosition[g * 3] - x
    const dy = groupPosition[g * 3 + 1] - y
    const dz = groupPosition[g * 3 + 2] - z
    const d = dx * dx + dy * dy + dz * dz
    if (d < bestD) {
      bestD = d
      best = g
    }
  }
  return best
}

/**
 * Mirror partner of a group across the character's X symmetry plane
 * (position-hashed at MIRROR_TOLERANCE, computed once per topology, lazy).
 * Returns -1 when the mesh has no counterpart within tolerance.
 */
export function mirrorGroup(space: WeldSpaceTopology, group: number): number {
  if (!space.mirror) {
    const mirror = new Int32Array(space.groupCount).fill(-1)
    const hash = new Map<string, number>()
    const { groupPosition, groupCount } = space
    for (let g = 0; g < groupCount; g++) {
      hash.set(quantKey(groupPosition[g * 3], groupPosition[g * 3 + 1], groupPosition[g * 3 + 2], MIRROR_TOLERANCE), g)
    }
    for (let g = 0; g < groupCount; g++) {
      const m = hash.get(
        quantKey(-groupPosition[g * 3], groupPosition[g * 3 + 1], groupPosition[g * 3 + 2], MIRROR_TOLERANCE),
      )
      mirror[g] = m === undefined ? -1 : m
    }
    space.mirror = mirror
  }
  return space.mirror[group]
}

// --- picking -------------------------------------------------------------------

/** `smoothstep(1 - d/r)` falloff — 1 at the brush center, 0 at the rim. */
export function smoothstepFalloff(dist: number, radius: number): number {
  if (radius <= 0) return 0
  const s = Math.min(Math.max(1 - dist / radius, 0), 1)
  return s * s * (3 - 2 * s)
}

export type FalloffFn = (dist: number, radius: number) => number

export interface Seed {
  group: number
  /** Initial distance offset (e.g. hit-point → seed-vertex distance). */
  dist: number
}

export interface GroupPick {
  /** Touched weld groups (geodesic distance < radius). */
  groups: Uint32Array
  dists: Float32Array
  weights: Float32Array
}

/** Tiny binary min-heap for Dijkstra (indices into a dist array). */
class MinHeap {
  private items: number[] = []
  private prio: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, priority: number): void {
    const { items, prio } = this
    let i = items.length
    items.push(item)
    prio.push(priority)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (prio[parent] <= prio[i]) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      ;[prio[parent], prio[i]] = [prio[i], prio[parent]]
      i = parent
    }
  }

  pop(): number {
    const { items, prio } = this
    const top = items[0]
    const lastItem = items.pop() as number
    const lastPrio = prio.pop() as number
    if (items.length > 0) {
      items[0] = lastItem
      prio[0] = lastPrio
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let smallest = i
        if (l < items.length && prio[l] < prio[smallest]) smallest = l
        if (r < items.length && prio[r] < prio[smallest]) smallest = r
        if (smallest === i) break
        ;[items[smallest], items[i]] = [items[i], items[smallest]]
        ;[prio[smallest], prio[i]] = [prio[i], prio[smallest]]
        i = smallest
      }
    }
    return top
  }
}

/**
 * Geodesic soft-selection: Dijkstra over the weld-group graph from the seed
 * groups, bounded by `radius` (local-space meters), weighted by `falloff`.
 */
export function pickBrushGroups(
  space: WeldSpaceTopology,
  seeds: readonly Seed[],
  radius: number,
  falloff: FalloffFn = smoothstepFalloff,
): GroupPick {
  const dist = new Map<number, number>()
  const heap = new MinHeap()
  for (const seed of seeds) {
    const existing = dist.get(seed.group)
    if (existing === undefined || seed.dist < existing) {
      dist.set(seed.group, seed.dist)
      heap.push(seed.group, seed.dist)
    }
  }
  const settled = new Set<number>()
  while (heap.size > 0) {
    const g = heap.pop()
    if (settled.has(g)) continue
    settled.add(g)
    const d = dist.get(g) as number
    const end = space.neighborStart[g + 1]
    for (let e = space.neighborStart[g]; e < end; e++) {
      const next = space.neighborGroup[e]
      const nd = d + space.neighborDist[e]
      if (nd >= radius) continue
      const existing = dist.get(next)
      if (existing === undefined || nd < existing) {
        dist.set(next, nd)
        heap.push(next, nd)
      }
    }
  }

  const count = dist.size
  const groups = new Uint32Array(count)
  const dists = new Float32Array(count)
  const weights = new Float32Array(count)
  let i = 0
  for (const [g, d] of dist) {
    groups[i] = g
    dists[i] = d
    weights[i] = falloff(d, radius)
    i++
  }
  return { groups, dists, weights }
}

export interface TargetPick {
  targetIndex: number
  /** Local vertex indices of this target inside the brush. */
  indices: Uint32Array
  /** Per-index soft-selection weight (seam duplicates share weights). */
  weights: Float32Array
}

/** Expand a group pick to per-target vertex index/weight lists. */
export function expandPickToTargets(space: WeldSpaceTopology, pick: GroupPick): TargetPick[] {
  const perTarget: Array<{ indices: number[]; weights: number[] }> = space.targets.map(() => ({
    indices: [],
    weights: [],
  }))
  const { offsets } = space
  for (let i = 0; i < pick.groups.length; i++) {
    const g = pick.groups[i]
    const w = pick.weights[i]
    const end = space.memberStart[g + 1]
    for (let m = space.memberStart[g]; m < end; m++) {
      const globalVertex = space.memberItems[m]
      // Find owning target (offsets is tiny — linear scan).
      let t = offsets.length - 1
      while (offsets[t] > globalVertex) t--
      perTarget[t].indices.push(globalVertex - offsets[t])
      perTarget[t].weights.push(w)
    }
  }
  const out: TargetPick[] = []
  perTarget.forEach((entry, targetIndex) => {
    if (entry.indices.length === 0) return
    out.push({
      targetIndex,
      indices: Uint32Array.from(entry.indices),
      weights: Float32Array.from(entry.weights),
    })
  })
  return out
}

/**
 * Convenience pick from a local-space point (plan 009 step 3 API): seeds at
 * the nearest weld group with the point→group distance as the initial
 * offset, Dijkstra out to `radius`, smoothstep falloff.
 */
export function pickBrushVertices(
  space: WeldSpaceTopology,
  point: { x: number; y: number; z: number },
  radius: number,
  falloff: FalloffFn = smoothstepFalloff,
): { pick: GroupPick; targets: TargetPick[] } {
  const seed = nearestGroup(space, point.x, point.y, point.z)
  const dx = space.groupPosition[seed * 3] - point.x
  const dy = space.groupPosition[seed * 3 + 1] - point.y
  const dz = space.groupPosition[seed * 3 + 2] - point.z
  const pick = pickBrushGroups(space, [{ group: seed, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) }], radius, falloff)
  return { pick, targets: expandPickToTargets(space, pick) }
}

/**
 * Neighbor centroids of the picked groups, from CURRENT positions (base +
 * delta) — the Laplacian target the smooth brush relaxes toward.
 */
export function computeNeighborCentroids(space: WeldSpaceTopology, groups: Uint32Array): Float32Array {
  const out = new Float32Array(groups.length * 3)
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const end = space.neighborStart[g + 1]
    let n = 0
    let cx = 0
    let cy = 0
    let cz = 0
    for (let e = space.neighborStart[g]; e < end; e++) {
      const other = space.neighborGroup[e]
      cx += currentGroupX(space, other, 0)
      cy += currentGroupX(space, other, 1)
      cz += currentGroupX(space, other, 2)
      n++
    }
    if (n === 0) {
      out[i * 3] = currentGroupX(space, g, 0)
      out[i * 3 + 1] = currentGroupX(space, g, 1)
      out[i * 3 + 2] = currentGroupX(space, g, 2)
    } else {
      out[i * 3] = cx / n
      out[i * 3 + 1] = cy / n
      out[i * 3 + 2] = cz / n
    }
  }
  return out
}

/** Current (base+delta) local position component of a group's first member. */
export function currentGroupX(space: WeldSpaceTopology, group: number, component: 0 | 1 | 2): number {
  const globalVertex = space.memberItems[space.memberStart[group]]
  let t = space.offsets.length - 1
  while (space.offsets[t] > globalVertex) t--
  const v = globalVertex - space.offsets[t]
  const layer = space.targets[t].layer
  return layer.basePositions[v * 3 + component] + layer.delta[v * 3 + component]
}

/**
 * Recompute render normals for EVERY target of a weld space from current
 * positions — angle-weighted face normals accumulated per WELD GROUP across
 * all geometries, so shading never splits at UV seams or submesh/primitive
 * boundaries (the per-geometry variant in deltaLayer.ts cannot see across
 * geometries). Uses the cached topology: no hashing, no allocation beyond
 * one accumulator — fast enough to run throttled during a drag. Updates the
 * `normal` attribute and, where present, the plan-005 `aSmoothedNormal`
 * outline attribute.
 */
export function recomputeWeldedNormals(space: WeldSpaceTopology): void {
  const accum = new Float32Array(space.groupCount * 3)

  for (let t = 0; t < space.targets.length; t++) {
    const target = space.targets[t]
    const offset = space.offsets[t]
    const position = target.layer.geometry.getAttribute('position')
    const index = target.layer.geometry.getIndex()
    const triVerts = index ? index.count : position.count
    const vertexAt = (i: number) => (index ? index.getX(i) : i)

    for (let i = 0; i < triVerts; i += 3) {
      const a = vertexAt(i)
      const b = vertexAt(i + 1)
      const c = vertexAt(i + 2)
      const ax = position.getX(a)
      const ay = position.getY(a)
      const az = position.getZ(a)
      const bx = position.getX(b)
      const by = position.getY(b)
      const bz = position.getZ(b)
      const cx = position.getX(c)
      const cy = position.getY(c)
      const cz = position.getZ(c)
      // face normal = (b-a) × (c-a)
      const abx = bx - ax
      const aby = by - ay
      const abz = bz - az
      const acx = cx - ax
      const acy = cy - ay
      const acz = cz - az
      let nx = aby * acz - abz * acy
      let ny = abz * acx - abx * acz
      let nz = abx * acy - aby * acx
      const len = Math.hypot(nx, ny, nz)
      if (len === 0) continue
      nx /= len
      ny /= len
      nz /= len

      // corner angles (angle-weighted accumulation, artifact-free at poles)
      const corner = (
        ox: number,
        oy: number,
        oz: number,
        px: number,
        py: number,
        pz: number,
        qx: number,
        qy: number,
        qz: number,
      ) => {
        const ux = px - ox
        const uy = py - oy
        const uz = pz - oz
        const vx = qx - ox
        const vy = qy - oy
        const vz = qz - oz
        const dot = ux * vx + uy * vy + uz * vz
        const lu = Math.hypot(ux, uy, uz)
        const lv = Math.hypot(vx, vy, vz)
        if (lu === 0 || lv === 0) return 0
        return Math.acos(Math.min(Math.max(dot / (lu * lv), -1), 1))
      }
      const wa = corner(ax, ay, az, bx, by, bz, cx, cy, cz)
      const wb = corner(bx, by, bz, cx, cy, cz, ax, ay, az)
      const wc = corner(cx, cy, cz, ax, ay, az, bx, by, bz)

      const ga = space.groupOf[offset + a] * 3
      accum[ga] += nx * wa
      accum[ga + 1] += ny * wa
      accum[ga + 2] += nz * wa
      const gb = space.groupOf[offset + b] * 3
      accum[gb] += nx * wb
      accum[gb + 1] += ny * wb
      accum[gb + 2] += nz * wb
      const gc = space.groupOf[offset + c] * 3
      accum[gc] += nx * wc
      accum[gc + 1] += ny * wc
      accum[gc + 2] += nz * wc
    }
  }

  for (let t = 0; t < space.targets.length; t++) {
    const target = space.targets[t]
    const offset = space.offsets[t]
    const geometry = target.layer.geometry
    const normal = geometry.getAttribute('normal') as { array: Float32Array; needsUpdate: boolean } | undefined
    if (!normal) continue
    const hull = geometry.getAttribute('aSmoothedNormal') as
      | { array: Float32Array; needsUpdate: boolean }
      | undefined
    const out = normal.array
    const count = target.layer.basePositions.length / 3
    for (let v = 0; v < count; v++) {
      const g = space.groupOf[offset + v] * 3
      let nx = accum[g]
      let ny = accum[g + 1]
      let nz = accum[g + 2]
      const len = Math.hypot(nx, ny, nz)
      if (len === 0) {
        nx = 0
        ny = 1
        nz = 0
      } else {
        nx /= len
        ny /= len
        nz /= len
      }
      out[v * 3] = nx
      out[v * 3 + 1] = ny
      out[v * 3 + 2] = nz
      if (hull) {
        hull.array[v * 3] = nx
        hull.array[v * 3 + 1] = ny
        hull.array[v * 3 + 2] = nz
      }
    }
    normal.needsUpdate = true
    if (hull) hull.needsUpdate = true
  }
}

/** Current local positions (3·k) for a list of groups. */
export function currentGroupPositions(space: WeldSpaceTopology, groups: Uint32Array): Float32Array {
  const out = new Float32Array(groups.length * 3)
  for (let i = 0; i < groups.length; i++) {
    out[i * 3] = currentGroupX(space, groups[i], 0)
    out[i * 3 + 1] = currentGroupX(space, groups[i], 1)
    out[i * 3 + 2] = currentGroupX(space, groups[i], 2)
  }
  return out
}
