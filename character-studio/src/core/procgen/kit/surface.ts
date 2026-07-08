// Shared surface representation + mesh assembly for the procedural kit
// (plan 013). A `SurfacePiece` is one sphere-topology blob (like bodies.py's
// `Shell`): world-space verts, triangles, per-vertex UVs / channels / bone
// weights, param grid, and named OPEN boundary loops exposed for stitching.
//
// The `MeshBuilder` concatenates pieces into ONE indexed buffer and welds them
// by BRIDGING boundary loops: each shell keeps its own verts, and a bridge
// adds a triangle strip between two equal-length loops. A loop edge that was a
// boundary (shared by 1 shell triangle) gains a 2nd triangle from the bridge,
// so the result is a closed 2-manifold by construction (no interior faces, no
// overlapping-shell z-fighting — the wave-1 plan-003 regression this replaces).

export type Vec3 = readonly [number, number, number]

export const v = {
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1e-9
    return [a[0] / l, a[1] / l, a[2] / l]
  },
}

/** Hermite step; supports reversed edges (e1 < e0 → decreasing). meshkit.py. */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 < e0) return 1.0 - smoothstep(e1, e0, x)
  const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-9), 0.0), 1.0)
  return t * t * (3.0 - 2.0 * t)
}

export interface SurfacePiece {
  name: string
  /** Flat world-space positions, length 3·n. */
  pos: number[]
  /** Flat UVs, length 2·n. */
  uv: number[]
  /** Triangle indices (local to this piece), length 3·ntri. */
  tris: number[]
  /** Per-vertex azimuth u01 / polar v01 param grid, length 2·n. */
  params: number[]
  /** Named open boundary loops → ordered local vertex indices. */
  loops: Record<string, number[]>
  /** bone name → per-vertex weight (length n); normalized at build. */
  weights: Map<string, number[]>
  /** Per-vertex palette channels R/G/B/A, length 4·n. */
  channels: number[]
}

export function vertexCount(p: SurfacePiece): number {
  return p.pos.length / 3
}

/** Set a palette channel (clamped) for every vertex from a per-vertex fn. */
export function setChannel(p: SurfacePiece, idx: number, fn: (i: number) => number): void {
  const n = vertexCount(p)
  for (let i = 0; i < n; i++) p.channels[i * 4 + idx] = Math.min(Math.max(fn(i), 0), 1)
}

export interface BuiltMesh {
  positions: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  channels: Float32Array // n×4
  /** bone name → per-vertex weight over the whole mesh. */
  weights: Map<string, Float32Array>
  /** piece name → [startVertex, endVertex) range in the merged buffer. */
  ranges: Record<string, [number, number]>
  vertexCount: number
}

export class MeshBuilder {
  private pos: number[] = []
  private uv: number[] = []
  private idx: number[] = []
  private ch: number[] = []
  private wt = new Map<string, number[]>()
  private ranges: Record<string, [number, number]> = {}
  /** global vertex index of each piece's local loops. */
  readonly loopIndex: Record<string, Record<string, number[]>> = {}

  get count(): number {
    return this.pos.length / 3
  }

  /** World position of a global vertex index (for junction placement). */
  positionAt(gi: number): Vec3 {
    return [this.pos[gi * 3], this.pos[gi * 3 + 1], this.pos[gi * 3 + 2]]
  }

  add(piece: SurfacePiece): number {
    const base = this.count
    const n = vertexCount(piece)
    for (let i = 0; i < piece.pos.length; i++) this.pos.push(piece.pos[i])
    for (let i = 0; i < piece.uv.length; i++) this.uv.push(piece.uv[i])
    for (let i = 0; i < piece.channels.length; i++) this.ch.push(piece.channels[i])
    for (const t of piece.tris) this.idx.push(t + base)
    // pad every known bone track to `base`, then append this piece's weights.
    const bones = new Set<string>([...this.wt.keys(), ...piece.weights.keys()])
    for (const bone of bones) {
      let track = this.wt.get(bone)
      if (!track) {
        track = new Array(base).fill(0)
        this.wt.set(bone, track)
      }
      while (track.length < base) track.push(0)
      const src = piece.weights.get(bone)
      for (let i = 0; i < n; i++) track.push(src ? (src[i] ?? 0) : 0)
    }
    this.ranges[piece.name] = [base, base + n]
    this.loopIndex[piece.name] = {}
    for (const [key, loop] of Object.entries(piece.loops)) {
      this.loopIndex[piece.name][key] = loop.map((li) => li + base)
    }
    return base
  }

