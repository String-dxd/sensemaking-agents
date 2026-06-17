import './panel.css'
import {
  type BirdGenome,
  BEAK_TYPES,
  CREST_TYPES,
  EYE_ARCHETYPES,
  type EyeArchetype,
  type FaceSpec,
  type MorphDelta,
  PATTERN_TYPES,
  PATTERN_ZONES,
  PERSONALITIES,
  type Personality,
  type PatternSpec,
  type PlumagePalette,
  type ProceduralBase,
  type SpeciesId,
  SPECIES_IDS,
  TAIL_TYPES,
} from '../bird/genome'
import { SPECIES_BY_ID } from '../bird/morphology'
import { PATTERN_SWATCHES, PATTERN_ZONE_LABELS, SWATCHES, ZONE_SWATCHES } from '../bird/palettes'
import { itemsForSlot, NONE_ITEM, SLOT_BY_ID, SLOTS } from '../bird/slots'

interface Props {
  config: BirdGenome
  selectedSlot: string
  onSelectSlot: (slot: string) => void
  onSetSpecies: (id: SpeciesId) => void
  onUseGlbLane: () => void
  onSetPart: (part: keyof ProceduralBase['parts'], value: string) => void
  onSetZoneColor: (zone: keyof PlumagePalette, hex: string) => void
  onSetFace: (patch: Partial<FaceSpec>) => void
  onSetMorph: (patch: MorphDelta) => void
  onSetPattern: (pattern: PatternSpec | null) => void
  onSetName: (name: string) => void
  onSetPersonality: (p: Personality) => void
  onSetItem: (slot: string, itemId: string) => void
  onSetSlotColor: (slot: string, channel: 'base' | 'accent', hex: string) => void
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

const PART_LABELS: Record<string, string> = {
  pointed: 'Pointed',
  tuft: 'Tuft',
  fan: 'Fan',
  curve: 'Curve',
  none: 'None',
  'long-fan': 'Long fan',
  'short-fan': 'Short fan',
  forked: 'Forked',
  square: 'Square',
  slender: 'Slender',
  stout: 'Stout',
  hooked: 'Hooked',
  short: 'Short',
}
const EYE_LABELS: Record<EyeArchetype, string> = {
  button: 'Button',
  sweet: 'Sweet',
  sharp: 'Sharp',
  sleepy: 'Sleepy',
  wide: 'Wide',
  star: 'Star',
  angular: 'Angular',
  'half-lid': 'Half-lid',
}

function Swatches({ list, value, onPick }: { list: string[]; value: string; onPick: (hex: string) => void }) {
  return (
    <div className="bb-swatches">
      {list.map((hex) => (
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

function ChipRow<T extends string>({ options, value, onPick }: { options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="bb-chips">
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? 'is-active' : ''} onClick={() => onPick(o)}>
          {PART_LABELS[o] ?? o}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="bb-slider">
      <span className="bb-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number.parseFloat(e.target.value))} />
      <span className="bb-num">{value.toFixed(2)}</span>
    </div>
  )
}

export function ToolPanel(props: Props) {
  const { config } = props
  const base = config.base
  const procedural = base.kind === 'procedural' ? base : null
  const activeSpecies = base.kind === 'procedural' ? base.species : null

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

      {/* ── Species ─────────────────────────────────────────────── */}
      <div className="bb-section">Species</div>
      <div className="bb-cards">
        {SPECIES_IDS.map((id) => {
          const s = SPECIES_BY_ID[id]
          return (
            <button key={id} type="button" className={`bb-card${id === activeSpecies ? ' is-active' : ''}`} onClick={() => props.onSetSpecies(id)}>
              <span className="bb-card__ico">
                <i style={{ background: s.palette.back }} />
                <i style={{ background: s.palette.accent }} />
              </span>
              {s.displayName.replace(' Bower', '')}
            </button>
          )
        })}
        <button type="button" className={`bb-card${base.kind === 'glb' ? ' is-active' : ''}`} onClick={props.onUseGlbLane}>
          <span className="bb-card__ico">
            <i style={{ background: '#ff6b0d' }} />
            <i style={{ background: '#d11f1a' }} />
          </span>
          Classic
        </button>
      </div>

      {procedural ? (
        <ProceduralControls procedural={procedural} props={props} />
      ) : (
        <>
          <div className="bb-section">Colours</div>
          <ZoneRow label="back" zone="back" palette={base.palette} onSet={props.onSetZoneColor} />
          <ZoneRow label="accent" zone="accent" palette={base.palette} onSet={props.onSetZoneColor} />
          <div className="bb-hint">Classic GLB bird (recolors body + accent). Pick a species above for the full procedural builder.</div>
        </>
      )}

      <Accessories {...props} />

      {/* ── Scene ───────────────────────────────────────────────── */}
      <div className="bb-section">Scene</div>
      <div className="bb-actions">
        <button type="button" onClick={props.onRandomize}>
          Surprise me
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
      <div className="bb-hint">Pick a species, shape it with parts + sliders, recolor every zone, give it a face & a name. Surprise me for ideas · drag to orbit · scroll to zoom.</div>
    </div>
  )
}

function ZoneRow({ label, zone, palette, onSet }: { label: string; zone: keyof PlumagePalette; palette: PlumagePalette; onSet: (z: keyof PlumagePalette, hex: string) => void }) {
  const list = ZONE_SWATCHES[zone as keyof typeof ZONE_SWATCHES] ?? SWATCHES
  return (
    <div className="bb-colorrow">
      <span className="bb-label">{label}</span>
      <Swatches list={list} value={(palette[zone] as string) ?? '#ffffff'} onPick={(hex) => onSet(zone, hex)} />
    </div>
  )
}

function ProceduralControls({ procedural, props }: { procedural: ProceduralBase; props: Props }) {
  const m = procedural.morph
  const mv = (path: number | undefined) => path ?? 1

  return (
    <>
      {/* ── Identity ──────────────────────────────────────────── */}
      <div className="bb-section">Identity</div>
      <input
        className="bb-name"
        type="text"
        maxLength={24}
        placeholder="Name your bird…"
        value={props.config.identity.name}
        onChange={(e) => props.onSetName(e.target.value)}
      />
      <div className="bb-chips" style={{ marginTop: 6 }}>
        {PERSONALITIES.map((p) => (
          <button key={p} type="button" className={p === props.config.identity.personality ? 'is-active' : ''} onClick={() => props.onSetPersonality(p)}>
            {p}
          </button>
        ))}
      </div>

      {/* ── Parts ─────────────────────────────────────────────── */}
      <div className="bb-section">Crest</div>
      <ChipRow options={CREST_TYPES} value={procedural.parts.crest} onPick={(v) => props.onSetPart('crest', v)} />
      <div className="bb-section">Tail</div>
      <ChipRow options={TAIL_TYPES} value={procedural.parts.tail} onPick={(v) => props.onSetPart('tail', v)} />
      <div className="bb-section">Beak</div>
      <ChipRow options={BEAK_TYPES} value={procedural.parts.beak} onPick={(v) => props.onSetPart('beak', v)} />

      {/* ── Colours (6 zones) ─────────────────────────────────── */}
      <div className="bb-section">Colours</div>
      {(['back', 'belly', 'accent', 'beak', 'legs', 'eye'] as const).map((zone) => (
        <ZoneRow key={zone} label={zone} zone={zone} palette={procedural.palette} onSet={props.onSetZoneColor} />
      ))}

      {/* ── Face ──────────────────────────────────────────────── */}
      <div className="bb-section">Eyes</div>
      <div className="bb-chips">
        {EYE_ARCHETYPES.map((e) => (
          <button key={e} type="button" className={e === procedural.face.eye ? 'is-active' : ''} onClick={() => props.onSetFace({ eye: e })}>
            {EYE_LABELS[e]}
          </button>
        ))}
      </div>
      <div className="bb-chips" style={{ marginTop: 6 }}>
        {(['none', 'dot', 'swirl'] as const).map((c) => (
          <button key={c} type="button" className={(procedural.face.cheekMark ?? 'none') === c ? 'is-active' : ''} onClick={() => props.onSetFace({ cheekMark: c })}>
            {c === 'none' ? 'No cheeks' : c}
          </button>
        ))}
      </div>

      {/* ── Pattern ───────────────────────────────────────────── */}
      <PatternSection procedural={procedural} onSetPattern={props.onSetPattern} />

      {/* ── Advanced morphology (chips first, sliders on demand) ── */}
      <details className="bb-adv">
        <summary>Advanced shape</summary>
        <Slider label="body w" value={mv(m.body?.x)} min={0.7} max={1.3} step={0.02} onChange={(v) => props.onSetMorph({ body: { x: v } })} />
        <Slider label="body h" value={mv(m.body?.y)} min={0.7} max={1.3} step={0.02} onChange={(v) => props.onSetMorph({ body: { y: v } })} />
        <Slider label="head" value={mv(m.headSize)} min={0.75} max={1.3} step={0.02} onChange={(v) => props.onSetMorph({ headSize: v })} />
        <Slider label="neck" value={mv(m.neckH)} min={0.6} max={1.8} step={0.05} onChange={(v) => props.onSetMorph({ neckH: v })} />
        <Slider label="beak len" value={mv(m.beak?.length)} min={0.6} max={1.5} step={0.02} onChange={(v) => props.onSetMorph({ beak: { length: v } })} />
        <Slider label="wing" value={mv(m.wing?.length)} min={0.8} max={1.25} step={0.02} onChange={(v) => props.onSetMorph({ wing: { length: v } })} />
        <Slider label="tail" value={mv(m.tail?.scaleY)} min={0.6} max={1.5} step={0.02} onChange={(v) => props.onSetMorph({ tail: { scaleY: v } })} />
        <Slider label="crest" value={mv(m.crestScale)} min={0.5} max={1.6} step={0.02} onChange={(v) => props.onSetMorph({ crestScale: v })} />
      </details>
    </>
  )
}

function PatternSection({ procedural, onSetPattern }: { procedural: ProceduralBase; onSetPattern: (p: PatternSpec | null) => void }) {
  const pat = procedural.pattern
  const activeType = pat?.type ?? 'none'
  return (
    <>
      <div className="bb-section">Pattern</div>
      <div className="bb-chips">
        {PATTERN_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={activeType === t ? 'is-active' : ''}
            onClick={() => onSetPattern(t === 'none' ? null : { type: t, zone: pat?.zone ?? 'back', scale: pat?.scale ?? 0.6, color: pat?.color ?? '#1a1a1a' })}
          >
            {t}
          </button>
        ))}
      </div>
      {pat ? (
        <>
          <div className="bb-chips" style={{ marginTop: 6 }}>
            {PATTERN_ZONES.map((z) => (
              <button key={z} type="button" className={pat.zone === z ? 'is-active' : ''} onClick={() => onSetPattern({ ...pat, zone: z })}>
                {PATTERN_ZONE_LABELS[z]}
              </button>
            ))}
          </div>
          <Slider label="size" value={pat.scale} min={0.1} max={1} step={0.05} onChange={(v) => onSetPattern({ ...pat, scale: v })} />
          <div className="bb-colorrow">
            <span className="bb-label">ink</span>
            <Swatches list={PATTERN_SWATCHES} value={pat.color} onPick={(hex) => onSetPattern({ ...pat, color: hex })} />
          </div>
        </>
      ) : null}
    </>
  )
}

function Accessories(props: Props) {
  const { config, selectedSlot } = props
  const slot = SLOT_BY_ID[selectedSlot]
  const worn = config.slots[selectedSlot]
  const items = itemsForSlot(selectedSlot)
  const dressed = !!worn && worn.itemId !== NONE_ITEM

  return (
    <>
      <div className="bb-section">Accessories</div>
      <div className="bb-tabs">
        {SLOTS.map((s) => (
          <button key={s.id} type="button" className={s.id === selectedSlot ? 'is-active' : ''} onClick={() => props.onSelectSlot(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="bb-chips">
        <button type="button" className={worn?.itemId === NONE_ITEM ? 'is-active' : ''} onClick={() => props.onSetItem(selectedSlot, NONE_ITEM)}>
          None
        </button>
        {items.map((it) => (
          <button key={it.id} type="button" className={worn?.itemId === it.id ? 'is-active' : ''} onClick={() => props.onSetItem(selectedSlot, it.id)}>
            {it.label}
          </button>
        ))}
      </div>
      {dressed
        ? slot?.channels.map((ch) => (
            <div key={ch} className="bb-colorrow">
              <span className="bb-label">{ch}</span>
              <Swatches list={SWATCHES} value={worn.colors[ch] ?? '#ffffff'} onPick={(hex) => props.onSetSlotColor(selectedSlot, ch, hex)} />
            </div>
          ))
        : null}
    </>
  )
}
