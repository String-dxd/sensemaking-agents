import type { IslandSpec } from '../terrain/terrainGrid'
import { serializeSpec, validateSpecObject } from './specIO'

export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

// Storage slot key (NOT the spec format version). Deliberately stays ':v1' so
// existing autosaves survive format bumps — loadSpec/validateSpecObject accept
// v1/v2/v3 payloads transparently (old versions migrate to the v3 grid on read).
export const STORAGE_KEY = 'island-editor:spec:v1'

function defaultStorage(): StorageLike | null {
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export function saveSpec(spec: IslandSpec, storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : defaultStorage()
  if (!s) return
  try {
    validateSpecObject(spec)        // never persist an invalid spec; keep last-good
  } catch {
    return
  }
  s.setItem(STORAGE_KEY, serializeSpec(spec))
}

export function loadSpec(storage?: StorageLike | null): IslandSpec | null {
  try {
    const s = storage !== undefined ? storage : defaultStorage()
    if (!s) return null
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return null
    return validateSpecObject(JSON.parse(raw))
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
): (spec: IslandSpec) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (spec: IslandSpec) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      saveSpec(spec, storage)
      timer = null
    }, delayMs)
  }
}
