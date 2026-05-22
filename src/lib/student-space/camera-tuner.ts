import { useSyncExternalStore } from 'react'

/**
 * Camera tuner — onboarding scenes read their framing values from here so
 * the dev HUD (Cmd+K) can preview tweaks against the live engine and the
 * user can copy the chosen numbers back into source.
 *
 * Defaults are the source of truth for the shipped onboarding ceremony.
 * The override store layers per-key edits on top, persisted in
 * localStorage so a refresh keeps the tuner state.
 */

export type SceneId = 'first-chat' | 'bloom' | 'tree-wide' | 'closing-portrait' | 'login-orbit'

export type FirstChatPreset = {
  /** Planar distance from the bird's perch point. */
  distance: number
  /** Yaw offset (deg) added to the perch yaw to orbit the camera around the bird. */
  yawOffsetDeg: number
  /** Camera Y above the lookAt point. Positive = camera sits higher → looks down. */
  camYAboveLookAt: number
  /** LookAt Y above the perch base. */
  lookAtYAbovePerch: number
  /** Dolly duration in ms. */
  durationMs: number
  /** How long after fly-in starts to kick the dolly off (in ms). */
  zoomLeadMs: number
}

export type BloomPreset = {
  /** Camera Y above the lookAt point. */
  camYAboveLookAt: number
  /** Camera Z behind the flower (positive = pulled back). */
  camZBack: number
  /** Absolute lookAt Y (bloom sits ~0.5 above ground by default). */
  lookAtY: number
  durationMs: number
}

export type TreeWidePreset = {
  camX: number
  camY: number
  camZ: number
  lookAtY: number
  durationMs: number
}

export type ClosingPortraitPreset = {
  distance: number
  yawOffsetDeg: number
  camYAboveLookAt: number
  lookAtYAbovePerch: number
  durationMs: number
}

export type LoginOrbitPreset = {
  azimuthDegPerSec: number
  distance: number
  pitchDeg: number
}

export type PresetMap = {
  'first-chat': FirstChatPreset
  bloom: BloomPreset
  'tree-wide': TreeWidePreset
  'closing-portrait': ClosingPortraitPreset
  'login-orbit': LoginOrbitPreset
}

/**
 * Default presets — angle on the FirstChat / Closing portraits has been
 * tilted more vertical (camera sits above the bird looking down) than the
 * earlier nearly-horizontal pose.
 */
export const DEFAULT_PRESETS: Readonly<PresetMap> = Object.freeze({
  'first-chat': {
    distance: 3.6,
    yawOffsetDeg: 25.7, // ~π/7
    camYAboveLookAt: 1.25, // was -0.05 (camera below lookAt) → now well above
    lookAtYAbovePerch: 0.3,
    durationMs: 1400,
    zoomLeadMs: 1300,
  },
  bloom: {
    camYAboveLookAt: 1.9,
    camZBack: 4.8,
    lookAtY: 0.5,
    durationMs: 1100,
  },
  'tree-wide': {
    camX: 3,
    camY: 5.5,
    camZ: 8,
    lookAtY: 1.8,
    durationMs: 1400,
  },
  'closing-portrait': {
    distance: 3.4,
    yawOffsetDeg: 0,
    camYAboveLookAt: 1.15, // was 0.55 → camera sits noticeably higher
    lookAtYAbovePerch: 0.45,
    durationMs: 1200,
  },
  'login-orbit': {
    azimuthDegPerSec: 4,
    distance: 18,
    pitchDeg: 12,
  },
})

const STORAGE_KEY = 'studentSpace.cameraTuner.overrides'

type OverrideMap = {
  [K in SceneId]?: Partial<PresetMap[K]>
}

const listeners = new Set<() => void>()

function readStorage(): OverrideMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as OverrideMap) : {}
  } catch {
    return {}
  }
}

let overrides: OverrideMap = readStorage()
// Memoised resolved presets — keeps getSnapshot stable across reads so
// useSyncExternalStore doesn't warn about a fresh object every call.
let snapshot: PresetMap = computeSnapshot(overrides)

function computeSnapshot(o: OverrideMap): PresetMap {
  return {
    'first-chat': { ...DEFAULT_PRESETS['first-chat'], ...(o['first-chat'] ?? {}) },
    bloom: { ...DEFAULT_PRESETS.bloom, ...(o.bloom ?? {}) },
    'tree-wide': { ...DEFAULT_PRESETS['tree-wide'], ...(o['tree-wide'] ?? {}) },
    'closing-portrait': {
      ...DEFAULT_PRESETS['closing-portrait'],
      ...(o['closing-portrait'] ?? {}),
    },
    'login-orbit': { ...DEFAULT_PRESETS['login-orbit'], ...(o['login-orbit'] ?? {}) },
  }
}

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

export function getPreset<K extends SceneId>(sceneId: K): PresetMap[K] {
  return snapshot[sceneId]
}

export function getAllPresets(): PresetMap {
  return snapshot
}

export function setPreset<K extends SceneId>(sceneId: K, value: PresetMap[K]): void {
  overrides = { ...overrides, [sceneId]: { ...value } }
  persist()
  notify()
}

export function patchPreset<K extends SceneId>(sceneId: K, patch: Partial<PresetMap[K]>): void {
  const next: OverrideMap = { ...overrides }
  next[sceneId] = { ...(overrides[sceneId] ?? {}), ...patch } as OverrideMap[K]
  overrides = next
  persist()
  notify()
}

export function resetPreset(sceneId?: SceneId): void {
  if (sceneId) {
    if (!overrides[sceneId]) return
    const next: OverrideMap = { ...overrides }
    delete next[sceneId]
    overrides = next
  } else {
    overrides = {}
  }
  persist()
  notify()
}

export function hasOverride(sceneId: SceneId): boolean {
  const o = overrides[sceneId]
  return !!o && Object.keys(o).length > 0
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** React subscription — re-renders when any preset changes. */
export function useCameraPresets(): PresetMap {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  )
}

/** Convenience: subscribe to a single scene's preset. */
export function useCameraPreset<K extends SceneId>(sceneId: K): PresetMap[K] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot[sceneId],
    () => snapshot[sceneId],
  )
}
