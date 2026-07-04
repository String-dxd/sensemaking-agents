// Lighting panel (plan 010, step 3/4): preset buttons, per-light controls
// (color/intensity/shadow/position/target), add/remove light (max 4), HDRI
// picker + rotation dial + background mode, ambient floor slider, gizmo
// visibility toggle, and the portrait-camera bookmark (step 4). Writes
// through the characterStore's `patch` (raf-coalesced during slider/color
// drags — the MaterialPanel/AnatomyPanel/WardrobePanel idiom).
//
// Docked in the "Lighting" mode-tab column (plan 012 — was a fixed-position
// TOP-CENTER card).

import type { OrbitControls } from '@react-three/drei'
import { type ComponentRef, useCallback, useRef } from 'react'
import { HDRI_IDS, HDRI_REGISTRY } from '../../assets/hdri/registry'
import {
  BACKGROUND_MODES,
  type BackgroundMode,
  LIGHT_TYPES,
  type LightType,
  MAX_LIGHTS,
  STUDIO_LOOK_PRESET_IDS,
  type StudioEnvironment,
  type StudioLight,
  type StudioLookPresetId,
  studioLookFromPreset,
} from '../../core/spec/lighting'
import type { CharacterSpec } from '../../core/spec/schema'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
import { useLightingStudio } from '../state/studioStores'

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const labelColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  fontSize: 12,
}
const smallButton: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  cursor: 'pointer',
  fontSize: 11,
}
const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '3px 8px',
  borderRadius: 8,
  border: active ? '1px solid #4a6cd4' : '1px solid #44444c',
  background: active ? '#31406e' : '#2a2a30',
  color: '#e8e8ec',
  cursor: 'pointer',
  fontSize: 11,
})

type SpecUpdater = (draft: CharacterSpec) => void

/** One store patch per animation frame during slider/color drags (see MaterialPanel). */
function useRafPatch(): (updater: SpecUpdater) => void {
  const patch = useCharacterStore((s) => s.patch)
  const queue = useRef<SpecUpdater[]>([])
  const scheduled = useRef(false)
  return useCallback(
    (updater: SpecUpdater) => {
      queue.current.push(updater)
      if (scheduled.current) return
      scheduled.current = true
      requestAnimationFrame(() => {
        scheduled.current = false
        const updaters = queue.current
        queue.current = []
        if (updaters.length === 0) return
        patch((draft) => {
          for (const u of updaters) u(draft)
        })
      })
    },
    [patch],
  )
}

function nextLightId(existing: StudioLight[]): string {
  let n = existing.length + 1
  while (existing.some((l) => l.id === `light-${n}`)) n += 1
  return `light-${n}`
}

/** A fresh light of the requested type, positioned so it doesn't overlap an existing one. */
function makeLight(existing: StudioLight[], type: LightType): StudioLight {
  const offset = existing.length
  return {
    id: nextLightId(existing),
    type,
    color: '#ffffff',
    intensity: type === 'rim' || type === 'accent' ? 1.5 : 1.0,
    position: [2 - offset, 2.5, 2 - offset * 0.5],
    targetHeight: 0.9,
    castShadow: false,
    shadowSoftness: 0.5,
  }
}

