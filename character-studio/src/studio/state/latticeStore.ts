// Lattice session state (plan 009, step 5). A lattice is a delta AUTHORING
// tool, not a persisted deformer: control-point drags preview live into the
// same sculpt delta layer, and "Apply" bakes the session as ONE undoable
// command. Cancel (or leaving sculpt mode / reassembly) restores the
// pre-session deltas.

import * as THREE from 'three'
import { create } from 'zustand'
import {
  applyDelta,
  bindToLattice,
  createLattice,
  createSculptCommand,
  evaluateLattice,
  type Lattice,
  type LatticeBinding,
  recomputeWeldedNormals,
  type SculptCommandEntry,
  type SculptTarget,
  vertexWorldMatrix,
} from '../../core/sculpt'
import { studioCommands } from './commandStore'
import { commitSculptToSpec, finalizeSculptVisuals, useSculptStore } from './sculptStore'

const _m4 = new THREE.Matrix4()
const _v3 = new THREE.Vector3()

interface LatticeBindingEntry {
  target: SculptTarget
  binding: LatticeBinding
  /** World positions of the bound vertices at session start (3·k). */
  p0: Float32Array
  /** Inverse LINEAR part of each bound vertex's world transform (9·k),
   * frozen at session start (motion is paused in sculpt mode). */
  invA: Float32Array
  /** Delta values at session start for the bound vertices (3·k). */
  beforeDelta: Float32Array
}

export interface LatticeSession {
  lattice: Lattice
  scope: string // 'character' | weld-space id (part id)
  entries: LatticeBindingEntry[]
  dragCount: number
}

export interface LatticeStoreState {
  session: LatticeSession | null
  selectedCp: number
  /** Bumped on every control-point change (cage re-render). */
  version: number
  create(scope: string): void
  selectCp(index: number): void
  dragCp(index: number, x: number, y: number, z: number): void
  apply(): void
  cancel(): void
}

let latticeCounter = 0

/** World position of one vertex under the current pose+morphs. */
function vertexWorld(target: SculptTarget, v: number, out: THREE.Vector3): THREE.Vector3 {
  target.mesh.getVertexPosition(v, out)
  return out.applyMatrix4(target.mesh.matrixWorld)
}

function buildEntries(targets: readonly SculptTarget[], lattice: Lattice): LatticeBindingEntry[] {
  const entries: LatticeBindingEntry[] = []
  for (const target of targets) {
    const count = target.layer.basePositions.length / 3
    const world = new Float32Array(count * 3)
    for (let v = 0; v < count; v++) {
      vertexWorld(target, v, _v3)
      world[v * 3] = _v3.x
      world[v * 3 + 1] = _v3.y
      world[v * 3 + 2] = _v3.z
    }
    const binding = bindToLattice(lattice, world)
    if (binding.boundIndices.length === 0) continue
    const k = binding.boundIndices.length
    const p0 = new Float32Array(k * 3)
    const invA = new Float32Array(k * 9)
    const beforeDelta = new Float32Array(k * 3)
    for (let r = 0; r < k; r++) {
      const v = binding.boundIndices[r]
      p0[r * 3] = world[v * 3]
      p0[r * 3 + 1] = world[v * 3 + 1]
      p0[r * 3 + 2] = world[v * 3 + 2]
      beforeDelta[r * 3] = target.layer.delta[v * 3]
      beforeDelta[r * 3 + 1] = target.layer.delta[v * 3 + 1]
      beforeDelta[r * 3 + 2] = target.layer.delta[v * 3 + 2]
      vertexWorldMatrix(target.mesh, v, _m4)
      _m4.invert()
      const e = _m4.elements
      invA.set([e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]], r * 9)
    }
    entries.push({ target, binding, p0, invA, beforeDelta })
  }
  return entries
}

/** Re-evaluate the FFD and write ABSOLUTE deltas (beforeDelta + mapped
 * displacement) for every bound vertex. */
function applyPreview(session: LatticeSession): void {
  const spaces = new Set<SculptTarget['weldSpace']>()
  for (const entry of session.entries) {
    const { target, binding, p0, invA, beforeDelta } = entry
    const deformed = evaluateLattice(session.lattice, binding)
    const { delta } = target.layer
    for (let r = 0; r < binding.boundIndices.length; r++) {
      const v = binding.boundIndices[r]
      const wx = deformed[r * 3] - p0[r * 3]
      const wy = deformed[r * 3 + 1] - p0[r * 3 + 1]
      const wz = deformed[r * 3 + 2] - p0[r * 3 + 2]
      const a = r * 9
      delta[v * 3] = beforeDelta[r * 3] + invA[a] * wx + invA[a + 3] * wy + invA[a + 6] * wz
      delta[v * 3 + 1] = beforeDelta[r * 3 + 1] + invA[a + 1] * wx + invA[a + 4] * wy + invA[a + 7] * wz
      delta[v * 3 + 2] = beforeDelta[r * 3 + 2] + invA[a + 2] * wx + invA[a + 5] * wy + invA[a + 8] * wz
    }
    applyDelta(target.layer, binding.boundIndices)
    spaces.add(target.weldSpace)
  }
  // Throttle welded normal recompute to every other drag event.
  if (session.dragCount % 2 === 0) {
    const sculpt = useSculptStore.getState().session
    if (sculpt) {
      for (const id of spaces) {
        const space = sculpt.spaces.get(id)
        if (space) recomputeWeldedNormals(space)
      }
    }
  }
}

