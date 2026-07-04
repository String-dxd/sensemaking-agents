import { useEffect, useState } from 'react'
import { GAZE_MAX } from '../../core/face/facePlane'
import { EXPRESSION_PRESETS, type ExpressionName } from '../../core/face/faceRig'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
import { useFaceRigStore } from '../viewport/FaceRig'

// DOM-side control panel, docked in the shell's managed column (plan 012 —
// was a fixed-position TOP-RIGHT card that overlapped MotionDebugPanel).
// Drives the live rig through useFaceRigStore.
//
// Plan 004 step 5 wiring: expression + blink interval are now read from/
// written through the characterStore (the CharacterSpec is the source of
// truth), instead of living only in local component state. `expression` is
// widened from the spec's plain `string` back to `ExpressionName` at the
// point it's fed to the rig/preset lookup — see schema.ts's comment on why
// `face.expression` is intentionally a plain string.

const GAZE_IDLE_RETURN_MS = 2000

const buttonStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 8,
  // Longhand border properties (not the `border` shorthand): plan-012 fix —
  // `activeButtonStyle` below overrides only `borderColor`, and mixing a
  // shorthand with a longhand override across rerenders is a React dev
  // warning (mirrors the fix already applied in SculptPanel/LatticeSection).
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#44444c',
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
  const specExpression = useCharacterStore((s) => s.spec.face.expression)
  const blinkMean = useCharacterStore((s) => s.spec.face.blink.meanIntervalS)
  const patch = useCharacterStore((s) => s.patch)
  const [followCursor, setFollowCursor] = useState(true)

  const expression = (
    specExpression in EXPRESSION_PRESETS ? specExpression : 'neutral'
  ) as ExpressionName

  const setExpression = (name: ExpressionName) => {
    patch((draft) => {
      draft.face = { ...draft.face, expression: name }
    })
  }

  const setBlinkMean = (seconds: number) => {
    patch((draft) => {
      draft.face = { ...draft.face, blink: { ...draft.face.blink, meanIntervalS: seconds } }
    })
  }

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
    <PanelSection title="Face">
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
    </PanelSection>
  )
}
