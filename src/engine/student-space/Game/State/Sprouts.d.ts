// Companion declarations for Sprouts.js — the engine's third state slice.
// Mirrors the public surface declared in `../index.d.ts` so internal callers
// (State.js wiring, the React overlay, vitest unit tests) can import the
// class + helpers directly via a typed path.

export interface Sprout {
  readonly id: string
  readonly createdAt: string
  readonly entryDate: string
  readonly species: 'tree'
  readonly treeSpecies: 'oak' | 'cherry'
  readonly placementSeed: number
  readonly threshold: number
  readonly count: number
  readonly readyToBloom: boolean
  readonly bloomedAt: string | null
  readonly captureRefs: readonly string[]
}

export type SproutsEvent =
  | { type: 'spawned'; sprout: Sprout }
  | { type: 'grew'; sprout: Sprout }
  | { type: 'markedReady'; sprout: Sprout }
  | { type: 'bloomed'; sprout: Sprout }

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
  cycleIndex: number

  constructor()

  grow(captureRef: CaptureRef | unknown): {
    sprout: Sprout | null
    didSpawn: boolean
    didMarkReady: boolean
  }
  bloom(id: string): Sprout | null

  recent(n?: number): readonly Sprout[]
  getActive(): Sprout | null
  readyToBloom(): readonly Sprout[]

  subscribe(cb: (event: SproutsEvent, sprouts: readonly Sprout[]) => void): () => void

  hydrate(snapshot: { cycleIndex?: number; sprouts?: unknown[] } | null | undefined): void
  serialize(): { cycleIndex: number; sprouts: Sprout[] }
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
