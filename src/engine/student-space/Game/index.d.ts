// TypeScript declarations for the Student Space engine.
//
// The engine source under this directory is JavaScript (ported into this
// repo as a clean cut from github.com/wondopamine/student-space @ cd30172).
// This file shapes what React hosts see when they import from
// `~/engine/student-space/Game`.
//
// Host contract is documented in:
//   docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md

export interface StorageAdapter {
  getItem(key: string): string | null
  /**
   * Persistence's unload-flush path (`beforeunload`/`pagehide`) calls this
   * synchronously and does not await. **An async implementation that does
   * real work in a Promise will silently lose writes on tab close** —
   * browsers do not wait for unresolved Promises during unload. Backend-
   * backed adapters must use `navigator.sendBeacon` or
   * `fetch(..., { keepalive: true })` internally to durably persist.
   */
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface GameOptions {
  container?: HTMLElement
  persistence?: { storage?: StorageAdapter }
  /**
   * Open a registered overlay surface immediately after boot. Honored only
   * when onboarding has finished. Used by hosts to land users on a specific
   * sheet after a redirect (e.g. `/me` → `/?sheet=profile`).
   */
  initialOverlay?: { name: string }
}

export interface Game {
  dispose(): void
  /**
   * Public state surface. The four slices below are the stable engine
   * contract; other engine-internal stores (TeacherLetters, CalendarEvents,
   * Island, Weather, etc.) are reachable at runtime via `(game.state as any)`
   * but are not declared here and are not part of the host contract.
   */
  state: {
    onboarding: {
      subscribe(listener: (event: unknown, context: unknown) => void): () => void
    }
    moodPins: {
      subscribe(listener: (event: unknown, context: unknown) => void): () => void
    }
    profile: {
      subscribe(listener: (event: unknown, context: unknown) => void): () => void
    }
    captures: {
      subscribe(listener: (event: unknown, context: unknown) => void): () => void
    }
    sprouts: {
      subscribe(listener: (event: SproutsEvent, sprouts: readonly Sprout[]) => void): () => void
      recent(n?: number): readonly Sprout[]
      getActive(): Sprout | null
      readyToBloom(): readonly Sprout[]
      grow(captureRef: { kind: 'capture' | 'mood'; id: string }): {
        sprout: Sprout | null
        didSpawn: boolean
        didMarkReady: boolean
      }
      bloom(id: string): Sprout | null
    }
  }
}

/**
 * Sprout descriptor — a growing-but-not-yet-bloomed thing on the island.
 * Captures attach to the active sprout until it crosses the bloom
 * threshold; on bloom the sprout is removed from the active list and
 * the view spawns a real Tree at the sprout's placementSeed.
 *
 * v1 ships single-species (`species: 'tree'`). v2 widens the enum.
 */
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

export function createGame(opts?: GameOptions): Game
export default createGame

/**
 * @internal — host code should use `createGame()`, which wraps singleton-guard
 * + dispose lifecycle. The raw constructor bypasses both. Exported only
 * because `Game/index.js` exports it.
 */
export const Game: new (opts?: GameOptions) => Game

/** @internal — implementation detail of the engine's persistence layer. */
export const Persistence: unknown

export function localStorageAdapter(): StorageAdapter
export function memoryAdapter(): StorageAdapter

export const HOST_BODY_CLASSES: readonly string[]
