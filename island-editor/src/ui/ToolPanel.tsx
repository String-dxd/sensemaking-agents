import './panel.css'
import type { BrushMode, BrushParams } from '../terrain/brush'
import type { HeightProfile } from '../terrain/islandSpec'

export type EditMode = 'shape' | 'sculpt'

interface ToolPanelProps {
  mode: EditMode
  onModeChange: (m: EditMode) => void
  profile: HeightProfile
  onProfileChange: (p: HeightProfile) => void
  brush: BrushParams
  onBrushChange: (b: BrushParams) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onExport: () => void
  onImport: () => void
  onTopView: () => void
}

const PROFILE_FIELDS: { key: keyof HeightProfile; label: string; min: number; max: number; step: number }[] = [
  { key: 'seaLevel', label: 'Sea level', min: -2, max: 2, step: 0.05 },
  { key: 'plateauHeight', label: 'Plateau height', min: 0, max: 4, step: 0.05 },
  { key: 'coastFalloff', label: 'Coast falloff', min: 0.2, max: 6, step: 0.1 },
  { key: 'cliffSteepness', label: 'Cliff steepness', min: 0, max: 1, step: 0.05 },
  { key: 'seafloorDepth', label: 'Seafloor depth', min: -4, max: 0, step: 0.05 },
]
const BRUSH_MODES: BrushMode[] = ['raise', 'lower', 'smooth', 'flatten']

export function ToolPanel({
  mode,
  onModeChange,
  profile,
  onProfileChange,
  brush,
  onBrushChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  onExport,
  onImport,
  onTopView,
}: ToolPanelProps) {
  return (
    <div className="tool-panel">
      <div className="tool-panel__title">Island editor</div>
      <div className="tool-panel__topbar">
        <div className="tool-panel__tabs">
          <button type="button" className={mode === 'shape' ? 'is-active' : ''} onClick={() => onModeChange('shape')}>
            Shape
          </button>
          <button type="button" className={mode === 'sculpt' ? 'is-active' : ''} onClick={() => onModeChange('sculpt')}>
            Sculpt
          </button>
        </div>
        <div className="tool-panel__history">
          <button type="button" title="Undo (⌘Z)" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            ↶
          </button>
          <button type="button" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            ↷
          </button>
        </div>
      </div>

      {mode === 'shape' ? (
        <>
          <div className="tool-panel__section">Height profile</div>
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="tool-panel__row">
              <span className="tool-panel__label">{f.label}</span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={profile[f.key]}
                onChange={(e) => onProfileChange({ ...profile, [f.key]: Number(e.target.value) })}
              />
              <span className="tool-panel__value">{profile[f.key].toFixed(2)}</span>
            </label>
          ))}
          <div className="tool-panel__hint">Drag the orange handles to reshape the coastline.</div>
        </>
      ) : (
        <>
          <div className="tool-panel__section">Brush</div>
          <div className="tool-panel__modes">
            {BRUSH_MODES.map((m) => (
              <button
                type="button"
                key={m}
                className={brush.mode === m ? 'is-active' : ''}
                onClick={() => onBrushChange({ ...brush, mode: m })}
              >
                {m}
              </button>
            ))}
          </div>
          <label className="tool-panel__row">
            <span className="tool-panel__label">Radius</span>
            <input
              type="range"
              min={0.5}
              max={8}
              step={0.1}
              value={brush.radius}
              onChange={(e) => onBrushChange({ ...brush, radius: Number(e.target.value) })}
            />
            <span className="tool-panel__value">{brush.radius.toFixed(1)}</span>
          </label>
          <label className="tool-panel__row">
            <span className="tool-panel__label">Strength</span>
            <input
              type="range"
              min={0.02}
              max={1}
              step={0.02}
              value={brush.strength}
              onChange={(e) => onBrushChange({ ...brush, strength: Number(e.target.value) })}
            />
            <span className="tool-panel__value">{brush.strength.toFixed(2)}</span>
          </label>
          <div className="tool-panel__hint">Drag on the island to sculpt relief. Switch to Shape to edit the coastline.</div>
        </>
      )}

      <div className="tool-panel__section">Scene</div>
      <div className="tool-panel__actions">
        <button type="button" onClick={onTopView}>
          Top view
        </button>
        <button type="button" onClick={onExport}>
          Export
        </button>
        <button type="button" onClick={onImport}>
          Import
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  )
}
