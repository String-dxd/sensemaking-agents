import type { Vector3 } from 'three'

/**
 * Shared engine-view shape for the onboarding bloom + termly stages.
 *
 * The original `IslandReveal` surface was a single component that owned
 * the bloom, the tree narration, and the closing beat together. The
 * one-shot rework split that into `BloomCelebrate` + `TermlyReveal`;
 * the only surviving export here is the engine-view type those two
 * components share. The runtime surface is gone — there is no React
 * component called `IslandReveal` anymore.
 */
export type IslandRevealView = {
  camera?: {
    zoomTo?: (position: Vector3, lookAt: Vector3, duration: number) => void
    resetToDefault?: (duration: number) => void
  } | null
  flowers?: {
    flowers?: Array<{ x: number; z: number }>
    setFirstSpeciesForEmotion?: (emotion: string, color: string) => unknown
    bloomInstance?: (index: number, opts: { duration: number }) => Promise<void> | void
  } | null
  tree?: {
    entries?: Array<unknown>
    growIn?: (index: number, opts: { duration: number }) => Promise<void> | void
  } | null
  sound?: { playOneShot?: (name: string) => void } | null
  kira?: {
    perchX?: number
    perchY?: number
    perchZ?: number
    perchYaw?: number
    facing?: number
    group?: {
      visible?: boolean
      position?: { set?: (x: number, y: number, z: number) => unknown }
      rotation?: { y?: number }
    }
  } | null
  kiraDialogue?: {
    sayOnboarding?: (line: string) => void
    clearOnboardingBubble?: () => void
  } | null
}
