import './panel.css'
import type { BirdConfig } from '../bird/birdConfig'
import { FEATHER_PRESETS, SWATCHES } from '../bird/palettes'
import { itemsForSlot, NONE_ITEM, SLOT_BY_ID, SLOTS } from '../bird/slots'

interface Props {
  config: BirdConfig
  selectedSlot: string
  onSelectSlot: (slot: string) => void
  onSetItem: (slot: string, itemId: string) => void
  onSetSlotColor: (slot: string, channel: 'base' | 'accent', hex: string) => void
  onSetFeatherPreset: (presetId: string) => void
  onSetFeatherColor: (channel: 'body' | 'accent', hex: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onRandomize: () => void
  onReset: () => void
  onExport: () => void
  onImport: () => void
  onScreenshot: () => void
  onCopyLink: () => void
}

function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <div className="bb-swatches">
      {SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          className={`bb-swatch${hex.toLowerCase() === value.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: hex }}
          aria-label={hex}
          onClick={() => onPick(hex)}
        />
      ))}
    </div>
  )
}

export function ToolPanel(props: Props) {
  const { config, selectedSlot } = props
  const slot = SLOT_BY_ID[selectedSlot]
  const worn = config.slots[selectedSlot]
  const items = itemsForSlot(selectedSlot)
  const dressed = !!worn && worn.itemId !== NONE_ITEM

  return (
    <div className="bb-panel">
      <div className="bb-panel__topbar">
        <div className="bb-panel__title">Bird builder</div>
        <div className="bb-history">
          <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!props.canUndo} onClick={props.onUndo}>
            ↶
          </button>
          <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!props.canRedo} onClick={props.onRedo}>
            ↷
          </button>
        </div>
      </div>

      <div className="bb-tabs">
        {SLOTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === selectedSlot ? 'is-active' : ''}
            onClick={() => props.onSelectSlot(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bb-section">{slot?.label}</div>
      <div className="bb-chips">
        <button
          type="button"
          className={worn?.itemId === NONE_ITEM ? 'is-active' : ''}
          onClick={() => props.onSetItem(selectedSlot, NONE_ITEM)}
        >
          None
        </button>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={worn?.itemId === it.id ? 'is-active' : ''}
            onClick={() => props.onSetItem(selectedSlot, it.id)}
          >
            {it.label}
          </button>
        ))}
      </div>

      {dressed
        ? slot?.channels.map((ch) => (
            <div key={ch} className="bb-colorrow">
              <span className="bb-label">{ch}</span>
              <Swatches
                value={worn.colors[ch] ?? '#ffffff'}
                onPick={(hex) => props.onSetSlotColor(selectedSlot, ch, hex)}
              />
            </div>
          ))
        : null}

      <div className="bb-section">Feathers</div>
      <div className="bb-chips">
        {FEATHER_PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => props.onSetFeatherPreset(p.id)}>
            <span className="bb-dot" style={{ background: p.palette.body }} aria-hidden />
            {p.label}
          </button>
        ))}
      </div>
      <div className="bb-colorrow">
        <span className="bb-label">body</span>
        <Swatches value={config.featherPalette.body} onPick={(hex) => props.onSetFeatherColor('body', hex)} />
      </div>
      <div className="bb-colorrow">
        <span className="bb-label">accent</span>
        <Swatches value={config.featherPalette.accent} onPick={(hex) => props.onSetFeatherColor('accent', hex)} />
      </div>

      <div className="bb-section">Scene</div>
      <div className="bb-actions">
        <button type="button" onClick={props.onRandomize}>
          Randomize
        </button>
        <button type="button" onClick={props.onReset}>
          Reset
        </button>
        <button type="button" onClick={props.onExport}>
          Export
        </button>
        <button type="button" onClick={props.onImport}>
          Import
        </button>
        <button type="button" onClick={props.onScreenshot}>
          Screenshot
        </button>
        <button type="button" onClick={props.onCopyLink}>
          Copy link
        </button>
      </div>
      <div className="bb-hint">
        Pick a slot, choose an item, recolor it + the feathers. Randomize for ideas · drag to orbit · scroll to zoom.
      </div>
    </div>
  )
}