export function LightingPanel({ orbitControlsRef }: { orbitControlsRef: React.RefObject<OrbitControlsHandle | null> }) {
  const studioLook = useCharacterStore((s) => s.spec.studioLook)
  const rafPatch = useRafPatch()
  const patch = useCharacterStore((s) => s.patch)
  const showGizmos = useLightingStudio((s) => s.showGizmos)
  const setShowGizmos = useLightingStudio((s) => s.setShowGizmos)
  const selectedLightId = useLightingStudio((s) => s.selectedLightId)
  const setSelectedLightId = useLightingStudio((s) => s.setSelectedLightId)

  const look = studioLook ?? studioLookFromPreset('three-point-soft')
  const selected = look.lights.find((l) => l.id === selectedLightId) ?? look.lights[0]

  const applyPreset = (id: StudioLookPresetId) => {
    patch((draft) => {
      draft.studioLook = studioLookFromPreset(id)
    })
    setSelectedLightId(null)
  }

  const patchLook = (updater: (look: NonNullable<CharacterSpec['studioLook']>) => NonNullable<CharacterSpec['studioLook']>) => {
    rafPatch((draft) => {
      const current = draft.studioLook ?? studioLookFromPreset('three-point-soft')
      draft.studioLook = updater(current)
    })
  }

  const patchLight = (id: string, partial: Partial<StudioLight>) => {
    patchLook((current) => ({
      ...current,
      lights: current.lights.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    }))
  }

  const addLight = () => {
    if (look.lights.length >= MAX_LIGHTS) return
    const usedTypes = new Set(look.lights.map((l) => l.type))
    const type = LIGHT_TYPES.find((t) => !usedTypes.has(t)) ?? 'accent'
    const light = makeLight(look.lights, type)
    patchLook((current) => ({ ...current, lights: [...current.lights, light] }))
    setSelectedLightId(light.id)
  }

  const removeLight = (id: string) => {
    if (look.lights.length <= 1) return
    patchLook((current) => ({ ...current, lights: current.lights.filter((l) => l.id !== id) }))
    if (selectedLightId === id) setSelectedLightId(null)
  }

  const setEnvironment = (partial: Partial<StudioEnvironment>) => {
    patchLook((current) => ({ ...current, environment: { ...current.environment, ...partial } }))
  }

  const setAmbientFloor = (value: number) => {
    patchLook((current) => ({ ...current, ambientFloor: value }))
  }

  const capturePortraitView = () => {
    const controls = orbitControlsRef.current
    if (!controls) return
    const cam = controls.object
    const target = controls.target
    const fov = 'fov' in cam ? (cam.fov as number) : 35
    patch((draft) => {
      const current = draft.studioLook ?? studioLookFromPreset('three-point-soft')
      draft.studioLook = {
        ...current,
        portraitCamera: {
          position: [cam.position.x, cam.position.y, cam.position.z],
          target: [target.x, target.y, target.z],
          fov,
        },
      }
    })
  }

  const gotoPortraitView = () => {
    const controls = orbitControlsRef.current
    const portrait = look.portraitCamera
    if (!controls || !portrait) return
    const cam = controls.object
    cam.position.set(...portrait.position)
    controls.target.set(...portrait.target)
    if ('fov' in cam) {
      ;(cam as { fov: number }).fov = portrait.fov
      if ('updateProjectionMatrix' in cam) (cam as { updateProjectionMatrix(): void }).updateProjectionMatrix()
    }
    controls.update()
  }

  return (
    <PanelSection title="Lighting">
      <div style={labelColStyle}>
        <span style={{ opacity: 0.7 }}>Preset</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {STUDIO_LOOK_PRESET_IDS.map((id) => (
            <button key={id} type="button" style={tabStyle(false)} onClick={() => applyPreset(id)}>
              {id}
            </button>
          ))}
        </div>
      </div>

      <div style={labelColStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ opacity: 0.7 }}>
            Lights ({look.lights.length}/{MAX_LIGHTS})
          </span>
          <button type="button" style={smallButton} disabled={look.lights.length >= MAX_LIGHTS} onClick={addLight}>
            + add
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {look.lights.map((l) => (
            <button key={l.id} type="button" style={tabStyle(l.id === selected.id)} onClick={() => setSelectedLightId(l.id)}>
              {l.type}
              {l.castShadow ? ' ☀' : ''}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div style={labelColStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ opacity: 0.7 }}>{selected.type} light</span>
            <button
              type="button"
              style={smallButton}
              disabled={look.lights.length <= 1}
              onClick={() => removeLight(selected.id)}
            >
              remove
            </button>
          </div>

          <label style={rowStyle}>
            <input type="color" value={selected.color} onChange={(e) => patchLight(selected.id, { color: e.target.value })} />
            <span>Color</span>
          </label>

          <label style={labelColStyle}>
            <span>Intensity: {selected.intensity.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={8}
              step={0.05}
              value={selected.intensity}
              onChange={(e) => patchLight(selected.id, { intensity: Number(e.target.value) })}
            />
          </label>

          <label style={labelColStyle}>
            <span>Target height: {selected.targetHeight.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={selected.targetHeight}
              onChange={(e) => patchLight(selected.id, { targetHeight: Number(e.target.value) })}
            />
          </label>

          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <label key={axis} style={labelColStyle}>
              <span>
                Position {axis}: {selected.position[i].toFixed(2)}
              </span>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.05}
                value={selected.position[i]}
                onChange={(e) => {
                  const next: [number, number, number] = [...selected.position]
                  next[i] = Number(e.target.value)
                  patchLight(selected.id, { position: next })
                }}
              />
            </label>
          ))}

          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={selected.castShadow}
              onChange={(e) => patchLight(selected.id, { castShadow: e.target.checked })}
            />
            Cast shadow
          </label>

          {selected.castShadow ? (
            <label style={labelColStyle}>
              <span>Shadow softness: {selected.shadowSoftness.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selected.shadowSoftness}
                onChange={(e) => patchLight(selected.id, { shadowSoftness: Number(e.target.value) })}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <label style={labelColStyle}>
        <span>Ambient floor: {look.ambientFloor.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={look.ambientFloor}
          onChange={(e) => setAmbientFloor(Number(e.target.value))}
        />
      </label>

      <div style={labelColStyle}>
        <span style={{ opacity: 0.7 }}>Environment</span>
        <select style={selectStyle} value={look.environment.hdriId} onChange={(e) => setEnvironment({ hdriId: e.target.value })}>
          {HDRI_IDS.map((id) => (
            <option key={id} value={id}>
              {HDRI_REGISTRY[id].label}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={look.environment.background}
          onChange={(e) => setEnvironment({ background: e.target.value as BackgroundMode })}
        >
          {BACKGROUND_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        {look.environment.background === 'solid' ? (
          <label style={rowStyle}>
            <input
              type="color"
              value={look.environment.backgroundColor ?? '#1a1a1e'}
              onChange={(e) => setEnvironment({ backgroundColor: e.target.value })}
            />
            <span>Background color</span>
          </label>
        ) : null}
        <label style={labelColStyle}>
          <span>HDRI intensity: {look.environment.intensity.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.02}
            value={look.environment.intensity}
            onChange={(e) => setEnvironment({ intensity: Number(e.target.value) })}
          />
        </label>
        <label style={labelColStyle}>
          <span>Rotation: {Math.round(look.environment.rotationDeg)}°</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={look.environment.rotationDeg}
            onChange={(e) => setEnvironment({ rotationDeg: Number(e.target.value) })}
          />
        </label>
      </div>

      <label style={rowStyle}>
        <input type="checkbox" checked={showGizmos} onChange={(e) => setShowGizmos(e.target.checked)} />
        Show gizmos
      </label>

      <div style={labelColStyle}>
        <span style={{ opacity: 0.7 }}>Portrait view (roster thumbnails)</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={smallButton} onClick={capturePortraitView}>
            Set portrait view
          </button>
          <button type="button" style={smallButton} disabled={!look.portraitCamera} onClick={gotoPortraitView}>
            Go to portrait view
          </button>
        </div>
      </div>
    </PanelSection>
  )
}
