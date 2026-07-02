import { useEffect, useState } from 'react'
import { GAZE_MAX } from '../../core/face/facePlane'
import { EXPRESSION_PRESETS, type ExpressionName } from '../../core/face/faceRig'
import { useFaceRigStore } from '../viewport/FaceRig'

// Minimal DOM-side control panel (plain inline styles — the real studio
// shell arrives in plan 012). Drives the live rig through useFaceRigStore.

const GAZE_IDLE_RETURN_MS = 2000

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  width: 220,
  padding: 16,
  borderRadius: 12,
  background: 'rgba(24, 24, 28, 0.88)',
  color: '#e8e8ec',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  zIndex: 10,
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  cursor: 'pointer',
  fontSize: 12,
}

const activeButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#4a6cd4',
  borderColor: '#4a6cd4',
}

export function FacePanel() {
  const rig = useFaceRigStore((s) => s.rig)
  const [expression, setExpression] = useState<ExpressionName>('neutral')
  const [blinkMean, setBlinkMean] = useState(3.5)
  const [followCursor, setFollowCursor] = useState(true)

  useEffect(() => {
    rig?.setExpression(expression)
  }, [rig, expression])

  useEffect(() => {
    rig?.setBlinkMeanInterval(blinkMean)
  }, [rig, blinkMean])

  // Gaze follows cursor: pointer NDC → setGaze(±GAZE_MAX); eases back to
  // centre after 2 s idle (the smoothing itself lives in the rig core).
  useEffect(() => {
    if (!rig || !followCursor) {
      rig?.setGaze(0, 0)
      return
    }
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const onPointerMove = (event: PointerEvent) => {
      const ndcX = (event.clientX / window.innerWidth) * 2 - 1
      const ndcY = -((event.clientY / window.innerHeight) * 2 - 1)
      rig.setGaze(ndcX * GAZE_MAX, ndcY * GAZE_MAX)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => rig.setGaze(0, 0), GAZE_IDLE_RETURN_MS)
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      clearTimeout(idleTimer)
    }
  }, [rig, followCursor])

  return (
    <div style={panelStyle}>
      <strong style={{ fontSize: 14 }}>Face</strong>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {(Object.keys(EXPRESSION_PRESETS) as ExpressionName[]).map((name) => (
          <button
            key={name}
            type="button"
            style={name === expression ? activeButtonStyle : buttonStyle}
            onClick={() => setExpression(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Blink interval: {blinkMean.toFixed(1)} s</span>
        <input
          type="range"
          min={1}
          max={8}
          step={0.5}
          value={blinkMean}
          onChange={(event) => setBlinkMean(Number(event.target.value))}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={followCursor}
          onChange={(event) => setFollowCursor(event.target.checked)}
        />
        Gaze follows cursor
      </label>

      <button type="button" style={buttonStyle} onClick={() => rig?.blink()}>
        Blink now
      </button>
    </div>
  )
}
