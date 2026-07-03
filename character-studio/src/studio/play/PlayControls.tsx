// Play Mode controls (plan 007 step 5) — the DOM side: Studio ⇄ Play toggle
// plus the play-time control strip (states, gestures, speed, camera presets,
// soak test). All behavior flows through the shared play store; the in-canvas
// PlayMode driver consumes it.

import type { CSSProperties } from 'react'
import type { GestureName, MachineState } from '../../core/motion/clipStateMachine'
import { MAX_SPEED } from '../../core/motion/locomotion'
import { type CameraPreset, usePlayStore } from './playStore'

const STATES: ReadonlyArray<MachineState> = ['idle', 'walk', 'run', 'sit', 'talk']
const GESTURES: ReadonlyArray<{ name: GestureName; label: string }> = [
  { name: 'gestureWave', label: 'wave' },
  { name: 'gestureNod', label: 'nod' },
  { name: 'gestureShrug', label: 'shrug' },
  { name: 'gestureCheer', label: 'cheer' },
]
const CAMERAS: ReadonlyArray<{ preset: CameraPreset; label: string }> = [
  { preset: 'orbit', label: 'orbit' },
  { preset: 'follow', label: 'follow' },
  { preset: 'face', label: 'face' },
]

const font = '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace'

const toggleStyle: CSSProperties = {
  position: 'fixed',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  font,
  fontWeight: 700,
  color: '#e6e6ee',
  background: 'rgba(20, 20, 26, 0.88)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 999,
  cursor: 'pointer',
  zIndex: 20,
}

const stripStyle: CSSProperties = {
  position: 'fixed',
  bottom: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 16px',
  font,
  color: '#e6e6ee',
  background: 'rgba(20, 20, 26, 0.88)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  zIndex: 20,
  userSelect: 'none',
  flexWrap: 'wrap',
  maxWidth: 'calc(100vw - 32px)',
  justifyContent: 'center',
}

const buttonStyle: CSSProperties = {
  font,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: 'inherit',
  cursor: 'pointer',
}

const activeButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(120, 180, 255, 0.35)',
  borderColor: 'rgba(120, 180, 255, 0.7)',
}

const groupStyle: CSSProperties = { display: 'flex', gap: 5, alignItems: 'center' }
const labelStyle: CSSProperties = { opacity: 0.55, marginRight: 2 }

export function PlayControls() {
  const mode = usePlayStore((s) => s.mode)
  const setMode = usePlayStore((s) => s.setMode)
  const desiredState = usePlayStore((s) => s.desiredState)
  const liveState = usePlayStore((s) => s.liveState)
  const speed = usePlayStore((s) => s.speed)
  const cameraPreset = usePlayStore((s) => s.cameraPreset)
  const soak = usePlayStore((s) => s.soak)
  const requestState = usePlayStore((s) => s.requestState)
  const setSpeed = usePlayStore((s) => s.setSpeed)
  const setCameraPreset = usePlayStore((s) => s.setCameraPreset)
  const setSoak = usePlayStore((s) => s.setSoak)
  const requestGesture = usePlayStore((s) => s.requestGesture)

  return (
    <>
      <button type="button" style={toggleStyle} onClick={() => setMode(mode === 'play' ? 'studio' : 'play')}>
        {mode === 'play' ? '✕ exit play' : '▶ play'}
      </button>
      {mode === 'play' ? (
        <div style={stripStyle}>
          <div style={groupStyle}>
            <span style={labelStyle}>state</span>
            {STATES.map((state) => (
              <button
                key={state}
                type="button"
                style={desiredState === state ? activeButtonStyle : buttonStyle}
                onClick={() => requestState(state)}
              >
                {state}
                {liveState === state && desiredState !== state ? ' •' : ''}
              </button>
            ))}
          </div>
          <div style={groupStyle}>
            <span style={labelStyle}>gesture</span>
            {GESTURES.map(({ name, label }) => (
              <button key={name} type="button" style={buttonStyle} onClick={() => requestGesture(name)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ ...groupStyle, minWidth: 170 }}>
            <span style={labelStyle}>speed</span>
            <input
              type="range"
              min={0}
              max={MAX_SPEED}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 30, textAlign: 'right' }}>{speed.toFixed(1)}</span>
          </div>
          <div style={groupStyle}>
            <span style={labelStyle}>camera</span>
            {CAMERAS.map(({ preset, label }) => (
              <button
                key={preset}
                type="button"
                style={cameraPreset === preset ? activeButtonStyle : buttonStyle}
                onClick={() => setCameraPreset(preset)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" style={soak ? activeButtonStyle : buttonStyle} onClick={() => setSoak(!soak)}>
            soak {soak ? 'on' : 'off'}
          </button>
        </div>
      ) : null}
    </>
  )
}
