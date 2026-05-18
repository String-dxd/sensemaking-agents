// Companion declarations for Persistence.js — narrow surface that tests
// and the cross-slice wiring need. The full adapter contract lives in the
// engine's top-level `../index.d.ts`.

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function localStorageAdapter(): StorageAdapter
export function memoryAdapter(): StorageAdapter

export default class Persistence {
  static instance: Persistence | null
  static getInstance(): Persistence | null

  constructor(opts?: { storage?: StorageAdapter })

  load(): {
    moodPins: unknown[]
    captures: unknown[]
    profile: unknown
    letters: unknown[]
    calendar: unknown[]
    onboarding: unknown
    sprouts: unknown
  }
  save(slice: string, value: unknown): void
  flush(): void
  clear(): void
  dispose(): void
}