  /** Bridge two equal-length global loops with a triangle strip (manifold). */
  bridge(loopA: number[], loopB: number[]): void {
    if (loopA.length !== loopB.length) {
      throw new Error(`stitch: loop length mismatch ${loopA.length} vs ${loopB.length}`)
    }
    const n = loopA.length
    if (n < 3) throw new Error('stitch: degenerate loop')
    const b = alignLoop(this.pos, loopA, loopB)
    // Emit the strip with a provisional winding, then flip per-bridge if the
    // average face normal points toward (not away from) the junction centre.
    const start = this.idx.length
    for (let i = 0; i < n; i++) {
      const a0 = loopA[i]
      const a1 = loopA[(i + 1) % n]
      const b0 = b[i]
      const b1 = b[(i + 1) % n]
      this.idx.push(a0, b0, b1, a0, b1, a1)
    }
    this.orientRange(start, this.idx.length, loopA, loopB)
  }

  private orientRange(start: number, end: number, loopA: number[], loopB: number[]): void {
    // Junction centre: mean of both loops. Outward = triangle centroid − centre.
    const c = [0, 0, 0]
    const all = [...loopA, ...loopB]
    for (const gi of all) {
      c[0] += this.pos[gi * 3]
      c[1] += this.pos[gi * 3 + 1]
      c[2] += this.pos[gi * 3 + 2]
    }
    c[0] /= all.length
    c[1] /= all.length
    c[2] /= all.length
    let vote = 0
    for (let t = start; t < end; t += 3) {
      const ia = this.idx[t]
      const ib = this.idx[t + 1]
      const ic = this.idx[t + 2]
      const pa: Vec3 = [this.pos[ia * 3], this.pos[ia * 3 + 1], this.pos[ia * 3 + 2]]
      const pb: Vec3 = [this.pos[ib * 3], this.pos[ib * 3 + 1], this.pos[ib * 3 + 2]]
      const pc: Vec3 = [this.pos[ic * 3], this.pos[ic * 3 + 1], this.pos[ic * 3 + 2]]
      const nrm = v.cross(v.sub(pb, pa), v.sub(pc, pa))
      const mid: Vec3 = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3]
      const outward = v.sub(mid, c as unknown as Vec3)
      vote += Math.sign(v.dot(nrm, outward))
    }
    if (vote < 0) {
      for (let t = start; t < end; t += 3) {
        const tmp = this.idx[t + 1]
        this.idx[t + 1] = this.idx[t + 2]
        this.idx[t + 2] = tmp
      }
    }
  }

  build(): BuiltMesh {
    const n = this.count
    const weights = new Map<string, Float32Array>()
    for (const [bone, track] of this.wt) {
      while (track.length < n) track.push(0)
      weights.set(bone, Float32Array.from(track))
    }
    // Enforce one consistent OUTWARD winding across the whole welded mesh
    // (per-bridge orientRange only gets each strip self-consistent, not agreeing
    // with the shell it joins). See makeConsistentWinding.
    makeConsistentWinding(this.pos, this.idx)
    return {
      positions: Float32Array.from(this.pos),
      uvs: Float32Array.from(this.uv),
      indices: Uint32Array.from(this.idx),
      channels: Float32Array.from(this.ch),
      weights,
      ranges: this.ranges,
      vertexCount: n,
    }
  }
}

/**
 * Flip triangle windings so the closed manifold is one consistently OUTWARD
 * orientation. `computeVertexNormals` sums incident face normals; where a bridge
 * strip is wound opposite the shell it joins, the shared junction-ring vertices
 * get cancelled normals — a dark, faceted crease at every neck/shoulder/hip
 * seam (the plan-013 visual-parity "ring at the neck" + "patchy joints"). A BFS
 * over face adjacency forces each interior edge to be traversed in opposite
 * directions by its two faces; a signed-volume check flips the whole mesh if it
 * settled inward. Index-only (positions/UVs/weights/ranges untouched), so the
 * manifold audit and region split are unaffected. Assumes a clean closed
 * 2-manifold (every interior edge shared by exactly 2 faces — the kit
 * guarantees this by construction).
 */
