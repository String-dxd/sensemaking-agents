// Companion declarations for Sprouts.js — the engine's third state slice.
// Mirrors the public surface declared in `../index.d.ts` so internal callers
// (State.js wiring, the React overlay, vitest unit tests) can import the
// class + helpers directly via a typed path.

export type SproutSpecies = 'pending' | 'tree' | 'flower' | 'butterfly' | 'fruit'
export type SproutDimension = 'values' | 'interests' | 'personality' | 'skills'

export interface SproutPosition {
  readonly x: number
  readonly z: number
}

export interface Sprout {
  readonly id: string
  readonly createdAt: string
  readonly entryDate: string
  readonly species: SproutSpecies
  readonly treeSpecies: 'oak' | 'cherry'
  readonly placementSeed: number
  readonly threshold: number
  readonly count: number
  readonly readyToBloom: boolean
  readonly bloomedAt: string | null
  readonly captureRefs: readonly string[]
  readonly dimension: SproutDimension | null
  readonly position: SproutPosition | null
}

export interface BloomedTree {
  readonly id: string
  readonly createdAt: string
  readonly bloomedAt: string
  readonly species: SproutSpecies
  readonly treeSpecies: 'oak' | 'cherry'
  readonly placementSeed: number
  readonly captureRefs: readonly string[]
  readonly dimension: SproutDimension | null
  readonly position: SproutPosition | null
}

export type SproutsEvent =
  | { type: 'spawned'; sprout: Sprout }
  | { type: 'grew'; sprout: Sprout }
  | { type: 'markedReady'; sprout: Sprout }
  | { type: 'speciesLocked'; sprout: Sprout }
  | { type: 'bloomed'; sprout: Sprout; bloomedTree: BloomedTree }
  | { type: 'sproutMoved'; sprout: Sprout }
  | { type: 'bloomedMoved'; bloomedTree: BloomedTree }

export interface CaptureRef {
  kind: 'capture' | 'mood'
  id: string
}

export const BLOOM_THRESHOLD: number
export const TREE_SPECIES_ROTATION: readonly string[]

export default class Sprouts {
  static instance: Sprouts | null
  static getInstance(): Sprouts | null

  sprouts: Sprout[]
  bloomedTrees: BloomedTree[]
  cycleIndex: number

  constructor()

  grow(captureRef: CaptureRef | unknown): {
    sprout: Sprout | null
    didSpawn: boolean
    didMarkReady: boolean
  }
  bloom(id: string): { sprout: Sprout; bloomedTree: BloomedTree } | null
  setDimensionForFirstCapture(captureId: string, dimension: SproutDimension): boolean
  setSproutPosition(id: string, position: SproutPosition | null): boolean
  setBloomedPosition(id: string, position: SproutPosition | null): boolean

  recent(n?: number): readonly Sprout[]
  getActive(): Sprout | null
  readyToBloom(): readonly Sprout[]
  listBloomedTrees(): readonly BloomedTree[]

  subscribe(cb: (event: SproutsEvent, sprouts: readonly Sprout[]) => void): () => void

  hydrate(snapshot: { cycleIndex?: number; sprouts?: unknown[]; bloomedTrees?: unknown[] } | null | undefined): void
  serialize(): { cycleIndex: number; sprouts: Sprout[]; bloomedTrees: BloomedTree[] }
}

export interface CapturesLike {
  subscribe(cb: (entry: { id: string }) => void): () => void
}

export interface MoodPinsLike {
  subscribe(cb: (pin: { id: string }) => void): () => void
}

export function wireSproutsToCaptures(
  captures: CapturesLike,
  moodPins: MoodPinsLike,
  sprouts: Sprouts,
): () => void
