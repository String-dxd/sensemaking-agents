import { useSyncExternalStore } from 'react'

/**
 * Hatch tuner — EggHatcher's animation reads its bird/camera framing
 * values from here so the dev HUD (Cmd+K) can dial in the hatching
 * silhouette against a live preview. Same shape as `camera-tuner.ts`.
 *
 * Defaults are the source of truth for the shipped hatch ceremony. The
 * override layer is persisted in localStorage so a refresh keeps the
 * tuner state, and the dev HUD exposes a Copy button so the chosen
 * numbers can be pasted back into this file.
 */

export type HatchPreset = {
  /** Bird group Y at scale 0 — the visual origin of the scale-up. */
  birdStartY: number
  /** Bird group Y at scale 1 — final standing pose inside the cup. */
  birdRevealY: number
  /** Clone scale applied to the cached MaskedBower GLB. */
  birdScale: number
  /** Perspective camera vertical FOV (degrees). */
  cameraFov: number
  /** Camera Z position (distance from lookAt at origin). */
  cameraDistance: number
}

export const DEFAULT_HATCH_PRESET: Readonly<HatchPreset> = Object.freeze({
  birdStartY: -0.7,
  birdRevealY: -0.4,
  birdScale: 0.39,
  cameraFov: 28,
  cameraDistance: 6.4,
})

const STORAGE_KEY = 'studentSpace.hatchTuner.overrides'

function readStorage(): Partial<HatchPreset> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<HatchPreset>) : {}
  } catch {
    return {}
  }
}

function computeSnapshot(o: Partial<HatchPreset>): HatchPreset {
  return { ...DEFAULT_HATCH_PRESET, ...o }
}

let overrides: Partial<HatchPreset> = readStorage()
// Memoised resolved snapshot — keeps getSnapshot stable across reads.
let snapshot: HatchPreset = computeSnapshot(overrides)

const listeners = new Set<() => void>()

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // safari private mode / quota — non-fatal, tuner runs in-memory only.
  }
}

function notify() {
  snapshot = computeSnapshot(overrides)
  for (const l of listeners) l()
}

export function getHatchPreset(): HatchPreset {
  return snapshot
}

export function patchHatchPreset(patch: Partial<HatchPreset>): void {
  overrides = { ...overrides, ...patch }
  persist()
  notify()
}

export function resetHatchPreset(): void {
  if (Object.keys(overrides).length === 0) return
  overrides = {}
  persist()
  notify()
}

export function hasHatchOverride(): boolean {
  return Object.keys(overrides).length > 0
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** React subscription — re-renders when any tuner value changes. */
export function useHatchPreset(): HatchPreset {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  )
}
