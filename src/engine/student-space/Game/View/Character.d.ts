// The character view's React-facing contract (world-port U8) — registered at
// `view.kira` in View.js. This is Kira's full contract, honored by the
// editor-authored character.

import type { Group, Vector3 } from 'three'

export default class Character {
  group: Group
  facing: number
  perchX: number
  perchY: number
  perchZ: number
  perchYaw: number
  speciesId: string
  onboardingMode: boolean

  setSpecies(id: string): void
  cycleSpecies(delta?: number): void
  onSpeciesChange(fn: (id: string) => void): () => void
  setOnboardingMode(active: boolean): void
  flyTo(opts?: {
    startPos?: { x: number; y?: number; z: number }
    endPos?: { x: number; y?: number; z: number }
    midOffset?: { x: number; y: number; z: number }
    duration?: number
    endYaw?: number
    reducedMotion?: boolean
  }): Promise<void>
  getHeadWorldPosition(out: Vector3): Vector3
  isTalking(): boolean
  update(): void
  dispose(): void
}

export { IDLE_POSE_CLIP } from '../State/characterBehavior.ts'
