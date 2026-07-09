// Studio-level (NOT persisted) shared stores, split out of PlaceholderBody
// when plan 006's CharacterRoot took over mounting the character. Both body
// components publish their live motion handles here; DOM panels consume them.

import type { Object3D } from 'three'
import { create } from 'zustand'
import { DEFAULT_TERMINATOR_WARMTH } from '../../core/materials'
import type { IdleLayer } from '../../core/motion/proceduralIdle'
import type { SpringRig } from '../../core/motion/springSolver'
import type { SpringChainDef } from '../../core/motion/springTypes'
import type { BoneName, MaterialAssign } from '../../core/spec/schema'

/** Temporary body movers (plan 003 step 4, stand-ins for plan-007 clips). */
export interface BodyMover {
  update(dt: number): void
  /** 0.15 m vertical impulse curve over 400 ms. */
  hop(): void
  /** Head yaw ±25° decaying oscillation over 600 ms. */
  shake(): void
}

/** The live assembled character, published by CharacterRoot per assembly. */
export interface CharacterHandle {
  root: Object3D
  boneByName: Map<BoneName, Object3D>
  /** Hips rest LOCAL position captured at assembly (before any animation) —
   * the clip machine's hipsRebase target (plan 007). */
  hipsRest: readonly [number, number, number]
}

/** Live handles for the MotionDebugPanel + Play Mode (populated once a body mounts). */
export interface MotionStudioState {
  rig: SpringRig | null
  idle: IdleLayer | null
  mover: BodyMover | null
  character: CharacterHandle | null
  /** The chain defs the live rig was created with (panel group discovery). */
  chains: SpringChainDef[]
  /** Studio-mode walk-circle debug toggle (advisor plan 001) — drives
   * `StudioWalkDriver` via the authored clip machine, outside Play mode. */
  studioWalk: boolean
  setStudioWalk(on: boolean): void
}

export const useMotionStudio = create<MotionStudioState>((set) => ({
  rig: null,
  idle: null,
  mover: null,
  character: null,
  chains: [],
  studioWalk: false,
  setStudioWalk: (studioWalk) => set({ studioWalk }),
}))

// Studio-level shading control: terminatorWarmth is a factory uniform, not a
// spec MaterialAssign field (a spec field needs a SPEC_VERSION bump — plan 004
// rule). Global across regions; plan 010/012 can promote it.
export interface ToonStudioState {
  terminatorWarmth: number
  setTerminatorWarmth(value: number): void
}

export const useToonStudio = create<ToonStudioState>((set) => ({
  terminatorWarmth: DEFAULT_TERMINATOR_WARMTH,
  setTerminatorWarmth: (terminatorWarmth) => set({ terminatorWarmth }),
}))

// Studio-level (NOT persisted) lighting-gizmo visibility (plan 010 step 3).
// Always force-hidden in Play Mode regardless of this flag — Stage.tsx gates
// on `usePlayStore().mode` too, this only controls the studio-mode toggle.
export interface LightingStudioState {
  showGizmos: boolean
  setShowGizmos(show: boolean): void
  /** Which light LightingPanel is editing; `null` -> the panel falls back to the first light. */
  selectedLightId: string | null
  setSelectedLightId(id: string | null): void
}

export const useLightingStudio = create<LightingStudioState>((set) => ({
  showGizmos: true,
  setShowGizmos: (showGizmos) => set({ showGizmos }),
  selectedLightId: null,
  setSelectedLightId: (selectedLightId) => set({ selectedLightId }),
}))

// Studio-level (NOT persisted) advanced-mode flag (advisor plan 009): raw
// controls (body morphs, bone scales, archetype override, motion debug) are
// demoted behind this toggle; the curated species-first flow is the default.
export const useAdvancedMode = create<{ advanced: boolean; setAdvanced(v: boolean): void }>((set) => ({
  advanced: false,
  setAdvanced: (advanced) => set({ advanced }),
}))

/** Draws a THREE.SkeletonHelper over the assembled rig so the bone wiring is
 * visible while dragging the Advanced skeleton sliders (session-only). */
export const useSkeletonDebug = create<{ show: boolean; setShow(v: boolean): void }>((set) => ({
  show: false,
  setShow: (show) => set({ show }),
}))

/** Safety net if a loaded spec omits a region (materials is a partial record). */
export const FALLBACK_ASSIGN: MaterialAssign = {
  rampSoftness: 0.2,
  rimStrength: 0.3,
  shadowTint: '#b8a8c8',
  outline: false,
  textureId: 'authored',
}
