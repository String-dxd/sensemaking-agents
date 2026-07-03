// Studio-level (NOT persisted) shared stores, split out of PlaceholderBody
// when plan 006's CharacterRoot took over mounting the character. Both body
// components publish their live motion handles here; DOM panels consume them.

import { create } from 'zustand'
import { DEFAULT_TERMINATOR_WARMTH } from '../../core/materials'
import type { IdleLayer } from '../../core/motion/proceduralIdle'
import type { SpringRig } from '../../core/motion/springSolver'
import type { SpringChainDef } from '../../core/motion/springTypes'
import type { MaterialAssign } from '../../core/spec/schema'

/** Temporary body movers (plan 003 step 4, stand-ins for plan-007 clips). */
export interface BodyMover {
  update(dt: number): void
  /** 0.15 m vertical impulse curve over 400 ms. */
  hop(): void
  /** Head yaw ±25° decaying oscillation over 600 ms. */
  shake(): void
  /** Root follows a 1 m-radius circle at 0.6 m/s; toggling off snaps home. */
  toggleWalk(): boolean
}

/** Live handles for the MotionDebugPanel (populated once a body mounts). */
export interface MotionStudioState {
  rig: SpringRig | null
  idle: IdleLayer | null
  mover: BodyMover | null
  /** The chain defs the live rig was created with (panel group discovery). */
  chains: SpringChainDef[]
}

export const useMotionStudio = create<MotionStudioState>(() => ({ rig: null, idle: null, mover: null, chains: [] }))

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

/** Safety net if a loaded spec omits a region (materials is a partial record). */
export const FALLBACK_ASSIGN: MaterialAssign = {
  rampSoftness: 0.2,
  rimStrength: 0.3,
  shadowTint: '#b8a8c8',
  outline: false,
  textureId: 'authored',
}
