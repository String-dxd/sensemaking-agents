import { type BirdConfig, isValidConfig } from '../bird/birdConfig'

// localStorage save/load/autosave for the bird config. Mirrors
// island-editor/src/editor/persistence.ts — same StorageLike seam (tests inject
// a fake store), same lenient load (invalid → null, never throws).

export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export const STORAGE_KEY = 'bird-builder:config:v1'

function defaultStorage(): StorageLike | null {
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export function saveConfig(config: BirdConfig, storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : defaultStorage()
  if (!s) return
  s.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function loadConfig(storage?: StorageLike | null): BirdConfig | null {
  try {
    const s = storage !== undefined ? storage : defaultStorage()
    if (!s) return null
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidConfig(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSaved(storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : defaultStorage()
  if (!s) return
  s.removeItem(STORAGE_KEY)
}

export function createAutosaver(
  delayMs = 400,
  storage?: StorageLike | null,
): (config: BirdConfig) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (config: BirdConfig) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      saveConfig(config, storage)
      timer = null
    }, delayMs)
  }
}