function restoreBefore(session: LatticeSession): void {
  for (const { target, binding, beforeDelta } of session.entries) {
    const { delta } = target.layer
    for (let r = 0; r < binding.boundIndices.length; r++) {
      const v = binding.boundIndices[r]
      delta[v * 3] = beforeDelta[r * 3]
      delta[v * 3 + 1] = beforeDelta[r * 3 + 1]
      delta[v * 3 + 2] = beforeDelta[r * 3 + 2]
    }
    applyDelta(target.layer, binding.boundIndices)
  }
}

export const useLatticeStore = create<LatticeStoreState>((set, get) => ({
  session: null,
  selectedCp: -1,
  version: 0,

  create(scope: string) {
    const sculpt = useSculptStore.getState().session
    if (!sculpt) return
    get().cancel()
    const targets =
      scope === 'character' ? sculpt.targets : sculpt.targets.filter((t) => t.weldSpace === scope)
    if (targets.length === 0) return

    // World bbox over the scoped targets' current (posed, sculpted) surface.
    const box = new THREE.Box3()
    for (const target of targets) {
      const count = target.layer.basePositions.length / 3
      for (let v = 0; v < count; v++) box.expandByPoint(vertexWorld(target, v, _v3))
    }
    box.expandByVector(_v3.copy(box.max).sub(box.min).multiplyScalar(0.04)) // 4% padding

    const lattice = createLattice({ min: box.min.toArray(), max: box.max.toArray() })
    const entries = buildEntries(targets, lattice)
    if (entries.length === 0) return
    set((s) => ({ session: { lattice, scope, entries, dragCount: 0 }, selectedCp: -1, version: s.version + 1 }))
  },

  selectCp(index: number) {
    set({ selectedCp: index })
  },

  dragCp(index: number, x: number, y: number, z: number) {
    const session = get().session
    if (!session) return
    session.lattice.points[index * 3] = x
    session.lattice.points[index * 3 + 1] = y
    session.lattice.points[index * 3 + 2] = z
    session.dragCount++
    applyPreview(session)
    set((s) => ({ version: s.version + 1 }))
  },

  apply() {
    const session = get().session
    const sculpt = useSculptStore.getState().session
    if (!session || !sculpt) return
    const entries: SculptCommandEntry[] = []
    for (const { target, binding, beforeDelta } of session.entries) {
      const indices = binding.boundIndices
      const after = new Float32Array(indices.length * 3)
      for (let r = 0; r < indices.length; r++) {
        const v = indices[r]
        after[r * 3] = target.layer.delta[v * 3]
        after[r * 3 + 1] = target.layer.delta[v * 3 + 1]
        after[r * 3 + 2] = target.layer.delta[v * 3 + 2]
      }
      entries.push({ layer: target.layer, indices, before: beforeDelta, after })
    }
    set((s) => ({ session: null, selectedCp: -1, version: s.version + 1 }))
    studioCommands.execute(
      createSculptCommand({
        strokeId: `lattice-${++latticeCounter}`,
        label: 'apply lattice',
        entries,
        onApplied: () => {
          const live = useSculptStore.getState().session
          if (live && !live.liveStroke) {
            finalizeSculptVisuals(live)
            commitSculptToSpec(live)
          }
        },
      }),
    )
  },

  cancel() {
    const session = get().session
    if (!session) return
    restoreBefore(session)
    const sculpt = useSculptStore.getState().session
    if (sculpt) finalizeSculptVisuals(sculpt)
    set((s) => ({ session: null, selectedCp: -1, version: s.version + 1 }))
  },
}))

declare global {
  interface Window {
    __latticeStore?: typeof useLatticeStore
  }
}
if (typeof window !== 'undefined') window.__latticeStore = useLatticeStore

// Leaving sculpt mode, reassembly, or Play Mode all invalidate the session's
// frozen bindings — cancel (restores pre-session deltas).
useSculptStore.subscribe((state, prev) => {
  if (!useLatticeStore.getState().session) return
  if ((prev.active && !state.active) || state.session !== prev.session) {
    useLatticeStore.getState().cancel()
  }
})
