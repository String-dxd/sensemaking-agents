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

export type SceneId =
  | 'world-default'
  | 'first-chat'
  | 'bloom'
  | 'tree-wide'
  | 'closing-portrait'
  | 'login-orbit'

/**
 * Static framing the world view lands on at boot and after a reset-view tap.
 * Mirrors Camera.js's hardcoded ctor defaults so DEFAULT_PRESETS stays the
 * source of truth; the engine pulls from this store via setDefaultFraming.
 */
export type WorldDefaultPreset = {
  fov: number
  distance: number
  pitchDeg: number
  lookAtX: number
  lookAtY: number
  lookAtZ: number
}

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
  'world-default': WorldDefaultPreset
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
  'world-default': {
    // Retuned for the editor's 24-unit world (world-port U10): the landmass
    // is ~18 × 16 and off-center (land centroid ≈ (1.0, 0.7)).
    fov: 41,
    distance: 20,
    pitchDeg: 24,
    lookAtX: 1.0,
    lookAtY: 1.6,
    lookAtZ: 0.7,
  },
  'first-chat': {
    // Onboarding close-up (transcript dialogue beat): tight head-on portrait
    // of the 0.6-unit editor character. The GLB's face reads toward
    // perchYaw − 90°, hence the offset (validated against the live island).
    distance: 2.4,
    yawOffsetDeg: -90,
    camYAboveLookAt: 0.7,
    lookAtYAbovePerch: 0.35,
    durationMs: 1450,
    zoomLeadMs: 1500,
  },
  bloom: {
    camYAboveLookAt: 1.9,
    camZBack: 4.8,
    lookAtY: 0.5,
    durationMs: 1100,
  },
  'tree-wide': {
    camX: -15.6,
    camY: 7.3,
    camZ: 2.1,
    lookAtY: 1.7,
    durationMs: 900,
  },
  'closing-portrait': {
    distance: 6.2,
    yawOffsetDeg: -6,
    camYAboveLookAt: 2.45,
    lookAtYAbovePerch: 0.6,
    durationMs: 800,
  },
  'login-orbit': {
    // Slow, cinematic arc — ~3°/s reads as ambient sweep without the
    // dizziness a faster rotation would introduce; the populated island
    // gets to show off over the dwell time on the login surface.
    azimuthDegPerSec: 3,
    distance: 32,
    pitchDeg: 28,
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
    'world-default': { ...DEFAULT_PRESETS['world-default'], ...(o['world-default'] ?? {}) },
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
