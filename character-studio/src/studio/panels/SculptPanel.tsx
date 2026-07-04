// Sculpt & lattice control panel (plan 009, steps 4–5). Docked in the
// "Sculpt" mode-tab column (plan 012 — was a fixed-position BOTTOM-LEFT
// card). Brush parameters live in the sculpt store (the viewport tool reads
// them per event); undo/redo run through the studio-wide command stack.

import { BRUSH_KINDS, type BrushKind } from '../../core/sculpt'
import { PanelSection } from '../shell/PanelSection'
import { useStudioCommands } from '../state/commandStore'
import { SCULPT_RADIUS_MAX, SCULPT_RADIUS_MIN, useSculptStore } from '../state/sculptStore'
import { LatticeControls } from './LatticeSection'

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const labelColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 8,
  // separate border longhands: the active style overrides borderColor, and
  // React warns when a shorthand and a longhand mix across rerenders
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  fontSize: 12,
  cursor: 'pointer',
}

const activeButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#ff8a3d',
  borderColor: '#ff8a3d',
  color: '#1a1a1e',
  fontWeight: 600,
}

const BRUSH_LABELS: Record<BrushKind, string> = {
  grab: 'Grab',
  inflate: 'Inflate',
  smooth: 'Smooth',
  pinch: 'Pinch',
}

export function SculptPanel() {
  const active = useSculptStore((s) => s.active)
  const brush = useSculptStore((s) => s.brush)
  const radius = useSculptStore((s) => s.radius)
  const strength = useSculptStore((s) => s.strength)
  const mirrorX = useSculptStore((s) => s.mirrorX)
  const setActive = useSculptStore((s) => s.setActive)
  const setBrush = useSculptStore((s) => s.setBrush)
  const setRadius = useSculptStore((s) => s.setRadius)
  const setStrength = useSculptStore((s) => s.setStrength)
  const setMirrorX = useSculptStore((s) => s.setMirrorX)
  const commands = useStudioCommands()

  return (
    <PanelSection
      title="Sculpt"
      actions={
        <button type="button" style={active ? activeButtonStyle : buttonStyle} onClick={() => setActive(!active)}>
          {active ? 'Sculpting' : 'Off'}
        </button>
      }
    >
      {active ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BRUSH_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                style={brush === kind ? activeButtonStyle : buttonStyle}
                onClick={() => setBrush(kind)}
              >
                {BRUSH_LABELS[kind]}
              </button>
            ))}
          </div>

          <label style={labelColStyle}>
            <span>
              Radius: {(radius * 100).toFixed(1)} cm <em style={{ opacity: 0.6 }}>([ / ])</em>
            </span>
            <input
              type="range"
              min={SCULPT_RADIUS_MIN}
              max={SCULPT_RADIUS_MAX}
              step={0.005}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </label>

          <label style={labelColStyle}>
            <span>
              Strength: {strength.toFixed(2)}
              {brush === 'grab' ? <em style={{ opacity: 0.6 }}> (grab tracks the cursor)</em> : null}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
            />
          </label>

          <label style={rowStyle}>
            <input type="checkbox" checked={mirrorX} onChange={(e) => setMirrorX(e.target.checked)} />
            Mirror X
          </label>

          <div style={rowStyle}>
            <button
              type="button"
              style={{ ...buttonStyle, opacity: commands.canUndo() ? 1 : 0.4 }}
              disabled={!commands.canUndo()}
              onClick={() => commands.undo()}
              title={commands.undoLabel() ?? undefined}
            >
              Undo (⌘Z)
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, opacity: commands.canRedo() ? 1 : 0.4 }}
              disabled={!commands.canRedo()}
              onClick={() => commands.redo()}
              title={commands.redoLabel() ?? undefined}
            >
              Redo (⇧⌘Z)
            </button>
          </div>

          <span style={{ opacity: 0.55, fontSize: 11, lineHeight: 1.4 }}>
            Left-drag sculpts · right-drag orbits. Springs pause while sculpting.
          </span>

          <LatticeControls />
        </>
      ) : (
        <span style={{ opacity: 0.55, fontSize: 11 }}>Freeform shape control: brushes + lattice, mirror-aware, undoable.</span>
      )}
    </PanelSection>
  )
}
