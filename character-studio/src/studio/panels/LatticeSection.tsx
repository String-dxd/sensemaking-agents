// Lattice controls inside the SculptPanel (plan 009, step 5). Create a
// 3×4×3 FFD cage around the whole character or one equipped part, drag
// control points in the viewport (click sphere → gizmo), then Apply (one
// undo entry) or Cancel (restores pre-session deltas).

import { useState } from 'react'
import { useLatticeStore } from '../state/latticeStore'
import { useSculptStore } from '../state/sculptStore'

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  fontSize: 12,
  cursor: 'pointer',
}

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  fontSize: 12,
  flex: 1,
}

export function LatticeControls() {
  const sculptSession = useSculptStore((s) => s.session)
  const session = useLatticeStore((s) => s.session)
  const create = useLatticeStore((s) => s.create)
  const apply = useLatticeStore((s) => s.apply)
  const cancel = useLatticeStore((s) => s.cancel)
  const [scope, setScope] = useState('character')

  const scopes = ['character', ...(sculptSession ? [...sculptSession.spaces.keys()] : [])]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #3a3a42', paddingTop: 10 }}>
      <strong style={{ fontSize: 13 }}>Lattice (3×4×3)</strong>
      {session ? (
        <>
          <span style={{ opacity: 0.6, fontSize: 11, lineHeight: 1.4 }}>
            Scope: {session.scope}. Click a control point, drag its gizmo. Brushes are disabled until you apply or
            cancel.
          </span>
          <div style={rowStyle}>
            <button type="button" style={{ ...buttonStyle, background: '#ff8a3d', color: '#1a1a1e', borderColor: '#ff8a3d', fontWeight: 600 }} onClick={apply}>
              Apply Lattice
            </button>
            <button type="button" style={buttonStyle} onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div style={rowStyle}>
          <select style={selectStyle} value={scope} onChange={(e) => setScope(e.target.value)}>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {s === 'character' ? 'whole character' : s}
              </option>
            ))}
          </select>
          <button type="button" style={buttonStyle} onClick={() => create(scope)} disabled={!sculptSession}>
            Create
          </button>
        </div>
      )}
    </div>
  )
}
