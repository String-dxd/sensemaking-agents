import type { IslandSpec } from '../terrain/islandSpec'

export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export const STORAGE_KEY = 'island-editor:spec:v1'

function defaultStorage(): StorageLike | null {
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export function saveSpec(spec: IslandSpec, storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : defaultStorage()
  if (!s) return
  s.setItem(STORAGE_KEY, JSON.stringify(spec))
}

function isValidSpec(obj: unknown): obj is IslandSpec {
  if (typeof obj !== 'object' || obj === null) return false
  const o = obj as Record<string, unknown>

  if (o['version'] !== 1) return false
  if (typeof o['worldSize'] !== 'number' || !isFinite(o['worldSize'])) return false

  if (!Array.isArray(o['coastline'])) return false
  for (const pt of o['coastline'] as unknown[]) {
    if (typeof pt !== 'object' || pt === null) return false
    const p = pt as Record<string, unknown>
    if (typeof p['x'] !== 'number' || typeof p['z'] !== 'number') return false
  }

  if (typeof o['heightProfile'] !== 'object' || o['heightProfile'] === null) return false
  const hp = o['heightProfile'] as Record<string, unknown>
  for (const key of ['seaLevel', 'plateauHeight', 'coastFalloff', 'cliffSteepness', 'seafloorDepth']) {
    if (typeof hp[key] !== 'number') return false
  }

  if (typeof o['relief'] !== 'object' || o['relief'] === null) return false
  const r = o['relief'] as Record<string, unknown>
  if (typeof r['resolution'] !== 'number') return false
  if (!Array.isArray(r['data'])) return false

  return true
}

export function loadSpec(storage?: StorageLike | null): IslandSpec | null {
  try {
    const s = storage !== undefined ? storage : defaultStorage()
    if (!s) return null
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidSpec(parsed)) return null
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
