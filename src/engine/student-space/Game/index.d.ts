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
  }
}

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
