import { useCallback, useRef } from 'react'
import { create } from 'zustand'
import { TEXTURE_IDS } from '../../core/materials'
import {
  type CharacterSpec,
  type MaterialAssign,
  PALETTE_SLOTS,
  type PaletteSlot,
  REGIONS,
  type Region,
} from '../../core/spec/schema'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
import { FALLBACK_ASSIGN, useAdvancedMode, useToonStudio } from '../state/studioStores'
import { PatternCards, SwatchRow } from './SwatchRow'

// Material & palette control panel (plan 005, step 5). Every control writes
// through the characterStore's `patch` — the viewport picks changes up via
// its store subscription (no apply buttons). Docked in the "Materials"
// mode-tab column (plan 012 — was a fixed-position TOP-LEFT card).
//
// Slider drags are coalesced to at most one `patch` per animation frame so
// the store's dev-mode zod validation never runs per input event (plan 005
// maintenance note).

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

const PALETTE_LABELS: Record<PaletteSlot, string> = {
  primary: 'primary',
  secondary: 'secondary',
  belly: 'belly',
  accentA: 'accent A',
  accentB: 'accent B',
  padsNose: 'pads/nose',
}

// Which region the panel is editing (panel-local UI state).
const useSelectedRegion = create<{ region: Region; setRegion(r: Region): void }>((set) => ({
  region: 'body',
  setRegion: (region) => set({ region }),
}))

type SpecUpdater = (draft: CharacterSpec) => void

/**
 * Coalesce store patches to one per animation frame: updaters queue up and
 * flush inside a single `patch` call, so dev-mode spec validation runs at
 * most once per frame during slider drags.
 */
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

export function MaterialPanel() {
  const palette = useCharacterStore((s) => s.spec.palette)
  const materials = useCharacterStore((s) => s.spec.materials)
  const rafPatch = useRafPatch()
  const region = useSelectedRegion((s) => s.region)
  const setRegion = useSelectedRegion((s) => s.setRegion)
  const terminatorWarmth = useToonStudio((s) => s.terminatorWarmth)
  const setTerminatorWarmth = useToonStudio((s) => s.setTerminatorWarmth)
  const advanced = useAdvancedMode((s) => s.advanced)
  const setAdvanced = useAdvancedMode((s) => s.setAdvanced)

  const assign = materials[region] ?? FALLBACK_ASSIGN

  const setPaletteSlot = (slot: PaletteSlot, hex: string) => {
    rafPatch((draft) => {
      draft.palette = { ...draft.palette, [slot]: hex }
    })
  }

  const setAssign = (partial: Partial<MaterialAssign>) => {
    rafPatch((draft) => {
      const current = draft.materials[region] ?? FALLBACK_ASSIGN
      draft.materials = { ...draft.materials, [region]: { ...current, ...partial } }
    })
  }

  return (
    <PanelSection
      title="Material"
      actions={
        <button
          type="button"
          style={{ ...selectStyle, cursor: 'pointer' }}
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced ? 'Advanced ▾' : 'Advanced ▸'}
        </button>
      }
    >
      {/* Default view (plan 021 steps 3/4): color swatches + pattern cards,
          both one-tap and undoable. Raw palette/material editing moves to
          Advanced below. */}
      <SwatchRow />
      <PatternCards />

      {advanced ? (
        <>
          <div style={labelColStyle}>
            <span style={{ opacity: 0.7 }}>Palette</span>
            {PALETTE_SLOTS.map((slot) => (
              <label key={slot} style={rowStyle}>
                <input type="color" value={palette[slot]} onChange={(e) => setPaletteSlot(slot, e.target.value)} />
                <span>{PALETTE_LABELS[slot]}</span>
              </label>
            ))}
          </div>

          <label style={labelColStyle}>
            <span style={{ opacity: 0.7 }}>Region</span>
            <select style={selectStyle} value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label style={labelColStyle}>
            <span>Ramp softness: {assign.rampSoftness.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={assign.rampSoftness}
              onChange={(e) => setAssign({ rampSoftness: Number(e.target.value) })}
            />
          </label>

          <label style={labelColStyle}>
            <span>Rim strength: {assign.rimStrength.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={assign.rimStrength}
              onChange={(e) => setAssign({ rimStrength: Number(e.target.value) })}
            />
          </label>

          <label style={rowStyle}>
            <input type="color" value={assign.shadowTint} onChange={(e) => setAssign({ shadowTint: e.target.value })} />
            <span>Shadow tint</span>
          </label>

          <label style={labelColStyle}>
            <span>
              Terminator warmth: {terminatorWarmth.toFixed(2)} <em style={{ opacity: 0.6 }}>(studio, all regions)</em>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={terminatorWarmth}
              onChange={(e) => setTerminatorWarmth(Number(e.target.value))}
            />
          </label>

          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={assign.outline ?? false}
              onChange={(e) => setAssign({ outline: e.target.checked })}
            />
            Outline
          </label>

          <label style={labelColStyle}>
            <span style={{ opacity: 0.7 }}>Texture</span>
            <select
              style={selectStyle}
              value={assign.textureId ?? 'none'}
              onChange={(e) => {
                const id = e.target.value
                rafPatch((draft) => {
                  const current = draft.materials[region] ?? FALLBACK_ASSIGN
                  const next = { ...current }
                  if (id === 'none') delete next.textureId
                  else next.textureId = id
                  draft.materials = { ...draft.materials, [region]: next }
                })
              }}
            >
              {TEXTURE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </PanelSection>
  )
}
