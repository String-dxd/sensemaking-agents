// Sculpt session + tool state (plan 009, step 4). Studio-level, never
// persisted — the persistent artifact is the spec's anatomy.sculptDelta,
// which CharacterRoot syncs against this session.

import type * as THREE from 'three'
import { create } from 'zustand'
import { refreshOutline } from '../../core/materials'
import type { BrushKind, WeldSpaceTopology } from '../../core/sculpt'
import {
  buildWeldSpaceTopology,
  recomputeWeldedNormals,
  SCULPT_QUANTUM,
  type SculptTarget,
  serializeSculptDelta,
} from '../../core/sculpt'
import type { SculptDeltaPayload } from '../../core/spec/schema'
import { useCharacterStore } from './characterStore'

export interface SculptSession {
  assembledRoot: THREE.Object3D
  targets: SculptTarget[]
  /** weldSpace id → cached topology (targets of that space, in order). */
  spaces: Map<string, WeldSpaceTopology>
  /** mesh → its target + weld-space membership (raycast dispatch). */
  byMesh: Map<THREE.Mesh, { target: SculptTarget; space: WeldSpaceTopology; indexInSpace: number }>
  baseMeshId: string
  baseMeshVersion: number
  /** Identity of the spec payload this session last wrote/applied — the
   * CharacterRoot sync effect skips payloads the session itself committed. */
  lastSyncedPayload: SculptDeltaPayload | null | undefined
  /** True while a brush stroke is being dragged (commands' onApplied defers
   * to the tool's own throttled updates during the stroke). */
  liveStroke: boolean
}

export function createSculptSession(
  assembledRoot: THREE.Object3D,
  targets: SculptTarget[],
  base: { baseMeshId: string; baseMeshVersion: number },
): SculptSession {
  const bySpaceId = new Map<string, SculptTarget[]>()
  for (const target of targets) {
    const list = bySpaceId.get(target.weldSpace) ?? []
    list.push(target)
    bySpaceId.set(target.weldSpace, list)
  }
  const spaces = new Map<string, WeldSpaceTopology>()
  const byMesh: SculptSession['byMesh'] = new Map()
  for (const [spaceId, spaceTargets] of bySpaceId) {
    const space = buildWeldSpaceTopology(spaceTargets)
    spaces.set(spaceId, space)
    spaceTargets.forEach((target, indexInSpace) => {
      byMesh.set(target.mesh, { target, space, indexInSpace })
    })
  }
  return {
    assembledRoot,
    targets,
    spaces,
    byMesh,
    ...base,
    lastSyncedPayload: undefined,
    liveStroke: false,
  }
}

/** Serialize the session's live deltas into the spec (stroke end, undo,
 * redo, lattice apply). Marks the payload as session-synced so the
 * CharacterRoot effect doesn't redundantly re-apply it. */
export function commitSculptToSpec(session: SculptSession): void {
  const live = serializeSculptDelta(session.targets, {
    baseMeshId: session.baseMeshId,
    baseMeshVersion: session.baseMeshVersion,
  })
  // Preserve saved layers for assets that are NOT currently equipped (their
  // meshes aren't live targets) — re-equipping the part restores its sculpt.
  const liveAssetIds = new Set(session.targets.map((t) => t.assetId))
  const dormant = (useCharacterStore.getState().spec.anatomy.sculptDelta?.layers ?? []).filter(
    (layer) => !liveAssetIds.has(layer.assetId),
  )
  const layers = [...(live?.layers ?? []), ...dormant]
  const payload: SculptDeltaPayload | null =
    layers.length === 0
      ? null
      : live
        ? { ...live, layers }
        : {
            baseMeshId: session.baseMeshId,
            baseMeshVersion: session.baseMeshVersion,
            // The studio is the only writer and always encodes at
            // SCULPT_QUANTUM, so dormant layers share this quantum.
            quantum: SCULPT_QUANTUM,
            layers,
          }
  session.lastSyncedPayload = payload
  useCharacterStore.getState().patch((draft) => {
    const anatomy = { ...draft.anatomy }
    if (payload) anatomy.sculptDelta = payload
    else delete anatomy.sculptDelta
    draft.anatomy = anatomy
  })
}

/** Exact normal recompute across every weld space + outline shell refresh
 * (stroke end, undo/redo, payload sync). */
export function finalizeSculptVisuals(session: SculptSession): void {
  for (const space of session.spaces.values()) recomputeWeldedNormals(space)
  for (const target of session.targets) refreshOutline(target.mesh)
}

export const SCULPT_RADIUS_MIN = 0.01
export const SCULPT_RADIUS_MAX = 0.6

export interface SculptStoreState {
  /** Sculpt mode: pauses spring physics + idle motion, locks orbit to
   * right-mouse, mounts the viewport tool. */
  active: boolean
  brush: BrushKind
  /** Brush radius, world meters. */
  radius: number
  /** Brush strength 0..1 (grab ignores it — drags track the cursor). */
  strength: number
  /** Mirror across the character's X symmetry plane (default ON). */
  mirrorX: boolean
  /** Live session, published by CharacterRoot per assembly. */
  session: SculptSession | null
  setActive(active: boolean): void
  setBrush(brush: BrushKind): void
  setRadius(radius: number): void
  setStrength(strength: number): void
  setMirrorX(mirrorX: boolean): void
}

export const useSculptStore = create<SculptStoreState>((set) => ({
  active: false,
  brush: 'grab',
  radius: 0.12,
  strength: 0.5,
  mirrorX: true,
  session: null,
  setActive: (active) => set({ active }),
  setBrush: (brush) => set({ brush }),
  setRadius: (radius) => set({ radius: Math.min(Math.max(radius, SCULPT_RADIUS_MIN), SCULPT_RADIUS_MAX) }),
  setStrength: (strength) => set({ strength: Math.min(Math.max(strength, 0), 1) }),
  setMirrorX: (mirrorX) => set({ mirrorX }),
}))

declare global {
  interface Window {
    __sculptStore?: typeof useSculptStore
  }
}
if (typeof window !== 'undefined') window.__sculptStore = useSculptStore