export function makeConsistentWinding(pos: number[], idx: number[]): void {
  const faceCount = idx.length / 3
  if (faceCount === 0) return
  const ekey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`)
  // undirected edge -> incident face ids
  const edgeFaces = new Map<string, number[]>()
  for (let f = 0; f < faceCount; f++) {
    const a = idx[f * 3]
    const b = idx[f * 3 + 1]
    const c = idx[f * 3 + 2]
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = ekey(i, j)
      const arr = edgeFaces.get(k)
      if (arr) arr.push(f)
      else edgeFaces.set(k, [f])
    }
  }
  // does face f traverse the directed edge i->j?
  const hasDirected = (f: number, i: number, j: number): boolean => {
    const a = idx[f * 3]
    const b = idx[f * 3 + 1]
    const c = idx[f * 3 + 2]
    return (a === i && b === j) || (b === i && c === j) || (c === i && a === j)
  }
  const flip = (f: number): void => {
    const t = idx[f * 3 + 1]
    idx[f * 3 + 1] = idx[f * 3 + 2]
    idx[f * 3 + 2] = t
  }
  const visited = new Uint8Array(faceCount)
  const stack: number[] = []
  for (let seed = 0; seed < faceCount; seed++) {
    if (visited[seed]) continue
    visited[seed] = 1
    stack.push(seed)
    while (stack.length > 0) {
      const f = stack.pop() as number
      const a = idx[f * 3]
      const b = idx[f * 3 + 1]
      const c = idx[f * 3 + 2]
      for (const [i, j] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const nbrs = edgeFaces.get(ekey(i, j))
        if (!nbrs) continue
        for (const g of nbrs) {
          if (g === f || visited[g]) continue
          // consistent iff g traverses this shared edge in the OPPOSITE
          // direction (j->i). Same direction (i->j) → g is flipped relative
          // to f, so flip it.
          if (hasDirected(g, i, j)) flip(g)
          visited[g] = 1
          stack.push(g)
        }
      }
    }
  }
  // Signed volume (divergence theorem, origin-agnostic for a closed surface):
  // positive ⇒ outward-wound. Flip everything if it settled inward.
  let vol6 = 0
  for (let f = 0; f < faceCount; f++) {
    const a = idx[f * 3]
    const b = idx[f * 3 + 1]
    const c = idx[f * 3 + 2]
    const ax = pos[a * 3]
    const ay = pos[a * 3 + 1]
    const az = pos[a * 3 + 2]
    const bx = pos[b * 3]
    const by = pos[b * 3 + 1]
    const bz = pos[b * 3 + 2]
    const cx = pos[c * 3]
    const cy = pos[c * 3 + 1]
    const cz = pos[c * 3 + 2]
    vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  if (vol6 < 0) for (let f = 0; f < faceCount; f++) flip(f)
}

/**
 * Rotate + (optionally) reverse loopB so its i-th vertex best corresponds to
 * loopA's i-th vertex — minimizes twist and picks the winding-compatible
 * traversal direction. Returns the reordered loopB.
 */
function alignLoop(pos: number[], loopA: number[], loopB: number[]): number[] {
  const n = loopA.length
  const p = (gi: number): Vec3 => [pos[gi * 3], pos[gi * 3 + 1], pos[gi * 3 + 2]]
  const a0 = p(loopA[0])
  // best rotation offset for loopB toward a0
  let best = 0
  let bestD = Infinity
  for (let k = 0; k < n; k++) {
    const d = distSq(a0, p(loopB[k]))
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  const fwd: number[] = []
  const rev: number[] = []
  for (let i = 0; i < n; i++) {
    fwd.push(loopB[(best + i) % n])
    rev.push(loopB[(best - i + n * 2) % n])
  }
  // pick the direction with the smaller summed correspondence distance
  let sf = 0
  let sr = 0
  for (let i = 0; i < n; i++) {
    sf += distSq(p(loopA[i]), p(fwd[i]))
    sr += distSq(p(loopA[i]), p(rev[i]))
  }
  return sf <= sr ? fwd : rev
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}
