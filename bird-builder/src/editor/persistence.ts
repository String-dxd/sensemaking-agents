import { type BirdGenome, isValidGenome } from '../bird/genome'
import { migrate } from '../bird/migrate'

// localStorage save/load/autosave for the bird genome. Mirrors
// island-editor/src/editor/persistence.ts — same StorageLike seam (tests inject
// a fake store), same lenient load (invalid → null, never throws). loadConfig
// runs migrate() first, so a stale v1 autosave UPGRADES in place (we keep the
// STORAGE_KEY rather than bumping it, so no save is orphaned).

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

export function saveConfig(config: BirdGenome, storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : defaultStorage()
  if (!s) return
  s.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function loadConfig(storage?: StorageLike | null): BirdGenome | null {
  try {
    const s = storage !== undefined ? storage : defaultStorage()
    if (!s) return null
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return null
    const migrated = migrate(JSON.parse(raw))
    return isValidGenome(migrated) ? migrated : null
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
): (config: BirdGenome) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (config: BirdGenome) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      saveConfig(config, storage)
      timer = null
    }, delayMs)
  }
}
