// Minimal TypeScript declarations for the vendored Student Space engine.
// The engine source is JavaScript; this file shapes what React hosts see
// when they import from `~/engine/student-space/Game`. See ENGINE.md (upstream)
// and src/engine/student-space/UPSTREAM.md for the host contract.

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface GameOptions {
  container?: HTMLElement
  persistence?: { storage?: StorageAdapter }
}

export interface Game {
  dispose(): void
  state: {
    onboarding: { subscribe(listener: (event: unknown) => void): () => void }
    moodPins: { subscribe(listener: (pin: unknown) => void): () => void }
    profile: { subscribe(listener: (event: unknown) => void): () => void }
    captures: { subscribe(listener: (event: unknown) => void): () => void }
  }
}

export function createGame(opts?: GameOptions): Game

/**
 * @internal — host code should use `createGame()`, which wraps singleton-guard
 * + dispose lifecycle. The raw constructor bypasses both. Exported only
 * because the upstream engine exports it.
 */
export const Game: new (opts?: GameOptions) => Game

/** @internal — implementation detail of the engine's persistence layer. */
export const Persistence: unknown

export function localStorageAdapter(): StorageAdapter
export function memoryAdapter(): StorageAdapter

export const HOST_BODY_CLASSES: readonly string[]
